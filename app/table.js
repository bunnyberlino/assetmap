/* Asset Map — filters, roster table and KPIs. © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

const T = AM.Table = {};
const $ = id => document.getElementById(id);
const MAX_ROWS = 800;
let recs = [], sortKey = 'id', sortDir = 1, selected = null, onSelect = () => {};

T.setRecords = list => {
  recs = list;
  fillSelect('f-cc', 'All countries', count(recs, r => r.cc), k => AM.Geo.countryName(k) || k);
  fillSelect('f-type', 'All types', count(recs, r => r.typeDef.label), k => k);
  fillSelect('f-tag', 'All tags', count(recs, r => r.tag), k => k);
};

function count(list, fn){
  const m = new Map();
  list.forEach(r => { const k = fn(r); if(k) m.set(k, (m.get(k)||0) + 1); });
  return m;
}
function fillSelect(id, all, counts, label){
  const sel = $(id), cur = sel.value;
  const keys = [...counts.keys()].sort((a,b) => String(label(a)).localeCompare(String(label(b))));
  sel.innerHTML = `<option value="">${all}</option>` + keys.map(k =>
    `<option value="${AM.esc(k)}">${AM.esc(label(k))} (${counts.get(k)})</option>`).join('');
  if(keys.includes(cur)) sel.value = cur;
}

T.visible = () => {
  const q = AM.fold($('q').value), cat = $('f-cat').value, cc = $('f-cc').value,
        type = $('f-type').value, tag = $('f-tag').value, ring = $('f-ring').checked;
  return recs.filter(r => {
    if(r.lat == null) return false;
    if(cat && r.cat !== cat) return false;
    if(cc && r.cc !== cc) return false;
    if(type && r.typeDef.label !== type) return false;
    if(tag && r.tag !== tag) return false;
    if(ring && !r.tier) return false;
    if(q && !(r._q || (r._q = AM.fold([r.id, r.name, r.tag, r.city, r.zip, r.email, r.region, r.typeDef.label].join(' ')))).includes(q)) return false;
    return true;
  });
};

const label = r => r.name || r.place || '';
function sortRows(rows){
  const dir = sortDir;
  rows.sort((a, b) => {
    let x, y;
    if(sortKey === 'dist'){ x = a.dist ?? 1e9; y = b.dist ?? 1e9; }
    else if(sortKey === 'near'){ x = a.near ? a.near.name : '~'; y = b.near ? b.near.name : '~'; }
    else if(sortKey === 'label'){ x = label(a).toLowerCase(); y = label(b).toLowerCase(); }
    else if(sortKey === 'id'){
      if(a.cat !== b.cat) return a.cat === 'physical' ? -1 : 1;
      const na = +a.id, nb = +b.id;
      if(isFinite(na) && isFinite(nb)){ x = na; y = nb; } else { x = a.id.toLowerCase(); y = b.id.toLowerCase(); }
    }
    else { x = String(a[sortKey] || '').toLowerCase(); y = String(b[sortKey] || '').toLowerCase(); }
    return x < y ? -dir : x > y ? dir : 0;
  });
  return rows;
}

T.render = (rows, hasIncident) => {
  sortRows(rows);
  document.querySelectorAll('thead th .ar').forEach(s => s.textContent = '');
  const th = document.querySelector(`thead th[data-k="${sortKey}"] .ar`);
  if(th) th.textContent = sortDir > 0 ? '▲' : '▼';

  const tb = $('tb');
  tb.innerHTML = rows.slice(0, MAX_ROWS).map(r => `
    <tr data-k="${AM.esc(r.key)}" class="${r.cat === 'physical' ? 'phys ' : ''}${selected === r.key ? 'sel' : ''}">
      <td class="id"><i style="background:${r.typeDef.color}"></i>${AM.esc(r.id)}</td>
      <td${r.tier ? ` class="t${Math.min(r.tier,3)}"` : ''} title="${AM.esc(r.typeDef.label + ' · ' + (r.place || ''))}">${AM.esc(label(r))}</td>
      <td class="cc">${AM.esc(r.cc)}</td>
      <td class="cc">${r.near && r.tier ? AM.esc(r.near.name) : ''}</td>
      <td class="d">${r.dist != null ? r.dist.toFixed(1) : '—'}</td>
    </tr>`).join('');
  const byKey = new Map(rows.map(r => [r.key, r]));
  tb.querySelectorAll('tr').forEach(tr => tr.onclick = () => { const r = byKey.get(tr.dataset.k); T.select(r.key); onSelect(r); });

  const emp = $('empty');
  if(!recs.length){ emp.hidden = false; emp.textContent = 'No data loaded yet.'; }
  else if(!rows.length){ emp.hidden = false; emp.textContent = $('f-ring').checked
      ? 'Nothing inside the current rings. Widen the radii or move the markers.'
      : 'No records match the current filter.'; }
  else if(rows.length > MAX_ROWS){ emp.hidden = false;
    emp.textContent = `Showing ${MAX_ROWS} of ${rows.length} rows. Narrow the filter, or use Export affected for the full list.`; }
  else emp.hidden = true;

  const people = recs.filter(r => r.cat === 'human' && r.lat != null);
  const phys = recs.filter(r => r.cat === 'physical' && r.lat != null);
  $('k-shown').textContent = rows.length;
  $('k-ring').textContent  = hasIncident ? people.filter(r => r.tier > 0).length : '—';
  $('k-inner').textContent = hasIncident ? people.filter(r => r.tier === 1).length : '—';
  $('k-site').textContent  = hasIncident ? phys.filter(r => r.tier > 0).length : '—';
};

T.select = key => {
  selected = key;
  document.querySelectorAll('#tb tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.k === key));
  const tr = document.querySelector(`#tb tr[data-k="${CSS.escape(key)}"]`);
  if(tr) tr.scrollIntoView({block:'nearest'});
};

T.clear = () => {
  $('q').value = ''; ['f-cat','f-cc','f-type','f-tag'].forEach(id => $(id).value = ''); $('f-ring').checked = false;
};

T.init = opts => {
  onSelect = opts.onSelect || onSelect;
  const rerender = opts.onFilter;
  document.querySelectorAll('thead th').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if(sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'dist' ? 1 : 1; }
    rerender();
  });
  $('q').addEventListener('input', rerender);
  ['f-cat','f-cc','f-type','f-tag','f-ring'].forEach(id => $(id).addEventListener('change', rerender));
  $('btn-filter-clear').onclick = () => { T.clear(); rerender(); };
};

})(window.AM);
