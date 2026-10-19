/* Asset Map — settings.csv, types.csv and marker shapes. © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

AM.DEFAULT_SETTINGS = {
  map_title: 'Asset Map',
  company_name: '',
  classification_label: 'Internal',
  default_rings_km: '5;25;100',
  postal_countries: '',          // empty = every bundled country that the data needs
  default_basemap: 'offline',
  theme: 'dark'
};

AM.DEFAULT_TYPES = [
  {category:'human',    type:'employee', label:'Employee', marker:'circle',  color:'#5D9CEC'},
  {category:'human',    type:'resident', label:'Resident', marker:'circle',  color:'#3FB6A0'},
  {category:'physical', type:'office',   label:'Office',   marker:'square',  color:'#E11D2E'},
  {category:'physical', type:'partner',  label:'Partner',  marker:'diamond', color:'#B57EDC'},
  {category:'physical', type:'site',     label:'Site',     marker:'triangle',color:'#F2A93B'}
];
AM.FALLBACK_TYPE = {category:'', type:'', label:'Unknown type', marker:'circle', color:'#8794A5', unknown:true};

AM.MARKERS = ['circle','square','triangle','diamond','star','pin','hexagon','cross'];

/* settings.csv: key,value rows (header optional) */
AM.parseSettings = text => {
  const out = Object.assign({}, AM.DEFAULT_SETTINGS), warnings = [];
  if(!text) return {settings:out, warnings};
  const rows = AM.parseRows(text);
  rows.forEach((r, n) => {
    const k = AM.fold(r[0]).replace(/ /g,'_'), v = (r[1] ?? '').trim();
    if(n === 0 && k === 'key') return;
    if(!k) return;
    if(!(k in AM.DEFAULT_SETTINGS)) warnings.push(`settings.csv line ${n+1}: unknown key "${r[0]}" ignored`);
    out[k] = v;
  });
  return {settings:out, warnings};
};

AM.settingsToCSV = s =>
  AM.toCSV(['key','value'], Object.keys(AM.DEFAULT_SETTINGS).map(k => [k, s[k] ?? '']));

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAMED = {red:'#E11D2E', blue:'#5D9CEC', green:'#3FB6A0', orange:'#FFA23A', yellow:'#E3CE6B',
  purple:'#B57EDC', pink:'#F26A9B', grey:'#8794A5', gray:'#8794A5', white:'#F2F5F8', black:'#20262E',
  teal:'#2BB5B5', cyan:'#4FC3F7', brown:'#A9744F'};

AM.normColor = c => {
  c = String(c ?? '').trim();
  if(HEX.test(c)) return c;
  if(HEX.test('#'+c)) return '#'+c;
  return NAMED[c.toLowerCase()] || null;
};

AM.normCategory = c => {
  const f = AM.fold(c);
  if(/^(human|people|person|employee|employees|staff|resident|residents|personnel)$/.test(f)) return 'human';
  if(/^(physical|asset|assets|site|sites|location|locations|building|office)$/.test(f)) return 'physical';
  return '';
};

/* types.csv: category,type,label,marker,color */
AM.parseTypes = text => {
  const warnings = [];
  if(!text) return {types:AM.DEFAULT_TYPES.map(t=>({...t})), warnings};
  const {rows} = AM.parseCSV(text);
  const types = [];
  rows.forEach(r => {
    const type = AM.fold(r.type);
    if(!type){ warnings.push(`types.csv line ${r._line}: missing type`); return; }
    const category = AM.normCategory(r.category);
    if(!category) warnings.push(`types.csv line ${r._line}: category "${r.category||''}" should be human or physical`);
    let marker = AM.fold(r.marker);
    if(!AM.MARKERS.includes(marker)){
      if(marker) warnings.push(`types.csv line ${r._line}: marker "${r.marker}" unknown, using circle (choose: ${AM.MARKERS.join(', ')})`);
      marker = 'circle';
    }
    let color = AM.normColor(r.color);
    if(!color){
      if(r.color) warnings.push(`types.csv line ${r._line}: colour "${r.color}" not understood, using grey`);
      color = '#8794A5';
    }
    types.push({category, type, label: r.label || r.type, marker, color});
  });
  return {types, warnings};
};

/* lookup by category + type; category-less entries match either */
AM.typeIndex = types => {
  const m = new Map();
  types.forEach(t => {
    if(t.category) m.set(t.category+'|'+t.type, t);
    if(!m.has('*|'+t.type)) m.set('*|'+t.type, t);
  });
  return (category, type) => {
    const k = AM.fold(type);
    return m.get(category+'|'+k) || m.get('*|'+k) || null;
  };
};

/* ---- marker shapes as SVG -------------------------------------------- */
const SHAPES = {
  circle:  '<circle cx="12" cy="12" r="6.5"/>',
  square:  '<rect x="6" y="6" width="12" height="12" rx="1.2"/>',
  triangle:'<path d="M12 4.8 19.4 18H4.6Z"/>',
  diamond: '<path d="M12 4 20 12 12 20 4 12Z"/>',
  star:    '<path d="M12 3.6l2.5 5.4 5.8.6-4.4 3.9 1.3 5.8L12 16.3 6.8 19.3l1.3-5.8L3.7 9.6l5.8-.6Z"/>',
  pin:     '<path d="M12 21s-6.2-6.4-6.2-10.7a6.2 6.2 0 0 1 12.4 0C18.2 14.6 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.2" fill="rgba(0,0,0,.35)" stroke="none"/>',
  hexagon: '<path d="M12 4.5 18.5 8.25v7.5L12 19.5 5.5 15.75v-7.5Z"/>',
  cross:   '<path d="M9.5 4.5h5v5h5v5h-5v5h-5v-5h-5v-5h5Z"/>'
};

AM.markerSVG = (shape, color, size=22, halo=null) => {
  const body = SHAPES[shape] || SHAPES.circle;
  const ring = halo ? `<circle cx="12" cy="12" r="10.6" fill="none" stroke="${halo}" stroke-width="1.6"/>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">`
       + `${ring}<g fill="${color}" stroke="rgba(255,255,255,.85)" stroke-width="1.1" stroke-linejoin="round">${body}</g></svg>`;
};

})(window.AM);
