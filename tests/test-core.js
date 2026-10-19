T.group('core: records, rings, incidents');
const typeOf = AM.typeIndex(AM.DEFAULT_TYPES);
const rec = (id, lat, lon, cat='human') => ({id, lat, lon, cat, typeDef: AM.DEFAULT_TYPES[0], key: cat+':'+id});
T.test('buildRecords: fields, unknown type and missing ID warnings', () => {
  const rows = [{_line:2, id:'3', name:'John', tag:'VIP', type:'Employee', city:'Milano', zip:'20121', country:'Italy'},
                {_line:3, id:'', type:'robot', city:'Basel', country:'CH'}, {_line:4}];
  const {records, warnings} = AM.buildRecords(rows, 'human', typeOf, 'employees.csv');
  T.eq(records.length, 2); T.eq(records[0].typeDef.label, 'Employee'); T.eq(records[0].tag, 'VIP');
  T.ok(records[1].typeDef.unknown); T.eq(warnings.length, 2);
});
T.test('ringsFor: override beats default', () => {
  T.eq(AM.ringsFor({rings:[]}, [5,25]), [5,25]); T.eq(AM.ringsFor({rings:'2;10'}, [5,25]), [2,10]);
});
T.test('computeImpact: single marker tiers', () => {
  const rs = [rec('a', 47.56, 7.59), rec('b', 47.70, 7.59), rec('c', 48.5, 7.59), rec('d', 40, 7)];
  AM.computeImpact(rs, [{id:'m1', name:'Fire 1', lat:47.56, lon:7.59}], [5, 25, 120]);
  T.eq(rs.map(r => r.tier), [1, 2, 3, 0]);
  T.eq(rs[0].near.name, 'Fire 1'); T.near(rs[1].dist, 15.6, 0.5);
});
T.test('computeImpact: union of rings, tightest tier wins across markers', () => {
  const r = rec('x', 47.0, 8.0);
  const m1 = {id:'1', name:'Fire 1', lat:47.0, lon:8.2};    // ~15 km → ring 2 of [5,25]
  const m2 = {id:'2', name:'Fire 2', lat:47.0, lon:8.25, rings:[30]};  // ~19 km → ring 1 of own [30]
  AM.computeImpact([r], [m1, m2], [5, 25]);
  T.eq(r.tier, 1); T.eq(r.near.name, 'Fire 2');
});
T.test('computeImpact: hidden markers ignored, no markers → null', () => {
  const r = rec('x', 47.0, 8.0);
  AM.computeImpact([r], [{id:'1', name:'F', lat:47, lon:8, visible:false}], [5]);
  T.eq(r.tier, 0); T.eq(r.dist, null);
  AM.computeImpact([r], [], [5]); T.eq(r.near, null);
});
T.test('computeImpact: 25 markers, every record gets nearest', () => {
  const ms = Array.from({length:25}, (_, i) => ({id:'m'+i, name:'Fire '+(i+1), lat:40 + i*0.5, lon:5}));
  const rs = Array.from({length:200}, (_, i) => rec('r'+i, 40 + (i%50)*0.25, 5.01));
  AM.computeImpact(rs, ms, [30]);
  T.ok(rs.every(r => r.near && r.dist != null)); T.ok(rs.every(r => r.tier === 1));
});
T.test('markerStats counts people, inner, physical per responsible marker', () => {
  const m = {id:'m', name:'F', lat:47, lon:8};
  const rs = [rec('a', 47, 8), rec('b', 47.1, 8), rec('s', 47, 8, 'physical')];
  AM.computeImpact(rs, [m], [5, 25]);
  T.eq(AM.markerStats(rs, [m]).get('m'), {people:2, sites:1, inner:1});
});
T.test('nextMarkerName continues numbering per prefix', () => {
  T.eq(AM.nextMarkerName([], 'Fire'), 'Fire 1');
  T.eq(AM.nextMarkerName([{name:'Fire 1'}, {name:'Fire 7'}, {name:'Flood 9'}], 'Fire'), 'Fire 8');
  T.eq(AM.nextMarkerName([{name:'x'}], ''), 'Marker 1');
});
T.test('incident CSV round-trip keeps names, rings, visibility', () => {
  const inc = {name:'Fires, "west"', prefix:'Fire', rings:[5,25], created:'2026-10-19',
    markers: Array.from({length:12}, (_, i) => ({id:'m'+i, name:'Fire '+(i+1), lat:47+i/100, lon:7.5, rings: i===3 ? [2,8] : [], note: i===0 ? 'a, b' : '', visible: i !== 5}))};
  const {incident, errors} = AM.incidentFromCSV(AM.incidentToCSV(inc), [1]);
  T.eq(errors, []); T.eq(incident.name, 'Fires, "west"'); T.eq(incident.prefix, 'Fire'); T.eq(incident.rings, [5,25]);
  T.eq(incident.markers.length, 12); T.eq(incident.markers[3].rings, [2,8]); T.eq(incident.markers[5].visible, false);
  T.eq(incident.markers[0].note, 'a, b'); T.near(incident.markers[11].lat, 47.11, 1e-6);
});
T.test('incident CSV: invalid rows reported, semicolon file accepted', () => {
  const {incident, errors} = AM.incidentFromCSV('record;name;lat;lon\nmarker;A;47,5;7,5\nmarker;B;999;1\n', [5]);
  T.eq(incident.markers.length, 1); T.eq(incident.markers[0].lat, 47.5); T.eq(errors.length, 1); T.eq(incident.rings, [5]);
});
T.test('recordsToCSV has header and one line per record', () => {
  const r = Object.assign(rec('1', 47, 8), {name:'A', cc:'CH', match:'postal', dist:1.234, tier:1, near:{name:'Fire 1'}});
  const lines = AM.recordsToCSV([r]).trim().split('\r\n');
  T.eq(lines.length, 2); T.ok(lines[1].includes('Fire 1') && lines[1].includes('1.23'));
});
