'use strict';

  /* ---------- state ---------- */

  const S = { data: null, ui: null };
  let dataset = 'example';
  const hist = { past: [], future: [], key: null, at: 0, deleting: null };
  const T = {
    idCard: null,
    tip: null,
    idCardTimer: null,
    drag: null,
    dropTarget: null,
    markedRow: null,
    popover: null,
    modal: null,
    picker: null,
    lp: null,
    cmp: null,
    opt: null,
    hh: null,
    bi: null,
    ms: null,
    ot: null,
    mc: null,
    halfFilter: 'all',
    flashPaths: new Set(),
    flashExt: new Set(),
    posSearchExpanded: {},
    canvasSearch: null,
    canvasSearchOpen: {},
    revealRow: null,
    posLoading: null,
    importing: false,
    publishing: {},
    posScrollTo: null,
    inspScrollTo: null,
    focusName: false,
    focusRow: null,
    storeKey: null,
    segmentDraft: null,
    tagDraft: null,
    placeQuery: '',
    showSelectedPlaces: false,
    openCard: null,
    preHere: null,
    sectionsHere: null,
    catProductQuery: '',
    catOnlyHidden: false,
    menuQuery: '',
    showSelectedMenus: false,
    rangeOpen: new Set(),
    sel: [],
    selAnchor: null,
    posSel: [],
    posAnchor: null,
    cleared: null,
    dismissing: false,
    rowImage: null,
    imageOverRow: null,
    hiddenRows: 0,
    tabDrag: null,
  };
  let ctx = null;

  class Abort extends Error {}

  function newMenu(o = {}) {
    return {
      id: uid('menu'),
      name: 'New menu',
      internalName: '',
      description: '',
      externalId: '',
      posExt: null,
      image: null,
      channels: [],
      orderTypes: [],
      externalChannels: [],
      schedule: [],
      segments: [],
      storeGroups: [],
      publishedStoreIds: [],
      status: 'draft',
      publishedAt: null,
      publishRun: null,
      children: [],
      ...o,
    };
  }

  const baseEntity = () => ({
    source: 'virtual',
    externalId: null,
    reviewed: null,
    internalName: '',
    description: '',
    image: null,
    children: [],
  });

  const newCategory = (o = {}) => ({ ...baseEntity(), id: uid('cat'), name: 'New category', reportingId: '', bannerImage: null, isBundle: false, ...o });

  function migrateSyncName(ent) {
    if (ent.syncName) {
      const p = posItem(ent);
      ent.name = p ? p.name : (ent.reviewed && ent.reviewed.name) || ent.name;
    }
    delete ent.syncName;
  }

  function migrateCategory(c) {
    if (c.reportingId == null) c.reportingId = '';
    if (c.bannerImage === undefined) c.bannerImage = null;
    if (c.isBundle == null) c.isBundle = false;
    delete c.stores;
    migrateSyncName(c);
  }

  const newAvailability = () => ({
    active: false,
    mode: 'serving',
    slots: [],
    lto: { from: '', to: '' },
    preorder: { from: '', to: '', pickupFrom: '', pickupTo: '' },
  });

  const UPSELL_TITLE = 'Make it a combo?';
  const INCLUDED_NAME = 'Included ingredients';

  const productDefaults = () => ({
    reportingId: '',
    foodType: null,
    allergens: [],
    caloriesFrom: null,
    caloriesTo: null,
    servingFrom: null,
    servingTo: null,
    minQty: null,
    maxQty: null,
    qtyScope: null,
    isAlcoholic: false,
    alcoholVol: null,
    isModifierCodeRequired: false,
    modifierCodes: [],
    preselectedCode: null,
    nutrition: { active: false, protein: null, carbs: null, fat: null, sugar: null, fiber: null },
    prep: { active: false, station: '', qty: null, unit: '', qty2: null, unit2: '' },
    availability: newAvailability(),
    segments: [],
    metadata: [],
    upsell: { title: UPSELL_TITLE, products: [] },
    crossSell: [],
    included: [],
    includedName: INCLUDED_NAME,
    substitutes: {},
    halfWhole: {},
    sections: [],
    groupSection: {},
    optionSections: {},
    namePropagated: false,
  });

  const newProduct = (o = {}) => ({
    ...baseEntity(),
    id: uid('prd'),
    name: 'New product',
    ptype: 'pos',
    posParentExt: null,
    originCategoryExt: null,
    ...productDefaults(),
    ...o,
  });

  const DIETARY_KEYS = ['foodType', 'allergens', 'caloriesFrom', 'caloriesTo', 'servingFrom', 'servingTo', 'isAlcoholic', 'alcoholVol', 'nutrition'];
  const dietaryOf = (p) => JSON.parse(JSON.stringify(Object.fromEntries(DIETARY_KEYS.map((k) => [k, p[k]]))));

  const foodTypeFrom = (list) => ((list || []).includes('vegan') ? 'vegan' : (list || []).includes('vegetarian') ? 'vegetarian' : null);

  const ALLERGEN_MIGRATION = {
    soya: 'soybeans',
    nuts: 'tree_nuts',
    crustaceans: 'shellfish',
    molluscs: 'shellfish',
    ...Object.fromEntries(['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'brazil_nut', 'pistachio', 'macadamia', 'queensland_nut'].map((a) => [a, 'tree_nuts'])),
    ...Object.fromEntries(['rye', 'barley', 'oat', 'spelt', 'kamut'].map((a) => [a, 'gluten'])),
  };

  const migrateAllergens = (list) => [...new Set((list || []).map((a) => ALLERGEN_MIGRATION[a] || a).filter((a) => C.allergens.includes(a)))];

  function migrateMetadata(list) {
    const out = [];
    for (const t of list || []) {
      if (!Array.isArray(t.values) && t.key === 'Badge') continue;
      const key = tagName(t.key);
      const values = Array.isArray(t.values) ? t.values.map(tagName).filter(Boolean) : tagValuesOf(t.value);
      if (!key || !values.length) continue;
      const cur = out.find((x) => x.key === key);
      if (cur) values.forEach((v) => !cur.values.includes(v) && cur.values.push(v));
      else out.push({ key, values: [...new Set(values)] });
    }
    return out;
  }

  function migrateProduct(p) {
    migrateSyncName(p);
    if (p.allergens) p.allergens = migrateAllergens(p.allergens);
    if (p.foodType === undefined) p.foodType = foodTypeFrom(p.foodTypes);
    if (p.metadata === undefined)
      p.metadata = (p.tags || []).map((t) => {
        const i = t.indexOf(':');
        return i < 0 ? { key: t, value: '' } : { key: t.slice(0, i), value: t.slice(i + 1) };
      });
    p.metadata = migrateMetadata(p.metadata);
    delete p.foodTypes;
    delete p.tags;
    delete p.isSelfServing;
    const d = productDefaults();
    for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
    if (!p.upsell.products.length && !p.upsell.title) p.upsell.title = UPSELL_TITLE;
    if (!p.included.length && !p.includedName) p.includedName = INCLUDED_NAME;
    if (p.ptype === 'container') Object.assign(p, dietaryOf(d));
    if (p.ptype === 'container' || p.ptype === 'size') Object.assign(p, { minQty: null, maxQty: null, qtyScope: null });
    if (p.ptype === 'size') p.prep = d.prep;
    delete p.stores;
  }

  function migrateProductSchedules() {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (!Array.isArray(pl.schedule)) continue;
      const m = k.match(/>p:([^>]+)$/);
      const p = m && S.data.entities.product[m[1]];
      if (p && !p.availability.active && pl.schedule.length) p.availability = { ...newAvailability(), active: true, slots: pl.schedule };
      delete pl.schedule;
    }
  }

  function validIncluded(p) {
    const fromPos = new Set(posIncluded(p).map((i) => `${i.gid}:${i.pid}`));
    return p.included.filter((i) => {
      if (fromPos.has(`${i.gid}:${i.pid}`)) return false;
      const g = p.children.includes(i.gid) && entity('group', i.gid);
      return !!g && g.children.includes(i.pid) && !!entity('product', i.pid);
    });
  }

  const productRef = (pid) => {
    const x = entity('product', pid);
    return x ? { id: x.id, pos_id: posIdOf('product', x), name: nameOf('product', x) } : null;
  };

  const optionKeyValid = (p, key) => {
    const [gid, pid] = key.split(':');
    const g = p.children.includes(gid) && entity('group', gid);
    return !!g && g.children.includes(pid);
  };

  const sectionOf = (p, gid) => {
    const s = p.groupSection[gid];
    return p.sections.some((x) => x.id === s) ? s : p.sections.length ? p.sections[0].id : null;
  };

  const sectionOfOption = (g, pid) => {
    const s = g.optionSection[pid];
    return g.sections.some((x) => x.id === s) ? s : g.sections.length ? g.sections[0].id : null;
  };

  function normalizeProduct(p) {
    for (const [gid, o] of Object.entries(p.optionSections || {})) {
      const g = p.children.includes(gid) && entity('group', gid);
      if (!g) {
        delete p.optionSections[gid];
        continue;
      }
      const kids = new Set(g.children);
      o.children = [...o.children.filter((id) => kids.has(id)), ...g.children.filter((id) => !o.children.includes(id))];
      const sids = new Set(o.sections.map((s) => s.id));
      for (const [pid, sid] of Object.entries(o.optionSection)) if (!kids.has(pid) || !sids.has(sid)) delete o.optionSection[pid];
    }
    if (!p.modifierCodes || !p.prep) return;
    if (p.foodType === '') p.foodType = null;
    p.modifierCodes = p.modifierCodes.filter((v) => C.modifierCodes.some(([c]) => c === v));
    if (p.preselectedCode === '' || (p.preselectedCode && !p.modifierCodes.includes(p.preselectedCode))) p.preselectedCode = null;
    if (!p.modifierCodes.length) p.isModifierCodeRequired = false;
    if (p.isModifierCodeRequired && !p.preselectedCode) p.preselectedCode = p.modifierCodes[0];
    if ((isNum(p.minQty) || isNum(p.maxQty)) && !p.qtyScope) p.qtyScope = 'cart';
    if (isNum(p.alcoholVol)) p.alcoholVol = Math.round(clamp(p.alcoholVol, 0, 100) * 100) / 100;
    if (!isNum(p.prep.qty)) {
      p.prep.qty2 = null;
      p.prep.unit2 = '';
    }
    if (p.included.length && validIncluded(p).length !== p.included.length) p.included = validIncluded(p);
    for (const map of [p.substitutes, p.halfWhole]) for (const k of Object.keys(map)) if (!optionKeyValid(p, k)) delete map[k];
  }

  const groupDefaults = () => ({
    reportingId: '',
    metadata: [],
    ruleOverrides: {},
    preselected: {},
    optionSettings: {},
    sections: [],
    optionSection: {},
    swaps: {},
    halves: {},
    propagated: [],
  });

  function newGroup(o = {}) {
    const { stores, ...base } = baseEntity();
    return {
      ...base,
      id: uid('grp'),
      name: 'New group',
      gtype: 'pos',
      posGroupExt: null,
      posRules: null,
      type: 1,
      min: 0,
      max: null,
      maxSingle: 1,
      freeCount: 0,
      isSubstitutionContainer: false,
      ...groupDefaults(),
      swapAll: [],
      ...o,
    };
  }

  function migrateGroup(g) {
    const d = groupDefaults();
    for (const k of Object.keys(d)) if (g[k] === undefined) g[k] = d[k];
    g.metadata = migrateMetadata(g.metadata);
    delete g.stores;
    migrateSyncName(g);
    const it = g.source === 'pos' && posItem(g);
    if (!it) return;
    if (g.gtype === 'pos' && !g.posRules)
      g.posRules = { groupType: it.groupType || 1, min: it.min || 0, max: isNum(it.max) ? it.max : null, maxSingle: it.maxSingle || 1, free: it.free || 0 };
    if (g.reviewed && !g.reviewed.rules) g.reviewed.rules = posSnapshot(it).rules;
  }

  function migrateIgnored() {
    for (const k of Object.keys(S.data.ignored || {})) {
      if (!k.includes('/')) continue;
      const posId = k.split('/').pop();
      S.data.menus.forEach((m) => (S.data.ignored[ignoreKey(m, posId)] = true));
      delete S.data.ignored[k];
    }
  }

  function migrateChoiceProducts() {
    const E = S.data.entities;
    const moved = new Map();
    for (const p of Object.values(E.product)) {
      if (p.ptype !== 'size' || !p.children.some((id) => E.group[id])) continue;
      const kids = [];
      for (const gid of p.children) {
        const g = E.group[gid];
        if (!g || g.gtype !== 'standalone' || (g.role !== 'choice' && g.type !== 2)) continue;
        g.children.forEach((pid) => E.product[pid] && !kids.includes(pid) && kids.push(pid));
        moved.set(gid, p.id);
      }
      Object.assign(p, { children: kids, sections: [], groupSection: {} });
    }
    for (const gid of moved.keys()) if (!Object.values(E.product).some((p) => p.children.includes(gid))) delete E.group[gid];
    const own = (k) => [...moved.keys()].some((gid) => k.endsWith(`>g:${gid}`));
    const fix = (k) => {
      let out = k;
      for (const gid of moved.keys()) {
        out = out.split(`>g:${gid}>`).join('>');
        if (out.endsWith(`>g:${gid}`)) out = out.slice(0, -`>g:${gid}`.length);
      }
      return out;
    };
    for (const [k, pl] of Object.entries(S.data.placements)) {
      const nk = fix(k);
      if (nk === k) continue;
      delete S.data.placements[k];
      if (!own(k)) S.data.placements[nk] = pl;
    }
    return fix;
  }

  function migrateChoicesInMenus() {
    for (const m of S.data.menus)
      for (const cid of m.children) {
        const cat = S.data.entities.category[cid];
        if (!cat) continue;
        for (const pid of [...cat.children]) {
          const p = S.data.entities.product[pid];
          if (p && p.ptype === 'size') p.children.forEach((kid) => S.data.entities.product[kid] && keepChoiceInMenu(childPath(childPath(m.id, 'category', cid), 'product', pid), kid));
        }
      }
  }

  const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  function normalizeGroup(g) {
    if (!g.optionSettings) return;
    const kids = new Set(g.children);
    for (const map of [g.preselected, g.optionSettings, g.optionSection, g.swaps, g.halves]) for (const k of Object.keys(map)) if (!kids.has(k)) delete map[k];
    for (const [pid, s] of Object.entries(g.optionSettings)) {
      if (s.name != null && !String(s.name).trim()) delete s.name;
      if (!isNum(s.maxQty)) delete s.maxQty;
      if (s.hiddenCodes && !s.hiddenCodes.length) delete s.hiddenCodes;
      if (!Object.keys(s).length) delete g.optionSettings[pid];
    }
    const subOf = (k) => String(k).split(':')[1];
    const validSwaps = (keys, pid) =>
      keys.filter((k, i) => {
        const [sg, sp] = String(k).split(':');
        const x = sg !== g.id && sp !== pid && entity('group', sg);
        return !!x && x.children.includes(sp) && keys.findIndex((k2) => subOf(k2) === sp) === i;
      });
    for (const [pid, keys] of Object.entries(g.swaps)) {
      const valid = validSwaps(keys, pid);
      if (valid.length) g.swaps[pid] = valid;
      else delete g.swaps[pid];
    }
    const origins = swapOrigins(g);
    if (g.swapAll === undefined) {
      const lists = origins.map((pid) => JSON.stringify(g.swaps[pid] || []));
      g.swapAll = lists.every((l) => l === lists[0]) ? (lists.length ? JSON.parse(lists[0]) : []) : null;
    }
    if (Array.isArray(g.swapAll)) {
      g.swapAll = validSwaps(g.swapAll, null);
      g.swaps = {};
      origins.forEach((pid) => {
        const list = g.swapAll.filter((k) => subOf(k) !== pid);
        if (list.length) g.swaps[pid] = list;
      });
    }
    for (const [pid, h] of Object.entries(g.halves)) if (!h.left && !h.right) delete g.halves[pid];
    const sectionIds = new Set(g.sections.map((s) => s.id));
    for (const [pid, sid] of Object.entries(g.optionSection)) if (!sectionIds.has(sid)) delete g.optionSection[pid];
    if (g.gtype === 'pos') {
      const base = posRulesOf(g);
      for (const k of Object.keys(g.ruleOverrides)) if (!(k in base) || ruleValue(k, g.ruleOverrides[k]) === base[k]) delete g.ruleOverrides[k];
    }
    if (rulesOf(g).type === 2 && g.children.length && !g.children.some((pid) => g.preselected[pid] > 0)) {
      g.preselected = { [g.children[0]]: 1 };
    }
  }

  /* ---------- POS lookups ---------- */

  const posItemById = (id) => (id && S.data.pos.items[id]) || null;
  const posItem = (ent) => (ent && ent.externalId ? posItemById(ent.externalId) : null);
  const posChildren = (id) => (posItemById(id) || {}).children || [];
  const isMissingOnPos = (ent) => ent.source === 'pos' && !posItem(ent);
  const ignoreKey = (menu, posId) => `${menu.posExt || menu.id}|${posId}`;
  const isVirtual = (ent) => !!ent && ent.source === 'virtual';
  const isCustomVersion = (ent) => isVirtual(ent) && (ent.ptype === 'linked' || ent.gtype === 'linked');
  const storeGroup = () => C.storeGroups.find((g) => g.id === S.ui.storeGroupId) || C.storeGroups[0];
  const storeGroups = () => C.storeGroups.filter((g) => DATASETS[g.dataset]);
  const datasetOf = (storeGroupId) => (storeGroups().find((g) => g.id === storeGroupId) || storeGroups()[0]).dataset;
  let halfCache = new Map();
  let dataVersion = 0;
  const posMenu = () => S.data.pos.menus.find((m) => m.id === S.ui.posMenuId) || S.data.pos.menus[0];
  const linkedPosMenu = (m) => (m && m.posExt && S.data.pos.menus.find((pm) => pm.id === m.posExt)) || null;
  const posImageOf = (m) => (linkedPosMenu(m) || {}).image || null;
  function linkMenuToPosCategory(m, posCatId) {
    if (m.posExt) return null;
    const shown = S.ui && posMenu();
    const pm = shown && shown.roots.includes(posCatId) ? shown : S.data.pos.menus.find((x) => x.roots.includes(posCatId));
    if (!pm) return null;
    m.posExt = pm.id;
    if (!m.image && pm.image) m.image = pm.image;
    return pm;
  }
  const posItemImage = (ent) => (ent && ent.source === 'pos' && (posItem(ent) || {}).image) || null;

  function posCategoriesOf(posId) {
    return Object.entries(S.data.pos.items)
      .filter(([, it]) => it.type === 'category' && it.children.includes(posId))
      .map(([id]) => id);
  }

  let extIndex = { data: null, version: -1, byKind: {} };
  function findByExt(kind, ext) {
    if (extIndex.data !== S.data || extIndex.version !== dataVersion) extIndex = { data: S.data, version: dataVersion, byKind: {} };
    if (!extIndex.byKind[kind]) {
      const map = new Map();
      for (const e of Object.values(S.data.entities[kind])) if (!map.has(e.externalId)) map.set(e.externalId, e);
      extIndex.byKind[kind] = map;
    }
    const hit = extIndex.byKind[kind].get(ext);
    if (hit && S.data.entities[kind][hit.id] === hit && hit.externalId === ext) return hit;
    return Object.values(S.data.entities[kind]).find((e) => e.externalId === ext) || null;
  }

  function posLabel(posId) {
    const it = posItemById(posId);
    const kind = it ? it.type : null;
    const ent = kind ? findByExt(kind, posId) : null;
    if (ent) return nameOf(kind, ent);
    return it ? it.name : posId;
  }

  const STORES = C.stores;
  const storeById = new Map(STORES.map((s) => [s.id, s]));
  const groupDef = (id) => C.menuStoreGroups.find((g) => g.id === id);
  const groupStoreCache = new Map();
  function groupStores(id) {
    if (!groupStoreCache.has(id)) {
      const g = groupDef(id);
      groupStoreCache.set(id, g ? STORES.filter((s) => (g.airport ? s.airport : !s.airport && g.cities.includes(s.city))) : []);
    }
    return groupStoreCache.get(id);
  }
  function assignedStores(a) {
    const all = groupStores(a.id);
    if (!a.storeIds) return all;
    const set = new Set(a.storeIds);
    return all.filter((s) => set.has(s.id));
  }
  const menuStoreCache = new Map();
  function menuStores(m) {
    const key = `${m.id}|${JSON.stringify(m.storeGroups)}`;
    if (!menuStoreCache.has(key)) {
      const ids = new Set();
      m.storeGroups.forEach((a) => assignedStores(a).forEach((s) => ids.add(s.id)));
      menuStoreCache.set(key, STORES.filter((s) => ids.has(s.id)));
    }
    return menuStoreCache.get(key);
  }
  const storeCountLabel = (m) => plural(menuStores(m).length, 'store', 'stores');
  const emptyStoreGroupError = (a) => (assignedStores(a).length ? '' : `Choose stores in ${(groupDef(a.id) || { name: a.id }).name} or remove the group`);

  function defaultStoreGroups() {
    return C.menuStoreGroups.map((g) => ({ id: g.id, storeIds: null, newStores: true }));
  }

  function storeGroupsFromIds(storeIds) {
    const set = new Set(storeIds);
    return C.menuStoreGroups
      .map((g) => {
        const all = groupStores(g.id);
        const chosen = all.filter((s) => set.has(s.id)).map((s) => s.id);
        if (!chosen.length) return null;
        const full = chosen.length === all.length;
        return { id: g.id, storeIds: full ? null : chosen, newStores: full };
      })
      .filter(Boolean);
  }

  function migrateAirportStores() {
    if (S.data.oneGroupPerStore) return;
    S.data.oneGroupPerStore = true;
    const airport = C.menuStoreGroups.find((g) => g.airport);
    S.data.menus.forEach((m) => {
      if (!m.storeGroups || m.storeGroups.some((a) => a.id === airport.id)) return;
      const moved = new Set();
      m.storeGroups.forEach((a) => {
        const g = groupDef(a.id);
        if (!g || g.airport) return;
        STORES.filter((s) => s.airport && g.cities.includes(s.city) && (!a.storeIds || a.storeIds.includes(s.id))).forEach((s) => moved.add(s.id));
        if (a.storeIds) a.storeIds = a.storeIds.filter((id) => !storeById.get(id).airport);
        if (a.storeIds && a.storeIds.length === groupStores(a.id).length) a.storeIds = null;
      });
      if (!moved.size) return;
      const all = groupStores(airport.id);
      m.storeGroups.push({ id: airport.id, storeIds: moved.size === all.length ? null : all.filter((s) => moved.has(s.id)).map((s) => s.id), newStores: moved.size === all.length });
    });
  }

  function migrateMenu(m) {
    if (!m.storeGroups) m.storeGroups = m.storeIds ? storeGroupsFromIds(m.storeIds) : defaultStoreGroups();
    if (!m.externalChannels) m.externalChannels = m.channelTag ? [m.channelTag] : [];
    delete m.storeIds;
    delete m.channelTag;
    if (!m.channels) m.channels = ['web', 'mobile', 'kiosk'];
    if (!m.segments) m.segments = [];
    if (!m.publishedStoreIds) m.publishedStoreIds = m.status === 'draft' ? [] : menuStores(m).map((s) => s.id);
    delete m.ownTimesStoreIds;
    delete m.pricedKeys;
    if (m.externalId == null) m.externalId = '';
    if (m.image === undefined) m.image = null;
    if (m.posExt === undefined) m.posExt = null;
    if (!m.posExt) {
      const posCat = m.children.map((id) => S.data.entities.category[id]).find((c) => c && c.source === 'pos');
      if (posCat) linkMenuToPosCategory(m, posCat.externalId);
    }
    if (m.publishRun === undefined) m.publishRun = null;
    if (m.status === 'publishing') m.status = m.publishRun ? 'failed' : m.publishedAt ? 'changed' : 'draft';
  }

  function importPos(posId, stats = { created: 0, reused: 0 }) {
    const item = posItemById(posId);
    if (!item) return null;
    const kind = item.type;
    const existing = findByExt(kind, posId);
    if (existing) {
      stats.reused++;
      return { kind, id: existing.id, stats };
    }
    const ent = newPosEntity(posId);
    stats.created++;
    ent.children = (item.children || []).map((cid) => importPos(cid, stats)).filter(Boolean).map((r) => r.id);
    return { kind, id: ent.id, stats };
  }

  function posSnapshot(item) {
    const snap = { name: item.name, price: isNum(item.price) ? item.price : null };
    if (item.type === 'group') snap.rules = { groupType: item.groupType || 1, min: ruleValue('min', item.min), max: ruleValue('max', item.max) };
    return snap;
  }

  function newPosEntity(posId) {
    const item = posItemById(posId);
    const kind = item.type;
    const base = {
      source: 'pos',
      pending: true,
      externalId: posId,
      name: item.name,
      reviewed: posSnapshot(item),
      description: item.description || '',
    };
    let ent;
    if (kind === 'category') ent = newCategory({ ...base, image: item.image || null });
    else if (kind === 'product')
      ent = newProduct({
        ...base,
        image: item.image || null,
        originCategoryExt: posCategoriesOf(posId)[0] || null,
      });
    else
      ent = newGroup({
        ...base,
        posRules: { groupType: item.groupType || 1, min: item.min || 0, max: isNum(item.max) ? item.max : null, maxSingle: item.maxSingle || 1, free: item.free || 0 },
      });
    S.data.entities[kind][ent.id] = ent;
    return ent;
  }

  function stageLink(parentKind, parentId, childKind, childId) {
    S.data.pendingLinks[`${parentKind}:${parentId}>${childKind}:${childId}`] = true;
  }

  function clearPending() {
    for (const map of Object.values(S.data.entities)) for (const e of Object.values(map)) delete e.pending;
    S.data.pendingLinks = {};
  }

  /* ---------- seed and persistence ---------- */

  function useDataset(ds) {
    dataset = DATASETS[ds] ? ds : 'example';
    C.modifierCodes = DATASETS[dataset].modifierCodes || BASE_MODIFIER_CODES;
  }

  const storageKey = () => (dataset === 'example' ? STORAGE_KEY : `${STORAGE_KEY}-${dataset}`);

  function seed() {
    const src = DATASETS[dataset];
    S.data = {
      pos: JSON.parse(JSON.stringify(src.pos)),
      entities: { category: {}, product: {}, group: {} },
      menus: [],
      placements: {},
      pendingLinks: {},
      ignored: {},
      oneGroupPerStore: true,
    };
    if (!S.data.pos.syncedAt) S.data.pos.syncedAt = Date.now() - 1000 * 60 * 18;
    if (src.menu) seedImported(src);
    else if (!src.empty) seedExample();
    if (src.built) seedBuiltDemo(src);
    S.data.menus.forEach((m) => {
      if (!m.image) m.image = posImageOf(m);
    });
    clearPending();
  }

  function migratePosImages() {
    const srcMenus = DATASETS[dataset].pos.menus;
    for (const pm of S.data.pos.menus) {
      const s = srcMenus.find((x) => x.id === pm.id);
      if (!s || !s.image || pm.image === s.image) continue;
      const old = pm.image;
      pm.image = s.image;
      if (old) S.data.menus.forEach((m) => m.image === old && (m.image = s.image));
    }
    const srcItems = DATASETS[dataset].pos.items;
    for (const [id, it] of Object.entries(S.data.pos.items)) {
      const s = srcItems[id];
      const next = (s && s.image) || null;
      const old = it.image || null;
      if (!['category', 'product'].includes(it.type) || !s || old === next) continue;
      if (next) it.image = next;
      else delete it.image;
      Object.values(S.data.entities[it.type]).forEach((c) => c.source === 'pos' && c.externalId === id && (c.image || null) === old && (c.image = next));
    }
  }

  function seedImported(src) {
    const E = S.data.entities;
    const { categories, ...settings } = src.menu;
    const menu = newMenu({ storeGroups: defaultStoreGroups(), ...settings });
    S.data.menus.push(menu);
    const extId = (kind, ext) => (findByExt(kind, ext) || {}).id;

    const productFor = (posId) => findByExt('product', posId) || buildProduct(posId);
    const groupFor = (posId) => findByExt('group', posId) || buildGroup(posId);

    function buildGroup(posId) {
      const def = src.groups[posId] || {};
      const g = newPosEntity(posId);
      if (def.name) g.name = def.name;
      if (def.internalName) g.internalName = def.internalName;
      g.ruleOverrides = { ...(def.rules || {}) };
      g.children = (def.options || []).map((pid) => productFor(pid).id);
      for (const [pid, qty] of Object.entries(def.preselected || {})) if (extId('product', pid)) g.preselected[extId('product', pid)] = qty;
      return g;
    }

    function buildProduct(posId) {
      const { groups = [], sections = [], included = [], codes, name, ...fields } = src.products[posId] || {};
      const p = newPosEntity(posId);
      if (name) p.name = name;
      Object.assign(p, fields);
      p.children = groups.map((gid) => groupFor(gid).id);
      p.sections = sections.map(([label]) => ({ id: uid('sec'), name: label }));
      sections.forEach(([, gids], i) => gids.forEach((gid) => extId('group', gid) && (p.groupSection[extId('group', gid)] = p.sections[i].id)));
      p.included = included
        .map(([gid, pid]) => ({ gid: extId('group', gid), pid: extId('product', pid), locked: false }))
        .filter((x) => x.gid && x.pid);
      if (codes) Object.assign(p, { isModifierCodeRequired: true, modifierCodes: C.modifierCodes.map(([v]) => v), preselectedCode: C.modifierCodes[0][0] });
      return p;
    }

    for (const c of categories) {
      const cat = newPosEntity(c.pos);
      const catPath = childPath(menu.id, 'category', cat.id);
      menu.children.push(cat.id);
      for (const item of c.products) {
        let ent;
        if (item.container) {
          ent = newProduct({ ptype: 'size', name: item.container, children: item.sizes.map((pid) => productFor(pid).id) });
          E.product[ent.id] = ent;
        } else {
          ent = productFor(item.pos);
          ent.originCategoryExt = c.pos;
        }
        cat.children.push(ent.id);
        if (item.hidden) S.data.placements[childPath(catPath, 'product', ent.id)] = { hidden: true };
      }
    }
  }

  function seedBuiltDemo(src) {
    S.data.builtDemo = true;
    const E = S.data.entities;
    const built = src.built || {};
    const prod = (ext) => findByExt('product', ext);
    for (const s of built.suggested || []) {
      const host = prod(s.product);
      const options = s.options.map(prod).filter(Boolean);
      if (!host || !options.length) continue;
      const g = newGroup({ gtype: 'standalone', name: s.name, description: s.description || '', min: 0, max: null, children: options.map((x) => x.id) });
      E.group[g.id] = g;
      host.children.push(g.id);
    }
    for (const c of built.customProducts || []) {
      const parent = prod(c.posParent);
      const cat = findByExt('category', c.category);
      if (!parent || !cat) continue;
      const onPos = S.data.pos.items[c.posParent].children || [];
      const p = newProduct({
        ptype: 'linked',
        posParentExt: c.posParent,
        name: c.name,
        description: c.description || parent.description,
        allergens: [...(parent.allergens || [])],
        children: parent.children.filter((gid) => E.group[gid] && E.group[gid].gtype === 'pos' && onPos.includes(E.group[gid].externalId)),
      });
      E.product[p.id] = p;
      cat.children.push(p.id);
    }
  }

  function seedExample() {
    const lunch = newMenu({
      name: 'Lunch',
      internalName: 'Lunch — all stores',
      description: 'Available from opening until 4:00 PM.',
      posExt: 'pos-menu-main',
      channels: ['web', 'mobile', 'kiosk'],
      orderTypes: ['dine_in', 'take_out', 'delivery', 'curbside'],
      externalChannels: ['doordash'],
      schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '11:00', to: '16:00' }],
      storeGroups: defaultStoreGroups(),
    });
    const catering = newMenu({
      name: 'Catering',
      posExt: 'pos-menu-catering',
      channels: ['web', 'call_center'],
      orderTypes: ['catering_delivery', 'catering_take_out'],
      schedule: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }],
      segments: [{ segmentId: 'corp-accounts', tag: 'Corporate accounts' }],
      storeGroups: storeGroupsFromIds(STORES.filter((s) => s.city === 'Chicago' || s.city === 'Boston').map((s) => s.id)),
    });
    S.data.menus.push(lunch, catering);

    const E = S.data.entities;
    const prod = (ext) => findByExt('product', ext);
    const grp = (ext) => findByExt('group', ext);

    const burgers = E.category[importPos('pos-cat-burgers').id];
    burgers.children = burgers.children.slice(0, 2);
    const drinks = E.category[importPos('pos-cat-drinks').id];
    const desserts = E.category[importPos('pos-cat-desserts').id];
    importPos('pos-fries');
    importPos('pos-margherita');

    const truffle = prod('pos-truffle');
    const classic = prod('pos-cheeseburger');
    const sauces = grp('pos-g-sauce');
    const addons = grp('pos-g-addons');
    const side = grp('pos-g-side');
    truffle.children = truffle.children.filter((g) => g !== sauces.id);
    classic.children = classic.children.filter((g) => g !== sauces.id);

    const extraSauces = newProduct({ ptype: 'container', name: 'Extra sauces', children: [sauces.id] });
    E.product[extraSauces.id] = extraSauces;
    addons.children.push(extraSauces.id);

    const pickSide = newGroup({
      gtype: 'linked',
      posGroupExt: 'pos-g-side',
      name: 'Pick a side',
      min: 1,
      max: 1,
      children: [prod('pos-m-fries').id, prod('pos-m-salad').id],
    });
    E.group[pickSide.id] = pickSide;
    classic.children = classic.children.map((g) => (g === side.id ? pickSide.id : g));

    const meal = newGroup({
      gtype: 'standalone',
      name: 'Make it a meal',
      description: 'Add a side or a drink.',
      min: 0,
      max: 2,
      children: [prod('pos-fries').id, prod('pos-lemonade-s').id],
    });
    E.group[meal.id] = meal;
    truffle.children.push(meal.id);

    const brunch = newProduct({
      ptype: 'linked',
      posParentExt: 'pos-truffle',
      name: 'Weekend Brunch Burger',
      description: 'Our truffle burger topped with a fried egg. Served on weekends.',
      allergens: ['milk', 'wheat', 'eggs'],
      children: [grp('pos-g-temp').id, addons.id],
    });
    E.product[brunch.id] = brunch;

    const popular = newCategory({ name: 'Popular', description: 'Guest favorites from across the menu.', children: [truffle.id, prod('pos-margherita').id, brunch.id] });
    E.category[popular.id] = popular;

    const pie = newProduct({
      source: 'pos',
      externalId: 'pos-pumpkin-pie',
      name: 'Seasonal Pumpkin Pie',
      reviewed: { name: 'Seasonal Pumpkin Pie', price: 6.5 },
      allergens: ['milk', 'eggs', 'wheat'],
    });
    E.product[pie.id] = pie;
    desserts.children.push(pie.id);

    lunch.children.push(popular.id, burgers.id, drinks.id, desserts.id);
    popular.reportingId = 'RPT-POPULAR';
    const platters = E.category[importPos('pos-cat-platters').id];
    platters.isBundle = true;
    catering.children.push(platters.id);

    const popularPath = `${lunch.id}>c:${popular.id}`;
    grp('pos-g-temp').preselected = { [prod('pos-m-medium').id]: 1 };
    S.data.placements[productScopePath(`${popularPath}>p:${brunch.id}>g:${addons.id}>p:${prod('pos-m-egg').id}`)] = { preselected: 1 };
    sauces.optionSettings = { [prod('pos-m-aioli').id]: { name: 'House truffle aioli' } };
    brunch.availability = { ...newAvailability(), active: true, slots: [{ days: [0, 6], from: '11:00', to: '14:00' }] };
    truffle.metadata = [{ key: 'foodlabelingtags', values: ['popular', 'star'] }];
    prod('pos-m-bacon').modifierCodes = ['no', 'light', 'extra', 'side'];
    for (const [ext, fields] of Object.entries(DATASETS.example.products || {})) if (prod(ext)) Object.assign(prod(ext), fields);
  }

  function defaultUi() {
    const first = S.data.menus[0];
    const focusMenu = S.data.pos.menus.find((pm) => pm.roots.includes(DATASETS[dataset].posFocus));
    return {
      activeMenuId: first ? first.id : null,
      selected: first ? first.id : null,
      expanded: {},
      posExpanded: {},
      posQuery: '',
      canvasQuery: '',
      tabs: {},
      storeGroupId: storeGroups().find((g) => g.dataset === dataset).id,
      posMenuId: (first && first.posExt) || (focusMenu || S.data.pos.menus[0]).id,
      sizeHintDismissed: {},
      halfHintDismissed: {},
      showPosIds: false,
      posCollapsed: false,
      hideHidden: false,
      hideImages: false,
      hideInternalNames: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) {
          S.data = parsed.data;
          if (!S.data.pendingLinks) S.data.pendingLinks = {};
          migratePosImages();
          migrateAirportStores();
          S.data.menus.forEach(migrateMenu);
          Object.values(S.data.entities.category).forEach(migrateCategory);
          Object.values(S.data.entities.product).forEach(migrateProduct);
          delete S.data.ownTimesDemo;
          delete S.data.storeStatusDemo;
          delete S.data.posStockDemo;
          delete S.data.pos.priceGaps;
          if (!S.data.builtDemo && DATASETS[dataset].built) seedBuiltDemo(DATASETS[dataset]);
          const fixPath = migrateChoiceProducts();
          for (const [k, pl] of Object.entries(S.data.placements)) {
            if (!/^[^>]+>c:[^>]+$/.test(k)) continue;
            delete pl.schedule;
            delete pl.hidden;
          }
          migrateProductSchedules();
          const oldGroups = new Set(Object.values(S.data.entities.group).filter((g) => g.preselected === undefined).map((g) => g.id));
          Object.values(S.data.entities.group).forEach(migrateGroup);
          migratePreselections(oldGroups);
          migrateProductScopedPlacements();
          migrateGroupHidden();
          migrateCodesHere();
          migrateChoicesInMenus();
          migrateIgnored();
          normalizeAll();
          S.ui = { ...defaultUi(), ...parsed.ui, posQuery: '', canvasQuery: '' };
          S.ui.selected = fixPath(S.ui.selected);
          S.ui.expanded = Object.fromEntries(Object.entries(S.ui.expanded).map(([k, v]) => [fixPath(k), v]));
          if (S.ui.tabs.group === 'rules') S.ui.tabs.group = 'options';
          if (datasetOf(S.ui.storeGroupId) !== dataset) S.ui.storeGroupId = defaultUi().storeGroupId;
          focusPosCategory();
          return;
        }
      }
    } catch (_) {
      /* fall through to seed */
    }
    seed();
    normalizeAll();
    S.ui = defaultUi();
    focusPosCategory();
  }

  function focusPosCategory() {
    const id = DATASETS[dataset].posFocus;
    if (!id) return;
    if (!(id in S.ui.posExpanded)) S.ui.posExpanded[id] = true;
    T.posScrollTo = id;
  }

  function migratePreselections(groupIds) {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (!isNum(pl.preselected)) continue;
      const segs = k.split('>');
      if (segs.length < 2) continue;
      const [prev, last] = segs.slice(-2);
      if (!last.startsWith('p:') || !prev.startsWith('g:') || !groupIds.has(prev.slice(2))) continue;
      const g = S.data.entities.group[prev.slice(2)];
      if (!g || rulesOf(g).type === 1) continue;
      if (pl.preselected > 0 && !Object.values(g.preselected).some((v) => v > 0)) g.preselected = { [last.slice(2)]: 1 };
      delete pl.preselected;
    }
  }

  function migrateGroupHidden() {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (!pl || !pl.hidden) continue;
      const info = parsePath(k);
      if (!info || info.kind !== 'group') continue;
      const g = entity('group', info.id);
      if (g) {
        g.children.forEach((pid) => {
          const op = childPath(k, 'product', pid);
          S.data.placements[op] = { ...placement(op), hidden: true };
        });
      }
      delete pl.hidden;
      if (!Object.keys(pl).length) delete S.data.placements[k];
    }
  }

  function migrateCodesHere() {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (!pl || !Array.isArray(pl.hiddenCodes)) continue;
      const segs = k.split('>');
      const g = entity('group', (segs[segs.length - 2] || '').slice(2));
      const pid = (segs[segs.length - 1] || '').slice(2);
      if (pl.hiddenCodes.length) pl.codesHere = [...new Set([...groupHiddenCodes(g, pid), ...pl.hiddenCodes])];
      delete pl.hiddenCodes;
      if (!Object.keys(pl).length) delete S.data.placements[k];
    }
  }

  function migrateProductScopedPlacements() {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (k.startsWith('@>')) continue;
      const sk = productScopePath(k);
      if (sk === k) continue;
      for (const f of ['preselected', 'hiddenCodes', 'codesHere']) {
        if (pl[f] == null) continue;
        const target = (S.data.placements[sk] = S.data.placements[sk] || {});
        if (target[f] == null) target[f] = pl[f];
        delete pl[f];
      }
      if (!Object.keys(pl).length) delete S.data.placements[k];
    }
  }

  function propagationWanted() {
    const E = S.data.entities;
    const want = new Map();
    for (const g of Object.values(E.group)) {
      if (!g.propagated) continue;
      g.propagated = g.propagated.filter((gid, i, a) => gid !== g.id && E.group[gid] && a.indexOf(gid) === i);
      if (!isVirtual(g)) continue;
      for (const pid of g.children) {
        const p = E.product[pid];
        if (!p || p.ptype === 'size') continue;
        for (const gid of g.propagated) {
          if (reaches('group', gid, 'product', pid)) continue;
          if (!want.has(pid)) want.set(pid, new Set());
          want.get(pid).add(gid);
        }
      }
    }
    return want;
  }

  function applyPropagation() {
    const want = propagationWanted();
    for (const p of Object.values(S.data.entities.product)) {
      const w = want.get(p.id);
      const inh = p.inherited || {};
      for (const gid of Object.keys(inh)) {
        if (w && w.has(gid) && p.children.includes(gid)) continue;
        delete inh[gid];
        p.children = p.children.filter((c) => c !== gid);
        const seg = `>p:${p.id}>g:${gid}`;
        for (const k of Object.keys(S.data.placements)) if (k.endsWith(seg) || k.includes(`${seg}>`)) delete S.data.placements[k];
      }
      if (w)
        for (const gid of w)
          if (!p.children.includes(gid)) {
            p.children.push(gid);
            inh[gid] = true;
          }
      if (Object.keys(inh).length) p.inherited = inh;
      else delete p.inherited;
    }
  }

  function normalizeAll() {
    applyPropagation();
    Object.values(S.data.entities.group).forEach(normalizeGroup);
    Object.values(S.data.entities.product).forEach(normalizeProduct);
  }

  let persistTimer = null;
  function persistNow() {
    clearTimeout(persistTimer);
    try {
      const { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed, showPosIds, posCollapsed, hideHidden, hideImages, hideInternalNames } = S.ui;
      localStorage.setItem(
        storageKey(),
        JSON.stringify({
          version: 2,
          data: S.data,
          ui: { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed, showPosIds, posCollapsed, hideHidden, hideImages, hideInternalNames },
        }),
      );
    } catch (_) {
      toast('Couldn’t save changes. Browser storage is full — remove some images', 'error');
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  function switchDataset(ds, storeGroupId) {
    closePopover();
    closeModal(true);
    useDataset(ds);
    clearHistory();
    Object.assign(T, { posSearchExpanded: {}, canvasSearchOpen: {}, openCard: null, storeKey: null, focusRow: null, sel: [], selAnchor: null, posSel: [], posAnchor: null, cleared: null, newMenu: null });
    T.flashPaths.clear();
    T.flashExt.clear();
    const { posCollapsed } = S.ui;
    load();
    Object.assign(S.ui, { storeGroupId, posCollapsed });
    $('#pos-search').value = '';
    render();
    persistNow();
  }

  /* ---------- history ---------- */

  function menuStructure(m) {
    const parts = [JSON.stringify([m.children, m.storeGroups, m.schedule])];
    const seen = new Set();
    const rec = (kind, id) => {
      const key = `${kind}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const e = entity(kind, id);
      if (!e) return;
      parts.push(`${key}=${JSON.stringify(kind === 'group' ? [e.children, e.preselected, e.optionSettings, e.propagated] : e.children)}`);
      const ck = childKind(kind, e);
      e.children.forEach((c) => rec(ck, c));
    };
    m.children.forEach((c) => rec('category', c));
    return parts.join('|');
  }

  const menuStructures = () => new Map(S.data.menus.map((m) => [m.id, menuStructure(m)]));
  const structureChanged = (before) => S.data.menus.filter((m) => before.has(m.id) && before.get(m.id) !== menuStructure(m));

  function publishLockMessage(menus) {
    const busy = menus.find((m) => m.status === 'publishing');
    if (busy) return `You can change what’s in ${busy.name} once publishing finishes`;
    const failed = menus.find((m) => m.status === 'failed');
    if (!failed) return '';
    return canRetryPublish(failed) ? `Retry publishing ${failed.name} to change what’s in it` : `Contact support to finish publishing ${failed.name}, then you can change what’s in it`;
  }

  function markStructureChanged(menus) {
    menus.forEach((m) => m.status === 'published' && (m.status = 'changed'));
  }

  function commit(fn, { key = null } = {}) {
    if (T.importing) {
      toast('Editing is paused until the import finishes', 'info');
      render();
      return false;
    }
    const snapshot = JSON.stringify(S.data);
    const structures = menuStructures();
    let changedMenus;
    try {
      fn();
      normalizeAll();
      changedMenus = structureChanged(structures);
      const locked = publishLockMessage(changedMenus);
      if (locked) throw new Abort(locked);
      dataVersion++;
    } catch (err) {
      dataVersion++;
      if (err instanceof Abort) {
        S.data = JSON.parse(snapshot);
        const locked = changedMenus && publishLockMessage(changedMenus);
        if (err.message) toast(err.message, locked ? 'info' : 'error');
        if (locked) render();
        return false;
      }
      throw err;
    }
    if (hist.deleting) settleDelete();
    const now = Date.now();
    const coalesce = key && hist.key === key && now - hist.at < 1500;
    if (!coalesce) {
      hist.past.push(snapshot);
      if (hist.past.length > 60) hist.past.shift();
    }
    hist.future = [];
    hist.key = key;
    hist.at = now;
    markStructureChanged(changedMenus);
    render();
    return true;
  }

  function clearHistory() {
    if (hist.deleting) hist.deleting.toast.dismiss(true);
    Object.assign(hist, { past: [], future: [], key: null, at: 0, deleting: null });
  }

  function settleDelete() {
    if (hist.deleting) clearHistory();
  }

  function deletedToast(msg) {
    const token = {};
    token.toast = toast(msg, 'success', { action: { label: 'Undo', onClick: undo }, onClose: () => hist.deleting === token && settleDelete() });
    hist.deleting = token;
  }

  const PUBLISH_FIELDS = ['status', 'publishedAt', 'publishedStoreIds', 'publishRun'];
  const UNDO_NOUN = { menu: ['menu', 'menus'], category: ['category', 'categories'], product: ['product', 'products'], group: ['group', 'groups'] };

  function undoSubjects(before, after) {
    const subjects = [];
    const created = [];
    const parents = [];
    const paths = [];
    const add = (list, kind, id) => list.some((x) => x.kind === kind && x.id === id) || list.push({ kind, id });
    const compare = (kind, a, b, id) => {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (!a || !b) return add(created, kind, id);
      const { children: ca = [], ...ra } = a;
      const { children: cb = [], ...rb } = b;
      if (JSON.stringify(ra) !== JSON.stringify(rb)) add(subjects, kind, id);
      if (JSON.stringify(ca) === JSON.stringify(cb)) return;
      add(parents, kind, id);
      const ck = childKind(kind, b);
      const moved = ca.filter((c) => !cb.includes(c)).concat(cb.filter((c) => !ca.includes(c)));
      if (moved.length) moved.forEach((c) => add(subjects, ck, c));
      else add(subjects, kind, id);
    };
    const menusA = new Map(before.menus.map((m) => [m.id, m]));
    const menusB = new Map(after.menus.map((m) => [m.id, m]));
    new Set([...menusA.keys(), ...menusB.keys()]).forEach((id) => compare('menu', menusA.get(id), menusB.get(id), id));
    for (const kind of ['category', 'product', 'group']) {
      const a = before.entities[kind];
      const b = after.entities[kind];
      new Set([...Object.keys(a), ...Object.keys(b)]).forEach((id) => compare(kind, a[id], b[id], id));
    }
    for (const k of new Set([...Object.keys(before.placements), ...Object.keys(after.placements)])) {
      if (JSON.stringify(before.placements[k]) === JSON.stringify(after.placements[k])) continue;
      const info = parsePath(k.replace(/^@>/, 'x>'));
      add(subjects, info.kind, info.id);
      if (!k.startsWith('@')) paths.push(k);
    }
    return { subjects: created.length ? created : subjects, parents, paths };
  }

  function pathOfSubject(subject, paths) {
    const at = (p) => {
      const info = parsePath(p);
      return info.kind === subject.kind && info.id === subject.id && pathExists(p);
    };
    const current = (T.sel.length ? T.sel : [S.ui.selected]).filter(Boolean).find(at);
    if (current) return current;
    const placed = paths.find(at);
    if (placed) return placed;
    if (subject.kind === 'menu') return menuById(subject.id) ? subject.id : null;
    const menus = [activeMenu(), ...S.data.menus.filter((m) => m !== activeMenu())].filter(Boolean);
    for (const m of menus) {
      let found = null;
      walkMenu(m, (kind, id, ent, path) => {
        if (found) return false;
        if (kind === subject.kind && id === subject.id) found = path;
      });
      if (found) return found;
    }
    return null;
  }

  function stepHistory(from, to, verb) {
    if (!from.length || T.importing || T.modal) return;
    const before = S.data;
    const live = new Map(before.menus.map((m) => [m.id, m]));
    const structures = menuStructures();
    S.data = JSON.parse(from[from.length - 1]);
    S.data.publishFailDemo = before.publishFailDemo;
    for (const m of S.data.menus) {
      const now = live.get(m.id);
      if (now) PUBLISH_FIELDS.forEach((f) => (m[f] = now[f]));
    }
    const changedMenus = structureChanged(structures);
    const locked = publishLockMessage(changedMenus);
    if (locked) {
      S.data = before;
      return toast(locked, 'info');
    }
    from.pop();
    to.push(JSON.stringify(before));
    hist.key = null;
    T.newMenu = null;
    const cancelled = hist.deleting;
    if (cancelled) {
      hist.deleting = null;
      hist.future = [];
      cancelled.toast.dismiss(true);
    }
    markStructureChanged(changedMenus);
    dataVersion++;
    const { subjects, parents, paths } = undoSubjects(before, S.data);
    let target = null;
    for (const s of subjects.length ? subjects : parents) {
      const p = pathOfSubject(s, paths);
      if (p) {
        target = p;
        break;
      }
    }
    if (target) {
      const info = parsePath(target);
      if (info.menuId !== S.ui.activeMenuId) S.ui.activeMenuId = info.menuId;
      if (!T.sel.includes(target)) T.sel = [];
      S.ui.selected = target;
      if (target.includes('>')) {
        expandTo(target);
        T.revealRow = target;
        flash(target);
      }
    }
    render();
    if (!subjects.length) return toast(`Change ${verb}`);
    const one = subjects.length === 1 && subjects[0];
    const kinds = new Set(subjects.map((s) => s.kind));
    const noun = kinds.size === 1 ? UNDO_NOUN[subjects[0].kind] : ['item', 'items'];
    const ent = one && (entity(one.kind, one.id) || (one.kind === 'menu' ? before.menus.find((m) => m.id === one.id) : before.entities[one.kind][one.id]));
    toast(one ? `Change to ${nameOf(one.kind, ent)} ${verb}` : `Changes to ${plural(subjects.length, noun[0], noun[1])} ${verb}`);
  }

  function undo() {
    stepHistory(hist.past, hist.future, 'undone');
  }

  function redo() {
    stepHistory(hist.future, hist.past, 'redone');
  }
