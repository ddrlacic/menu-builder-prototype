'use strict';

  /* ---------- model helpers ---------- */

  const menuById = (id) => S.data.menus.find((m) => m.id === id);
  const activeMenu = () => menuById(S.ui.activeMenuId) || S.data.menus[0];
  const entity = (kind, id) => (kind === 'menu' ? menuById(id) : S.data.entities[kind] && S.data.entities[kind][id]);
  const placement = (path) => S.data.placements[path] || {};

  function hiddenInProduct(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath || parsePath(info.parentPath).kind !== 'group') return false;
    const k = productScopePath(path);
    return k !== path && !!placement(k).hidden;
  }

  function groupHiddenAt(path) {
    const info = parsePath(path);
    if (info.kind !== 'group') return !!placement(path).hidden || hiddenInProduct(path);
    const g = entity('group', info.id);
    if (!g || !g.children.length) return false;
    return g.children.every((pid) => groupHiddenAt(childPath(path, 'product', pid)));
  }

  function nameOf(kind, ent) {
    if (!ent) return 'Unknown';
    if (kind === 'menu') return ent.name || 'Untitled menu';
    return ent.name || 'Untitled';
  }

  function posIdOf(kind, ent) {
    if (!ent) return null;
    if (ent.source === 'pos') return ent.externalId;
    if (kind === 'product' && ent.ptype === 'linked') return ent.posParentExt;
    if (kind === 'group' && ent.gtype === 'linked') return ent.posGroupExt;
    return null;
  }

  function parsePath(path) {
    const segs = path.split('>');
    if (segs.length === 1) return { kind: 'menu', id: segs[0], menuId: segs[0], parentPath: null, depth: 0 };
    const [s, id] = segs[segs.length - 1].split(':');
    return { kind: SEG_KIND[s], id, menuId: segs[0], parentPath: segs.slice(0, -1).join('>'), depth: segs.length - 1 };
  }

  const childPath = (path, kind, id) => `${path}>${SEG[kind]}:${id}`;

  const inMenuCategory = (menu, pid) => menu.children.some((cid) => (entity('category', cid) || { children: [] }).children.includes(pid));

  const choiceProductsHolding = (category, pid) =>
    category.children.map((c) => entity('product', c)).filter((p) => p && p.ptype === 'size' && p.id !== pid && p.children.includes(pid));

  const storeEntry = (p, sid) => (p.stores || {})[sid] || {};
  const productStockAt = (p, sid) => storeEntry(p, sid).stock || '';
  const productHiddenAt = (p, sid) => !!storeEntry(p, sid).hidden;
  const productPosStockAt = (p, sid) => (hasPosStock(sid) && storeEntry(p, sid).posStock) || '';
  const shownLockedAt = (p, sid) => hasPosStock(sid) && productStockAt(p, sid) === 'out_of_stock';
  const productShownAt = (p, sid) => !productHiddenAt(p, sid) && !shownLockedAt(p, sid);
  const productOutAt = (p, sid) => !!(productStockAt(p, sid) || productPosStockAt(p, sid));
  const productChangedAt = (p, sid) => productOutAt(p, sid) || productHiddenAt(p, sid);
  const productMenus = (p) => {
    const ids = new Set((ctx.usage.get(`product:${p.id}`) || []).map((path) => parsePath(path).menuId));
    return S.data.menus.filter((m) => ids.has(m.id));
  };

  function productStores(p) {
    const ids = new Set(productMenus(p).flatMap((m) => menuStores(m).map((s) => s.id)));
    return STORES.filter((s) => ids.has(s.id));
  }

  function productParents(p) {
    const holds = (x) => x.children.includes(p.id);
    return [
      ...Object.values(S.data.entities.category).filter(holds).map((ent) => ({ kind: 'category', ent })),
      ...Object.values(S.data.entities.group).filter(holds).map((ent) => ({ kind: 'group', ent })),
      ...Object.values(S.data.entities.product).filter((x) => x.ptype === 'size' && holds(x)).map((ent) => ({ kind: 'product', ent })),
    ];
  }

  function halfWholeUse(p) {
    const isHalf = (h) => h && (h.left === p.id || h.right === p.id);
    const halfIn = [
      ...Object.values(S.data.entities.group).filter((g) => Object.values(g.halves || {}).some(isHalf)).map((g) => nameOf('group', g)),
      ...Object.values(S.data.entities.product).filter((x) => Object.values(x.halfWhole || {}).some(isHalf)).map((x) => nameOf('product', x)),
    ];
    return { halfIn: [...new Set(halfIn)] };
  }

  function choiceAllergensMissing(p) {
    const inChoices = new Set(p.children.flatMap((cid) => (entity('product', cid) || { allergens: [] }).allergens));
    return C.allergens.filter((a) => inChoices.has(a) && !p.allergens.includes(a));
  }

  function choiceProductCategoryPaths(choiceProductPath) {
    const info = parsePath(choiceProductPath);
    const menu = menuById(info.menuId);
    return menu.children.filter((cid) => (entity('category', cid) || { children: [] }).children.includes(info.id)).map((cid) => childPath(menu.id, 'category', cid));
  }

  function choicePeerPaths(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath) return [];
    const holder = parsePath(info.parentPath);
    if (holder.kind !== 'product' || (entity('product', holder.id) || {}).ptype !== 'size') return [];
    const menu = menuById(info.menuId);
    return menu.children
      .filter((cid) => (entity('category', cid) || { children: [] }).children.includes(holder.id))
      .map((cid) => childPath(childPath(childPath(menu.id, 'category', cid), 'product', holder.id), 'product', info.id))
      .filter((p) => p !== path);
  }

  function pathExists(path) {
    const segs = path.split('>');
    let kind = 'menu';
    let ent = menuById(segs[0]);
    if (!ent) return false;
    for (let i = 1; i < segs.length; i++) {
      const [s, id] = segs[i].split(':');
      const k = SEG_KIND[s];
      if (childKind(kind, ent) !== k || !ent.children.includes(id)) return false;
      kind = k;
      ent = entity(k, id);
      if (!ent) return false;
    }
    return true;
  }

  function ancestorsOf(path) {
    const segs = path.split('>');
    const out = [];
    for (let i = 1; i < segs.length; i++) out.push(segs.slice(0, i).join('>'));
    return out;
  }

  function crumbs(path) {
    return [...ancestorsOf(path), path].map((p) => {
      const info = parsePath(p);
      return { path: p, kind: info.kind, name: nameOf(info.kind, entity(info.kind, info.id)) };
    });
  }

  const crumbText = (path) => crumbs(path).map((c) => c.name).join(' › ');

  function rootProductIndex(segs) {
    let root = -1;
    for (let i = 2; i < segs.length; i++) if (segs[i].startsWith('p:') && !segs[i - 1].startsWith('g:')) root = i;
    return root;
  }

  function productScopePath(path) {
    const segs = path.split('>');
    const root = rootProductIndex(segs);
    return root < 0 || root === segs.length - 1 ? path : `@>${segs.slice(root).join('>')}`;
  }

  function productScopeText(path) {
    const all = crumbs(path);
    const root = rootProductIndex(path.split('>'));
    return `${all.slice(root < 0 ? 0 : root).map((c) => c.name).join(' › ')}, in every menu`;
  }

  function walkMenu(menu, visit) {
    const seen = new Set();
    const rec = (kind, id, path, depth) => {
      const ent = entity(kind, id);
      if (!ent) return;
      const descend = visit(kind, id, ent, path, depth) !== false;
      if (!descend) return;
      const ck = childKind(kind, ent);
      for (const cid of ent.children) {
        const key = `${ck}:${cid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rec(ck, cid, childPath(path, ck, cid), depth + 1);
        seen.delete(key);
      }
    };
    for (const cid of menu.children) {
      seen.add(`category:${cid}`);
      rec('category', cid, childPath(menu.id, 'category', cid), 1);
      seen.delete(`category:${cid}`);
    }
  }

  function walkSubtree(path, visit) {
    const info = parsePath(path);
    const rec = (kind, id, p, guard) => {
      const ent = entity(kind, id);
      if (!ent || guard.has(`${kind}:${id}`)) return;
      visit(kind, id, ent, p);
      const ck = childKind(kind, ent);
      const g = new Set(guard).add(`${kind}:${id}`);
      ent.children.forEach((cid) => rec(ck, cid, childPath(p, ck, cid), g));
    };
    rec(info.kind, info.id, path, new Set());
  }

  function reaches(kind, id, targetKind, targetId, visited = new Set()) {
    if (kind === targetKind && id === targetId) return true;
    const key = `${kind}:${id}`;
    if (visited.has(key)) return false;
    visited.add(key);
    const ent = entity(kind, id);
    if (!ent) return false;
    const ck = childKind(kind, ent);
    return ent.children.some((cid) => reaches(ck, cid, targetKind, targetId, visited));
  }

  function nearestPosProduct(path) {
    const chain = ancestorsOf(path).reverse();
    for (const p of chain) {
      const info = parsePath(p);
      if (info.kind !== 'product') continue;
      const ent = entity('product', info.id);
      const posId = posIdOf('product', ent);
      if (posId) return { path: p, posId };
    }
    return null;
  }

  function allowedPosGroupsFor(productPath) {
    const p = entity('product', parsePath(productPath).id);
    if (p.ptype === 'pos') return posChildren(p.externalId);
    if (p.ptype === 'linked') return posChildren(p.posParentExt);
    if (p.ptype === 'container') {
      const anc = nearestPosProduct(productPath);
      return anc ? posChildren(anc.posId) : [];
    }
    return [];
  }

  const RULE_KEYS = ['min', 'max', 'maxSingle', 'freeCount'];

  function ruleValue(k, v) {
    if (k === 'max') return isNum(v) && v > 0 ? v : null;
    if (k === 'maxSingle') return isNum(v) && v > 0 ? v : 1;
    return isNum(v) && v > 0 ? v : 0;
  }

  function groupTypeOf(g) {
    if (g.gtype === 'pos') return (posItem(g) || {}).groupType || (g.posRules || {}).groupType || 1;
    if (g.gtype === 'linked') return (posItemById(g.posGroupExt) || {}).groupType || 1;
    return g.type || 1;
  }

  function posRulesOf(g) {
    const src = posItem(g) || {};
    const r = g.posRules || {};
    const pick = (a, b) => (a !== undefined ? a : b);
    return {
      min: ruleValue('min', pick(src.min, r.min)),
      max: ruleValue('max', pick(src.max, r.max)),
      maxSingle: ruleValue('maxSingle', pick(src.maxSingle, r.maxSingle)),
      freeCount: ruleValue('freeCount', pick(src.free, r.free)),
    };
  }

  function rulesOf(g) {
    const type = groupTypeOf(g);
    if (type !== 1) return { type, min: 1, max: 1, maxSingle: 1, freeCount: 0, fixed: true };
    const base = g.gtype === 'pos' ? posRulesOf(g) : Object.fromEntries(RULE_KEYS.map((k) => [k, ruleValue(k, g[k])]));
    const o = g.gtype === 'pos' ? g.ruleOverrides || {} : {};
    const r = { type };
    RULE_KEYS.forEach((k) => (r[k] = hasOwn(o, k) ? ruleValue(k, o[k]) : base[k]));
    if (g.isSubstitutionContainer) Object.assign(r, { min: 0, max: null, freeCount: 0 });
    return r;
  }

  function rawRule(g, k) {
    if (g.gtype !== 'pos') return g[k];
    return hasOwn(g.ruleOverrides, k) ? g.ruleOverrides[k] : posRulesOf(g)[k];
  }

  function ruleErrors(g) {
    const raw = Object.fromEntries(RULE_KEYS.map((k) => [k, rawRule(g, k)]));
    const bad = (v, lo) => isNum(v) && (!Number.isInteger(v) || v < lo || v > QTY_MAX);
    const r = rulesOf(g);
    const e = {
      min: bad(raw.min, 0) ? `Enter a whole number from 0 to ${QTY_MAX}` : '',
      max: bad(raw.max, 1) ? `Enter a whole number from 1 to ${QTY_MAX}, or leave it empty for no limit` : '',
      maxSingle: bad(raw.maxSingle, 1) ? `Enter a whole number from 1 to ${QTY_MAX}` : '',
      freeCount: bad(raw.freeCount, 0) ? `Enter a whole number from 0 to ${QTY_MAX}` : '',
    };
    if (!e.min && !e.max && r.max != null && r.min > r.max) e.max = 'Maximum needs to be at least the minimum';
    if (!e.maxSingle && !e.max && r.max != null && r.maxSingle > r.max) e.maxSingle = 'Per option cannot be higher than the maximum';
    return e;
  }

  const ruleOverridden = (g) => g.gtype === 'pos' && RULE_KEYS.some((k) => hasOwn(g.ruleOverrides, k));

  function optionMaxError(v, groupMax) {
    if (!isNum(v)) return '';
    if (!Number.isInteger(v) || v < 1 || v > QTY_MAX) return `Enter a whole number from 1 to ${QTY_MAX}`;
    return groupMax != null && v > groupMax ? `Cannot be higher than the group maximum of ${groupMax}` : '';
  }

  function optionMaxOf(g, pid, r = rulesOf(g)) {
    const s = g.optionSettings && g.optionSettings[pid];
    return r.type === 1 && s && isNum(s.maxQty) ? s.maxQty : r.maxSingle;
  }

  function bulkPreselect(g, path) {
    const r = rulesOf(g);
    const max = limitOf(r.max);
    if (r.type !== 1 || max === 1) return null;
    const ids = [];
    let total = 0;
    for (const pid of listedOptions(g)) {
      const p = entity('product', pid);
      if (!p || p.ptype === 'container') continue;
      if (isAutoAdded(childPath(path, 'product', pid))) total += 1;
      else {
        ids.push(pid);
        total += Math.max(g.preselected[pid] || 0, 1);
      }
    }
    if (ids.length < 2) return null;
    return {
      ids,
      canAll: ids.some((pid) => !(g.preselected[pid] > 0)) && (max == null || total <= max),
      canClear: ids.some((pid) => g.preselected[pid] > 0),
    };
  }

  function optionName(g, pid) {
    const s = g && g.optionSettings && g.optionSettings[pid];
    return (s && s.name && s.name.trim()) || nameOf('product', entity('product', pid));
  }

  const groupHiddenCodes = (g, pid) => (g && g.optionSettings && g.optionSettings[pid] && g.optionSettings[pid].hiddenCodes) || [];

  const groupedHalves = (g) => new Set(Object.entries(g.halves || {}).flatMap(([w, h]) => [h.left, h.right].filter((x) => x && x !== w)));

  const listedOptions = (g) => {
    const halves = groupedHalves(g);
    return g.children.filter((pid) => entity('product', pid) && !halves.has(pid));
  };

  function halvesNote(g, pid) {
    const h = g.halves && g.halves[pid];
    if (!h || (!h.left && !h.right)) return '';
    return h.left && h.right ? 'Left and right halves' : `${SIDE_LABEL[h.left ? 'left' : 'right']} only`;
  }

  function ownSections(p, g) {
    if (!p.optionSections[g.id])
      p.optionSections[g.id] = {
        sections: g.sections.map((s) => ({ id: s.id, name: s.name })),
        optionSection: Object.fromEntries(g.children.filter((pid) => sectionOfOption(g, pid)).map((pid) => [pid, sectionOfOption(g, pid)])),
        children: g.children.slice(),
      };
    return p.optionSections[g.id];
  }

  function sectionHost(path) {
    const info = parsePath(path);
    if (info.kind !== 'group' || !info.parentPath) return null;
    const pi = parsePath(info.parentPath);
    if (pi.kind !== 'product' || (pi.parentPath && parsePath(pi.parentPath).kind === 'group')) return null;
    const p = entity('product', pi.id);
    return { p, own: (p.optionSections && p.optionSections[info.id]) || null };
  }

  const siblingGroupedHalves = (g) =>
    new Set([g, ...groupParents(g.id).flatMap((p) => p.children.map((gid) => entity('group', gid)))].filter(Boolean).flatMap((x) => [...groupedHalves(x)]));

  const productCodes = (p) => p.modifierCodes.map((v) => C.modifierCodes.find(([c]) => c === v)).filter(Boolean);

  const groupParents = (gid) => Object.values(S.data.entities.product).filter((p) => p.children.includes(gid));

  function siblingPosGroups(g) {
    const out = new Set([g.id]);
    groupParents(g.id).forEach((p) =>
      p.children.forEach((gid) => {
        const x = entity('group', gid);
        if (x && x.gtype === 'pos') out.add(gid);
      }),
    );
    return [...out].map((gid) => entity('group', gid));
  }

  function swapSourceGroups(g) {
    const out = new Map();
    groupParents(g.id).forEach((p) =>
      p.children.forEach((gid) => {
        const x = entity('group', gid);
        if (x && gid !== g.id) out.set(gid, x);
      }),
    );
    return [...out.values()];
  }

  const swapGroupsMissing = (p, keys) => [...new Set(keys.map((k) => k.split(':')[0]))].filter((gid) => !p.children.includes(gid));

  function groupSubstitutes(p, g, pid) {
    const keys = (g && g.swaps && g.swaps[pid]) || [];
    return keys.length && !swapGroupsMissing(p, keys).length ? keys.map((k) => k.split(':')[1]) : [];
  }

  function substitutesAt(p, gid, pid) {
    const key = `${gid}:${pid}`;
    if (hasOwn(p.substitutes, key)) return { ids: p.substitutes[key], own: true };
    return { ids: groupSubstitutes(p, entity('group', gid), pid), own: false };
  }

  const halvesSupported = (g) => !!g && g.gtype === 'pos' && !g.isSubstitutionContainer && rulesOf(g).type === 1;

  function halvesAt(p, gid, pid) {
    const key = `${gid}:${pid}`;
    if (hasOwn(p.halfWhole, key)) return { h: p.halfWhole[key], own: true };
    const g = entity('group', gid);
    return { h: (halvesSupported(g) && g.halves[pid]) || {}, own: false };
  }

  const HALF_WORDS = [
    ...['left half', 'left side', '1st half', 'first half', 'half 1', 'left', 'lh', '1st', 'h1', 'links', 'izquierda', 'l'].map((w) => [w, 'left']),
    ...['right half', 'right side', '2nd half', 'second half', 'half 2', 'right', 'rh', '2nd', 'h2', 'rechts', 'derecha', 'r'].map((w) => [w, 'right']),
  ].sort((a, b) => b[0].length - a[0].length);
  const HALF_FILLER = /^(half|side|on)\s+|\s+(half|side|on)$/g;
  const SIDE_LABEL = { left: 'Left half', right: 'Right half' };

  const normName = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  function parseHalfName(name, { minWord = 1 } = {}) {
    const t = ` ${normName(name)} `;
    for (const [w, side] of HALF_WORDS) {
      if (w.length < minWord) continue;
      let base = null;
      if (t.startsWith(` ${w} `)) base = t.slice(w.length + 2);
      else if (t.endsWith(` ${w} `)) base = t.slice(0, -(w.length + 2));
      base = base && base.trim().replace(HALF_FILLER, '').trim();
      if (base) return { side, base };
    }
    return null;
  }

  const stemWord = (w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w);
  const stemKey = (norm) => norm.split(' ').map(stemWord).join(' ');

  function nameScore(a, b) {
    if (a === b) return 1;
    const ta = a.split(' ').map(stemWord);
    const tb = b.split(' ').map(stemWord);
    if (ta.join(' ') === tb.join(' ')) return 0.95;
    const same = (x, y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
    const hits = ta.filter((x) => tb.some((y) => same(x, y))).length;
    return ((2 * hits) / (ta.length + tb.length)) * 0.9;
  }

  const isPlainOption = (pid) => {
    const x = entity('product', pid);
    return !!x && x.ptype !== 'container' && !x.children.length;
  };

  function halfMatches(g) {
    const key = `match:${g.id}`;
    if (halfCache.has(key)) return halfCache.get(key);
    const seen = new Set();
    const candidates = [];
    for (const x of siblingPosGroups(g)) {
      const own = x.id === g.id;
      const groupSide = own ? null : parseHalfName(nameOf('group', x), { minWord: 2 });
      const names = x.children.filter(isPlainOption).map((pid) => normName(nameOf('product', entity('product', pid))));
      const hostsWhole = own ? null : new Set(names.filter((n) => !parseHalfName(n)).map(stemKey));
      x.children.forEach((pid) => {
        if (seen.has(pid) || !isPlainOption(pid)) return;
        const name = nameOf('product', entity('product', pid));
        const parsed = parseHalfName(name) || (groupSide ? { side: groupSide.side, base: normName(name) } : null);
        if (!parsed || (hostsWhole && hostsWhole.has(stemKey(parsed.base)))) return;
        seen.add(pid);
        candidates.push({ pid, gid: x.id, ...parsed });
      });
    }
    const halfIds = new Set(candidates.map((c) => c.pid));
    const wholes = g.children.filter((pid) => isPlainOption(pid) && !halfIds.has(pid)).map((pid) => ({ pid, norm: normName(nameOf('product', entity('product', pid))) }));
    const links = [];
    const unmatched = [];
    for (const c of candidates) {
      const scored = wholes.map((w) => ({ w, s: nameScore(c.base, w.norm) })).sort((a, b) => b.s - a.s);
      const best = scored[0];
      if (!best || best.s < 0.6 || (scored[1] && scored[1].s === best.s)) {
        if (c.gid === g.id) unmatched.push(c.pid);
        continue;
      }
      links.push({ whole: best.w.pid, side: c.side, half: c.pid, score: best.s + (c.gid === g.id ? 0.001 : 0) });
    }
    links.sort((a, b) => b.score - a.score);
    const byWhole = new Map();
    const used = new Set();
    for (const l of links) {
      const slot = byWhole.get(l.whole) || {};
      if (slot[l.side] || used.has(l.half)) continue;
      slot[l.side] = l.half;
      slot.score = Math.min(slot.score == null ? 1 : slot.score, l.score);
      byWhole.set(l.whole, slot);
      used.add(l.half);
    }
    const pairs = [...byWhole.entries()]
      .filter(([, s]) => s.left && s.right)
      .map(([pid, s]) => ({ pid, left: s.left, right: s.right, exact: s.score >= 0.95 }));
    const pairedHalves = new Set(pairs.flatMap((p) => [p.left, p.right]));
    const out = {
      pairs,
      halfIds: new Set([...used].filter((pid) => g.children.includes(pid))),
      unmatched: [...unmatched, ...[...used].filter((pid) => !pairedHalves.has(pid) && g.children.includes(pid))],
    };
    halfCache.set(key, out);
    return out;
  }

  function halfSuggestions(g) {
    if (!halvesSupported(g)) return [];
    const taken = new Set(Object.values(g.halves).flatMap((h) => [h.left, h.right]));
    return halfMatches(g).pairs.filter((p) => {
      const h = g.halves[p.pid];
      return !(h && (h.left || h.right)) && !taken.has(p.left) && !taken.has(p.right) && !taken.has(p.pid);
    });
  }

  const halfHintKey = (pairs) =>
    pairs
      .map((p) => p.pid)
      .sort()
      .join('|');

  function suggestedHalves(g) {
    const pairs = halfSuggestions(g);
    return pairs.length && S.ui.halfHintDismissed[g.id] !== halfHintKey(pairs) ? pairs : [];
  }

  function dismissHalfHint(gid) {
    const prev = S.ui.halfHintDismissed[gid];
    const setDismissed = (key) => {
      S.ui.halfHintDismissed[gid] = key;
      render();
    };
    setDismissed(halfHintKey(halfSuggestions(entity('group', gid))));
    toast('Suggestion dismissed', 'success', { action: { label: 'Undo', onClick: () => setDismissed(prev) } });
  }

  function halfIndex(p) {
    const key = `index:${p.id}`;
    if (halfCache.has(key)) return halfCache.get(key);
    const out = new Map();
    for (const gid of p.children) {
      const g = entity('group', gid);
      if (!halvesSupported(g)) continue;
      for (const pid of g.children) {
        const { h } = halvesAt(p, gid, pid);
        for (const side of ['left', 'right']) if (h[side] && h[side] !== pid && !out.has(h[side])) out.set(h[side], { side, whole: pid, gid });
      }
    }
    halfCache.set(key, out);
    return out;
  }

  function halfRole(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath) return null;
    const gi = parsePath(info.parentPath);
    if (gi.kind !== 'group' || !gi.parentPath) return null;
    const pi = parsePath(gi.parentPath);
    if (pi.kind !== 'product') return null;
    const role = halfIndex(entity('product', pi.id)).get(info.id);
    if (!role) return null;
    const nested = role.gid === gi.id && isPlainOption(info.id) && entity('group', gi.id).children.includes(role.whole);
    return { ...role, wholePath: nested ? childPath(info.parentPath, 'product', role.whole) : null };
  }

  function wholeHalves(path) {
    const info = parsePath(path);
    const gi = info.parentPath ? parsePath(info.parentPath) : null;
    if (info.kind !== 'product' || !gi || gi.kind !== 'group' || !gi.parentPath) return null;
    const pi = parsePath(gi.parentPath);
    if (pi.kind !== 'product' || !halvesSupported(entity('group', gi.id))) return null;
    const { h } = halvesAt(entity('product', pi.id), gi.id, info.id);
    return h.left || h.right ? h : null;
  }

  function priceSource(path) {
    const info = parsePath(path);
    const ent = entity('product', info.id);
    const parent = parsePath(info.parentPath);
    const pEnt = entity(parent.kind, parent.id);
    if (ent.ptype === 'container' || ent.ptype === 'size') return { kind: 'none' };
    const own = posIdOf('product', ent);
    const missingNote = isMissingOnPos(ent) ? 'Last known POS price' : null;
    const src = { own, ent };
    if (parent.kind === 'product' && pEnt.ptype === 'size') return { ...src, kind: 'size', note: missingNote || 'POS price of this choice' };
    if (parent.kind === 'group') {
      if (pEnt.gtype === 'standalone') return { ...src, kind: 'item', note: missingNote || 'Its own POS price. Added to the order as a separate item' };
      const gid = posIdOf('group', pEnt);
      return { ...src, kind: 'modifier', group: gid, note: missingNote || `POS price in ${posLabel(gid)}` };
    }
    let note = 'From POS';
    if (ent.ptype === 'linked') note = `Rings up as ${posLabel(own)}`;
    else if (isVirtual(pEnt) && ent.originCategoryExt) note = `From POS category: ${posLabel(ent.originCategoryExt)}`;
    return { ...src, kind: 'base', note: missingNote || note };
  }

  function priceAt(src, store) {
    if (src.kind === 'none') return null;
    if (src.kind === 'modifier') return posOptionPrice(src.group, src.own, src.ent, store);
    return posPrice(src.own, src.ent, store);
  }

  function priceInfo(path, store) {
    const src = priceStats(path);
    return { kind: src.kind, note: src.note, value: priceAt(src, store) };
  }

  function priceInputs(src) {
    if (src.kind === 'none') return 'none';
    const g = src.kind === 'modifier' ? posItemById(src.group) : null;
    const it = posItemById(src.own);
    return JSON.stringify([
      g && g.childPrices ? g.childPrices[src.own] : null,
      it ? it.price : null,
      src.ent && src.ent.reviewed ? src.ent.reviewed.price : null,
      (S.data.pos.priceGaps || {})[src.own] || null,
    ]);
  }

  function storePriceStats(src, stores = menuStores(activeMenu())) {
    if (!storePriceCache.has(stores)) storePriceCache.set(stores, new Map());
    const byInputs = storePriceCache.get(stores);
    const key = priceInputs(src);
    if (!byInputs.has(key)) byInputs.set(key, statsOf((s) => priceAt(src, s), stores));
    return byInputs.get(key);
  }

  function priceKey(path) {
    const info = parsePath(path);
    let parent = parsePath(info.parentPath);
    if (parent.kind === 'group') return `g:${parent.id}>${info.id}`;
    while (parent.kind !== 'category' && parent.parentPath) parent = parsePath(parent.parentPath);
    return `c:${parent.id}>${info.id}`;
  }

  function menuPriceKeys(menu) {
    const keys = new Set();
    walkMenu(menu, (kind, id, ent, path) => {
      if (kind === 'product') keys.add(priceKey(path));
    });
    return [...keys];
  }

  const pricedKeySets = new WeakMap();
  function hasPriceRows(path) {
    const m = menuById(parsePath(path).menuId);
    if (!m || !m.pricedKeys) return true;
    if (!pricedKeySets.has(m.pricedKeys)) pricedKeySets.set(m.pricedKeys, new Set(m.pricedKeys));
    return pricedKeySets.get(m.pricedKeys).has(priceKey(path));
  }

  function priceStats(path) {
    if (priceCache.has(path)) return priceCache.get(path);
    const src = priceSource(path);
    const empty = { priced: 0, total: 0, missingStores: [] };
    let st;
    if (src.kind === 'none') st = { ...src, ...empty };
    else if (!hasPriceRows(path)) st = { ...src, ...empty, pending: true };
    else st = { ...src, ...storePriceStats(src) };
    priceCache.set(path, st);
    return st;
  }

  function priceText(st) {
    if (st.pending) return '—';
    return rangeText(st, { plus: st.kind === 'modifier' || st.kind === 'item', freeWord: st.kind === 'modifier' });
  }

  function groupRuleShort(r) {
    const min = r.min || 0;
    const max = limitOf(r.max);
    let s;
    if (min > 0 && max === min) s = `Required · choose ${min}`;
    else if (min > 0 && max == null) s = `Required · at least ${min}`;
    else if (min > 0) s = `Required · ${min}–${max}`;
    else if (max != null) s = `Optional · up to ${max}`;
    else s = 'Optional';
    if (r.freeCount > 0) s += ` · ${r.freeCount} free`;
    return s;
  }

  const customerRule = (r) =>
    groupRuleShort(r)
      .split(' · ')
      .map(capitalize)
      .join(' · ');

  function groupRuleSentence(r) {
    const min = r.min || 0;
    const max = limitOf(r.max);
    const opt = (n) => plural(n, 'option', 'options');
    let s;
    if (min > 0 && max === min) s = `Customers need to choose exactly ${opt(min)}.`;
    else if (min > 0 && max == null) s = `Customers need to choose at least ${opt(min)}.`;
    else if (min > 0) s = `Customers need to choose between ${min} and ${opt(max)}.`;
    else if (max != null) s = `Customers can skip this group or choose up to ${opt(max)}.`;
    else s = 'Customers can skip this group or choose as many options as they like.';
    if ((r.maxSingle || 1) > 1) s += ` Each option can be picked up to ${r.maxSingle} times.`;
    if (r.freeCount > 0) s += ` The first ${r.freeCount === 1 ? 'choice is' : `${r.freeCount} choices are`} free, in the order customers pick them.`;
    return s;
  }

  function removedFromPos(path) {
    const info = parsePath(path);
    if (info.kind === 'menu') return false;
    const ent = entity(info.kind, info.id);
    if (!ent || ent.source !== 'pos' || !posItem(ent)) return false;
    const pi = parsePath(info.parentPath);
    if (pi.kind === 'menu') return false;
    const parent = entity(pi.kind, pi.id);
    let pos = null;
    if (pi.kind === 'product' && parent.ptype === 'container') {
      const anc = nearestPosProduct(info.parentPath);
      pos = anc && anc.posId;
    } else if (pi.kind === 'group' && parent.gtype === 'standalone') return false;
    else if (pi.kind === 'category' && isVirtual(parent)) return false;
    else pos = posIdOf(pi.kind, parent);
    if (pi.kind === 'product' && parent.ptype === 'size') return false;
    if (!pos || !posItemById(pos)) return false;
    return !posChildren(pos).includes(ent.externalId);
  }

  function dropError(parentPath, d) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    if (childKind(pi.kind, parent) !== d.kind) return 'This item cannot go here';
    const pName = nameOf(pi.kind, parent);
    const standaloneError = () =>
      d.posId && !posCategoriesOf(d.posId).length ? `${d.name} is sold only as an option on POS, so it has no price of its own` : null;
    if (pi.kind === 'menu') return null;
    if (pi.kind === 'product' && parent.ptype === 'size') {
      if (d.ptype === 'container') return `Customers pick one product in ${pName}, so option folders cannot go in it`;
      if (d.ptype === 'size') return 'Choice products go in a category';
      if (d.source !== 'pos') return null;
      const homeError = standaloneError();
      if (homeError) return homeError;
      for (const catPath of choiceProductCategoryPaths(parentPath)) {
        const cat = entity('category', parsePath(catPath).id);
        if (!isVirtual(cat) && !posChildren(cat.externalId).includes(d.posId))
          return `${d.name} is not in ${nameOf('category', cat)} on POS, so it cannot be a choice in ${pName}`;
      }
      return null;
    }
    if (pi.kind === 'category') {
      if (d.ptype === 'container') return 'Option folders go inside a group, not in a category';
      if (d.source !== 'pos') return null;
      if (isVirtual(parent)) return standaloneError();
      if (posChildren(parent.externalId).includes(d.posId)) return null;
      return `${d.name} is not in ${pName} on POS. To show it here, put it in a menu-only category`;
    }
    if (pi.kind === 'product') {
      if (d.source !== 'pos') return null;
      if (allowedPosGroupsFor(parentPath).includes(d.posId)) return null;
      return `${d.name} is not a group of ${pName} on POS. To show these options here, use suggested products`;
    }
    if (d.ptype === 'container') return null;
    if (d.ptype === 'size') return 'Choice products go in a category';
    if (parent.gtype === 'standalone') return d.source === 'pos' ? standaloneError() : null;
    if (d.source !== 'pos') return `Only POS products can be options in ${pName}. Put custom products in suggested products`;
    const gpos = posIdOf('group', parent);
    if (posChildren(gpos).includes(d.posId)) return null;
    return `${d.name} is not an option of ${posLabel(gpos)} on POS. To offer it here, use suggested products`;
  }

  const SIZE_RE_TOKENS = [...SIZE_WORDS, ...Object.keys(SIZE_ABBR)].sort((a, b) => b.length - a.length).join('|');
  const normSize = (s) => SIZE_ABBR[s.toLowerCase()] || s.toLowerCase();

  function containerName(set) {
    const key = set.base.toUpperCase();
    if (SUG.bases[key]) return SUG.bases[key];
    return set.base === key ? titleCase(set.base) : set.base;
  }

  function detectSizeSets(category) {
    const sets = {};
    const re1 = new RegExp(`^(${SIZE_RE_TOKENS})\\s+(.+)$`, 'i');
    const re2 = new RegExp(`^(.+?)\\s*[-(]\\s*(${SIZE_RE_TOKENS})\\)?$`, 'i');
    const inContainer = new Set(
      category.children.flatMap((pid) => {
        const c = entity('product', pid);
        return c && c.ptype === 'size' ? c.children : [];
      }),
    );
    for (const pid of category.children) {
      const p = entity('product', pid);
      if (!p || p.ptype !== 'pos' || inContainer.has(pid)) continue;
      const name = nameOf('product', p);
      let size;
      let base;
      let m = name.match(re1);
      if (m) [size, base] = [m[1], m[2]];
      else if ((m = name.match(re2))) [size, base] = [m[2], m[1]];
      else continue;
      const key = base.trim().toLowerCase();
      sets[key] = sets[key] || { base: base.trim(), items: [] };
      sets[key].items.push({ pid, size: normSize(size) });
    }
    return Object.values(sets)
      .filter((s) => s.items.length >= 2)
      .map((s) => ({ ...s, items: s.items.sort((a, b) => SIZE_WORDS.indexOf(a.size) - SIZE_WORDS.indexOf(b.size)) }));
  }

  const sizeSetsKey = (sets) =>
    sets
      .map((s) => s.base.toLowerCase())
      .sort()
      .join('|');

  function suggestedSizeSets(category) {
    const sets = detectSizeSets(category);
    return sets.length && S.ui.sizeHintDismissed[category.id] !== sizeSetsKey(sets) ? sets : [];
  }

  function dismissSizeHint(path) {
    const { id } = parsePath(path);
    const prev = S.ui.sizeHintDismissed[id];
    const setDismissed = (key) => {
      S.ui.sizeHintDismissed[id] = key;
      render();
    };
    setDismissed(sizeSetsKey(detectSizeSets(entity('category', id))));
    toast('Suggestion dismissed', 'success', { action: { label: 'Undo', onClick: () => setDismissed(prev) } });
  }
