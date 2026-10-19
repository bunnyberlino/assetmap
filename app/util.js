/* Asset Map — shared helpers (no DOM, no map). © 2026 Alexander Habath */
window.AM = window.AM || {};
(function(AM){

AM.esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* lowercase, accent-folded, punctuation collapsed — for name matching */
AM.fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/ß/g,'ss').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/* great-circle distance in km */
AM.haversine = (a1,o1,a2,o2) => {
  const R=6371, tr=Math.PI/180;
  const dLat=(a2-a1)*tr, dLon=(o2-o1)*tr;
  const s=Math.sin(dLat/2)**2 + Math.cos(a1*tr)*Math.cos(a2*tr)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
};

/* accepts "47.1202, 8.5808", "47.1202 8.5808", "47.1202N 8.5808E",
   "47,1202; 8,5808" and Google Maps copy-paste with a trailing label */
AM.parseCoords = raw => {
  let s = String(raw ?? '').trim();
  if(/^-?\d+,\d+\s*[;\s]\s*-?\d+,\d+/.test(s)) s = s.replace(/(\d),(\d)/g,'$1.$2');
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?/);
  if(!m) return null;
  let lat = parseFloat(m[1]), lon = parseFloat(m[3]);
  if(m[2] && m[2].toLowerCase()==='s') lat = -Math.abs(lat);
  if(m[4] && m[4].toLowerCase()==='w') lon = -Math.abs(lon);
  if(!isFinite(lat) || !isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  return [lat, lon];
};

/* "5;25;100" / "5, 25, 100" / [5,25,100] → sorted positive numbers */
AM.parseRings = v => {
  const a = Array.isArray(v) ? v : String(v ?? '').split(/[;,/ |]+/);
  return [...new Set(a.map(x=>parseFloat(String(x).replace(',','.')))
    .filter(x=>isFinite(x) && x>0))].sort((x,y)=>x-y);
};

AM.num = v => {
  if(v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
};

/* localStorage that never throws (private mode, blocked storage, previews) */
AM.store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

AM.download = (name, text, type='text/csv;charset=utf-8') => {
  const blob = new Blob(['﻿'+text], {type});      // BOM so Excel opens UTF-8 correctly
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
};

AM.slug = s => AM.fold(s).replace(/ /g,'-').slice(0,40) || 'incident';

AM.today = () => new Date().toISOString().slice(0,10);

})(window.AM);
