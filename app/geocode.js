/* Asset Map — offline geocoder. © 2026 Alexander Habath
   Order: lat/lon columns → postal code → city within country → country centre.
   Data: geo/countries.js, geo/cities.js, geo/admin1.js, geo/postal/{CC}.js (GeoNames, CC BY 4.0).
   Postal files are loaded on demand with <script src>, which works from file://. */
window.AM = window.AM || {};
window.AM_GEO = window.AM_GEO || {};
(function(AM){

AM.MATCH = {
  coords:  'Coordinates from file',
  postal:  'Postal code',
  postal_partial: 'Postal code (area)',
  city:    'City',
  country: 'Country centre only',
  none:    'Not placed'
};
AM.MATCH_ORDER = ['coords','postal','postal_partial','city','country','none'];

const Geo = AM.Geo = {
  base: 'geo/',               // tests set '../geo/'
  _countries: null, _alias: null, _cities: null, _admin1: null, _postal: {}
};

Geo.countries = () => {
  if(Geo._countries) return Geo._countries;
  const list = (window.AM_GEO.countries || []);
  const byIso = new Map(), alias = new Map();
  list.forEach(c => {
    byIso.set(c.iso2, c);
    [c.iso2, c.iso3, c.name, ...(c.names||[])].forEach(n => { if(n) alias.set(AM.fold(n), c.iso2); });
  });
  Geo._countries = byIso; Geo._alias = alias;
  return byIso;
};
Geo.country = iso2 => Geo.countries().get(iso2) || null;
Geo.countryName = iso2 => (Geo.country(iso2) || {}).name || iso2 || '';

/* "Schweiz", "CHE", "ch", "Switzerland" → "CH" */
Geo.resolveCountry = raw => {
  Geo.countries();
  const f = AM.fold(raw);
  if(!f) return '';
  return Geo._alias.get(f) || Geo._alias.get(f.replace(/^the /,'')) || '';
};

Geo.admin1 = () => {
  if(Geo._admin1) return Geo._admin1;
  const m = new Map();
  String(window.AM_GEO.admin1 || '').split('\n').forEach(l => {
    const [k, name] = l.split('\t');
    if(k) m.set(k, AM.fold(name));
  });
  return Geo._admin1 = m;
};

/* index "CC|folded city" → [{name, cc, a1, lat, lon, pop}] (most populous first) */
Geo.cities = () => {
  if(Geo._cities) return Geo._cities;
  const idx = new Map();
  const add = (k, rec) => { const a = idx.get(k); if(a){ if(!a.includes(rec)) a.push(rec); } else idx.set(k, [rec]); };
  String(window.AM_GEO.cities || '').split('\n').forEach(l => {
    if(!l) return;
    const p = l.split('\t');
    const rec = {name:p[0], cc:p[2], a1:p[3], lat:+p[4], lon:+p[5], pop:+p[6]||0};
    add(p[2]+'|'+AM.fold(p[0]), rec);
    if(p[1] && p[1] !== p[0]) add(p[2]+'|'+AM.fold(p[1]), rec);
    if(p[7]) p[7].split('|').forEach(a => add(p[2]+'|'+AM.fold(a), rec));   // local names: München, Roma …
  });
  /* alternates can push a smaller town ahead of the big city; restore population order */
  idx.forEach(a => { if(a.length > 1) a.sort((x, y) => y.pop - x.pop); });
  return Geo._cities = idx;
};

Geo.bundledPostal = () => Object.keys(window.AM_GEO.postalIndex || {}).sort();

/* load geo/postal/CC.js once; resolves true when available */
Geo.loadPostal = cc => {
  if(Geo._postal[cc]) return Geo._postal[cc];
  const p = new Promise(res => {
    if(window.AM_GEO.postal && window.AM_GEO.postal[cc]) return res(true);
    if(!(window.AM_GEO.postalIndex || {})[cc]) return res(false);
    const s = document.createElement('script');
    s.src = Geo.base + 'postal/' + cc + '.js';
    s.onload  = () => res(!!(window.AM_GEO.postal && window.AM_GEO.postal[cc]));
    s.onerror = () => res(false);
    document.head.appendChild(s);
  }).then(ok => {
    if(ok && typeof window.AM_GEO.postal[cc] === 'string'){
      const m = new Map();
      window.AM_GEO.postal[cc].split('\n').forEach(l => {
        const [z, lat, lon, place] = l.split('\t');
        if(z) m.set(z, {lat:+lat, lon:+lon, place:place||''});
      });
      window.AM_GEO.postal[cc] = m;          // parse once, keep the Map
    }
    return ok;
  });
  return Geo._postal[cc] = p;
};

Geo.normZip = z => String(z ?? '').toUpperCase().replace(/[\s\-.]/g, '');

/* digits expected by the country's postal regex, for restoring Excel-dropped zeros */
Geo.zipDigits = cc => {
  const c = Geo.country(cc); if(!c || !c.zip) return 0;
  const m = c.zip.match(/^\^?\(?\\d\{(\d+)\}/);          // "^\d{5}$", "^\d{5}(-\d{4})?$"
  return m ? +m[1] : 0;
};

Geo.lookupPostal = (cc, zip) => {
  const tbl = window.AM_GEO.postal && window.AM_GEO.postal[cc];
  if(!(tbl instanceof Map)) return null;
  let z = Geo.normZip(zip);
  if(!z) return null;
  const n = Geo.zipDigits(cc);
  if(n && /^\d+$/.test(z) && z.length < n) z = z.padStart(n, '0');
  if(tbl.has(z)) return {...tbl.get(z), partial:false};
  /* partial codes in the data (GB outward, CA FSA, NL 4-digit, IE routing key):
     try ever-shorter prefixes */
  for(let k = z.length - 1; k >= 2; k--){
    const p = z.slice(0, k);
    if(tbl.has(p)) return {...tbl.get(p), partial:true};
  }
  return null;
};

Geo.lookupCity = (cc, city, region) => {
  const f = AM.fold(city);
  if(!f) return null;
  const idx = Geo.cities();
  let cand = cc ? idx.get(cc+'|'+f) : null;
  if(!cand && cc){                      // "St. Gallen", "Ste-Foy", "Basel Stadt", "Roma RM"
    const variants = [f.replace(/^st /,'sankt '), f.replace(/^st /,'saint '), f.replace(/^ste /,'sainte '),
                      f.replace(/^saint /,'st '), f.replace(/^sankt /,'st '), f.split(' ')[0]];
    for(const v of variants){ cand = idx.get(cc+'|'+v); if(cand) break; }
  }
  if(!cand) return null;
  if(cand.length > 1 && region){
    const r = AM.fold(region), a1 = Geo.admin1();
    const hit = cand.find(c => AM.fold(c.a1) === r || a1.get(c.cc+'.'+c.a1) === r);
    if(hit) return hit;
  }
  return cand[0];
};

/* geocode one record in place: sets cc, lat, lon, match, place */
Geo.locate = r => {
  r.cc = Geo.resolveCountry(r.country);
  const lat = AM.num(r.lat), lon = AM.num(r.lon);
  if(isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat===0 && lon===0)){
    Object.assign(r, {lat, lon, match:'coords', place: r.city || ''});
    return r;
  }
  if(r.cc && r.zip){
    const p = Geo.lookupPostal(r.cc, r.zip);
    if(p){ Object.assign(r, {lat:p.lat, lon:p.lon, match: p.partial?'postal_partial':'postal', place: r.city || p.place}); return r; }
  }
  if(r.cc && r.city){
    const c = Geo.lookupCity(r.cc, r.city, r.region);
    if(c){ Object.assign(r, {lat:c.lat, lon:c.lon, match:'city', place: r.city}); return r; }
  }
  const c = r.cc && Geo.country(r.cc);
  if(c && isFinite(c.lat)){
    Object.assign(r, {lat:c.lat, lon:c.lon, match:'country', place: (r.city ? r.city + ' (country centre)' : c.name)});
    return r;
  }
  Object.assign(r, {lat:null, lon:null, match:'none', place: r.city || ''});
  return r;
};

/* geocode a batch: loads only the postal files the data needs (and the user allows) */
Geo.locateAll = async (recs, allowed) => {
  recs.forEach(r => { r.cc = Geo.resolveCountry(r.country); });
  const need = new Set(recs.filter(r => r.cc && r.zip).map(r => r.cc));
  const ok = allowed && allowed.length ? new Set(allowed) : null;
  const want = [...need].filter(cc => !ok || ok.has(cc));
  await Promise.all(want.map(Geo.loadPostal));
  recs.forEach(Geo.locate);
  return {postalLoaded: want.filter(cc => window.AM_GEO.postal && window.AM_GEO.postal[cc] instanceof Map)};
};

})(window.AM);
