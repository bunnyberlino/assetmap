/* Asset Map — map view: basemaps, labels, bubbles, typed markers, legend.
   Derived from the reference build (vector basemap, label engine, grid bubbles).
   © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

const V = AM.MapView = {};
const B = window.AM_BASE || {WORLD:{type:'FeatureCollection',features:[]}, STATES:{type:'FeatureCollection',features:[]}, CLABEL:[], SLABEL:[], CITIES:[]};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

let map, bubbleLayer, pointLayer, physLayer, vectorWorld, vectorStates, labelPane;
let activeBase = 'offline', bubbleMode = true, rows = [], places = [];
let onSelect = () => {};

V.REGION = {
  amer: [[-45,-125],[55,-35]],
  emea: [[-35,-20],[62,60]],
  apac: [[-45,65],[50,180]]
};

/* ---- basemaps ------------------------------------------------------- */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const ESRI_ATTR = 'Tiles &copy; Esri';
const ESRI_IMG  = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';
function esri(path, attr, maxNative){
  return L.tileLayer(ESRI + path + '/MapServer/tile/{z}/{y}/{x}',
    {pane:'basemap', attribution:attr, maxZoom:19, maxNativeZoom:maxNative});
}
/* Esri rather than openstreetmap.org: OSM blocks requests without a Referer,
   which is what a page opened from file:// sends. */
V.BASES = {
  offline: {label:'Outline',   group:'Offline', online:false},
  terrain: {label:'Terrain',   group:'Offline', online:false},
  dark:    {label:'Streets (dark)', group:'Online', online:true},
  street:  {label:'Streets',   group:'Online', online:true},
  topo:    {label:'Terrain / topo', group:'Online', online:true},
  sat:     {label:'Satellite', group:'Online', online:true}
};
let layers = {};
let tileWarned = false, privacyAck = AM.store.get('am.esriAck', false);

