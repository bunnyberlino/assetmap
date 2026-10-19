#!/usr/bin/env node
/* One-off: split the reusable, non-company parts out of the reference file
   example/asset-map-global.html into app/ and geo/.
   - app/leaflet.css, app/leaflet.js  (Leaflet 1.9, BSD-2)
   - geo/basemap.js  (WORLD, STATES, CLABEL, SLABEL, CITIES — public data)
   PLACES, DATA, SITES and the rest are company data and are NOT copied.
   Usage: node tools/extract-example.mjs [path/to/example.html] */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src  = process.argv[2] || path.join(root, 'example/asset-map-global.html');
const html = fs.readFileSync(src, 'utf8');

const styles  = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(styles.length < 1 || scripts.length < 2) throw new Error('unexpected example structure');

fs.writeFileSync(path.join(root,'app/leaflet.css'), styles[0].trim()+'\n');
fs.writeFileSync(path.join(root,'app/leaflet.js'),  scripts[0].trim()+'\n');

const app = scripts[1];
function grab(name){
  const m = app.match(new RegExp('\\nconst '+name+'\\s*=\\s*'));
  if(!m) throw new Error('missing '+name);
  const start = m.index + m[0].length;
  const end = app.indexOf(';\n', start);
  const val = app.slice(start, end);
  JSON.parse(val);                       // must be pure JSON
  return val;
}
const out = ['/* Offline vector basemap — extracted from the reference build.',
  '   Country outlines: Natural Earth 1:50m via world-atlas; US states: us-atlas;',
  '   labels and cities: Natural Earth / GeoNames. Public data. */',
  'window.AM_BASE = {'];
for(const k of ['WORLD','STATES','CLABEL','SLABEL','CITIES'])
  out.push(`${k}: ${grab(k)},`);
out.push('};');
fs.writeFileSync(path.join(root,'geo/basemap.js'), out.join('\n')+'\n');
console.log('wrote app/leaflet.css, app/leaflet.js, geo/basemap.js');
