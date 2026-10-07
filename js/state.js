'use strict';

  /* ---------- state ---------- */

  const S = { data: null, ui: null };
  let dataset = 'example';
  const hist = { past: [], future: [], key: null, at: 0 };
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
    ms: null,
    ot: null,
    halfFilter: 'all',
    flashPaths: new Set(),
    flashExt: new Set(),
    posSearchExpanded: {},
    posLoading: null,
    posScrollTo: null,
    focusName: false,
    focusRow: null,
    storeQuery: '',
    storeKey: null,
    segmentDraft: null,
    tagDraft: null,
    placeQuery: '',
    showSelectedPlaces: false,
    openCard: null,
    catProductQuery: '',
    catOnlyHidden: false,
    menuQuery: '',
    showSelectedMenus: false,
    rangeOpen: new Set(),
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
      channels: ['web', 'mobile', 'kiosk'],
      orderTypes: ['dine_in', 'take_out'],
      externalChannels: [],
      schedule: [],
      segments: [],
      storeGroups: [],
      publishedStoreIds: [],
      pricedKeys: [],
      ownTimesStoreIds: [],
      status: 'draft',
      publishedAt: null,
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
    stores: {},
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
    if (!c.stores) c.stores = {};
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

  function migrateProduct(p) {
    migrateSyncName(p);
    if (p.allergens) p.allergens = migrateAllergens(p.allergens);
    if (p.foodType === undefined) p.foodType = foodTypeFrom(p.foodTypes);
    if (p.metadata === undefined)
      p.metadata = (p.tags || []).map((t) => {
        const i = t.indexOf(':');
        return i < 0 ? { key: t, value: '' } : { key: t.slice(0, i), value: t.slice(i + 1) };
      });
    delete p.foodTypes;
    delete p.tags;
    delete p.isSelfServing;
    const d = productDefaults();
    for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
    if (!p.upsell.products.length && !p.upsell.title) p.upsell.title = UPSELL_TITLE;
    if (!p.included.length && !p.includedName) p.includedName = INCLUDED_NAME;
    if (p.ptype === 'container') Object.assign(p, dietaryOf(d));
    if (p.ptype === 'container' || p.ptype === 'size') Object.assign(p, { minQty: null, maxQty: null, qtyScope: null });
    if (!p.stores) p.stores = {};
    for (const [sid, v] of Object.entries(p.stores)) {
      if (v && typeof v === 'object') {
        if (!v.stock && !v.hidden) delete p.stores[sid];
      } else if (v === 'hidden' || v === 'disabled') p.stores[sid] = { hidden: true };
      else if (isOutOfStock(v)) p.stores[sid] = { stock: v };
      else delete p.stores[sid];
    }
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
    for (const [sid, v] of Object.entries(p.stores || {})) {
      if (!v || typeof v !== 'object') continue;
      if (!v.stock) delete v.stock;
      if (!v.hidden) delete v.hidden;
      if (!Object.keys(v).length) delete p.stores[sid];
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
      ...o,
    };
  }

  function migrateGroup(g) {
    const d = groupDefaults();
    for (const k of Object.keys(d)) if (g[k] === undefined) g[k] = d[k];
    delete g.stores;
    migrateSyncName(g);
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
    for (const [pid, ids] of Object.entries(g.swaps)) {
      const valid = ids.filter((id, i) => id !== pid && kids.has(id) && ids.indexOf(id) === i);
      if (valid.length) g.swaps[pid] = valid;
      else delete g.swaps[pid];
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
  const isVirtual = (ent) => !!ent && ent.source === 'virtual';
  const isCustomVersion = (ent) => isVirtual(ent) && (ent.ptype === 'linked' || ent.gtype === 'linked');
  const storeGroup = () => C.storeGroups.find((g) => g.id === S.ui.storeGroupId) || C.storeGroups[0];
  const storeGroups = () => C.storeGroups.filter((g) => DATASETS[g.dataset]);
  const datasetOf = (storeGroupId) => (storeGroups().find((g) => g.id === storeGroupId) || storeGroups()[0]).dataset;
  let priceCache = new Map();
  let halfCache = new Map();
  const storePriceCache = new WeakMap();
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
  const roundPrice = (v, f) => Math.round(v * f * 20) / 20;

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

  function hasPriceGap(posId, store) {
    const gap = (S.data.pos.priceGaps || {})[posId];
    if (!gap) return false;
    if (gap.every) return store.index % gap.every === gap.offset;
    return store.index >= gap.from;
  }

  function posPrice(posId, fallbackEnt, store) {
    if (hasPriceGap(posId, store)) return null;
    const it = posItemById(posId);
    if (it && isNum(it.price)) return roundPrice(it.price, store.factor);
    if (fallbackEnt && fallbackEnt.reviewed && isNum(fallbackEnt.reviewed.price)) return roundPrice(fallbackEnt.reviewed.price, store.factor);
    return null;
  }

  function posOptionPrice(groupPosId, optionPosId, fallbackEnt, store) {
    if (hasPriceGap(optionPosId, store)) return null;
    const g = posItemById(groupPosId);
    if (g && g.childPrices && isNum(g.childPrices[optionPosId])) return roundPrice(g.childPrices[optionPosId], store.factor);
    return posPrice(optionPosId, fallbackEnt, store);
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

  const SEED_OWN_TIMES = STORES.filter((s, i) => i % 13 === 5).map((s) => s.id);
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
  const OWN_TIMES_PATTERNS = [
    [{ days: WEEKDAYS, from: '11:00', to: '21:00' }, { days: [0, 6], from: '12:00', to: '20:00' }],
    [{ days: EVERY_DAY, from: '10:00', to: '22:00' }],
    [{ days: WEEKDAYS, from: '07:00', to: '14:00' }],
    [{ days: EVERY_DAY, from: '16:00', to: '23:00' }],
    [{ days: [0, 1, 2, 3, 4], from: '11:00', to: '21:00' }, { days: [5, 6], from: '11:00', to: '23:30' }],
  ];
  const storeIndex = new Map(STORES.map((s, i) => [s.id, i]));
  const ownTimesOf = (storeId) => OWN_TIMES_PATTERNS[storeIndex.get(storeId) % OWN_TIMES_PATTERNS.length];

  function seedOwnTimes(m) {
    const on = new Set(menuStores(m).map((s) => s.id));
    m.ownTimesStoreIds = [...new Set([...m.ownTimesStoreIds, ...SEED_OWN_TIMES.filter((id) => on.has(id))])];
  }

  function migrateOwnTimesDemo() {
    if (S.data.ownTimesDemo) return;
    S.data.ownTimesDemo = true;
    if (S.data.menus[0]) seedOwnTimes(S.data.menus[0]);
  }

  function seedStoreStatusDemo(m) {
    S.data.storeStatusDemo = true;
    const E = S.data.entities.product;
    if (!m || Object.values(E).some((p) => Object.keys(p.stores || {}).length)) return;
    const stores = menuStores(m);
    const pos = m.children.flatMap((cid) => (S.data.entities.category[cid] || { children: [] }).children).map((id) => E[id]).filter((p) => p && p.source === 'pos');
    if (pos[1] && stores.length > 3) pos[1].stores = { [stores[0].id]: { stock: 'out_of_stock' }, [stores[1].id]: { stock: 'oos_eod', hidden: true }, [stores[2].id]: { stock: 'oos_4h' } };
    if (pos[2] && stores.length > 10) pos[2].stores = Object.fromEntries(stores.slice(4, 11).map((s) => [s.id, { hidden: true }]));
  }

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
    if (!m.ownTimesStoreIds) m.ownTimesStoreIds = [];
    if (m.externalId == null) m.externalId = '';
    if (m.image === undefined) m.image = null;
    if (m.posExt === undefined) m.posExt = null;
    if (!m.posExt) {
      const posCat = m.children.map((id) => S.data.entities.category[id]).find((c) => c && c.source === 'pos');
      if (posCat) linkMenuToPosCategory(m, posCat.externalId);
    }
    if (m.status === 'publishing') m.status = m.publishedAt ? 'changed' : 'draft';
  }

  function statsOf(fn, stores = menuStores(activeMenu())) {
    const missingStores = [];
    let min = Infinity;
    let max = -Infinity;
    for (const s of stores) {
      const v = fn(s);
      if (!isNum(v)) {
        missingStores.push(s);
        continue;
      }
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const priced = stores.length - missingStores.length;
    return { min: priced ? min : null, max: priced ? max : null, priced, missingStores, total: stores.length };
  }

  function rangeText(st, { plus = false, freeWord = false } = {}) {
    if (!st.priced) return 'No price';
    const sign = plus ? '+' : '';
    if (st.min === st.max) return freeWord && st.min === 0 ? 'Free' : `${sign}${money(st.min)}`;
    return `${sign}${money(st.min)}–${money(st.max).replace('$', '')}`;
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

  function newPosEntity(posId) {
    const item = posItemById(posId);
    const kind = item.type;
    const base = {
      source: 'pos',
      externalId: posId,
      name: item.name,
      reviewed: { name: item.name, price: isNum(item.price) ? item.price : null },
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
      ignored: {},
      oneGroupPerStore: true,
      ownTimesDemo: true,
    };
    if (!S.data.pos.syncedAt) S.data.pos.syncedAt = Date.now() - 1000 * 60 * 18;
    if (src.menu) seedImported(src);
    else seedExample();
    S.data.menus.forEach((m) => {
      if (!m.image) m.image = posImageOf(m);
    });
    seedOwnTimes(S.data.menus[0]);
    seedStoreStatusDemo(S.data.menus[0]);
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

  function seedExample() {
    const lunch = newMenu({
      name: 'Lunch',
      internalName: 'Lunch — all stores',
      description: 'Available from opening until 4:00 PM.',
      posExt: 'pos-menu-main',
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
    drinks.stores = Object.fromEntries(STORES.filter((s) => s.airport).slice(0, 2).map((s) => [s.id, 'disabled']));

    const platters = E.category[importPos('pos-cat-platters').id];
    platters.isBundle = true;
    catering.children.push(platters.id);

    const popularPath = `${lunch.id}>c:${popular.id}`;
    grp('pos-g-temp').preselected = { [prod('pos-m-medium').id]: 1 };
    S.data.placements[productScopePath(`${popularPath}>p:${brunch.id}>g:${addons.id}>p:${prod('pos-m-egg').id}`)] = { preselected: 1 };
    sauces.optionSettings = { [prod('pos-m-aioli').id]: { name: 'House truffle aioli' } };
    brunch.availability = { ...newAvailability(), active: true, slots: [{ days: [0, 6], from: '11:00', to: '14:00' }] };
    truffle.metadata = [{ key: 'Badge', value: 'Chef’s pick' }];
    prod('pos-m-bacon').modifierCodes = ['no', 'light', 'extra', 'side'];
    const airports = STORES.filter((s) => s.airport);
    prod('pos-ipa').stores = { [airports[0].id]: { stock: 'out_of_stock' }, [airports[1].id]: { stock: 'oos_eod', hidden: true }, [airports[2].id]: { stock: 'oos_eod' } };
    prod('pos-m-avocado').stores = { [STORES[41].id]: { hidden: true } };
    for (const [ext, fields] of Object.entries(DATASETS.example.products || {})) if (prod(ext)) Object.assign(prod(ext), fields);
  }

  function defaultUi() {
    return {
      activeMenuId: S.data.menus[0].id,
      selected: S.data.menus[0].id,
      expanded: {},
      posExpanded: {},
      posQuery: '',
      canvasQuery: '',
      tabs: {},
      storeGroupId: storeGroups().find((g) => g.dataset === dataset).id,
      posMenuId: S.data.menus[0].posExt || S.data.pos.menus[0].id,
      sizeHintDismissed: {},
      halfHintDismissed: {},
      showPosIds: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) {
          S.data = parsed.data;
          migratePosImages();
          migrateAirportStores();
          S.data.menus.forEach(migrateMenu);
          migrateOwnTimesDemo();
          Object.values(S.data.entities.category).forEach(migrateCategory);
          Object.values(S.data.entities.product).forEach(migrateProduct);
          if (!S.data.storeStatusDemo) seedStoreStatusDemo(S.data.menus[0]);
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
          migrateChoicesInMenus();
          S.data.menus.forEach((m) => (m.pricedKeys = !m.publishedAt ? [] : m.pricedKeys || menuPriceKeys(m)));
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

  function migrateProductScopedPlacements() {
    for (const [k, pl] of Object.entries(S.data.placements)) {
      if (k.startsWith('@>')) continue;
      const sk = productScopePath(k);
      if (sk === k) continue;
      for (const f of ['preselected', 'hiddenCodes']) {
        if (pl[f] == null) continue;
        const target = (S.data.placements[sk] = S.data.placements[sk] || {});
        if (target[f] == null) target[f] = pl[f];
        delete pl[f];
      }
      if (!Object.keys(pl).length) delete S.data.placements[k];
    }
  }

  function normalizeAll() {
    Object.values(S.data.entities.group).forEach(normalizeGroup);
    Object.values(S.data.entities.product).forEach(normalizeProduct);
  }

  let persistTimer = null;
  function persistNow() {
    clearTimeout(persistTimer);
    try {
      const { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed, showPosIds } = S.ui;
      localStorage.setItem(
        storageKey(),
        JSON.stringify({
          version: 2,
          data: S.data,
          ui: { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed, showPosIds },
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
    Object.assign(hist, { past: [], future: [], key: null, at: 0 });
    Object.assign(T, { posSearchExpanded: {}, openCard: null, storeKey: null, focusRow: null });
    T.flashPaths.clear();
    T.flashExt.clear();
    load();
    S.ui.storeGroupId = storeGroupId;
    $('#pos-search').value = '';
    render();
    persistNow();
  }

  /* ---------- history ---------- */

  function commit(fn, { key = null, menu = null } = {}) {
    const snapshot = JSON.stringify(S.data);
    try {
      fn();
      normalizeAll();
      dataVersion++;
    } catch (err) {
      dataVersion++;
      if (err instanceof Abort) {
        S.data = JSON.parse(snapshot);
        if (err.message) toast(err.message, 'error');
        return false;
      }
      throw err;
    }
    const now = Date.now();
    const coalesce = key && hist.key === key && now - hist.at < 1500;
    if (!coalesce) {
      hist.past.push(snapshot);
      if (hist.past.length > 60) hist.past.shift();
    }
    hist.future = [];
    hist.key = key;
    hist.at = now;
    const m = menu || activeMenu();
    if (m && m.status === 'published') m.status = 'changed';
    render();
    return true;
  }

  function undo() {
    if (!hist.past.length) return;
    hist.future.push(JSON.stringify(S.data));
    S.data = JSON.parse(hist.past.pop());
    hist.key = null;
    render();
  }

  function redo() {
    if (!hist.future.length) return;
    hist.past.push(JSON.stringify(S.data));
    S.data = JSON.parse(hist.future.pop());
    hist.key = null;
    render();
  }
