/* Asset Map — incident panel: named markers, rings, save / load / reset.
   One incident per session; any number of markers (Fire 1, Fire 2 …).
   © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

const I = AM.Incident = {};
const $ = id => document.getElementById(id);
const KEY = 'am.incident';
let map, pinLayer, ringLayer, onChange = () => {}, armed = false, active = null, defaultRings = [5,25,100];

I.state = {name:'', prefix:'Fire', rings:[5,25,100], created:'', markers:[]};

const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

function persist(){ AM.store.set(KEY, I.state); }

I.rings = () => I.state.rings.length ? I.state.rings : defaultRings;

/* ---- map drawing --------------------------------------------------------- */
function pinIcon(m, n){
  return L.divIcon({className:'', iconSize:[26,26], iconAnchor:[13,13],
    html:`<div class="inc-pin${m.visible===false?' off':''}${active===m.id?' active':''}">${n}</div>`});
}
function draw(){
  pinLayer.clearLayers(); ringLayer.clearLayers();
  I.state.markers.forEach((m, i) => {
    const pin = L.marker([m.lat, m.lon], {icon: pinIcon(m, i+1), draggable:true, zIndexOffset:12000, keyboard:false})
      .bindTooltip(AM.esc(m.name), {permanent:true, direction:'right', offset:[14,0], className:'inc-lbl'});
    pin.on('dragend', ev => { const p = ev.target.getLatLng(); m.lat = p.lat; m.lon = p.lng; changed(); });
    pin.on('click', () => { setActive(m.id); });
    pinLayer.addLayer(pin);
    if(m.visible === false) return;
    const R = AM.ringsFor(m, I.rings());
    R.forEach((km, j) => ringLayer.addLayer(L.circle([m.lat, m.lon], {radius: km*1000, color: AM.ringColor(j+1),
      weight: 1, opacity: .8, fillColor: AM.ringColor(j+1), fillOpacity: .05, dashArray: '4 4', interactive:false})));
  });
}

function setActive(id){
  active = id;
  draw(); I.renderList(I._stats);
  const li = document.querySelector(`#markers li[data-id="${id}"]`);
  if(li) li.scrollIntoView({block:'nearest'});
}

function changed(){ persist(); draw(); onChange(); }

/* ---- actions --------------------------------------------------------------- */
I.add = (lat, lon, name) => {
  const m = {id:newId(), name: name || AM.nextMarkerName(I.state.markers, I.state.prefix), lat, lon, rings:[], note:'', visible:true};
  if(!I.state.created) I.state.created = new Date().toISOString();
  I.state.markers.push(m);
  active = m.id;
  changed();
  return m;
};
I.remove = id => { I.state.markers = I.state.markers.filter(m => m.id !== id); if(active === id) active = null; changed(); };

I.arm = on => {
  armed = on === undefined ? !armed : on;
  $('btn-place').classList.toggle('on', armed);
  $('btn-place').textContent = armed ? 'Placing… (Esc)' : '+ Place markers';
  map.getContainer().classList.toggle('leaflet-crosshair-on', armed);
  I.hint(armed ? `Click the map to add <b>${AM.esc(AM.nextMarkerName(I.state.markers, I.state.prefix))}</b>. Each click adds another marker. Press Esc or the button to stop.` : null);
};

I.reset = (ask=true) => {
  if(ask && I.state.markers.length && !confirm(`Remove all ${I.state.markers.length} incident markers and clear the incident name?`)) return;
  I.state = {name:'', prefix: I.state.prefix || 'Fire', rings: defaultRings.slice(), created:'', markers:[]};
  active = null; syncFields(); changed();
};

I.save = async () => {
  if(!I.state.markers.length){ AM.toast('Nothing to save yet — add at least one marker.'); return; }
  const name = `incident-${AM.slug(I.state.name || 'incident')}-${AM.today()}.csv`;
  const csv = AM.incidentToCSV(I.state);
  if(await AM.Loader.writeFile(name, csv)) AM.toast(`Saved <b>${AM.esc(name)}</b> in the data folder.`);
  else { AM.download(name, csv); AM.toast(`Downloaded <b>${AM.esc(name)}</b>. Keep it with your data files to load it again.`); }
};

I.loadText = (text, from) => {
  const {incident, errors} = AM.incidentFromCSV(text, defaultRings);
  if(!incident.markers.length){ AM.toast(`No markers found in ${AM.esc(from||'that file')}.` + (errors.length ? ' ' + AM.esc(errors[0]) : '')); return false; }
  if(I.state.markers.length && !confirm(`Replace the current ${I.state.markers.length} markers with "${incident.name || from}" (${incident.markers.length} markers)?`)) return false;
  I.state = incident; active = null;
  syncFields(); changed();
  const pts = incident.markers.map(m => [m.lat, m.lon]);
  map.fitBounds(L.latLngBounds(pts).pad(0.6), {maxZoom: 11});
  AM.toast(`Loaded incident <b>${AM.esc(incident.name || from)}</b> — ${incident.markers.length} markers.` + (errors.length ? ` ${errors.length} rows skipped.` : ''));
  return true;
};