function buildLayers(){
  layers.terrain = L.tileLayer('tiles/terrain/{z}/{x}/{y}.jpg',
    {pane:'basemap', maxZoom:14, maxNativeZoom:6, minZoom:0, noWrap:false,
     attribution:'Relief: Natural Earth (offline)', errorTileUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='});
  layers.dark   = L.layerGroup([esri('Canvas/World_Dark_Gray_Base', ESRI_ATTR, 16), esri('Canvas/World_Dark_Gray_Reference', ESRI_ATTR, 16)]);
  layers.street = esri('World_Street_Map', ESRI_ATTR, 19);
  layers.topo   = esri('World_Topo_Map', ESRI_ATTR, 19);
  layers.sat    = L.layerGroup([esri('World_Imagery', ESRI_IMG, 19), esri('Reference/World_Transportation', ESRI_IMG, 19)]);
  ['dark','street','topo','sat'].forEach(k => {
    const l = layers[k];
    (l.getLayers ? l.getLayers() : [l]).forEach(t => t.on('tileerror', () => {
      if(tileWarned || activeBase !== k) return;
      tileWarned = true;
      AM.toast('That online layer could not load — no connection, or the tile host is blocked on this network. '
             + 'The offline layers always work; pasted coordinates still give exact placement.');
    }));
  });
}

function vectorStyle(){
  return {
    world:  {color:css('--border'), weight:0.7, opacity:1, fillColor:css('--land'), fillOpacity:1},
    states: {color:css('--state'),  weight:0.5, opacity:1, fill:false},
    worldLines: {color:'rgba(20,24,30,.55)', weight:0.8, opacity:1, fill:false}
  };
}

V.setBase = (k, fromSettings) => {
  if(!(k in V.BASES)) k = 'offline';
  if(V.BASES[k].online && !privacyAck){
    const ok = confirm('Online map layers are loaded from Esri (server.arcgisonline.com).\n\n'
      + 'Esri can see which map area you are viewing — not your asset data, which never leaves this computer.\n\n'
      + 'Use online layers?');
    if(!ok) return;
    privacyAck = true; AM.store.set('am.esriAck', true);
  }
  Object.values(layers).forEach(l => { if(map.hasLayer(l)) map.removeLayer(l); });
  const st = vectorStyle();
  const showVector = k === 'offline' || k === 'terrain';
  [vectorWorld, vectorStates].forEach(l => { if(map.hasLayer(l)) map.removeLayer(l); });
  if(showVector){
    vectorWorld.setStyle(k === 'terrain' ? st.worldLines : st.world);
    vectorStates.setStyle(st.states);
    map.addLayer(vectorWorld); map.addLayer(vectorStates);
  }
  if(k !== 'offline') layers[k].addTo(map);
  if(k === 'terrain') layers.terrain.bringToBack();
  map.setMaxZoom(showVector ? 14 : 19);
  if(map.getZoom() > map.getMaxZoom()) map.setZoom(map.getMaxZoom());
  tileWarned = false;
  activeBase = k;
  document.getElementById('map').classList.toggle('on-terrain', k === 'terrain');
  document.querySelectorAll('.basectl [data-base]').forEach(b => b.classList.toggle('on', b.dataset.base === k));
  const cur = document.querySelector('.basectl .cur');
  if(cur) cur.innerHTML = `Map: <b>${V.BASES[k].label}</b> ${V.BASES[k].online ? '· online ' : ''}▾`;
  if(!fromSettings) AM.store.set('am.base', k);
  V.drawLabels();
};
V.base = () => activeBase;

V.restyle = () => { if(map) V.setBase(activeBase); };

/* ---- labels ----------------------------------------------------------
   Plain positioned text, redrawn on move; only what is in view, biggest first,
   greedy collision test so labels never stack. */
function cityRankFor(z){
  if(z<=3) return -1; if(z===4) return 0; if(z===5) return 1;
  if(z<=6) return 2;  if(z===7) return 3; if(z<=8) return 4; return 5;
}
const MAX_LABELS = 220;
V.drawLabels = () => {
  if(!labelPane) return;
  labelPane.innerHTML = '';
  if(activeBase !== 'offline' && activeBase !== 'terrain') return;   // online tiles carry labels
  const z = map.getZoom(), b = map.getBounds().pad(0.06);
  const boxes = [], drawn = new Set(), frag = document.createDocumentFragment();
  let n = 0;
  function place(text, lat, lon, cls){
    if(n >= MAX_LABELS || drawn.has(text) || !b.contains([lat,lon])) return;
    const p = map.latLngToLayerPoint([lat,lon]);
    const w = text.length * (cls==='lbl-ctry'?8.5:cls==='lbl-state'?7:6.2), h = 14;
    const x = p.x - w/2, y = p.y - h/2;
    for(const q of boxes) if(x < q[2] && x+w > q[0] && y < q[3] && y+h > q[1]) return;
    boxes.push([x,y,x+w,y+h]); drawn.add(text);
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.transform = 'translate(-50%,-50%)';
    el.innerHTML = cls.startsWith('lbl-city') ? '<b></b>' + AM.esc(text) : AM.esc(text);
    frag.appendChild(el); n++;
  }
  if(z <= 6){
    const cap = z <= 3 ? 1e9 : 60;
    B.CLABEL.slice(0, cap).forEach(c => place(c[0], c[1], c[2], 'lbl-ctry'));
  }
  const maxRank = cityRankFor(z);
  if(maxRank >= 0) for(const c of B.CITIES){
    if(c[3] > maxRank) break;
    place(c[0], c[1], c[2], 'lbl-city' + (c[3] <= 1 ? ' major' : ''));
    if(n >= MAX_LABELS) break;
  }
  if(z >= 4 && z <= 7) B.SLABEL.forEach(s => place(s[0], s[1], s[2], 'lbl-state'));
  /* close in, label every locality that holds loaded assets */
  if(z >= 9) for(const pl of places){ place(pl[0], pl[1], pl[2], 'lbl-asset'); if(n >= MAX_LABELS) break; }
  labelPane.appendChild(frag);
};

/* ---- popups ------------------------------------------------------------ */
function popup(r){
  const t = r.typeDef;
  return `<h3>${AM.esc(r.name || r.place || r.id)}</h3><dl>
    <dt>ID</dt><dd>${AM.esc(r.id)}</dd>
    <dt>Type</dt><dd>${AM.esc(t.label)}${t.unknown ? ' <span style="color:var(--p2)">(not in types.csv)</span>' : ''}</dd>
    ${r.tag ? `<dt>Tag</dt><dd>${AM.esc(r.tag)}</dd>` : ''}
    ${r.email ? `<dt>Email</dt><dd>${AM.esc(r.email)}</dd>` : ''}
    <dt>Place</dt><dd>${AM.esc([r.zip, r.city].filter(Boolean).join(' ') || r.place)}</dd>
    ${r.region ? `<dt>Region</dt><dd>${AM.esc(r.region)}</dd>` : ''}
    <dt>Country</dt><dd>${AM.esc(AM.Geo.countryName(r.cc) || r.country)}</dd>
    <dt>Coord</dt><dd>${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</dd>
    <dt>Placed by</dt><dd>${AM.MATCH[r.match]}</dd>
    ${r.dist != null ? `<dt>Distance</dt><dd>${r.dist.toFixed(1)} km to ${AM.esc(r.near ? r.near.name : '')}${r.tier ? ` · ring ${r.tier}` : ''}</dd>` : ''}
  </dl>`;
}
V.popup = popup;

/* ---- typed markers ---------------------------------------------------- */
const iconCache = new Map();
function typedIcon(t, tier, size){
  const halo = tier ? AM.ringColor(tier) : null;
  const k = t.marker + t.color + (halo||'') + size;
  if(!iconCache.has(k)) iconCache.set(k, L.divIcon({className:'am-mk', iconSize:[size,size], iconAnchor:[size/2,size/2],
    html: AM.markerSVG(t.marker, t.color, size, halo)}));
  return iconCache.get(k);
}
function ensureMarker(r){
  if(r.marker) return r.marker;
  r.marker = L.marker([r.lat, r.lon], {icon: typedIcon(r.typeDef, 0, r.cat==='physical'?22:16),
    zIndexOffset: r.cat==='physical' ? 9000 : 0, keyboard:false});
  r.marker.bindPopup(() => popup(r));
  r.marker.on('click', () => onSelect(r));
  return r.marker;
}

/* ---- bubbles -----------------------------------------------------------
   Points projected to pixels at the current zoom and binned into a grid, so
   bubbles resolve as you zoom in. Bubble AREA ∝ headcount. */
const CELL = 56;
V.bubbleRadius = n => Math.min(34, 5.0 + 26*Math.sqrt(n/1000));
function tierFill(t){ const c = t ? AM.ringColor(t) : css('--node'); return {c, fill: `color-mix(in srgb, ${c} 32%, transparent)`}; }

function drawBubbles(){
  bubbleLayer.clearLayers();
  const z = map.getZoom(), cells = new Map();
  rows.forEach(r => {
    if(r.cat !== 'human') return;
    const p = map.project([r.lat, r.lon], z);
    const k = Math.floor(p.x/CELL) + ':' + Math.floor(p.y/CELL);
    let c = cells.get(k);
    if(!c){ c = {x:0, y:0, n:0, rs:[], tier:0}; cells.set(k, c); }
    c.x += p.x; c.y += p.y; c.n++; c.rs.push(r);
    if(r.tier && (c.tier === 0 || r.tier < c.tier)) c.tier = r.tier;
  });
  cells.forEach(c => {
    const ll = map.unproject([c.x/c.n, c.y/c.n], z);
    const rad = V.bubbleRadius(c.n), d = Math.round(rad*2);
    const {c:col, fill} = tierFill(c.tier);
    const fs = c.n >= 100 ? 13 : c.n >= 10 ? 12 : 11;
    const solo = c.n === 1;
    const bg = solo ? (c.tier ? col : c.rs[0].typeDef.color) : fill;
    const html = `<div class="bub${solo?' solo':''}" style="width:${d}px;height:${d}px;--c:${solo && !c.tier ? bg : col};--fill:${bg};font-size:${fs}px">`
               + `${c.n > 1 ? `<span>${c.n}</span>` : ''}</div>`;
    const mk = L.marker(ll, {icon: L.divIcon({className:'', html, iconSize:[d,d], iconAnchor:[d/2,d/2]}), zIndexOffset:c.n, keyboard:false});
    if(solo){ mk.bindPopup(() => popup(c.rs[0])); mk.on('click', () => onSelect(c.rs[0])); }
    else { mk.bindPopup(() => bubblePopup(c)); mk.on('dblclick', () => zoomTo(c.rs)); }
    bubbleLayer.addLayer(mk);
  });
}
function bubblePopup(c){
  const byPlace = {}, byType = {};
  c.rs.forEach(r => { byPlace[r.place] = (byPlace[r.place]||0) + 1; byType[r.typeDef.label] = (byType[r.typeDef.label]||0) + 1; });
  const top = Object.entries(byPlace).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const rest = Object.keys(byPlace).length - top.length;
  const inR = c.rs.filter(r => r.tier).length;
  const near = c.rs.filter(r => r.dist != null).sort((a,b) => a.dist-b.dist)[0];
  return `<h3>${c.n} people</h3><dl>
      <dt>Types</dt><dd>${Object.entries(byType).map(([k,v]) => `${AM.esc(k)} ${v}`).join(' · ')}</dd>
      <dt>Localities</dt><dd>${Object.keys(byPlace).length}</dd>
      ${near ? `<dt>In rings</dt><dd>${inR}</dd><dt>Nearest</dt><dd>${near.dist.toFixed(1)} km to ${AM.esc(near.near.name)}</dd>` : ''}
    </dl>
    <ul>${top.map(([p,n]) => `<li><b>${AM.esc(p)}</b><span>${n}</span></li>`).join('')}
    ${rest > 0 ? `<li><b>+ ${rest} more localities</b><span></span></li>` : ''}</ul>
    <div class="hint">Double-click the bubble to zoom in.</div>`;
}
function zoomTo(rs){
  const b = L.latLngBounds(rs.map(r => [r.lat, r.lon]));
  map.flyToBounds(b.pad(0.35), {maxZoom:13, duration:.5});
}

/* draw the given (filtered, placed) records */
V.render = list => {
  rows = list;
  physLayer.clearLayers(); pointLayer.clearLayers();
  rows.forEach(r => {
    if(r.cat === 'physical'){
      ensureMarker(r).setIcon(typedIcon(r.typeDef, r.tier, 22));
      physLayer.addLayer(r.marker);
    } else if(!bubbleMode){
      ensureMarker(r).setIcon(typedIcon(r.typeDef, r.tier, r.tier ? 18 : 16));
      pointLayer.addLayer(r.marker);
    }
  });
  if(bubbleMode) drawBubbles(); else bubbleLayer.clearLayers();
};

V.setBubbleMode = b => {
  bubbleMode = b;
  if(b){ map.removeLayer(pointLayer); map.addLayer(bubbleLayer); }
  else { map.removeLayer(bubbleLayer); map.addLayer(pointLayer); }
  V.render(rows);
};

V.reset = () => { physLayer.clearLayers(); pointLayer.clearLayers(); bubbleLayer.clearLayers(); iconCache.clear(); };

V.setPlaces = recs => {
  const m = new Map();
  recs.forEach(r => { if(r.lat != null && r.place && !m.has(r.place)) m.set(r.place, [r.place, r.lat, r.lon]); });
  places = [...m.values()];
};

V.fit = recs => {
  const pts = recs.filter(r => r.lat != null).map(r => [r.lat, r.lon]);
  if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), {maxZoom:8});
};
V.flyRegion = k => map.flyToBounds(V.REGION[k], {duration:.6});
V.focus = (r, open) => {
  map.setView([r.lat, r.lon], Math.max(map.getZoom(), 11));
  if(open && r.marker && (r.cat === 'physical' || !bubbleMode)) setTimeout(() => r.marker.openPopup(), 300);
  else if(open) L.popup().setLatLng([r.lat, r.lon]).setContent(popup(r)).openOn(map);
};

