/* Asset Map — records, impact rings and incident files (pure logic). © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

AM.RING_COLORS = ['#FF5A36', '#FFA23A', '#E3CE6B', '#9BD46A', '#6AC7D4'];
AM.ringColor = tier => AM.RING_COLORS[Math.min(tier, AM.RING_COLORS.length) - 1] || '#5D9CEC';

/* CSV rows of employees.csv / assets.csv → records */
AM.buildRecords = (rows, category, typeOf, file) => {
  const out = [], warnings = [];
  rows.forEach(r => {
    const id = (r.id || '').trim();
    if(!id && !r.city && !r.zip && !r.country) return;            // blank line
    const t = typeOf(category, r.type) || {...AM.FALLBACK_TYPE, category, type: AM.fold(r.type)};
    if(t.unknown) warnings.push(`${file} line ${r._line}: type "${r.type||''}" is not in types.csv`);
    if(!id) warnings.push(`${file} line ${r._line}: missing ID`);
    out.push({
      cat: category, file, line: r._line,
      id: id || `${file}:${r._line}`, name: r.name || '', email: r.email || '', tag: r.tag || '',
      type: AM.fold(r.type), typeDef: t,
      city: r.city || '', zip: r.zip || '', country: r.country || '', region: r.region || '',
      lat: r.lat, lon: r.lon,
      dist: null, tier: 0, near: null
    });
  });
  return {records: out, warnings};
};

/* rings for one marker: its own override, else the incident default */
AM.ringsFor = (m, def) => {
  const own = AM.parseRings(m.rings);
  return own.length ? own : AM.parseRings(def);
};

/* Assign each record its distance to the nearest visible marker and the
   tightest ring tier it falls in across all markers (impact = union of rings).
   r.near is the marker responsible for the tier, else the nearest marker. */
AM.computeImpact = (recs, markers, defRings) => {
  const act = (markers || []).filter(m => m.visible !== false && isFinite(m.lat) && isFinite(m.lon))
    .map(m => ({m, R: AM.ringsFor(m, defRings)}));
  for(const r of recs){
    r.dist = null; r.tier = 0; r.near = null;
    if(!act.length || r.lat == null) continue;
    let best = Infinity, nearest = null, tier = 0, tierM = null, tierD = Infinity;
    for(const {m, R} of act){
      const d = AM.haversine(m.lat, m.lon, r.lat, r.lon);
      if(d < best){ best = d; nearest = m; }
      for(let i = 0; i < R.length; i++){
        if(d <= R[i]){
          const t = i + 1;
          if(!tier || t < tier || (t === tier && d < tierD)){ tier = t; tierM = m; tierD = d; }
          break;
        }
      }
    }
    r.tier = tier;
    r.near = tierM || nearest;
    r.dist = tierM ? tierD : best;
  }
  return recs;
};

/* per-marker counts of affected records (by responsible marker) */
AM.markerStats = (recs, markers) => {
  const s = new Map(markers.map(m => [m.id, {people:0, sites:0, inner:0}]));
  recs.forEach(r => {
    if(!r.tier || !r.near) return;
    const x = s.get(r.near.id); if(!x) return;
    if(r.cat === 'human'){ x.people++; if(r.tier === 1) x.inner++; } else x.sites++;
  });
  return s;
};

/* ---- incident file --------------------------------------------------
   One table, Excel-friendly:
   record,name,lat,lon,rings_km,note,visible,created
   incident,Warehouse fires,,,5;25;100,Fire,,2026-10-19T10:00:00Z
   marker,Fire 1,47.55,7.59,,first report,yes,
   (on the incident row, "note" holds the marker name prefix) */
AM.INCIDENT_HEADER = ['record','name','lat','lon','rings_km','note','visible','created'];

AM.incidentToCSV = inc => {
  const rows = [['incident', inc.name || '', '', '', AM.parseRings(inc.rings).join(';'), inc.prefix || '', '', inc.created || '']];
  inc.markers.forEach(m => rows.push(['marker', m.name, m.lat.toFixed(6), m.lon.toFixed(6),
    AM.parseRings(m.rings).join(';'), m.note || '', m.visible === false ? 'no' : 'yes', '']));
  return AM.toCSV(AM.INCIDENT_HEADER, rows);
};

AM.incidentFromCSV = (text, fallbackRings) => {
  const {rows} = AM.parseCSV(text);
  const inc = {name:'', prefix:'Marker', rings: AM.parseRings(fallbackRings), created:'', markers:[]};
  const errors = [];
  let n = 0;
  rows.forEach(r => {
    const kind = AM.fold(r.record || (r.lat ? 'marker' : ''));
    if(kind === 'incident'){
      inc.name = r.name || ''; inc.prefix = r.note || inc.prefix; inc.created = r.created || '';
      const R = AM.parseRings(r.rings_km); if(R.length) inc.rings = R;
    } else if(kind === 'marker'){
      const lat = AM.num(r.lat), lon = AM.num(r.lon);
      if(!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180){
        errors.push(`line ${r._line}: marker "${r.name||''}" has invalid coordinates`); return;
      }
      n++;
      inc.markers.push({id: 'm' + n + '-' + Math.random().toString(36).slice(2,7),
        name: r.name || `${inc.prefix} ${n}`, lat, lon,
        rings: AM.parseRings(r.rings_km), note: r.note || '',
        visible: !/^(no|n|false|0|hidden)$/i.test(r.visible || '')});
    }
  });
  return {incident: inc, errors};
};

/* next free "Prefix N" name */
AM.nextMarkerName = (markers, prefix) => {
  prefix = (prefix || 'Marker').trim();
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d+)$', 'i');
  let max = 0;
  markers.forEach(m => { const x = String(m.name).match(re); if(x) max = Math.max(max, +x[1]); });
  return `${prefix} ${max + 1}`;
};

/* affected-assets export */
AM.EXPORT_HEADER = ['Category','Type','ID','Name','Email','Tag','City','Zip','Country','Region',
  'Latitude','Longitude','Geocode','NearestMarker','DistanceKm','Ring'];
AM.recordsToCSV = recs => AM.toCSV(AM.EXPORT_HEADER, recs.map(r => [
  r.cat === 'human' ? 'Human' : 'Physical', r.typeDef.label, r.id, r.name, r.email, r.tag,
  r.city, r.zip, AM.Geo ? AM.Geo.countryName(r.cc) || r.country : r.country, r.region,
  r.lat != null ? r.lat.toFixed(5) : '', r.lon != null ? r.lon.toFixed(5) : '',
  AM.MATCH ? AM.MATCH[r.match] : r.match,
  r.near ? r.near.name : '', r.dist != null ? r.dist.toFixed(2) : '', r.tier || ''
]));

})(window.AM);
