'use strict';
// Core engine: storage, item/recipe tables, pricing, disenchanting, budget math,
// Blizzard API sync and price importers. UI lives in app-ui.js.
(function () {
  const F = window.FAH = {};

  F.PROFS = ['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Leatherworking', 'Tailoring', 'Mining', 'Cooking', 'First Aid'];
  F.SRC_LABEL = { T: 'Trainer', V: 'Vendor pattern', D: 'Drop pattern', Q: 'Quest', R: 'Reputation', C: 'Custom' };
  F.QNAMES = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const QMAP = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };

  // ---------------------------------------------------------------- utils
  F.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  F.norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  F.sleep = ms => new Promise(r => setTimeout(r, ms));

  function splitCoins(c) {
    const v = Math.round(Math.abs(c));
    return { g: Math.floor(v / 10000), s: Math.floor((v % 10000) / 100), c: v % 100 };
  }
  // HTML money with coin colors. >= 1g drops copper for readability.
  F.money = (c) => {
    if (c == null || !isFinite(c)) return '<span class="muted">—</span>';
    const neg = c < 0, p = splitCoins(c);
    let out;
    if (p.g) out = `${p.g.toLocaleString()}<i class="cg">g</i> ${p.s}<i class="cs">s</i>`;
    else if (p.s) out = `${p.s}<i class="cs">s</i> ${p.c}<i class="cc">c</i>`;
    else out = `${p.c}<i class="cc">c</i>`;
    return `<span class="money${neg ? ' neg' : ''}">${neg ? '−' : ''}${out}</span>`;
  };
  F.moneyText = (c) => {
    if (c == null || !isFinite(c)) return '';
    const p = splitCoins(c), parts = [];
    if (p.g) parts.push(p.g + 'g');
    if (p.s) parts.push(p.s + 's');
    if (p.c || !parts.length) parts.push(p.c + 'c');
    return (c < 0 ? '-' : '') + parts.join(' ');
  };
  // "12g 50s", "3s20c", "75c" or a plain number (= gold).
  F.parseMoney = (str, plainUnit = 'gold') => {
    if (str == null) return null;
    str = String(str).trim().toLowerCase().replace(/,/g, '');
    if (!str) return null;
    const re = /(-?\d+(?:\.\d+)?)\s*([gsc])/g;
    let m, total = 0, found = false;
    while ((m = re.exec(str))) { found = true; total += parseFloat(m[1]) * (m[2] === 'g' ? 10000 : m[2] === 's' ? 100 : 1); }
    if (found) return Math.round(total);
    const n = parseFloat(str);
    if (!isFinite(n)) return null;
    return Math.round(plainUnit === 'copper' ? n : n * 10000);
  };
  F.timeAgo = ts => {
    if (!ts) return 'never';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 48) return h + ' h ago';
    return Math.round(h / 24) + ' days ago';
  };

  // ---------------------------------------------------------------- storage
  const LSP = 'wowforever-ah.v1.';
  F.load = (k, d) => { try { const v = localStorage.getItem(LSP + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  F.save = (k, v) => {
    try { localStorage.setItem(LSP + k, JSON.stringify(v)); return true; }
    catch (e) { F.onError && F.onError('Could not save "' + k + '" in browser storage (' + e.name + ').'); return false; }
  };
  F.remove = k => { try { localStorage.removeItem(LSP + k); } catch (e) { /* ignore */ } };

  const DEFAULTS = {
    region: 'us', namespace: 'forever', foreverBuild: '1.60.1_70399', customNamespace: '', aucRealm: '', realmSlug: '', realmName: '', connectedRealmId: 0,
    ahId: '', ahName: '', clientId: '', rememberSecret: false, manualToken: '', autoRefresh: true, refreshMinutes: 60,
    priceSource: 'market', ahCut: 5, craftIntermediates: true, includePatterns: true, ignoreSkill: false,
    deWithoutSkill: false, depth: true, budget: 1000000, hideNoProduct: true, hideIncomplete: false,
    groupMode: 'none', topN: 5, sortKey: 'profit', sortDir: -1, profFilter: '', search: '', minProfit: '',
    linkTemplate: 'https://www.wowhead.com/forever/item={id}', csvUnit: 'copper', csvTarget: 'manual', tab: 'best',
    sellDays: '', plannerRecipe: '', plannerCap: '', deMinProfit: '', deQuality: 'all', priceFilter: 'used', recipeFilter: 'all',
    recipeProf: '', recipeSearch: '', priceSearch: ''
  };
  const st = F.st = {
    S: Object.assign({}, DEFAULTS, F.load('settings', {})),
    skills: F.load('skills', {}),
    known: F.load('known', {}),
    manual: F.load('manual', {}),
    itemEdits: F.load('itemEdits', {}),
    recipeEdits: F.load('recipeEdits', {}),
    customRecipes: F.load('customRecipes', []),
    customItems: F.load('customItems', {}),
    ah: F.load('ah', null),
    ahPrev: F.load('ahPrev', {}),
    meta: F.load('meta', {}),
    sales: F.load('sales', null),
    saleRates: F.load('saleRates', {}),
    secret: F.load('secret', ''),
    tok: F.load('token', null)
  };
  F.saveSettings = () => F.save('settings', st.S);
  // Item lookups against the unversioned Forever namespace wrongly marked IDs as missing; clear those once.
  if (!st.S.metaFixed1) {
    st.S.metaFixed1 = true;
    if (st.S.namespace === 'classic1x' && !st.S.realmSlug) st.S.namespace = 'forever';
    F.saveSettings();
    for (const id of Object.keys(st.meta)) if (st.meta[id].missing) delete st.meta[id];
    F.save('meta', st.meta);
  }
  F.DEFAULTS = DEFAULTS;

  // ---------------------------------------------------------------- data tables
  F.parseReagents = str => String(str || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*\*\s*(\d+)$/);
    return m ? { name: m[1].trim(), qty: +m[2] } : { name: s, qty: 1 };
  });

  let ITEMS, BY_ID, RECIPES, BY_PRODUCT, BY_KEY, USED;
  F.rebuild = () => {
    ITEMS = new Map();
    const add = (name, a, custom) => {
      const it = { name, id: a[0] || 0, vendor: a[1] || 0, q: a[2] == null ? null : a[2], ilvl: a[3] == null ? null : a[3], kind: a[4] || '', icon: a[5] || '', custom };
      ITEMS.set(name, it);
      return it;
    };
    for (const [n, a] of Object.entries(window.WOW_ITEMS || {})) add(n, a, false);
    for (const [n, a] of Object.entries(st.customItems)) if (!ITEMS.has(n)) add(n, a, true);
    for (const [n, e] of Object.entries(st.itemEdits)) {
      const it = ITEMS.get(n) || add(n, [0], true);
      if (e.id != null) it.id = e.id;
      if (e.vendor != null) it.vendor = e.vendor;
      it.edited = true;
    }
    RECIPES = [];
    for (const [prof, list] of Object.entries(window.WOW_RECIPES || {})) {
      for (const row of list) {
        const [name, skill, reag, src = 'T', o = {}] = row;
        let r = {
          key: prof + '|' + name, prof, name, skill, reagents: Array.isArray(reag) ? reag : F.parseReagents(reag), src: src[0], u: src.includes('u'),
          n: o.n || 1, product: o.p === undefined ? name : o.p, cd: o.cd || 0, note: o.note || '', icon: o.i || '', builtin: true
        };
        const ed = st.recipeEdits[r.key];
        if (ed) {
          if (ed.deleted) continue;
          r = Object.assign(r, ed, { edited: true, u: false });
        }
        RECIPES.push(r);
      }
    }
    for (const c of st.customRecipes) RECIPES.push(Object.assign({}, c, { custom: true, src: c.src || 'C' }));
    BY_PRODUCT = new Map();
    BY_KEY = new Map();
    USED = new Set();
    for (const r of RECIPES) {
      BY_KEY.set(r.key, r);
      for (const g of r.reagents) { F.item(g.name); USED.add(g.name); }
      if (r.product) {
        USED.add(r.product);
        F.item(r.product);
        if (!BY_PRODUCT.has(r.product)) BY_PRODUCT.set(r.product, []);
        BY_PRODUCT.get(r.product).push(r);
      }
    }
    for (const m of DE_MATS) F.item(m);
    BY_ID = new Map();
    for (const it of ITEMS.values()) if (it.id) BY_ID.set(it.id, it);
  };
  F.item = name => {
    let it = ITEMS.get(name);
    if (!it) { it = { name, id: 0, vendor: 0, q: null, ilvl: null, kind: '', custom: true }; ITEMS.set(name, it); }
    return it;
  };
  F.items = () => ITEMS;
  F.itemById = id => BY_ID.get(+id);
  F.recipes = () => RECIPES;
  F.recipeByKey = k => BY_KEY.get(k);
  F.recipesFor = product => BY_PRODUCT.get(product) || [];
  F.isUsed = name => USED.has(name);

  // Effective item properties: Blizzard item data wins over the built-in estimates.
  F.info = it => {
    const m = it.id ? st.meta[it.id] : null;
    if (m && !m.missing) {
      return { q: m.q, ilvl: m.l || it.ilvl, kind: m.c === 2 ? 'w' : m.c === 4 ? 'a' : '', sell: m.s || 0, api: true, apiName: m.n };
    }
    return { q: it.q, ilvl: it.ilvl, kind: it.kind, sell: 0, api: false };
  };
  F.vendorBuy = it => {
    if (!it.vendor) return 0;
    const m = it.id && st.meta[it.id];
    return (m && m.b) || it.vendor;
  };
  F.PROF_ICON = { Alchemy: 'trade_alchemy', Blacksmithing: 'trade_blacksmithing', Enchanting: 'trade_engraving', Engineering: 'trade_engineering', Leatherworking: 'inv_misc_armorkit_17', Tailoring: 'trade_tailoring', Mining: 'trade_mining', Cooking: 'inv_misc_food_15', 'First Aid': 'spell_holy_sealofsacrifice' };
  F.iconImg = icon => `<img class="ico" src="https://wow.zamimg.com/images/wow/icons/medium/${F.esc(icon || 'inv_misc_questionmark')}.jpg" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
  F.itemLink = (name, extraClass = '') => {
    const it = F.item(name), q = F.info(it).q;
    const cls = `item q${q == null ? 1 : q} ${extraClass}`;
    const label = (extraClass.includes('noico') ? '' : F.iconImg(it.icon)) + F.esc(name);
    if (it.id && st.S.linkTemplate) {
      const href = st.S.linkTemplate.replace('{id}', it.id);
      return `<a class="${cls}" href="${F.esc(href)}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<span class="${cls}">${label}</span>`;
  };

  // ---------------------------------------------------------------- auction data
  F.ahEntry = it => {
    const ah = st.ah;
    if (!it.id || !ah) return null;
    if (ah.items && ah.items[it.id]) return ah.items[it.id];
    const a = ah.all && ah.all[it.id];
    return a ? { min: a[0], mkt: a[0], qty: a[1] } : null;
  };
  F.ahPrice = it => {
    const e = F.ahEntry(it);
    if (!e) return null;
    return st.S.priceSource === 'min' ? e.min : (e.mkt || e.min);
  };
  F.hasBooks = () => !!(st.ah && st.ah.books);

  // TSM-style market value: weighted average of the cheapest ~15% of listed units,
  // stopping early at a >20% price jump so a few cheap outliers don't drag it down.
  function marketValue(book, total) {
    const target = Math.max(1, Math.ceil(total * 0.15));
    let n = 0, sum = 0, prev = null;
    for (const [p, q] of book) {
      if (prev != null && n > 0 && p > prev * 1.2) break;
      const take = Math.min(q, target - n);
      sum += p * take; n += take; prev = p;
      if (n >= target) break;
    }
    return Math.round(sum / n);
  }

  // The API only exposes current listings, so sales are inferred by comparing snapshots. A listing with
  // hours left that vanishes (or shrinks) probably sold, unless it reappears cheaper as an undercut repost.
  function updateSales(auctions, label) {
    const now = Date.now(), cur = new Map();
    for (const a of auctions) {
      const item = a.item && a.item.id;
      if (!a.id || !BY_ID.has(item)) continue;
      const q = a.quantity || 1, unit = a.unit_price != null ? a.unit_price : (a.buyout ? a.buyout / q : 0);
      cur.set(item + '|' + a.id, [item, a.id, q, Math.round(unit), a.time_left === 'LONG' || a.time_left === 'VERY_LONG' ? 1 : 0]);
    }
    const prev = F.load('ahSnap', null);
    let sales = st.sales && st.sales.label === label ? st.sales : { label, hours: 0, sold: {} };
    const gap = prev && prev.label === label ? (now - prev.ts) / 3600000 : null;
    if (gap != null && gap > 0 && gap <= 3) {
      let changed = false;
      const old = new Map(), fresh = new Map(), gone = [];
      for (const [item, flat] of Object.entries(prev.items)) {
        for (let i = 0; i < flat.length; i += 4) old.set(item + '|' + flat[i], [+item, flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
      }
      const add = (item, q) => { sales.sold[item] = (sales.sold[item] || 0) + q; };
      for (const [k, p] of old) {
        const c = cur.get(k);
        if (!c) { changed = true; if (p[4]) gone.push(p); }
        else if (c[2] < p[2]) { changed = true; add(p[0], p[2] - c[2]); }
      }
      for (const [k, c] of cur) {
        if (old.has(k)) continue;
        changed = true;
        const key = c[0] + '|' + c[2];
        if (!fresh.has(key)) fresh.set(key, []);
        fresh.get(key).push(c[3]);
      }
      for (const p of gone) {
        const list = fresh.get(p[0] + '|' + p[2]), i = list ? list.findIndex(u => u < p[3]) : -1;
        if (i >= 0) list.splice(i, 1); else add(p[0], p[2]);
      }
      // Blizzard's data only changes about hourly; an identical download isn't new observation time.
      if (!changed) return;
      sales.hours += gap;
      if (sales.hours > 336) { // keep roughly the last two weeks
        const f = 336 / sales.hours;
        sales.hours = 336;
        for (const id of Object.keys(sales.sold)) sales.sold[id] *= f;
      }
    }
    const items = {};
    for (const c of cur.values()) (items[c[0]] = items[c[0]] || []).push(c[1], c[2], c[3], c[4]);
    st.sales = sales;
    F.save('sales', sales);
    F.save('ahSnap', { ts: now, label, items });
  }
  // Units per day: your own figure if set, otherwise an estimate once 6+ hours have been observed.
  F.saleRate = name => {
    if (st.saleRates[name] != null) return { rate: st.saleRates[name], manual: true };
    const it = F.item(name), s = st.sales;
    if (!it.id || !s || s.hours < 6) return null;
    return { rate: (s.sold[it.id] || 0) / s.hours * 24, manual: false };
  };

  // auctions: [{item:{id}, quantity, buyout | unit_price}]
  F.applyAuctions = (auctions, label, source, dataTs) => {
    updateSales(auctions, label);
    const per = new Map();
    for (const a of auctions) {
      const id = a.item && a.item.id;
      if (!id) continue;
      const q = a.quantity || 1;
      let unit = a.unit_price != null ? a.unit_price : (a.buyout ? a.buyout / q : null);
      if (!unit) continue;
      unit = Math.round(unit);
      let m = per.get(id);
      if (!m) per.set(id, (m = new Map()));
      m.set(unit, (m.get(unit) || 0) + q);
    }
    const items = {}, all = {};
    for (const [id, m] of per) {
      const book = [...m.entries()].sort((a, b) => a[0] - b[0]);
      let qty = 0;
      for (const x of book) qty += x[1];
      all[id] = [book[0][0], qty];
      if (BY_ID.has(id)) items[id] = { min: book[0][0], mkt: marketValue(book, qty), qty, book: book.slice(0, 120) };
    }
    if (st.ah && st.ah.items) {
      const prev = {};
      for (const [id, e] of Object.entries(st.ah.items)) prev[id] = e.mkt || e.min;
      st.ahPrev = prev;
      F.save('ahPrev', prev);
    }
    st.ah = { ts: Date.now(), dataTs: dataTs || 0, label, source, count: auctions.length, books: true, items, all };
    F.save('ah', st.ah);
    return { auctions: auctions.length, items: Object.keys(items).length, all: per.size };
  };

  // Docker mode: the container fetches prices in the background and the app just reads them.
  F.serverMode = false;
  F.serverStatus = null;
  F.pullServer = async force => {
    let s;
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) return null;
      s = await res.json();
    } catch (e) { return null; }
    F.serverStatus = s;
    F.serverMode = !!s.enabled;
    if (!s.enabled || !s.ts) return false;
    if (!force && st.ah && st.ah.source === 'Home server' && st.ah.ts === s.ts) return false;
    const m = await (await fetch('/api/market', { cache: 'no-store' })).json();
    const items = {}, all = {};
    for (const [id, e] of Object.entries(m.items)) {
      all[id] = [e.min, e.qty];
      if (BY_ID.has(+id)) items[id] = e;
    }
    if (st.ah && st.ah.items) {
      const prev = {};
      for (const [id, e] of Object.entries(st.ah.items)) prev[id] = e.mkt || e.min;
      st.ahPrev = prev;
      F.save('ahPrev', prev);
    }
    st.ah = { ts: m.ts, dataTs: m.dataTs || 0, label: m.label, source: 'Home server', count: m.count, books: true, items, all };
    F.save('ah', st.ah);
    const sold = {};
    for (const [id, q] of Object.entries(m.sales.sold)) if (BY_ID.has(+id)) sold[id] = q;
    st.sales = { label: m.sales.label, hours: m.sales.hours, sold };
    F.save('sales', st.sales);
    return true;
  };

  // Simple price list (Auctionator / CSV): {id: [price, qty|null]}
  F.applyPriceList = (prices, label, source) => {
    const items = {}, all = {};
    for (const [id, [p, q]] of Object.entries(prices)) {
      all[id] = [p, q || 0];
      if (BY_ID.has(+id)) items[id] = { min: p, mkt: p, qty: q || 0 };
    }
    if (st.ah && st.ah.items) {
      const prev = {};
      for (const [id, e] of Object.entries(st.ah.items)) prev[id] = e.mkt || e.min;
      st.ahPrev = prev;
      F.save('ahPrev', prev);
    }
    st.ah = { ts: Date.now(), label, source, count: Object.keys(all).length, books: false, items, all };
    F.save('ah', st.ah);
    return Object.keys(items).length;
  };

  // ---------------------------------------------------------------- pricing engine
  F.canCraft = r => {
    if (st.known[r.key] === false) return false;
    if (r.skill <= 0) return true;
    if (st.S.ignoreSkill) return true;
    const sk = +st.skills[r.prof] || 0;
    if (sk < r.skill) return false;
    if (r.src !== 'T' && r.src !== 'C' && !st.S.includePatterns && !st.known[r.key]) return false;
    return true;
  };
  F.newCtx = () => ({ buy: new Map(), sell: new Map() });
  // The stack holds recipe keys and "p:<item>" for every item being produced further up the chain,
  // so an intermediate is never made out of the item it is ultimately used to make
  // (e.g. combining essences only to split them again).
  const rootStack = r => new Set(r.product ? [r.key, 'p:' + r.product] : [r.key]);
  const blocked = (r, name, stack) => stack.has(r.key) || stack.has('p:' + name) || r.reagents.some(g => stack.has('p:' + g.name));

  // Cheapest way to obtain one unit: manual price, AH, vendor, or crafting it yourself.
  F.buyInfo = (name, ctx, stack) => {
    if (ctx.buy.has(name)) return ctx.buy.get(name);
    stack = stack || new Set();
    const S = st.S;
    if (st.manual[name] != null) {
      const r = { price: st.manual[name], src: 'Manual' };
      ctx.buy.set(name, r);
      return r;
    }
    const it = F.item(name);
    let best = null, cyc = false;
    const a = F.ahPrice(it);
    if (a != null) best = { price: a, src: 'AH' };
    const v = F.vendorBuy(it);
    if (v && (!best || v < best.price)) best = { price: v, src: 'Vendor' };
    if (S.craftIntermediates) {
      for (const r of F.recipesFor(name)) {
        if (!F.canCraft(r)) continue;
        if (blocked(r, name, stack)) { cyc = true; continue; }
        stack.add(r.key); stack.add('p:' + name);
        const c = F.craftCost(r, ctx, stack);
        stack.delete(r.key); stack.delete('p:' + name);
        if (c.tainted) cyc = true;
        if (c.cost != null && (!best || c.cost / r.n < best.price)) best = { price: c.cost / r.n, src: 'Craft', rec: r };
      }
    }
    // Results that depended on a blocked (context-specific) path are not cached.
    const res = Object.assign({}, best || { price: null, src: '—' }, { t: cyc });
    if (!cyc) ctx.buy.set(name, res);
    return res;
  };
  F.craftCost = (r, ctx, stack) => {
    let cost = 0, tainted = false;
    const missing = [], parts = [];
    for (const g of r.reagents) {
      const b = F.buyInfo(g.name, ctx, stack);
      if (b.t) tainted = true;
      parts.push({ name: g.name, qty: g.qty, price: b.price, src: b.src, rec: b.rec });
      if (b.price == null) missing.push(g.name);
      else cost += b.price * g.qty;
    }
    return { cost: missing.length ? null : cost, missing, parts, tainted };
  };

  // What one unit is worth when you're done: AH (after cut), disenchant, or vendor.
  F.sellInfo = (name, ctx) => {
    if (ctx && ctx.sell.has(name)) return ctx.sell.get(name);
    const S = st.S, it = F.item(name), cut = 1 - S.ahCut / 100;
    let ahv = null, ahSrc = 'AH';
    if (st.manual[name] != null) { ahv = st.manual[name] * cut; ahSrc = 'AH (manual price)'; }
    else { const p = F.ahPrice(it); if (p != null) ahv = p * cut; }
    const de = F.deValue(it);
    const deOk = !!(de && de.ev != null && (S.deWithoutSkill || S.ignoreSkill || (+st.skills.Enchanting || 0) >= de.req));
    const vend = F.info(it).sell || 0;
    let best = null;
    const consider = (v, src) => { if (v != null && v > 0 && (!best || v > best.v)) best = { v, src }; };
    consider(ahv, ahSrc);
    if (deOk) consider(de.ev, 'Disenchant');
    consider(vend, 'Vendor');
    const res = { ah: ahv, ahSrc, de, deOk, vendor: vend, best };
    if (ctx) ctx.sell.set(name, res);
    return res;
  };

  F.evaluate = (r, ctx) => {
    const c = F.craftCost(r, ctx, rootStack(r));
    const out = r.product ? F.sellInfo(r.product, ctx) : null;
    const unit = out && out.best ? out.best.v : null;
    const revenue = unit != null ? unit * r.n : null;
    const profit = c.cost != null && revenue != null ? revenue - c.cost : null;
    const margin = profit != null && c.cost > 0 ? profit / c.cost : null;
    const pe = r.product ? F.ahEntry(F.item(r.product)) : null;
    return { r, cost: c.cost, missing: c.missing, parts: c.parts, out, revenue, profit, margin, supply: pe ? pe.qty : null, exit: out && out.best ? out.best.src : null };
  };

  // ---------------------------------------------------------------- budget / order-book math
  function walkBook(book, k, totalQty) {
    let need = k, cost = 0, last = 0, stored = 0;
    for (const [p, q] of book) {
      const t = Math.min(q, need);
      cost += t * p; need -= t; last = p; stored += q;
      if (need <= 0) return cost;
    }
    // The stored book is truncated to the cheapest levels; extrapolate the rest at the last price.
    if (totalQty > stored && need <= totalQty - stored) return cost + need * last;
    return null;
  }
  // Cost to obtain k units, walking real AH listings when depth is on.
  F.acquire = (name, k, stack, depth) => {
    if (k <= 0) return { cost: 0, src: '—', k };
    if (st.manual[name] != null) return { cost: st.manual[name] * k, src: 'Manual', k };
    const it = F.item(name);
    let best = null, short = false;
    const e = F.ahEntry(it);
    if (e) {
      if (depth && e.book) {
        const w = walkBook(e.book, k, e.qty);
        if (w == null) short = true; else best = { cost: w, src: 'AH', k };
      } else {
        const p = F.ahPrice(it);
        if (p != null) best = { cost: p * k, src: 'AH', k };
      }
    }
    const v = F.vendorBuy(it);
    if (v && (!best || v * k < best.cost)) best = { cost: v * k, src: 'Vendor', k };
    if (st.S.craftIntermediates) {
      for (const r of F.recipesFor(name)) {
        if (!F.canCraft(r) || blocked(r, name, stack)) continue;
        const crafts = Math.ceil(k / r.n);
        stack.add(r.key); stack.add('p:' + name);
        let cost = 0, ok = true;
        const children = [];
        for (const g of r.reagents) {
          const a = F.acquire(g.name, g.qty * crafts, stack, depth);
          children.push(Object.assign({ name: g.name }, a));
          if (a.cost == null) { ok = false; break; }
          cost += a.cost;
        }
        stack.delete(r.key); stack.delete('p:' + name);
        if (ok && (!best || cost < best.cost)) best = { cost, src: 'Craft', rec: r, crafts, children, k };
      }
    }
    return best || { cost: null, src: short ? 'AH (not enough listed)' : '—', short, k };
  };
  F.costForCrafts = (r, n, depth) => {
    let cost = 0;
    const stack = rootStack(r), nodes = [];
    for (const g of r.reagents) {
      const a = F.acquire(g.name, g.qty * n, stack, depth);
      nodes.push(Object.assign({ name: g.name }, a));
      if (a.cost == null) return { cost: null, short: g.name, nodes };
      cost += a.cost;
    }
    return { cost, nodes };
  };
  // Max crafts affordable with the budget. Depth mode walks the listings (prices rise as you buy).
  F.maxCrafts = (ev, budget, depth) => {
    if (ev.cost == null) return { n: null };
    const r = ev.r;
    let n;
    if (ev.cost <= 0) n = 10000;
    else n = Math.floor(budget / ev.cost);
    let limit = 'budget';
    if (depth && F.hasBooks()) {
      let lo = 0, hi = Math.max(1, n);
      let c = F.costForCrafts(r, hi, true);
      while (c.cost != null && c.cost <= budget && hi < 100000) { lo = hi; hi *= 2; c = F.costForCrafts(r, hi, true); }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        const cm = F.costForCrafts(r, mid, true);
        if (cm.cost != null && cm.cost <= budget) lo = mid; else hi = mid;
      }
      const chk = F.costForCrafts(r, lo + 1, true);
      if (chk.cost == null) limit = 'supply';
      n = lo;
    }
    if (r.cd && n > 1) { n = 1; limit = 'cooldown'; }
    const useDepth = depth && F.hasBooks();
    const cost = useDepth ? F.costForCrafts(r, n, true).cost : n * ev.cost;
    // With real listings each extra craft costs more; past some point a craft costs more than it sells for.
    // nBest = largest count whose last craft still pays for itself (marginal cost <= revenue per craft).
    let nBest = n, costBest = cost;
    if (useDepth && ev.revenue != null && ev.profit > 0 && n > 0) {
      const rev = ev.revenue;
      const marg = k => F.costForCrafts(r, k, true).cost - F.costForCrafts(r, k - 1, true).cost;
      if (marg(n) > rev) {
        let lo = 0, hi = n;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (marg(mid) <= rev) lo = mid; else hi = mid;
        }
        nBest = lo;
        costBest = F.costForCrafts(r, lo, true).cost;
      }
    }
    return { n, limit, cost, nBest, costBest };
  };
  // Flatten an acquire() tree into a shopping list + crafting steps.
  F.flattenPlan = (nodes) => {
    const leaves = new Map(), steps = new Map();
    const walk = list => {
      for (const n of list) {
        if (n.src === 'Craft') {
          const s = steps.get(n.rec.key) || { rec: n.rec, crafts: 0, depth: 0 };
          s.crafts += n.crafts;
          steps.set(n.rec.key, s);
          walk(n.children);
        } else {
          const l = leaves.get(n.name) || { name: n.name, qty: 0, cost: 0, src: n.src };
          l.qty += n.k;
          l.cost = n.cost == null || l.cost == null ? null : l.cost + n.cost;
          if (l.src !== n.src) l.src = l.src + ' + ' + n.src;
          leaves.set(n.name, l);
        }
      }
    };
    walk(nodes);
    return { leaves: [...leaves.values()], steps: [...steps.values()].reverse() };
  };

  // ---------------------------------------------------------------- disenchanting
  // Classic/Forever disenchant tables by item level.
  // Uncommon rows: [maxIlvl, dust, min, max, essence, min, max, shard, pDust, pEssence, pShard] (armor).
  // Weapons swap the dust/essence chances.
  const DE_GREEN = [
    [15, 'Strange Dust', 1, 2, 'Lesser Magic Essence', 1, 2, null, 0.80, 0.20, 0],
    [20, 'Strange Dust', 2, 3, 'Greater Magic Essence', 1, 2, 'Small Glimmering Shard', 0.75, 0.20, 0.05],
    [25, 'Strange Dust', 4, 6, 'Lesser Astral Essence', 1, 2, 'Small Glimmering Shard', 0.75, 0.15, 0.10],
    [30, 'Soul Dust', 1, 2, 'Greater Astral Essence', 1, 2, 'Large Glimmering Shard', 0.75, 0.20, 0.05],
    [35, 'Soul Dust', 2, 5, 'Lesser Mystic Essence', 1, 2, 'Small Glowing Shard', 0.75, 0.20, 0.05],
    [40, 'Vision Dust', 1, 2, 'Greater Mystic Essence', 1, 2, 'Large Glowing Shard', 0.75, 0.20, 0.05],
    [45, 'Vision Dust', 2, 5, 'Lesser Nether Essence', 1, 2, 'Small Radiant Shard', 0.75, 0.20, 0.05],
    [50, 'Dream Dust', 1, 2, 'Greater Nether Essence', 1, 2, 'Large Radiant Shard', 0.75, 0.20, 0.05],
    [55, 'Dream Dust', 2, 5, 'Lesser Eternal Essence', 1, 2, 'Small Brilliant Shard', 0.75, 0.20, 0.05],
    [60, 'Illusion Dust', 1, 2, 'Greater Eternal Essence', 1, 2, 'Large Brilliant Shard', 0.75, 0.20, 0.05],
    [999, 'Illusion Dust', 2, 5, 'Greater Eternal Essence', 2, 3, 'Large Brilliant Shard', 0.75, 0.20, 0.05]
  ];
  const DE_BLUE = [[25, 'Small Glimmering Shard'], [30, 'Large Glimmering Shard'], [35, 'Small Glowing Shard'], [40, 'Large Glowing Shard'],
    [45, 'Small Radiant Shard'], [50, 'Large Radiant Shard'], [55, 'Small Brilliant Shard'], [999, 'Large Brilliant Shard']];
  const DE_EPIC = [[45, 'Small Radiant Shard', 2, 4], [50, 'Large Radiant Shard', 2, 4], [55, 'Small Brilliant Shard', 2, 4],
    [60, 'Nexus Crystal', 1, 1], [999, 'Nexus Crystal', 1, 2]];
  const DE_MATS = ['Strange Dust', 'Soul Dust', 'Vision Dust', 'Dream Dust', 'Illusion Dust',
    'Lesser Magic Essence', 'Greater Magic Essence', 'Lesser Astral Essence', 'Greater Astral Essence',
    'Lesser Mystic Essence', 'Greater Mystic Essence', 'Lesser Nether Essence', 'Greater Nether Essence',
    'Lesser Eternal Essence', 'Greater Eternal Essence', 'Small Glimmering Shard', 'Large Glimmering Shard',
    'Small Glowing Shard', 'Large Glowing Shard', 'Small Radiant Shard', 'Large Radiant Shard',
    'Small Brilliant Shard', 'Large Brilliant Shard', 'Nexus Crystal'];
  F.DE_MATS = DE_MATS;
  F.DE_BRACKETS = [[5, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40], [41, 45], [46, 50], [51, 55], [56, 60], [61, 65]];

  F.deOutcomes = (q, ilvl, kind) => {
    if (!ilvl || !(kind === 'a' || kind === 'w')) return null;
    if (q === 2) {
      const b = DE_GREEN.find(x => ilvl <= x[0]);
      const [, d, dn, dx, e, en, ex, sh, pd, pe, ps] = b;
      const w = kind === 'w';
      const out = [[w ? pe : pd, d, dn, dx], [w ? pd : pe, e, en, ex]];
      if (sh) out.push([ps, sh, 1, 1]);
      return out;
    }
    if (q === 3) {
      const b = DE_BLUE.find(x => ilvl <= x[0]);
      return b[0] === 999 ? [[0.995, b[1], 1, 1], [0.005, 'Nexus Crystal', 1, 1]] : [[1, b[1], 1, 1]];
    }
    if (q === 4) {
      const b = DE_EPIC.find(x => ilvl <= x[0]);
      return [[1, b[1], b[2], b[3]]];
    }
    return null;
  };
  F.deReq = ilvl => {
    const t = [[20, 1], [25, 25], [30, 50], [35, 75], [40, 100], [45, 125], [50, 150], [55, 175], [60, 200]];
    for (const [l, s] of t) if (ilvl <= l) return s;
    return 225;
  };
  F.matValue = name => {
    const cut = 1 - st.S.ahCut / 100;
    if (st.manual[name] != null) return st.manual[name] * cut;
    const p = F.ahPrice(F.item(name));
    return p == null ? null : p * cut;
  };
  F.deFromOutcomes = (outs) => {
    let ev = 0;
    const missing = [];
    for (const [p, mat, a, b] of outs) {
      const v = F.matValue(mat);
      if (v == null) missing.push(mat); else ev += p * ((a + b) / 2) * v;
    }
    return { ev: missing.length ? null : ev, missing };
  };
  F.deValue = it => {
    const inf = F.info(it);
    const outs = F.deOutcomes(inf.q, inf.ilvl, inf.kind);
    if (!outs) return null;
    const r = F.deFromOutcomes(outs);
    return { ev: r.ev, missing: r.missing, outs, req: F.deReq(inf.ilvl), q: inf.q, ilvl: inf.ilvl, kind: inf.kind, api: inf.api };
  };

  // ---------------------------------------------------------------- Blizzard API
  F.nsBase = () => (st.S.namespace === 'custom' ? (st.S.customNamespace || '').trim() : st.S.namespace);
  // Forever's static data is versioned: static-<build>-forever-<region> (plain static-forever returns 403).
  F.ns = kind => (kind === 'static' && F.nsBase() === 'forever'
    ? `static-${(st.S.foreverBuild || '').trim()}-forever-${st.S.region}`
    : `${kind}-${F.nsBase()}-${st.S.region}`);
  F.hasCredentials = () => !!((st.S.manualToken || '').trim() || (st.S.clientId && st.secret));

  F.getToken = async (force) => {
    const S = st.S;
    if (S.manualToken && S.manualToken.trim()) return S.manualToken.trim();
    if (!force && st.tok && st.tok.exp > Date.now() + 60000 && st.tok.cid === S.clientId) return st.tok.access;
    if (!S.clientId || !st.secret) throw new Error('Add your Blizzard API Client ID and Secret on the Settings & sync tab first.');
    let res;
    try {
      res = await fetch('https://oauth.battle.net/token', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(S.clientId + ':' + st.secret), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
      });
    } catch (e) { throw new Error('Could not reach oauth.battle.net (' + e.message + ').'); }
    if (!res.ok) throw new Error(res.status === 401 ? 'Blizzard rejected the Client ID / Secret (HTTP 401).' : 'Token request failed (HTTP ' + res.status + ').');
    const j = await res.json();
    st.tok = { access: j.access_token, exp: Date.now() + (j.expires_in || 86399) * 1000, cid: S.clientId };
    if (S.rememberSecret) F.save('token', st.tok);
    return st.tok.access;
  };
  let tokenRefresh = null, lastTokenRefresh = 0;
  F.api = async (path, params = {}, attempt = 0) => {
    const t = await F.getToken();
    const url = new URL(`https://${st.S.region}.api.blizzard.com${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (!url.searchParams.has('locale')) url.searchParams.set('locale', 'en_US');
    let res;
    try { res = await fetch(url, { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' }); } // browsers otherwise reuse hours-old auction data
    catch (e) { throw new Error('Network error contacting the Blizzard API (' + e.message + ').'); }
    // A saved token Blizzard no longer accepts can come back as 401 or 403. Requests run in parallel and
    // some 403s are genuine, so share one refresh and do it at most once a minute.
    if ((res.status === 401 || res.status === 403) && attempt < 1 && !(st.S.manualToken || '').trim()) {
      const stale = !!st.tok && st.tok.access !== t;
      if (!stale && !tokenRefresh && Date.now() - lastTokenRefresh > 60000) {
        lastTokenRefresh = Date.now();
        st.tok = null;
        F.remove('token');
        tokenRefresh = F.getToken(true).finally(() => { tokenRefresh = null; });
      }
      if (tokenRefresh) { await tokenRefresh; return F.api(path, params, attempt + 1); }
      if (stale) return F.api(path, params, attempt + 1);
    }
    if (res.status === 429 && attempt < 5) { await F.sleep(1000 * (attempt + 1)); return F.api(path, params, attempt + 1); }
    F.lastModified = res.headers.get('last-modified');
    if (!res.ok) {
      let detail = '';
      try { const txt = await res.text(); const j = JSON.parse(txt); detail = j.detail || j.error_description || j.error || j.message || txt.slice(0, 160); } catch (e2) { /* no body */ }
      const e = new Error(`HTTP ${res.status} for ${path}${detail ? ': ' + detail : ''}`);
      e.status = res.status; e.detail = detail;
      throw e;
    }
    return res.json();
  };
  const locName = n => (typeof n === 'string' ? n : n ? (n.en_US || n.en_GB || Object.values(n)[0]) : '');

  async function pool(list, n, fn, onProgress) {
    let i = 0, done = 0;
    const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        try { await fn(list[idx], idx); } catch (e) { /* fn records its own failures */ }
        done++;
        if (onProgress) onProgress(done, list.length);
      }
    });
    await Promise.all(workers);
  }

  F.loadRealms = async () => {
    let rows;
    try {
      rows = (await F.api('/data/wow/realm/index', { namespace: F.ns('dynamic') })).realms || [];
    } catch (e) {
      if (e.status !== 404) throw e;
      rows = ((await F.api('/data/wow/search/realm', { namespace: F.ns('dynamic'), _pageSize: 1000 })).results || []).map(r => r.data);
    }
    return rows.map(r => ({ id: r.id, name: locName(r.name), slug: r.slug })).sort((a, b) => a.name.localeCompare(b.name));
  };
  F.resolveConnectedRealm = async slug => {
    const j = await F.api(`/data/wow/realm/${slug}`, { namespace: F.ns('dynamic') });
    const m = ((j.connected_realm && j.connected_realm.href) || '').match(/connected-realm\/(\d+)/);
    if (!m) throw new Error('Could not find the connected realm for ' + slug + '.');
    return +m[1];
  };
  F.loadAuctionHouses = async crid => {
    try {
      const j = await F.api(`/data/wow/connected-realm/${crid}/auctions/index`, { namespace: F.ns('dynamic') });
      return (j.auctions || []).map(a => ({ id: a.id, name: locName(a.name) }));
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  };
  // Forever auctions hang off a ruleset rather than a connected realm (unofficial, found by community probing).
  const FOREVER_RULESETS = { 1: 'PvP', 2: 'Normal', 3: 'Roleplay', 15: 'Roleplay PvP' };
  F.isForever = () => F.nsBase() === 'forever';
  const rulesetId = () => (/^\d+$/.test(st.S.realmSlug || '') ? st.S.realmSlug : '');
  F.hasMarket = () => (F.isForever() ? !!(rulesetId() && st.S.ahId) : !!st.S.connectedRealmId);
  F.loadRulesets = async () => {
    const j = await F.api('/data/wow/ruleset/index', { namespace: F.ns('dynamic') });
    const list = (j.rulesets || j.results || []).map(x => {
      const d = x.data || x, m = ((d.key && d.key.href) || '').match(/ruleset\/(\d+)/);
      const id = d.id || (m ? +m[1] : 0);
      return { id, slug: String(id), name: locName(d.name) || FOREVER_RULESETS[id] || 'Ruleset ' + id };
    }).filter(r => r.id);
    return list.length ? list : Object.entries(FOREVER_RULESETS).map(([id, name]) => ({ id: +id, slug: id, name }));
  };
  F.loadRulesetHouses = async rid => {
    const j = await F.api(`/data/wow/ruleset/${rid}/auctions/index`, { namespace: F.ns('dynamic') });
    return (j.auctions || []).map(a => ({ id: a.id, name: `${locName(a.name)} #${a.id}`, faction: locName(a.name) }));
  };
  // Regular listings plus the separate commodities list, as one list of auctions.
  F.fetchForeverAuctions = async (rid, hid) => {
    const base = `/data/wow/ruleset/${rid}/auctions/${hid}`, params = { namespace: F.ns('dynamic') };
    const reg = await F.api(base, params);
    F.snapshotTs = Date.parse(F.lastModified) || 0;
    let com = [];
    try { com = (await F.api(base + '/commodities', params)).auctions || []; }
    catch (e) { if (e.status !== 404) throw e; }
    const seen = new Set(), out = [];
    for (const a of (reg.auctions || []).concat(com)) {
      const k = [a.id, a.item && a.item.id, a.quantity, a.buyout, a.unit_price].join('|');
      if (!seen.has(k)) { seen.add(k); out.push(a); }
    }
    return out;
  };
  // Summarises each house of one faction so it can be matched against the in-game AH.
  F.compareHouses = async (rid, houses, onProgress) => {
    const items = { 'Linen Cloth': 2589, Runecloth: 14047, 'Iron Bar': 3575 }, out = [];
    for (const [i, h] of houses.entries()) {
      onProgress && onProgress(i + 1, houses.length);
      try {
        const list = await F.fetchForeverAuctions(rid, h.id), mins = {};
        for (const a of list) {
          const unit = a.unit_price != null ? a.unit_price : (a.buyout ? a.buyout / (a.quantity || 1) : null), id = a.item && a.item.id;
          if (unit && (mins[id] == null || unit < mins[id])) mins[id] = Math.round(unit);
        }
        out.push({ h, count: list.length, prices: Object.entries(items).map(([name, id]) => [name, mins[id] == null ? null : mins[id]]) });
      } catch (e) { out.push({ h, error: e.message, prices: [] }); }
    }
    return out;
  };
  // Tests each Forever endpoint separately; auctions are the one that matters for automatic prices.
  F.probeForever = async () => {
    const region = st.S.region, dyn = { namespace: `dynamic-forever-${region}` };
    const stat = { namespace: `static-${(st.S.foreverBuild || '').trim()}-forever-${region}` };
    const rows = [];
    const hit = async (label, path, params) => {
      try {
        const j = await F.api(path, params);
        rows.push({ label, ok: true });
        return j;
      } catch (e) {
        rows.push({ label, ok: false, error: e.status ? 'HTTP ' + e.status + (e.detail ? ' – ' + e.detail : '') : e.message });
        return null;
      }
    };
    await hit('Region index', '/data/wow/region/index', dyn);
    await hit('Ruleset index', '/data/wow/ruleset/index', dyn);
    await hit('Item data (Linen Cloth)', '/data/wow/item/2589', stat);
    const idx = await hit('Auction houses (Normal ruleset)', '/data/wow/ruleset/2/auctions/index', dyn);
    const house = idx && idx.auctions && (idx.auctions.find(a => a.id === 113) || idx.auctions[0]);
    if (house) {
      const j = await hit('Auction listings', `/data/wow/ruleset/2/auctions/${house.id}`, dyn);
      if (j) rows[rows.length - 1].info = `house ${house.id}: ${(j.auctions || []).length.toLocaleString()} listings`;
      const c = await hit('Commodity listings', `/data/wow/ruleset/2/auctions/${house.id}/commodities`, dyn);
      if (c) rows[rows.length - 1].info = `${(c.auctions || []).length.toLocaleString()} listings`;
    } else rows.push({ label: 'Auction listings', ok: false, error: 'no auction house returned' });
    return rows;
  };
  F.probeNamespaces = async () => {
    const cands = ['forever', 'classicforever', 'classicplus', 'classic1x', 'classic', 'classicann', 'classic2x', 'classic3x'];
    if (st.S.customNamespace && !cands.includes(st.S.customNamespace)) cands.unshift(st.S.customNamespace.trim());
    const out = [];
    await pool(cands, 3, async c => {
      try {
        const j = await F.api('/data/wow/realm/index', { namespace: `dynamic-${c}-${st.S.region}` });
        const names = (j.realms || []).map(r => locName(r.name)).sort();
        out.push({ ns: c, count: names.length, sample: names });
      } catch (e) { out.push({ ns: c, error: e.status ? 'HTTP ' + e.status + (e.detail ? ' – ' + e.detail : '') : e.message }); }
    });
    // Baseline: retail realms. If this also fails, the problem is the API key, not the game version.
    let baseline;
    try {
      const j = await F.api('/data/wow/realm/index', { namespace: `dynamic-${st.S.region}` });
      baseline = { ok: true, count: (j.realms || []).length };
    } catch (e) { baseline = { ok: false, error: e.status ? 'HTTP ' + e.status + (e.detail ? ' – ' + e.detail : '') : e.message }; }
    const res = cands.map(c => out.find(o => o.ns === c));
    res.baseline = baseline;
    res.forever = await F.probeForever();
    return res;
  };

  F.syncing = false;
  F.syncAuctions = async (onStatus) => {
    const S = st.S;
    if (F.syncing) return null;
    if (!F.hasMarket()) throw new Error('Pick a realm or ruleset and an auction house on the Settings & sync tab first.');
    F.syncing = true;
    try {
      if (F.isForever()) {
        onStatus && onStatus('Downloading Forever auctions and commodities…');
        const list = await F.fetchForeverAuctions(rulesetId(), S.ahId);
        onStatus && onStatus('Crunching ' + list.length.toLocaleString() + ' auctions…');
        return F.applyAuctions(list, `Forever ${S.realmName} · ${S.ahName}`, 'Blizzard API', F.snapshotTs);
      }
      onStatus && onStatus('Downloading auction data…');
      const path = S.ahId ? `/data/wow/connected-realm/${S.connectedRealmId}/auctions/${S.ahId}` : `/data/wow/connected-realm/${S.connectedRealmId}/auctions`;
      const j = await F.api(path, { namespace: F.ns('dynamic') });
      onStatus && onStatus('Crunching ' + (j.auctions || []).length.toLocaleString() + ' auctions…');
      const label = `${S.realmName || 'Connected realm ' + S.connectedRealmId}${S.ahName ? ' · ' + S.ahName : ''}`;
      return F.applyAuctions(j.auctions || [], label, 'Blizzard API');
    } finally { F.syncing = false; }
  };

  // Fetch item names/quality/ilvl/vendor prices for item IDs (cached).
  F.fetchItemInfo = async (ids, onProgress) => {
    const res = { ok: 0, notFound: 0, failed: 0, lastError: '' };
    const nsS = F.ns('static');
    await pool(ids, 8, async id => {
      try {
        const j = await F.api(`/data/wow/item/${id}`, { namespace: nsS });
        st.meta[id] = {
          n: locName(j.name), q: j.quality ? QMAP[j.quality.type] : null, l: j.level || 0,
          c: j.item_class ? j.item_class.id : null, b: j.purchase_price || 0, s: j.sell_price || 0
        };
        res.ok++;
      } catch (e) {
        if (e.status === 404) { st.meta[id] = { missing: true }; res.notFound++; }
        else { res.failed++; res.lastError = e.message; }
      }
    }, onProgress);
    F.save('meta', st.meta);
    return res;
  };
  F.idProblems = () => {
    const out = [];
    for (const it of ITEMS.values()) {
      if (!F.isUsed(it.name) && !DE_MATS.includes(it.name)) continue;
      if (!it.id) { out.push({ it, why: 'No item ID' }); continue; }
      const m = st.meta[it.id];
      if (!m) continue;
      if (m.missing) out.push({ it, why: 'ID not found in this game version' });
      else if (F.norm(m.n) !== F.norm(it.name.replace(/ \[\d+\]$/, ''))) out.push({ it, why: `ID ${it.id} is "${m.n}"` });
    }
    return out;
  };
  F.searchItemId = async name => {
    const j = await F.api('/data/wow/search/item', { namespace: F.ns('static'), 'name.en_US': name, orderby: 'id', _pageSize: 100 });
    const cands = (j.results || []).map(r => ({ id: r.data.id, name: locName(r.data.name) })).filter(c => F.norm(c.name) === F.norm(name));
    if (!cands.length) return null;
    const onAh = st.ah && st.ah.all ? cands.find(c => st.ah.all[c.id]) : null;
    return (onAh || cands[0]).id;
  };
  F.setItemId = (name, id) => {
    st.itemEdits[name] = Object.assign({}, st.itemEdits[name], { id: +id || 0 });
    F.save('itemEdits', st.itemEdits);
  };

  // ---------------------------------------------------------------- importers
  // Minimal Lua table-literal parser (enough for WoW SavedVariables files).
  F.parseLuaVar = (text, varName) => {
    const re = new RegExp('(^|\\n)\\s*' + varName + '\\s*=\\s*\\{');
    const m = re.exec(text);
    if (!m) return null;
    let i = m.index + m[0].length - 1;
    const ws = () => {
      for (;;) {
        while (i < text.length && text.charCodeAt(i) <= 32) i++;
        if (text[i] === '-' && text[i + 1] === '-') {
          if (text.startsWith('--[[', i)) { const e = text.indexOf(']]', i + 4); i = e < 0 ? text.length : e + 2; }
          else { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e + 1; }
          continue;
        }
        break;
      }
    };
    const str = () => {
      const q = text[i++];
      let out = '';
      while (i < text.length && text[i] !== q) {
        if (text[i] === '\\') {
          const n = text[i + 1];
          if (/[0-9]/.test(n)) { const d = /^\d{1,3}/.exec(text.slice(i + 1, i + 4))[0]; out += String.fromCharCode(+d); i += 1 + d.length; continue; }
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else out += text[i++];
      }
      i++;
      return out;
    };
    const val = () => {
      ws();
      const ch = text[i];
      if (ch === '{') return table();
      if (ch === '"' || ch === "'") return str();
      const nm = /^-?(?:0x[0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 40));
      if (nm && nm[0] && nm[0] !== '-') { i += nm[0].length; return Number(nm[0]); }
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, i + 64));
      if (id) { i += id[0].length; return id[0] === 'true' ? true : id[0] === 'false' ? false : id[0] === 'nil' ? null : id[0]; }
      throw new Error('Unexpected "' + ch + '" at position ' + i);
    };
    const table = () => {
      i++;
      const obj = {};
      let idx = 1;
      for (;;) {
        ws();
        if (text[i] === '}') { i++; return obj; }
        if (i >= text.length) throw new Error('Unexpected end of file');
        if (text[i] === '[') {
          i++;
          const k = val(); ws(); i++; ws(); i++;
          obj[k] = val();
        } else {
          const km = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(text.slice(i, i + 80));
          if (km) { i += km[0].length; obj[km[1]] = val(); }
          else obj[idx++] = val();
        }
        ws();
        if (text[i] === ',' || text[i] === ';') i++;
      }
    };
    return val();
  };
  // Auctionator SavedVariables (WTF/Account/<ACCOUNT>/SavedVariables/Auctionator.lua)
  F.auctionatorRealms = text => {
    const db = F.parseLuaVar(text, 'AUCTIONATOR_PRICE_DATABASE');
    if (!db) throw new Error('No AUCTIONATOR_PRICE_DATABASE found in this file.');
    const realms = Object.keys(db).filter(k => !k.startsWith('__') && db[k] && typeof db[k] === 'object');
    return { db, realms };
  };
  F.auctionatorPrices = (db, realm) => {
    const t = db[realm] || {};
    const prices = {};
    let unmatched = 0;
    for (const [k, e] of Object.entries(t)) {
      if (!e || typeof e !== 'object') continue;
      const p = e.m != null ? e.m : e.mr;
      if (!p) continue;
      let id = null;
      const mm = /^(?:g:)?(\d+)/.exec(k);
      if (mm) id = +mm[1];
      else {
        const it = [...ITEMS.values()].find(x => F.norm(x.name) === F.norm(k));
        if (it && it.id) id = it.id;
      }
      if (!id) { unmatched++; continue; }
      let qty = null;
      if (e.a && typeof e.a === 'object') {
        const days = Object.keys(e.a).map(Number).filter(isFinite);
        if (days.length) qty = e.a[Math.max(...days)];
      }
      if (prices[id] == null || p < prices[id][0]) prices[id] = [p, qty];
    }
    return { prices, unmatched };
  };
  // Lines of "Item name or ID, price"
  F.parseCsv = (text, unit) => {
    const rows = [], bad = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const cut = line.search(/[\t;,]/);
      if (cut < 1) { bad.push(line); continue; }
      const key = line.slice(0, cut).trim().replace(/^"|"$/g, '');
      const price = F.parseMoney(line.slice(cut + 1).trim().replace(/^"|"$/g, ''), unit);
      if (price == null) { bad.push(line); continue; }
      let it = null;
      if (/^\d+$/.test(key)) it = F.itemById(+key) || { id: +key, name: null };
      else it = [...ITEMS.values()].find(x => F.norm(x.name) === F.norm(key));
      if (!it) { bad.push(line); continue; }
      rows.push({ it, price });
    }
    return { rows, bad };
  };

  F.exportAll = () => {
    const out = {};
    for (const k of ['settings', 'skills', 'known', 'manual', 'saleRates', 'itemEdits', 'recipeEdits', 'customRecipes', 'customItems']) out[k] = F.load(k, null);
    delete (out.settings || {}).manualToken;
    return { app: 'wow-forever-ah', version: 1, exported: new Date().toISOString(), data: out };
  };
  F.importAll = obj => {
    if (!obj || obj.app !== 'wow-forever-ah' || !obj.data) throw new Error('This is not a backup file from this app.');
    for (const [k, v] of Object.entries(obj.data)) if (v != null) F.save(k, v);
  };

  F.rebuild();
})();
