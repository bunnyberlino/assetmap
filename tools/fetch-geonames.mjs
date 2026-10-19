#!/usr/bin/env node
// Asset Map — build-time fetcher for the offline gazetteer under geo/.
// Copyright (c) Alexander Habath.
//
// Downloads GeoNames data (CC-BY 4.0, https://www.geonames.org/) and writes
// the files the app loads via <script src> from file:// (no fetch at runtime):
//
//   geo/cities.js        AM_GEO.cities     "name\tascii\tCC\tadmin1\tlat\tlon\tpop\talt\n..." (pop desc;
//                                          alt = Latin-script alternate names joined by "|")
//   geo/admin1.js        AM_GEO.admin1     "CC.code\tname\n..."
//   geo/countries.js     AM_GEO.countries  [{iso2,iso3,name,names,lat,lon,region,zip}]
//   geo/postal/{CC}.js   AM_GEO.postal.CC  "zip\tlat\tlon\tplace\n..." (zip uppercased, no spaces/dashes)
//   geo/postal/index.js  AM_GEO.postalIndex {CC:{rows,kb}}
//
// Usage:
//   node tools/fetch-geonames.mjs [--cache DIR] [--out DIR] [--city-dp N] [--min-pop N] [--alt-min-pop N] [CC ...]
//
//   --cache    where downloads are kept (default: $TMPDIR/assetmap-geonames); reused if present
//   --out      output directory (default: <repo>/geo)
//   --city-dp  decimal places for cities.js coordinates (default 3, ~110 m; postal/countries use 4)
//   --min-pop  drop cities below this population from cities.js (default 1000; cities1000 also
//              lists smaller admin seats). These two defaults keep cities.js under ~8 MB.
//              Country capitals are still looked up in the unfiltered list.
//   --alt-min-pop  only cities at or above this population get alternate names (default 15000)
//   CC ...     postal countries to build (default list below); missing ones are skipped and reported
//
// Requires Node 20+ (global fetch) and the `unzip` CLI. No npm dependencies.
// All non-ASCII characters are written as \uXXXX escapes, so the files decode
// correctly whatever charset the host page declares.
//
// Known GeoNames postal coverage limits:
//   GB  outward code only (e.g. "SW1A"), not full postcodes
//   CA  forward sortation area only (first 3 chars, e.g. "K1A")
//   NL  4-digit numeric part only (e.g. "1012")
//   The app must truncate user input to these forms before lookup.
//
// Postal files for countries in AGG are aggregated to a zip prefix (coordinates
// averaged, most common place name kept) to keep file sizes down; the app falls
// back to ever-shorter prefixes on lookup, so these keys work unchanged.

import { mkdir, writeFile, readFile, stat, access } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const DUMP = 'https://download.geonames.org/export/dump/';
const ZIP = 'https://download.geonames.org/export/zip/';

const DEFAULT_COUNTRIES = `US CA MX BR AR CL CO PE GB IE FR DE AT CH IT ES PT NL BE LU DK SE NO FI
  PL CZ SK HU RO HR SI TR IL ZA SA JP KR IN AU NZ SG MY TH PH`.split(/\s+/).filter(Boolean);

// Postal prefix length per country (see header).
const AGG = { PT: 4, SG: 4, JP: 5, KR: 3, RO: 4 };

