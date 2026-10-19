/* Asset Map — application wiring. © 2026 Alexander Habath · PolyForm Noncommercial 1.0.0 */
window.AM = window.AM || {};
(function(AM){

AM.VERSION = '0.1.0';
const $ = id => document.getElementById(id);

let settings = Object.assign({}, AM.DEFAULT_SETTINGS);
let types = AM.DEFAULT_TYPES.map(t => ({...t}));
let recs = [];
let report = null;

/* ---- toast ------------------------------------------------------------- */
let toastT;
AM.toast = html => {
  const t = $('toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 6500);
};
$('toast').onclick = () => $('toast').hidden = true;

/* ---- theme ------------------------------------------------------------- */
function setTheme(th){
  th = th === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = th;
  $('btn-theme').textContent = th === 'light' ? 'Dark' : 'Light';
  AM.store.set('am.theme', th);
  AM.MapView.restyle();
  render();
}
$('btn-theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');

/* ---- tabs -------------------------------------------------------------- */
function showTab(k){
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
  document.querySelectorAll('section.tab').forEach(s => s.hidden = s.id !== 'tab-' + k);
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---- render pipeline ----------------------------------------------------- */
function render(){
  const inc = AM.Incident.state;
  AM.computeImpact(recs, inc.markers, AM.Incident.rings());
  const rows = AM.Table.visible();
  AM.MapView.render(rows);
  const hasInc = inc.markers.some(m => m.visible !== false);
  AM.Table.render(rows, hasInc);
  AM.Incident.renderList(AM.markerStats(recs, inc.markers));
  AM.MapView.setLegend(types, AM.Incident.rings());
}

function select(r){
  AM.Table.select(r.key);
  AM.MapView.focus(r, true);
}

/* ---- settings ----------------------------------------------------------- */
function applySettings(){
  document.title = settings.map_title || 'Asset Map';
  $('title').textContent = settings.map_title || 'Asset Map';
  $('company').textContent = settings.company_name || '';
  $('class-mark').textContent = settings.classification_label || '';
  AM.Incident.setDefaultRings(AM.parseRings(settings.default_rings_km));
  $('set-title').value = settings.map_title || '';
  $('set-company').value = settings.company_name || '';
  $('set-class').value = settings.classification_label || '';
  renderPostalList();
  /* settings.csv decides theme and basemap unless this browser has its own choice */
  if(AM.store.get('am.theme', null) == null){
    const th = settings.theme === 'light' ? 'light' : 'dark';
    if(document.documentElement.dataset.theme !== th){
      document.documentElement.dataset.theme = th;
      $('btn-theme').textContent = th === 'light' ? 'Dark' : 'Light';
      AM.MapView.restyle();
    }
  }
  if(AM.store.get('am.base', null) == null && ['offline','terrain'].includes(settings.default_basemap) && AM.MapView.base() !== settings.default_basemap)
    AM.MapView.setBase(settings.default_basemap, true);
}

function postalSelection(){
  const v = String(settings.postal_countries || '').trim();
  if(!v) return AM.Geo.bundledPostal();
  return v.split(/[;,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
}

function renderPostalList(){
  const bundled = AM.Geo.bundledPostal(), sel = new Set(postalSelection());
  const used = new Set(recs.map(r => r.cc));
  $('postal-list').innerHTML = bundled.map(cc =>
    `<label class="${used.has(cc)?'used':''}" title="${AM.esc(AM.Geo.countryName(cc))}${used.has(cc)?' — in your data':''}">
       <input type="checkbox" value="${cc}" ${sel.has(cc)?'checked':''}>${cc}</label>`).join('')
    || '<span class="dim">No postal files bundled (geo/postal). City-level placement only.</span>';
  $('postal-sum').textContent = bundled.length ? `(${[...sel].filter(c => bundled.includes(c)).length} of ${bundled.length}; bold = in your data)` : '';
}
function readSettingsForm(){
  const s = Object.assign({}, settings);
  s.map_title = $('set-title').value.trim();
  s.company_name = $('set-company').value.trim();
  s.classification_label = $('set-class').value.trim();
  const boxes = [...document.querySelectorAll('#postal-list input')];
  const on = boxes.filter(b => b.checked).map(b => b.value);
  s.postal_countries = on.length === boxes.length ? '' : (on.length ? on.join(';') : 'none');
  return s;
}
$('postal-all').onclick = () => document.querySelectorAll('#postal-list input').forEach(b => b.checked = true);
$('postal-none').onclick = () => document.querySelectorAll('#postal-list input').forEach(b => b.checked = false);
$('btn-set-apply').onclick = async () => {
  const before = settings.postal_countries;
  settings = readSettingsForm();
  applySettings();
  if(before !== settings.postal_countries && recs.length){ await geocode(); }
  render();
  AM.toast('Settings applied for this session. Use <b>Save settings.csv</b> to keep them.');
};
$('btn-set-save').onclick = async () => {
  settings = readSettingsForm(); applySettings();
  const csv = AM.settingsToCSV(settings);
  if(await AM.Loader.writeFile('settings.csv', csv)) AM.toast('Saved <b>settings.csv</b> in the data folder.');
  else { AM.download('settings.csv', csv); AM.toast('Downloaded <b>settings.csv</b> — replace the one in your data folder with it.'); }
};

/* ---- loading ------------------------------------------------------------ */
async function geocode(){
  const sel = String(settings.postal_countries).trim().toLowerCase() === 'none' ? ['--'] : postalSelection();
  recs.forEach(r => { r.lat = r._lat; r.lon = r._lon; r.marker = null; });
  AM.MapView.reset();
  const g = await AM.Geo.locateAll(recs, sel);
  report.postal = g.postalLoaded;
  AM.MapView.setPlaces(recs);
  renderReport();
}

async function loadSource(src){
  const roles = AM.Loader.classify(src.files);
  report = {source: src.name, files: [], warnings: [], postal: []};
  if(!roles.employees.length && !roles.assets.length){
    AM.toast(`No employee or asset CSV found in <b>${AM.esc(src.name)}</b>. Expected names like <code>employees.csv</code> and <code>assets.csv</code>.`);
    return false;
  }
  /* settings + types first: they decide how rows are read */
  const sTxt = roles.settings ? await AM.Loader.readText(roles.settings) : '';
  const ps = AM.parseSettings(sTxt);
  settings = ps.settings; report.warnings.push(...ps.warnings);
  if(!roles.settings) report.warnings.push('settings.csv not found — using defaults');
  const tTxt = roles.types ? await AM.Loader.readText(roles.types) : '';
  const pt = AM.parseTypes(tTxt);
  types = pt.types; report.warnings.push(...pt.warnings);
  if(!roles.types) report.warnings.push('types.csv not found — using built-in types');
  const typeOf = AM.typeIndex(types);

  recs = [];
  for(const [cat, files] of [['human', roles.employees], ['physical', roles.assets]]){
    for(const f of files){
      const {rows, header} = AM.parseCSV(await AM.Loader.readText(f));
      const missing = ['id','type','country'].filter(h => !header.includes(h));
      if(missing.length) report.warnings.push(`${f.name}: missing column(s) ${missing.join(', ')}`);
      const b = AM.buildRecords(rows, cat, typeOf, f.name);
      report.files.push({name: f.name, cat, n: b.records.length});
      report.warnings.push(...b.warnings);
      recs.push(...b.records);
    }
  }
  const seen = new Map();
  recs.forEach(r => {
    let k = r.cat + ':' + r.id;
    if(seen.has(k)){ report.warnings.push(`${r.file} line ${r.line}: duplicate ID "${r.id}"`); k += ':' + r.line; }
    seen.set(k, 1); r.key = k; r._lat = r.lat; r._lon = r.lon;
  });

  await geocode();
  applySettings();
  AM.Table.setRecords(recs);
  $('src-name').textContent = src.name + (src.kind === 'dir' ? ' (remembered)' : '');
  $('src-name').title = src.name;
  const people = recs.filter(r => r.cat === 'human'), phys = recs.filter(r => r.cat === 'physical');
  $('s-people').textContent = people.length;
  $('s-sites').textContent = phys.length;
  const placed = recs.filter(r => r.lat != null).length;
  $('s-geo').textContent = recs.length ? (100 * placed / recs.length).toFixed(1) + '%' : '—';
  $('start').hidden = true;
  render();
  AM.MapView.fit(recs);

  /* offer an incident file from the folder if nothing is in progress */
  if(roles.incidents.length && !AM.Incident.state.markers.length){
    const f = roles.incidents[roles.incidents.length - 1];
    if(confirm(`Found incident file "${f.name}". Load it?`)) AM.Incident.loadText(await AM.Loader.readText(f), f.name);
  }
  const bad = recs.length - placed;
  AM.toast(`Loaded <b>${recs.length}</b> records from ${AM.esc(src.name)}.` + (bad ? ` <b>${bad}</b> could not be placed — see the Data tab.` : '')
    + (report.warnings.length ? ` ${report.warnings.length} notes in the import report.` : ''));
  if(bad || report.warnings.length > 0) $('tab-data').dataset.attn = '1';
  return true;
}

function renderReport(){
  if(!report) return;
  const byMatch = {};
  recs.forEach(r => byMatch[r.match] = (byMatch[r.match] || 0) + 1);
  const failed = recs.filter(r => r.match === 'none');
  const countryOnly = recs.filter(r => r.match === 'country');
  $('report').innerHTML = `
    <h3>Files</h3>
    <table>${report.files.map(f => `<tr><td>${AM.esc(f.name)}</td><td>${f.n} ${f.cat === 'human' ? 'people' : 'physical'}</td></tr>`).join('')}</table>
    <h3>Placement</h3>
    <table>${AM.MATCH_ORDER.filter(k => byMatch[k]).map(k =>
      `<tr class="${k==='none'?'err':k==='country'?'warn':''}"><td>${AM.MATCH[k]}</td><td>${byMatch[k]}</td></tr>`).join('')}</table>
    <div class="dim sm">Postal data used: ${report.postal.length ? report.postal.join(', ') : 'none'}</div>
    ${failed.length ? `<h3 class="err">Not placed (${failed.length})</h3><ul>${failed.slice(0,100).map(r =>
      `<li>${AM.esc(r.file)} line ${r.line}: ${AM.esc(r.id)} — ${AM.esc([r.zip, r.city, r.country].filter(Boolean).join(', ') || 'no location')}${r.country && !r.cc ? ' (country not recognised)' : ''}</li>`).join('')}</ul>` : ''}
    ${countryOnly.length ? `<h3 class="warn">Country centre only (${countryOnly.length})</h3><ul>${countryOnly.slice(0,100).map(r =>
      `<li>${AM.esc(r.file)} line ${r.line}: ${AM.esc(r.id)} — ${AM.esc([r.zip, r.city].filter(Boolean).join(' ') || 'no city/zip')}</li>`).join('')}</ul>` : ''}
    ${report.warnings.length ? `<h3 class="warn">Notes (${report.warnings.length})</h3><ul>${report.warnings.slice(0,200).map(w => `<li>${AM.esc(w)}</li>`).join('')}</ul>` : ''}
  `;
}

async function run(p){
  try { const src = await p; if(src) await loadSource(src); }
  catch(e){ if(e && e.name === 'AbortError') return; console.error(e); AM.toast('Could not read the data: ' + AM.esc(e.message || e)); }
}

/* ---- start screen + data tab wiring -------------------------------------- */
async function initStart(){
  const canPick = AM.Loader.canPickFolder();
  if(!recs.length) $('start').hidden = false;
  $('btn-open-folder').hidden = !canPick;
  $('btn-open-folder').onclick = () => run(AM.Loader.pickFolder());
  $('in-folder').onchange = e => { const fl = e.target.files; run(Promise.resolve(AM.Loader.fromFileList(fl))); e.target.value = ''; };
  $('in-files').onchange  = e => { const fl = e.target.files; run(Promise.resolve(AM.Loader.fromFileList(fl))); e.target.value = ''; };
  const start = $('start');
  ['dragenter','dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); start.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if(ev === 'drop' || e.target === document.documentElement) start.classList.remove('over'); }));
  document.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if(!dt) return;
    /* a single dropped incident file while data is loaded → load as incident */
    if(recs.length && dt.files.length === 1 && /incident/i.test(dt.files[0].name)){
      AM.Loader.readText(dt.files[0]).then(t => AM.Incident.loadText(t, dt.files[0].name));
      return;
    }
    run(AM.Loader.fromDrop(dt));
  });
  $('btn-reload').onclick = async () => {
    const s = AM.Loader.source;
    if(!s){ start.hidden = false; return; }
    if(s.kind !== 'dir'){ AM.toast('This browser loaded a snapshot of the files. Choose the folder again to pick up your edits.'); start.hidden = false; return; }
    run(AM.Loader.refresh());
  };
  $('btn-change').onclick = () => { start.hidden = false; $('btn-start-close').hidden = !recs.length; };
  $('btn-start-close').onclick = () => { start.hidden = true; };
  if(!canPick) $('in-folder').parentElement.classList.add('on');
  const saved = canPick ? await AM.Loader.savedHandle() : null;
  if(saved){
    $('btn-reopen').hidden = false;
    $('btn-reopen').textContent = `Reopen “${saved.name}”`;
    $('btn-reopen').onclick = () => run(AM.Loader.useHandle(saved));
  }
}

/* ---- boot ---------------------------------------------------------------- */
function boot(){
  $('version').textContent = 'v' + AM.VERSION;
  const th = AM.store.get('am.theme', null);
  document.documentElement.dataset.theme = th || 'dark';
  $('btn-theme').textContent = document.documentElement.dataset.theme === 'light' ? 'Dark' : 'Light';
  const map = AM.MapView.init({onSelect: select});
  AM.Table.init({onSelect: select, onFilter: render});
  AM.Incident.init(map, {onChange: render});
  document.getElementById('v-bub').onclick = () => { AM.MapView.setBubbleMode(true);  $('v-bub').classList.add('on'); $('v-pt').classList.remove('on'); };
  document.getElementById('v-pt').onclick  = () => { AM.MapView.setBubbleMode(false); $('v-pt').classList.add('on'); $('v-bub').classList.remove('on'); };
  document.querySelectorAll('[data-rg]').forEach(b => b.onclick = () => b.dataset.rg === 'fit' ? AM.MapView.fit(recs) : AM.MapView.flyRegion(b.dataset.rg));
  $('btn-inc-export').onclick = () => {
    const hasInc = AM.Incident.state.markers.some(m => m.visible !== false);
    const rows = (hasInc ? recs.filter(r => r.tier) : AM.Table.visible()).slice().sort((a,b) => (a.tier - b.tier) || ((a.dist ?? 1e9) - (b.dist ?? 1e9)));
    if(!rows.length){ AM.toast(hasInc ? 'Nothing is inside the rings.' : 'No records to export.'); return; }
    const name = (hasInc ? `affected-${AM.slug(AM.Incident.state.name || 'incident')}` : 'asset-map-selection') + `-${AM.today()}.csv`;
    AM.download(name, AM.recordsToCSV(rows));
  };
  if(!AM_GEO.countries) AM.toast('Gazetteer files (geo/) are missing — only rows with lat/lon can be placed.');
  applySettings();
  render();
  initStart();
}

AM.debug = () => ({recs, settings, types, report});   // console inspection
/* load an array of File objects programmatically (used by the smoke test) */
AM.loadFiles = files => run(Promise.resolve(AM.Loader.fromFileList(files)));
boot();

})(window.AM);