/* ---- legend ------------------------------------------------------------ */
let legend, legendTypes = [], legendRings = [];
V.setLegend = (types, rings) => { legendTypes = types; legendRings = rings || legendRings; if(legend) legend._update(); };
function buildLegend(){
  legend = L.control({position:'bottomleft'});
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'legend' + (AM.store.get('am.legendMin', window.innerHeight < 760) ? ' min' : ''));
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    legend._div = d; legend._update(); return d;
  };
  legend._update = () => {
    const d = legend._div; if(!d) return;
    const sc = [1,25,100,500].map(n => { const s = Math.round(V.bubbleRadius(n)*2);
      return `<div><s style="width:${s}px;height:${s}px"></s>${n}</div>`; }).join('');
    const typeRow = t => `<div class="row">${AM.markerSVG(t.marker, t.color, 14)}${AM.esc(t.label)}</div>`;
    const hum = legendTypes.filter(t => t.category === 'human'), phy = legendTypes.filter(t => t.category !== 'human');
    d.innerHTML = `<span class="tog" title="Collapse / expand">${d.classList.contains('min') ? '▸' : '▾'}</span>
      <div class="t">Legend</div><div class="lg-body">
      <div class="t">People per bubble</div><div class="scale">${sc}</div>
      ${hum.length ? `<div class="t">People</div>${hum.map(typeRow).join('')}` : ''}
      ${phy.length ? `<div class="t">Physical</div>${phy.map(typeRow).join('')}` : ''}
      <div class="t">Impact rings</div>
      ${(legendRings.length ? legendRings : [5,25,100]).map((km,i) => `<div><i style="background:${AM.ringColor(i+1)}"></i>Ring ${i+1}${i===0?' — closest':''} · ${km} km</div>`).join('')}
      </div>`;
    d.querySelector('.tog').onclick = () => { d.classList.toggle('min'); AM.store.set('am.legendMin', d.classList.contains('min')); legend._update(); };
  };
  legend.addTo(map);
}