// Alternate city names: taken from cities1000's alternatenames column, Latin script
// only, at most ALT_MAX per city. That column is alphabetical and untagged, so
// alternateNamesV2 (language-tagged) is used only to rank them: the country's own
// languages first (preferred names first), then RANK_LANGS, then the rest.
const ALT_MAX = 8;
const LATIN = /^[A-Za-z0-9 .'\u2019()-]+$/;
// "City of ..." forms (Tagalog, Cebuano, Malay, Swahili) add nothing for matching.
const CITY_OF = /^(lungsod ng|dakbayan sa|bandar raya|mji wa) /i;

// Asian-continent countries that belong to EMEA.
const MIDDLE_EAST = new Set('AE SA IL TR QA KW BH OM JO LB IQ IR YE SY PS CY'.split(' '));

const LANGS = ['en', 'de', 'fr', 'it', 'es', 'pt', 'nl'];
const RANK_LANGS = LANGS;
const NON_NAME_LANGS = new Set('iata icao faac link post unlc wkdt abbr fr_1793 tcid'.split(' '));

const EXTRA_NAMES = {
  US: ['usa', 'u.s.', 'u.s.a.', 'united states of america', 'america', 'us of a'],
  GB: ['uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'united kingdom of great britain and northern ireland'],
  CH: ['schweiz', 'suisse', 'svizzera', 'svizra', 'swiss confederation', 'confoederatio helvetica'],
  NL: ['holland', 'the netherlands'],
  DE: ['deutschland', 'brd', 'federal republic of germany'],
  AE: ['uae', 'u.a.e.', 'emirates'],
  KR: ['south korea', 'republic of korea', 'korea'],
  KP: ['north korea'],
  CZ: ['czech republic', 'czechia', 'cesko'],
  RU: ['russian federation'],
  CN: ['prc', "people's republic of china"],
  TW: ['republic of china'],
  CI: ["cote d'ivoire", 'ivory coast'],
  TR: ['turkiye', 'turkey'],
  VN: ['viet nam'],
  IR: ['persia'],
  MM: ['burma'],
  SZ: ['swaziland'],
  MK: ['macedonia'],
  CD: ['drc', 'dr congo', 'congo-kinshasa'],
  CG: ['congo-brazzaville'],
  BO: ['bolivia'],
  VE: ['venezuela'],
  LA: ['laos'],
  SY: ['syria'],
  TZ: ['tanzania'],
  MD: ['moldova'],
  VA: ['vatican', 'holy see'],
};

// ---------- args ----------
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = { cache: join(tmpdir(), 'assetmap-geonames'), out: resolve(here, '..', 'geo'), cityDp: 3, minPop: 1000, altMinPop: 15000 };
const ccArgs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--cache') opt.cache = resolve(args[++i]);
  else if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--city-dp') opt.cityDp = +args[++i];
  else if (a === '--min-pop') opt.minPop = +args[++i];
  else if (a === '--alt-min-pop') opt.altMinPop = +args[++i];
  else if (/^[A-Za-z]{2}$/.test(a)) ccArgs.push(a.toUpperCase());
  else { console.error(`Unknown argument: ${a}`); process.exit(2); }
}
const COUNTRIES = ccArgs.length ? ccArgs : DEFAULT_COUNTRIES;

// ---------- helpers ----------
const exists = (p) => access(p).then(() => true, () => false);

async function download(url, file) {
  const dest = join(opt.cache, file);
  if (await exists(dest)) return dest;
  const res = await fetch(url);
  if (!res.ok) return null;
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

const unzipEntry = (zipPath, entry) =>
  execFileSync('unzip', ['-p', zipPath, entry], { maxBuffer: 1 << 30 }).toString('utf8');

const lines = (text) => text.split('\n').filter((l) => l && !l.startsWith('#'));
const clean = (s) => (s || '').replace(/[\t\r\n]+/g, ' ').trim();
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const stripMarks = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
// Comparison key for alternate names: lowercase, accents stripped, non-alphanumerics collapsed.
const altKey = (s) => stripMarks(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const round = (n, dp = 4) => +(+n).toFixed(dp);

// JSON.stringify, then escape everything outside ASCII (and U+2028/2029) as \uXXXX.
const jsStr = (v) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const GUARD = 'window.AM_GEO=window.AM_GEO||{};';

async function emit(rel, body) {
  const p = join(opt.out, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
  return (await stat(p)).size;
}

// ---------- main ----------
await mkdir(opt.cache, { recursive: true });
console.log(`cache: ${opt.cache}\nout:   ${opt.out}`);

const [citiesZip, countryInfoTxt, admin1Txt, altZip] = await Promise.all([
  download(DUMP + 'cities1000.zip', 'cities1000.zip'),
  download(DUMP + 'countryInfo.txt', 'countryInfo.txt'),
  download(DUMP + 'admin1CodesASCII.txt', 'admin1CodesASCII.txt'),
  download(DUMP + 'alternateNamesV2.zip', 'alternateNamesV2.zip'),
]);
if (!citiesZip || !countryInfoTxt || !admin1Txt || !altZip) throw new Error('Failed to download GeoNames dump files');

// --- cities ---
const cities = [];
for (const l of lines(unzipEntry(citiesZip, 'cities1000.txt'))) {
  const f = l.split('\t');
  const pop = +f[14] || 0;
  cities.push({ id: f[0], name: clean(f[1]), ascii: clean(f[2]), alts: f[3], cc: f[8], a1: clean(f[10]), lat: +f[4], lon: +f[5], fcode: f[7], pop });
}
cities.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name));
const outCities = cities.filter((c) => c.pop >= opt.minPop);
// Country languages from countryInfo (column 15, e.g. "de-CH,fr-CH,it-CH,rm" -> de fr it rm).
const countryLangs = new Map();
for (const l of lines(await readFile(countryInfoTxt, 'utf8'))) {
  const f = l.split('\t');
  countryLangs.set(f[0], (f[15] || '').split(',').map((x) => x.split('-')[0].trim().toLowerCase()).filter(Boolean));
}

// Rank each candidate city's names by language (lower = better).
const altCities = new Map(outCities.filter((c) => c.pop >= opt.altMinPop && c.alts).map((c) => [c.id, c]));
const altRank = new Map(); // geonameid -> Map(name -> rank)
{
  const proc = spawn('unzip', ['-p', altZip, 'alternateNamesV2.txt']);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  for await (const l of rl) {
    const t1 = l.indexOf('\t'), t2 = l.indexOf('\t', t1 + 1);
    const c = altCities.get(l.slice(t1 + 1, t2));
    if (!c) continue;
    const f = l.split('\t');
    const lang = f[2], name = clean(f[3]);
    if (NON_NAME_LANGS.has(lang) || f[6] === '1' || f[7] === '1' || !name) continue;
    const own = countryLangs.get(c.cc) || [];
    let r;
    if (own.includes(lang)) r = f[4] === '1' ? 0 : 1;
    else if (RANK_LANGS.includes(lang)) r = 2 + RANK_LANGS.indexOf(lang) / 10;
    else if (lang) r = 3;
    else r = 4;
    if (!altRank.has(c.id)) altRank.set(c.id, new Map());
    const m = altRank.get(c.id);
    if (!m.has(name) || r < m.get(name)) m.set(name, r);
  }
}

function altNames(c) {
  if (!altCities.has(c.id)) return '';
  const seen = new Set([altKey(c.name), altKey(c.ascii)]);
  const out = [];
  const ranks = altRank.get(c.id) || new Map();
  const cands = [...new Set(c.alts.split(',').map((x) => clean(x)))]
    .map((a, i) => ({ a, r: ranks.has(a) ? ranks.get(a) : 5, i }))
    .sort((x, y) => x.r - y.r || x.i - y.i);
  for (const { a } of cands) {
    if (!a || !LATIN.test(stripMarks(a)) || CITY_OF.test(a)) continue;
    const k = altKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
    if (out.length >= ALT_MAX) break;
  }
  return out.join('|');
}
let altCount = 0;
const citiesStr = outCities
  .map((c) => {
    const alt = altNames(c);
    if (alt) altCount++;
    return [c.name, c.ascii, c.cc, c.a1, round(c.lat, opt.cityDp), round(c.lon, opt.cityDp), c.pop, alt].join('\t');
  })
  .join('\n');
const citiesKb = await emit('cities.js', `${GUARD}AM_GEO.cities=${jsStr(citiesStr)};\n`);

// --- admin1 ---
const admin1Rows = lines(await readFile(admin1Txt, 'utf8')).map((l) => {
  const f = l.split('\t');
  return `${clean(f[0])}\t${clean(f[1])}`;
});
const admin1Size = await emit('admin1.js', `${GUARD}AM_GEO.admin1=${jsStr(admin1Rows.join('\n'))};\n`);

// --- countries ---
const byCC = new Map();
for (const c of cities) {
  if (!byCC.has(c.cc)) byCC.set(c.cc, []);
  byCC.get(c.cc).push(c);
}
const displayNames = Object.fromEntries(LANGS.map((lg) => [lg, new Intl.DisplayNames([lg], { type: 'region' })]));
const countries = [];
const droppedCountries = [];
for (const l of lines(await readFile(countryInfoTxt, 'utf8'))) {
  const f = l.split('\t');
  const [iso2, iso3, , , name, capital] = f;
  const continent = f[8];
  const zip = f[14] || '';
  const list = byCC.get(iso2) || [];

  let pt = null;
  const capFold = capital ? fold(capital) : '';
  if (capFold) pt = list.find((c) => fold(c.name) === capFold || fold(c.ascii) === capFold);
  if (!pt) pt = list.find((c) => c.fcode === 'PPLC'); // list is pop-desc, so first is largest
  if (!pt && list.length) {
    const w = list.reduce((s, c) => s + Math.max(c.pop, 1), 0);
    pt = {
      lat: list.reduce((s, c) => s + c.lat * Math.max(c.pop, 1), 0) / w,
      lon: list.reduce((s, c) => s + c.lon * Math.max(c.pop, 1), 0) / w,
    };
  }
  if (!pt) { droppedCountries.push(iso2); continue; }

  const names = new Set([iso2, iso3, name].map(fold));
  for (const lg of LANGS) {
    try {
      const n = displayNames[lg].of(iso2);
      if (n && n.toUpperCase() !== iso2) names.add(fold(n));
    } catch { /* unknown region code */ }
  }
  for (const n of EXTRA_NAMES[iso2] || []) names.add(fold(n));

  let region;
  if (continent === 'NA' || continent === 'SA') region = 'AMER';
  else if (continent === 'EU' || continent === 'AF' || MIDDLE_EAST.has(iso2)) region = 'EMEA';
  else region = 'APAC'; // AS, OC, AN

  countries.push({ iso2, iso3, name: clean(name), names: [...names].filter(Boolean), lat: round(pt.lat), lon: round(pt.lon), region, zip });
}
const countriesSize = await emit('countries.js', `${GUARD}AM_GEO.countries=${jsStr(countries)};\n`);

// --- postal ---
const postalIndex = {};
const skipped = [];
for (const cc of COUNTRIES) {
  const zipPath = await download(`${ZIP}${cc}.zip`, `postal-${cc}.zip`);
  if (!zipPath) { skipped.push(cc); continue; }
  let text;
  try { text = unzipEntry(zipPath, `${cc}.txt`); } catch { skipped.push(cc); continue; }
  const agg = new Map();
  for (const l of lines(text)) {
    const f = l.split('\t');
    let z = (f[1] || '').toUpperCase().replace(/[\s-]+/g, '');
    if (AGG[cc]) z = z.slice(0, AGG[cc]);
    const lat = parseFloat(f[9]), lon = parseFloat(f[10]);
    if (!z || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const e = agg.get(z);
    const place = clean(f[2]);
    if (e) { e.lat += lat; e.lon += lon; e.n++; e.places.set(place, (e.places.get(place) || 0) + 1); }
    else agg.set(z, { lat, lon, n: 1, places: new Map([[place, 1]]) });
  }
  // Aggregated keys keep the most common place name; others keep the first one seen.
  const topPlace = (m) => (AGG[cc] ? [...m].reduce((best, cur) => (cur[1] > best[1] ? cur : best)) : [...m][0])[0];
  if (!agg.size) { skipped.push(cc); continue; }
  const rows = [...agg].map(([z, e]) => `${z}\t${round(e.lat / e.n)}\t${round(e.lon / e.n)}\t${topPlace(e.places)}`);
  const size = await emit(`postal/${cc}.js`,
    `${GUARD}AM_GEO.postal=AM_GEO.postal||{};AM_GEO.postal[${jsStr(cc)}]=${jsStr(rows.join('\n'))};\n`);
  postalIndex[cc] = { rows: rows.length, kb: Math.ceil(size / 1024) };
  console.log(`  postal ${cc}: ${rows.length} rows, ${postalIndex[cc].kb} KB${AGG[cc] ? ` (prefix ${AGG[cc]})` : ''}`);
}
await emit('postal/index.js', `${GUARD}AM_GEO.postalIndex=${jsStr(postalIndex)};\n`);

const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
console.log(`cities.js:    ${outCities.length} rows (${altCount} with alternate names), ${mb(citiesKb)}`);
console.log(`admin1.js:    ${admin1Rows.length} rows, ${mb(admin1Size)}`);
console.log(`countries.js: ${countries.length} countries, ${mb(countriesSize)}`);
if (droppedCountries.length) console.log(`countries without any city (dropped): ${droppedCountries.join(' ')}`);
console.log(`postal: ${Object.keys(postalIndex).length} countries built`);
if (skipped.length) console.log(`postal skipped (not available from GeoNames): ${skipped.join(' ')}`);
