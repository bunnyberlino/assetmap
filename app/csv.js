/* Asset Map — CSV read/write tolerant of Excel exports. © 2026 Alexander Habath
   Handles: comma / semicolon / tab / pipe delimiters, UTF-8 with or without BOM,
   Windows-1252 (Excel "CSV" on Windows), quoted fields, embedded newlines. */
window.AM = window.AM || {};
(function(AM){

/* bytes → text: UTF-8 if valid, otherwise Windows-1252 */
AM.decode = buf => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(u8); }
  catch(e){ text = new TextDecoder('windows-1252').decode(u8); }
  return text.replace(/^﻿/, '');
};

AM.detectDelimiter = text => {
  const first = text.split(/\r?\n/).find(l => l.trim() !== '') || '';
  let best = ',', bestN = 0;
  for(const d of [',', ';', '\t', '|']){
    let n = 0, inQ = false;
    for(const ch of first){
      if(ch === '"') inQ = !inQ;
      else if(ch === d && !inQ) n++;
    }
    if(n > bestN){ best = d; bestN = n; }
  }
  return best;
};

/* text → array of arrays */
AM.parseRows = (text, delim) => {
  text = String(text).replace(/^﻿/, '');
  delim = delim || AM.detectDelimiter(text);
  const rows = []; let row = [], f = '', i = 0, inQ = false;
  const n = text.length;
  while(i < n){
    const ch = text[i];
    if(inQ){
      if(ch === '"'){
        if(text[i+1] === '"'){ f += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      f += ch; i++; continue;
    }
    if(ch === '"' && f === ''){ inQ = true; i++; continue; }
    if(ch === delim){ row.push(f); f = ''; i++; continue; }
    if(ch === '\r'){ i++; continue; }
    if(ch === '\n'){ row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += ch; i++;
  }
  if(f !== '' || row.length){ row.push(f); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
};

/* header aliases → canonical field names */
const ALIAS = {
  'id':'id', 'ref':'id', 'reference':'id', 'anonid':'id', 'employee_id':'id', 'asset_id':'id',
  'name':'name', 'full_name':'name',
  'email':'email', 'e_mail':'email', 'mail':'email',
  'tag':'tag', 'tags':'tag', 'label':'label',
  'type':'type', 'category':'category',
  'city':'city', 'town':'city', 'place':'city', 'ort':'city', 'stadt':'city', 'citta':'city', 'ville':'city',
  'zip':'zip', 'zipcode':'zip', 'zip_code':'zip', 'postal_code':'zip', 'postalcode':'zip',
  'postcode':'zip', 'post_code':'zip', 'plz':'zip', 'cap':'zip', 'npa':'zip',
  'country':'country', 'country_code':'country', 'countrycode':'country', 'cc':'country', 'land':'country', 'paese':'country', 'pays':'country',
  'region':'region', 'state':'region', 'province':'region', 'county':'region', 'canton':'region', 'kanton':'region',
  'lat':'lat', 'latitude':'lat', 'breite':'lat',
  'lon':'lon', 'lng':'lon', 'long':'lon', 'longitude':'lon', 'laenge':'lon',
  'marker':'marker', 'shape':'marker', 'icon':'marker',
  'color':'color', 'colour':'color', 'farbe':'color',
  'key':'key', 'setting':'key', 'value':'value', 'wert':'value',
  'record':'record', 'rings_km':'rings_km', 'rings':'rings_km', 'note':'note', 'notes':'note',
  'visible':'visible', 'created':'created'
};
AM.normHeader = h => {
  const k = AM.fold(h).replace(/ /g,'_');
  return ALIAS[k] || k;
};

/* text → {header, rows:[{field:value}], delimiter} */
AM.parseCSV = text => {
  const delimiter = AM.detectDelimiter(text);
  const all = AM.parseRows(text, delimiter);
  if(!all.length) return {header:[], rows:[], delimiter};
  const header = all[0].map(AM.normHeader);
  const rows = all.slice(1).map((r, n) => {
    const o = {_line: n + 2};
    header.forEach((h, j) => { if(h) o[h] = (r[j] ?? '').trim(); });
    return o;
  });
  return {header, rows, delimiter};
};

AM.csvCell = v => {
  const s = String(v ?? '');
  return /[",;\n\r\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
AM.toCSV = (header, rows) =>
  [header.join(','), ...rows.map(r => r.map(AM.csvCell).join(','))].join('\r\n') + '\r\n';

})(window.AM);