I.hint = t => { $('hint').innerHTML = t || ''; };

/* ---- panel -------------------------------------------------------------- */
function syncFields(){
  $('inc-name').value = I.state.name || '';
  $('inc-prefix').value = I.state.prefix || '';
  $('inc-rings').value = (I.state.rings.length ? I.state.rings : defaultRings).join('; ');
}

I.renderList = stats => {
  I._stats = stats;
  const ol = $('markers');
  const def = I.rings().join('; ');
  ol.innerHTML = I.state.markers.map((m, i) => {
    const s = stats && stats.get(m.id) || {people:0, sites:0, inner:0};
    return `<li data-id="${m.id}" class="${m.visible===false?'off':''}${active===m.id?' active':''}">
      <span class="no" title="Show on map">${i+1}</span>
      <input type="text" data-f="name" value="${AM.esc(m.name)}" aria-label="Marker name">
      <input type="text" data-f="rings" value="${AM.esc(AM.parseRings(m.rings).join('; '))}" placeholder="${AM.esc(def)}" title="Rings in km for this marker only — leave empty to use the default" aria-label="Rings (km)">
      <span class="acts">
        <button data-a="vis" title="${m.visible===false?'Show':'Hide'} this marker">${m.visible===false?'◌':'●'}</button>
        <button data-a="del" title="Delete this marker">✕</button>
      </span>
      <span class="stats"><b>${s.people}</b> people · <b>${s.inner}</b> inner · <b>${s.sites}</b> physical · ${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}</span>
    </li>`;
  }).join('');
  $('markers-empty').hidden = I.state.markers.length > 0;
  ol.querySelectorAll('li').forEach(li => {
    const m = I.state.markers.find(x => x.id === li.dataset.id);
    li.querySelector('.no').onclick = () => { setActive(m.id); map.setView([m.lat, m.lon], Math.max(map.getZoom(), 9)); };
    li.querySelector('[data-f=name]').onchange = e => { m.name = e.target.value.trim() || m.name; changed(); };
    li.querySelector('[data-f=rings]').onchange = e => { m.rings = AM.parseRings(e.target.value); changed(); };
    li.querySelector('[data-a=vis]').onclick = () => { m.visible = m.visible === false; changed(); };
    li.querySelector('[data-a=del]').onclick = () => { if(confirm(`Delete marker "${m.name}"?`)) I.remove(m.id); };
  });
};

I.init = (leafletMap, opts) => {
  map = leafletMap; onChange = opts.onChange || onChange;
  ringLayer = L.layerGroup().addTo(map);
  pinLayer  = L.layerGroup().addTo(map);
  const saved = AM.store.get(KEY, null);
  if(saved && Array.isArray(saved.markers)) I.state = Object.assign(I.state, saved);
  syncFields(); draw();

  map.on('click', ev => { if(armed) I.add(ev.latlng.lat, ev.latlng.lng); if(armed) I.arm(true); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && armed) I.arm(false); });
  $('btn-place').onclick = () => I.arm();
  $('btn-pin').onclick = addFromField;
  $('pin').addEventListener('keydown', e => { if(e.key === 'Enter') addFromField(); });
  $('inc-name').onchange = e => { I.state.name = e.target.value.trim(); persist(); };
  $('inc-prefix').onchange = e => { I.state.prefix = e.target.value.trim() || 'Marker'; persist(); if(armed) I.arm(true); };
  $('inc-rings').onchange = e => {
    const R = AM.parseRings(e.target.value);
    I.state.rings = R.length ? R : defaultRings.slice();
    e.target.value = I.state.rings.join('; ');
    changed();
  };
  $('btn-inc-save').onclick = I.save;
  $('btn-inc-reset').onclick = () => I.reset(true);
  $('in-incident').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if(f) I.loadText(await AM.Loader.readText(f), f.name);
  };
};

function addFromField(){
  const c = AM.parseCoords($('pin').value);
  if(!c){ I.hint('Could not read those coordinates. Use decimal degrees, e.g. <b>47.12020, 8.58080</b>.'); return; }
  const m = I.add(c[0], c[1]);
  $('pin').value = '';
  map.setView(c, Math.max(map.getZoom(), 10));
  I.hint(`Added <b>${AM.esc(m.name)}</b> at ${c[0].toFixed(5)}, ${c[1].toFixed(5)}. Drag the pin to adjust.`);
}

/* default rings from settings; applied when the incident has none of its own */
I.setDefaultRings = R => {
  defaultRings = R.length ? R : [5,25,100];
  if(!I.state.markers.length && !I.state.name) I.state.rings = defaultRings.slice();
  syncFields(); draw();
};

})(window.AM);
