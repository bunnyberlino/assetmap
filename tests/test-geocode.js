T.group('geocode');
const G = AM.Geo;
T.test('gazetteer files present', () => {
  T.ok((AM_GEO.countries || []).length > 200, 'countries'); T.ok(String(AM_GEO.cities || '').length > 1e6, 'cities');
  T.ok(G.bundledPostal().length >= 30, 'postal index has ' + G.bundledPostal().length);
});
T.test('resolveCountry: ISO2, ISO3, names in several languages', () => {
  T.eq(G.resolveCountry('ch'), 'CH'); T.eq(G.resolveCountry('CHE'), 'CH'); T.eq(G.resolveCountry('Schweiz'), 'CH');
  T.eq(G.resolveCountry('Suisse'), 'CH'); T.eq(G.resolveCountry('Svizzera'), 'CH'); T.eq(G.resolveCountry('Deutschland'), 'DE');
  T.eq(G.resolveCountry('USA'), 'US'); T.eq(G.resolveCountry('United States of America'), 'US'); T.eq(G.resolveCountry('UK'), 'GB');
  T.eq(G.resolveCountry('España'), 'ES'); T.eq(G.resolveCountry('Italia'), 'IT'); T.eq(G.resolveCountry('Atlantis'), '');
});
T.test('lookupCity: accents and most populous', () => {
  const z = G.lookupCity('CH', 'Zurich'); T.near(z.lat, 47.37, 0.1); T.near(z.lon, 8.54, 0.1);
  const m = G.lookupCity('DE', 'München'); T.near(m.lat, 48.14, 0.1);
  T.near(G.lookupCity('IT', 'Roma').lat, 41.89, 0.1);
});
T.test('lookupCity: region breaks ties (Portland OR vs ME)', () => {
  T.near(G.lookupCity('US', 'Portland', 'ME').lon, -70.25, 0.3);
  T.near(G.lookupCity('US', 'Portland', 'OR').lon, -122.67, 0.3);
});
T.test('lookupCity: St./Sankt variants', () => T.ok(G.lookupCity('CH', 'St. Gallen'), 'St. Gallen'));
T.test('postal: CH 4051 → Basel', async () => {
  T.ok(await G.loadPostal('CH'));
  const p = G.lookupPostal('CH', '4051'); T.ok(p && !p.partial); T.near(p.lat, 47.55, 0.05);
});
T.test('postal: US leading zero restored (2108 → 02108 Boston)', async () => {
  await G.loadPostal('US');
  const p = G.lookupPostal('US', '2108'); T.ok(p, 'found'); T.near(p.lat, 42.36, 0.05);
});
T.test('postal: GB full postcode falls back to outward code', async () => {
  await G.loadPostal('GB');
  const p = G.lookupPostal('GB', 'SW1A 1AA'); T.ok(p, 'found'); T.near(p.lat, 51.5, 0.1);
});
T.test('locate: fallback chain coords → postal → city → country → none', async () => {
  await G.loadPostal('CH');
  const a = G.locate({country:'CH', zip:'4051', city:'X', lat:'47.1', lon:'8.1'}); T.eq(a.match, 'coords'); T.eq(a.lat, 47.1);
  const b = G.locate({country:'Schweiz', zip:'4051', city:'Basel'}); T.eq(b.match, 'postal');
  const c = G.locate({country:'CH', zip:'', city:'Lugano'}); T.eq(c.match, 'city');
  const d = G.locate({country:'Norway', zip:'', city:''}); T.eq(d.match, 'country'); T.ok(isFinite(d.lat));
  const e = G.locate({country:'Atlantis', city:'Atlantis'}); T.eq(e.match, 'none'); T.eq(e.lat, null);
  const f = G.locate({country:'CH', lat:'47,55', lon:'7,59'}); T.eq(f.match, 'coords'); T.eq(f.lat, 47.55);
});
T.test('locateAll loads only needed + allowed postal files', async () => {
  const rs = [{country:'AT', zip:'1010', city:'Wien'}, {country:'FR', zip:'75001', city:'Paris'}];
  const g = await G.locateAll(rs, ['AT']);
  T.eq(g.postalLoaded, ['AT']); T.eq(rs[0].match, 'postal'); T.eq(rs[1].match, 'city');
});
