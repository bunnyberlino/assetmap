/* Asset Map — reading the data folder. © 2026 Alexander Habath
   A page opened from file:// cannot read neighbouring files by itself, so the
   user picks or drops the folder. Where the File System Access API exists
   (Chrome, Edge) the folder handle is remembered in IndexedDB, so the next
   visit is one click and incidents/settings can be saved straight into it. */
window.AM = window.AM || {};
(function(AM){

const L = AM.Loader = { source: null };
const DB = 'assetmap', STORE = 'handles', KEY = 'dataFolder';

L.canPickFolder = () => typeof window.showDirectoryPicker === 'function';

function idb(){
  return new Promise((res, rej) => {
    let rq;
    try { rq = indexedDB.open(DB, 1); } catch(e){ return rej(e); }
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbDo(mode, fn){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE);
    const rq = fn(st);
    tx.oncomplete = () => res(rq && rq.result);
    tx.onerror = () => rej(tx.error);
  });
}
L.savedHandle = async () => { try { return await idbDo('readonly', s => s.get(KEY)) || null; } catch(e){ return null; } };
L.saveHandle  = async h => { try { await idbDo('readwrite', s => s.put(h, KEY)); } catch(e){} };
L.forgetHandle = async () => { try { await idbDo('readwrite', s => s.delete(KEY)); } catch(e){} };

async function ensurePermission(h, mode='read'){
  if(!h.queryPermission) return true;
  if(await h.queryPermission({mode}) === 'granted') return true;
  try { return await h.requestPermission({mode}) === 'granted'; } catch(e){ return false; }
}

/* collect CSV files from a directory handle; descend into a "data" sub-folder
   if the user picked the app folder itself */
async function filesFromHandle(dir){
  const out = {}; let sub = null;
  for await (const [name, h] of dir.entries()){
    if(h.kind === 'file' && /\.csv$/i.test(name)) out[name] = await h.getFile();
    else if(h.kind === 'directory' && name.toLowerCase() === 'data') sub = h;
  }
  if(!Object.keys(out).length && sub) return {files: await filesFromHandle(sub).then(r=>r.files), dir: sub};
  return {files: out, dir};
}

L.pickFolder = async () => {
  const h = await window.showDirectoryPicker({id:'assetmap-data', mode:'read'});
  return L.useHandle(h);
};
L.useHandle = async h => {
  if(!await ensurePermission(h)) throw new Error('Permission to read the folder was not granted.');
  const {files, dir} = await filesFromHandle(h);
  await L.saveHandle(h);
  L.source = {kind:'dir', name: dir.name, handle: h, dir, files};
  return L.source;
};
L.reopen = async () => {
  const h = await L.savedHandle();
  if(!h) throw new Error('No remembered folder.');
  return L.useHandle(h);
};

/* <input type=file webkitdirectory> or multiple files */
L.fromFileList = list => {
  const files = {};
  let folder = '';
  [...list].forEach(f => {
    if(!/\.csv$/i.test(f.name)) return;
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    if(parts.length > 3) return;                         // ignore deep sub-folders
    if(parts.length === 3 && parts[1].toLowerCase() !== 'data') return;
    folder = folder || (parts.length > 1 ? parts[0] : '');
    files[f.name] = f;
  });
  L.source = {kind:'files', name: folder || `${Object.keys(files).length} files`, files};
  return L.source;
};

/* drag & drop: prefer a real folder handle (Chromium) so it can be remembered */
L.fromDrop = async dt => {
  const items = [...(dt.items || [])];
  if(items.length && items[0].getAsFileSystemHandle){
    const hs = await Promise.all(items.map(i => i.getAsFileSystemHandle()));
    const dir = hs.find(h => h && h.kind === 'directory');
    if(dir) return L.useHandle(dir);
    const files = {};
    for(const h of hs) if(h && h.kind === 'file' && /\.csv$/i.test(h.name)) files[h.name] = await h.getFile();
    L.source = {kind:'files', name: `${Object.keys(files).length} files`, files};
    return L.source;
  }
  if(items.length && items[0].webkitGetAsEntry){
    const entries = items.map(i => i.webkitGetAsEntry()).filter(Boolean);
    const files = {};
    const readFile = e => new Promise(r => e.file(r, () => r(null)));
    const readDir = e => new Promise(r => {
      const rd = e.createReader(), all = [];
      const step = () => rd.readEntries(b => { if(!b.length) return r(all); all.push(...b); step(); }, () => r(all));
      step();
    });
    let name = '';
    for(const e of entries){
      if(e.isFile && /\.csv$/i.test(e.name)){ const f = await readFile(e); if(f) files[f.name] = f; }
      else if(e.isDirectory){
        name = e.name;
        let kids = await readDir(e);
        if(!kids.some(k => k.isFile && /\.csv$/i.test(k.name))){
          const d = kids.find(k => k.isDirectory && k.name.toLowerCase() === 'data');
          if(d) kids = await readDir(d);
        }
        for(const k of kids) if(k.isFile && /\.csv$/i.test(k.name)){ const f = await readFile(k); if(f) files[f.name] = f; }
      }
    }
    L.source = {kind:'files', name: name || `${Object.keys(files).length} files`, files};
    return L.source;
  }
  return L.fromFileList(dt.files || []);
};

/* re-read the same folder (after editing CSVs) */
L.refresh = async () => {
  const s = L.source;
  if(!s) throw new Error('No data loaded.');
  if(s.kind === 'dir') return L.useHandle(s.handle);
  return s;                     // plain file picks are snapshots; caller asks the user to re-pick
};

/* sort files into roles by name */
L.classify = files => {
  const roles = {employees:[], assets:[], types:null, settings:null, incidents:[], other:[]};
  Object.keys(files).sort().forEach(n => {
    const f = n.toLowerCase();
    if(/^types?\b|marker/.test(f)) roles.types = files[n];
    else if(/^settings?\b|config/.test(f)) roles.settings = files[n];
    else if(/incident/.test(f)) roles.incidents.push(files[n]);
    else if(/employee|people|person|staff|resident|human|personnel/.test(f)) roles.employees.push(files[n]);
    else if(/asset|site|office|location|physical|partner|building/.test(f)) roles.assets.push(files[n]);
    else roles.other.push(files[n]);
  });
  return roles;
};

L.readText = async file => AM.decode(await file.arrayBuffer());

/* write a file into the picked folder if allowed; false → caller downloads instead */
L.writeFile = async (name, text) => {
  const s = L.source;
  if(!s || s.kind !== 'dir' || !s.dir.getFileHandle) return false;
  try {
    if(!await ensurePermission(s.handle, 'readwrite')) return false;   // asked only on Save
    const fh = await s.dir.getFileHandle(name, {create:true});
    const w = await fh.createWritable();
    await w.write('﻿' + text); await w.close();
    return true;
  } catch(e){ return false; }
};

})(window.AM);