function buildBaseControl(){
  const c = L.control({position:'topright'});
  c.onAdd = () => {
    const d = L.DomUtil.create('div', 'basectl' + (AM.store.get('am.baseOpen', false) ? ' open' : ''));
    L.DomEvent.disableClickPropagation(d);
    let html = '<button class="cur" title="Change map layer"></button><div class="opts">', grp = '';
    for(const [k, b] of Object.entries(V.BASES)){
      if(b.group !== grp){ grp = b.group; html += `<div class="grp">${grp}</div>`; }
      html += `<button data-base="${k}" title="${b.online ? 'Needs internet; Esri sees the viewed area' : 'Works offline'}">${b.label}</button>`;
    }
    d.innerHTML = html + '</div>';
    d.querySelector('.cur').onclick = () => { d.classList.toggle('open'); AM.store.set('am.baseOpen', d.classList.contains('open')); };
    d.querySelectorAll('[data-base]').forEach(b => b.onclick = () => { V.setBase(b.dataset.base); d.classList.remove('open'); AM.store.set('am.baseOpen', false); });
    return d;
  };
  c.addTo(map);
}

V.init = opts => {
  onSelect = opts.onSelect || onSelect;
  map = V.map = L.map('map', {zoomControl:true, preferCanvas:true, maxZoom:19, minZoom:2, worldCopyJump:true}).setView([25, 10], 2);
  map.createPane('basemap'); map.getPane('basemap').style.zIndex = 200;
  const rend = L.canvas({pane:'basemap', padding:0.3});
  const st = vectorStyle();
  vectorWorld  = L.geoJSON(B.WORLD,  {pane:'basemap', renderer:rend, interactive:false, style:st.world});
  vectorStates = L.geoJSON(B.STATES, {pane:'basemap', renderer:rend, interactive:false, style:st.states});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('Boundaries &amp; places: Natural Earth / US Census / GeoNames (offline)');
  map.createPane('labels');
  labelPane = map.getPane('labels'); labelPane.style.zIndex = 450; labelPane.style.pointerEvents = 'none';
  map.on('zoomend moveend viewreset', V.drawLabels);
  bubbleLayer = L.layerGroup().addTo(map);
  pointLayer  = L.layerGroup();
  physLayer   = L.layerGroup().addTo(map);
  map.on('moveend', () => { if(bubbleMode) drawBubbles(); });     // fires after zoom too
  buildLayers(); buildBaseControl(); buildLegend();
  const saved = AM.store.get('am.base', null);
  V.setBase(saved && V.BASES[saved] && !V.BASES[saved].online ? saved : 'offline', !saved);
  return map;
};

})(window.AM);
