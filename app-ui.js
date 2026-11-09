'use strict';
// UI: tabs, tables, forms. All math lives in app-core.js (window.FAH).
(function () {
  const F = window.FAH, st = F.st, esc = F.esc, money = F.money;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const S = () => st.S;

  let currentTab = st.S.tab || 'best';
  const mounted = {};
  const expanded = new Set();
  const logLines = [];
  let deScanResults = null;

  // ---------------------------------------------------------------- helpers
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 4000);
  }
  F.onError = msg => toast(msg, 'bad');
  function log(msg) {
    logLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logLines.length > 300) logLines.shift();
    const el = $('#syncLog');
    if (el) { el.textContent = logLines.join('\n'); el.scrollTop = el.scrollHeight; }
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function setS(k, v) { st.S[k] = v; F.saveSettings(); }
  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function pickFile(accept) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept;
      inp.onchange = () => resolve(inp.files[0] || null);
      inp.click();
    });
  }
  const pct = v => (v == null || !isFinite(v) ? '<span class="muted">—</span>' : `${(v * 100).toFixed(v > -0.1 && v < 0.1 ? 1 : 0)}%`);
  const num = v => (v == null ? '<span class="muted">—</span>' : Number(v).toLocaleString());
  const profitCell = v => `<td class="num ${v > 0 ? 'pos' : ''}">${money(v)}</td>`;
  const rateText = r => (r == null ? '<span class="muted" title="Not enough price updates yet. Estimates need about 6 hours of hourly updates while the app is open.">—</span>' : `${r.rate < 10 ? r.rate.toFixed(1) : Math.round(r.rate).toLocaleString()}${r.manual ? '' : ' <span class="dim" title="Estimated from listings that disappeared between price updates">≈</span>'}`);
  const LIMIT_TEXT = { budget: 'your budget', supply: 'what is listed on the AH', cooldown: 'the cooldown', cap: 'your max crafts' };

  function badges(r) {
    let h = '';
    if (r.n > 1) h += `<span class="badge">×${r.n}</span>`;
    if (r.src && r.src !== 'T' && r.src !== 'C') h += `<span class="badge pat" title="${esc(F.SRC_LABEL[r.src] || r.src)}">pattern</span>`;
    if (r.cd) h += `<span class="badge cd" title="Cooldown">CD ${r.cd >= 48 ? r.cd / 24 + 'd' : r.cd + 'h'}</span>`;
    if (r.u) h += '<span class="badge u" title="Reagent counts are from memory and not double-checked. Compare with the in-game tooltip and fix with Edit if needed.">unverified</span>';
    if (r.custom) h += '<span class="badge custom">custom</span>';
    else if (r.edited) h += '<span class="badge custom">edited</span>';
    if (r.note) h += `<span class="badge note" title="${esc(r.note)}">i</span>`;
    return h;
  }
  function recipeLabel(r) {
    if (!r.product) return `<span class="item q1">${F.iconImg(r.icon || F.PROF_ICON[r.prof])}${esc(r.name)}</span>`;
    if (r.product.toLowerCase() !== r.name.toLowerCase()) return `${esc(r.name)} <span class="dim">→</span> ${F.itemLink(r.product)}`;
    return F.itemLink(r.product);
  }
  function syncControl(k) {
    $$(`[data-set="${k}"]`).forEach(el => {
      if (el === document.activeElement) return;
      if (el.type === 'checkbox') el.checked = !!st.S[k]; else el.value = st.S[k] == null ? '' : st.S[k];
    });
  }
  function bindSettings(root) {
    $$('[data-set]', root).forEach(el => {
      const k = el.dataset.set;
      if (el.type === 'checkbox') el.checked = !!st.S[k]; else el.value = st.S[k] == null ? '' : st.S[k];
      const instant = el.type === 'checkbox' || el.tagName === 'SELECT';
      el.addEventListener(instant ? 'change' : 'input', debounce(() => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number') v = el.value === '' ? '' : +el.value;
        setS(k, v);
        syncControl(k);
        refresh();
      }, instant ? 0 : 250));
    });
  }
  function fillDatalists() {
    const items = [...F.items().keys()].sort();
    $('#itemNames').innerHTML = items.map(n => `<option value="${esc(n)}">`).join('');
    $('#recipeNames').innerHTML = F.recipes().map(r => `<option value="${esc(recipeKeyLabel(r))}">`).join('');
  }
  const recipeKeyLabel = r => `${r.name} (${r.prof})`;
  function recipeFromLabel(label) {
    const l = String(label || '').trim().toLowerCase();
    return F.recipes().find(r => recipeKeyLabel(r).toLowerCase() === l) || F.recipes().find(r => r.name.toLowerCase() === l) || null;
  }

  // ---------------------------------------------------------------- header & tabs
  function renderHeader(busyText) {
    const ah = st.ah, el = $('#ahStatus');
    let h;
    const age = ah ? (ah.dataTs || ah.ts) : 0;
    const fresh = ah && Date.now() - age < 7200000;
    if (!ah) h = '<i class="dot"></i>No auction data yet. <a href="#" data-goto="settings">Connect the Blizzard API</a> or <a href="#" data-goto="prices">import prices</a>.';
    else h = `<i class="dot ${fresh ? 'ok' : 'old'}"></i><b>${esc(ah.label)}</b> · <span title="When Blizzard took this copy of the auction house. The game is live, so prices can have moved since.">${ah.dataTs ? 'Blizzard data from ' : ''}${F.timeAgo(age)}</span> · ${ah.count.toLocaleString()} ${ah.books ? 'auctions' : 'prices'} <span class="dim">(${esc(ah.source)})</span>`;
    if (busyText || F.syncing) h += ` · <span class="warn">${esc(busyText || 'updating…')}</span>`;
    el.innerHTML = h;
    const b = $('#budgetInput');
    if (document.activeElement !== b) b.value = F.moneyText(st.S.budget);
  }
  function showTab(name) {
    currentTab = name;
    setS('tab', name);
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('main .tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + name));
    if (!mounted[name]) { MOUNTERS[name](); mounted[name] = true; }
    refresh();
  }
  function refresh() {
    renderHeader();
    const fn = UPDATERS[currentTab];
    if (fn) fn();
  }

  // ---------------------------------------------------------------- Best crafts
  function mountBest() {
    const root = $('#tab-best');
    root.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Your professions</h2>
          <span class="muted small">Enter your current skill (0 = you don't have it). Only recipes you can make are ranked.</span></div>
        <div class="profs">${F.PROFS.map(p => `<label class="prof" data-profbox="${esc(p)}">${F.iconImg(F.PROF_ICON[p])}<span class="profname">${esc(p)}<i class="skillbar"><b></b></i></span><input type="number" min="0" max="300" data-prof="${esc(p)}" placeholder="0"></label>`).join('')}</div>
        <div class="row" style="margin-top:12px">
          <label class="chk"><input type="checkbox" data-set="ignoreSkill"> Show all recipes (ignore skill)</label>
          <label class="chk"><input type="checkbox" data-set="includePatterns"> Assume I have the patterns</label>
          <label class="chk"><input type="checkbox" data-set="craftIntermediates"> Craft intermediates when cheaper</label>
          <label class="chk" title="Walks the real auction listings, so buying 200 cloth costs what 200 cloth actually costs"><input type="checkbox" data-set="depth"> Use real AH listings for budget math</label>
        </div>
      </div>
      <div class="card tight">
        <div class="row">
          <select data-set="profFilter"><option value="">All professions</option>${F.PROFS.map(p => `<option>${esc(p)}</option>`).join('')}</select>
          <input data-set="search" placeholder="Search recipe or item…" style="width:200px">
          <select data-set="groupMode">
            <option value="none">Ranked list</option>
            <option value="prof">Top N per profession</option>
            <option value="bracket">Best by skill bracket</option>
          </select>
          <label class="row" style="gap:6px">Top <input type="number" data-set="topN" min="1" max="100" style="width:60px"></label>
          <select data-set="sortKey">
            <option value="profit">Sort: profit per craft</option>
            <option value="budgetProfit">Sort: profit with my budget</option>
            <option value="margin">Sort: margin %</option>
            <option value="cost">Sort: cost per craft</option>
            <option value="skill">Sort: required skill</option>
            <option value="rate">Sort: sold per day</option>
          </select>
          <input data-set="minProfit" placeholder="Min profit, e.g. 50s" style="width:150px">
          <label class="row" style="gap:6px" title="Limits crafts to what should sell in this many days, where a sale rate is known. Leave empty for no limit.">Sell within <input type="number" data-set="sellDays" min="0" style="width:64px"> days</label>
          <label class="chk"><input type="checkbox" data-set="hideNoProduct"> Hide enchants (no item)</label>
          <label class="chk"><input type="checkbox" data-set="hideIncomplete"> Hide missing prices</label>
        </div>
      </div>
      <div id="bestBanner"></div>
      <div id="bestHero"></div>
      <div id="bestOut"></div>`;
    bindSettings(root);
    $$('[data-prof]', root).forEach(inp => {
      const p = inp.dataset.prof;
      inp.value = st.skills[p] || '';
      inp.addEventListener('input', debounce(() => {
        const v = Math.max(0, Math.min(300, Math.round(+inp.value || 0)));
        if (v) st.skills[p] = v; else delete st.skills[p];
        F.save('skills', st.skills);
        markProfs();
        refresh();
      }, 250));
    });
    markProfs();
    root.addEventListener('click', e => {
      const sortTh = e.target.closest('th[data-sort]');
      if (sortTh) {
        const k = sortTh.dataset.sort;
        if (st.S.sortKey === k) setS('sortDir', -(st.S.sortDir || -1));
        else { setS('sortKey', k); setS('sortDir', k === 'name' || k === 'skill' || k === 'cost' ? 1 : -1); }
        syncControl('sortKey');
        return updateBest();
      }
      const plan = e.target.closest('[data-plan]');
      if (plan) { setS('plannerRecipe', plan.dataset.plan); return showTab('planner'); }
      const edit = e.target.closest('[data-edit]');
      if (edit) return openRecipeEditor(edit.dataset.edit);
      const knownBox = e.target.closest('[data-known]');
      if (knownBox) return;
      const goto = e.target.closest('[data-goto]');
      if (goto) { e.preventDefault(); return showTab(goto.dataset.goto); }
      if (e.target.closest('a,button,input,select,label')) return;
      const tr = e.target.closest('tr[data-key]');
      if (tr) {
        const k = tr.dataset.key;
        if (expanded.has(k)) expanded.delete(k); else expanded.add(k);
        updateBest();
      }
    });
    root.addEventListener('change', e => {
      const kb = e.target.closest('[data-known]');
      if (kb) { st.known[kb.dataset.known] = kb.checked; F.save('known', st.known); refresh(); }
    });
  }
  function markProfs() {
    $$('[data-profbox]').forEach(el => {
      const sk = +st.skills[el.dataset.profbox] || 0;
      el.classList.toggle('on', sk > 0);
      el.style.setProperty('--skill', Math.min(100, sk / 3) + '%');
    });
  }
  const SORTS = {
    profit: e => e.profit, budgetProfit: e => e.budgetProfit, margin: e => e.margin, cost: e => e.cost,
    skill: e => e.r.skill, name: e => e.r.name.toLowerCase(), supply: e => e.supply, rate: e => (e.rate ? e.rate.rate : null)
  };
  function sortEvs(list) {
    const f = SORTS[st.S.sortKey] || SORTS.profit, d = st.S.sortDir || -1;
    return list.sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * d;
    });
  }
  function evaluateList(filterFn, ctx) {
    const s = st.S;
    return F.recipes().filter(filterFn).map(r => {
      const ev = F.evaluate(r, ctx);
      ev.locked = !F.canCraft(r);
      ev.rate = r.product ? F.saleRate(r.product) : null;
      if (ev.cost != null && ev.revenue != null) {
        const mc = F.maxCrafts(ev, s.budget, s.depth);
        ev.mc = mc;
        const days = +s.sellDays;
        if (days > 0 && ev.rate && ev.exit && ev.exit.startsWith('AH') && mc.nBest != null) {
          const cap = Math.floor(ev.rate.rate * days / r.n);
          if (cap < mc.nBest) {
            mc.nBest = cap;
            mc.costBest = s.depth && F.hasBooks() ? F.costForCrafts(r, cap, true).cost : cap * ev.cost;
            mc.capped = true;
          }
        }
        ev.budgetProfit = mc.nBest != null && mc.costBest != null ? mc.nBest * ev.revenue - mc.costBest : null;
      } else if (ev.cost != null) ev.mc = F.maxCrafts(ev, s.budget, s.depth);
      return ev;
    });
  }
  function updateBest() {
    const s = st.S, ctx = F.newCtx();
    const q = (s.search || '').trim().toLowerCase();
    const minP = s.minProfit ? F.parseMoney(s.minProfit) : null;
    const bracket = s.groupMode === 'bracket';
    let evs = evaluateList(r => {
      if (s.profFilter && r.prof !== s.profFilter) return false;
      if (s.hideNoProduct && !r.product) return false;
      if (q && !(r.name.toLowerCase().includes(q) || (r.product || '').toLowerCase().includes(q) || r.reagents.some(g => g.name.toLowerCase().includes(q)))) return false;
      if (!bracket && !F.canCraft(r)) return false;
      return true;
    }, ctx);
    if (s.hideIncomplete) evs = evs.filter(e => e.profit != null || (!e.r.product && e.cost != null));
    if (minP != null) evs = evs.filter(e => e.profit != null && e.profit >= minP);
    sortEvs(evs);

    const hasSkill = F.PROFS.some(p => (+st.skills[p] || 0) > 0);
    let banner = '';
    if (!st.ah && !Object.keys(st.manual).length) {
      banner += `<div class="banner"><b>No prices yet.</b> Pick one: <a href="#" data-goto="settings">connect the Blizzard API</a> for automatic hourly prices,
        <a href="#" data-goto="prices">import an Auctionator scan</a>, or type prices on the <a href="#" data-goto="prices">Prices</a> tab.
        Vendor-sold reagents (thread, vials, dyes…) already have prices.</div>`;
    }
    if (!hasSkill && !s.ignoreSkill && !bracket) banner += '<div class="banner info">Enter your profession skill levels above, or tick <b>Show all recipes</b>, to see what you can craft.</div>';
    $('#bestBanner').innerHTML = banner;
    const picks = s.groupMode === 'none' ? evs.filter(e => e.profit > 0 && e.r.product).slice(0, 3) : [];
    $('#bestHero').innerHTML = picks.length ? `<div class="heroes">${picks.map((e, i) => {
      const q = F.info(F.item(e.r.product)).q;
      return `<div class="hero" role="button" tabindex="0" data-plan="${esc(e.r.key)}" title="Open in budget planner">
        <span class="rank">${i + 1}</span>
        <span class="item q${q == null ? 1 : q}">${F.iconImg(F.item(e.r.product).icon)}</span>
        <span class="heromain"><b class="q${q == null ? 1 : q}">${esc(e.r.name)}</b><small>${esc(e.r.prof)} ${e.r.skill} · sells via ${esc(e.exit)}</small></span>
        <span class="heroval pos">${money(e.profit)}<small>per craft</small></span></div>`;
    }).join('')}</div>` : '';

    const head = `<thead><tr>
      ${th('name', 'Recipe')}<th>Profession</th>${th('skill', 'Skill', 'num')}${th('cost', 'Cost / craft', 'num')}
      <th class="num">Sells for</th>${th('profit', 'Profit / craft', 'num')}${th('margin', 'Margin', 'num')}
      ${th('supply', 'On AH', 'num', 'Units of the product currently listed')}
      ${th('rate', 'Sold / day', 'num', 'Estimated units sold per day, or your own figure from the Prices tab')}
      ${th('budgetProfit', 'Crafts w/ budget', 'num')}${th('budgetProfit', 'Profit w/ budget', 'num')}<th></th></tr></thead>`;
    let body = '';
    const N = Math.max(1, +s.topN || 5);
    if (s.groupMode === 'prof') {
      for (const p of F.PROFS) {
        const g = evs.filter(e => e.r.prof === p);
        if (!g.length) continue;
        body += `<tr class="grouphead"><td colspan="12">${esc(p)} <span class="muted small">skill ${+st.skills[p] || 0}</span></td></tr>`;
        body += g.slice(0, N).map(rowBest).join('');
      }
    } else if (bracket) {
      const profs = s.profFilter ? [s.profFilter] : F.PROFS.filter(p => (+st.skills[p] || 0) > 0);
      if (!profs.length) body += '<tr><td colspan="12" class="muted">Pick a profession in the filter (or enter a skill level) to see its brackets.</td></tr>';
      for (const p of profs) {
        const cur = +st.skills[p] || 0;
        body += `<tr class="grouphead"><td colspan="12">${esc(p)} <span class="muted small">your skill: ${cur} · recipes unlocked in each 25-point bracket, best first</span></td></tr>`;
        for (let b = 0; b <= 300; b += 25) {
          const g = evs.filter(e => e.r.prof === p && Math.min(300, Math.floor(e.r.skill / 25) * 25) === b);
          if (!g.length) continue;
          body += `<tr class="grouphead"><td colspan="12" style="font-family:inherit;font-weight:500;color:var(--muted)">Skill ${b === 300 ? '300' : b + '–' + (b + 24)}${cur >= b ? '' : ' 🔒'}</td></tr>`;
          body += g.slice(0, N).map(rowBest).join('');
        }
      }
    } else {
      body = evs.slice(0, 600).map(rowBest).join('');
      if (!evs.length) body = '<tr><td colspan="12" class="muted">Nothing matches. Check your skill levels and filters.</td></tr>';
    }
    $('#bestOut').innerHTML = `<div class="tablewrap"><table>${head}<tbody>${body}</tbody></table></div>
      <p class="muted small">Click a row for the reagent breakdown. Profit = best of AH sale (after ${s.ahCut}% cut), disenchant value, or vendor, minus the cheapest way to get each reagent. Auction deposits are ignored.</p>`;
  }
  function th(key, label, cls = '', title = '') {
    const sorted = st.S.sortKey === key;
    const arrow = sorted ? (st.S.sortDir > 0 ? ' ▲' : ' ▼') : '';
    return `<th class="sort ${cls} ${sorted ? 'sorted' : ''}" data-sort="${key}"${title ? ` title="${esc(title)}"` : ''}>${label}${arrow}</th>`;
  }
  function rowBest(ev) {
    const r = ev.r, open = expanded.has(r.key);
    const cur = +st.skills[r.prof] || 0;
    let cost;
    if (ev.cost != null) cost = money(ev.cost);
    else cost = `<span class="warn" title="No price for: ${esc(ev.missing.join(', '))}">missing price</span>`;
    let sells = '<span class="muted">—</span>';
    if (!r.product) sells = '<span class="muted small">enchant service</span>';
    else if (ev.revenue != null) sells = `${money(ev.revenue)}<div class="src">${esc(ev.exit)}</div>`;
    else sells = '<span class="warn small">no price</span>';
    const mc = ev.mc;
    let crafts = '<span class="muted">—</span>';
    if (mc && mc.n != null) {
      const shown = mc.nBest != null ? mc.nBest : mc.n;
      const tip = mc.capped ? `You can afford ${mc.n.toLocaleString()}, but only about ${shown.toLocaleString()} should sell within ${st.S.sellDays} days.` : shown < mc.n
        ? `You can afford ${mc.n.toLocaleString()}, but past ${shown.toLocaleString()} each extra craft costs more than it sells for (cheap listings run out).`
        : `Limited by ${LIMIT_TEXT[mc.limit] || mc.limit}`;
      const mark = shown < mc.n ? ' <span class="dim">↘</span>' : mc.limit === 'supply' ? ' <span class="warn">⚑</span>' : mc.limit === 'cooldown' ? ' <span class="dim">⏱</span>' : '';
      crafts = `<span title="${esc(tip)}">${shown.toLocaleString()}${mark}</span>`;
    }
    const lock = ev.locked ? ` <span class="warn small" title="Your ${esc(r.prof)} skill is ${cur}">🔒 ${r.skill}</span>` : '';
    let h = `<tr class="clickable${ev.locked ? ' locked' : ''}" data-key="${esc(r.key)}">
      <td>${open ? '▾' : '▸'} ${recipeLabel(r)}${badges(r)}${lock}</td>
      <td class="muted">${esc(r.prof)}</td><td class="num">${r.skill}</td><td class="num">${cost}</td>
      <td class="num">${sells}</td>${profitCell(ev.profit)}<td class="num">${ev.margin == null ? pct(null) : `<span class="pill ${ev.margin > 0 ? 'up' : 'down'}">${pct(ev.margin)}</span>`}</td>
      <td class="num">${num(ev.supply)}</td><td class="num">${r.product ? rateText(ev.rate) : ''}</td><td class="num">${crafts}</td>${profitCell(ev.budgetProfit)}
      <td><button class="btn sm" data-plan="${esc(r.key)}" title="Open in budget planner">Plan</button></td></tr>`;
    if (open) h += `<tr class="detail"><td colspan="12">${detailHtml(ev)}</td></tr>`;
    return h;
  }
  function detailHtml(ev) {
    const r = ev.r, s = st.S;
    const parts = ev.parts.map(p => {
      const via = p.src === 'Craft' && p.rec ? `craft (${esc(p.rec.prof)} ${p.rec.skill})` : esc(p.src);
      return `<tr><td class="num">${p.qty}×</td><td>${F.itemLink(p.name)}</td><td class="num">${money(p.price)}</td><td class="src">${via}</td><td class="num">${money(p.price == null ? null : p.price * p.qty)}</td></tr>`;
    }).join('');
    let exits = '';
    if (r.product) {
      const o = ev.out, n = r.n;
      exits += `<tr><td>Auction house${o.ahSrc !== 'AH' ? ' <span class="dim">(manual price)</span>' : ''}</td><td class="num">${money(o.ah == null ? null : o.ah * n)}</td><td class="src">after ${s.ahCut}% cut</td></tr>`;
      if (o.de) {
        const outs = o.de.outs.map(([p, m, a, b]) => `${Math.round(p * 1000) / 10}% ${a === b ? a : a + '–' + b}× ${esc(m)}`).join(', ');
        const why = o.deOk ? '' : ` <span class="warn">needs Enchanting ${o.de.req}</span>`;
        exits += `<tr><td>Disenchant${why}</td><td class="num">${money(o.de.ev == null ? null : o.de.ev * n)}</td><td class="src">${outs}${o.de.missing.length ? ' · <span class="warn">missing price: ' + esc(o.de.missing.join(', ')) + '</span>' : ''}${o.de.api ? '' : ' · item level/quality estimated'}</td></tr>`;
      }
      exits += `<tr><td>Vendor</td><td class="num">${money(o.vendor ? o.vendor * n : null)}</td><td class="src">${o.vendor ? '' : 'unknown until item info is loaded'}</td></tr>`;
    }
    const isPattern = r.src !== 'T' && r.src !== 'C';
    const knownChecked = st.known[r.key] === true || (st.known[r.key] !== false && (!isPattern || s.includePatterns));
    return `<div class="grid2">
      <div><h3 style="margin-top:0">Reagents per craft</h3><div class="tablewrap"><table><tbody>${parts}</tbody>
        <tfoot><tr><td></td><td><b>Total</b></td><td></td><td></td><td class="num"><b>${money(ev.cost)}</b></td></tr></tfoot></table></div></div>
      <div><h3 style="margin-top:0">Ways to sell ${r.n > 1 ? `(${r.n} made per craft)` : ''}</h3>
        ${r.product ? `<div class="tablewrap"><table><tbody>${exits}</tbody></table></div>` : '<p class="muted">Enchants do not create an item; use the material cost to price your service.</p>'}
        <div class="row" style="margin-top:10px">
          <label class="chk"><input type="checkbox" data-known="${esc(r.key)}" ${knownChecked ? 'checked' : ''}> I can craft this</label>
          <span class="muted small">${esc(F.SRC_LABEL[r.src] || r.src)}${r.note ? ' · ' + esc(r.note) : ''}</span>
          <span class="spacer"></span>
          <button class="btn sm" data-edit="${esc(r.key)}">Edit recipe</button>
          <button class="btn sm primary" data-plan="${esc(r.key)}">Open in planner</button>
        </div></div></div>`;
  }

  // ---------------------------------------------------------------- Budget planner
  function mountPlanner() {
    const root = $('#tab-planner');
    root.innerHTML = `
      <div class="card">
        <h2>How many can I craft with my money?</h2>
        <div class="row">
          <div class="field" style="flex:2;min-width:260px">Recipe<input id="plRecipe" list="recipeNames" placeholder="Start typing, e.g. Runecloth Bag"></div>
          <div class="field">Budget<input id="plBudget" style="width:140px"></div>
          <div class="field">Max crafts (optional)<input id="plCap" placeholder="no limit" style="width:120px"></div>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="chk"><input type="checkbox" data-set="depth"> Use real AH listings (prices climb as you buy)</label>
          <label class="chk"><input type="checkbox" data-set="craftIntermediates"> Craft intermediates when cheaper</label>
        </div>
      </div>
      <div id="plOut"></div>`;
    bindSettings(root);
    const rec = F.recipeByKey(st.S.plannerRecipe);
    $('#plRecipe').value = rec ? recipeKeyLabel(rec) : '';
    $('#plCap').value = st.S.plannerCap || '';
    $('#plRecipe').addEventListener('input', debounce(() => {
      const r = recipeFromLabel($('#plRecipe').value);
      if (r) { setS('plannerRecipe', r.key); updatePlanner(); }
    }, 200));
    $('#plBudget').addEventListener('input', debounce(() => {
      const v = F.parseMoney($('#plBudget').value);
      if (v != null && v >= 0) { setS('budget', v); renderHeader(); updatePlanner(); }
    }, 300));
    $('#plCap').addEventListener('input', debounce(() => { setS('plannerCap', $('#plCap').value.trim()); updatePlanner(); }, 300));
    root.addEventListener('click', e => {
      const plan = e.target.closest('[data-plan]');
      if (plan) {
        setS('plannerRecipe', plan.dataset.plan);
        const r = F.recipeByKey(plan.dataset.plan);
        $('#plRecipe').value = r ? recipeKeyLabel(r) : '';
        updatePlanner();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      const goto = e.target.closest('[data-goto]');
      if (goto) { e.preventDefault(); showTab(goto.dataset.goto); }
      const sc = e.target.closest('[data-setcap]');
      if (sc) { setS('plannerCap', sc.dataset.setcap); $('#plCap').value = sc.dataset.setcap; updatePlanner(); }
    });
  }
  function updatePlanner() {
    const s = st.S, out = $('#plOut');
    const pb = $('#plBudget');
    if (document.activeElement !== pb) pb.value = F.moneyText(s.budget);
    const r = F.recipeByKey(s.plannerRecipe);
    const ctx = F.newCtx();
    let html = '';
    if (r) {
      const ev = F.evaluate(r, ctx);
      const depth = s.depth && F.hasBooks();
      if (ev.cost == null) {
        html += `<div class="banner">Can't plan <b>${esc(r.name)}</b> yet: no price for ${ev.missing.map(m => F.itemLink(m)).join(', ')}. Add prices on the <a href="#" data-goto="prices">Prices</a> tab or sync the AH.</div>`;
      } else {
        const mc = F.maxCrafts(ev, s.budget, s.depth);
        let n = mc.n, limit = mc.limit;
        const cap = parseInt(s.plannerCap, 10);
        if (cap > 0 && n > cap) { n = cap; limit = 'cap'; }
        const plan = F.costForCrafts(r, n, depth);
        const flat = F.flattenPlan(plan.nodes);
        const made = n * r.n;
        const unit = ev.out && ev.out.best ? ev.out.best.v : null;
        const revenue = unit != null ? unit * made : null;
        const profit = revenue != null && plan.cost != null ? revenue - plan.cost : null;
        const next = F.costForCrafts(r, n + 1, depth);
        const nextCost = next.cost != null && plan.cost != null ? next.cost - plan.cost : null;
        html += `<div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">${recipeLabel(r)}</h2>${badges(r)}
            <span class="muted small">${esc(r.prof)} ${r.skill}${F.canCraft(r) ? '' : ' · <span class="warn">you can\'t craft this yet</span>'}</span></div>
          <div class="stats">
            <div class="stat"><div class="k">Crafts possible</div><div class="v">${n.toLocaleString()}</div><div class="small muted">limited by ${LIMIT_TEXT[limit] || limit}</div></div>
            <div class="stat"><div class="k">Items made</div><div class="v">${made.toLocaleString()}</div><div class="small muted">${r.product ? F.itemLink(r.product) : 'enchant'}</div></div>
            <div class="stat"><div class="k">Total cost</div><div class="v">${money(plan.cost)}</div><div class="small muted">${money(n ? plan.cost / n : ev.cost)} per craft</div></div>
            <div class="stat"><div class="k">Left over</div><div class="v">${money(s.budget - (plan.cost || 0))}</div><div class="small muted">next craft costs ${money(nextCost)}</div></div>
            <div class="stat"><div class="k">Expected revenue</div><div class="v">${money(revenue)}</div><div class="small muted">${ev.exit ? 'via ' + esc(ev.exit) : '—'}</div></div>
            <div class="stat"><div class="k">Profit</div><div class="v ${profit > 0 ? 'good' : profit < 0 ? 'bad' : ''}">${money(profit)}</div><div class="small muted">${pct(profit != null && plan.cost ? profit / plan.cost : null)} return</div></div>
          </div>`;
        if (!depth && F.hasBooks() === false && st.ah) html += '<p class="muted small">This price data has no listing depth (imported prices), so the cost assumes every unit costs the same.</p>';
        if (ev.supply != null && r.product && made > Math.max(5, ev.supply * 0.5) && ev.exit && ev.exit.startsWith('AH')) {
          html += `<div class="banner">Heads up: you'd make ${made.toLocaleString()} but only ${ev.supply.toLocaleString()} are listed right now, so you probably can't sell them all at this price.</div>`;
        }
        const sr = r.product ? F.saleRate(r.product) : null;
        if (sr && made > 0 && ev.exit && ev.exit.startsWith('AH')) {
          html += sr.rate > 0
            ? `<div class="banner info">At about ${rateText(sr)} sold per day across the whole auction house, ${made.toLocaleString()} would take roughly ${Math.ceil(made / sr.rate).toLocaleString()} days to sell, even if every sale were yours.</div>`
            : '<div class="banner">No sales of this item have been detected so far, so it may be slow to sell.</div>';
        }
        if (r.cd) html += `<div class="banner info">This recipe has a ${r.cd}h cooldown, so it's one craft per cooldown.</div>`;
        if (limit !== 'cap' && mc.nBest != null && mc.nBest < n) {
          const bestProfit = ev.revenue * mc.nBest - mc.costBest;
          html += `<div class="banner">After <b>${mc.nBest.toLocaleString()}</b> crafts the cheap listings run out and each extra craft costs more than it sells for.
            Crafting ${mc.nBest.toLocaleString()} gives the most profit (${money(bestProfit)} for ${money(mc.costBest)}).
            <button class="btn sm" data-setcap="${mc.nBest}">Plan ${mc.nBest.toLocaleString()} crafts</button></div>`;
        }
        const leaves = flat.leaves.sort((a, b) => (b.cost || 0) - (a.cost || 0));
        html += `<h3>Shopping list</h3><div class="tablewrap"><table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Avg / unit</th><th class="num">Total</th><th>Buy from</th><th class="num">On AH</th></tr></thead><tbody>
          ${leaves.map(l => {
            const e = F.ahEntry(F.item(l.name));
            return `<tr><td>${F.itemLink(l.name)}</td><td class="num">${l.qty.toLocaleString()}</td><td class="num">${money(l.cost != null && l.qty ? l.cost / l.qty : null)}</td><td class="num">${money(l.cost)}</td><td class="src">${esc(l.src)}</td><td class="num">${num(e ? e.qty : null)}</td></tr>`;
          }).join('') || '<tr><td colspan="6" class="muted">Nothing to buy.</td></tr>'}
          </tbody><tfoot><tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>${money(plan.cost)}</b></td><td></td><td></td></tr></tfoot></table></div>`;
        const steps = flat.steps.map(x => `<li>Craft <b>${esc(x.rec.name)}</b> × ${x.crafts.toLocaleString()} <span class="muted">(${esc(x.rec.prof)} ${x.rec.skill})</span></li>`);
        steps.push(`<li>Craft <b>${esc(r.name)}</b> × ${n.toLocaleString()}</li>`);
        html += `<h3>Steps</h3><ol class="steps">${steps.join('')}</ol></div>`;
      }
    } else {
      html += '<div class="banner info">Pick a recipe above, or start from one of the best uses of your budget below.</div>';
    }
    // Best uses of this budget
    const evs = evaluateList(x => x.product && F.canCraft(x), ctx).filter(e => e.budgetProfit != null && e.budgetProfit > 0);
    evs.sort((a, b) => b.budgetProfit - a.budgetProfit);
    html += `<div class="card"><h2>Best uses of ${money(s.budget)} at your skill levels</h2>
      <div class="tablewrap"><table><thead><tr><th>Recipe</th><th>Profession</th><th class="num">Crafts</th><th class="num">Spend</th><th class="num">Profit</th><th class="num">Return</th><th></th></tr></thead><tbody>
      ${evs.slice(0, 15).map(e => `<tr><td>${recipeLabel(e.r)}${badges(e.r)}</td><td class="muted">${esc(e.r.prof)}</td><td class="num">${e.mc.nBest.toLocaleString()}</td><td class="num">${money(e.mc.costBest)}</td>${profitCell(e.budgetProfit)}<td class="num">${pct(e.mc.costBest ? e.budgetProfit / e.mc.costBest : null)}</td><td><button class="btn sm" data-plan="${esc(e.r.key)}">Plan</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No profitable crafts found with current prices and skills.</td></tr>'}
      </tbody></table></div></div>`;
    out.innerHTML = html;
  }

  // ---------------------------------------------------------------- Disenchanting
  function mountDE() {
    const root = $('#tab-de');
    root.innerHTML = `
      <div class="grid2">
        <div class="card"><h2>Disenchant calculator</h2>
          <div class="row">
            <div class="field">Item level<input id="deIlvl" type="number" min="1" max="100" value="50" style="width:90px"></div>
            <div class="field">Quality<select id="deQ"><option value="2">Uncommon (green)</option><option value="3">Rare (blue)</option><option value="4">Epic (purple)</option></select></div>
            <div class="field">Type<select id="deKind"><option value="a">Armor</option><option value="w">Weapon</option></select></div>
          </div>
          <div id="deCalcOut" style="margin-top:12px"></div>
        </div>
        <div class="card"><h2>Enchanting material prices</h2><div id="deMats"></div></div>
      </div>
      <div class="card"><h2>Expected disenchant value by item level</h2><div id="deTable"></div></div>
      <div class="card"><h2>Craft &amp; disenchant</h2>
        <p class="muted small" style="margin-top:0">Gear you can craft, comparing material cost with what disenchanting it is worth.</p><div id="deCraft"></div></div>
      <div class="card"><h2>Auction house disenchant flips</h2>
        <p class="muted small" style="margin-top:0">Scans every green/blue/purple item on the AH and finds listings cheaper than their expected disenchant value.
          Needs Blizzard API prices (the scan looks up item level and quality for each item, cached after the first run).</p>
        <div class="row">
          <button class="btn primary" id="deScanBtn">Scan auction house</button>
          <input data-set="deMinProfit" placeholder="Min profit, e.g. 20s" style="width:150px">
          <select data-set="deQuality"><option value="all">All qualities</option><option value="2">Uncommon only</option><option value="3">Rare only</option><option value="4">Epic only</option></select>
          <span id="deScanStatus" class="muted small"></span>
        </div>
        <div id="deScanOut" style="margin-top:12px"></div>
      </div>`;
    bindSettings(root);
    ['#deIlvl', '#deQ', '#deKind'].forEach(s => $(s).addEventListener('input', updateDeCalc));
    $('#deScanBtn').addEventListener('click', runDeScan);
  }
  function deOutsHtml(outs) {
    return `<div class="tablewrap"><table><thead><tr><th>Result</th><th class="num">Chance</th><th class="num">Amount</th><th class="num">Value each</th><th class="num">Expected</th></tr></thead><tbody>
      ${outs.map(([p, m, a, b]) => { const v = F.matValue(m); return `<tr><td>${F.itemLink(m)}</td><td class="num">${Math.round(p * 1000) / 10}%</td><td class="num">${a === b ? a : a + '–' + b}</td><td class="num">${money(v)}</td><td class="num">${money(v == null ? null : p * (a + b) / 2 * v)}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function updateDeCalc() {
    const ilvl = +$('#deIlvl').value || 0, q = +$('#deQ').value, kind = $('#deKind').value;
    const outs = F.deOutcomes(q, ilvl, kind);
    if (!outs) { $('#deCalcOut').innerHTML = '<span class="muted">Enter an item level.</span>'; return; }
    const r = F.deFromOutcomes(outs);
    $('#deCalcOut').innerHTML = `${deOutsHtml(outs)}<div class="row" style="margin-top:8px"><span>Expected value: <b>${money(r.ev)}</b></span>
      <span class="muted">· needs Enchanting ${F.deReq(ilvl)} · values after ${st.S.ahCut}% AH cut</span></div>`;
  }
  function updateDE() {
    updateDeCalc();
    const ctx = F.newCtx();
    $('#deMats').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Material</th><th class="num">AH price</th><th class="num">On AH</th></tr></thead><tbody>
      ${F.DE_MATS.map(m => { const it = F.item(m), e = F.ahEntry(it); const p = st.manual[m] != null ? st.manual[m] : F.ahPrice(it); return `<tr><td>${F.itemLink(m)}</td><td class="num">${money(p)}${st.manual[m] != null ? ' <span class="dim small">manual</span>' : ''}</td><td class="num">${num(e ? e.qty : null)}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    const cols = [[2, 'a', 'Green armor'], [2, 'w', 'Green weapon'], [3, 'a', 'Blue'], [4, 'a', 'Epic']];
    $('#deTable').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Item level</th><th class="num">Enchanting needed</th>${cols.map(c => `<th class="num">${c[2]}</th>`).join('')}</tr></thead><tbody>
      ${F.DE_BRACKETS.map(([lo, hi]) => `<tr><td>${lo}–${hi}</td><td class="num">${F.deReq(hi)}</td>${cols.map(([q, k]) => {
        if (q === 4 && hi < 40) return '<td class="num muted">—</td>';
        const outs = F.deOutcomes(q, hi, k), v = F.deFromOutcomes(outs);
        const tip = outs.map(([p, m, a, b]) => `${Math.round(p * 100)}% ${a === b ? a : a + '-' + b}x ${m}`).join('\n');
        return `<td class="num" title="${esc(tip)}">${money(v.ev)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
    // craft & DE
    const rows = F.recipes().filter(r => r.product && F.deValue(F.item(r.product)) && (st.S.ignoreSkill || F.canCraft(r))).map(r => {
      const ev = F.evaluate(r, ctx), de = ev.out.de;
      const deTotal = de.ev == null ? null : de.ev * r.n;
      return { r, ev, de, deTotal, deProfit: deTotal != null && ev.cost != null ? deTotal - ev.cost : null };
    }).sort((a, b) => (b.deProfit == null ? -Infinity : b.deProfit) - (a.deProfit == null ? -Infinity : a.deProfit));
    $('#deCraft').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Item</th><th>Profession</th><th class="num">Item level</th><th class="num">Cost</th><th class="num">Disenchant value</th><th class="num">DE profit</th><th class="num">AH sale (net)</th><th class="num">Enchanting</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${recipeLabel(x.r)}${badges(x.r)}</td><td class="muted">${esc(x.r.prof)} ${x.r.skill}</td><td class="num">${x.de.ilvl}${x.de.api ? '' : ' <span class="dim" title="Estimated; load item info on Settings & sync">≈</span>'}</td>
        <td class="num">${money(x.ev.cost)}</td><td class="num">${money(x.deTotal)}</td>${profitCell(x.deProfit)}<td class="num">${money(x.ev.out.ah == null ? null : x.ev.out.ah * x.r.n)}</td>
        <td class="num ${(+st.skills.Enchanting || 0) >= x.de.req ? '' : 'warn'}">${x.de.req}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No disenchantable crafts at your skill levels (tick "Show all recipes" on Best crafts to see all).</p>';
    renderDeScan();
  }
  async function runDeScan() {
    const ah = st.ah, status = $('#deScanStatus');
    if (!ah || !ah.all) return toast('Sync auction data first (Settings & sync).', 'bad');
    if (!F.hasCredentials()) return toast('The scan needs the Blizzard API to look up item levels. Add your API credentials first.', 'bad');
    const ids = Object.keys(ah.all).map(Number).filter(id => !st.meta[id]);
    const btn = $('#deScanBtn');
    btn.disabled = true;
    try {
      if (ids.length) {
        const batch = ids.slice(0, 5000);
        status.textContent = `Looking up ${batch.length.toLocaleString()} new items…`;
        const r = await F.fetchItemInfo(batch, (d, t) => { status.textContent = `Looking up items ${d.toLocaleString()} / ${t.toLocaleString()}…`; });
        log(`DE scan: item info loaded for ${r.ok}, not found ${r.notFound}, failed ${r.failed}${r.lastError ? ' (' + r.lastError + ')' : ''}.`);
        if (ids.length > batch.length) toast(`Looked up ${batch.length} items; run the scan again to look up the remaining ${ids.length - batch.length}.`);
      }
      deScanResults = [];
      for (const [id, [min]] of Object.entries(ah.all)) {
        const m = st.meta[id];
        if (!m || m.missing || !(m.q >= 2 && m.q <= 4) || !(m.c === 2 || m.c === 4)) continue;
        const outs = F.deOutcomes(m.q, m.l, m.c === 2 ? 'w' : 'a');
        if (!outs) continue;
        const v = F.deFromOutcomes(outs);
        if (v.ev == null) continue;
        deScanResults.push({ id: +id, m, price: min, ev: v.ev, profit: v.ev - min, req: F.deReq(m.l) });
      }
      status.textContent = `${deScanResults.length.toLocaleString()} disenchantable items checked.`;
      renderDeScan();
    } catch (e) { status.textContent = ''; toast(e.message, 'bad'); }
    finally { btn.disabled = false; }
  }
  function renderDeScan() {
    const out = $('#deScanOut');
    if (!out || !deScanResults) return;
    const minP = F.parseMoney(st.S.deMinProfit) || 1;
    const q = st.S.deQuality;
    const ench = +st.skills.Enchanting || 0;
    const list = deScanResults.filter(x => x.profit >= minP && (q === 'all' || x.m.q === +q)).sort((a, b) => b.profit - a.profit).slice(0, 300);
    const link = id => (st.S.linkTemplate || '').replace('{id}', id);
    out.innerHTML = list.length ? `<div class="tablewrap"><table><thead><tr><th>Item</th><th class="num">Item level</th><th class="num">Cheapest buyout</th><th class="num">DE value</th><th class="num">Profit</th><th class="num">Enchanting</th></tr></thead><tbody>
      ${list.map(x => `<tr><td><a class="item q${x.m.q}" href="${esc(link(x.id))}" target="_blank" rel="noopener">${esc(x.m.n)}</a></td><td class="num">${x.m.l}</td><td class="num">${money(x.price)}</td><td class="num">${money(x.ev)}</td>${profitCell(x.profit)}<td class="num ${ench >= x.req ? '' : 'warn'}">${x.req}</td></tr>`).join('')}
      </tbody></table></div><p class="muted small">Disenchant results are random; profit is the average over many disenchants. Prices are from the last AH sync.</p>` : '<p class="muted">No listings below disenchant value right now.</p>';
  }

  // ---------------------------------------------------------------- Prices
  function mountPrices() {
    const root = $('#tab-prices');
    root.innerHTML = `
      <div class="card tight"><div class="row">
        <input data-set="priceSearch" placeholder="Search items…" style="width:220px">
        <select data-set="priceFilter">
          <option value="used">Items used by my recipes</option><option value="all">All items</option>
          <option value="missing">Missing a price</option><option value="problems">ID problems</option>
          <option value="manual">My manual prices</option><option value="vendor">Vendor-sold</option>
        </select>
        <span class="spacer"></span>
        <button class="btn" id="prCsv">Paste prices…</button>
        <button class="btn primary" id="prLink" title="Re-imports automatically whenever WoW saves the file (Chrome/Edge)">Link Auctionator file…</button>
        <button class="btn" id="prAuctionator">Import once…</button>
        <button class="btn" id="prExport">Export CSV</button>
        <button class="btn danger" id="prClear">Clear manual prices</button>
      </div></div>
      <p class="muted small">Type a price in <b>Your price</b> to override everything (accepts <code>1g 20s</code>, <code>35s</code>, <code>80c</code> or a plain number of gold). Fix a wrong item ID in the ID column.</p>
      <div id="prOut"></div>`;
    bindSettings(root);
    $('#prCsv').addEventListener('click', openCsvImport);
    $('#prAuctionator').addEventListener('click', importAuctionator);
    $('#prLink').addEventListener('click', linkAuctionator);
    $('#prExport').addEventListener('click', exportCsv);
    $('#prClear').addEventListener('click', () => {
      if (!Object.keys(st.manual).length) return toast('No manual prices to clear.');
      if (!confirm(`Remove all ${Object.keys(st.manual).length} manual prices?`)) return;
      st.manual = {};
      F.save('manual', st.manual);
      refresh();
    });
    root.addEventListener('change', e => {
      const m = e.target.closest('[data-manual]');
      if (m) {
        const name = m.dataset.manual, v = F.parseMoney(m.value);
        if (m.value.trim() === '' || v == null) delete st.manual[name]; else st.manual[name] = v;
        F.save('manual', st.manual);
        refresh();
      }
      const rt = e.target.closest('[data-rate]');
      if (rt) {
        const n = parseFloat(rt.value);
        if (rt.value.trim() === '' || !isFinite(n) || n < 0) delete st.saleRates[rt.dataset.rate]; else st.saleRates[rt.dataset.rate] = n;
        F.save('saleRates', st.saleRates);
        refresh();
      }
      const idIn = e.target.closest('[data-idfor]');
      if (idIn) {
        F.setItemId(idIn.dataset.idfor, idIn.value.trim());
        F.rebuild();
        refresh();
      }
    });
  }
  function updatePrices() {
    const s = st.S, ctx = F.newCtx();
    const q = (s.priceSearch || '').trim().toLowerCase();
    const probs = new Map(F.idProblems().map(p => [p.it.name, p.why]));
    const usedSet = new Set();
    for (const r of F.recipes()) { if (r.product) usedSet.add(r.product); for (const g of r.reagents) usedSet.add(g.name); }
    F.DE_MATS.forEach(m => usedSet.add(m));
    let list = [...F.items().values()].filter(it => {
      if (q && !it.name.toLowerCase().includes(q) && String(it.id) !== q) return false;
      switch (s.priceFilter) {
        case 'used': return usedSet.has(it.name);
        case 'missing': return usedSet.has(it.name) && F.buyInfo(it.name, ctx).price == null;
        case 'problems': return probs.has(it.name);
        case 'manual': return st.manual[it.name] != null;
        case 'vendor': return !!it.vendor;
        default: return true;
      }
    }).sort((a, b) => a.name.localeCompare(b.name));
    const rows = list.map(it => {
      const e = F.ahEntry(it), prev = it.id && st.ahPrev[it.id], cur = e ? e.mkt || e.min : null;
      const ch = prev && cur ? (cur - prev) / prev : null;
      const b = F.buyInfo(it.name, ctx);
      const m = it.id && st.meta[it.id];
      let check = '<span class="dim" title="Not checked yet; use Check item IDs on Settings & sync">–</span>';
      if (probs.has(it.name)) check = `<span class="warn" title="${esc(probs.get(it.name))}">⚠ ${esc(probs.get(it.name))}</span>`;
      else if (m && !m.missing) check = '<span class="good" title="Name matches the Blizzard item">✓</span>';
      return `<tr><td>${F.itemLink(it.name)}</td>
        <td><input class="id" data-idfor="${esc(it.name)}" value="${it.id || ''}" placeholder="?"></td>
        <td class="num">${money(e ? e.min : null)}</td><td class="num">${money(e ? e.mkt : null)}</td>
        <td class="num ${ch > 0.05 ? 'bad' : ch < -0.05 ? 'good' : 'muted'}">${ch == null ? '' : (ch > 0 ? '+' : '') + Math.round(ch * 100) + '%'}</td>
        <td class="num">${num(e ? e.qty : null)}</td><td class="num">${it.vendor ? money(F.vendorBuy(it)) : ''}</td>
        <td><input class="price" data-manual="${esc(it.name)}" value="${st.manual[it.name] != null ? F.moneyText(st.manual[it.name]) : ''}" placeholder="auto"></td>
        <td><input class="id" data-rate="${esc(it.name)}" value="${st.saleRates[it.name] != null ? st.saleRates[it.name] : ''}" placeholder="${(() => { const r = F.saleRate(it.name); return r && !r.manual ? '≈' + (r.rate < 10 ? r.rate.toFixed(1) : Math.round(r.rate)) : 'auto'; })()}" title="Units sold per day. Leave empty to use the estimate."></td>
        <td class="num">${money(b.price)} <div class="src">${esc(b.src === 'Craft' && b.rec ? 'craft: ' + b.rec.name : b.src)}</div></td>
        <td class="small">${check}</td></tr>`;
    }).join('');
    $('#prOut').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Item</th><th>ID</th><th class="num">AH min</th><th class="num">AH market</th><th class="num">Change</th><th class="num">On AH</th><th class="num">Vendor</th><th>Your price</th><th title="Units sold per day; type your own to override the estimate">Sold / day</th><th class="num">Price used</th><th>Check</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="11" class="muted">No items match.</td></tr>'}</tbody></table></div>
      <p class="muted small">${list.length} items. "AH market" is the average of the cheapest ~15% of listed units. "Price used" is the cheapest of AH, vendor and crafting it yourself.</p>`;
  }
  function openCsvImport() {
    openModal(`<h2>Paste prices</h2>
      <p class="muted small">One item per line: <code>Item name or item ID, price</code>. Works with TSM/Auctionator exports and spreadsheets.</p>
      <textarea id="csvText" placeholder="Runecloth, 45s\n14047, 4500\nArcanite Bar, 12g 50s"></textarea>
      <div class="row" style="margin-top:10px">
        <div class="field">Plain numbers are<select id="csvUnit"><option value="copper">copper (TSM style)</option><option value="gold">gold</option></select></div>
        <div class="field">Import as<select id="csvTarget"><option value="manual">My manual prices (override)</option><option value="ah">Auction house data (replaces current AH data)</option></select></div>
      </div>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="csvGo">Import</button></div>`);
    $('#csvUnit').value = st.S.csvUnit;
    $('#csvTarget').value = st.S.csvTarget;
    $('#csvGo').addEventListener('click', () => {
      const unit = $('#csvUnit').value, target = $('#csvTarget').value;
      setS('csvUnit', unit); setS('csvTarget', target);
      const { rows, bad } = F.parseCsv($('#csvText').value, unit);
      if (!rows.length) return toast('No valid lines found.', 'bad');
      if (target === 'manual') {
        let n = 0;
        for (const { it, price } of rows) if (it.name) { st.manual[it.name] = price; n++; }
        F.save('manual', st.manual);
        toast(`Imported ${n} manual prices.${bad.length ? ' ' + bad.length + ' lines skipped.' : ''}`, 'good');
      } else {
        const prices = {};
        for (const { it, price } of rows) if (it.id) prices[it.id] = [price, null];
        const n = F.applyPriceList(prices, 'Pasted prices', 'CSV import');
        toast(`Imported ${Object.keys(prices).length} prices (${n} used by recipes).${bad.length ? ' ' + bad.length + ' lines skipped.' : ''}`, 'good');
      }
      closeModal();
      refresh();
    });
  }
  // Linked file: WoW rewrites Auctionator.lua on /reload or logout; re-import whenever that happens.
  let aucHandle = null, aucLastMod = 0;
  function applyLinkedAuctionator(parsed, realm, file) {
    const { prices } = F.auctionatorPrices(parsed.db, realm);
    const n = F.applyPriceList(prices, realm, 'Auctionator');
    setS('aucRealm', realm);
    aucLastMod = file.lastModified;
    log(`Auctionator file imported: ${Object.keys(prices).length} prices for ${realm} (${n} used by recipes).`);
    toast(`Prices updated from Auctionator (${n} used by recipes).`, 'good');
    refresh();
  }
  async function linkAuctionator() {
    if (!window.showOpenFilePicker) return toast(window.isSecureContext ? 'Linking needs Chrome or Edge. Use "Import once" in this browser.' : 'Browsers only allow file linking on https or localhost. Use "Import once" at this address.', 'bad');
    let handle;
    try { [handle] = await window.showOpenFilePicker({ types: [{ description: 'Auctionator saved variables', accept: { 'text/plain': ['.lua', '.bak'] } }] }); }
    catch (e) { return; }
    let file, parsed;
    try {
      file = await handle.getFile();
      parsed = F.auctionatorRealms(await file.text());
    } catch (e) { return toast('Could not read that file: ' + e.message, 'bad'); }
    if (!parsed.realms.length) return toast('No realm price data found in that file. Run a scan in-game, then /reload.', 'bad');
    const finish = realm => { aucHandle = handle; applyLinkedAuctionator(parsed, realm, file); };
    if (parsed.realms.includes(st.S.aucRealm)) return finish(st.S.aucRealm);
    if (parsed.realms.length === 1) return finish(parsed.realms[0]);
    openModal(`<h2>Which realm and faction?</h2>
      <div class="field">Realm<select id="aucRealm">${parsed.realms.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="aucGo">Link</button></div>`);
    $('#aucGo').addEventListener('click', () => { const realm = $('#aucRealm').value; closeModal(); finish(realm); });
  }
  async function pollAuctionator() {
    if (!aucHandle) return;
    try {
      const file = await aucHandle.getFile();
      if (file.lastModified <= aucLastMod) return;
      const parsed = F.auctionatorRealms(await file.text());
      if (parsed.realms.includes(st.S.aucRealm)) applyLinkedAuctionator(parsed, st.S.aucRealm, file);
      else aucLastMod = file.lastModified;
    } catch (e) { log('Could not re-read the Auctionator file: ' + e.message); }
  }
  async function importAuctionator() {
    const file = await pickFile('.lua,.txt,.bak');
    if (!file) return;
    let parsed;
    try {
      toast('Reading ' + file.name + '…');
      parsed = F.auctionatorRealms(await file.text());
    } catch (e) { return toast('Could not read that file: ' + e.message, 'bad'); }
    if (!parsed.realms.length) return toast('No realm price data found in that file.', 'bad');
    openModal(`<h2>Import Auctionator prices</h2>
      <p class="muted small">Pick the realm and faction to import. Run a full scan in-game first (Auctionator → Full Scan), then <code>/reload</code> so the file is saved.</p>
      <div class="field">Realm<select id="aucRealm">${parsed.realms.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="aucGo">Import</button></div>`);
    $('#aucGo').addEventListener('click', () => {
      const realm = $('#aucRealm').value;
      const { prices, unmatched } = F.auctionatorPrices(parsed.db, realm);
      const n = F.applyPriceList(prices, realm, 'Auctionator');
      log(`Auctionator import: ${Object.keys(prices).length} prices for ${realm} (${n} used by recipes, ${unmatched} unmatched names).`);
      toast(`Imported ${Object.keys(prices).length} prices from Auctionator (${n} used by recipes).`, 'good');
      closeModal();
      refresh();
    });
  }
  function exportCsv() {
    const ctx = F.newCtx();
    const lines = ['item,id,price_copper,source'];
    for (const it of [...F.items().values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const b = F.buyInfo(it.name, ctx);
      if (b.price == null) continue;
      lines.push(`"${it.name.replace(/"/g, '""')}",${it.id || ''},${Math.round(b.price)},${b.src}`);
    }
    download('forever-prices.csv', lines.join('\n'), 'text/csv');
  }

  // ---------------------------------------------------------------- Recipes
  function mountRecipes() {
    const root = $('#tab-recipes');
    root.innerHTML = `
      <div class="card tight"><div class="row">
        <select data-set="recipeProf"><option value="">All professions</option>${F.PROFS.map(p => `<option>${esc(p)}</option>`).join('')}</select>
        <input data-set="recipeSearch" placeholder="Search recipes or reagents…" style="width:220px">
        <select data-set="recipeFilter">
          <option value="all">All recipes</option><option value="unverified">Unverified reagents</option><option value="patterns">Need a pattern</option>
          <option value="edited">Edited / custom</option><option value="notes">With notes (Forever changes)</option>
        </select>
        <span class="spacer"></span>
        <button class="btn primary" id="rcAdd">+ Add recipe</button>
        <button class="btn" id="rcExport">Export my recipes</button>
        <button class="btn" id="rcImport">Import recipes…</button>
        <button class="btn danger" id="rcReset">Reset built-in edits</button>
      </div></div>
      <p class="muted small">Recipes come from MetaForge's WoW Forever database, with required skill from pattern items and Wowhead. Fix anything wrong with <b>Edit</b>, or add missing recipes with <b>+ Add recipe</b>.
        Untick a recipe to leave it out of all calculations.</p>
      <div id="rcOut"></div>`;
    bindSettings(root);
    $('#rcAdd').addEventListener('click', () => openRecipeEditor(null));
    $('#rcExport').addEventListener('click', () => {
      download('forever-recipes.json', JSON.stringify({ app: 'wow-forever-ah-recipes', customRecipes: st.customRecipes, customItems: st.customItems, recipeEdits: st.recipeEdits, itemEdits: st.itemEdits }, null, 1), 'application/json');
    });
    $('#rcImport').addEventListener('click', async () => {
      const f = await pickFile('.json');
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'wow-forever-ah-recipes') throw new Error('not a recipe export from this app');
        const keys = new Set(st.customRecipes.map(r => r.key));
        for (const r of j.customRecipes || []) if (!keys.has(r.key)) st.customRecipes.push(r);
        Object.assign(st.customItems, j.customItems || {});
        Object.assign(st.recipeEdits, j.recipeEdits || {});
        Object.assign(st.itemEdits, j.itemEdits || {});
        ['customRecipes', 'customItems', 'recipeEdits', 'itemEdits'].forEach(k => F.save(k, st[k]));
        F.rebuild(); fillDatalists(); refresh();
        toast('Recipes imported.', 'good');
      } catch (e) { toast('Import failed: ' + e.message, 'bad'); }
    });
    $('#rcReset').addEventListener('click', () => {
      const n = Object.keys(st.recipeEdits).length;
      if (!n) return toast('No built-in recipes have been edited or deleted.');
      if (!confirm(`Undo your edits/deletions on ${n} built-in recipes? Custom recipes are kept.`)) return;
      st.recipeEdits = {};
      F.save('recipeEdits', st.recipeEdits);
      F.rebuild(); fillDatalists(); refresh();
    });
    root.addEventListener('click', e => {
      const ed = e.target.closest('[data-edit]');
      if (ed) openRecipeEditor(ed.dataset.edit);
    });
    root.addEventListener('change', e => {
      const kb = e.target.closest('[data-known]');
      if (kb) { st.known[kb.dataset.known] = kb.checked; F.save('known', st.known); refresh(); }
    });
  }
  function updateRecipes() {
    const s = st.S, ctx = F.newCtx();
    const q = (s.recipeSearch || '').trim().toLowerCase();
    const list = F.recipes().filter(r => {
      if (s.recipeProf && r.prof !== s.recipeProf) return false;
      if (q && !(r.name.toLowerCase().includes(q) || (r.product || '').toLowerCase().includes(q) || r.reagents.some(g => g.name.toLowerCase().includes(q)))) return false;
      switch (s.recipeFilter) {
        case 'unverified': return r.u;
        case 'patterns': return r.src !== 'T' && r.src !== 'C';
        case 'edited': return r.edited || r.custom;
        case 'notes': return !!r.note;
        default: return true;
      }
    }).sort((a, b) => F.PROFS.indexOf(a.prof) - F.PROFS.indexOf(b.prof) || a.skill - b.skill || a.name.localeCompare(b.name));
    const rows = list.map(r => {
      const c = F.evaluate(r, ctx);
      const isPattern = r.src !== 'T' && r.src !== 'C';
      const checked = st.known[r.key] === true || (st.known[r.key] !== false && (!isPattern || s.includePatterns));
      return `<tr><td><input type="checkbox" data-known="${esc(r.key)}" ${checked ? 'checked' : ''} title="Include in calculations"></td>
        <td class="muted">${esc(r.prof)}</td><td class="num">${r.skill}</td><td>${recipeLabel(r)}${badges(r)}</td>
        <td class="small">${r.reagents.map(g => `${g.qty}× ${F.itemLink(g.name, 'noico')}`).join(', ')}</td>
        <td class="src">${esc(F.SRC_LABEL[r.src] || r.src)}</td><td class="num">${money(c.cost)}</td>
        <td><button class="btn sm" data-edit="${esc(r.key)}">Edit</button></td></tr>`;
    }).join('');
    const counts = F.PROFS.map(p => `${p}: ${F.recipes().filter(r => r.prof === p).length}`).join(' · ');
    $('#rcOut').innerHTML = `<div class="tablewrap"><table><thead><tr><th title="Include in calculations">Use</th><th>Profession</th><th class="num">Skill</th><th>Recipe</th><th>Reagents</th><th>Source</th><th class="num">Cost now</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="muted">No recipes match.</td></tr>'}</tbody></table></div>
      <p class="muted small">${list.length} shown · ${F.recipes().length} total (${counts}).</p>`;
  }

  // ---------------------------------------------------------------- modal / recipe editor
  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="box">${html}</div>`;
    m.classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
  function openRecipeEditor(key) {
    const r = key ? F.recipeByKey(key) : null;
    const d = r
      ? { prof: r.prof, name: r.name, product: r.product, n: r.n, skill: r.skill, src: r.src, cd: r.cd, note: r.note, reagents: r.reagents.map(g => ({ ...g })) }
      : { prof: st.S.recipeProf || 'Alchemy', name: '', product: '', n: 1, skill: 1, src: 'T', cd: 0, note: '', reagents: [{ name: '', qty: 1 }, { name: '', qty: 1 }] };
    const productId = d.product ? F.item(d.product).id || '' : '';
    const reagRow = g => `<div class="reagrow"><input class="rgName" list="itemNames" value="${esc(g.name)}" placeholder="Reagent item name"><input class="rgQty" type="number" min="1" value="${g.qty}"><button class="btn sm danger rgDel" title="Remove">✕</button></div>`;
    openModal(`<h2>${r ? 'Edit recipe' : 'Add recipe'}</h2>
      ${r && r.builtin ? '<p class="muted small">Built-in recipe. Your changes are saved in this browser; "Reset" restores the original.</p>' : ''}
      <div class="row">
        <div class="field">Profession<select id="edProf">${F.PROFS.map(p => `<option ${p === d.prof ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div class="field">Required skill<input id="edSkill" type="number" min="0" max="300" value="${d.skill}" style="width:90px"></div>
        <div class="field">Source<select id="edSrc">${Object.entries(F.SRC_LABEL).map(([k, v]) => `<option value="${k}" ${k === d.src ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="field">Cooldown (hours)<input id="edCd" type="number" min="0" value="${d.cd || 0}" style="width:90px"></div>
      </div>
      <div class="row">
        <div class="field" style="flex:1;min-width:220px">Recipe name<input id="edName" value="${esc(d.name)}" placeholder="e.g. Elixir of the Grizzly"></div>
      </div>
      <div class="row">
        <div class="field" style="flex:1;min-width:220px">Item it makes (blank = same as name)<input id="edProduct" list="itemNames" value="${esc(d.product && d.product !== d.name ? d.product : '')}" ${d.product === null ? 'disabled' : ''}></div>
        <div class="field">Item ID<input id="edPid" value="${productId}" placeholder="optional" style="width:100px" ${d.product === null ? 'disabled' : ''}></div>
        <div class="field">Made per craft<input id="edN" type="number" min="1" value="${d.n}" style="width:90px"></div>
      </div>
      <div class="row"><label class="chk"><input type="checkbox" id="edNoProduct" ${d.product === null ? 'checked' : ''}> No sellable item (enchant / service)</label></div>
      <h3>Reagents</h3><div id="edReag">${d.reagents.map(reagRow).join('')}</div>
      <button class="btn sm" id="edAddReag">+ Reagent</button>
      <div class="field" style="margin-top:10px">Note<input id="edNote" value="${esc(d.note)}" placeholder="optional"></div>
      <p class="muted small">New item names are added automatically. Give them an item ID on the Prices tab (or use "Fix IDs by name" on Settings &amp; sync) so AH prices can be matched.</p>
      <div class="row" style="margin-top:14px">
        ${r ? '<button class="btn danger" id="edDelete">Delete</button>' : ''}
        ${r && r.builtin && r.edited ? '<button class="btn" id="edReset">Reset to original</button>' : ''}
        <span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="edSave">Save</button>
      </div>`);
    const box = $('#modal');
    $('#edAddReag').addEventListener('click', () => $('#edReag').insertAdjacentHTML('beforeend', reagRow({ name: '', qty: 1 })));
    box.addEventListener('click', e => { if (e.target.classList.contains('rgDel')) e.target.closest('.reagrow').remove(); });
    $('#edNoProduct').addEventListener('change', e => { $('#edProduct').disabled = e.target.checked; $('#edPid').disabled = e.target.checked; });
    if ($('#edDelete')) $('#edDelete').addEventListener('click', () => {
      if (!confirm(`Delete "${r.name}"?`)) return;
      if (r.builtin) st.recipeEdits[r.key] = { deleted: true };
      else st.customRecipes = st.customRecipes.filter(x => x.key !== r.key);
      saveRecipes();
    });
    if ($('#edReset')) $('#edReset').addEventListener('click', () => { delete st.recipeEdits[r.key]; saveRecipes(); });
    $('#edSave').addEventListener('click', () => {
      const name = $('#edName').value.trim();
      if (!name) return toast('Give the recipe a name.', 'bad');
      const reagents = $$('.reagrow', box).map(row => ({ name: $('.rgName', row).value.trim(), qty: Math.max(1, Math.round(+$('.rgQty', row).value || 1)) })).filter(g => g.name);
      if (!reagents.length) return toast('Add at least one reagent.', 'bad');
      const noProduct = $('#edNoProduct').checked;
      const product = noProduct ? null : ($('#edProduct').value.trim() || name);
      const rec = {
        prof: $('#edProf').value, name, product, n: Math.max(1, Math.round(+$('#edN').value || 1)),
        skill: Math.max(0, Math.min(300, Math.round(+$('#edSkill').value || 0))), src: $('#edSrc').value,
        cd: Math.max(0, +$('#edCd').value || 0), note: $('#edNote').value.trim(), reagents
      };
      for (const g of reagents) if (!F.items().has(g.name)) st.customItems[g.name] = [0];
      if (product && !F.items().has(product)) st.customItems[product] = [0];
      const pid = $('#edPid').value.trim();
      if (product && /^\d+$/.test(pid) && +pid !== F.item(product).id) F.setItemId(product, +pid);
      if (r && r.builtin) st.recipeEdits[r.key] = rec;
      else if (r) st.customRecipes = st.customRecipes.map(x => (x.key === r.key ? Object.assign({ key: r.key }, rec) : x));
      else st.customRecipes.push(Object.assign({ key: 'custom|' + Date.now().toString(36) }, rec));
      saveRecipes();
    });
  }
  function saveRecipes() {
    ['customRecipes', 'customItems', 'recipeEdits'].forEach(k => F.save(k, st[k]));
    F.rebuild();
    fillDatalists();
    closeModal();
    refresh();
    toast('Recipe saved.', 'good');
  }

  // ---------------------------------------------------------------- Settings & sync
  function mountSettings() {
    const root = $('#tab-settings');
    root.innerHTML = `
      <div id="stServer"></div>
      ${location.protocol === 'file:' ? '<div class="banner"><b>Close this page and open the app with <code>start.bat</code>.</b> Blizzard appears to refuse pages opened directly as a file (HTTP 403).</div>' : ''}
      <div class="grid2">
        <div class="card"><h2>1 · Blizzard API (automatic prices)</h2>
          <ol class="steps">
            <li>Open <a href="https://develop.battle.net/access/clients" target="_blank" rel="noopener">develop.battle.net → API Access</a>, sign in, and create a client (any name; redirect URL can be <code>http://localhost</code>).</li>
            <li>Paste its Client ID and Client Secret here.</li>
            <li>Pick your game version and realm in step 2, then press <b>Update prices</b>.</li>
          </ol>
          <div class="row" style="margin-top:10px">
            <div class="field">Region<select data-set="region"><option value="us">Americas &amp; Oceania (US)</option><option value="eu">Europe (EU)</option><option value="kr">Korea</option><option value="tw">Taiwan</option></select></div>
          </div>
          <div class="row">
            <div class="field" style="flex:1">Client ID<input data-set="clientId" autocomplete="off" spellcheck="false"></div>
            <div class="field" style="flex:1">Client Secret<input id="stSecret" type="password" autocomplete="off" spellcheck="false"></div>
          </div>
          <div class="row">
            <label class="chk"><input type="checkbox" id="stRemember"> Remember the secret in this browser</label>
            <span class="spacer"></span><button class="btn" id="stTest">Test connection</button>
          </div>
          <details style="margin-top:10px"><summary class="muted small">Or paste an access token instead</summary>
            <div class="field" style="margin-top:6px">Access token (valid ~24h)<input data-set="manualToken" autocomplete="off" spellcheck="false"></div></details>
          <p class="muted small">Your credentials are only sent to Blizzard (oauth.battle.net and api.blizzard.com) and are stored only in this browser.</p>
        </div>
        <div class="card"><h2>2 · Realm &amp; auction house</h2>
          <div class="row">
            <div class="field" style="flex:1">Game version (API namespace)<select data-set="namespace">
              <option value="forever">WoW Forever</option>
              <option value="classic1x">Classic Era / Anniversary / Hardcore ("classic1x")</option>
              <option value="classic">Classic progression ("classic")</option>
              <option value="custom">Custom…</option></select></div>
            <div class="field" id="stCustomNsBox">Custom namespace<input data-set="customNamespace" placeholder="e.g. forever" style="width:140px"></div>
            <div class="field" title="The version part of static-<build>-forever-<region>. Changes when Blizzard patches Forever.">Forever build<input data-set="foreverBuild" style="width:130px"></div>
          </div>
          <div class="row"><button class="btn" id="stProbe">Find which versions exist</button><span class="muted small">Also tests each Forever endpoint. Forever uses rulesets (PvP, Normal, Roleplay, Roleplay PvP) instead of realms.</span></div>
          <div id="stProbeOut"></div>
          <div class="row" style="margin-top:10px">
            <button class="btn" id="stRealms">Load realms / rulesets</button>
            <div class="field" style="flex:1">Realm / ruleset<select id="stRealm"><option value="">—</option></select></div>
            <div class="field">Auction house<select id="stAh"><option value="">—</option></select></div>
          </div>
          <p class="small muted" id="stRealmInfo"></p>
          <div class="row">
            <label class="chk"><input type="checkbox" data-set="autoRefresh"> Update automatically every</label>
            <input type="number" data-set="refreshMinutes" min="15" max="1440" style="width:70px"> <span class="muted">minutes while this page is open</span>
          </div>
          <div class="row" style="margin-top:10px"><button class="btn primary" id="stSync">Update prices now</button><button class="btn" id="stCompare" title="Downloads every auction house of the selected faction">Compare houses</button></div>
          <div id="stCompareOut"></div>
        </div>
      </div>
      <div class="grid2">
        <div class="card"><h2>3 · Item data</h2>
          <p class="muted small" style="margin-top:0">Loads names, quality, item level and vendor prices from Blizzard for every item in the recipe list. This checks that the built-in item IDs
            are right for your game version and makes disenchant estimates exact.</p>
          <div class="row"><button class="btn" id="stCheck">Check item IDs &amp; load item info</button><button class="btn" id="stFix">Fix missing/wrong IDs by name</button></div>
          <div id="stItemInfo" class="small" style="margin-top:10px"></div>
        </div>
        <div class="card"><h2>Calculation</h2>
          <div class="row">
            <div class="field">Price to use<select data-set="priceSource"><option value="market">Market value (cheapest ~15% avg)</option><option value="min">Lowest buyout</option></select></div>
            <div class="field">AH cut %<input type="number" data-set="ahCut" min="0" max="50" step="0.5" style="width:80px"></div>
          </div>
          <div class="row"><label class="chk"><input type="checkbox" data-set="deWithoutSkill"> Count disenchanting even if my Enchanting skill is too low</label></div>
          <div class="row"><div class="field" style="flex:1"><span>Item link format (<code>{id}</code> = item ID)</span><input data-set="linkTemplate"></div></div>
          <h3>Backup</h3>
          <div class="row"><button class="btn" id="stExport">Export settings &amp; edits</button><button class="btn" id="stImport">Import backup…</button><button class="btn danger" id="stReset">Reset everything</button></div>
          <p class="muted small">The backup holds skills, manual prices, recipe edits and custom recipes. It never includes your API secret.</p>
        </div>
      </div>
      <div class="card"><h2>Activity</h2><div class="log" id="syncLog"></div></div>`;
    bindSettings(root);
    $('#stSecret').value = st.secret || '';
    $('#stRemember').checked = !!st.S.rememberSecret;
    $('#stSecret').addEventListener('input', () => {
      st.secret = $('#stSecret').value.trim();
      st.tok = null;
      if (st.S.rememberSecret) F.save('secret', st.secret);
    });
    $('#stRemember').addEventListener('change', e => {
      setS('rememberSecret', e.target.checked);
      if (e.target.checked) { F.save('secret', st.secret); if (st.tok) F.save('token', st.tok); }
      else { F.remove('secret'); F.remove('token'); }
    });
    $('#stTest').addEventListener('click', async () => {
      try {
        st.tok = null;
        await F.getToken(true);
        log('Connected to Blizzard API.');
        toast('Connected to the Blizzard API.', 'good');
      } catch (e) { log('Connection failed: ' + e.message); toast(e.message, 'bad'); }
    });
    $('#stProbe').addEventListener('click', probeUi);
    root.addEventListener('click', e => {
      const u = e.target.closest('[data-usens]');
      if (!u) return;
      const ns = u.dataset.usens;
      if (['forever', 'classic1x', 'classic'].includes(ns)) setS('namespace', ns);
      else { setS('namespace', 'custom'); setS('customNamespace', ns); syncControl('customNamespace'); }
      syncControl('namespace');
      updateSettings();
      loadRealmsUi();
    });
    $('#stRealms').addEventListener('click', loadRealmsUi);
    $('#stRealm').addEventListener('change', async e => {
      const opt = e.target.selectedOptions[0];
      if (!opt || !opt.value) return;
      setS('realmSlug', opt.value); setS('realmName', opt.textContent);
      try {
        if (F.isForever()) {
          const list = await F.loadRulesetHouses(opt.value);
          F.save('houses', list);
          setS('ahId', ''); setS('ahName', '');
          fillHouses(list);
          log(`Ruleset ${opt.textContent}: ${list.length} auction houses. Blizzard doesn't say which belongs to which ruleset; use Compare houses.`);
          updateSettings();
          return;
        }
        const crid = await F.resolveConnectedRealm(opt.value);
        setS('connectedRealmId', crid);
        const houses = await F.loadAuctionHouses(crid);
        F.save('houses', houses);
        fillHouses(houses);
        const pick = houses[0];
        setS('ahId', pick ? pick.id : ''); setS('ahName', pick ? pick.name : '');
        if (pick) $('#stAh').value = pick.id;
        log(`Realm ${opt.textContent}: connected realm ${crid}, ${houses.length} auction houses.`);
        updateSettings();
      } catch (err) { log('Realm lookup failed: ' + err.message); toast(err.message, 'bad'); }
    });
    $('#stAh').addEventListener('change', e => {
      const opt = e.target.selectedOptions[0];
      setS('ahId', opt ? opt.value : ''); setS('ahName', opt && opt.value ? (opt.dataset.name || opt.textContent) : ''); // keep the stored name stable: sale-rate history is keyed on it
      updateSettings();
    });
    $('#stSync').addEventListener('click', () => doSync(true));
    $('#stCompare').addEventListener('click', compareHousesUi);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-usehouse]');
      if (!b) return;
      const sel = $('#stAh');
      sel.value = b.dataset.usehouse;
      sel.dispatchEvent(new Event('change'));
      toast('Auction house selected.', 'good');
    });
    $('#stCheck').addEventListener('click', () => checkItems(true));
    $('#stFix').addEventListener('click', fixIds);
    $('#stExport').addEventListener('click', () => download('forever-ah-backup.json', JSON.stringify(F.exportAll(), null, 1), 'application/json'));
    $('#stImport').addEventListener('click', async () => {
      const f = await pickFile('.json');
      if (!f) return;
      try { F.importAll(JSON.parse(await f.text())); toast('Backup restored. Reloading…', 'good'); setTimeout(() => location.reload(), 800); }
      catch (e) { toast('Import failed: ' + e.message, 'bad'); }
    });
    $('#stReset').addEventListener('click', () => {
      if (!confirm('Delete all settings, prices, skills, edits and custom recipes stored by this app in this browser?')) return;
      try { Object.keys(localStorage).filter(k => k.startsWith('wowforever-ah.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
      location.reload();
    });
    fillRealms(F.load('realms', []));
    fillHouses(F.load('houses', []));
    if (logLines.length) $('#syncLog').textContent = logLines.join('\n');
  }
  function fillRealms(realms) {
    const sel = $('#stRealm');
    if (!sel) return;
    sel.innerHTML = '<option value="">— pick a realm —</option>' + realms.map(r => `<option value="${esc(r.slug)}">${esc(r.name)}</option>`).join('');
    sel.value = st.S.realmSlug || '';
  }
  // Forever house IDs come in Alliance/Horde/Blackwater sets; each set looks like one market.
  const MARKET_SETS = [[110, 113, 116], [111, 114, 117], [112, 115, 118], [119, 120, 121], [123, 124, 125]];
  const marketOf = id => MARKET_SETS.findIndex(set => set.includes(+id)) + 1;
  const marketName = n => (n ? `Market ${n}${n === 3 ? ' (empty at launch)' : ''}` : 'Other');
  const houseLabel = h => {
    const side = String(h.faction || h.name).replace(/ Auction House.*$/, '');
    return F.isForever() ? `${marketName(marketOf(h.id))} – ${side} (#${h.id})` : h.name;
  };
  function fillHouses(houses) {
    const sel = $('#stAh');
    if (!sel) return;
    const pick = F.isForever() ? '<option value="">— pick a house —</option>' : '';
    const opt = h => `<option value="${esc(h.id)}" data-name="${esc(h.name)}">${esc(houseLabel(h))}</option>`;
    let body = houses.map(opt).join('');
    if (F.isForever()) {
      const groups = [...new Set(houses.map(h => marketOf(h.id)))].sort((a, b) => (a || 99) - (b || 99));
      body = groups.map(n => `<optgroup label="${esc(marketName(n))}">${houses.filter(h => marketOf(h.id) === n).sort((a, b) => a.id - b.id).map(opt).join('')}</optgroup>`).join('');
    }
    sel.innerHTML = houses.length ? pick + body : '<option value="">(single auction house)</option>';
    sel.value = st.S.ahId || (F.isForever() || !houses[0] ? '' : houses[0].id);
  }
  async function compareHousesUi() {
    const houses = F.load('houses', []), cur = houses.find(h => String(h.id) === String(st.S.ahId));
    if (!F.isForever() || !cur) return toast('Choose WoW Forever, a ruleset and any auction house of your faction first.', 'bad');
    const group = houses.filter(h => h.faction === cur.faction), out = $('#stCompareOut'), btn = $('#stCompare');
    btn.disabled = true;
    try {
      const res = await F.compareHouses(st.S.realmSlug, group, (i, n) => { out.innerHTML = `<p class="muted small">Downloading house ${i} of ${n}…</p>`; });
      const names = (res.find(r => r.prices.length) || { prices: [] }).prices.map(p => p[0]);
      out.innerHTML = `<p class="small muted">Find the row whose lowest prices match what you see in-game, then click Use.</p><div class="tablewrap"><table><thead><tr><th>House</th><th class="num">Listings</th>${names.map(n => `<th class="num">${esc(n)}</th>`).join('')}<th></th></tr></thead><tbody>
        ${res.map(r => r.error ? `<tr><td>${esc(houseLabel(r.h))}</td><td colspan="${names.length + 2}" class="muted">${esc(r.error)}</td></tr>` : `<tr><td>${esc(houseLabel(r.h))}</td><td class="num">${r.count.toLocaleString()}</td>${r.prices.map(p => `<td class="num">${money(p[1])}</td>`).join('')}<td><button class="btn sm" data-usehouse="${esc(r.h.id)}">Use</button></td></tr>`).join('')}</tbody></table></div>`;
    } finally { btn.disabled = false; }
  }
  async function loadRealmsUi() {
    try {
      log(`Loading realms for namespace ${F.ns('dynamic')}…`);
      const realms = F.isForever() ? await F.loadRulesets() : await F.loadRealms();
      F.save('realms', realms);
      fillRealms(realms);
      log(`Found ${realms.length} realms.`);
      if (!realms.length) toast('No realms found for this game version.', 'bad');
    } catch (e) {
      log('Loading realms failed: ' + e.message);
      if (e.status === 404 || e.status === 403) {
        toast(`No realms for "${F.nsBase()}" in this region. Checking which game versions exist…`, 'bad');
        probeUi();
      } else toast(e.message, 'bad');
    }
  }
  async function probeUi() {
    const out = $('#stProbeOut');
    out.innerHTML = '<p class="muted small">Checking…</p>';
    try {
      const res = await F.probeNamespaces();
      const b = res.baseline;
      const anyOk = res.some(r => !r.error);
      let note = '';
      if (b && !b.ok) note = `<div class="banner" style="margin-top:8px">Even the retail API refused your key (${esc(b.error)}). The problem is the API client, not the game version:
        the app already retried with a fresh token. Check the Client ID/Secret, make sure the client still exists on develop.battle.net, clear the "access token" field if you pasted one, then try again in a few minutes in case Blizzard is limiting requests.</div>`;
      else if (b && b.ok && !anyOk) note = `<div class="banner" style="margin-top:8px">Your API key works (retail returned ${b.count} realms), but Blizzard refuses every Classic/Forever game version in region <b>${esc(st.S.region.toUpperCase())}</b>.
        Blizzard doesn't serve Forever auction data through its public API (at least not yet). Use the <a href="#" data-goto="prices">Auctionator import</a> on the Prices tab instead: scan in-game, <code>/reload</code>, import <code>Auctionator.lua</code>.</div>`;
      const fr = res.forever || [];
      const auc = fr.find(x => x.label === 'Auction listings');
      if (auc && b && b.ok) note += `<div class="banner ${auc.ok ? 'info' : ''}" style="margin-top:8px">${auc.ok ? '<b>Forever auction listings work.</b> Choose WoW Forever, click Load realms / rulesets, pick your ruleset and house, then update prices.' : '<b>Forever auction listings are not available through the API.</b> Use <b>Link Auctionator file</b> on the Prices tab for prices. Item data can still come from the API if its row below is OK.'}</div>`;
      note += `<div class="tablewrap" style="margin-top:8px"><table><tbody>${fr.map(x => `<tr><td>${esc(x.label)}</td><td class="${x.ok ? 'good' : 'muted'}">${x.ok ? 'OK' + (x.info ? ' · ' + esc(x.info) : '') : esc(x.error)}</td></tr>`).join('')}</tbody></table></div>`;
      out.innerHTML = note + `<div class="tablewrap" style="margin-top:8px"><table><tbody>${res.map(r => r.error
        ? `<tr><td><code>${esc(r.ns)}</code></td><td class="muted">not available (${esc(r.error)})</td><td></td></tr>`
        : `<tr><td><code>${esc(r.ns)}</code></td><td>${r.count} realms: <span class="muted">${esc(r.sample.join(', '))}${r.count > r.sample.length ? '…' : ''}</span></td><td><button class="btn sm" data-usens="${esc(r.ns)}">Use</button></td></tr>`).join('')}</tbody></table></div>`;
      log('Namespace check: ' + res.map(r => r.ns + '=' + (r.error || r.count + ' realms')).join(', '));
    } catch (e) { out.innerHTML = ''; toast(e.message, 'bad'); }
  }
  function updateSettings() {
    const s = st.S;
    renderServerStatus();
    $('#stCustomNsBox').classList.toggle('hidden', s.namespace !== 'custom');
    $('#stRealmInfo').innerHTML = F.isForever()
      ? (F.hasMarket() ? `Using Forever <b>${esc(s.realmName)}</b> · ${esc(s.ahName)} · namespace <code>${esc(F.ns('dynamic'))}</code>` : 'Pick a ruleset and auction house. Use <b>Compare houses</b> to confirm which house is your market.')
      : s.connectedRealmId
      ? `Using <b>${esc(s.realmName || s.realmSlug)}</b> (connected realm ${s.connectedRealmId})${s.ahName ? ' · ' + esc(s.ahName) : ''} · namespace <code>${esc(F.ns('dynamic'))}</code>`
      : `No realm selected yet · namespace <code>${esc(F.ns('dynamic'))}</code>`;
    const probs = F.idProblems();
    const known = [...F.items().values()].filter(it => it.id && st.meta[it.id] && !st.meta[it.id].missing).length;
    $('#stItemInfo').innerHTML = `${known} items have Blizzard item info. ${probs.length ? `<span class="warn">${probs.length} items have a missing or wrong ID:</span>
      <div class="muted" style="margin-top:4px">${probs.slice(0, 40).map(p => `${esc(p.it.name)} <span class="dim">(${esc(p.why)})</span>`).join(' · ')}${probs.length > 40 ? ' …' : ''}</div>` : '<span class="good">No ID problems found.</span>'}`;
  }

  async function pullServerUi(manualTrigger) {
    const changed = await F.pullServer(manualTrigger);
    if (changed) refresh();
    else if (F.serverStatus) renderServerStatus();
    if (manualTrigger && F.serverMode) toast(changed ? 'Latest prices loaded from your home server.' : 'Your home server has no price data yet.', changed ? 'good' : '');
  }
  function renderServerStatus() {
    const el = $('#stServer'), s = F.serverStatus;
    if (!el || !s) return;
    el.innerHTML = s.enabled
      ? `<div class="banner info"><b>Prices come from your home server</b> (${esc(s.label)}), updated in the background${s.dataTs ? '. Blizzard\'s latest copy is from ' + F.timeAgo(s.dataTs) : ''}. Steps 1 and 2 aren't needed for prices. To change market, update the container's settings.${s.error ? ' <span class="warn">' + esc(s.error) + '</span>' : ''}</div>`
      : `<div class="banner">${esc(s.error)}</div>`;
  }
  async function doSync(manualTrigger) {
    if (F.serverMode) return pullServerUi(manualTrigger);
    if (!F.hasMarket()) {
      if (manualTrigger) { toast('Connect the Blizzard API and pick a realm first, or import prices on the Prices tab.'); showTab('settings'); }
      return;
    }
    const btn = $('#syncBtn');
    btn.disabled = true;
    try {
      const r = await F.syncAuctions(msg => { log(msg); renderHeader(msg); });
      if (r) {
        log(`Prices updated: ${r.auctions.toLocaleString()} auctions, ${r.all.toLocaleString()} different items, ${r.items} used by recipes.`);
        if (manualTrigger) toast(`Prices updated from ${r.auctions.toLocaleString()} auctions.`, 'good');
        const missingInfo = [...F.items().values()].some(it => it.id && !st.meta[it.id] && F.isUsed(it.name));
        if (missingInfo) await checkItems(false);
      }
    } catch (e) {
      log('Price update failed: ' + e.message);
      if (manualTrigger) toast('Price update failed: ' + e.message, 'bad');
    } finally {
      btn.disabled = false;
      refresh();
    }
  }
  async function checkItems(force) {
    const ids = [...new Set([...F.items().values()].filter(it => it.id && (F.isUsed(it.name) || F.DE_MATS.includes(it.name))).map(it => it.id))]
      .filter(id => force || !st.meta[id]);
    if (!ids.length) { log('Item info already loaded.'); return; }
    try {
      log(`Loading item info for ${ids.length} items…`);
      const r = await F.fetchItemInfo(ids, (d, t) => renderHeader(`item info ${d}/${t}`));
      log(`Item info: ${r.ok} loaded, ${r.notFound} not found, ${r.failed} failed${r.lastError ? ' (' + r.lastError + ')' : ''}.`);
      const probs = F.idProblems();
      if (probs.length) log(`${probs.length} items have missing or mismatched IDs. Use "Fix missing/wrong IDs by name".`);
    } catch (e) { log('Item info failed: ' + e.message); toast(e.message, 'bad'); }
    refresh();
  }
  async function fixIds() {
    const probs = F.idProblems();
    if (!probs.length) return toast('No ID problems found. Run "Check item IDs" first if you haven\'t.');
    let fixed = 0, none = 0, failed = 0;
    const newIds = [];
    log(`Searching Blizzard for ${probs.length} items by name…`);
    for (const [i, { it }] of probs.entries()) {
      renderHeader(`fixing IDs ${i + 1}/${probs.length}`);
      try {
        const id = await F.searchItemId(it.name);
        if (id && id !== it.id) { F.setItemId(it.name, id); newIds.push(id); fixed++; log(`  ${it.name}: ${it.id || '?'} → ${id}`); }
        else none++;
      } catch (e) {
        failed++;
        if (failed === 1) log('  Search failed: ' + e.message);
        if (failed >= 5) { log('  Stopping: item search is not available for this game version.'); break; }
      }
    }
    F.rebuild();
    if (newIds.length) await F.fetchItemInfo(newIds);
    log(`Fixed ${fixed} IDs, ${none} not found by name${failed ? ', ' + failed + ' errors' : ''}.`);
    toast(`Fixed ${fixed} item IDs.`, fixed ? 'good' : '');
    refresh();
  }
  async function autoTick() {
    const s = st.S;
    if (F.serverMode || !s.autoRefresh || F.syncing || !F.hasMarket() || !F.hasCredentials()) return;
    if (st.ah && st.ah.source !== 'Blizzard API') return; // never replace imported prices with another realm's
    const age = st.ah ? Date.now() - st.ah.ts : Infinity;
    if (age < Math.max(15, +s.refreshMinutes || 60) * 60000) return;
    log('Automatic price update…');
    await doSync(false);
  }

  // ---------------------------------------------------------------- boot
  const MOUNTERS = { best: mountBest, planner: mountPlanner, de: mountDE, prices: mountPrices, recipes: mountRecipes, settings: mountSettings };
  const UPDATERS = { best: updateBest, planner: updatePlanner, de: updateDE, prices: updatePrices, recipes: updateRecipes, settings: updateSettings };

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#syncBtn').addEventListener('click', () => doSync(true));
  $('#budgetInput').addEventListener('input', debounce(() => {
    const v = F.parseMoney($('#budgetInput').value);
    if (v != null && v >= 0) { setS('budget', v); refresh(); }
  }, 400));
  $('#budgetInput').addEventListener('blur', () => renderHeader());
  document.addEventListener('click', e => {
    const g = e.target.closest('#ahStatus [data-goto], #tab-settings [data-goto]');
    if (g) { e.preventDefault(); showTab(g.dataset.goto); }
    if (e.target.closest('[data-close]') || e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  fillDatalists();
  showTab(MOUNTERS[currentTab] ? currentTab : 'best');
  setInterval(() => { renderHeader(); autoTick(); }, 60000);
  pullServerUi(false).finally(() => setTimeout(autoTick, 2500));
  setInterval(() => pullServerUi(false), 300000);
  setInterval(pollAuctionator, 30000);
  window.FAH_UI = { refresh, showTab, log, pollAuctionator };
})();
