/* Minimal zero-dependency test harness (works from file://). */
window.T = (function(){
  const tests = [];
  let group = '';
  const fmt = v => { try { return JSON.stringify(v); } catch(e){ return String(v); } };
  const api = {
    group(g){ group = g; },
    test(name, fn){ tests.push({group, name, fn}); },
    eq(a, b, msg){ if(fmt(a) !== fmt(b)) throw new Error((msg ? msg + ': ' : '') + `expected ${fmt(b)}, got ${fmt(a)}`); },
    ok(v, msg){ if(!v) throw new Error(msg || 'expected truthy, got ' + fmt(v)); },
    near(a, b, tol, msg){ if(!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ': ' : '') + `expected ${b} ±${tol}, got ${a}`); },
    async run(){
      const out = document.getElementById('out');
      let pass = 0, fail = 0, last = null;
      for(const t of tests){
        if(t.group !== last){ out.insertAdjacentHTML('beforeend', `<div class="grp">${t.group}</div>`); last = t.group; }
        try { await t.fn(); pass++; out.insertAdjacentHTML('beforeend', `<div class="pass">✓ ${t.name}</div>`); }
        catch(e){ fail++; out.insertAdjacentHTML('beforeend', `<div class="fail">✗ ${t.name}</div><pre>${String(e && e.message || e).replace(/</g,'&lt;')}</pre>`); }
      }
      const s = document.getElementById('sum');
      s.className = fail ? 'fail' : 'pass';
      s.textContent = `${pass} passed, ${fail} failed`;
      window.TEST_RESULT = {pass, fail};
      document.title = (fail ? '✗ ' : '✓ ') + 'Asset Map Tests';
    }
  };
  return api;
})();
