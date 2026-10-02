(() => {
  'use strict';

  const C = window.MENU_CONSTANTS;
  const SUG = window.MENU_SUGGESTIONS;
  const STORAGE_KEY = 'menu-builder-prototype-v3';
  const CHILD_KIND = { menu: 'category', category: 'product', product: 'group', group: 'product' };
  const SEG = { category: 'c', product: 'p', group: 'g' };
  const SEG_KIND = { c: 'category', p: 'product', g: 'group' };
  const KIND_LABEL = { menu: 'Menu', category: 'Category', product: 'Product', group: 'Product group' };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SIZE_WORDS = ['kids', 'small', 'regular', 'medium', 'large', 'extra large'];
  const SIZE_ABBR = { sml: 'small', sm: 'small', reg: 'regular', med: 'medium', md: 'medium', lrg: 'large', lg: 'large', xl: 'extra large' };
  const STORE_STATES_PRODUCT = [
    ['active', 'Available'],
    ['hidden', 'Hidden'],
    ['oos_1h', 'Out of stock for 1 hour'],
    ['oos_4h', 'Out of stock for 4 hours'],
    ['oos_eod', 'Out of stock until end of day'],
    ['out_of_stock', 'Out of stock indefinitely'],
  ];
  const STORE_STATES = [['active', 'Active'], ['disabled', 'Disabled']];
  const isOutOfStock = (s) => s === 'out_of_stock' || /^oos_/.test(s);
  const DESC_LIMIT = 3000;
  const QTY_MAX = 999;

  /* ---------- utils ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const money = (n) => currency.format(Number(n) || 0);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const limitOf = (v) => (isNum(v) && v > 0 ? v : null);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
  const allergenLabel = (id) => C.allergenLabels[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
  const hashHue = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 360;
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  function listJoin(items) {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  function fmtTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  function relTime(ts) {
    const min = (Date.now() - ts) / 60000;
    if (min < 1) return 'just now';
    if (min < 60) return `${Math.round(min)} min ago`;
    return `at ${new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  function daysSummary(days) {
    const d = [...days].sort((a, b) => a - b);
    if (d.length === 7) return 'Every day';
    if (d.join() === '1,2,3,4,5') return 'Weekdays';
    if (d.join() === '0,6') return 'Weekends';
    if (!d.length) return 'No days';
    const consecutive = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    if (consecutive && d.length > 2) return `${DAYS[d[0]]}–${DAYS[d[d.length - 1]]}`;
    return d.map((i) => DAYS[i]).join(', ');
  }

  function scheduleOverlapDays(slots) {
    const days = new Set();
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        if (a.from < b.to && b.from < a.to) a.days.filter((d) => b.days.includes(d)).forEach((d) => days.add(d));
      }
    }
    return [...days].sort((x, y) => x - y);
  }

  function scheduleProblems(slots) {
    const out = [];
    if (slots.some((s) => !s.days.length)) out.push('Choose at least one day for each time slot');
    if (slots.some((s) => s.from === s.to)) out.push('Each time slot needs different start and end times');
    const overlap = scheduleOverlapDays(slots);
    if (overlap.length) out.push(`Time slots overlap on ${listJoin(overlap.map((d) => DAYS[d]))}`);
    return out;
  }

  const parseLocal = (v) => {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };

  function fmtDateTime(v) {
    const d = parseLocal(v);
    if (!d) return '';
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${date} at ${fmtTime(`${d.getHours()}:${d.getMinutes()}`)}`;
  }

  const hoursBetween = (from, to) => (parseLocal(to) - parseLocal(from)) / 3600000;

  function windowEndError(from, to) {
    if (!parseLocal(from) || !parseLocal(to)) return '';
    if (hoursBetween(from, to) <= 0) return 'Set the end after the start';
    return '';
  }

  function availabilityErrors(a) {
    const e = {};
    if (!a || !a.active) return e;
    if (a.mode === 'serving') {
      if (!a.slots.length) e.slots = 'Add at least one time slot';
      else if (scheduleProblems(a.slots).length) e.slots = scheduleProblems(a.slots)[0];
    } else if (a.mode === 'lto') {
      if (!parseLocal(a.lto.from)) e.ltoFrom = 'Add a start date and time';
      e.ltoTo = windowEndError(a.lto.from, a.lto.to) || (parseLocal(a.lto.from) && parseLocal(a.lto.to) && hoursBetween(a.lto.from, a.lto.to) < 24 ? 'Set the end at least 24 hours after the start' : '');
    } else {
      const p = a.preorder;
      if (!parseLocal(p.from)) e.preFrom = 'Add a start date and time';
      e.preTo = windowEndError(p.from, p.to) || (parseLocal(p.from) && parseLocal(p.to) && hoursBetween(p.from, p.to) < 24 ? 'Set the end at least 24 hours after the start' : '');
      if (!parseLocal(p.pickupFrom)) e.pickFrom = 'Add a pickup start date and time';
      else if (parseLocal(p.from) && hoursBetween(p.from, p.pickupFrom) < 24) e.pickFrom = 'Start pickup at least 24 hours after preorders open';
      e.pickTo = windowEndError(p.pickupFrom, p.pickupTo);
    }
    Object.keys(e).forEach((k) => !e[k] && delete e[k]);
    return e;
  }

  function availabilitySummary(a) {
    if (!a || !a.active) return '';
    if (a.mode === 'serving') return scheduleSummary(a.slots);
    if (a.mode === 'lto') return a.lto.from ? `On sale from ${fmtDateTime(a.lto.from)}${a.lto.to ? ` until ${fmtDateTime(a.lto.to)}` : ''}` : 'Limited-time offer';
    return a.preorder.from ? `Preorders open ${fmtDateTime(a.preorder.from)}${a.preorder.pickupFrom ? `. Pickup from ${fmtDateTime(a.preorder.pickupFrom)}` : ''}` : 'Preorder';
  }

  const qtyError = (v) => (isNum(v) && (!Number.isInteger(v) || v < 1 || v > QTY_MAX) ? `Enter a whole number from 1 to ${QTY_MAX}` : '');

  function rangeError(from, to, min = 0) {
    if ((isNum(from) && from < min) || (isNum(to) && to < min)) return `Enter ${min} or more`;
    if (!isNum(from) && isNum(to)) return 'Add the first value too';
    if (isNum(from) && isNum(to) && to < from) return 'The second value cannot be lower than the first';
    return '';
  }

  function prepErrors(prep) {
    if (!prep || !prep.active) return {};
    return {
      group: !prep.station && !isNum(prep.qty) && !isNum(prep.qty2) ? 'Add a prep station or quantity' : '',
      qty: isNum(prep.qty) && prep.qty <= 0 ? 'Enter a quantity above 0' : '',
      unit: isNum(prep.qty) && !prep.unit ? 'Choose a unit' : '',
      qty2: isNum(prep.qty2) && prep.qty2 <= 0 ? 'Enter a quantity above 0' : '',
      unit2: isNum(prep.qty2) && !prep.unit2 ? 'Choose a unit' : '',
    };
  }

  function segmentErrors(segments) {
    const seen = new Set();
    return segments.map((s) => {
      const id = (s.segmentId || '').trim().toLowerCase();
      if (!id) return 'Add a segment ID';
      if (seen.has(id)) return 'This segment is already added';
      seen.add(id);
      return '';
    });
  }

  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
  const IMAGE_MAX_BYTES = 1024 * 1024;
  const STORE_HOURS = 'During store hours';
  const menuScheduleSummary = (m) => scheduleSummary(m.schedule, STORE_HOURS);

  function newSlot(slots) {
    const used = new Set(slots.flatMap((s) => s.days));
    return { days: [0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d)), from: '09:00', to: '23:00' };
  }

  function scheduleSummary(slots, emptyText = 'Not available at any time') {
    if (!slots || !slots.length) return emptyText;
    return slots.map((s) => `${daysSummary(s.days)}, ${fmtTime(s.from)}–${fmtTime(s.to)}`).join(' · ');
  }

  /* ---------- icons ---------- */

  const ICONS = {
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    chevUp: '<path d="m18 15-6-6-6 6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4h4v4"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/>',
    dashed: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    expand: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    collapse: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
    send: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.24"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    diff: '<path d="M12 3v14"/><path d="M5 10h14"/><path d="M5 21h14"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  };
  const icon = (name, size = 16) =>
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const KIND_ICON = { category: 'folder', product: 'utensils', group: 'layers', menu: 'layers' };

  /* ---------- state ---------- */

  const S = { data: null, ui: null };
  const hist = { past: [], future: [], key: null, at: 0 };
  const T = {
    drag: null,
    dropTarget: null,
    markedRow: null,
    popover: null,
    modal: null,
    preview: null,
    picker: null,
    cmp: null,
    opt: null,
    flashPaths: new Set(),
    flashExt: new Set(),
    posSearchExpanded: {},
    posLoading: null,
    focusName: false,
    focusRow: null,
    allergenQuery: '',
    storeQuery: '',
    storeKey: null,
    openStoreGroup: null,
    showSelectedStores: false,
    segmentDraft: null,
    tagDraft: null,
    placeQuery: '',
    showSelectedPlaces: false,
    openCard: null,
    catProductQuery: '',
    catOnlyHidden: false,
    menuQuery: '',
    showSelectedMenus: false,
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
      schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '11:00', to: '22:00' }],
      segments: [],
      storeGroups: defaultStoreGroups(),
      publishedStoreIds: [],
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
    syncName: false,
    internalName: '',
    description: '',
    image: null,
    stores: {},
    children: [],
  });

  const newCategory = (o = {}) => ({ ...baseEntity(), id: uid('cat'), name: 'New category', reportingId: '', bannerImage: null, isBundle: false, ...o });

  function migrateCategory(c) {
    if (c.reportingId == null) c.reportingId = '';
    if (c.bannerImage === undefined) c.bannerImage = null;
    if (c.isBundle == null) c.isBundle = false;
    if (!c.stores) c.stores = {};
  }

  const newAvailability = () => ({
    active: false,
    mode: 'serving',
    slots: [],
    lto: { from: '', to: '' },
    preorder: { from: '', to: '', pickupFrom: '', pickupTo: '' },
  });

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
    upsell: { title: '', products: [] },
    crossSell: [],
    included: [],
    includedName: 'Included ingredients',
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

  const foodTypeFrom = (list) => ((list || []).includes('vegan') ? 'vegan' : (list || []).includes('vegetarian') ? 'vegetarian' : null);

  function migrateProduct(p) {
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
    if (!p.stores) p.stores = {};
    for (const [sid, v] of Object.entries(p.stores)) if (v === 'disabled') p.stores[sid] = 'hidden';
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
    return p.included.filter((i) => {
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

  function normalizeProduct(p) {
    if (!p.modifierCodes || !p.prep) return;
    if (p.foodType === '') p.foodType = null;
    if (p.preselectedCode === '' || (p.preselectedCode && !p.modifierCodes.includes(p.preselectedCode))) p.preselectedCode = null;
    if (!p.modifierCodes.length) p.isModifierCodeRequired = false;
    if (p.isModifierCodeRequired && !p.preselectedCode) p.preselectedCode = p.modifierCodes[0];
    if ((isNum(p.minQty) || isNum(p.maxQty)) && !p.qtyScope) p.qtyScope = 'cart';
    if (isNum(p.alcoholVol)) p.alcoholVol = clamp(p.alcoholVol, 0, 100);
    if (!isNum(p.prep.qty)) {
      p.prep.qty2 = null;
      p.prep.unit2 = '';
    }
    if (p.included.length && validIncluded(p).length !== p.included.length) p.included = validIncluded(p);
    for (const map of [p.substitutes, p.halfWhole]) for (const k of Object.keys(map)) if (!optionKeyValid(p, k)) delete map[k];
  }

  const newGroup = (o = {}) => ({
    ...baseEntity(),
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
    ...o,
  });

  /* ---------- POS lookups ---------- */

  const posItemById = (id) => (id && S.data.pos.items[id]) || null;
  const posItem = (ent) => (ent && ent.externalId ? posItemById(ent.externalId) : null);
  const posChildren = (id) => (posItemById(id) || {}).children || [];
  const isMissingOnPos = (ent) => ent.source === 'pos' && !posItem(ent);
  const isVirtual = (ent) => !!ent && ent.source === 'virtual';
  const isCustomVersion = (ent) => isVirtual(ent) && (ent.ptype === 'linked' || ent.gtype === 'linked');
  const isChoiceGroup = (g) => !!g && g.gtype === 'standalone' && (g.role === 'choice' || rulesOf(g).type === 2);
  const storeGroup = () => C.storeGroups.find((g) => g.id === S.ui.storeGroupId) || C.storeGroups[0];
  let priceCache = new Map();
  const posMenu = () => S.data.pos.menus.find((m) => m.id === S.ui.posMenuId) || S.data.pos.menus[0];
  const roundPrice = (v, f) => Math.round(v * f * 20) / 20;

  function posCategoriesOf(posId) {
    return Object.entries(S.data.pos.items)
      .filter(([, it]) => it.type === 'category' && it.children.includes(posId))
      .map(([id]) => id);
  }

  function findByExt(kind, ext) {
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
      groupStoreCache.set(id, g ? STORES.filter((s) => (g.airport ? s.airport : g.cities.includes(s.city))) : []);
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

  function defaultStoreGroups() {
    return C.menuStoreGroups.filter((g) => !g.airport).map((g) => ({ id: g.id, storeIds: null, newStores: true }));
  }

  function storeGroupsFromIds(storeIds) {
    const set = new Set(storeIds);
    return C.menuStoreGroups
      .filter((g) => !g.airport)
      .map((g) => {
        const all = groupStores(g.id);
        const chosen = all.filter((s) => set.has(s.id)).map((s) => s.id);
        if (!chosen.length) return null;
        const full = chosen.length === all.length;
        return { id: g.id, storeIds: full ? null : chosen, newStores: full };
      })
      .filter(Boolean);
  }

  function migrateMenu(m) {
    if (!m.storeGroups) m.storeGroups = m.storeIds ? storeGroupsFromIds(m.storeIds) : defaultStoreGroups();
    if (!m.externalChannels) m.externalChannels = m.channelTag ? [m.channelTag] : [];
    delete m.storeIds;
    delete m.channelTag;
    if (!m.channels) m.channels = ['web', 'mobile', 'kiosk'];
    if (!m.segments) m.segments = [];
    if (!m.publishedStoreIds) m.publishedStoreIds = m.status === 'draft' ? [] : menuStores(m).map((s) => s.id);
    if (m.externalId == null) m.externalId = '';
    if (m.image === undefined) m.image = null;
    if (m.posExt === undefined) m.posExt = null;
  }

  function statsOf(fn, stores = menuStores(activeMenu())) {
    const points = new Map();
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
      points.set(v, (points.get(v) || 0) + 1);
    }
    const priced = stores.length - missingStores.length;
    return { min: priced ? min : null, max: priced ? max : null, priced, missingStores, total: stores.length, points };
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
      syncName: true,
      reviewed: { name: item.name, price: isNum(item.price) ? item.price : null },
      description: item.description || '',
    };
    let ent;
    if (kind === 'category') ent = newCategory(base);
    else if (kind === 'product')
      ent = newProduct({
        ...base,
        originCategoryExt: posCategoriesOf(posId)[0] || null,
        allergens: [...(item.allergens || [])],
        foodType: foodTypeFrom(item.foodTypes),
        isAlcoholic: !!item.isAlcoholic,
        caloriesFrom: isNum(item.calories) ? item.calories : null,
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

  function seed() {
    S.data = {
      pos: JSON.parse(JSON.stringify(window.POS_SEED)),
      entities: { category: {}, product: {}, group: {} },
      menus: [],
      placements: {},
      ignored: {},
    };
    const lunch = newMenu({
      name: 'Lunch',
      internalName: 'Lunch — all stores',
      description: 'Available from opening until 4:00 PM.',
      posExt: 'pos-menu-main',
      orderTypes: ['dine_in', 'take_out', 'delivery', 'curbside'],
      externalChannels: ['doordash'],
      schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '11:00', to: '16:00' }],
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
      syncName: true,
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

    const burgersPath = `${lunch.id}>c:${burgers.id}`;
    const popularPath = `${lunch.id}>c:${popular.id}`;
    S.data.placements[`${burgersPath}>p:${truffle.id}>g:${grp('pos-g-temp').id}>p:${prod('pos-m-medium').id}`] = { preselected: 1 };
    S.data.placements[`${popularPath}>p:${brunch.id}>g:${addons.id}>p:${prod('pos-m-egg').id}`] = { preselected: 1 };
    brunch.availability = { ...newAvailability(), active: true, slots: [{ days: [0, 6], from: '11:00', to: '14:00' }] };
    truffle.metadata = [{ key: 'Badge', value: 'Chef’s pick' }];
    prod('pos-m-bacon').modifierCodes = ['no', 'light', 'extra', 'side'];
    const airports = STORES.filter((s) => s.airport);
    prod('pos-ipa').stores = { [airports[0].id]: 'out_of_stock', [airports[1].id]: 'oos_eod', [airports[2].id]: 'oos_eod' };
    prod('pos-m-avocado').stores = { [STORES[41].id]: 'hidden' };
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
      storeGroupId: C.storeGroups[0].id,
      posMenuId: S.data.pos.menus[0].id,
      sizeHintDismissed: {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) {
          S.data = parsed.data;
          S.data.menus.forEach(migrateMenu);
          Object.values(S.data.entities.category).forEach(migrateCategory);
          Object.values(S.data.entities.product).forEach(migrateProduct);
          for (const [k, pl] of Object.entries(S.data.placements)) if (/^[^>]+>c:[^>]+$/.test(k)) delete pl.schedule;
          migrateProductSchedules();
          Object.values(S.data.entities.product).forEach(normalizeProduct);
          S.ui = { ...defaultUi(), ...parsed.ui, posQuery: '', canvasQuery: '' };
          return;
        }
      }
    } catch (_) {
      /* fall through to seed */
    }
    seed();
    S.ui = defaultUi();
  }

  let persistTimer = null;
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        const { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed } = S.ui;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 2,
            data: S.data,
            ui: { activeMenuId, selected, expanded, posExpanded, tabs, storeGroupId, posMenuId, sizeHintDismissed },
          }),
        );
      } catch (_) {
        toast('Couldn’t save changes. Browser storage is full — remove some images', 'error');
      }
    }, 400);
  }

  /* ---------- history ---------- */

  function commit(fn, { key = null } = {}) {
    const snapshot = JSON.stringify(S.data);
    try {
      fn();
      Object.values(S.data.entities.product).forEach(normalizeProduct);
    } catch (err) {
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
    const m = activeMenu();
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

  /* ---------- model helpers ---------- */

  const menuById = (id) => S.data.menus.find((m) => m.id === id);
  const activeMenu = () => menuById(S.ui.activeMenuId) || S.data.menus[0];
  const entity = (kind, id) => (kind === 'menu' ? menuById(id) : S.data.entities[kind] && S.data.entities[kind][id]);
  const placement = (path) => S.data.placements[path] || {};

  function nameOf(kind, ent) {
    if (!ent) return 'Unknown';
    if (kind === 'menu') return ent.name || 'Untitled menu';
    if (ent.source === 'pos' && ent.syncName) {
      const p = posItem(ent);
      return p ? p.name : (ent.reviewed && ent.reviewed.name) || ent.name;
    }
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

  function pathExists(path) {
    const segs = path.split('>');
    let kind = 'menu';
    let ent = menuById(segs[0]);
    if (!ent) return false;
    for (let i = 1; i < segs.length; i++) {
      const [s, id] = segs[i].split(':');
      const k = SEG_KIND[s];
      if (CHILD_KIND[kind] !== k || !ent.children.includes(id)) return false;
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

  function walkMenu(menu, visit) {
    const seen = new Set();
    const rec = (kind, id, path, depth) => {
      const ent = entity(kind, id);
      if (!ent) return;
      const descend = visit(kind, id, ent, path, depth) !== false;
      if (!descend) return;
      const ck = CHILD_KIND[kind];
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
      const ck = CHILD_KIND[kind];
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
    const ck = CHILD_KIND[kind];
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

  function sizeGroupOf(ent) {
    return ent.children.map((gid) => entity('group', gid)).find((g) => g && (g.role === 'choice' || rulesOf(g).type === 2)) || null;
  }

  function allowedPosGroupsFor(productPath) {
    const p = entity('product', parsePath(productPath).id);
    if (p.ptype === 'pos') return posChildren(p.externalId);
    if (p.ptype === 'linked') return posChildren(p.posParentExt);
    if (p.ptype === 'container') {
      const anc = nearestPosProduct(productPath);
      return anc ? posChildren(anc.posId) : [];
    }
    const g = sizeGroupOf(p);
    const sizes = g ? g.children.map((pid) => posIdOf('product', entity('product', pid))).filter(Boolean) : [];
    if (!sizes.length) return [];
    return posChildren(sizes[0]).filter((gid) => sizes.every((s) => posChildren(s).includes(gid)));
  }

  function rulesOf(g) {
    if (g.gtype === 'pos') {
      const src = posItem(g) || g.posRules || {};
      const r = g.posRules || {};
      return {
        type: src.groupType || r.groupType || 1,
        min: src.min || 0,
        max: isNum(src.max) ? src.max : null,
        maxSingle: src.maxSingle || 1,
        freeCount: src.free || 0,
      };
    }
    const nvpg = g.gtype === 'linked' ? posItemById(g.posGroupExt) : null;
    return {
      type: nvpg ? nvpg.groupType || 1 : g.type || 1,
      min: g.min || 0,
      max: isNum(g.max) ? g.max : null,
      maxSingle: g.maxSingle || 1,
      freeCount: g.freeCount || 0,
    };
  }

  function priceSource(path) {
    const info = parsePath(path);
    const ent = entity('product', info.id);
    const parent = parsePath(info.parentPath);
    const pEnt = entity(parent.kind, parent.id);
    if (ent.ptype === 'container') return { kind: 'none', note: 'Customers pay for the options inside' };
    if (ent.ptype === 'size') {
      const g = sizeGroupOf(ent);
      if (!g || !g.children.length) return { kind: 'from', note: 'Add products to choose from to show a price', sizes: [] };
      const gp = childPath(path, 'group', g.id);
      return { kind: 'from', note: 'Lowest POS price of the choices', sizes: g.children.map((pid) => priceSource(childPath(gp, 'product', pid))) };
    }
    const own = posIdOf('product', ent);
    const missingNote = isMissingOnPos(ent) ? 'Last known POS price' : null;
    const src = { own, ent };
    if (parent.kind === 'group') {
      const owner = entity('product', parsePath(parent.parentPath).id);
      if (owner.ptype === 'size') return { ...src, kind: 'size', note: missingNote || 'POS price of this choice' };
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
    if (src.kind === 'from') {
      const values = src.sizes.map((s) => priceAt(s, store)).filter(isNum);
      return values.length ? Math.min(...values) : null;
    }
    if (src.kind === 'modifier') return posOptionPrice(src.group, src.own, src.ent, store);
    return posPrice(src.own, src.ent, store);
  }

  function priceInfo(path, store) {
    const src = priceStats(path);
    return { kind: src.kind, note: src.note, value: priceAt(src, store) };
  }

  function priceStats(path) {
    if (priceCache.has(path)) return priceCache.get(path);
    const src = priceSource(path);
    const st = src.kind === 'none' ? { ...src, priced: 0, total: 0, missingStores: [] } : { ...src, ...statsOf((s) => priceAt(src, s)) };
    priceCache.set(path, st);
    return st;
  }

  function priceText(st) {
    const text = rangeText(st, { plus: st.kind === 'modifier' || st.kind === 'item', freeWord: st.kind === 'modifier' });
    return st.kind === 'from' && st.priced ? `From ${text}` : text;
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
    if (CHILD_KIND[pi.kind] !== d.kind) return 'This item cannot go here';
    const parent = entity(pi.kind, pi.id);
    const pName = nameOf(pi.kind, parent);
    const standaloneError = () =>
      d.posId && !posCategoriesOf(d.posId).length ? `${d.name} is sold only as an option on POS, so it has no price of its own` : null;
    if (pi.kind === 'menu') return null;
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
      return `${d.name} is not a group of ${pName} on POS. To show these options here, create an add-on group`;
    }
    if (d.ptype === 'container') return isChoiceGroup(parent) ? `Customers pick one product in ${pName}, so option folders cannot go in it` : null;
    if (d.ptype === 'size') return 'Choice products go in a category';
    if (parent.gtype === 'standalone') return d.source === 'pos' ? standaloneError() : null;
    if (d.source !== 'pos') return `Only POS products can be options in ${pName}. Put custom versions in an add-on group`;
    const gpos = posIdOf('group', parent);
    if (posChildren(gpos).includes(d.posId)) return null;
    return `${d.name} is not an option of ${posLabel(gpos)} on POS. To offer it here, create an add-on group`;
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
    for (const pid of category.children) {
      const p = entity('product', pid);
      if (!p || p.ptype !== 'pos') continue;
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

  /* ---------- derived context ---------- */

  function computeCtx() {
    priceCache = new Map();
    const usage = new Map();
    for (const m of S.data.menus) {
      walkMenu(m, (k, id, ent, path) => {
        const key = `${k}:${id}`;
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push(path);
      });
    }
    const menu = activeMenu();
    const inMenuExt = new Set();
    const counts = { category: new Set(), product: new Set(), group: new Set() };
    walkMenu(menu, (k, id, ent) => {
      counts[k].add(id);
      const ext = posIdOf(k, ent);
      if (ext) inMenuExt.add(ext);
    });
    return {
      usage,
      inMenuExt,
      counts: { category: counts.category.size, product: counts.product.size, group: counts.group.size },
      issues: computeIssues(menu),
      compare: compareData(menu),
    };
  }

  function computeIssues(menu) {
    const byPath = new Map();
    const list = [];
    const seen = new Set();
    const add = (path, level, text, dedupeKey, tab) => {
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push({ level, text });
      const k = `${dedupeKey || path}|${text}`;
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ path, level, text, tab });
      }
    };
    if (!menu.name || !menu.name.trim()) add(menu.id, 'error', 'Add a menu name');
    if (!menu.channels.length) add(menu.id, 'error', 'Choose at least one channel');
    if (!menu.orderTypes.length) add(menu.id, 'error', 'Choose at least one order type');
    if (!menu.storeGroups.length) add(menu.id, 'error', 'Add at least one store group');
    else if (!menuStores(menu).length) add(menu.id, 'error', 'Choose at least one store');
    scheduleProblems(menu.schedule).forEach((t) => add(menu.id, 'error', t));
    if (segmentErrors(menu.segments).some(Boolean)) add(menu.id, 'error', 'Fix the customer segments');
    if (!menu.children.length) add(menu.id, 'warning', 'Menu has no categories yet');

    walkMenu(menu, (kind, id, ent, path) => {
      const key = `${kind}:${id}`;
      const name = nameOf(kind, ent);
      if (isMissingOnPos(ent)) add(path, 'warning', `${name} was deleted on POS. Customers cannot order it`, key);
      else if (removedFromPos(path)) {
        const pi = parsePath(parsePath(path).parentPath);
        add(path, 'warning', `${name} is no longer under ${nameOf(pi.kind, entity(pi.kind, pi.id))} on POS`, `${pi.kind}:${pi.id}>${key}`);
      }
      if ((ent.description || '').length > DESC_LIMIT) add(path, 'error', `${name}: description is longer than ${DESC_LIMIT} characters`, key);
      if (kind === 'category') {
        const label = name || 'Category';
        if (!(ent.name || '').trim() && !ent.syncName) add(path, 'error', 'Add a category name', key);
        if ((ent.name || '').length > TEXT_LIMIT) add(path, 'error', `${label}: name is longer than ${TEXT_LIMIT} characters`, key);
        if ((ent.internalName || '').length > TEXT_LIMIT) add(path, 'error', `${label}: internal name is longer than ${TEXT_LIMIT} characters`, key);
        if ((ent.reportingId || '').length > TEXT_LIMIT) add(path, 'error', `${label}: external ID is longer than ${TEXT_LIMIT} characters`, key);
        if (!ent.children.length) add(path, 'warning', `${label} has no products`, key);
        else if (ent.children.every((pid) => placement(childPath(path, 'product', pid)).hidden))
          add(path, 'warning', `${label}: all products are hidden in ${menu.name || 'this menu'}`);
      }
      if (kind === 'product') {
        const label = name || 'Product';
        const pAdd = (level, text, tab) => add(path, level, text, key, tab);
        if (!(ent.name || '').trim() && !ent.syncName) pAdd('error', 'Add a product name', 'general');
        if ((ent.name || '').length > TEXT_LIMIT) pAdd('error', `${label}: name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.internalName || '').length > TEXT_LIMIT) pAdd('error', `${label}: internal name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.reportingId || '').length > TEXT_LIMIT) pAdd('error', `${label}: external ID is longer than ${TEXT_LIMIT} characters`, 'advanced');
        if (ent.ptype === 'linked') {
          if (!ent.posParentExt) pAdd('error', `${name}: choose the POS product it rings up as, so customers can order it`, 'general');
          else if (!posItemById(ent.posParentExt)) pAdd('error', `${name}: the POS product it rings up as was deleted on POS`, 'general');
        }
        if (ent.ptype === 'container' && !ent.children.length) pAdd('warning', `${name} has no groups. Customers see an empty option`, 'general');
        if (ent.ptype === 'size' && !sizeGroupOf(ent)) pAdd('error', `${name} has no products to choose from`, 'general');
        const ps = priceStats(path);
        if (ps.total && ps.missingStores.length && !isMissingOnPos(ent)) {
          const n = ps.missingStores.length;
          if (n === ps.total) pAdd('error', `${name} has no POS price at any store in this menu`, 'general');
          else pAdd('warning', `${name} has no POS price at ${plural(n, 'store', 'stores')}, so customers there cannot ${parsePath(parsePath(path).parentPath).kind === 'group' ? 'choose' : 'order'} it`, 'general');
        }
        if (qtyError(ent.minQty) || qtyError(ent.maxQty)) pAdd('error', `${name}: quantity limits need whole numbers from 1 to ${QTY_MAX}`, 'ordering');
        else if (isNum(ent.minQty) && isNum(ent.maxQty) && ent.maxQty < ent.minQty) pAdd('error', `${name}: maximum quantity is lower than the minimum`, 'ordering');
        if (ent.isAlcoholic && !isNum(ent.alcoholVol)) pAdd('warning', `${name}: alcohol percentage is missing`, 'dietary');
        if (rangeError(ent.caloriesFrom, ent.caloriesTo) || rangeError(ent.servingFrom, ent.servingTo, 1)) pAdd('error', `${name}: fix the calories or serves range`, 'dietary');
        const pl = placement(path);
        if (ent.isModifierCodeRequired && ent.modifierCodes.length && (pl.hiddenCodes || []).length >= ent.modifierCodes.length)
          add(path, 'error', `${name}: a modifier code is required, but all codes are hidden here`, undefined, 'ordering');
        if (ent.upsell.products.length && !ent.upsell.title.trim()) pAdd('error', `${name}: add an upsell title`, 'ordering');
        if (ent.included.length && !ent.includedName.trim()) pAdd('error', `${name}: add a name for the included ingredients`, 'ordering');
        if (ent.sections.some((s) => !s.name.trim())) pAdd('error', `${name}: add a name to each group section`, 'ordering');
        if ([ent.upsell.title, ent.includedName, ...ent.sections.map((s) => s.name)].some((v) => lengthError(v)))
          pAdd('error', `${name}: a title on the Ordering tab is longer than ${TEXT_LIMIT} characters`, 'ordering');
        if (ent.metadata.some((t) => lengthError(t.key) || lengthError(t.value))) pAdd('error', `${name}: a metadata tag is longer than ${TEXT_LIMIT} characters`, 'advanced');
        if (Object.values(ent.halfWhole).some((h) => !h.left !== !h.right)) pAdd('warning', `${name}: some toppings have only one half set`, 'ordering');
        const availErr = Object.values(availabilityErrors(ent.availability))[0];
        if (availErr) pAdd('error', `${name} custom availability: ${lcFirst(availErr)}`, 'availability');
        if (segmentErrors(ent.segments).some(Boolean)) pAdd('error', `${name}: fix the customer segments`, 'advanced');
        if (ent.metadata.some((t) => !t.key.trim() || !t.value.trim())) pAdd('error', `${name}: each metadata tag needs a key and a value`, 'advanced');
        const prepErr = Object.values(prepErrors(ent.prep)).find(Boolean);
        if (prepErr) pAdd('error', `${name} prep info: ${lcFirst(prepErr)}`, 'advanced');
        const posId = posIdOf('product', ent);
        if (posId) {
          for (const gid of posChildren(posId)) {
            const pg = posItemById(gid);
            if (!pg || pg.groupType !== 3) continue;
            const present = ent.children.some((c) => posIdOf('group', entity('group', c)) === gid);
            if (!present) pAdd('error', `Combo group ${pg.name} is required. Add it with at least one product`, 'ordering');
          }
        }
      }
      if (kind === 'group') {
        const r = rulesOf(ent);
        const count = ent.children.length;
        const max = limitOf(r.max);
        const posHint = ent.gtype === 'pos' ? ' Check the group settings in POS' : '';
        if (max != null && r.min > max) add(path, 'error', `${name}: minimum is higher than the maximum.${posHint}`, key);
        else if (!count) add(path, r.min > 0 || r.type === 3 ? 'error' : 'warning', `${name} has no products. Add at least one`, key);
        else if (r.min > count * Math.max(1, r.maxSingle))
          add(path, 'error', `${name} needs at least ${r.min} choices, but has only ${plural(count, 'option', 'options')}`, key);
        if (max != null && r.freeCount > max) add(path, 'warning', `${name}: more free choices than the maximum`, key);
        const pre = ent.children.reduce((s, pid) => s + preselectedAt(childPath(path, 'product', pid)), 0);
        if (max != null && pre > max) add(path, 'error', `${name}: ${pre} options preselected, but the maximum is ${max}`);
      }
    });

    list.sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
    return {
      byPath,
      list,
      errors: list.filter((i) => i.level === 'error').length,
      warnings: list.filter((i) => i.level === 'warning').length,
    };
  }

  function isAutoAdded(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath) return false;
    const pi = parsePath(info.parentPath);
    if (pi.kind !== 'group') return false;
    const g = entity('group', pi.id);
    const posG = posItemById(posIdOf('group', g));
    const ent = entity('product', info.id);
    return !!(posG && posG.autoAdded && posG.autoAdded.includes(ent.externalId));
  }

  const preselectedAt = (path) => Math.max(placement(path).preselected || 0, isAutoAdded(path) ? 1 : 0);

  function childOnCanvas(kind, path, ent, cid) {
    const ck = CHILD_KIND[kind];
    const direct = ent.children.some((c) => posIdOf(ck, entity(ck, c)) === cid);
    if (direct) return true;
    if (kind === 'category') {
      return ent.children.some((c) => {
        const p = entity('product', c);
        const g = p && p.ptype === 'size' ? sizeGroupOf(p) : null;
        return !!g && g.children.some((s) => posIdOf('product', entity('product', s)) === cid);
      });
    }
    if (kind !== 'product') return false;
    let found = false;
    walkSubtree(path, (k, i, e, p) => {
      if (p !== path && k === 'group' && posIdOf('group', e) === cid) found = true;
    });
    return found;
  }

  function compareData(menu) {
    const missing = new Map();
    const changed = new Map();
    const gone = [];
    const goneSeen = new Set();
    walkMenu(menu, (kind, id, ent, path) => {
      const missingNow = isMissingOnPos(ent);
      const pi = parsePath(parsePath(path).parentPath);
      const linkKey = `${pi.kind}:${pi.id}>${kind}:${id}`;
      if ((missingNow || removedFromPos(path)) && !goneSeen.has(linkKey)) {
        goneSeen.add(linkKey);
        gone.push({ path, kind, ent, label: missingNow ? 'Deleted on POS' : `Removed from ${nameOf(pi.kind, entity(pi.kind, pi.id))} on POS` });
      }
      if (ent.source !== 'pos') return;
      const it = posItem(ent);
      if (!it) return;
      if (ent.reviewed && !changed.has(ent.id)) {
        const diffs = [];
        if (ent.reviewed.name !== it.name) diffs.push(`Name: ${ent.reviewed.name} → ${it.name}`);
        if (kind === 'product' && isNum(it.price) && ent.reviewed.price !== it.price)
          diffs.push(`Price changed on POS. Now ${rangeText(statsOf((s) => posPrice(ent.externalId, ent, s), menuStores(menu)))}`);
        if (diffs.length) changed.set(ent.id, { kind, ent, path, diffs });
      }
      for (const cid of posChildren(ent.externalId)) {
        const key = `${ent.externalId}/${cid}`;
        if (missing.has(key) || !posItemById(cid) || childOnCanvas(kind, path, ent, cid)) continue;
        missing.set(key, { key, path, kind: CHILD_KIND[kind], posId: cid, parentName: nameOf(kind, ent), ignored: !!S.data.ignored[key] });
      }
    });
    const all = [...missing.values()];
    const fresh = all.filter((m) => !m.ignored);
    return {
      missing: fresh,
      ignored: all.filter((m) => m.ignored),
      changed: [...changed.values()],
      gone,
      count: fresh.length + changed.size + gone.length,
    };
  }

  /* ---------- binding ---------- */

  function bindTarget(bind, create) {
    const parts = bind.split('|');
    let obj;
    let field;
    if (parts[0] === 'e') {
      obj = entity(parts[1], parts[2]);
      field = parts[3];
    } else if (parts[0] === 'm') {
      obj = menuById(parts[1]);
      field = parts[2];
    } else if (parts[0] === 'pl') {
      obj = S.data.placements[parts[1]];
      if (!obj) {
        if (!create) return { obj: {}, key: parts[2] };
        obj = S.data.placements[parts[1]] = {};
      }
      field = parts[2];
    }
    if (!obj) return { obj: {}, key: field };
    const keys = field.split('.');
    const last = keys.pop();
    for (const k of keys) {
      if (obj[k] == null) {
        if (!create) return { obj: {}, key: last };
        obj[k] = {};
      }
      obj = obj[k];
    }
    return { obj, key: last };
  }

  const getBind = (bind) => {
    const { obj, key } = bindTarget(bind, false);
    return obj[key];
  };
  const setBind = (bind, value) => {
    const { obj, key } = bindTarget(bind, true);
    obj[key] = value;
  };

  function parseInput(el) {
    const raw = el.value;
    const type = el.dataset.type;
    if (type === 'int' || type === 'num') {
      if (raw.trim() === '') return null;
      const v = type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
      return Number.isFinite(v) ? v : null;
    }
    return raw;
  }

  /* ---------- mutations ---------- */

  function select(path, { focusRow = false } = {}) {
    S.ui.selected = path;
    if (focusRow) T.focusRow = path;
    render();
  }

  function expandTo(path) {
    ancestorsOf(path).forEach((a) => (S.ui.expanded[a] = true));
  }

  function flash(path) {
    T.flashPaths.add(path);
    setTimeout(() => T.flashPaths.delete(path), 1200);
  }

  function insertNew(parentPath, kind, ent, { focusName = true, tab = 'general' } = {}) {
    const pInfo = parsePath(parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    S.data.entities[kind][ent.id] = ent;
    parent.children.push(ent.id);
    S.ui.expanded[parentPath] = true;
    const np = childPath(parentPath, kind, ent.id);
    S.ui.expanded[np] = true;
    S.ui.selected = np;
    S.ui.tabs[kind] = tab;
    T.focusName = focusName;
    flash(np);
    return np;
  }

  function createVirtualCategory() {
    commit(() => insertNew(activeMenu().id, 'category', newCategory()));
  }

  function posDesc(posId, extra = {}) {
    const kind = extra.kind || posItemById(posId).type;
    return {
      origin: 'pos',
      posId,
      kind,
      name: extra.name || posLabel(posId),
      source: 'pos',
      ptype: kind === 'product' ? 'pos' : null,
      gtype: kind === 'group' ? 'pos' : null,
      chainCat: null,
      posPath: [],
      ...extra,
    };
  }

  function openAddPicker({ title, intro, parentPath, ids, priceOf, noun }) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    const ck = CHILD_KIND[pi.kind];
    const present = new Set(parent.children.map((c) => posIdOf(ck, entity(ck, c))).filter(Boolean));
    const items = ids
      .filter((id) => posItemById(id) && !present.has(id))
      .map((id) => ({ id, name: posLabel(id), alt: posItemById(id).name, meta: id, price: priceOf ? priceOf(id) : '' }));
    openPicker({
      title,
      intro,
      placeholder: 'Search by name or POS ID',
      items,
      empty: `All ${noun} are already in ${nameOf(pi.kind, parent)}`,
      keepOpen: true,
      onPick: (id) => {
        const chainCat = ck === 'product' ? (pi.kind === 'category' && !isVirtual(parent) ? parent.externalId : posCategoriesOf(id)[0] || null) : null;
        performDrop(posDesc(id, { chainCat }), { path: parentPath, pos: 'inside' });
        const now = entity(pi.kind, pi.id);
        if (!T.picker || !now || !now.children.some((c) => posIdOf(ck, entity(ck, c)) === id)) return;
        T.picker.items = T.picker.items.filter((it) => it.id !== id);
        renderPicker();
        toast(`${posLabel(id)} added`);
      },
    });
  }

  function openPosCategoryPicker() {
    const menu = activeMenu();
    const ids = [...new Set(S.data.pos.menus.flatMap((m) => m.roots))];
    openAddPicker({
      title: 'Add POS category',
      intro: 'Each category comes with its POS products, options, and prices.',
      parentPath: menu.id,
      ids,
      priceOf: (id) => plural(posChildren(id).length, 'product', 'products'),
      noun: 'POS categories',
    });
  }

  function openPosProductPicker(parentPath) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    const price = (id) => rangeText(statsOf((s) => posPrice(id, null, s), STORES));
    if (pi.kind === 'category') {
      const own = !isVirtual(parent);
      return openAddPicker({
        title: 'Add POS product',
        intro: own ? `Products in ${posLabel(parent.externalId)} on POS.` : 'Any product from POS. It keeps its POS price and options.',
        parentPath,
        ids: own ? posChildren(parent.externalId) : posProductChoices().map((c) => c.id),
        priceOf: price,
        noun: own ? `products from ${posLabel(parent.externalId)}` : 'POS products',
      });
    }
    if (parent.gtype === 'standalone') {
      return openAddPicker({
        title: 'Add POS product',
        intro: isChoiceGroup(parent) ? 'Customers pick one of these products. The one they pick is sent to POS.' : 'Each product customers pick is added to the order as its own item.',
        parentPath,
        ids: posProductChoices().map((c) => c.id),
        priceOf: price,
        noun: 'POS products',
      });
    }
    const gpos = posIdOf('group', parent);
    openAddPicker({
      title: 'Add POS option',
      intro: `Options of ${posLabel(gpos)} on POS.`,
      parentPath,
      ids: posChildren(gpos),
      priceOf: (id) => rangeText(statsOf((s) => posOptionPrice(gpos, id, null, s), STORES), { plus: true, freeWord: true }),
      noun: `options from ${posLabel(gpos)}`,
    });
  }

  function posGroupMenu(anchor, productPath) {
    const p = entity('product', parsePath(productPath).id);
    const present = new Set(p.children.map((c) => posIdOf('group', entity('group', c))).filter(Boolean));
    const ids = allowedPosGroupsFor(productPath).filter((gid) => posItemById(gid) && !present.has(gid));
    openPopover(
      anchor,
      ids.length
        ? [{ heading: 'Add POS group' }].concat(
            ids.map((gid) => ({
              label: posLabel(gid),
              hint: `${C.groupTypes[posItemById(gid).groupType || 1].label} · ${plural(posChildren(gid).length, 'option', 'options')}`,
              icon: 'layers',
              onClick: () => performDrop(posDesc(gid), { path: productPath, pos: 'inside' }),
            })),
          )
        : [{ empty: `<strong>No POS groups left</strong><span>All POS groups of ${esc(nameOf('product', p))} are already added.</span>` }],
    );
  }

  function addCategoryMenu(anchor) {
    openPopover(anchor, [
      { heading: 'Add from POS' },
      { label: 'POS category', hint: 'Comes with its POS products and prices', icon: 'folder', onClick: openPosCategoryPicker },
      { heading: 'Create' },
      { label: 'Menu-only category', hint: 'Arrange products your own way. Not on POS', icon: 'dashed', onClick: createVirtualCategory },
    ]);
  }

  function createChoiceProduct(categoryPath) {
    commit(() => {
      const g = newGroup({ gtype: 'standalone', role: 'choice', name: 'Choose one', min: 1, max: 1 });
      S.data.entities.group[g.id] = g;
      const np = insertNew(categoryPath, 'product', newProduct({ ptype: 'size', name: 'New choice product', children: [g.id] }));
      S.ui.expanded[childPath(np, 'group', g.id)] = true;
    });
    toast('Choice product created. Add the products customers choose between', 'success');
  }

  function posProductChoices() {
    const out = [];
    const seen = new Set();
    for (const m of S.data.pos.menus) {
      for (const cid of m.roots) {
        for (const pid of posChildren(cid)) {
          if (seen.has(pid) || !posItemById(pid)) continue;
          seen.add(pid);
          out.push({ id: pid, name: posLabel(pid), alt: posItemById(pid).name, meta: `${posLabel(cid)} · ${pid}`, price: rangeText(statsOf((s) => posPrice(pid, null, s), STORES)) });
        }
      }
    }
    return out;
  }

  function openLinkedProductPicker(categoryPath) {
    openPicker({
      title: 'Create custom version',
      intro: 'Choose the POS product it rings up as. The custom version gets its own name, image, and preselected options, and always uses that product’s POS price.',
      placeholder: 'Search by product name or POS ID',
      items: posProductChoices(),
      onPick: (posId) => {
        closeModal(true);
        commit(() => {
          const parentItem = posItemById(posId);
          const source = findByExt('product', posId);
          insertNew(
            categoryPath,
            'product',
            newProduct({
              ptype: 'linked',
              posParentExt: posId,
              name: `${posLabel(posId)} (copy)`,
              description: source ? source.description : parentItem.description || '',
              allergens: [...(source ? source.allergens : parentItem.allergens || [])],
              foodType: source ? source.foodType : foodTypeFrom(parentItem.foodTypes),
            }),
          );
        });
        toast('Custom version created. Add its groups next', 'success');
      },
    });
  }

  function changePosParent(path) {
    const ent = entity('product', parsePath(path).id);
    openPicker({
      title: 'Change what it rings up as',
      intro: 'The custom version rings up on POS as this product, at its POS price. Groups that this product does not have are flagged.',
      placeholder: 'Search by product name or POS ID',
      items: posProductChoices(),
      onPick: (posId) => {
        closeModal(true);
        commit(() => (ent.posParentExt = posId));
        toast(`Now rings up as ${posLabel(posId)}`);
      },
    });
  }

  function categorizedProducts() {
    const out = new Map();
    S.data.menus.forEach((m) =>
      m.children.forEach((cid) => {
        const c = entity('category', cid);
        if (!c) return;
        c.children.forEach((pid) => {
          const cats = out.get(pid) || [];
          if (!cats.includes(c)) cats.push(c);
          out.set(pid, cats);
        });
      }),
    );
    return out;
  }

  function openListPicker({ title, intro, items, empty, onAdd }) {
    openPicker({
      title,
      intro,
      placeholder: 'Search products',
      items,
      empty,
      noMatch: ['No matching products', 'Try a different name.'],
      keepOpen: true,
      onPick: (id) => {
        const name = (T.picker.items.find((it) => it.id === id) || {}).name;
        commit(() => onAdd(id));
        if (!T.picker) return;
        T.picker.items = T.picker.items.filter((it) => it.id !== id);
        renderPicker();
        toast(`${name} added`);
      },
    });
  }

  function openProductListPicker(p, bind, title) {
    const chosen = getBind(bind) || [];
    const items = [...categorizedProducts().entries()]
      .map(([pid, cats]) => ({ pid, cats, x: entity('product', pid) }))
      .filter(({ pid, x }) => x && pid !== p.id && ['pos', 'linked'].includes(x.ptype) && !chosen.includes(pid))
      .map(({ pid, cats, x }) => ({ id: pid, name: nameOf('product', x), alt: x.internalName || '', meta: listJoin(cats.map((c) => nameOf('category', c))), price: '' }));
    openListPicker({
      title,
      intro: 'Products from the categories in your menus.',
      items,
      empty: 'Every product is already added',
      onAdd: (pid) => setBind(bind, [...(getBind(bind) || []), pid]),
    });
  }

  function openIncludedPicker(p) {
    const taken = new Set(p.included.map((it) => `${it.gid}:${it.pid}`));
    openListPicker({
      title: 'Add included ingredients',
      intro: `Options from the groups of ${nameOf('product', p)}.`,
      items: productOptions(p)
        .filter((o) => !taken.has(o.key))
        .map((o) => ({ id: o.key, name: nameOf('product', o.x), alt: o.x.internalName || '', meta: nameOf('group', o.g), price: '' })),
      empty: 'Every option is already included',
      onAdd: (key) => {
        const [gid, pid] = key.split(':');
        p.included.push({ gid, pid, locked: false });
      },
    });
  }

  function openSubstitutePicker(p, key) {
    const [, originId] = key.split(':');
    const chosen = p.substitutes[key] || [];
    const seen = new Set([originId, p.id, ...chosen]);
    const items = productOptions(p)
      .filter((o) => !seen.has(o.pid) && seen.add(o.pid))
      .map((o) => ({ id: o.pid, name: nameOf('product', o.x), alt: o.x.internalName || '', meta: nameOf('group', o.g), price: '' }));
    openListPicker({
      title: `Add substitutes for ${nameOf('product', entity('product', originId))}`,
      intro: `Options from the groups of ${nameOf('product', p)}.`,
      items,
      empty: 'Every option is already a substitute',
      onAdd: (pid) => (p.substitutes[key] = [...(p.substitutes[key] || []), pid]),
    });
  }

  function confirmCopyToChoices(p) {
    const g = sizeGroupOf(p);
    const kids = (g ? g.children : []).map((id) => entity('product', id)).filter(Boolean);
    const name = nameOf('product', p);
    openModal({
      title: `Copy details to ${plural(kids.length, 'choice', 'choices')}?`,
      body: `<p>Each choice gets the name, description, and image of ${esc(name)}.${p.image ? '' : ' This product has no image, so the choices lose theirs.'}</p>
        <p>The first time a choice gets a new name, its current name becomes its internal name, so your team can still tell the choices apart.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Copy details',
          kind: 'primary',
          onClick: () => {
            closeModal();
            commit(() =>
              kids.forEach((x) => {
                if (nameOf('product', x) !== name) {
                  if (!x.namePropagated) x.internalName = nameOf('product', x);
                  x.namePropagated = true;
                  x.name = name;
                  x.syncName = false;
                }
                x.description = p.description;
                x.image = p.image;
              }),
            );
            toast(`Details copied to ${plural(kids.length, 'choice', 'choices')}`, 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
  }

  function toggleProductPlace(p, kind, id) {
    const parent = entity(kind, id);
    const name = nameOf(kind, parent);
    if (!parent.children.includes(p.id)) {
      commit(() => parent.children.push(p.id));
      toast(`Added to ${name}`, 'success', { action: { label: 'Undo', onClick: undo } });
      return;
    }
    const seg = `${SEG[kind]}:${id}>p:${p.id}`;
    const inSeg = (k) => k.endsWith(`>${seg}`) || k.includes(`>${seg}>`);
    commit(() => {
      parent.children = parent.children.filter((c) => c !== p.id);
      for (const k of Object.keys(S.data.placements)) if (inSeg(k)) delete S.data.placements[k];
      if (inSeg(S.ui.selected)) {
        const at = S.ui.selected.indexOf(`>${seg}`);
        S.ui.selected = S.ui.selected.slice(0, at + 1 + `${SEG[kind]}:${id}`.length);
      }
    });
    toast(`Removed from ${name}`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function createVirtualGroup(productPath, mode, posGroupId) {
    commit(() => {
      let g;
      if (mode === 'linked') {
        const it = posItemById(posGroupId);
        g = newGroup({
          gtype: 'linked',
          posGroupExt: posGroupId,
          name: posLabel(posGroupId),
          min: it.min || 0,
          max: isNum(it.max) ? it.max : null,
          maxSingle: it.maxSingle || 1,
          freeCount: it.free || 0,
          children: posChildren(posGroupId).map((c) => importPos(c)).filter(Boolean).map((r) => r.id),
        });
      } else {
        g = newGroup({ gtype: 'standalone', name: 'Add to your order', min: 0, max: null });
      }
      insertNew(productPath, 'group', g, { tab: mode === 'linked' ? 'options' : 'general' });
    });
  }

  function addParentGroups(productPath) {
    const p = entity('product', parsePath(productPath).id);
    let added = 0;
    commit(() => {
      for (const gid of allowedPosGroupsFor(productPath)) {
        if (p.children.some((c) => posIdOf('group', entity('group', c)) === gid)) continue;
        const res = importPos(gid);
        if (res) {
          p.children.push(res.id);
          added++;
        }
      }
      S.ui.expanded[productPath] = true;
    });
    toast(added ? `${plural(added, 'group', 'groups')} added from POS` : 'All POS groups are already added', added ? 'success' : 'info');
  }

  function createVirtualContainer(groupPath) {
    commit(() => insertNew(groupPath, 'product', newProduct({ ptype: 'container', name: 'New option' })));
  }

  function addPosOption(groupPath, posId) {
    const g = entity('group', parsePath(groupPath).id);
    commit(() => {
      const res = importPos(posId);
      if (!g.children.includes(res.id)) g.children.push(res.id);
      S.ui.expanded[groupPath] = true;
      flash(childPath(groupPath, 'product', res.id));
    });
  }

  function rekeyPlacements(oldPath, newPath) {
    for (const k of Object.keys(S.data.placements)) {
      if (k === oldPath || k.startsWith(`${oldPath}>`)) {
        S.data.placements[newPath + k.slice(oldPath.length)] = S.data.placements[k];
        delete S.data.placements[k];
      }
    }
    for (const k of Object.keys(S.ui.expanded)) {
      if (k === oldPath || k.startsWith(`${oldPath}>`)) {
        S.ui.expanded[newPath + k.slice(oldPath.length)] = S.ui.expanded[k];
        delete S.ui.expanded[k];
      }
    }
  }

  function removeLink(path, { quiet = false } = {}) {
    const info = parsePath(path);
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const ok = commit(() => {
      parent.children = parent.children.filter((c) => c !== info.id);
      for (const k of Object.keys(S.data.placements)) {
        if (k === path || k.startsWith(`${path}>`)) delete S.data.placements[k];
      }
      if (S.ui.selected === path || S.ui.selected.startsWith(`${path}>`)) S.ui.selected = info.parentPath;
    });
    if (ok && !quiet) toast(`${KIND_LABEL[info.kind]} removed`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function confirmRemove(path) {
    const info = parsePath(path);
    if (info.kind === 'menu') return;
    const pInfo = parsePath(info.parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const parentUses = pInfo.kind === 'menu' ? 1 : (ctx.usage.get(`${pInfo.kind}:${pInfo.id}`) || []).length;
    if (parentUses <= 1) return removeLink(path);
    const name = nameOf(info.kind, entity(info.kind, info.id));
    openModal({
      title: `Remove ${name}?`,
      body: `<p>${esc(parentName)} is used in ${parentUses} places, so ${esc(name)} is removed from all of them. Nothing changes on POS.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: `Remove ${KIND_LABEL[info.kind].toLowerCase()}`, kind: 'danger', onClick: () => { closeModal(); removeLink(path); } },
      ],
    });
  }

  function dragDescFromPath(path) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    return {
      origin: 'canvas',
      path,
      kind: info.kind,
      name: nameOf(info.kind, ent),
      source: ent.source,
      posId: ent.source === 'pos' ? ent.externalId : null,
      ptype: info.kind === 'product' ? ent.ptype : null,
      gtype: info.kind === 'group' ? ent.gtype : null,
    };
  }

  function resolveDrop(d, t) {
    if (t.auto) return { parentPath: null, index: Infinity, auto: true };
    const targetInfo = parsePath(t.path);
    if (t.pos === 'inside') return { parentPath: t.path, index: Infinity };
    const parentPath = targetInfo.parentPath;
    const pi = parsePath(parentPath);
    const index = entity(pi.kind, pi.id).children.indexOf(targetInfo.id) + (t.pos === 'after' ? 1 : 0);
    return { parentPath, index };
  }

  function performDrop(d, t) {
    if (t.auto) return autoPlace(d);
    let { parentPath, index } = resolveDrop(d, t);
    const err = dropError(parentPath, d);
    if (err) return toast(err, 'error');
    const pInfo = parsePath(parentPath);
    let newPath = null;
    let reused = false;
    commit(() => {
      const parent = entity(pInfo.kind, pInfo.id);
      const parentName = nameOf(pInfo.kind, parent);
      let id;
      if (d.origin === 'pos') {
        const res = importPos(d.posId);
        id = res.id;
        reused = res.stats.reused > 0 && res.stats.created === 0;
        if (parent.children.includes(id)) throw new Abort(`${nameOf(d.kind, entity(d.kind, id))} is already in ${parentName}`);
      } else {
        const src = parsePath(d.path);
        id = src.id;
        const op = parsePath(src.parentPath);
        const oldParent = entity(op.kind, op.id);
        const oldIndex = oldParent.children.indexOf(id);
        if (oldParent === parent) {
          if (oldIndex < index) index--;
        } else if (parent.children.includes(id)) {
          throw new Abort(`${nameOf(d.kind, entity(d.kind, id))} is already in ${parentName}`);
        }
        oldParent.children.splice(oldIndex, 1);
      }
      parent.children.splice(Math.min(index, parent.children.length), 0, id);
      if (pInfo.kind !== 'menu') {
        const ck = CHILD_KIND[pInfo.kind];
        if (reaches(ck, id, pInfo.kind, pInfo.id)) {
          throw new Abort(`${nameOf(d.kind, entity(d.kind, id))} already contains ${parentName}, so it cannot go inside it`);
        }
      }
      if (d.kind === 'product' && d.chainCat) {
        const ent = entity('product', id);
        if (ent.source === 'pos' && !ent.originCategoryExt) ent.originCategoryExt = d.chainCat;
      }
      newPath = childPath(parentPath, d.kind, id);
      if (d.origin === 'canvas' && newPath !== d.path) rekeyPlacements(d.path, newPath);
      S.ui.expanded[parentPath] = true;
      S.ui.selected = newPath;
      flash(newPath);
    });
    if (newPath && reused) {
      const uses = (ctx.usage.get(`${d.kind}:${parsePath(newPath).id}`) || []).length;
      if (uses > 1) toast(`Reusing ${nameOf(d.kind, entity(d.kind, parsePath(newPath).id))}. Edits apply in all ${uses} places`, 'info');
    }
  }

  function autoPlace(d) {
    const menu = activeMenu();
    if (d.kind === 'menu') return placePosMenu(d);
    if (d.kind === 'category') return performDrop(d, { path: menu.id, pos: 'inside' });
    const chain = d.posPath || [];
    if (chain.length < 2) return toast(`${d.name} is sold only as an option on POS. Drop it on a group instead`, 'error');

    let path = menu.id;
    let depth = 0;
    for (; depth < chain.length; depth++) {
      const info = parsePath(path);
      const ck = CHILD_KIND[info.kind];
      const match = entity(info.kind, info.id).children.find((cid) => {
        const c = entity(ck, cid);
        return c && c.source === 'pos' && c.externalId === chain[depth];
      });
      if (!match) break;
      path = childPath(path, ck, match);
    }
    if (depth === chain.length) {
      const parent = parsePath(parsePath(path).parentPath);
      expandTo(path);
      flash(path);
      select(path);
      return toast(`${d.name} is already in ${nameOf(parent.kind, entity(parent.kind, parent.id))}`, 'error');
    }
    if (depth === chain.length - 1) return performDrop(d, { path, pos: 'inside' });

    let newPath = null;
    commit(() => {
      const leaf = importPos(chain[chain.length - 1]);
      let childKind = leaf.kind;
      let childId = leaf.id;
      for (let i = chain.length - 2; i >= depth; i--) {
        const posId = chain[i];
        const kind = posItemById(posId).type;
        const ent = findByExt(kind, posId) || newPosEntity(posId);
        if (!ent.children.includes(childId)) {
          if (reaches(childKind, childId, kind, ent.id)) {
            throw new Abort(`${nameOf(childKind, entity(childKind, childId))} already contains ${nameOf(kind, ent)}, so it cannot go inside it`);
          }
          ent.children.push(childId);
        }
        childKind = kind;
        childId = ent.id;
      }
      const info = parsePath(path);
      const anchor = entity(info.kind, info.id);
      if (info.kind !== 'menu' && reaches(childKind, childId, info.kind, info.id)) {
        throw new Abort(`${nameOf(childKind, entity(childKind, childId))} already contains ${nameOf(info.kind, anchor)}, so it cannot go inside it`);
      }
      anchor.children.push(childId);
      newPath = path;
      for (let i = depth; i < chain.length; i++) {
        const k = CHILD_KIND[parsePath(newPath).kind];
        const ent = findByExt(k, chain[i]);
        newPath = childPath(newPath, k, ent.id);
      }
      expandTo(newPath);
      S.ui.selected = newPath;
      flash(newPath);
    });
    if (newPath) toast(`Added to ${crumbText(parsePath(newPath).parentPath)}`, 'info');
  }

  function placePosMenu(d) {
    const menu = activeMenu();
    const pm = S.data.pos.menus.find((m) => m.id === d.posId);
    if (!pm) return;
    const present = new Set(menu.children.map((cid) => entity('category', cid).externalId).filter(Boolean));
    const missing = pm.roots.filter((r) => !present.has(r));
    if (!missing.length) return toast(`All categories from ${pm.name} are already in ${menu.name}`, 'info');
    let firstPath = null;
    commit(() => {
      if (!menu.posExt) menu.posExt = pm.id;
      for (const r of missing) {
        const res = importPos(r);
        if (!res) continue;
        menu.children.push(res.id);
        const p = childPath(menu.id, 'category', res.id);
        if (!firstPath) firstPath = p;
        flash(p);
      }
      if (firstPath) S.ui.selected = firstPath;
    });
    if (firstPath) toast(missing.length === 1 ? `1 category added from ${pm.name}` : `${missing.length} categories added from ${pm.name}`);
  }

  const POS_LOAD_MS = 1400;

  function loadPos(kind, done) {
    if (T.posLoading) return;
    T.posLoading = kind;
    renderPos();
    setTimeout(() => {
      T.posLoading = null;
      done();
    }, POS_LOAD_MS);
  }

  function syncPos() {
    loadPos('sync', applyPosSync);
  }

  function applyPosSync() {
    const items = S.data.pos.items;
    const first = !S.data.pos.syncCount;
    commit(() => {
      if (first) {
        items['pos-truffle'].price = 19;
        items['pos-smash'] = {
          type: 'product',
          name: 'Double Smash Burger',
          price: 15,
          description: 'Two crispy-edged patties, onions, and pickles.',
          allergens: ['milk', 'wheat'],
          children: ['pos-g-temp', 'pos-g-side'],
        };
        items['pos-cat-burgers'].children.push('pos-smash');
        S.data.pos.priceGaps['pos-smash'] = { from: 312, reason: 'Not rolled out yet' };
        items['pos-g-addons'].children = items['pos-g-addons'].children.filter((c) => c !== 'pos-m-avocado');
      }
      S.data.pos.syncCount = (S.data.pos.syncCount || 0) + 1;
      S.data.pos.syncedAt = Date.now();
    });
    if (first) {
      T.flashExt = new Set(['pos-truffle', 'pos-smash', 'pos-m-avocado']);
      render();
      setTimeout(() => T.flashExt.clear(), 1600);
      toast('POS synced. 3 changes to review', 'info', { action: { label: 'Review', onClick: openCompare } });
    } else {
      toast('POS synced. No changes', 'info');
    }
  }

  function publishCategoryLabel(m) {
    const hidden = m.children.filter((c) => placement(`${m.id}>c:${c}`).hidden).length;
    return hidden ? `${m.children.length} · ${hidden} hidden` : `${m.children.length}`;
  }

  function publish() {
    const m = activeMenu();
    if (ctx.issues.errors) {
      toast(`Couldn’t publish ${m.name}. Fix ${plural(ctx.issues.errors, 'error', 'errors')} first`, 'error');
      openIssues($('[data-action="issues"]'));
      return;
    }
    openModal({
      title: `Publish ${m.name}?`,
      body: `<p>Customers see the changes in ${esc(listJoin(m.channels.map(channelLabel)))} within a few minutes. Nothing changes on POS.</p>
        <dl class="kv"><dt>Stores</dt><dd>${esc(storeCountLabel(m))}</dd><dt>Categories</dt><dd>${esc(publishCategoryLabel(m))}</dd><dt>Order types</dt><dd>${esc(listJoin(m.orderTypes.map((o) => (C.orderTypes.find((x) => x[0] === o) || [o, o])[1])))}</dd></dl>
        ${ctx.issues.warnings ? callout('warning', `${plural(ctx.issues.warnings, 'warning remains', 'warnings remain')}. You can still publish.`) : ''}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Publish menu',
          kind: 'primary',
          onClick: () => {
            closeModal();
            m.status = 'publishing';
            render();
            setTimeout(() => {
              m.status = 'published';
              m.publishedAt = Date.now();
              m.publishedStoreIds = menuStores(m).map((s) => s.id);
              render();
              toast('Menu successfully published');
            }, 1400);
          },
        },
      ],
    });
  }

  function exportMenu() {
    const m = activeMenu();
    const ser = (kind, id, path, guard) => {
      const e = entity(kind, id);
      if (!e || guard.has(`${kind}:${id}`)) return null;
      const g = new Set(guard).add(`${kind}:${id}`);
      const pl = placement(path);
      const kids = (ck) => e.children.map((c) => ser(ck, c, childPath(path, ck, c), g)).filter(Boolean);
      const out = {
        id: e.id,
        pos_id: e.source === 'pos' ? e.externalId : null,
        name: nameOf(kind, e),
        is_original_name_propagated: !!e.syncName,
        internal_name: e.internalName || null,
        description: e.description || null,
        is_available: !pl.hidden,
      };
      if (kind === 'category') {
        Object.assign(out, {
          external_id: e.reportingId || null,
          position: m.children.indexOf(id),
          has_image: !!e.image,
          has_banner_image: !!e.bannerImage,
          is_bundle: e.isBundle,
          is_virtual_container: isVirtual(e),
          venues: e.stores,
          products: kids('product'),
        });
      } else if (kind === 'product') {
        const choices = e.ptype === 'size' ? sizeGroupOf(e) : null;
        const a = e.availability;
        const optionRef = (key) => {
          const [gid, pid] = key.split(':');
          return { product_group_id: gid, product_id: pid };
        };
        Object.assign(out, {
          is_original_name_propagated: !!e.namePropagated,
          external_id: e.reportingId || null,
          is_virtual_container: e.ptype === 'container',
          is_product_container: e.ptype === 'size',
          is_linked_product: e.ptype === 'linked',
          pos_parent_entity_id: e.ptype === 'linked' ? e.posParentExt : null,
          pos_origin_category_id: e.originCategoryExt,
          food_type: e.foodType,
          allergens: e.ptype === 'container' ? [] : e.allergens,
          calories_from: e.caloriesFrom,
          calories_to: e.caloriesTo,
          serving_people_from: e.servingFrom,
          serving_people_to: e.servingTo,
          min_quantity: e.minQty,
          max_quantity: e.maxQty,
          quantity_limit_scope: isNum(e.minQty) || isNum(e.maxQty) ? e.qtyScope : null,
          is_alcoholic: e.isAlcoholic,
          alcohol_vol_percentage: e.isAlcoholic ? e.alcoholVol : null,
          is_modifier_code_required: e.isModifierCodeRequired,
          modifier_codes: e.modifierCodes,
          preselected_modifier_code: e.preselectedCode,
          hidden_modifier_codes: pl.hiddenCodes || [],
          preselected_quantity: preselectedAt(path),
          nutrition_info: e.nutrition.active ? e.nutrition : null,
          prep_info: e.prep.active
            ? { prep_station_id: e.prep.station || null, prep_qty_major: e.prep.qty, prep_unit_major: e.prep.unit || null, prep_qty_minor: e.prep.qty2, prep_unit_minor: e.prep.unit2 || null }
            : null,
          limited_availability: a.active
            ? { mode: a.mode, serving_times: a.mode === 'serving' ? a.slots : null, lto: a.mode === 'lto' ? a.lto : null, preorder: a.mode === 'preorder' ? a.preorder : null }
            : null,
          secret_identifiers: e.segments.map((s) => ({ segment_id: s.segmentId, tag: s.tag || null })),
          metadata: e.metadata,
          upsell: choices
            ? { name: nameOf('group', choices), products: choices.children.map(productRef).filter(Boolean) }
            : e.upsell.products.length
              ? { name: e.upsell.title, products: e.upsell.products.map(productRef).filter(Boolean) }
              : null,
          cross_sell: e.crossSell.map(productRef).filter(Boolean),
          included_ingredients: validIncluded(e).map((i) => ({ product_group_id: i.gid, product_id: i.pid, is_locked: !!i.locked })),
          included_ingredients_group_name: e.included.length ? e.includedName : null,
          substitutes: Object.entries(e.substitutes)
            .filter(([, ids]) => ids.length)
            .map(([k, ids]) => ({ ...optionRef(k), substitutes: ids.map(productRef).filter(Boolean) })),
          partial_variants: Object.entries(e.halfWhole)
            .filter(([, h]) => h.left && h.right)
            .map(([k, h]) => ({ ...optionRef(k), left: productRef(h.left), right: productRef(h.right) })),
          sections: e.sections.map((s) => ({ id: s.id, name: s.name, product_group_ids: e.children.filter((gid) => sectionOf(e, gid) === s.id) })),
          venues: Object.fromEntries(
            Object.entries(e.stores).map(([sid, st]) => [
              sid,
              { show_in_menu: st !== 'hidden' && st !== 'out_of_stock', in_stock: !isOutOfStock(st), out_of_stock_for: { oos_1h: '1h', oos_4h: '4h', oos_eod: 'end_of_day', out_of_stock: 'indefinitely' }[st] || null },
            ]),
          ),
          product_groups: choices ? [] : kids('group'),
        });
      } else {
        const r = rulesOf(e);
        Object.assign(out, {
          type: r.type,
          is_virtual_container: isVirtual(e),
          pos_parent_entity_id: e.gtype === 'linked' ? e.posGroupExt : null,
          min_quantity: r.min,
          max_quantity: r.max,
          max_single_quantity: r.maxSingle,
          free_count: r.freeCount,
          is_substitution_container: e.isSubstitutionContainer,
          products: kids('product'),
        });
      }
      return out;
    };
    const out = {
      name: m.name,
      internal_name: m.internalName || null,
      description: m.description || null,
      external_id: m.externalId || null,
      pos_id: m.posExt,
      menu_channels: m.channels,
      order_types: m.orderTypes,
      external_channels: m.externalChannels,
      availability: m.schedule,
      segments: m.segments.map((s) => ({ segment_id: s.segmentId, tag: s.tag || null })),
      store_groups: m.storeGroups.map((a) => ({ id: a.id, venue_ids: assignedStores(a).map((s) => s.id), assign_to_new_stores: a.newStores })),
      categories: m.children.map((c) => ser('category', c, childPath(m.id, 'category', c), new Set())).filter(Boolean),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'menu'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Menu successfully exported');
  }

  /* ---------- compare to POS ---------- */

  function openCompare() {
    T.cmp = { tab: 'pos', sel: new Set() };
    openModal({ title: 'Compare to POS', body: '<div id="cmp"></div>', size: 'lg', foot: '<div class="modal-foot" id="cmp-foot"></div>' });
    renderCompare();
  }

  function renderCompare() {
    if (!T.cmp || !$('#cmp')) return;
    const data = ctx.compare;
    const { tab, sel } = T.cmp;
    for (const k of [...sel]) if (!data.missing.some((m) => m.key === k)) sel.delete(k);
    const posRow = (m, control) => {
      const it = posItemById(m.posId);
      const price = it.type === 'product' ? rangeText(statsOf((s) => posPrice(m.posId, null, s))) : '';
      return `<div class="cmp-row">
        ${control}
        <span class="kind-glyph kind-${it.type}">${icon(KIND_ICON[it.type], 13)}</span>
        <span class="cmp-main"><span class="cmp-name">${esc(it.name)}</span><span class="cmp-meta">In ${esc(m.parentName)} · <span class="mono">${esc(m.posId)}</span></span></span>
        ${price ? `<span class="tnum cmp-price">${esc(price)}</span>` : ''}
      </div>`;
    };
    let body = `<div class="segmented cmp-tabs" role="tablist">
      <button type="button" role="tab" class="seg" aria-checked="${tab === 'pos'}" data-action="cmp-tab" data-tab="pos">Changes on POS</button>
      <button type="button" role="tab" class="seg" aria-checked="${tab === 'ignored'}" data-action="cmp-tab" data-tab="ignored">Ignored items<span class="seg-count tnum">${data.ignored.length}</span></button>
    </div>`;
    if (tab === 'pos') {
      if (!data.count) {
        body += `<div class="empty-small">${icon('checkCircle', 20)}<strong>${esc(activeMenu().name)} matches POS</strong><span>Nothing new, changed, or removed since the last review.</span></div>`;
      }
      if (data.missing.length) {
        const allOn = data.missing.every((m) => sel.has(m.key));
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">New on POS<span class="tnum"> · ${data.missing.length}</span></h3>
            <button type="button" class="btn ghost sm" data-action="cmp-all">${allOn ? 'Clear selection' : 'Select all'}</button></header>
          <p class="section-desc">On POS under items in this menu, but not added yet.</p>
          <div class="cmp-list">${data.missing
            .map((m) =>
              posRow(
                m,
                `<button type="button" class="check${sel.has(m.key) ? ' is-on' : ''}" role="checkbox" aria-checked="${sel.has(m.key)}" aria-label="Select ${esc(posItemById(m.posId).name)}" data-action="cmp-toggle" data-key="${esc(m.key)}">${sel.has(m.key) ? icon('check', 12) : ''}</button>`,
              ),
            )
            .join('')}</div>
        </section>`;
      }
      if (data.changed.length) {
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">Changed on POS<span class="tnum"> · ${data.changed.length}</span></h3>
            <button type="button" class="btn ghost sm" data-action="cmp-review">Mark as reviewed</button></header>
          <p class="section-desc">Already in the menu. Prices update automatically. Names update unless you set your own.</p>
          <div class="cmp-list">${data.changed
            .map(
              (c) => `<div class="cmp-row"><span class="kind-glyph kind-${c.kind}">${icon(KIND_ICON[c.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(c.kind, c.ent))}</span><span class="cmp-meta tnum">${c.diffs.map(esc).join(' · ')}</span></span>
                <button type="button" class="btn ghost sm" data-action="cmp-goto" data-path="${esc(c.path)}">Show</button></div>`,
            )
            .join('')}</div>
        </section>`;
      }
      if (data.gone.length) {
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">No longer on POS<span class="tnum"> · ${data.gone.length}</span></h3></header>
          <p class="section-desc">Customers cannot order these. Remove them, or check POS.</p>
          <div class="cmp-list">${data.gone
            .map(
              (g) => `<div class="cmp-row"><span class="kind-glyph kind-${g.kind}">${icon(KIND_ICON[g.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(g.kind, g.ent))}</span><span class="cmp-meta">${esc(g.label)} · ${esc(crumbText(parsePath(g.path).parentPath))}</span></span>
                <button type="button" class="btn secondary sm tone-danger" data-action="cmp-remove" data-path="${esc(g.path)}">Remove</button></div>`,
            )
            .join('')}</div>
        </section>`;
      }
    } else {
      body += data.ignored.length
        ? `<section class="cmp-section"><p class="section-desc">Hidden from the changes list. They stay on POS.</p><div class="cmp-list">${data.ignored
            .map((m) => posRow(m, '').replace('</div>', '') + `<button type="button" class="btn ghost sm" data-action="cmp-unignore" data-key="${esc(m.key)}">Stop ignoring</button></div>`)
            .join('')}</div></section>`
        : `<div class="empty-small"><strong>No ignored items</strong><span>Items you ignore show up here.</span></div>`;
    }
    $('#cmp').innerHTML = body;
    $('#cmp-foot').innerHTML =
      tab === 'pos' && data.missing.length
        ? `<span class="foot-note tnum">${sel.size} selected</span>
           <button type="button" class="btn secondary" data-action="cmp-ignore" ${sel.size ? '' : 'disabled'}>Ignore selected</button>
           <button type="button" class="btn primary" data-action="cmp-add" ${sel.size ? '' : 'disabled'}>Add selected</button>`
        : `<button type="button" class="btn secondary" data-modal-close>Done</button>`;
  }

  function compareAdd() {
    const picks = ctx.compare.missing.filter((m) => T.cmp.sel.has(m.key));
    let added = 0;
    commit(() => {
      for (const m of picks) {
        const pi = parsePath(m.path);
        const parent = entity(pi.kind, pi.id);
        const it = posItemById(m.posId);
        if (dropError(m.path, { kind: m.kind, source: 'pos', posId: m.posId, name: it.name })) continue;
        const res = importPos(m.posId);
        if (!parent.children.includes(res.id)) {
          parent.children.push(res.id);
          added++;
          S.ui.expanded[m.path] = true;
          flash(childPath(m.path, m.kind, res.id));
        }
      }
    });
    T.cmp.sel.clear();
    renderCompare();
    toast(`${plural(added, 'item', 'items')} added from POS`);
  }

  /* ---------- optimize ---------- */

  function openOptimize(onlyCategoryPath = null) {
    T.opt = {
      step: onlyCategoryPath ? 'review' : 'choose',
      pick: onlyCategoryPath ? { names: false, descriptions: false, sizes: true } : { names: true, descriptions: true, sizes: true },
      only: onlyCategoryPath,
      items: [],
      off: new Set(),
    };
    if (onlyCategoryPath) T.opt.items = buildSuggestions();
    openModal({ title: onlyCategoryPath ? 'Group sizes' : 'Optimize menu', body: '<div id="opt"></div>', size: 'lg', foot: '<div class="modal-foot" id="opt-foot"></div>' });
    renderOptimize();
  }

  function buildSuggestions() {
    const { pick, only } = T.opt;
    const menu = activeMenu();
    const items = [];
    const seen = new Set();
    walkMenu(menu, (kind, id, ent, path) => {
      if (kind === 'category' && pick.sizes && (!only || only === path)) {
        detectSizeSets(ent).forEach((set, i) => items.push({ key: `sizes|${path}|${i}`, type: 'sizes', path, set, name: containerName(set) }));
      }
      if (only || ent.source !== 'pos' || seen.has(`${kind}:${id}`)) return;
      seen.add(`${kind}:${id}`);
      const ext = ent.externalId;
      if (pick.names && ent.syncName && SUG.names[ext] && SUG.names[ext] !== nameOf(kind, ent))
        items.push({ key: `name|${kind}|${id}`, type: 'name', kind, id, from: nameOf(kind, ent), to: SUG.names[ext] });
      if (pick.descriptions && kind === 'product' && !ent.description && SUG.descriptions[ext])
        items.push({ key: `desc|${id}`, type: 'description', kind, id, name: SUG.names[ext] || nameOf(kind, ent), to: SUG.descriptions[ext] });
    });
    return items;
  }

  function renderOptimize() {
    if (!T.opt || !$('#opt')) return;
    const o = T.opt;
    const checkBtn = (key, on, label) =>
      `<button type="button" class="check${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on}" aria-label="${esc(label)}" data-action="opt-item" data-key="${esc(key)}">${on ? icon('check', 12) : ''}</button>`;
    if (o.step === 'choose') {
      const choice = (key, title, help) =>
        `<button type="button" class="choice-row${o.pick[key] ? ' is-on' : ''}" role="checkbox" aria-checked="${o.pick[key]}" data-action="opt-pick" data-key="${key}">
          <span class="check${o.pick[key] ? ' is-on' : ''}" aria-hidden="true">${o.pick[key] ? icon('check', 12) : ''}</span>
          <span class="choice-text"><strong>${title}</strong><span>${help}</span></span></button>`;
      $('#opt').innerHTML = `<p>Review suggestions before anything changes. POS stays as it is.</p>
        <div class="choice-list">
          ${choice('sizes', 'Group my sizes', 'Combine size variants like Small and Large into one choice product')}
          ${choice('names', 'Suggest names', 'Replace POS shorthand like SML LMNADE with names customers understand')}
          ${choice('descriptions', 'Suggest descriptions', 'Write descriptions for products that have none')}
        </div>`;
      const any = Object.values(o.pick).some(Boolean);
      $('#opt-foot').innerHTML = `<button type="button" class="btn secondary" data-modal-close>Cancel</button>
        <button type="button" class="btn primary" data-action="opt-find" ${any ? '' : 'disabled'}>${icon('sparkles', 15)}Find suggestions</button>`;
      return;
    }
    const groups = [
      ['name', 'Names'],
      ['description', 'Descriptions'],
      ['sizes', 'Choice products'],
    ];
    const on = o.items.filter((i) => !o.off.has(i.key)).length;
    let body = '';
    if (!o.items.length) {
      body = `<div class="empty-small">${icon('checkCircle', 20)}<strong>Nothing to suggest</strong><span>Names, descriptions, and sizes already look good.</span></div>`;
    }
    for (const [type, title] of groups) {
      const list = o.items.filter((i) => i.type === type);
      if (!list.length) continue;
      body += `<section class="cmp-section"><header class="cmp-head"><h3 class="section-title">${title}<span class="tnum"> · ${list.length}</span></h3></header><div class="cmp-list">${list
        .map((i) => {
          const isOn = !o.off.has(i.key);
          if (type === 'name')
            return `<div class="cmp-row">${checkBtn(i.key, isOn, `Use ${i.to}`)}<span class="cmp-main"><span class="sug-line"><span class="sug-from">${esc(i.from)}</span>${icon('chevRight', 13)}<span class="cmp-name">${esc(i.to)}</span></span><span class="cmp-meta">POS name stays ${esc(i.from)}</span></span></div>`;
          if (type === 'description')
            return `<div class="cmp-row">${checkBtn(i.key, isOn, `Add description to ${i.name}`)}<span class="cmp-main"><span class="cmp-name">${esc(i.name)}</span><span class="cmp-meta">${esc(i.to)}</span></span></div>`;
          return `<div class="cmp-row">${checkBtn(i.key, isOn, `Create ${i.name}`)}<span class="thumb kind-container thumb-sm">${icon('package', 13)}</span><span class="cmp-main"><span class="cmp-name">${esc(i.name)}</span><span class="cmp-meta">${esc(listJoin(i.set.items.map((x) => capitalize(x.size))))} · in ${esc(nameOf('category', entity('category', parsePath(i.path).id)))}</span></span></div>`;
        })
        .join('')}</div></section>`;
    }
    $('#opt').innerHTML = body;
    $('#opt-foot').innerHTML = `${o.only ? '<button type="button" class="btn secondary" data-modal-close>Cancel</button>' : `<button type="button" class="btn ghost" data-action="opt-back">${icon('chevLeft', 15)}Back</button><span class="foot-spacer"></span>`}
      <button type="button" class="btn primary" data-action="opt-apply" ${on ? '' : 'disabled'}>${on ? `Apply ${plural(on, 'change', 'changes')}` : 'Apply changes'}</button>`;
  }

  function applyOptimize() {
    const picks = T.opt.items.filter((i) => !T.opt.off.has(i.key));
    closeModal();
    commit(() => {
      for (const i of picks) {
        if (i.type === 'name') {
          const ent = entity(i.kind, i.id);
          ent.syncName = false;
          ent.name = i.to;
        } else if (i.type === 'description') {
          entity('product', i.id).description = i.to;
        }
      }
      for (const i of picks.filter((x) => x.type === 'sizes')) {
        const catPath = i.path;
        const cat = entity('category', parsePath(catPath).id);
        const pids = i.set.items.map((x) => x.pid).filter((pid) => cat.children.includes(pid));
        if (pids.length < 2) continue;
        const sizeGroup = newGroup({ gtype: 'standalone', role: 'choice', type: 2, name: 'Size', min: 1, max: 1, children: pids });
        const container = newProduct({ ptype: 'size', name: i.name, children: [sizeGroup.id] });
        S.data.entities.group[sizeGroup.id] = sizeGroup;
        S.data.entities.product[container.id] = container;
        const firstIndex = cat.children.indexOf(pids[0]);
        cat.children = cat.children.filter((pid) => !pids.includes(pid));
        cat.children.splice(Math.min(firstIndex, cat.children.length), 0, container.id);
        const cp = childPath(catPath, 'product', container.id);
        S.ui.expanded[catPath] = true;
        S.ui.expanded[cp] = true;
        S.ui.expanded[childPath(cp, 'group', sizeGroup.id)] = true;
        flash(cp);
      }
    });
    toast(`${plural(picks.length, 'change', 'changes')} applied. POS stays as it is`);
  }

  /* ---------- render ---------- */

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.focusKey) return null;
    const out = { key: el.dataset.focusKey, value: null, start: null, end: null };
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      out.value = el.value;
      try {
        out.start = el.selectionStart;
        out.end = el.selectionEnd;
      } catch (_) {
        /* number inputs have no selection */
      }
    }
    return out;
  }

  function restoreFocus(f) {
    if (!f) return;
    const el = document.querySelector(`[data-focus-key="${cssEsc(f.key)}"]`);
    if (!el) return;
    if (f.value != null && el.value !== f.value) el.value = f.value;
    el.focus({ preventScroll: true });
    if (f.start != null) {
      try {
        el.setSelectionRange(f.start, f.end);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function render() {
    const focus = captureFocus();
    const menu = activeMenu();
    if (!S.ui.selected || !pathExists(S.ui.selected) || parsePath(S.ui.selected).menuId !== menu.id) S.ui.selected = menu.id;
    ctx = computeCtx();
    renderTopbar();
    renderPos();
    renderCanvas();
    renderInspector();
    renderCompare();
    restoreFocus(focus);
    if (T.focusName) {
      T.focusName = false;
      const el = $('#insp-name');
      if (el) {
        el.focus();
        el.select && el.select();
      }
    }
    if (T.flashPaths.has(S.ui.selected)) {
      const row = document.querySelector(`.row[data-path="${cssEsc(S.ui.selected)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
    if (T.focusRow) {
      const row = document.querySelector(`.row[data-path="${cssEsc(T.focusRow)}"]`);
      T.focusRow = null;
      if (row) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
      }
    }
    schedulePersist();
  }

  const STATUS = {
    draft: ['Draft', 'neutral'],
    publishing: ['Publishing', 'progress'],
    published: ['Published', 'ok'],
    changed: ['Unpublished changes', 'warn'],
  };

  function renderTopbar() {
    const menu = activeMenu();
    const { errors, warnings } = ctx.issues;
    const [statusLabel, statusTone] = STATUS[menu.status] || STATUS.draft;
    const issueTone = errors ? 'error' : warnings ? 'warning' : 'ok';
    const issueLabel = errors ? plural(errors, 'error', 'errors') : warnings ? plural(warnings, 'warning', 'warnings') : 'No issues';
    $('#topbar').innerHTML = `
      <div class="brand">
        <span class="brand-mark">${icon('layers', 16)}</span>
        <span class="brand-name">Menu builder</span>
      </div>
      <nav class="menu-tabs" role="tablist" aria-label="Menus">
        ${S.data.menus
          .map(
            (m) => `<button class="menu-tab" role="tab" aria-selected="${m.id === menu.id}" data-action="switch-menu" data-id="${m.id}">
              <span class="status-dot tone-${(STATUS[m.status] || STATUS.draft)[1]}"></span>${esc(m.name || 'Untitled menu')}</button>`,
          )
          .join('')}
        <button class="icon-btn" data-action="new-menu" aria-label="Create menu" title="Create menu">${icon('plus', 16)}</button>
      </nav>
      <div class="topbar-actions">
        <div class="btn-pair">
          <button class="icon-btn" data-action="undo" aria-label="Undo" title="Undo (⌘Z)" ${hist.past.length ? '' : 'disabled'}>${icon('undo', 16)}</button>
          <button class="icon-btn" data-action="redo" aria-label="Redo" title="Redo (⇧⌘Z)" ${hist.future.length ? '' : 'disabled'}>${icon('redo', 16)}</button>
        </div>
        <button class="issues-btn tone-${issueTone}" data-action="issues" aria-haspopup="menu">
          ${icon(issueTone === 'ok' ? 'checkCircle' : issueTone === 'error' ? 'alertCircle' : 'alert', 15)}<span>${issueLabel}</span>
        </button>
        <span class="status-pill tone-${statusTone}">${statusTone === 'progress' ? '<span class="spinner"></span>' : ''}${statusLabel}</span>
        <button class="icon-btn" data-action="app-more" aria-label="More options" title="More options">${icon('more', 16)}</button>
        <button class="btn primary" data-action="publish" ${menu.status === 'publishing' ? 'disabled' : ''}>${icon('send', 15)}Publish menu</button>
      </div>`;
  }

  function posSubText() {
    return `Synced ${relTime(S.data.pos.syncedAt)}.`;
  }

  function renderPos() {
    const pos = S.data.pos;
    const pm = posMenu();
    const loading = T.posLoading;
    $('#pos-head').innerHTML = `
      <div class="panel-title-row">
        <h2 class="panel-title">POS items</h2>
        <button class="btn ghost sm" data-action="sync-pos" ${loading ? 'disabled' : ''}>${loading === 'sync' ? '<span class="spinner"></span>Syncing' : `${icon('refresh', 14)}Sync POS`}</button>
      </div>
      <p class="panel-sub">${esc(posSubText())}</p>
      <div class="pos-store">
        <label class="sr-only" for="store-group">POS store group</label>
        <div class="select-wrap">
          <select id="store-group" class="input" data-focus-key="store-group" ${loading ? 'disabled' : ''}>${C.storeGroups
            .map((g) => `<option value="${g.id}"${g.id === storeGroup().id ? ' selected' : ''}>${esc(g.name)} · ${esc(g.pos)}</option>`)
            .join('')}</select>${icon('chevDown', 14)}
        </div>
      </div>
      <div class="pos-menus" role="tablist" aria-label="POS menus">${pos.menus
        .map((m) => `<button type="button" role="tab" class="pos-menu-tab" aria-selected="${m.id === pm.id}" data-action="pos-menu" data-id="${m.id}">${esc(m.name)}</button>`)
        .join('')}</div>`;

    if (loading) {
      $('#pos-tree').innerHTML = `<div class="empty-small"><span class="spinner"></span><strong>${loading === 'sync' ? 'Syncing with POS' : `Loading ${esc(storeGroup().name)}`}</strong><span>Large menus can take a few minutes.</span></div>`;
      return;
    }

    const q = S.ui.posQuery.trim().toLowerCase();
    const matches = (id) => {
      const it = pos.items[id];
      return it.name.toLowerCase().includes(q) || id.toLowerCase().includes(q) || posLabel(id).toLowerCase().includes(q);
    };
    const subtreeMatches = (id, depth = 0) =>
      depth < 12 && !!pos.items[id] && (matches(id) || (pos.items[id].children || []).some((c) => subtreeMatches(c, depth + 1)));
    const menuHit = !!q && (pm.name.toLowerCase().includes(q) || pm.id.toLowerCase().includes(q));
    const isOpen = (key, fallback) => {
      const state = q ? T.posSearchExpanded : S.ui.posExpanded;
      return key in state ? !!state[key] : fallback;
    };

    const rows = [];
    const rec = (id, chain, depth, chainCat, underHit) => {
      const it = pos.items[id];
      if (!it) return;
      if (q && !underHit && !subtreeMatches(id)) return;
      const key = chain ? `${chain}/${id}` : id;
      const children = it.children || [];
      const hasChildren = children.length > 0;
      const hit = !!q && matches(id);
      const matchBelow = !!q && children.some((c) => subtreeMatches(c, depth));
      const expanded = isOpen(key, matchBelow);
      const cat = it.type === 'category' ? id : chainCat;
      rows.push({ id, it, key, depth, hasChildren, expanded, hit, chainCat: depth === 2 ? chainCat : '' });
      if (hasChildren && expanded && depth < 13) children.forEach((c) => rec(c, key, depth + 1, cat, underHit || hit));
    };
    const menuKey = `menu:${pm.id}`;
    const menuOpen = isOpen(menuKey, true);
    const hasMatches = !q || menuHit || pm.roots.some((r) => subtreeMatches(r));
    if (hasMatches) {
      rows.push({ id: pm.id, it: { type: 'menu', name: pm.name }, key: menuKey, depth: 0, hasChildren: pm.roots.length > 0, expanded: menuOpen, hit: menuHit, isMenu: true });
      if (menuOpen) pm.roots.forEach((r) => rec(r, '', 1, '', menuHit));
    }

    const hl = (name) => {
      if (!q) return esc(name);
      const i = name.toLowerCase().indexOf(q);
      if (i < 0) return esc(name);
      return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
    };

    $('#pos-tree').innerHTML = rows.length
      ? rows
          .map((r) => {
            const inMenu = r.isMenu ? pm.roots.every((c) => ctx.inMenuExt.has(c)) : ctx.inMenuExt.has(r.id);
            const meta = r.it.type === 'group' ? C.groupTypes[r.it.groupType || 1].label : '';
            const label = r.isMenu ? r.it.name : posLabel(r.id);
            const showAlt = label !== r.it.name;
            return `<div class="pos-row${T.flashExt.has(r.id) ? ' is-flash' : ''}" ${r.hasChildren ? `data-key="${esc(r.key)}"` : ''} role="treeitem" aria-level="${r.depth + 1}" ${r.hasChildren ? `aria-expanded="${r.expanded}"` : ''} draggable="true" data-pos-id="${r.id}" data-pos-path="${r.isMenu ? '' : esc(r.key)}" data-kind="${r.it.type}" data-name="${esc(label)}" data-chain-cat="${esc(r.chainCat)}" style="--depth:${r.depth}" title="${esc(r.it.name)} · ${r.id}">
              ${r.hasChildren ? `<button class="twisty" data-action="pos-toggle" data-key="${esc(r.key)}" tabindex="-1" aria-label="${r.expanded ? 'Collapse' : 'Expand'}">${icon('chevRight', 14)}</button>` : '<span class="twisty-spacer"></span>'}
              <span class="kind-glyph kind-${r.it.type}">${icon(KIND_ICON[r.it.type], 13)}</span>
              <span class="pos-name">${hl(r.it.name)}${showAlt ? `<span class="pos-alt">${esc(label)}</span>` : ''}</span>
              ${meta ? `<span class="pos-meta">${meta}</span>` : ''}
              <span class="pos-added" ${inMenu ? `title="${r.isMenu ? 'All categories are in this menu' : 'In this menu'}"` : ''}>${inMenu ? icon('check', 13) : ''}</span>
              <button type="button" class="icon-btn sm pos-add" data-action="pos-add" aria-label="Add ${esc(label)} to menu" title="Add to menu">${icon('plus', 14)}</button>
            </div>`;
          })
          .join('')
      : `<div class="empty-small"><strong>No matching POS items</strong><span>Try a different name or POS ID.</span></div>`;
  }

  function isExpanded(path, depth) {
    const v = S.ui.expanded[path];
    return v == null ? depth <= 1 : v;
  }

  function visibleRows(menu) {
    const q = S.ui.canvasQuery.trim().toLowerCase();
    const rows = [];
    if (q) {
      const keep = new Set();
      const hits = new Set();
      walkMenu(menu, (k, id, ent, path) => {
        if (nameOf(k, ent).toLowerCase().includes(q) || (posIdOf(k, ent) || '').toLowerCase().includes(q)) {
          hits.add(path);
          keep.add(path);
          ancestorsOf(path).forEach((a) => keep.add(a));
        }
      });
      walkMenu(menu, (kind, id, ent, path, depth) => {
        if (!keep.has(path)) return false;
        rows.push({ kind, id, ent, path, depth, expanded: true, hit: hits.has(path) });
        return true;
      });
    } else {
      walkMenu(menu, (kind, id, ent, path, depth) => {
        const expanded = isExpanded(path, depth);
        rows.push({ kind, id, ent, path, depth, expanded });
        return expanded;
      });
    }
    return rows;
  }

  function thumb(kind, ent, cls = '') {
    if (ent.image) return `<img class="thumb thumb-img ${cls}" src="${ent.image}" alt="">`;
    const v = isVirtual(ent) ? ' is-virtual' : '';
    if (kind === 'category') return `<span class="thumb kind-category${v} ${cls}">${icon('folder', 15)}</span>`;
    if (kind === 'group') return `<span class="thumb kind-group${v} ${cls}">${icon('layers', 15)}</span>`;
    if (kind === 'menu') return `<span class="thumb kind-menu ${cls}">${icon('layers', 15)}</span>`;
    if (ent.ptype === 'container') return `<span class="thumb kind-virtual is-virtual ${cls}">${icon('dashed', 15)}</span>`;
    if (ent.ptype === 'size') return `<span class="thumb kind-container is-virtual ${cls}">${icon('package', 15)}</span>`;
    const name = nameOf('product', ent);
    return `<span class="thumb thumb-initials${ent.ptype === 'linked' ? ' is-linked' : ''} ${cls}">${esc(initials(name))}</span>`;
  }

  function typeHelp(kind, ent) {
    if (!isVirtual(ent)) return '';
    if (kind === 'category') return 'Arranges products your own way. Not on POS.';
    if (kind === 'product') {
      if (ent.ptype === 'linked') return ent.posParentExt ? `Rings up on POS as ${posLabel(ent.posParentExt)}, at its price.` : 'Choose the POS product it rings up as.';
      if (ent.ptype === 'container') return 'Opens more choices. Only the choices inside are sent to POS.';
      if (ent.ptype === 'size') return 'Customers pick one product inside. Only that product is sent to POS.';
      return '';
    }
    if (ent.gtype === 'linked') return `Shows some options of ${posLabel(ent.posGroupExt)}. Rings up in that group.`;
    return isChoiceGroup(ent) ? 'Customers pick one of these products.' : 'Each product customers pick is added to the order as its own item.';
  }

  function kindLabel(kind, ent) {
    if (kind === 'menu') return 'Menu';
    if (kind === 'category') return isVirtual(ent) ? 'Menu-only category' : 'Category';
    if (kind === 'product')
      return { pos: 'Product', linked: 'Custom version', container: 'Option folder', size: 'Choice product' }[ent.ptype];
    if (ent.gtype === 'linked') return 'Custom version';
    if (ent.gtype === 'standalone') return isChoiceGroup(ent) ? 'Choice group' : 'Add-on group';
    return `${C.groupTypes[rulesOf(ent).type].label} group`;
  }

  function rowHtml(r) {
    const { kind, id, ent, path, depth } = r;
    const info = parsePath(path);
    const parentKind = parsePath(info.parentPath).kind;
    const selected = S.ui.selected === path;
    const hasChildren = ent.children.length > 0;
    const pl = placement(path);
    const uses = (ctx.usage.get(`${kind}:${id}`) || []).length;
    const issues = ctx.issues.byPath.get(path) || [];
    const issueTone = issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warning' : '';
    const name = nameOf(kind, ent);

    let meta = '';
    if (kind === 'category') {
      const hiddenKids = ent.children.filter((pid) => placement(childPath(path, 'product', pid)).hidden).length;
      meta = esc(plural(ent.children.length, 'product', 'products') + (hiddenKids ? ` · ${hiddenKids} hidden` : ''));
    } else if (kind === 'product') {
      if (ent.ptype === 'size') {
        const g = sizeGroupOf(ent);
        meta = esc(`Choice product · ${plural(g ? g.children.length : 0, 'choice', 'choices')}`);
      } else if (ent.ptype === 'container') meta = esc(`Option folder · ${plural(ent.children.length, 'group', 'groups')}`);
      else if (ent.ptype === 'linked') meta = `${icon('link', 11)}${esc(ent.posParentExt ? `Rings up as ${posLabel(ent.posParentExt)}` : 'Choose what it rings up as')}`;
      else if (ent.children.length) meta = esc(plural(ent.children.length, 'group', 'groups'));
    } else if (kind === 'group') {
      const rules = rulesOf(ent);
      const extra =
        ent.gtype === 'linked' ? ` · From ${posLabel(ent.posGroupExt)}` : ent.gtype === 'standalone' && !isChoiceGroup(ent) ? ' · Each one added as its own item' : '';
      const tag = isChoiceGroup(ent) && rules.type !== 2 ? 'Choice' : C.groupTypes[rules.type].label;
      meta = `<span class="type-tag type-${rules.type}">${tag}</span>${esc(groupRuleShort(rules) + extra)}`;
    }

    const issueDot = issueTone ? `<span class="issue-dot tone-${issueTone}" title="${esc(issues.map((i) => i.text).join('\n'))}"></span>` : '';
    const suggestion =
      kind === 'category' && suggestedSizeSets(ent).length
        ? `<button class="badge badge-action" data-action="group-sizes" data-path="${esc(path)}" title="Group size variants into one product">${icon('sparkles', 12)}Group sizes</button>`
        : '';
    const badges = [];
    if (isMissingOnPos(ent)) badges.push(`<span class="badge tone-error">Deleted on POS</span>`);
    else if (removedFromPos(path)) badges.push(`<span class="badge tone-warning">Removed on POS</span>`);
    if (pl.hidden) badges.push(`<span class="badge" title="Hidden in this placement">${icon('eyeOff', 12)}Hidden</span>`);
    if (kind === 'product') {
      const av = ent.availability;
      if (av && av.active)
        badges.push(`<span class="badge" title="${esc(availabilitySummary(av))}">${icon('clock', 12)}${{ serving: 'Serving times', lto: 'Limited time', preorder: 'Preorder' }[av.mode]}</span>`);
      const pre = preselectedAt(path);
      if (pre) badges.push(`<span class="badge tone-accent">Preselected${pre > 1 ? ` ×${pre}` : ''}</span>`);
      if (isAutoAdded(path)) badges.push(`<span class="badge" title="Added automatically by POS">Auto-added</span>`);
      const ps = priceStats(path);
      if (ps.total && ps.missingStores.length && !isMissingOnPos(ent)) {
        const all = ps.missingStores.length === ps.total;
        badges.push(`<span class="badge tone-${all ? 'error' : 'warning'}" title="No POS price, so customers there cannot order it">No price at ${all ? 'any store' : plural(ps.missingStores.length, 'store', 'stores')}</span>`);
      }
      const states = Object.values(ent.stores || {});
      const oos = states.filter(isOutOfStock).length;
      const hiddenAt = states.filter((s) => s === 'hidden').length;
      if (oos) badges.push(`<span class="badge tone-warning">Out of stock at ${plural(oos, 'store', 'stores')}</span>`);
      if (hiddenAt) badges.push(`<span class="badge" title="Hidden from the menu at these stores">Hidden at ${plural(hiddenAt, 'store', 'stores')}</span>`);
      const badgeTag = (ent.metadata || []).find((t) => t.key === 'Badge' && t.value);
      if (badgeTag) badges.push(`<span class="badge">${icon('tag', 12)}${esc(badgeTag.value)}</span>`);
    }
    if (kind === 'category') {
      if (ent.isBundle) badges.push(`<span class="badge" title="Quantities scale with the number of guests">${icon('package', 12)}Catering bundles</span>`);
      const off = Object.values(ent.stores || {}).filter((s) => s === 'disabled').length;
      if (off) badges.push(`<span class="badge" title="Customers at these stores do not see the category">Disabled at ${plural(off, 'store', 'stores')}</span>`);
    }
    if (isCustomVersion(ent)) badges.push(`<span class="badge tone-virtual" title="Rings up on POS as the original">${icon('link', 12)}Custom</span>`);
    else if (isVirtual(ent)) badges.push(`<span class="badge tone-virtual" title="Exists only in this menu. Not on POS">Menu only</span>`);
    if (uses > 1) badges.push(`<span class="badge" title="Used in ${uses} places">${icon('copy', 12)}${uses}</span>`);
    if (ent.source === 'pos' && !isMissingOnPos(ent)) badges.push(`<span class="pos-link" title="POS item ${esc(ent.externalId)}">${icon('link', 13)}</span>`);

    const flashCls = T.flashPaths.has(path) || (ent.externalId && T.flashExt.has(ent.externalId)) ? ' is-flash' : '';
    const addTitle = kind === 'category' ? 'Add product' : kind === 'product' && ent.ptype !== 'size' ? 'Add group' : 'Add option';
    return `<div class="row${selected ? ' is-selected' : ''}${pl.hidden ? ' is-muted' : ''}${r.hit ? ' is-hit' : ''}${flashCls}" role="treeitem" aria-level="${depth}" aria-selected="${selected}" ${hasChildren ? `aria-expanded="${r.expanded}"` : ''} tabindex="${selected ? 0 : -1}" draggable="true" data-path="${esc(path)}" data-kind="${kind}" data-parent-kind="${parentKind}" data-name="${esc(name)}" style="--depth:${depth - 1}">
      <span class="row-indent" aria-hidden="true"></span>
      ${hasChildren ? `<button class="twisty" data-action="toggle" data-path="${esc(path)}" tabindex="-1" aria-label="${r.expanded ? 'Collapse' : 'Expand'}">${icon('chevRight', 14)}</button>` : '<span class="twisty-spacer"></span>'}
      ${thumb(kind, ent)}
      <span class="row-main"><span class="row-title">${esc(name)}</span>${meta ? `<span class="row-meta">${meta}</span>` : ''}</span>
      ${suggestion}${issueDot}
      <span class="row-swap">
        <span class="row-badges">${badges.join('')}</span>
        <span class="row-actions">
          <button class="icon-btn sm" data-action="add" data-path="${esc(path)}" aria-label="${addTitle}" title="${addTitle}">${icon('plus', 15)}</button>
          <button class="icon-btn sm" data-action="more" data-path="${esc(path)}" aria-label="More options for ${esc(name)}" title="More options">${icon('more', 15)}</button>
        </span>
      </span>
    </div>`;
  }

  function renderCanvas() {
    const menu = activeMenu();
    const c = ctx.counts;
    const selected = S.ui.selected === menu.id;
    const changes = ctx.compare.count;
    $('#canvas-head').innerHTML = `
      <button class="menu-card${selected ? ' is-selected' : ''}" data-action="select-menu">
        <span class="menu-card-title">${esc(menu.name || 'Untitled menu')}</span>
        <span class="menu-card-meta tnum">${plural(c.category, 'category', 'categories')} · ${plural(c.product, 'product', 'products')} · ${plural(c.group, 'group', 'groups')}<span class="sep">·</span>${icon('clock', 12)}${esc(menuScheduleSummary(menu))}</span>
      </button>
      <div class="canvas-tools">
        <div class="tools-find">
        <label class="search-field">
          ${icon('search', 15)}
          <span class="sr-only">Search this menu</span>
          <input id="canvas-search" type="search" data-focus-key="canvas-search" placeholder="Search by name or POS ID" value="${esc(S.ui.canvasQuery)}" autocomplete="off">
        </label>
        <button class="icon-btn" data-action="expand-all" aria-label="Expand all" title="Expand all">${icon('expand', 16)}</button>
        <button class="icon-btn" data-action="collapse-all" aria-label="Collapse all" title="Collapse all">${icon('collapse', 16)}</button>
        </div>
        <div class="tools-actions">
        <button class="btn secondary" data-action="compare">${icon('diff', 15)}Compare to POS${changes ? `<span class="btn-count tnum">${changes}</span>` : ''}</button>
        <button class="btn secondary" data-action="optimize">${icon('sparkles', 15)}Optimize</button>
        <button class="btn secondary" data-action="add-category" aria-haspopup="menu">${icon('plus', 15)}Add category</button>
        </div>
      </div>`;

    const tree = $('#canvas-tree');
    if (!menu.children.length) {
      tree.innerHTML = `
        <div class="blank">
          <div class="blank-art">${icon('layers', 22)}</div>
          <h3>Build your first category</h3>
          <p>Add categories from POS, or drag a POS menu here. Products keep their POS prices and options. To arrange products your own way, create a menu-only category.</p>
          <div class="blank-actions">
            <button class="btn primary" data-action="add-pos-category">${icon('plus', 15)}Add POS category</button>
            <button class="btn secondary" data-action="create-category">${icon('dashed', 15)}Create menu-only category</button>
          </div>
        </div>`;
      return;
    }
    const rows = visibleRows(menu);
    tree.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<div class="empty-small"><strong>Nothing matches “${esc(S.ui.canvasQuery)}”</strong><span>Try a different name or POS ID.</span></div>`;
  }

  /* ---------- inspector ---------- */

  const scopePill = (where) => `<span class="scope" title="Applies only to ${esc(where)}">Only here</span>`;
  const lockPill = (text = 'From POS') => `<span class="scope scope-pos" title="Set on POS. Change it on POS, then sync">${icon('lock', 11)}${esc(text)}</span>`;

  function field(label, control, { help = '', scope = '', id = '', error = '', pos = false } = {}) {
    return `<div class="field${error ? ' has-error' : ''}">
      ${label || scope || pos ? `<div class="field-head">${label ? `<label class="field-label"${id ? ` for="${id}"` : ''}>${esc(label)}</label>` : ''}${scope ? scopePill(scope) : ''}${pos ? lockPill() : ''}</div>` : ''}
      ${control}
      ${error ? `<p class="field-error">${icon('alertCircle', 13)}${esc(error)}</p>` : help ? `<p class="field-help">${help}</p>` : ''}
    </div>`;
  }

  function inputText(bind, value, { id = '', multiline = false, mono = false, rows = 3, placeholder = '', list = '', label = '' } = {}) {
    const attrs = `${id ? `id="${id}" ` : ''}class="input${mono ? ' mono' : ''}" data-bind="${esc(bind)}" data-type="text" data-focus-key="${esc(bind)}" spellcheck="${mono ? 'false' : 'true'}" autocomplete="off"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}${list ? ` list="${esc(list)}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}`;
    return multiline ? `<textarea ${attrs} rows="${rows}">${esc(value || '')}</textarea>` : `<input type="text" ${attrs} value="${esc(value || '')}">`;
  }

  function inputNum(bind, value, { id = '', prefix = '', suffix = '', int = false, min = 0, max = null, placeholder = '', disabled = false, label = '' } = {}) {
    return `<div class="input-affix${disabled ? ' is-disabled' : ''}">
      ${prefix ? `<span class="affix">${prefix}</span>` : ''}
      <input type="number" ${id ? `id="${id}"` : ''} class="input tnum" inputmode="${int ? 'numeric' : 'decimal'}" data-bind="${esc(bind)}" data-type="${int ? 'int' : 'num'}" data-focus-key="${esc(bind)}" step="${int ? 1 : 0.01}" min="${min}"${max != null ? ` max="${max}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''} value="${isNum(value) ? value : ''}" placeholder="${esc(placeholder)}" ${disabled ? 'disabled' : ''}>
      ${suffix ? `<span class="affix">${suffix}</span>` : ''}
    </div>`;
  }

  function toggle(bind, on, { label, help = '', scope = '', disabled = false, action = '' } = {}) {
    const trigger = action ? `data-action="${esc(action)}"` : `data-toggle="${esc(bind)}"`;
    return `<div class="toggle-row${disabled ? ' is-disabled' : ''}">
      <div class="toggle-text">
        <span class="toggle-label">${esc(label)}${scope ? scopePill(scope) : ''}</span>
        ${help ? `<span class="field-help">${help}</span>` : ''}
      </div>
      <button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${trigger} data-focus-key="${esc(bind)}" ${disabled ? 'disabled' : ''}><span class="switch-thumb"></span></button>
    </div>`;
  }

  function segmented(bind, value, options) {
    return `<div class="segmented" role="radiogroup">${options
      .map(
        ([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" class="seg" data-set="${esc(bind)}" data-value="${esc(v)}" data-focus-key="${esc(bind)}=${esc(v)}">${esc(l)}</button>`,
      )
      .join('')}</div>`;
  }

  function chips(bind, values, options, { invert = false, vtype = 'text' } = {}) {
    const arr = values || [];
    return `<div class="chips">${options
      .map(([v, l]) => {
        const on = invert ? !arr.includes(v) : arr.includes(v);
        return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-chip="${esc(bind)}" data-value="${esc(v)}" data-vtype="${vtype}" data-focus-key="${esc(bind)}~${esc(v)}">${on ? icon('check', 12) : ''}${esc(l)}</button>`;
      })
      .join('')}</div>`;
  }

  function selectInput(bind, value, options, { id = '', label = '', disabled = false } = {}) {
    return `<div class="select-wrap"><select ${id ? `id="${id}"` : ''} ${label ? `aria-label="${esc(label)}"` : ''} name="${esc(bind)}" class="input" data-bind="${esc(bind)}" data-type="text" data-focus-key="${esc(bind)}"${disabled ? ' disabled' : ''}>${options
      .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`)
      .join('')}</select>${icon('chevDown', 14)}</div>`;
  }

  function stepper(bind, value, { min = 0, max = 99, label = 'quantity', disabled = false } = {}) {
    const v = value || 0;
    return `<div class="stepper${disabled ? ' is-disabled' : ''}">
      <button type="button" class="icon-btn sm" data-action="step" data-bind="${esc(bind)}" data-delta="-1" data-min="${min}" data-max="${max}" aria-label="Decrease ${label}" ${disabled || v <= min ? 'disabled' : ''}>${icon('minus', 14)}</button>
      <span class="stepper-value tnum">${v}</span>
      <button type="button" class="icon-btn sm" data-action="step" data-bind="${esc(bind)}" data-delta="1" data-min="${min}" data-max="${max}" aria-label="Increase ${label}" ${disabled || v >= max ? 'disabled' : ''}>${icon('plus', 14)}</button>
    </div>`;
  }

  function range(bindFrom, vFrom, bindTo, vTo, suffix, idFrom, { min = 0 } = {}) {
    return `<div class="range">${inputNum(bindFrom, vFrom, { int: true, id: idFrom, min })}<span class="range-sep">–</span>${inputNum(bindTo, vTo, { int: true, suffix, min, label: 'Up to' })}</div>`;
  }

  const section = (title, body, { desc = '' } = {}) =>
    `<section class="insp-section">${title ? `<h3 class="section-title">${esc(title)}</h3>` : ''}${desc ? `<p class="section-desc">${desc}</p>` : ''}<div class="section-body">${body}</div></section>`;

  const callout = (tone, html, ic) =>
    `<div class="callout tone-${tone}">${icon(ic || (tone === 'error' ? 'alertCircle' : tone === 'warning' ? 'alert' : 'info'), 16)}<div>${html}</div></div>`;

  function imageField(bind, value, { label = 'Image', size = '1200 × 800', help = '', wide = false } = {}) {
    return field(
      label,
      value
        ? `<div class="image-field${wide ? ' is-wide' : ''}"><img class="image-preview" src="${value}" alt="">
            <div class="image-actions">
              <label class="btn secondary sm">Replace image<input type="file" accept="${IMAGE_TYPES.join(',')}" data-image="${esc(bind)}" hidden></label>
              <button type="button" class="btn ghost sm tone-danger" data-action="image-remove" data-bind="${esc(bind)}">Remove image</button>
            </div></div>`
        : `<label class="dropzone" data-image-drop="${esc(bind)}">${icon('image', 20)}
            <span>Drop an image here or <span class="link">choose a file</span></span>
            <span class="field-help">JPG, PNG, or GIF up to 1 MB. Best at ${size} px.</span>
            <input type="file" accept="${IMAGE_TYPES.join(',')}" data-image="${esc(bind)}" hidden></label>`,
      { help },
    );
  }

  function descriptionField(bind, value, id) {
    const len = (value || '').length;
    return field('Description', inputText(bind, value, { id, multiline: true, rows: 4 }), {
      id,
      help: `<span class="tnum">${len} / ${DESC_LIMIT}</span>`,
      error: len > DESC_LIMIT ? `Use ${DESC_LIMIT} characters or fewer` : '',
    });
  }

  function scheduleEditor(base, slots) {
    return `<div class="slots">
      ${slots
        .map(
          (s, i) => `<div class="slot">
          <div class="slot-days" role="group" aria-label="Days">${DAYS.map(
            (d, di) => `<button type="button" class="day${s.days.includes(di) ? ' is-on' : ''}" aria-pressed="${s.days.includes(di)}" data-chip="${esc(base)}.${i}.days" data-value="${di}" data-vtype="int" data-focus-key="${esc(base)}.${i}.days~${di}">${d}</button>`,
          ).join('')}</div>
          <div class="slot-times">
            <input type="time" class="input tnum" aria-label="Start time" data-bind="${esc(base)}.${i}.from" data-type="text" data-focus-key="${esc(base)}.${i}.from" value="${esc(s.from)}">
            <span class="range-sep">–</span>
            <input type="time" class="input tnum" aria-label="End time" data-bind="${esc(base)}.${i}.to" data-type="text" data-focus-key="${esc(base)}.${i}.to" value="${esc(s.to)}">
            <button type="button" class="icon-btn sm" data-action="sched-remove" data-bind="${esc(base)}" data-index="${i}" aria-label="Remove time slot" title="Remove time slot">${icon('x', 14)}</button>
          </div>
          ${s.days.length ? '' : '<p class="field-help">Choose the days for this time slot.</p>'}
        </div>`,
        )
        .join('')}
      <button type="button" class="btn ghost sm" data-action="sched-add" data-bind="${esc(base)}">${icon('plus', 14)}Add time slot</button>
    </div>
    <p class="field-help">${esc(scheduleSummary(slots))}</p>`;
  }

  const STORE_RESULTS = 6;

  function matchStores(stores = STORES) {
    const q = T.storeQuery.trim().toLowerCase();
    if (!q) return [];
    return stores.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q));
  }

  function storeSearch(id, placeholder) {
    return `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">${esc(placeholder)}</span>
      <input id="${id}" type="search" data-store-search data-focus-key="${id}" placeholder="${esc(placeholder)}" value="${esc(T.storeQuery)}" autocomplete="off"></label>`;
  }

  function storeResults(results, rowFn, listClass = 'store-list') {
    if (!T.storeQuery.trim()) return '';
    if (!results.length) return '<p class="field-help">No stores match. Check the spelling.</p>';
    return `<div class="${listClass}">${results.slice(0, STORE_RESULTS).map(rowFn).join('')}</div>${
      results.length > STORE_RESULTS ? `<p class="field-help">Showing ${STORE_RESULTS} of ${results.length} stores. Keep typing to narrow it down.</p>` : ''
    }`;
  }

  function storesList(kind, ent, states, { activeLabel = 'Active', wide = false } = {}) {
    const bind = (sid) => `e|${kind}|${ent.id}|stores.${sid}`;
    const exceptions = Object.entries(ent.stores || {})
      .filter(([, v]) => v !== 'active')
      .map(([id, v]) => ({ store: storeById.get(id), v }))
      .filter((x) => x.store);
    const counts = {};
    exceptions.forEach((x) => (counts[x.v] = (counts[x.v] || 0) + 1));
    const summary = [
      `${activeLabel} at ${STORES.length - exceptions.length} of ${STORES.length} stores`,
      ...Object.entries(counts).map(([v, n]) => `${(states.find((s) => s[0] === v) || [v, v])[1]} at ${plural(n, 'store', 'stores')}`),
    ].join(' · ');
    const row = (s) =>
      `<div class="store-row"><span class="store-name">${icon('store', 15)}${esc(s.name)}</span>${selectInput(bind(s.id), (ent.stores || {})[s.id] || 'active', states, { label: `Status at ${s.name}` })}</div>`;
    const list = wide ? 'store-list is-wide' : 'store-list';
    return `<p class="store-summary">${esc(summary)}</p>
      ${exceptions.length ? `<div class="${list}">${exceptions.map((x) => row(x.store)).join('')}</div>` : ''}
      ${field('Change status at a store', storeSearch('store-status-q', `Search ${STORES.length} stores`))}
      ${storeResults(matchStores(), row, list)}`;
  }

  function nameBlock(kind, ent, { error = '', help = '' } = {}) {
    const bind = `e|${kind}|${ent.id}|name`;
    if (ent.source !== 'pos') return field('Name', inputText(bind, ent.name, { id: 'insp-name' }), { id: 'insp-name', error, help });
    const pos = posItem(ent);
    const posName = pos ? pos.name : ent.reviewed ? ent.reviewed.name : '';
    const control = ent.syncName
      ? `<div class="input is-readonly" id="insp-name-ro">${esc(nameOf(kind, ent))}${icon('lock', 13)}</div>`
      : inputText(bind, ent.name, { id: 'insp-name' });
    return (
      field('Name', control, {
        id: ent.syncName ? '' : 'insp-name',
        error: ent.syncName ? '' : error,
        help: ent.syncName ? 'Updates on every POS sync.' : `POS name: ${esc(posName)}. Customers see your name, POS keeps its own.`,
      }) + toggle(`e|${kind}|${ent.id}|syncName`, ent.syncName, { label: 'Use POS name' })
    );
  }

  function posKv(rows) {
    return `<dl class="kv">${rows.map(([k, v, mono]) => `<dt>${esc(k)}</dt><dd${mono ? ' class="mono"' : ''}>${v}</dd>`).join('')}</dl>`;
  }

  function sourceSection(kind, ent, path) {
    if (ent.source === 'pos') {
      const pos = posItem(ent);
      const rows = [
        [
          'POS ID',
          `<span class="kv-copy">${esc(ent.externalId)}<button type="button" class="icon-btn sm" data-action="copy-text" data-value="${esc(ent.externalId)}" data-label="POS ID" aria-label="Copy POS ID" title="Copy POS ID">${icon('copy', 13)}</button></span>`,
          true,
        ],
        ['POS name', esc(pos ? pos.name : ent.reviewed.name)],
      ];
      if (kind === 'product' && ent.originCategoryExt) rows.push(['POS category', esc(posLabel(ent.originCategoryExt))]);
      return section(
        'POS',
        `${isMissingOnPos(ent) ? callout('warning', 'Deleted on POS. Customers cannot order it. Remove it from the menu, or add it back on POS.') : ''}
        ${removedFromPos(path) ? callout('warning', 'Still on POS, but no longer under the same parent there. Remove it here, or check POS.') : ''}
        ${posKv(rows)}`,
      );
    }
    if (kind === 'category')
      return section(
        'Menu-only category',
        callout('info', 'Arranges products your own way. It exists only in this menu, not on POS. Each product inside keeps the price of its own POS category.', 'dashed'),
      );
    if (kind === 'product' && ent.ptype === 'linked')
      return section(
        'Custom version',
        `${callout('info', `Rings up on POS as <strong>${esc(ent.posParentExt ? posLabel(ent.posParentExt) : 'the POS product you choose')}</strong>, at its POS price. Name, image, and preselected options are only for customers.`, 'link')}
        ${ent.posParentExt ? posKv([['Rings up as', esc(posLabel(ent.posParentExt))], ['POS ID', esc(ent.posParentExt), true]]) : ''}`,
      );
    if (kind === 'product' && ent.ptype === 'container')
      return section(
        'Option folder',
        callout('info', 'An option that opens more choices. It is never sent to POS. The choices customers make inside go to POS with the product above it.', 'dashed') +
          `<p class="field-help">Not available on option folders: price, POS ID, allergens, modifier codes, included ingredients, substitutes, half and whole, upsell, and cross-sell. Option folders go only in product groups, not in categories.</p>`,
      );
    if (kind === 'product' && ent.ptype === 'size')
      return section(
        'Choice product',
        callout('info', 'Customers tap it and pick one product, like Small or Large. It is never sent to POS. The product they pick is sent instead, at its POS price.', 'package'),
      );
    if (kind === 'group' && ent.gtype === 'linked')
      return section(
        'Custom version',
        `${callout('info', `Shows only some options from <strong>${esc(posLabel(ent.posGroupExt))}</strong>. Choices ring up on POS in that group, at its POS prices.`, 'link')}
        ${posKv([['POS group', esc(posLabel(ent.posGroupExt))], ['POS ID', esc(ent.posGroupExt), true]])}`,
      );
    if (kind === 'group')
      return section(
        isChoiceGroup(ent) ? 'Choice group' : 'Add-on group',
        callout('info', isChoiceGroup(ent) ? 'The products customers choose between. Only the product they pick is sent to POS, at its own POS price.' : 'Suggests extra products. Each one customers pick is added to the order as its own item, at its own POS price.', 'dashed'),
      );
    return '';
  }

  const removeSection = (path, kind, ent) => {
    const pInfo = parsePath(parsePath(path).parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    return section(
      '',
      `<button type="button" class="btn secondary tone-danger" data-action="remove" data-path="${esc(path)}">${icon('trash', 15)}Remove from ${esc(parentName)}</button>
       <p class="field-help">${isVirtual(ent) ? 'Nothing changes on POS.' : `The ${KIND_LABEL[kind].toLowerCase()} stays on POS. You can add it back from POS items.`}</p>`,
    );
  };

  function tabsFor(kind, ent) {
    if (kind === 'menu') return [['general', 'General'], ['ordering', 'Ordering'], ['availability', 'Availability'], ['stores', 'Stores'], ['advanced', 'Advanced']];
    if (kind === 'category') return [['general', 'General'], ['images', 'Images'], ['availability', 'Availability'], ['stores', 'Stores'], ['advanced', 'Advanced']];
    if (kind === 'group') return [['general', 'General'], ['rules', 'Rules'], ['options', 'Options'], ['advanced', 'Advanced']];
    return [['general', 'General'], ['dietary', 'Dietary'], ['ordering', 'Ordering'], ['availability', 'Availability'], ['advanced', 'Advanced']];
  }

  function renderInspector() {
    const path = S.ui.selected;
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const kind = info.kind;
    const tabs = tabsFor(kind, ent);
    const tab = tabs.some((t) => t[0] === S.ui.tabs[kind]) ? S.ui.tabs[kind] : tabs[0][0];
    const uses = kind === 'menu' ? [] : ctx.usage.get(`${kind}:${info.id}`) || [];
    const issues = ctx.issues.byPath.get(path) || [];
    const chipKind = kind === 'menu' ? 'menu' : isVirtual(ent) && ent.ptype !== 'linked' ? 'virtual' : kind;

    const kicker = [
      `<span class="kind-chip kind-${chipKind}">${esc(kindLabel(kind, ent))}</span>`,
      kind !== 'menu' && ent.source === 'pos' ? `<span class="src-chip">${icon('link', 12)}POS</span>` : '',
      kind !== 'menu' && isVirtual(ent) && !isCustomVersion(ent) ? '<span class="src-chip">Menu only</span>' : '',
    ].join('');

    const crumbHtml =
      kind === 'menu'
        ? ''
        : `<nav class="crumbs" aria-label="Location">${crumbs(info.parentPath)
            .map((c) => `<button type="button" class="crumb" data-action="goto" data-path="${esc(c.path)}">${esc(c.name)}</button>`)
            .join('<span class="crumb-sep">›</span>')}</nav>`;

    const canPreview = kind === 'product' && ent.ptype !== 'container';
    $('#inspector-head').innerHTML = `
      <div class="insp-head">
        ${thumb(kind, ent, 'thumb-lg')}
        <div class="insp-titles">
          <div class="insp-kicker">${kicker}</div>
          <h2 class="insp-title">${esc(nameOf(kind, ent))}</h2>
          ${crumbHtml}
        </div>
        ${canPreview ? `<button type="button" class="btn secondary sm" data-action="preview" data-path="${esc(path)}">${icon('phone', 14)}Preview</button>` : ''}
      </div>
      ${kind !== 'menu' && typeHelp(kind, ent) ? `<p class="insp-type-help">${esc(typeHelp(kind, ent))}</p>` : ''}
      ${
        uses.length > 1
          ? `<details class="shared">
              <summary>${icon('copy', 14)}<span><strong>Used in ${uses.length} places.</strong> Edits apply everywhere, except settings marked ${scopePill('this placement')}</span>${icon('chevDown', 14)}</summary>
              <ul>${uses
                .map((u) => `<li><button type="button" class="crumb-link${u === path ? ' is-current' : ''}" data-action="goto" data-path="${esc(u)}">${esc(crumbText(u))}</button></li>`)
                .join('')}</ul>
            </details>`
          : ''
      }
      ${issues.length ? `<div class="insp-issues">${issues.map((i) => callout(i.level, esc(i.text))).join('')}</div>` : ''}`;

    $('#inspector-tabs').innerHTML = `<div class="tabs" role="tablist">${tabs
      .map(([id, label]) => `<button type="button" role="tab" class="tab" aria-selected="${id === tab}" data-action="tab" data-kind="${kind}" data-tab="${id}">${label}</button>`)
      .join('')}</div>`;

    const key = `${path}|${tab}`;
    if (T.storeKey !== key) {
      T.storeKey = key;
      T.storeQuery = '';
      T.catProductQuery = '';
      T.catOnlyHidden = false;
      T.menuQuery = '';
      T.placeQuery = '';
      T.showSelectedPlaces = false;
      T.openCard = null;
      T.segmentDraft = null;
      T.tagDraft = null;
    }
    const body = { menu: menuTab, category: categoryTab, product: productTab, group: groupTab }[kind](tab, ent, path);
    const scroller = $('#inspector-scroll');
    $('#inspector-body').innerHTML = body;
    if (scroller.dataset.key !== key) {
      scroller.scrollTop = 0;
      scroller.dataset.key = key;
    }
  }

  const TEXT_LIMIT = 255;
  const channelLabel = (id) => (C.channels.find((c) => c[0] === id) || [id, id])[1];
  const lengthError = (value, required = '') => {
    const v = value || '';
    if (required && !v.trim()) return required;
    return v.length > TEXT_LIMIT ? `Use ${TEXT_LIMIT} characters or fewer` : '';
  };

  function menuTab(tab, m) {
    const mb = (f) => `m|${m.id}|${f}`;
    if (tab === 'general') {
      return section(
        '',
        field('Name', inputText(mb('name'), m.name, { id: 'insp-name' }), { id: 'insp-name', error: lengthError(m.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
          field('Internal name', inputText(mb('internalName'), m.internalName, { id: 'm-int' }), { id: 'm-int', error: lengthError(m.internalName), help: 'Use it to tell apart menus with the same name. Only your team sees it.' }) +
          descriptionField(mb('description'), m.description, 'm-desc') +
          imageField(mb('image'), m.image),
      );
    }
    if (tab === 'ordering') return menuOrderingTab(m, mb);
    if (tab === 'availability') return menuAvailabilityTab(m, mb);
    if (tab === 'stores') return menuStoresTab(m);
    return (
      section(
        'Identifiers',
        field(
          'POS ID',
          m.posExt
            ? `<div class="copy-field"><input type="text" class="input mono" value="${esc(m.posExt)}" readonly aria-label="POS ID">
                <button type="button" class="icon-btn sm" data-action="copy-text" data-value="${esc(m.posExt)}" data-label="POS ID" aria-label="Copy POS ID" title="Copy POS ID">${icon('copy', 14)}</button></div>`
            : '<p class="field-help">Not linked to a POS menu. Drag a POS menu onto the canvas to link it.</p>',
          { pos: !!m.posExt },
        ) +
          field('External ID', inputText(mb('externalId'), m.externalId, { id: 'm-ext', mono: true }), {
            id: 'm-ext',
            error: lengthError(m.externalId),
            help: 'Use it to match this menu in reports outside this platform.',
          }),
      ) +
      (S.data.menus.length > 1
        ? section('', `<button type="button" class="btn secondary tone-danger" data-action="delete-menu" data-id="${m.id}">${icon('trash', 15)}Delete menu</button>`)
        : '')
    );
  }

  function menuOrderingTab(m, mb) {
    const bind = mb('orderTypes');
    const orderTypeRows = C.orderTypes
      .map(([v, l]) => {
        const on = m.orderTypes.includes(v);
        const on_ = (C.orderTypeChannels[v] || []).map(channelLabel);
        return `<button type="button" class="option-row" aria-pressed="${on}" data-chip="${esc(bind)}" data-value="${esc(v)}" data-focus-key="${esc(bind)}~${esc(v)}">
          <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
          <span class="option-text"><span class="option-label">${esc(l)}</span>${on_.length ? `<span class="option-hint">Available on ${esc(listJoin(on_))}</span>` : ''}</span>
        </button>`;
      })
      .join('');
    return (
      section(
        'Channels',
        field('', chips(mb('channels'), m.channels, C.channels), {
          error: m.channels.length ? '' : 'Choose at least one channel',
          help: 'Customers can order from this menu in these apps.',
        }),
      ) +
      section(
        'Order types',
        field('', `<div class="option-list">${orderTypeRows}</div>`, {
          error: m.orderTypes.length ? '' : 'Choose at least one order type',
          help: 'Customers see this menu only for these order types.',
        }),
      ) +
      section('Delivery partners', field('', chips(mb('externalChannels'), m.externalChannels, C.deliveryPartners), { help: 'Third-party apps that also get this menu.' }))
    );
  }

  const slotError = (text) => `<p class="field-error">${icon('alertCircle', 13)}${esc(text)}</p>`;

  function segmentTags() {
    const tags = new Set(C.segmentTags);
    S.data.menus.forEach((x) => x.segments.forEach((s) => s.tag && tags.add(s.tag)));
    Object.values(S.data.entities.product).forEach((p) => (p.segments || []).forEach((s) => s.tag && tags.add(s.tag)));
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  function menuAvailabilityTab(m, mb) {
    const custom = m.schedule.length > 0;
    const overlap = scheduleOverlapDays(m.schedule);
    const sameTimes = m.schedule.some((s) => s.from === s.to);
    const schedule = `<div class="segmented" role="radiogroup" aria-label="Serving times">
        <button type="button" role="radio" class="seg" aria-checked="${!custom}" data-action="menu-sched-mode" data-mode="store">Store hours</button>
        <button type="button" role="radio" class="seg" aria-checked="${custom}" data-action="menu-sched-mode" data-mode="custom">Custom times</button>
      </div>
      ${
        custom
          ? scheduleEditor(mb('schedule'), m.schedule) +
            (overlap.length ? slotError(`Time slots overlap on ${listJoin(overlap.map((d) => DAYS[d]))}`) : '') +
            (sameTimes ? slotError('Each time slot needs different start and end times') : '') +
            '<p class="field-help">Customers can order only when the store is open too.</p>'
          : '<p class="field-help">Customers can order from this menu whenever the store is open.</p>'
      }`;

    return section('Serving times', schedule, { desc: 'Products can narrow these times further.' }) + segmentsSection(mb('segments'), m.segments, 'menu');
  }

  function segmentsSection(base, segments, subject) {
    const errors = segmentErrors(segments);
    const tagList = `<datalist id="segment-tags">${segmentTags().map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
    const segmentRows = segments
      .map(
        (s, i) => `<div class="segment-row${errors[i] ? ' has-error' : ''}">
          <div class="segment-inputs">
            <input type="text" class="input mono" aria-label="Segment ID" data-bind="${esc(`${base}.${i}.segmentId`)}" data-type="text" data-focus-key="${esc(`${base}.${i}.segmentId`)}" value="${esc(s.segmentId)}" autocomplete="off" spellcheck="false">
            <input type="text" class="input" aria-label="Tag" list="segment-tags" data-bind="${esc(`${base}.${i}.tag`)}" data-type="text" data-focus-key="${esc(`${base}.${i}.tag`)}" value="${esc(s.tag)}" autocomplete="off">
            <button type="button" class="icon-btn sm" data-action="segment-remove" data-bind="${esc(base)}" data-index="${i}" aria-label="Remove segment" title="Remove segment">${icon('x', 14)}</button>
          </div>
          ${errors[i] ? slotError(errors[i]) : ''}
        </div>`,
      )
      .join('');
    const draft = T.segmentDraft && T.segmentDraft.base === base ? T.segmentDraft : null;
    const draftId = draft ? draft.segmentId.trim().toLowerCase() : '';
    const draftDup = draftId && segments.some((s) => s.segmentId.trim().toLowerCase() === draftId);
    const draftForm = draft
      ? `<div class="segment-draft${draftDup ? ' has-error' : ''}">
          <div class="segment-labels"><span class="field-label">Segment ID</span><span class="field-label">Tag</span></div>
          <div class="segment-inputs">
            <input type="text" class="input mono" aria-label="Segment ID" data-segment-draft="segmentId" data-focus-key="segment-draft-id" value="${esc(draft.segmentId)}" autocomplete="off" spellcheck="false">
            <input type="text" class="input" aria-label="Tag" list="segment-tags" data-segment-draft="tag" data-focus-key="segment-draft-tag" value="${esc(draft.tag)}" autocomplete="off">
            <span aria-hidden="true"></span>
          </div>
          ${draftDup ? slotError('This segment is already added') : ''}
          <div class="segment-draft-actions">
            <button type="button" class="btn ghost sm" data-action="segment-cancel">Cancel</button>
            <button type="button" class="btn primary sm" data-action="segment-save" ${draftId && !draftDup ? '' : 'disabled'}>Add segment</button>
          </div>
        </div>`
      : `<button type="button" class="btn ghost sm" data-action="segment-add" data-bind="${esc(base)}">${icon('plus', 14)}Add segment</button>`;
    return section('Customer segments', `${tagList}${segmentRows ? `<div class="segment-list">${segmentRows}</div>` : ''}${draftForm}`, {
      desc: segments.length ? `Only customers in these segments see this ${subject}.` : `Everyone sees this ${subject}. Add a segment to limit it to specific customers.`,
    });
  }

  function menuStoresTab(m) {
    const total = menuStores(m).length;
    const free = C.menuStoreGroups.filter((g) => !m.storeGroups.some((a) => a.id === g.id));
    const error = !m.storeGroups.length ? 'Add at least one store group' : total ? '' : 'Choose at least one store';
    return section(
      'Store groups',
      `<p class="store-summary">${total ? `${plural(total, 'store', 'stores')} from ${plural(m.storeGroups.length, 'group', 'groups')}` : 'No stores yet'}</p>
      <div class="group-cards">${m.storeGroups.map((a, i) => storeGroupCard(m, a, i)).join('')}</div>
      ${field('', `<button type="button" class="btn secondary sm" data-action="menu-group-add" ${free.length ? '' : 'disabled'}>${icon('plus', 14)}Add store group</button>`, { error })}`,
      { desc: 'The menu goes live at these stores when you publish.' },
    );
  }

  function storeGroupCard(m, a, i) {
    const g = groupDef(a.id);
    const all = groupStores(a.id);
    const chosen = assignedStores(a);
    const sel = new Set(chosen.map((s) => s.id));
    const published = new Set(m.publishedStoreIds);
    const open = T.openStoreGroup === a.id;
    const row = (s) => {
      const on = sel.has(s.id);
      const status = on ? (published.has(s.id) ? ['Published', 'ok'] : ['Ready to publish', 'neutral']) : null;
      return `<button type="button" class="store-row store-check" data-action="menu-group-store" data-group="${a.id}" data-id="${s.id}" aria-pressed="${on}">
        <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
        <span class="store-name">${esc(s.name)}</span>${status ? `<span class="store-status tone-${status[1]}">${status[0]}</span>` : `<span class="muted">${esc(s.city)}</span>`}</button>`;
    };
    const q = T.storeQuery.trim();
    const onlySelected = T.showSelectedStores;
    const pool = onlySelected ? chosen : all;
    const results = matchStores(pool);
    const scope = q ? results : all;
    const list = onlySelected ? chosen : [...chosen, ...all.filter((s) => !sel.has(s.id))];
    const allOn = scope.length && scope.every((s) => sel.has(s.id));
    const bulkLabel = q
      ? `${allOn ? 'Remove' : 'Add'} ${plural(results.length, 'matching store', 'matching stores')}`
      : allOn
        ? 'Clear all'
        : 'Select all';
    return `<div class="group-card${open ? ' is-open' : ''}">
      <div class="group-card-head">
        <button type="button" class="group-card-toggle" data-action="menu-group-open" data-id="${a.id}" aria-expanded="${open}">
          ${icon('chevRight', 14)}
          <span class="group-card-title"><strong>${esc(g ? g.name : a.id)}</strong><span class="muted tnum">${chosen.length} of ${all.length} stores</span></span>
        </button>
        <button type="button" class="icon-btn sm" data-action="menu-group-remove" data-id="${a.id}" aria-label="Remove ${esc(g ? g.name : a.id)}" title="Remove store group">${icon('x', 14)}</button>
      </div>
      ${toggle(`m|${m.id}|storeGroups.${i}.newStores`, a.newStores, { label: 'Add new stores automatically', help: 'Stores added to this group later get the menu too.' })}
      ${
        open
          ? `<div class="group-card-body">
            ${storeSearch(`msg-q-${a.id}`, 'Search by store or city')}
            <div class="group-card-tools">
              ${scope.length && !onlySelected ? `<button type="button" class="btn ghost sm" data-action="menu-group-bulk" data-group="${a.id}" data-on="${allOn ? 0 : 1}">${bulkLabel}</button>` : '<span></span>'}
              <button type="button" class="check-toggle" role="checkbox" aria-checked="${onlySelected}" data-action="menu-group-only-selected">
                <span class="check${onlySelected ? ' is-on' : ''}" aria-hidden="true">${onlySelected ? icon('check', 12) : ''}</span>Show only selected</button>
            </div>
            ${
              q
                ? storeResults(results, row)
                : list.length
                  ? `<div class="store-list">${list.slice(0, 8).map(row).join('')}</div>${list.length > 8 ? `<p class="field-help">And ${list.length - 8} more. Search to find a store.</p>` : ''}`
                  : '<p class="field-help">No stores selected in this group yet.</p>'
            }
          </div>`
          : ''
      }
    </div>`;
  }

  const menusWithCategory = (catId) => S.data.menus.filter((m) => m.children.includes(catId));
  const isCateringMenu = (m) => m.orderTypes.some((o) => o.startsWith('catering'));

  function categoryProductsSection(cat, path, menu) {
    const rows = cat.children.map((pid) => ({ p: entity('product', pid), pp: childPath(path, 'product', pid) })).filter((r) => r.p);
    if (!rows.length) return section(`Products in ${menu.name}`, '<p class="field-help">No products yet. Drag products from POS items onto this category.</p>');
    const hidden = rows.filter((r) => placement(r.pp).hidden);
    const q = T.catProductQuery.trim().toLowerCase();
    const onlyHidden = T.catOnlyHidden && hidden.length > 0;
    const list = (onlyHidden ? hidden : rows).filter((r) => !q || nameOf('product', r.p).toLowerCase().includes(q));
    const row = ({ p, pp }) => {
      const off = !!placement(pp).hidden;
      const name = nameOf('product', p);
      return `<div class="opt-row${off ? ' is-muted' : ''}">
        <button type="button" class="opt-name" data-action="goto" data-path="${esc(pp)}">${thumb('product', p, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label">${esc(name)}</span></span></button>
        <button type="button" class="switch" role="switch" aria-checked="${!off}" aria-label="Show ${esc(name)} in ${esc(menu.name)}" data-toggle="pl|${esc(pp)}|hidden" data-focus-key="pl|${esc(pp)}|hidden"><span class="switch-thumb"></span></button>
      </div>`;
    };
    const summary = hidden.length ? `${rows.length - hidden.length} of ${rows.length} shown` : `All ${plural(rows.length, 'product', 'products')} shown`;
    return section(
      `Products in ${menu.name}`,
      `${rows.length > 8 ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search products</span><input id="cat-product-q" type="search" data-cat-product-search data-focus-key="cat-product-q" placeholder="Search products" value="${esc(T.catProductQuery)}" autocomplete="off"></label>` : ''}
      <div class="group-card-tools">
        <span class="store-summary tnum">${esc(summary)}</span>
        ${
          hidden.length
            ? `<button type="button" class="check-toggle" role="checkbox" aria-checked="${onlyHidden}" data-action="cat-only-hidden"><span class="check${onlyHidden ? ' is-on' : ''}" aria-hidden="true">${onlyHidden ? icon('check', 12) : ''}</span>Show only hidden</button>`
            : ''
        }
      </div>
      ${
        list.length
          ? `<div class="opt-table is-compact"><div class="opt-head"><span>Product</span><span>Shown</span></div>${list.map(row).join('')}</div>`
          : '<p class="field-help">No products match. Check the spelling.</p>'
      }
      ${hidden.length ? `<button type="button" class="btn ghost sm" data-action="cat-show-all" data-path="${esc(path)}">${icon('eye', 14)}${hidden.length === 1 ? 'Show the hidden product' : `Show all ${hidden.length} hidden products`}</button>` : ''}`,
      { desc: `Hidden products stay in the category. Applies only in ${esc(menu.name)}.` },
    );
  }

  function categoryMenusSection(cat, menu) {
    const inMenus = new Set(menusWithCategory(cat.id).map((m) => m.id));
    const all = [...S.data.menus].sort((x, y) => (x.id === menu.id ? -1 : y.id === menu.id ? 1 : 0));
    const selected = all.filter((m) => inMenus.has(m.id));
    const big = all.length > 6;
    const q = big ? T.menuQuery.trim().toLowerCase() : '';
    const onlySelected = big && T.showSelectedMenus;
    const list = (onlySelected ? selected : [...selected, ...all.filter((m) => !inMenus.has(m.id))]).filter((m) => !q || nameOf('menu', m).toLowerCase().includes(q));
    const row = (m) => {
      const on = inMenus.has(m.id);
      const hint = m.id === menu.id ? 'This menu' : plural(m.children.length, 'category', 'categories');
      return `<button type="button" class="store-row store-check" data-action="cat-menu-toggle" data-id="${m.id}" aria-pressed="${on}">
        <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
        <span class="store-name">${esc(nameOf('menu', m))}</span><span class="muted">${esc(hint)}</span></button>`;
    };
    return section(
      'Menus',
      `${
        big
          ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search menus</span><input id="cat-menu-q" type="search" data-cat-menu-search data-focus-key="cat-menu-q" placeholder="Search ${all.length} menus" value="${esc(T.menuQuery)}" autocomplete="off"></label>
            <div class="group-card-tools"><span class="store-summary tnum">In ${selected.length} of ${all.length} menus</span>
              <button type="button" class="check-toggle" role="checkbox" aria-checked="${onlySelected}" data-action="cat-only-selected-menus"><span class="check${onlySelected ? ' is-on' : ''}" aria-hidden="true">${onlySelected ? icon('check', 12) : ''}</span>Show only selected</button></div>`
          : ''
      }
      ${list.length ? `<div class="store-list">${list.map(row).join('')}</div>` : '<p class="field-help">No menus match. Check the spelling.</p>'}`,
      { desc: 'Customers see the category only in the menus you select. Adding it to a menu puts it at the end.' },
    );
  }

  function sizeHintSection(cat, path) {
    const sets = suggestedSizeSets(cat);
    if (!sets.length) return '';
    const names = listJoin(sets.map((s) => `<strong>${esc(containerName(s))}</strong>`));
    return section(
      'Suggestion',
      `${callout('info', `${names} ${sets.length === 1 ? 'is' : 'are'} listed once per size. Group the sizes into one product, so customers choose a size after picking it.`, 'sparkles')}
       <div class="hint-actions">
         <button type="button" class="btn secondary sm" data-action="group-sizes" data-path="${esc(path)}">${icon('sparkles', 14)}Group sizes</button>
         <button type="button" class="btn ghost sm" data-action="dismiss-size-hint" data-path="${esc(path)}">Dismiss suggestion</button>
       </div>`,
    );
  }

  function categoryTab(tab, cat, path) {
    const cb = (f) => `e|category|${cat.id}|${f}`;
    const menu = activeMenu();
    const pl = placement(path);
    if (tab === 'general') {
      return (
        sizeHintSection(cat, path) +
        section(
          '',
          nameBlock('category', cat, { error: lengthError(cat.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
            field('Internal name', inputText(cb('internalName'), cat.internalName, { id: 'c-int' }), {
              id: 'c-int',
              error: lengthError(cat.internalName),
              help: 'Use it to tell apart categories with the same name. Only your team sees it.',
            }) +
            descriptionField(cb('description'), cat.description, 'c-desc'),
        )
      );
    }
    if (tab === 'images') {
      return section(
        '',
        imageField(cb('image'), cat.image, { help: 'Shown on Kiosk, and in apps built with the Ordering API.' }) +
          imageField(cb('bannerImage'), cat.bannerImage, { label: 'Header image', size: '2114 × 288', wide: true, help: 'Shown across the top of the category in the apps.' }),
      );
    }
    if (tab === 'availability') {
      const index = menu.children.indexOf(cat.id);
      const count = menu.children.length;
      const moveBtn = (delta, ic, label) =>
        `<button type="button" class="icon-btn sm" data-action="cat-move" data-path="${esc(path)}" data-delta="${delta}" aria-label="${label}" title="${label}" ${index + delta < 0 || index + delta >= count ? 'disabled' : ''}>${icon(ic, 14)}</button>`;
      return (
        section(
          `In ${menu.name}`,
          toggle(`pl|${path}|hidden`, !pl.hidden, {
            label: `Show in ${menu.name}`,
            scope: crumbText(path),
            help: 'Hide it here without removing it from the menu.',
          }) +
            field('Position', `<div class="position-control"><span class="tnum">${index + 1} of ${count}</span>${moveBtn(-1, 'chevUp', 'Move up')}${moveBtn(1, 'chevDown', 'Move down')}</div>`, {
              scope: crumbText(path),
              help: `Order customers see in ${esc(menu.name)}. You can also drag it on the canvas.`,
            }),
        ) +
        categoryProductsSection(cat, path, menu) +
        categoryMenusSection(cat, menu)
      );
    }
    if (tab === 'stores') {
      return section('', storesList('category', cat, STORE_STATES), { desc: 'Status at each store, in every menu. At disabled stores, customers do not see the category.' });
    }
    const inMenus = menusWithCategory(cat.id);
    return (
      sourceSection('category', cat, path) +
      section(
        'Identifiers',
        field('External ID', inputText(cb('reportingId'), cat.reportingId, { id: 'c-ext', mono: true }), {
          id: 'c-ext',
          error: lengthError(cat.reportingId),
          help: 'Use it to match this category in reports outside this platform.',
        }),
      ) +
      section(
        'Catering',
        toggle(cb('isBundle'), cat.isBundle, { label: 'Catering bundles', help: 'Quantities scale with the number of guests customers choose.' }) +
          (cat.isBundle && !isCateringMenu(menu) ? callout('info', `${esc(menu.name)} has no catering order types, so this has no effect there.`) : ''),
      ) +
      removeSection(path, 'category', cat) +
      section(
        '',
        `<button type="button" class="btn secondary tone-danger" data-action="cat-delete" data-id="${cat.id}">${icon('trash', 15)}Delete category</button>
        <p class="field-help">Removes it from ${inMenus.length > 1 ? `all ${inMenus.length} menus` : esc(menu.name)}. Its products are not deleted${cat.source === 'pos' ? ', and nothing changes on POS' : ''}.</p>`,
      )
    );
  }

  function priceSection(path) {
    const st = priceStats(path);
    if (st.kind === 'none') return '';
    const menu = activeMenu();
    const inGroup = parsePath(parsePath(path).parentPath).kind === 'group';
    const label = { base: 'Customers pay', size: 'Customers pay', modifier: 'Customers pay extra', item: 'Added as its own item', from: 'Customers pay from' }[st.kind];
    const plus = st.kind === 'modifier' || st.kind === 'item';
    const fmt = (v) => (v == null ? 'No price' : v === 0 && st.kind === 'modifier' ? 'Free' : `${plus ? '+' : ''}${money(v)}`);
    const points = [...st.points.entries()].sort((a, b) => b[1] - a[1]);
    const shown = points.slice(0, 3);
    const restStores = points.slice(3).reduce((n, [, c]) => n + c, 0);
    const pointsHtml =
      points.length > 1
        ? `<div class="price-points">${shown
            .map(
              ([v, n]) => `<div class="price-point"><span class="tnum price-point-value">${fmt(v)}</span>
                <span class="price-bar" aria-hidden="true"><span style="width:${Math.max(3, (n / st.total) * 100)}%"></span></span>
                <span class="tnum muted">${plural(n, 'store', 'stores')}</span></div>`,
            )
            .join('')}</div>
          ${restStores ? `<p class="field-help">${plural(points.length - 3, 'other price', 'other prices')} at ${plural(restStores, 'store', 'stores')}.</p>` : ''}`
        : '';
    const missing = st.missingStores;
    const names = missing.slice(0, 12).map((s) => s.name);
    const missingHtml = missing.length
      ? callout(
          missing.length === st.total ? 'error' : 'warning',
          `<strong>No POS price at ${missing.length === st.total ? 'any store' : plural(missing.length, 'store', 'stores')}.</strong> Customers there cannot ${inGroup ? 'choose' : 'order'} it. Add the price on POS, then sync.
          <details class="store-more"><summary>Show stores</summary><p>${esc(names.join(', '))}${missing.length > 12 ? `, and ${missing.length - 12} more` : ''}.</p></details>`,
        )
      : '';
    const check = (s) => {
      const v = priceInfo(path, s).value;
      return `<div class="store-row"><span class="store-name">${icon('store', 15)}${esc(s.name)}</span><span class="store-price tnum${v == null ? ' muted' : ''}">${fmt(v)}</span></div>`;
    };
    return section(
      'Price',
      `<div class="price-hero">
        <span class="price-hero-label">${label}</span>
        <span class="price-hero-value tnum">${esc(priceText(st))}</span>
        <span class="price-hero-src">${icon('lock', 12)}${esc(st.note)}${st.min !== st.max ? '. Varies by store' : ''}</span>
      </div>
      ${pointsHtml}
      ${missingHtml}
      ${field('Check a store', storeSearch('price-store-q', `Search ${st.total} stores`))}
      ${storeResults(matchStores(menuStores(menu)), check)}
      <p class="field-help">Prices come only from POS and can differ by store. To change a price, update it on POS.</p>`,
      { desc: `Across ${storeCountLabel(menu)} in ${esc(menu.name)}.` },
    );
  }

  const productBind = (p) => (f) => `e|product|${p.id}|${f}`;

  const moveButtons = (bind, i, count, label) =>
    `<button type="button" class="icon-btn sm" data-action="arr-move" data-bind="${esc(bind)}" data-index="${i}" data-delta="-1" aria-label="Move ${esc(label)} up" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevUp', 14)}</button>` +
    `<button type="button" class="icon-btn sm" data-action="arr-move" data-bind="${esc(bind)}" data-index="${i}" data-delta="1" aria-label="Move ${esc(label)} down" title="Move down" ${i === count - 1 ? 'disabled' : ''}>${icon('chevDown', 14)}</button>`;

  const removeButton = (bind, i, label) =>
    `<button type="button" class="icon-btn sm" data-action="arr-remove" data-bind="${esc(bind)}" data-index="${i}" aria-label="Remove ${esc(label)}" title="Remove">${icon('x', 14)}</button>`;

  function productList(bind, ids, empty) {
    if (!ids.length) return `<p class="field-help">${esc(empty)}</p>`;
    return `<div class="store-list">${ids
      .map((pid, i) => {
        const x = entity('product', pid);
        if (!x) return '';
        const name = nameOf('product', x);
        return `<div class="store-row list-row">${thumb('product', x, 'thumb-sm')}<span class="store-name">${esc(name)}</span><span class="row-tools">${moveButtons(bind, i, ids.length, name)}${removeButton(bind, i, name)}</span></div>`;
      })
      .join('')}</div>`;
  }

  const addButton = (action, label, attrs = '') => `<button type="button" class="btn ghost sm" data-action="${action}" ${attrs}>${icon('plus', 14)}${esc(label)}</button>`;

  function productOptions(p, { modifierOnly = false } = {}) {
    const out = [];
    p.children.forEach((gid) => {
      const g = entity('group', gid);
      if (!g || (modifierOnly && rulesOf(g).type !== 1)) return;
      g.children.forEach((pid) => {
        const x = entity('product', pid);
        if (x && x.ptype !== 'container') out.push({ gid, pid, g, x, key: `${gid}:${pid}` });
      });
    });
    return out;
  }

  function groupCards(p, opts, prefix, summary, rowFn) {
    const byGroup = new Map();
    opts.forEach((o) => byGroup.set(o.gid, [...(byGroup.get(o.gid) || []), o]));
    return [...byGroup.entries()]
      .map(([gid, list]) => {
        const key = `${prefix}:${gid}`;
        const open = T.openCard === key;
        return `<div class="group-card${open ? ' is-open' : ''}">
          <div class="group-card-head">
            <button type="button" class="group-card-toggle" data-action="card-open" data-id="${esc(key)}" aria-expanded="${open}">
              ${icon('chevRight', 14)}
              <span class="group-card-title"><strong>${esc(nameOf('group', list[0].g))}</strong><span class="muted tnum">${esc(summary(list))}</span></span>
            </button>
          </div>
          ${open ? `<div class="group-card-body">${list.map(rowFn).join('')}</div>` : ''}
        </div>`;
      })
      .join('');
  }

  function quantitySection(p) {
    const pb = productBind(p);
    const hasLimit = isNum(p.minQty) || isNum(p.maxQty);
    const maxErr = qtyError(p.maxQty) || (isNum(p.minQty) && isNum(p.maxQty) && p.maxQty < p.minQty ? 'Maximum needs to be at least the minimum' : '');
    return section(
      'Quantity limits',
      `<div class="grid-2">
        ${field('Minimum', inputNum(pb('minQty'), p.minQty, { int: true, id: 'p-min', min: 1, max: QTY_MAX, placeholder: 'No limit' }), { id: 'p-min', error: qtyError(p.minQty) })}
        ${field('Maximum', inputNum(pb('maxQty'), p.maxQty, { int: true, id: 'p-max', min: 1, max: QTY_MAX, placeholder: 'No limit' }), { id: 'p-max', error: maxErr })}
      </div>
      ${
        hasLimit
          ? field('Limits apply to', segmented(pb('qtyScope'), p.qtyScope, [['cart', 'Per order'], ['item', 'Per cart item']]), {
              help: p.qtyScope === 'item' ? 'Each cart item is counted on its own.' : 'All of this product in the cart counts toward the limit.',
            })
          : ''
      }`,
      { desc: 'Limit how many customers can order.' },
    );
  }

  function modifierCodesSection(p) {
    const pb = productBind(p);
    const enabled = C.modifierCodes.filter(([v]) => p.modifierCodes.includes(v));
    return section(
      'Modifier codes',
      field('Codes', chips(pb('modifierCodes'), p.modifierCodes, C.modifierCodes), {
        help: 'Let customers ask for none, less, more, or on the side when this is an option.',
      }) +
        toggle(pb('isModifierCodeRequired'), p.isModifierCodeRequired, {
          label: 'Require a modifier code',
          help: enabled.length ? 'Customers need a code to choose this option. One code is always preselected.' : 'Add a code first.',
          disabled: !enabled.length,
        }) +
        (enabled.length
          ? field('Preselected code', segmented(pb('preselectedCode'), p.preselectedCode || '', p.isModifierCodeRequired ? enabled : [['', 'None'], ...enabled]), {
              help: 'Selected when customers open the product. They can change it.',
            })
          : ''),
    );
  }

  function sectionsSection(p) {
    if (!p.children.length) return '';
    const pb = productBind(p);
    const rows = p.sections
      .map((s, i) => {
        const err = s.name.trim() ? lengthError(s.name) : 'Add a section name';
        const label = s.name.trim() || 'section';
        return `<div class="segment-row${err ? ' has-error' : ''}">
          <div class="list-inputs">${inputText(pb(`sections.${i}.name`), s.name, { label: 'Section name' })}${moveButtons(pb('sections'), i, p.sections.length, label)}${removeButton(pb('sections'), i, label)}</div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    const opts = p.sections.map((s) => [s.id, s.name.trim() || 'Untitled section']);
    const groups = p.sections.length
      ? field(
          'Groups',
          `<div class="store-list is-wide">${p.children
            .map((gid) => {
              const g = entity('group', gid);
              return g ? `<div class="store-row"><span class="store-name">${esc(nameOf('group', g))}</span>${selectInput(pb(`groupSection.${gid}`), sectionOf(p, gid), opts, { label: `Section for ${nameOf('group', g)}` })}</div>` : '';
            })
            .join('')}</div>`,
        )
      : '';
    return section('Group sections', `${rows ? `<div class="segment-list">${rows}</div>` : ''}${addButton('section-add', 'Add section')}${groups}`, {
      desc: p.sections.length ? 'Customers see the groups under these headings, in this order.' : 'Split the groups under headings, like Base and Toppings.',
    });
  }

  function includedSection(p) {
    if (!p.children.length) return section('Included ingredients', '<p class="field-help">Add a group to this product first. Ingredients come from its groups.</p>');
    const pb = productBind(p);
    const rows = p.included
      .map((it, i) => {
        const g = entity('group', it.gid);
        const x = entity('product', it.pid);
        if (!g || !x) return '';
        const name = nameOf('product', x);
        return `<div class="store-row list-row">
          <span class="store-name list-name"><span>${esc(name)}</span><span class="muted">${esc(nameOf('group', g))}</span></span>
          <span class="row-tools">
            <button type="button" class="icon-btn sm${it.locked ? ' is-on' : ''}" data-toggle="${esc(pb(`included.${i}.locked`))}" aria-pressed="${!!it.locked}" aria-label="Lock ${esc(name)}" title="${it.locked ? 'Locked. Customers cannot remove it.' : 'Customers can remove it. Select to lock.'}">${icon(it.locked ? 'lock' : 'unlock', 14)}</button>
            ${moveButtons(pb('included'), i, p.included.length, name)}${removeButton(pb('included'), i, name)}
          </span>
        </div>`;
      })
      .join('');
    const nameErr = p.includedName.trim() ? lengthError(p.includedName) : 'Add a group name';
    return section(
      'Included ingredients',
      (p.included.length
        ? field('Group name', inputText(pb('includedName'), p.includedName, { id: 'p-inc-name' }), { id: 'p-inc-name', error: nameErr, help: 'Customers see this name above the ingredients.' }) +
          `<div class="store-list">${rows}</div>`
        : '') + addButton('add-included', 'Add ingredient'),
      {
        desc: p.included.length
          ? 'Customers see these together at the top of the product. Locked ones cannot be removed.'
          : 'Ingredients that come with the product, like the patty and bun. Customers see them together at the top of the product.',
      },
    );
  }

  function substitutesSection(p) {
    const opts = productOptions(p);
    if (!opts.length) return section('Substitutes', '<p class="field-help">Add a group with options to this product first.</p>');
    const pb = productBind(p);
    const subsOf = (o) => (p.substitutes[o.key] || []).filter((id) => entity('product', id));
    const cards = groupCards(
      p,
      opts,
      'sub',
      (list) => {
        const n = list.filter((o) => subsOf(o).length).length;
        return n ? `${n} of ${list.length} with substitutes` : plural(list.length, 'option', 'options');
      },
      (o) => {
        const subs = subsOf(o);
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(nameOf('product', o.x))}</span>
          <div class="chips">${subs
            .map((sid) => {
              const n = nameOf('product', entity('product', sid));
              return `<button type="button" class="chip is-on has-remove" data-action="arr-remove" data-bind="${esc(pb(`substitutes.${o.key}`))}" data-index="${subs.indexOf(sid)}" aria-label="Remove ${esc(n)}" title="Remove">${esc(n)}${icon('x', 12)}</button>`;
            })
            .join('')}<button type="button" class="chip" data-action="add-substitute" data-key="${esc(o.key)}">${icon('plus', 12)}Add</button></div>
        </div>`;
      },
    );
    return section('Substitutes', `<div class="opt-cards">${cards}</div>`, { desc: 'Let customers swap an option for another, like fries for a salad.' });
  }

  function halfWholeSection(p) {
    const opts = productOptions(p, { modifierOnly: true });
    if (!opts.length) return section('Half and whole', '<p class="field-help">Add a modifier group, like toppings, to this product first.</p>');
    const pb = productBind(p);
    const seen = new Set();
    const pool = productOptions(p).filter((o) => !seen.has(o.pid) && seen.add(o.pid));
    const cards = groupCards(
      p,
      opts,
      'half',
      (list) => {
        const n = list.filter((o) => (p.halfWhole[o.key] || {}).left && (p.halfWhole[o.key] || {}).right).length;
        return n ? `${n} of ${list.length} with halves` : plural(list.length, 'option', 'options');
      },
      (o) => {
        const h = p.halfWhole[o.key] || {};
        const name = nameOf('product', o.x);
        const choices = [['', 'Not added'], ...pool.filter((c) => c.pid !== o.pid).map((c) => [c.pid, nameOf('product', c.x)])];
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(name)}</span>
          <div class="grid-2">
            ${field('Left half', selectInput(pb(`halfWhole.${o.key}.left`), h.left || '', choices, { label: `Left half of ${name}` }))}
            ${field('Right half', selectInput(pb(`halfWhole.${o.key}.right`), h.right || '', choices, { label: `Right half of ${name}` }))}
          </div>
          ${!h.left !== !h.right ? slotError('Add both halves, or remove both') : ''}
        </div>`;
      },
    );
    return section('Half and whole', `<div class="opt-cards">${cards}</div>`, { desc: 'Let customers put a topping on the left half, the right half, or the whole product.' });
  }

  function upsellSection(p) {
    const pb = productBind(p);
    const titleErr = p.upsell.products.length && !p.upsell.title.trim() ? 'Add a title' : lengthError(p.upsell.title);
    return section(
      'Upsell',
      field('Title', inputText(pb('upsell.title'), p.upsell.title, { id: 'p-upsell-title', placeholder: 'Make it a combo?' }), {
        id: 'p-upsell-title',
        error: titleErr,
        help: 'Customers see it above the products.',
      }) +
        productList(pb('upsell.products'), p.upsell.products, 'No products yet.') +
        addButton('pick-products', 'Add products', `data-bind="${esc(pb('upsell.products'))}" data-title="Add upsell products"`),
      { desc: 'Offer these products, like a combo, after customers add this one.' },
    );
  }

  function crossSellSection(p) {
    const pb = productBind(p);
    return section(
      'Cross-sell',
      productList(pb('crossSell'), p.crossSell, 'No products yet.') + addButton('pick-products', 'Add products', `data-bind="${esc(pb('crossSell'))}" data-title="Add cross-sell products"`),
      { desc: 'Suggest extra products when customers add this one. Applies in every menu.' },
    );
  }

  function linkedGroupsSection(p, path) {
    const allowed = allowedPosGroupsFor(path);
    const missing = allowed.filter((gid) => !p.children.some((c) => posIdOf('group', entity('group', c)) === gid));
    if (!p.posParentExt) return section('Groups', '<p class="field-help">Choose what this custom version rings up as first. Its groups come from that POS product.</p>');
    return section(
      'Groups',
      missing.length
        ? `<p class="field-help">${p.children.length ? `${plural(missing.length, 'group', 'groups')} from ${esc(posLabel(p.posParentExt))} ${missing.length === 1 ? 'is' : 'are'} not added: ${esc(listJoin(missing.map(posLabel)))}.` : `Add the groups of ${esc(posLabel(p.posParentExt))}, or pick only the ones you need with the add button on this product.`}</p>
           <button type="button" class="btn secondary sm" data-action="parent-groups" data-path="${esc(path)}">${icon('plus', 14)}Add all groups</button>`
        : `<p class="field-help">All groups from ${esc(posLabel(p.posParentExt))} are added. Set preselected options in each group.</p>`,
    );
  }

  function productTab(tab, p, path) {
    const pb = productBind(p);
    const info = parsePath(path);
    const parent = parsePath(info.parentPath);
    const parentEnt = entity(parent.kind, parent.id);
    const parentName = nameOf(parent.kind, parentEnt);
    const inGroup = parent.kind === 'group';
    const pl = placement(path);
    const here = crumbText(path);

    if (tab === 'general') {
      let html = section(
        '',
        nameBlock('product', p, { error: lengthError(p.name, 'Add a name') }) +
          (p.ptype === 'linked'
            ? field(
                'Rings up as',
                `<div class="input is-readonly">${esc(p.posParentExt ? `${posLabel(p.posParentExt)} · ${p.posParentExt}` : 'Not chosen yet')}<span class="link-btns"><button type="button" class="link-btn" data-action="change-parent" data-path="${esc(path)}">${p.posParentExt ? 'Change' : 'Choose'}</button>${p.posParentExt ? `<button type="button" class="link-btn" data-action="unlink-parent">Unlink</button>` : ''}</span></div>`,
                {
                  help: p.posParentExt
                    ? 'The POS product this custom version rings up as, at its POS price.'
                    : 'Choose a POS product so customers can order this custom version.',
                  error: p.posParentExt ? '' : 'Choose what it rings up as',
                },
              )
            : '') +
          field('Internal name', inputText(pb('internalName'), p.internalName, { id: 'p-int' }), {
            id: 'p-int',
            error: lengthError(p.internalName),
            help: 'Only your team sees this. Use it to tell apart products with the same name.',
          }) +
          descriptionField(pb('description'), p.description, 'p-desc') +
          imageField(pb('image'), p.image),
      );
      if (p.ptype === 'size') {
        const g = sizeGroupOf(p);
        html += section(
          'Choices',
          g && g.children.length
            ? `<p class="field-help">${esc(listJoin(g.children.map((pid) => nameOf('product', entity('product', pid)))))}. Each choice is a POS product.</p>
               <button type="button" class="btn secondary sm" data-action="copy-to-choices">${icon('copy', 14)}Copy details to choices</button>`
            : '<p class="field-help">No choices yet. Use the add button on this product to add POS products.</p>',
          g && g.children.length ? { desc: 'Copying gives each choice this product’s name, description, and image.' } : {},
        );
      }
      return html + (p.ptype === 'container' ? '' : priceSection(path));
    }

    if (tab === 'ordering') {
      let html = '';
      if (inGroup && p.ptype !== 'container') {
        const auto = isAutoAdded(path);
        const enabled = C.modifierCodes.filter(([v]) => p.modifierCodes.includes(v));
        const pr = rulesOf(parentEnt);
        html += section(
          `In ${parentName}`,
          field('Preselected', stepper(`pl|${path}|preselected`, preselectedAt(path), { max: Math.max(1, pr.maxSingle), label: 'preselected quantity', disabled: auto }), {
            scope: auto ? '' : here,
            pos: auto,
            help: auto ? 'POS adds this option automatically, so it’s always preselected.' : 'Selected by default when customers open the product. They can still change it.',
          }) +
            (enabled.length
              ? field('Modifier codes shown', chips(`pl|${path}|hiddenCodes`, pl.hiddenCodes || [], enabled, { invert: true }), {
                  scope: here,
                  error:
                    p.isModifierCodeRequired && (pl.hiddenCodes || []).length >= enabled.length
                      ? 'A code is required, so keep at least one visible'
                      : '',
                })
              : ''),
        );
      }
      html += quantitySection(p);
      if (p.ptype === 'size') return html;
      if (p.ptype !== 'container') html += modifierCodesSection(p);
      if (p.ptype === 'linked') html += linkedGroupsSection(p, path);
      html += sectionsSection(p);
      if (p.ptype === 'container') return html;
      return html + includedSection(p) + substitutesSection(p) + halfWholeSection(p) + upsellSection(p) + crossSellSection(p);
    }

    if (tab === 'dietary') {
      const q = T.allergenQuery.trim().toLowerCase();
      const allergenOpts = C.allergens.map((a) => [a, allergenLabel(a)]).filter(([, l]) => !q || l.toLowerCase().includes(q));
      const nut = p.nutrition || {};
      const allergens =
        p.ptype === 'container'
          ? ''
          : section(
          'Allergens',
          `<div class="allergen-head">
            <label class="search-field sm">${icon('search', 14)}<span class="sr-only">Filter allergens</span>
              <input id="allergen-filter" type="search" data-focus-key="allergen-filter" placeholder="Filter ${C.allergens.length} allergens" value="${esc(T.allergenQuery)}" autocomplete="off"></label>
            <span class="count tnum">${p.allergens.length} selected</span>
          </div>
          ${allergenOpts.length ? chips(pb('allergens'), p.allergens, allergenOpts) : '<p class="field-help">No allergens match. Check the spelling.</p>'}`,
          { desc: p.allergens.length ? `Contains ${esc(listJoin(p.allergens.map((a) => allergenLabel(a).toLowerCase())))}.` : 'Shown to customers on the product and in the cart.' },
        );
      return (
        section('Food type', segmented(pb('foodType'), p.foodType || '', [['', 'None'], ...C.foodTypes.slice().reverse()]), {
          desc: 'Shown to customers as a badge on the product.',
        }) +
        allergens +
        section(
          'Portion',
          field('Calories', range(pb('caloriesFrom'), p.caloriesFrom, pb('caloriesTo'), p.caloriesTo, 'Cal', 'p-cal'), {
            id: 'p-cal',
            error: rangeError(p.caloriesFrom, p.caloriesTo),
            help: 'Leave the second value empty for a single value.',
          }) +
            field('Serves', range(pb('servingFrom'), p.servingFrom, pb('servingTo'), p.servingTo, 'people', 'p-serv', { min: 1 }), {
              id: 'p-serv',
              error: rangeError(p.servingFrom, p.servingTo, 1),
            }),
        ) +
        section(
          'Alcohol',
          toggle(pb('isAlcoholic'), p.isAlcoholic, { label: 'Contains alcohol', help: 'Customers confirm their age before ordering.' }) +
            (p.isAlcoholic
              ? field('Alcohol by volume', inputNum(pb('alcoholVol'), p.alcoholVol, { suffix: '%', id: 'p-abv', int: true, max: 100 }), {
                  id: 'p-abv',
                  help: 'From 0 to 100%.',
                })
              : ''),
        ) +
        section(
          'Nutrition facts',
          toggle(pb('nutrition.active'), nut.active, { label: 'Nutrition facts', help: 'Show macronutrients per serving.' }) +
            (nut.active
              ? `<div class="grid-2">${[
                  ['protein', 'Protein'],
                  ['carbs', 'Carbohydrates'],
                  ['fat', 'Fat'],
                  ['sugar', 'Sugar'],
                  ['fiber', 'Fiber'],
                ]
                  .map(([k, l]) => field(l, inputNum(pb(`nutrition.${k}`), nut[k], { suffix: 'g', id: `p-n-${k}`, int: true }), { id: `p-n-${k}` }))
                  .join('')}</div>`
              : ''),
        )
      );
    }

    if (tab === 'availability') {
      return (
        section(
          'Visibility',
          toggle(`pl|${path}|hidden`, !pl.hidden, {
            label: `Show in ${parentName}`,
            scope: here,
            help: 'Hide it here without removing it. Other places stay as they are.',
          }),
        ) +
        productAvailabilitySection(p) +
        section('Stores', storesList('product', p, STORE_STATES_PRODUCT, { activeLabel: 'Available', wide: true }), {
          desc: 'Status at each store, in every menu. Hidden products still work as upsells and options. Out of stock indefinitely also hides the product.',
        }) +
        appearsInSection(p, path)
      );
    }

    return (
      sourceSection('product', p, path) +
      section(
        'Identifiers',
        field('External ID', inputText(pb('reportingId'), p.reportingId, { id: 'p-ext', mono: true }), {
          id: 'p-ext',
          error: lengthError(p.reportingId),
          help: 'Use it to match this product in reports outside this platform.',
        }),
      ) +
      segmentsSection(pb('segments'), p.segments, 'product') +
      metadataSection(p) +
      prepSection(p) +
      removeSection(path, 'product', p)
    );
  }

  function productAvailabilitySection(p) {
    const pb = productBind(p);
    const a = p.availability;
    const menu = activeMenu();
    const e = availabilityErrors(a);
    const dt = (f, id, opts = {}) =>
      field(
        opts.label,
        `<input type="datetime-local" id="${id}" class="input tnum" data-bind="${esc(pb(`availability.${f}`))}" data-type="text" data-focus-key="${esc(pb(`availability.${f}`))}" value="${esc(getBind(pb(`availability.${f}`)) || '')}">`,
        { id, error: opts.error || '', help: opts.help || '' },
      );
    let body = toggle(pb('availability.active'), a.active, {
      label: 'Custom availability',
      action: 'avail-toggle',
      help: a.active ? 'Applies in every menu, within each menu’s serving times.' : `Follows ${esc(menu.name)}: ${esc(menuScheduleSummary(menu).replace(/^During/, 'during'))}`,
    });
    if (a.active) {
      body += field(
        'Available as',
        segmented(pb('availability.mode'), a.mode, [
          ['serving', 'Serving times'],
          ['lto', 'Limited-time offer'],
          ['preorder', 'Preorder'],
        ]),
      );
      if (a.mode === 'serving') {
        const problems = a.slots.length ? scheduleProblems(a.slots).filter((t) => !t.startsWith('Choose')) : [e.slots];
        body += scheduleEditor(pb('availability.slots'), a.slots) + problems.map(slotError).join('');
      } else if (a.mode === 'lto') {
        body +=
          dt('lto.from', 'p-lto-from', { label: 'Start', help: a.lto.from ? fmtDateTime(a.lto.from) : 'Required.' }) +
          dt('lto.to', 'p-lto-to', { label: 'End', error: e.ltoTo, help: a.lto.to ? fmtDateTime(a.lto.to) : 'Optional. Leave empty to keep it on sale.' });
      } else {
        const pre = a.preorder;
        body +=
          `<p class="field-label sub-head">Preorders</p>` +
          dt('preorder.from', 'p-pre-from', { label: 'Open', help: pre.from ? fmtDateTime(pre.from) : 'Required.' }) +
          dt('preorder.to', 'p-pre-to', { label: 'Close', error: e.preTo, help: pre.to ? fmtDateTime(pre.to) : 'Optional.' }) +
          `<p class="field-label sub-head">Pickup</p>` +
          dt('preorder.pickupFrom', 'p-pick-from', {
            label: 'From',
            error: pre.pickupFrom ? e.pickFrom : '',
            help: pre.pickupFrom ? fmtDateTime(pre.pickupFrom) : 'Required. At least 24 hours after preorders open.',
          }) +
          dt('preorder.pickupTo', 'p-pick-to', { label: 'Until', error: e.pickTo, help: pre.pickupTo ? fmtDateTime(pre.pickupTo) : 'Optional.' });
      }
    }
    return section('Schedule', body);
  }

  function menuCategoryPlaces() {
    const out = new Map();
    S.data.menus.forEach((m) =>
      m.children.forEach((cid) => {
        const cat = entity('category', cid);
        if (!cat) return;
        const x = out.get(cid) || { kind: 'category', id: cid, ent: cat, path: childPath(m.id, 'category', cid), where: [] };
        x.where.push(m.name);
        out.set(cid, x);
      }),
    );
    return [...out.values()];
  }

  function menuGroupPlaces() {
    const out = new Map();
    S.data.menus.forEach((m) =>
      walkMenu(m, (kind, id, ent, path) => {
        if (kind !== 'group') return;
        const owner = parsePath(parsePath(path).parentPath);
        const ownerName = nameOf(owner.kind, entity(owner.kind, owner.id));
        const x = out.get(id) || { kind: 'group', id, ent, path, where: [] };
        if (!x.where.includes(ownerName)) x.where.push(ownerName);
        out.set(id, x);
      }),
    );
    return [...out.values()];
  }

  function appearsInSection(p, path) {
    const d = dragDescFromPath(path);
    const canHold = (x) => x.ent.children.includes(p.id) || (!(x.kind === 'group' && (isChoiceGroup(x.ent) || reaches('product', p.id, 'group', x.id))) && !dropError(x.path, d));
    const places = [...(p.ptype === 'container' ? [] : menuCategoryPlaces()), ...(p.ptype === 'size' ? [] : menuGroupPlaces())].filter(canHold);
    const on = (x) => x.ent.children.includes(p.id);
    const long = places.length > 6;
    const q = T.placeQuery.trim().toLowerCase();
    const shown = places
      .filter((x) => (!long || !T.showSelectedPlaces || on(x)) && (!long || !q || nameOf(x.kind, x.ent).toLowerCase().includes(q)))
      .sort((a, b) => on(b) - on(a));
    const count = places.filter(on).length;
    const total = [...Object.values(S.data.entities.category), ...Object.values(S.data.entities.group)].filter((x) => x.children.includes(p.id)).length;
    const row = (x) => {
      const sel = on(x);
      const last = sel && total === 1;
      return `<button type="button" class="store-row store-check" data-action="place-toggle" data-kind="${x.kind}" data-id="${esc(x.id)}" aria-pressed="${sel}" ${last ? 'disabled title="A product needs at least one place. To take it out everywhere, remove it on the Advanced tab."' : ''}>
        <span class="check${sel ? ' is-on' : ''}" aria-hidden="true">${sel ? icon('check', 12) : ''}</span>
        <span class="store-name list-name"><span>${esc(nameOf(x.kind, x.ent))}</span><span class="muted">${x.kind === 'category' ? 'Category' : 'Group'} in ${esc(listJoin(x.where))}</span></span></button>`;
    };
    const tools = long
      ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search places</span><input id="place-q" type="search" data-place-search data-focus-key="place-q" placeholder="Search ${places.length} places" value="${esc(T.placeQuery)}" autocomplete="off"></label>
        <div class="group-card-tools"><span class="store-summary tnum">In ${count} of ${places.length} places</span>
          <button type="button" class="check-toggle" role="checkbox" aria-checked="${T.showSelectedPlaces}" data-action="place-only-selected"><span class="check${T.showSelectedPlaces ? ' is-on' : ''}" aria-hidden="true">${T.showSelectedPlaces ? icon('check', 12) : ''}</span>Show only selected</button></div>`
      : '';
    const list = shown.length ? `<div class="store-list">${shown.map(row).join('')}</div>` : '<p class="field-help">Nothing matches. Check the spelling.</p>';
    const kinds = p.ptype === 'container' ? 'groups' : p.ptype === 'size' ? 'categories' : 'categories and groups';
    return section('Appears in', tools + list, {
      desc: `Lists the ${kinds} that can hold this product. Selecting one adds the product at the end.`,
    });
  }

  function metadataSection(p) {
    const pb = productBind(p);
    const base = pb('metadata');
    const all = Object.values(S.data.entities.product).flatMap((x) => x.metadata || []);
    const keys = [...new Set([...C.tags.map((t) => t.key), ...all.map((t) => t.key).filter(Boolean)])];
    const draft = T.tagDraft && T.tagDraft.base === base ? T.tagDraft : null;
    const draftKey = draft ? draft.key.trim() : '';
    const values = [
      ...new Set([
        ...C.tags.filter((t) => t.key.toLowerCase() === draftKey.toLowerCase()).flatMap((t) => t.values),
        ...all.filter((t) => t.key.toLowerCase() === draftKey.toLowerCase() && t.value).map((t) => t.value),
      ]),
    ];
    const rows = p.metadata
      .map((t, i) => {
        const err = !t.key.trim() || !t.value.trim() ? 'Add a key and a value' : lengthError(t.key) || lengthError(t.value);
        return `<div class="segment-row${err ? ' has-error' : ''}">
          <div class="segment-inputs">
            ${inputText(`${base}.${i}.key`, t.key, { label: 'Key', list: 'tag-keys' })}
            ${inputText(`${base}.${i}.value`, t.value, { label: 'Value' })}
            ${removeButton(base, i, `${t.key || 'tag'}`)}
          </div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    const dup = draft && draftKey && draft.value.trim() && p.metadata.some((t) => t.key.trim().toLowerCase() === draftKey.toLowerCase() && t.value.trim().toLowerCase() === draft.value.trim().toLowerCase());
    const form = draft
      ? `<div class="segment-draft${dup ? ' has-error' : ''}">
          <div class="segment-labels"><span class="field-label">Key</span><span class="field-label">Value</span></div>
          <div class="segment-inputs">
            <input type="text" class="input" aria-label="Key" list="tag-keys" data-tag-draft="key" data-focus-key="tag-draft-key" value="${esc(draft.key)}" autocomplete="off">
            <input type="text" class="input" aria-label="Value" list="tag-values" data-tag-draft="value" data-focus-key="tag-draft-value" value="${esc(draft.value)}" autocomplete="off">
            <span aria-hidden="true"></span>
          </div>
          ${dup ? slotError('This tag is already added') : ''}
          <div class="segment-draft-actions">
            <button type="button" class="btn ghost sm" data-action="tag-cancel">Cancel</button>
            <button type="button" class="btn primary sm" data-action="tag-save" ${draftKey && draft.value.trim() && !dup ? '' : 'disabled'}>Add tag</button>
          </div>
        </div>`
      : addButton('tag-add', 'Add tag', `data-bind="${esc(base)}"`);
    return section(
      'Metadata tags',
      `<datalist id="tag-keys">${keys.map((k) => `<option value="${esc(k)}"></option>`).join('')}</datalist>
       <datalist id="tag-values">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>
       ${rows ? `<div class="segment-list">${rows}</div>` : ''}${form}`,
      { desc: p.metadata.length ? 'Integrations read these tags. A Badge tag also shows on the canvas.' : 'Pass extra details to integrations, like a badge or a spice level.' },
    );
  }

  function prepSection(p) {
    const pb = productBind(p);
    const pr = p.prep;
    const e = prepErrors(pr);
    const units = [['', 'Unit'], ...C.prepUnits.map((u) => [u, u])];
    let body = toggle(pb('prep.active'), pr.active, { label: 'Prep info', help: 'Show where and how much to prepare on kitchen prep sheets.' });
    if (pr.active)
      body +=
        field('Prep station', selectInput(pb('prep.station'), pr.station, [['', 'No station'], ...C.prepStations], { id: 'p-prep-st' }), { id: 'p-prep-st' }) +
        field(
          'Quantity',
          `<div class="qty-unit">${inputNum(pb('prep.qty'), pr.qty, { id: 'p-prep-q', placeholder: 'None' })}${selectInput(pb('prep.unit'), pr.unit, units, { label: 'Unit' })}</div>`,
          { id: 'p-prep-q', error: e.qty || e.unit },
        ) +
        field(
          'Second quantity',
          `<div class="qty-unit">${inputNum(pb('prep.qty2'), pr.qty2, { id: 'p-prep-q2', placeholder: 'None', disabled: !isNum(pr.qty) })}${selectInput(pb('prep.unit2'), pr.unit2, units, { label: 'Second unit', disabled: !isNum(pr.qty) })}</div>`,
          { id: 'p-prep-q2', error: e.qty2 || e.unit2, help: isNum(pr.qty) ? 'For example, 2 ea and 8 oz.' : 'Available after you add a quantity.' },
        ) +
        (e.group ? '<p class="field-help">Add a prep station or a quantity.</p>' : '');
    return section('Prep sheets', body);
  }

  function groupTab(tab, g, path) {
    const gb = (f) => `e|group|${g.id}|${f}`;
    const here = crumbText(path);
    const rules = rulesOf(g);
    const fromPos = g.gtype === 'pos';
    if (tab === 'general') {
      const t = C.groupTypes[rules.type];
      return section(
        '',
        nameBlock('group', g) +
          field('Internal name', inputText(gb('internalName'), g.internalName, { id: 'g-int' }), { id: 'g-int', help: 'Only your team sees this.' }) +
          descriptionField(gb('description'), g.description, 'g-desc') +
          field('Type', `<div class="type-display"><span class="type-tag type-${rules.type}">${t.label}</span><span>${esc(t.help)}</span></div>`, {
            help: fromPos || g.gtype === 'linked' ? `${icon('lock', 12)} Set by the POS group.` : `${icon('lock', 12)} Type cannot be changed after the group is created.`,
          }),
      );
    }
    if (tab === 'rules') {
      const max = limitOf(rules.max);
      const mmErr = max != null && rules.min > max ? 'Maximum needs to be at least the minimum' : '';
      const cells = [
        ['Minimum', rules.min, '0 makes the group optional.', 'min', 'g-min', 0],
        ['Maximum', rules.max, 'Empty means no limit.', 'max', 'g-max', 1],
        ['Per option', rules.maxSingle, 'Times the same option can be picked.', 'maxSingle', 'g-single', 1],
        ['Free choices', rules.freeCount, 'Included in the price.', 'freeCount', 'g-free', 0],
      ];
      const grid = fromPos
        ? `<div class="rule-grid">${cells
            .map(([l, v]) => `<div class="rule-cell"><span class="rule-label">${l}</span><span class="rule-value tnum">${isNum(v) && (l !== 'Maximum' || v > 0) ? v : l === 'Maximum' ? 'No limit' : '0'}</span></div>`)
            .join('')}</div>
           <p class="field-help">${icon('lock', 12)} Set on POS. To change these rules, update the group on POS.</p>`
        : `<div class="grid-2">${cells
            .map(([l, v, help, f, id, min]) => field(l, inputNum(gb(f), v, { int: true, id, min }), { id, help, error: f === 'max' ? mmErr : '' }))
            .join('')}</div>${g.gtype === 'linked' ? `<p class="field-help">Started from the rules of ${esc(posLabel(g.posGroupExt))} on POS.</p>` : ''}`;
      return (
        section(
          'Choices',
          `${grid}
          <div class="rule-preview">
            <span class="rule-preview-kicker">${icon('phone', 13)}Customers see</span>
            <strong>${esc(customerRule(rules))}</strong>
            <p>${esc(groupRuleSentence(rules))}</p>
          </div>`,
        ) +
        section(
          'Behavior',
          toggle(gb('isSubstitutionContainer'), g.isSubstitutionContainer, {
            label: 'Substitution group',
            help: 'Customers can swap an included item for one of these options.',
          }),
        )
      );
    }
    if (tab === 'options') {
      const gpos = posIdOf('group', g);
      const notShown = gpos
        ? posChildren(gpos).filter((cid) => posItemById(cid) && !g.children.some((pid) => entity('product', pid).externalId === cid))
        : [];
      const missingHtml = notShown.length
        ? section(
            g.gtype === 'pos' ? 'Removed from this group' : `Other options in ${posLabel(gpos)}`,
            `<div class="missing-list">${notShown
              .map(
                (cid) => `<div class="missing-row"><span class="missing-name">${esc(posLabel(cid))}</span><span class="tnum muted">${esc(rangeText(statsOf((s) => posOptionPrice(gpos, cid, null, s)), { plus: true, freeWord: g.gtype !== 'standalone' }))}</span>
                  <button type="button" class="btn ghost sm" data-action="add-option" data-path="${esc(path)}" data-pos-id="${esc(cid)}">${icon('plus', 14)}Add</button></div>`,
              )
              .join('')}</div>`,
            { desc: 'On POS in this group, but not shown to customers.' },
          )
        : '';
      if (!g.children.length) {
        const hint =
          g.gtype === 'standalone'
            ? 'Drag any POS product here. Each choice is added to the order as its own item, at its POS price.'
            : `Add options from ${esc(posLabel(gpos))}.`;
        return section('', `<div class="empty-small"><strong>No options yet</strong><span>${hint}</span></div>`) + missingHtml;
      }
      const rows = g.children
        .map((pid) => {
          const p = entity('product', pid);
          if (!p) return '';
          const op = childPath(path, 'product', pid);
          const opl = placement(op);
          const auto = isAutoAdded(op);
          return `<div class="opt-row${opl.hidden ? ' is-muted' : ''}">
            <button type="button" class="opt-name" data-action="goto" data-path="${esc(op)}">${thumb('product', p, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label">${esc(nameOf('product', p))}</span>${auto ? '<span class="opt-name-sub">Auto-added by POS</span>' : p.ptype === 'container' ? '<span class="opt-name-sub">Option folder</span>' : ''}</span></button>
            <span class="opt-price tnum${priceStats(op).missingStores.length ? ' tone-warning' : ''}" title="${esc(priceStats(op).missingStores.length ? `No POS price at ${plural(priceStats(op).missingStores.length, 'store', 'stores')}` : priceStats(op).note)}">${p.ptype === 'container' ? '<span class="muted">—</span>' : esc(priceText(priceStats(op)))}</span>
            ${stepper(`pl|${op}|preselected`, preselectedAt(op), { max: Math.max(1, rules.maxSingle), label: `preselected ${nameOf('product', p)}`, disabled: auto || p.ptype === 'container' })}
            <button type="button" class="switch" role="switch" aria-checked="${!opl.hidden}" aria-label="Show ${esc(nameOf('product', p))}" data-toggle="pl|${esc(op)}|hidden" data-focus-key="pl|${esc(op)}|hidden"><span class="switch-thumb"></span></button>
          </div>`;
        })
        .join('');
      return (
        section(
          '',
          `<div class="opt-table">
            <div class="opt-head"><span>Option</span><span>POS price</span><span>Preselected</span><span>Shown</span></div>
            ${rows}
          </div>
          <p class="field-help">${g.gtype === 'standalone' ? 'Each choice is added to the order as its own item.' : 'Prices come from POS.'} Ranges mean the price differs by store. Preselected and shown apply only in ${esc(here)}.</p>`,
        ) + missingHtml
      );
    }
    return (
      sourceSection('group', g, path) +
      section('Stores', storesList('group', g, STORE_STATES), { desc: 'Status at each store. Applies to every menu.' }) +
      removeSection(path, 'group', g)
    );
  }

  /* ---------- preview ---------- */

  function openPreview(path) {
    const sel = {};
    const order = {};
    walkSubtree(path, (kind, id, ent, p) => {
      if (kind !== 'product' || p === path) return;
      const pre = preselectedAt(p);
      if (pre && !placement(p).hidden) {
        const gp = parsePath(p).parentPath;
        sel[gp] = sel[gp] || {};
        sel[gp][p] = pre;
        order[gp] = order[gp] || [];
        order[gp].push(p);
      }
    });
    const prev = T.preview && T.preview.storeId;
    T.preview = { path, sel, order, qty: 1, storeId: prev || S.ui.previewStoreId || menuStores(activeMenu())[0].id };
    if (!menuStores(activeMenu()).some((s) => s.id === T.preview.storeId)) T.preview.storeId = menuStores(activeMenu())[0].id;
    openModal({ title: 'Web App preview', body: '<div id="pv"></div>', size: 'preview', foot: '<div id="pv-foot" class="pv-foot"></div>' });
    renderPreview();
  }

  function pvGroupState(gp, g) {
    const s = T.preview.sel[gp] || {};
    const count = Object.values(s).reduce((a, b) => a + b, 0);
    const r = rulesOf(g);
    return { s, count, min: r.min, max: limitOf(r.max), maxSingle: Math.max(1, r.maxSingle), free: r.freeCount };
  }

  function pvVisibleGroups(productPath) {
    const out = [];
    const rec = (pp) => {
      const p = entity('product', parsePath(pp).id);
      for (const gid of p.children) {
        const g = entity('group', gid);
        const gp = childPath(pp, 'group', gid);
        if (!g || placement(gp).hidden) continue;
        out.push({ gp, g });
        const st = pvGroupState(gp, g);
        Object.keys(st.s).forEach((op) => st.s[op] > 0 && rec(op));
      }
    };
    rec(productPath);
    return out;
  }

  const pvStore = () => storeById.get(T.preview.storeId) || STORES[0];

  function pvTotals() {
    const { path, qty } = T.preview;
    const ent = entity('product', parsePath(path).id);
    const rootPrice = priceInfo(path, pvStore()).value;
    const unavailable = ent.ptype !== 'size' && rootPrice == null;
    let unit = ent.ptype === 'size' ? 0 : rootPrice || 0;
    let firstInvalid = null;
    for (const { gp, g } of pvVisibleGroups(path)) {
      const st = pvGroupState(gp, g);
      if (st.count < st.min && !firstInvalid) firstInvalid = g;
      let free = st.free;
      for (const op of T.preview.order[gp] || []) {
        const n = st.s[op] || 0;
        const price = priceInfo(op, pvStore()).value || 0;
        for (let i = 0; i < n; i++) {
          if (free > 0) free--;
          else unit += price;
        }
      }
    }
    return { unit, total: unit * qty, firstInvalid, unavailable };
  }

  function posTicket() {
    const { path, qty } = T.preview;
    const root = entity('product', parsePath(path).id);
    const lines = [];
    const pending = [];
    const mk = (ent, n) => {
      const posId = posIdOf('product', ent);
      const it = posItemById(posId);
      return { posName: it ? it.name : nameOf('product', ent), posId, qty: n, mods: [] };
    };
    const walk = (pp, line) => {
      const p = entity('product', parsePath(pp).id);
      for (const gid of p.children) {
        const g = entity('group', gid);
        const gp = childPath(pp, 'group', gid);
        if (!g || placement(gp).hidden) continue;
        const sel = T.preview.sel[gp] || {};
        for (const op of T.preview.order[gp] || []) {
          const n = sel[op];
          if (!n) continue;
          const o = entity('product', parsePath(op).id);
          if (o.ptype === 'container') {
            walk(op, line);
            continue;
          }
          if (g.gtype === 'standalone') {
            const nl = mk(o, n * qty);
            lines.push(nl);
            walk(op, nl);
          } else {
            const gpos = posIdOf('group', g);
            const m = { ...mk(o, n), group: gpos ? (posItemById(gpos) || {}).name || gpos : '' };
            if (line) line.mods.push(m);
            else pending.push(m);
            walk(op, m);
          }
        }
      }
    };
    let rootLine = null;
    if (root.ptype !== 'size') {
      rootLine = mk(root, qty);
      lines.push(rootLine);
    }
    walk(path, rootLine);
    if (pending.length && lines.length) lines[0].mods.push(...pending);
    const lineHtml = (l, mod) => `<li class="${mod ? 'ticket-mod' : 'ticket-line'}">
      <span class="ticket-qty tnum">${l.qty}×</span>
      <span class="ticket-name">${esc(l.posName)}<span class="ticket-id mono">${esc(l.posId || '—')}${mod && l.group ? ` · in ${esc(l.group)}` : ''}</span></span>
      ${l.mods.length ? `<ul class="ticket-mods">${l.mods.map((m) => lineHtml(m, true)).join('')}</ul>` : ''}
    </li>`;
    const hasVirtual = root.ptype !== 'pos' || pvVisibleGroups(path).some(({ g }) => isVirtual(g));
    return `<section class="pv-ticket">
      <header class="ticket-head">${icon('receipt', 15)}<strong>Sent to POS</strong><span class="tnum">${plural(lines.length, 'item', 'items')}</span></header>
      ${lines.length ? `<ul class="ticket-lines">${lines.map((l) => lineHtml(l, false)).join('')}</ul>` : '<p class="field-help">Pick a size to see what POS receives.</p>'}
      ${hasVirtual ? '<p class="field-help">Menu-only items are never sent. POS only receives its own items, so pricing and reporting stay correct.</p>' : ''}
    </section>`;
  }

  function pvGroupHtml(gp, g, depth) {
    const st = pvGroupState(gp, g);
    const mode = st.max === 1 && st.maxSingle === 1 ? 'radio' : st.maxSingle > 1 ? 'stepper' : 'check';
    const done = st.count >= st.min;
    const full = st.max != null && st.count >= st.max;
    const opts = g.children
      .map((pid) => ({ pid, ent: entity('product', pid), op: childPath(gp, 'product', pid) }))
      .filter((o) => o.ent && !placement(o.op).hidden);
    const freeLeft = Math.max(0, st.free - st.count);
    const freeUnits = {};
    let freeBudget = st.free;
    for (const op of T.preview.order[gp] || []) {
      const take = Math.min(freeBudget, st.s[op] || 0);
      freeUnits[op] = take;
      freeBudget -= take;
    }
    const rows = opts
      .map((o) => {
        const n = st.s[o.op] || 0;
        const pi = priceInfo(o.op, pvStore());
        const notSold = o.ent.ptype !== 'container' && pi.value == null;
        const price = pi.value || 0;
        const disabled = notSold || (!n && full && mode !== 'radio');
        let optPrice = price ? `${pi.kind === 'size' ? '' : '+'}${money(price)}` : '';
        if (notSold) optPrice = 'Not sold here';
        else if (price && n && freeUnits[o.op] === n) optPrice = `<s>+${money(price)}</s> Free`;
        else if (price && n && freeUnits[o.op]) optPrice = `${freeUnits[o.op]} free, then +${money(price)}`;
        else if (price && !n && freeLeft > 0) optPrice = `<s>+${money(price)}</s> Free`;
        const control =
          mode === 'stepper'
            ? `<div class="stepper">
                <button type="button" class="icon-btn sm" data-action="pv-step" data-gp="${esc(gp)}" data-op="${esc(o.op)}" data-delta="-1" aria-label="Remove one" ${n ? '' : 'disabled'}>${icon('minus', 14)}</button>
                <span class="stepper-value tnum">${n}</span>
                <button type="button" class="icon-btn sm" data-action="pv-step" data-gp="${esc(gp)}" data-op="${esc(o.op)}" data-delta="1" aria-label="Add one" ${n >= st.maxSingle || full ? 'disabled' : ''}>${icon('plus', 14)}</button>
              </div>`
            : `<span class="pv-control pv-${mode}${n ? ' is-on' : ''}">${n && mode === 'check' ? icon('check', 12) : ''}</span>`;
        const nested = n && o.ent.children.length
          ? `<div class="pv-nested">${o.ent.children
              .map((gid) => {
                const ng = entity('group', gid);
                const ngp = childPath(o.op, 'group', gid);
                return ng && !placement(ngp).hidden ? pvGroupHtml(ngp, ng, depth + 1) : '';
              })
              .join('')}</div>`
          : '';
        const tag = mode === 'stepper' ? 'div' : 'button';
        const sub = o.ent.children.length ? (n ? 'Customize below' : 'Has more choices') : '';
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="pv-opt${n ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}" ${mode !== 'stepper' ? `data-action="pv-pick" data-gp="${esc(gp)}" data-op="${esc(o.op)}" data-mode="${mode}"` : ''} ${disabled ? 'aria-disabled="true"' : ''}>
            ${mode !== 'stepper' ? control : ''}
            <span class="pv-opt-name">${esc(nameOf('product', o.ent))}${sub ? `<span class="pv-opt-sub">${sub}</span>` : ''}</span>
            <span class="pv-opt-price tnum">${optPrice}</span>
            ${mode === 'stepper' ? control : ''}
          </${tag}>${nested}`;
      })
      .join('');
    return `<section class="pv-group">
      <header class="pv-group-head">
        <div><h4>${esc(nameOf('group', g))}</h4><span class="pv-rule">${esc(customerRule(rulesOf(g)))}</span></div>
        ${st.min > 0 ? `<span class="pv-status${done ? ' is-done' : ''}">${done ? `${icon('check', 12)}Done` : 'Required'}</span>` : ''}
      </header>
      ${g.description ? `<p class="pv-group-desc">${esc(g.description)}</p>` : ''}
      <div class="pv-opts">${rows || '<p class="field-help">No options to show.</p>'}</div>
    </section>`;
  }

  function renderPreview() {
    const pv = T.preview;
    if (!pv || !$('#pv')) return;
    const ent = entity('product', parsePath(pv.path).id);
    const name = nameOf('product', ent);
    const { total, firstInvalid, unavailable } = pvTotals();
    const store = pvStore();
    const foodType = C.foodTypes.find((x) => x[0] === ent.foodType);
    const diet = foodType ? `<span class="badge tone-ok">${esc(foodType[1])}</span>` : '';
    const groupHtml = (gid) => {
      const g = entity('group', gid);
      const gp = childPath(pv.path, 'group', gid);
      return g && !placement(gp).hidden ? pvGroupHtml(gp, g, 0) : '';
    };
    const groups = ent.sections.length
      ? ent.sections
          .map((s) => {
            const html = ent.children.filter((gid) => sectionOf(ent, gid) === s.id).map(groupHtml).join('');
            return html ? `<h3 class="pv-section-head">${esc(s.name)}</h3>${html}` : '';
          })
          .join('')
      : ent.children.map(groupHtml).join('');
    const included = ent.included
      .map((it) => {
        const x = entity('product', it.pid);
        return x
          ? `<div class="pv-opt is-on"><span class="pv-control pv-check is-on">${icon('check', 12)}</span><span class="pv-opt-name">${esc(nameOf('product', x))}</span><span class="pv-opt-price">${it.locked ? `<span title="Cannot be removed">${icon('lock', 13)}</span>` : ''}</span></div>`
          : '';
      })
      .join('');
    const includedHtml = included
      ? `<section class="pv-group"><header class="pv-group-head"><div><h4>${esc(ent.includedName)}</h4><span class="pv-rule">Included</span></div></header><div class="pv-opts">${included}</div></section>`
      : '';
    const cal = isNum(ent.caloriesFrom) ? `${ent.caloriesFrom}${isNum(ent.caloriesTo) ? `–${ent.caloriesTo}` : ''} Cal` : '';
    const rootPi = priceInfo(pv.path, store);
    const rootPrice = rootPi.value == null ? '' : `${rootPi.kind === 'from' ? 'From ' : ''}${money(rootPi.value)}`;
    const scroller = $('#pv').closest('.modal-scroll');
    const top = scroller ? scroller.scrollTop : 0;
    $('#pv').innerHTML = `
      <div class="pv-store">
        <label for="pv-store">${icon('store', 14)}Prices at</label>
        <input id="pv-store" class="input" list="pv-store-list" value="${esc(store.name)}" autocomplete="off" spellcheck="false" aria-describedby="pv-store-help">
        <datalist id="pv-store-list">${menuStores(activeMenu()).map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist>
        <span id="pv-store-help" class="sr-only">Pick a store to see its POS prices</span>
      </div>
      <div class="pv-hero">${ent.image ? `<img src="${ent.image}" alt="">` : `<span class="pv-hero-art" style="--h:${hashHue(name)}">${esc(initials(name))}</span>`}</div>
      <div class="pv-intro">
        <h3>${esc(name)}</h3>
        <div class="pv-meta tnum">${esc(rootPrice)}${cal ? `${rootPrice ? ' · ' : ''}${cal}` : ''}${ent.isAlcoholic && isNum(ent.alcoholVol) ? ` · ${ent.alcoholVol}% ABV` : ''}</div>
        ${unavailable ? callout('warning', `Not sold at ${esc(store.name)}. There’s no POS price for it at this store.`) : ''}
        ${ent.description ? `<p>${esc(ent.description)}</p>` : ''}
        ${diet ? `<div class="pv-badges">${diet}</div>` : ''}
        ${ent.allergens.length ? `<p class="pv-allergens">Contains ${esc(listJoin(ent.allergens.map((a) => allergenLabel(a).toLowerCase())))}</p>` : ''}
      </div>
      ${includedHtml}
      ${groups}
      ${posTicket()}`;
    if (scroller) scroller.scrollTop = top;
    $('#pv-foot').innerHTML = `
      <div class="stepper stepper-lg">
        <button type="button" class="icon-btn" data-action="pv-qty" data-delta="-1" aria-label="Decrease quantity" ${pv.qty <= 1 ? 'disabled' : ''}>${icon('minus', 16)}</button>
        <span class="stepper-value tnum">${pv.qty}</span>
        <button type="button" class="icon-btn" data-action="pv-qty" data-delta="1" aria-label="Increase quantity" ${isNum(ent.maxQty) && pv.qty >= ent.maxQty ? 'disabled' : ''}>${icon('plus', 16)}</button>
      </div>
      <div class="pv-cta">
        ${unavailable ? `<span class="pv-hint">Not sold at ${esc(store.name)}</span>` : firstInvalid ? `<span class="pv-hint">Make a selection in ${esc(nameOf('group', firstInvalid))}</span>` : ''}
        <button type="button" class="btn primary lg" data-action="pv-add" ${unavailable ? 'disabled' : firstInvalid ? 'aria-disabled="true"' : ''}>Add to order${unavailable ? '' : `<span class="tnum">${money(total)}</span>`}</button>
      </div>`;
  }

  function pvPick(gp, op, mode) {
    const pv = T.preview;
    const g = entity('group', parsePath(gp).id);
    const st = pvGroupState(gp, g);
    pv.sel[gp] = pv.sel[gp] || {};
    pv.order[gp] = pv.order[gp] || [];
    if (mode === 'radio') {
      if (st.s[op]) {
        if (st.min === 0) {
          pv.sel[gp] = {};
          pv.order[gp] = [];
        }
      } else {
        pv.sel[gp] = { [op]: 1 };
        pv.order[gp] = [op];
      }
    } else if (st.s[op]) {
      delete pv.sel[gp][op];
      pv.order[gp] = pv.order[gp].filter((x) => x !== op);
    } else if (st.max == null || st.count < st.max) {
      pv.sel[gp][op] = 1;
      pv.order[gp].push(op);
    }
    renderPreview();
  }

  function pvStep(gp, op, delta) {
    const pv = T.preview;
    const g = entity('group', parsePath(gp).id);
    const st = pvGroupState(gp, g);
    const cur = st.s[op] || 0;
    const next = clamp(cur + delta, 0, st.maxSingle);
    if (delta > 0 && st.max != null && st.count >= st.max) return;
    pv.sel[gp] = pv.sel[gp] || {};
    pv.order[gp] = pv.order[gp] || [];
    if (next === 0) {
      delete pv.sel[gp][op];
      pv.order[gp] = pv.order[gp].filter((x) => x !== op);
    } else {
      pv.sel[gp][op] = next;
      if (!pv.order[gp].includes(op)) pv.order[gp].push(op);
    }
    renderPreview();
  }

  /* ---------- overlays ---------- */

  function openPopover(anchor, items, { align = 'end', className = '' } = {}) {
    closePopover();
    const el = document.createElement('div');
    el.className = `popover ${className}`;
    el.setAttribute('role', 'menu');
    el.innerHTML = items
      .map((it, i) => {
        if (it === '-') return '<div class="pop-sep" role="separator"></div>';
        if (it.heading) return `<div class="pop-heading">${esc(it.heading)}</div>`;
        if (it.empty) return `<div class="pop-empty">${it.empty}</div>`;
        return `<button type="button" role="menuitem" class="pop-item${it.tone ? ` tone-${it.tone}` : ''}" data-pop="${i}" ${it.disabled ? 'disabled' : ''}>
            ${it.icon ? icon(it.icon, 15) : ''}<span class="pop-label">${esc(it.label)}${it.hint ? `<span class="pop-hint">${esc(it.hint)}</span>` : ''}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.submenu ? icon('chevRight', 14) : ''}
          </button>`;
      })
      .join('');
    $('#popover-root').appendChild(el);
    const r = anchor.getBoundingClientRect();
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    let left = align === 'end' ? r.right - pw : r.left;
    left = clamp(left, 8, window.innerWidth - pw - 8);
    let top = r.bottom + 6;
    let originY = 'top';
    if (top + ph > window.innerHeight - 8) {
      top = Math.max(8, r.top - ph - 6);
      originY = 'bottom';
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transformOrigin = `${align === 'end' ? 'right' : 'left'} ${originY}`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pop]');
      if (!b) return;
      const it = items[Number(b.dataset.pop)];
      closePopover();
      it.onClick && it.onClick();
    });
    anchor.setAttribute('aria-expanded', 'true');
    T.popover = { el, anchor };
    requestAnimationFrame(() => (el.dataset.open = 'true'));
    const first = el.querySelector('.pop-item:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }

  function closePopover() {
    if (!T.popover) return;
    const { el, anchor } = T.popover;
    T.popover = null;
    if (anchor && anchor.isConnected) anchor.setAttribute('aria-expanded', 'false');
    el.dataset.open = 'false';
    el.dataset.closing = 'true';
    setTimeout(() => el.remove(), 120);
  }

  function openModal({ title, body, actions = [], size = 'md', foot = '' }) {
    closeModal(true);
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-modal-close></div>
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Close">${icon('x', 16)}</button></div>
        <div class="modal-scroll"><div class="modal-body">${body}</div></div>
        ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.kind || 'secondary'}" data-modal-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : foot}
      </div>`;
    T.modal = { actions, prevFocus: document.activeElement };
    root.dataset.state = 'mounted';
    requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.state = 'open')));
    const primary = root.querySelector('.modal-foot .btn.primary, .modal-foot .btn.danger') || root.querySelector('.modal [data-modal-close]');
    if (primary) primary.focus({ preventScroll: true });
  }

  function closeModal(immediate = false) {
    const root = $('#modal-root');
    if (!T.modal) return;
    const prev = T.modal.prevFocus;
    T.modal = null;
    T.preview = null;
    T.picker = null;
    T.cmp = null;
    T.opt = null;
    if (immediate === true) {
      root.innerHTML = '';
      delete root.dataset.state;
      return;
    }
    root.dataset.state = 'closing';
    setTimeout(() => {
      if (!T.modal && root.dataset.state === 'closing') {
        root.innerHTML = '';
        delete root.dataset.state;
      }
    }, 160);
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  }

  function openPicker({ title, intro, placeholder, items, onPick, empty = '', keepOpen = false, noMatch = ['No matching POS items', 'Try a different name or POS ID.'] }) {
    openModal({
      title,
      body: `${intro ? `<p>${esc(intro)}</p>` : ''}
        <label class="search-field">${icon('search', 15)}<span class="sr-only">${esc(placeholder)}</span>
          <input id="picker-search" type="search" placeholder="${esc(placeholder)}" autocomplete="off"></label>
        <div class="picker-list" id="picker-list" role="listbox"></div>`,
      actions: keepOpen ? [{ label: 'Close', kind: 'secondary', onClick: () => closeModal() }] : [],
    });
    T.picker = { items, onPick, query: '', empty, noMatch };
    renderPicker();
    const input = $('#picker-search');
    if (input) input.focus();
  }

  function renderPicker() {
    if (!T.picker || !$('#picker-list')) return;
    const q = T.picker.query.trim().toLowerCase();
    const list = T.picker.items.filter((it) => !q || [it.name, it.alt, it.id].some((s) => (s || '').toLowerCase().includes(q)));
    $('#picker-list').innerHTML = list.length
      ? list
          .map(
            (it) => `<button type="button" class="picker-row" role="option" data-action="pick" data-id="${esc(it.id)}">
              <span class="thumb thumb-initials thumb-sm">${esc(initials(it.name))}</span>
              <span class="picker-main"><span class="picker-name">${esc(it.name)}</span><span class="picker-meta">${esc(it.meta)}</span></span>
              <span class="picker-price tnum">${esc(it.price)}</span></button>`,
          )
          .join('')
      : !T.picker.items.length && T.picker.empty
        ? `<div class="empty-small">${icon('checkCircle', 18)}<strong>${esc(T.picker.empty)}</strong></div>`
        : `<div class="empty-small"><strong>${esc(T.picker.noMatch[0])}</strong><span>${esc(T.picker.noMatch[1])}</span></div>`;
  }

  function toast(msg, tone = 'success', { action } = {}) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast tone-${tone}`;
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(tone === 'error' ? 'alertCircle' : tone === 'info' ? 'info' : 'checkCircle', 16)}<span class="toast-msg">${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}`;
    root.appendChild(el);
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      el.dataset.state = 'closing';
      setTimeout(() => el.remove(), 180);
    };
    if (action) el.querySelector('.toast-action').addEventListener('click', () => { action.onClick(); dismiss(); });
    requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = 'open')));
    timer = setTimeout(dismiss, action ? 6000 : tone === 'error' ? 5000 : 3200);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => (timer = setTimeout(dismiss, 1600)));
    const all = root.querySelectorAll('.toast:not([data-state="closing"])');
    if (all.length > 3) all[0].remove();
  }

  function openIssues(anchor) {
    if (!anchor) return;
    const list = ctx.issues.list;
    const items = list.length
      ? [{ heading: `${plural(ctx.issues.errors, 'error', 'errors')} · ${plural(ctx.issues.warnings, 'warning', 'warnings')}` }].concat(
          list.map((i) => ({
            label: i.text,
            hint: i.path.includes('>') ? crumbText(parsePath(i.path).parentPath) : 'Menu settings',
            icon: i.level === 'error' ? 'alertCircle' : 'alert',
            tone: i.level,
            onClick: () => {
              expandTo(i.path);
              const info = parsePath(i.path);
              if (i.tab) S.ui.tabs[info.kind] = i.tab;
              else if (info.kind === 'menu') S.ui.tabs.menu = /order type|channel/.test(i.text) ? 'ordering' : /store/.test(i.text) ? 'stores' : /time slot|segment/.test(i.text) ? 'availability' : 'general';
              if (info.kind === 'category')
                S.ui.tabs.category = /products/.test(i.text) ? 'availability' : /external ID|on POS/.test(i.text) ? 'advanced' : /name|description/.test(i.text) ? 'general' : S.ui.tabs.category;
              select(i.path, { focusRow: info.kind !== 'menu' });
            },
          })),
        )
      : [{ empty: `${icon('checkCircle', 18)}<strong>No issues</strong><span>${esc(activeMenu().name)} is ready to publish.</span>` }];
    openPopover(anchor, items, { className: 'popover-issues' });
  }

  function linkedGroupMenu(anchor, productPath) {
    const allowed = allowedPosGroupsFor(productPath).filter((gid) => posItemById(gid));
    const p = entity('product', parsePath(productPath).id);
    openPopover(
      anchor,
      allowed.length
        ? [{ heading: 'Pick a POS group' }].concat(
            allowed.map((gid) => ({
              label: posLabel(gid),
              hint: `${C.groupTypes[posItemById(gid).groupType || 1].label} · ${plural(posChildren(gid).length, 'option', 'options')}`,
              icon: 'layers',
              onClick: () => createVirtualGroup(productPath, 'linked', gid),
            })),
          )
        : [{ empty: `<strong>No POS groups</strong><span>${esc(nameOf('product', p))} has no groups on POS. Create an add-on group instead.</span>` }],
    );
  }

  function rowMenu(anchor, path, which) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const pInfo = parsePath(info.parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    if (which === 'add') {
      const customVersion = {
        label: 'Custom version',
        hint: 'A POS product with its own name and image. Rings up as the original',
        icon: 'link',
        onClick: () => openLinkedProductPicker(path),
      };
      if (info.kind === 'category') {
        const items = [
          { heading: 'Add from POS' },
          {
            label: 'POS product',
            hint: isVirtual(ent) ? 'Any product from POS' : `From ${posLabel(ent.externalId)} on POS`,
            icon: 'utensils',
            onClick: () => openPosProductPicker(path),
          },
          { heading: 'Create' },
          customVersion,
          { label: 'Choice product', hint: 'Customers pick one product, like Small or Large', icon: 'package', onClick: () => createChoiceProduct(path) },
        ];
        if (detectSizeSets(ent).length) items.push('-', { label: 'Group sizes', hint: 'Turn size variants into one choice product', icon: 'sparkles', onClick: () => openOptimize(path) });
        return openPopover(anchor, items);
      }
      if (info.kind === 'product' && ent.ptype === 'size') {
        const g = sizeGroupOf(ent);
        if (g) return openPosProductPicker(childPath(path, 'group', g.id));
      }
      if (info.kind === 'product') {
        const items = [
          { heading: 'Add from POS' },
          { label: 'POS group', hint: 'All its options, as on POS', icon: 'layers', submenu: true, onClick: () => posGroupMenu(anchor, path) },
        ];
        if (ent.ptype === 'linked') items.push({ label: 'All POS groups', hint: `Every group of ${posLabel(ent.posParentExt)}`, icon: 'plus', onClick: () => addParentGroups(path) });
        items.push(
          { heading: 'Create' },
          {
            label: 'Custom version of a POS group',
            hint: 'Show only some of its options. Rings up in that group',
            icon: 'link',
            submenu: true,
            onClick: () => linkedGroupMenu(anchor, path),
          },
          { label: 'Add-on group', hint: 'Suggest extra products. Each is added as its own item', icon: 'dashed', onClick: () => createVirtualGroup(path, 'upsell') },
        );
        return openPopover(anchor, items);
      }
      if (ent.gtype === 'standalone') {
        return openPopover(anchor, [
          { heading: 'Add from POS' },
          { label: 'POS product', hint: 'Keeps its own POS price', icon: 'utensils', onClick: () => openPosProductPicker(path) },
          { heading: 'Create' },
          customVersion,
        ]);
      }
      return openPopover(anchor, [
        { heading: 'Add from POS' },
        { label: 'POS option', hint: `From ${posLabel(posIdOf('group', ent))} on POS`, icon: 'utensils', onClick: () => openPosProductPicker(path) },
        { heading: 'Create' },
        {
          label: 'Option folder',
          hint: 'An option that opens more choices. Never sent to POS',
          icon: 'dashed',
          onClick: () => createVirtualContainer(path),
        },
      ]);
    }
    const items = [];
    if (info.kind === 'product' && ent.ptype !== 'container') items.push({ label: 'Preview', icon: 'phone', onClick: () => openPreview(path) });
    if (info.kind === 'category' && detectSizeSets(ent).length) items.push({ label: 'Group sizes', icon: 'sparkles', onClick: () => openOptimize(path) });
    if (info.kind === 'category' && suggestedSizeSets(ent).length) items.push({ label: 'Dismiss suggestion', icon: 'x', onClick: () => dismissSizeHint(path) });
    if (ent.children.length)
      items.push({
        label: 'Expand all inside',
        icon: 'expand',
        onClick: () => {
          walkSubtree(path, (k, id, e, p) => (S.ui.expanded[p] = true));
          render();
        },
      });
    if (items.length) items.push('-');
    items.push({ label: `Remove from ${parentName}`, icon: 'trash', tone: 'danger', kbd: '⌫', onClick: () => confirmRemove(path) });
    openPopover(anchor, items);
  }

  function appMenu(anchor) {
    openPopover(anchor, [
      { label: 'Export menu as JSON', icon: 'download', onClick: exportMenu },
      '-',
      {
        label: 'Reset demo data',
        icon: 'reset',
        tone: 'danger',
        onClick: () =>
          openModal({
            title: 'Reset demo data?',
            body: '<p>All menus, settings, and POS changes go back to the starting example. This cannot be undone.</p>',
            actions: [
              { label: 'Cancel', kind: 'secondary', onClick: closeModal },
              {
                label: 'Reset data',
                kind: 'danger',
                onClick: () => {
                  closeModal();
                  localStorage.removeItem(STORAGE_KEY);
                  seed();
                  S.ui = defaultUi();
                  hist.past = [];
                  hist.future = [];
                  render();
                  toast('Demo data reset');
                },
              },
            ],
          }),
      },
    ]);
  }

  /* ---------- images ---------- */

  function readImage(file, bind) {
    if (!file || !IMAGE_TYPES.includes(file.type)) {
      toast('Could not add the image. Use a JPG, PNG, or GIF file.', 'error');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast('Could not add the image. Choose a file of 1 MB or less.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (/\|bannerImage$/.test(bind) ? 1200 : 480) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        commit(() => setBind(bind, c.toDataURL('image/jpeg', 0.82)));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- events ---------- */

  function handleAction(el, e) {
    const a = el.dataset.action;
    const path = el.dataset.path;
    switch (a) {
      case 'switch-menu':
        S.ui.activeMenuId = el.dataset.id;
        S.ui.selected = el.dataset.id;
        S.ui.canvasQuery = '';
        render();
        break;
      case 'new-menu':
        commit(() => {
          const m = newMenu();
          S.data.menus.push(m);
          S.ui.activeMenuId = m.id;
          S.ui.selected = m.id;
          S.ui.tabs.menu = 'general';
          T.focusName = true;
        });
        break;
      case 'delete-menu': {
        const m = menuById(el.dataset.id);
        openModal({
          title: `Delete ${m.name}?`,
          body: '<p>The menu is deleted. Its categories and products stay in your library, and nothing changes on POS.</p>',
          actions: [
            { label: 'Cancel', kind: 'secondary', onClick: closeModal },
            {
              label: 'Delete menu',
              kind: 'danger',
              onClick: () => {
                closeModal();
                commit(() => {
                  S.data.menus = S.data.menus.filter((x) => x.id !== m.id);
                  S.ui.activeMenuId = S.data.menus[0].id;
                  S.ui.selected = S.data.menus[0].id;
                });
                toast('Menu deleted');
              },
            },
          ],
        });
        break;
      }
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'issues':
        if (T.popover && T.popover.anchor === el) closePopover();
        else openIssues(el);
        break;
      case 'app-more':
        if (T.popover && T.popover.anchor === el) closePopover();
        else appMenu(el);
        break;
      case 'publish':
        publish();
        break;
      case 'sync-pos':
        syncPos();
        break;
      case 'pos-menu':
        S.ui.posMenuId = el.dataset.id;
        renderPos();
        schedulePersist();
        break;
      case 'pos-toggle':
        e.stopPropagation();
        togglePosRow(el.closest('.pos-row'));
        break;
      case 'select-menu':
        select(activeMenu().id);
        break;
      case 'expand-all':
        walkMenu(activeMenu(), (k, id, ent, p) => (S.ui.expanded[p] = true));
        render();
        break;
      case 'collapse-all':
        walkMenu(activeMenu(), (k, id, ent, p) => (S.ui.expanded[p] = false));
        render();
        break;
      case 'create-category':
        createVirtualCategory();
        break;
      case 'add-category':
        if (T.popover && T.popover.anchor === el) closePopover();
        else addCategoryMenu(el);
        break;
      case 'add-pos-category':
        openPosCategoryPicker();
        break;
      case 'pos-add': {
        e.stopPropagation();
        const posRow = el.closest('.pos-row');
        performDrop(
          posDesc(posRow.dataset.posId, {
            kind: posRow.dataset.kind,
            name: posRow.dataset.name,
            chainCat: posRow.dataset.chainCat || null,
            posPath: posRow.dataset.posPath ? posRow.dataset.posPath.split('/') : [],
          }),
          { auto: true },
        );
        break;
      }
      case 'compare':
        openCompare();
        break;
      case 'optimize':
        openOptimize();
        break;
      case 'toggle': {
        const info = parsePath(path);
        S.ui.expanded[path] = !isExpanded(path, info.depth);
        render();
        break;
      }
      case 'add':
      case 'more':
        if (T.popover && T.popover.anchor === el) closePopover();
        else rowMenu(el, path, a);
        break;
      case 'goto':
        expandTo(path);
        select(path, { focusRow: false });
        break;
      case 'tab':
        S.ui.tabs[el.dataset.kind] = el.dataset.tab;
        render();
        break;
      case 'preview':
        openPreview(path);
        break;
      case 'group-sizes':
        e.stopPropagation();
        openOptimize(path);
        break;
      case 'dismiss-size-hint':
        dismissSizeHint(path);
        break;
      case 'remove':
        confirmRemove(path);
        break;
      case 'change-parent':
        changePosParent(path);
        break;
      case 'parent-groups':
        addParentGroups(path);
        break;
      case 'add-option':
        addPosOption(path, el.dataset.posId);
        break;
      case 'pick':
        if (T.picker) T.picker.onPick(el.dataset.id);
        break;
      case 'step': {
        const bind = el.dataset.bind;
        const next = clamp((getBind(bind) || 0) + Number(el.dataset.delta), Number(el.dataset.min), Number(el.dataset.max));
        commit(() => setBind(bind, next || null), { key: bind });
        break;
      }
      case 'sched-add':
        commit(() => {
          const list = getBind(el.dataset.bind) || [];
          setBind(el.dataset.bind, [...list, newSlot(list)]);
        });
        break;
      case 'sched-remove':
        commit(() => {
          const list = (getBind(el.dataset.bind) || []).slice();
          list.splice(Number(el.dataset.index), 1);
          setBind(el.dataset.bind, list);
        });
        break;
      case 'menu-group-add': {
        const m = activeMenu();
        const free = C.menuStoreGroups.filter((g) => !m.storeGroups.some((a) => a.id === g.id));
        openPopover(
          el,
          free.map((g) => ({
            label: g.name,
            hint: plural(groupStores(g.id).length, 'store', 'stores'),
            icon: 'store',
            onClick: () => commit(() => m.storeGroups.push({ id: g.id, storeIds: null, newStores: true })),
          })),
        );
        break;
      }
      case 'menu-group-remove': {
        const m = activeMenu();
        if (T.openStoreGroup === el.dataset.id) T.openStoreGroup = null;
        commit(() => (m.storeGroups = m.storeGroups.filter((a) => a.id !== el.dataset.id)));
        break;
      }
      case 'menu-group-open':
        T.openStoreGroup = T.openStoreGroup === el.dataset.id ? null : el.dataset.id;
        T.storeQuery = '';
        T.showSelectedStores = false;
        render();
        break;
      case 'menu-group-only-selected':
        T.showSelectedStores = !T.showSelectedStores;
        render();
        break;
      case 'menu-group-store':
      case 'menu-group-bulk': {
        const m = activeMenu();
        const grp = m.storeGroups.find((x) => x.id === el.dataset.group);
        if (!grp) break;
        const all = groupStores(grp.id);
        commit(() => {
          const set = new Set(assignedStores(grp).map((s) => s.id));
          if (a === 'menu-group-store') {
            set.has(el.dataset.id) ? set.delete(el.dataset.id) : set.add(el.dataset.id);
          } else {
            const scope = T.storeQuery.trim() ? matchStores(all) : all;
            scope.forEach((s) => (el.dataset.on === '1' ? set.add(s.id) : set.delete(s.id)));
          }
          grp.storeIds = set.size === all.length ? null : all.filter((s) => set.has(s.id)).map((s) => s.id);
        });
        break;
      }
      case 'segment-add': {
        T.segmentDraft = { base: el.dataset.bind, segmentId: '', tag: '' };
        render();
        const input = document.querySelector('[data-segment-draft="segmentId"]');
        if (input) input.focus();
        break;
      }
      case 'segment-cancel':
        T.segmentDraft = null;
        render();
        break;
      case 'segment-save': {
        const draft = T.segmentDraft;
        if (!draft || !draft.segmentId.trim()) break;
        T.segmentDraft = null;
        commit(() => setBind(draft.base, [...(getBind(draft.base) || []), { segmentId: draft.segmentId.trim(), tag: draft.tag.trim() }]));
        toast('Segment added');
        break;
      }
      case 'tag-add': {
        T.tagDraft = { base: el.dataset.bind, key: '', value: '' };
        render();
        const input = document.querySelector('[data-tag-draft="key"]');
        if (input) input.focus();
        break;
      }
      case 'tag-cancel':
        T.tagDraft = null;
        render();
        break;
      case 'tag-save': {
        const draft = T.tagDraft;
        if (!draft || !draft.key.trim() || !draft.value.trim()) break;
        T.tagDraft = null;
        commit(() => setBind(draft.base, [...(getBind(draft.base) || []), { key: draft.key.trim(), value: draft.value.trim() }]));
        toast('Tag added');
        break;
      }
      case 'arr-move': {
        const list = (getBind(el.dataset.bind) || []).slice();
        const from = Number(el.dataset.index);
        const to = from + Number(el.dataset.delta);
        if (to < 0 || to >= list.length) break;
        list.splice(to, 0, list.splice(from, 1)[0]);
        commit(() => setBind(el.dataset.bind, list));
        requestAnimationFrame(() => {
          const at = `[data-action="arr-move"][data-bind="${CSS.escape(el.dataset.bind)}"][data-index="${to}"]`;
          const btn = document.querySelector(`${at}[data-delta="${el.dataset.delta}"]:not(:disabled)`) || document.querySelector(`${at}:not(:disabled)`);
          if (!btn) return;
          btn.focus({ preventScroll: true });
          const row = btn.closest('.list-row, .segment-row');
          if (row) row.classList.add('is-flash');
        });
        break;
      }
      case 'arr-remove':
        commit(() => {
          const list = (getBind(el.dataset.bind) || []).slice();
          list.splice(Number(el.dataset.index), 1);
          setBind(el.dataset.bind, list);
        });
        break;
      case 'card-open':
        T.openCard = T.openCard === el.dataset.id ? null : el.dataset.id;
        render();
        break;
      case 'avail-toggle': {
        const p = entity('product', parsePath(S.ui.selected).id);
        commit(() => {
          const av = p.availability;
          av.active = !av.active;
          if (av.active && av.mode === 'serving' && !av.slots.length) {
            const base = activeMenu().schedule;
            av.slots = base.length ? JSON.parse(JSON.stringify(base)) : [newSlot([])];
          }
        });
        break;
      }
      case 'unlink-parent': {
        const p = entity('product', parsePath(S.ui.selected).id);
        const was = posLabel(p.posParentExt);
        commit(() => (p.posParentExt = null));
        toast(`Unlinked from ${was}. Customers cannot order it until you choose what it rings up as.`, 'success', { action: { label: 'Undo', onClick: undo } });
        break;
      }
      case 'copy-to-choices':
        confirmCopyToChoices(entity('product', parsePath(S.ui.selected).id));
        break;
      case 'pick-products':
        openProductListPicker(entity('product', parsePath(S.ui.selected).id), el.dataset.bind, el.dataset.title);
        break;
      case 'add-included':
        openIncludedPicker(entity('product', parsePath(S.ui.selected).id));
        break;
      case 'add-substitute':
        openSubstitutePicker(entity('product', parsePath(S.ui.selected).id), el.dataset.key);
        break;
      case 'section-add': {
        const p = entity('product', parsePath(S.ui.selected).id);
        commit(() => p.sections.push({ id: uid('sec'), name: `Section ${p.sections.length + 1}` }));
        requestAnimationFrame(() => {
          const inputs = document.querySelectorAll(`[data-bind^="e|product|${p.id}|sections."][data-bind$=".name"]`);
          const last = inputs[inputs.length - 1];
          if (last) last.select();
        });
        break;
      }
      case 'place-only-selected':
        T.showSelectedPlaces = !T.showSelectedPlaces;
        render();
        break;
      case 'place-toggle':
        toggleProductPlace(entity('product', parsePath(S.ui.selected).id), el.dataset.kind, el.dataset.id);
        break;
      case 'menu-sched-mode': {
        const m = activeMenu();
        const custom = el.dataset.mode === 'custom';
        if (custom === m.schedule.length > 0) break;
        commit(() => (m.schedule = custom ? [newSlot([])] : []));
        break;
      }
      case 'segment-remove':
        commit(() => {
          const list = (getBind(el.dataset.bind) || []).slice();
          list.splice(Number(el.dataset.index), 1);
          setBind(el.dataset.bind, list);
        });
        break;
      case 'cat-move': {
        const info = parsePath(path);
        const m = menuById(info.menuId);
        const from = m.children.indexOf(info.id);
        const to = from + Number(el.dataset.delta);
        if (from < 0 || to < 0 || to >= m.children.length) break;
        commit(() => {
          m.children.splice(from, 1);
          m.children.splice(to, 0, info.id);
        });
        break;
      }
      case 'cat-only-hidden':
        T.catOnlyHidden = !T.catOnlyHidden;
        render();
        break;
      case 'cat-only-selected-menus':
        T.showSelectedMenus = !T.showSelectedMenus;
        render();
        break;
      case 'cat-show-all':
        commit(() => {
          for (const pid of entity('category', parsePath(path).id).children) {
            const pp = childPath(path, 'product', pid);
            if (S.data.placements[pp]) delete S.data.placements[pp].hidden;
          }
        });
        T.catOnlyHidden = false;
        break;
      case 'cat-menu-toggle': {
        const catId = parsePath(S.ui.selected).id;
        const cat = entity('category', catId);
        const m = menuById(el.dataset.id);
        const menuName = nameOf('menu', m);
        if (!m.children.includes(catId)) {
          commit(() => m.children.push(catId));
          toast(`Added to ${menuName}`, 'success', { action: { label: 'Undo', onClick: undo } });
          break;
        }
        const elsewhere = menusWithCategory(catId).some((x) => x.id !== m.id);
        openModal({
          title: `Remove ${nameOf('category', cat)} from ${menuName}?`,
          body: `<p>Its settings in ${esc(menuName)}, like visibility and schedule, are removed too. ${cat.source === 'pos' ? 'It stays on POS.' : 'Nothing changes on POS.'}</p>
            ${elsewhere ? '' : callout('warning', 'It is not in any other menu, so customers will not see it anywhere.')}`,
          actions: [
            { label: 'Cancel', kind: 'secondary', onClick: closeModal },
            { label: 'Remove category', kind: 'danger', onClick: () => { closeModal(); removeLink(`${m.id}>c:${catId}`); } },
          ],
        });
        break;
      }
      case 'cat-delete': {
        const cat = entity('category', el.dataset.id);
        const ms = menusWithCategory(cat.id);
        const menuNames = listJoin(ms.map((m) => nameOf('menu', m)));
        openModal({
          title: `Delete ${nameOf('category', cat)}?`,
          body: `<ul class="modal-list">
              ${ms.length ? `<li>It is removed from ${ms.length > 1 ? `${ms.length} menus: ` : ''}${esc(menuNames)}, with its settings there.</li>` : ''}
              <li>Its products are not deleted.</li>
              <li>${cat.source === 'pos' ? 'It stays on POS. You can add it back from POS items.' : 'It exists only in this menu builder, so nothing changes on POS.'}</li>
            </ul>
            ${ms.length ? `<button type="button" class="check-toggle" role="checkbox" aria-checked="false" data-action="cat-delete-ack"><span class="check" aria-hidden="true"></span>Yes, I understand</button>` : ''}`,
          actions: [
            { label: 'Cancel', kind: 'secondary', onClick: closeModal },
            {
              label: 'Delete category',
              kind: 'danger',
              onClick: () => {
                closeModal();
                commit(() => {
                  S.data.menus.forEach((m) => (m.children = m.children.filter((c) => c !== cat.id)));
                  for (const k of Object.keys(S.data.placements)) if (k.split('>')[1] === `c:${cat.id}`) delete S.data.placements[k];
                  delete S.data.entities.category[cat.id];
                  S.ui.selected = activeMenu().id;
                });
                toast('Category deleted', 'success', { action: { label: 'Undo', onClick: undo } });
              },
            },
          ],
        });
        if (ms.length) {
          $('#modal-root .modal-foot .btn.danger').disabled = true;
          $('#modal-root [data-action="cat-delete-ack"]').focus({ preventScroll: true });
        }
        break;
      }
      case 'cat-delete-ack': {
        const on = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', String(on));
        const box = el.querySelector('.check');
        box.classList.toggle('is-on', on);
        box.innerHTML = on ? icon('check', 12) : '';
        $('#modal-root .modal-foot .btn.danger').disabled = !on;
        break;
      }
      case 'copy-text': {
        const { value, label } = el.dataset;
        const done = () => toast(`${label} copied`);
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, () => toast(`Couldn’t copy the ${label}. Select it and copy it manually.`, 'error'));
        break;
      }
      case 'image-remove':
        commit(() => setBind(el.dataset.bind, null));
        break;
      case 'cmp-tab':
        T.cmp.tab = el.dataset.tab;
        renderCompare();
        break;
      case 'cmp-toggle': {
        const k = el.dataset.key;
        if (T.cmp.sel.has(k)) T.cmp.sel.delete(k);
        else T.cmp.sel.add(k);
        renderCompare();
        break;
      }
      case 'cmp-all': {
        const keys = ctx.compare.missing.map((m) => m.key);
        const allOn = keys.every((k) => T.cmp.sel.has(k));
        T.cmp.sel = allOn ? new Set() : new Set(keys);
        renderCompare();
        break;
      }
      case 'cmp-add':
        compareAdd();
        break;
      case 'cmp-ignore': {
        const n = T.cmp.sel.size;
        commit(() => T.cmp.sel.forEach((k) => (S.data.ignored[k] = true)));
        T.cmp.sel.clear();
        renderCompare();
        toast(`${plural(n, 'item', 'items')} ignored`, 'info');
        break;
      }
      case 'cmp-unignore':
        commit(() => delete S.data.ignored[el.dataset.key]);
        break;
      case 'cmp-review':
        commit(() =>
          ctx.compare.changed.forEach((c) => {
            const it = posItem(c.ent);
            c.ent.reviewed = { name: it.name, price: isNum(it.price) ? it.price : null };
          }),
        );
        break;
      case 'cmp-remove':
        removeLink(path, { quiet: true });
        renderCompare();
        break;
      case 'cmp-goto':
        closeModal();
        expandTo(path);
        select(path, { focusRow: true });
        break;
      case 'opt-pick':
        T.opt.pick[el.dataset.key] = !T.opt.pick[el.dataset.key];
        renderOptimize();
        break;
      case 'opt-find':
        T.opt.items = buildSuggestions();
        T.opt.off = new Set();
        T.opt.step = 'review';
        renderOptimize();
        break;
      case 'opt-back':
        T.opt.step = 'choose';
        renderOptimize();
        break;
      case 'opt-item': {
        const k = el.dataset.key;
        if (T.opt.off.has(k)) T.opt.off.delete(k);
        else T.opt.off.add(k);
        renderOptimize();
        break;
      }
      case 'opt-apply':
        applyOptimize();
        break;
      case 'pv-pick':
        if (el.getAttribute('aria-disabled') === 'true') return;
        pvPick(el.dataset.gp, el.dataset.op, el.dataset.mode);
        break;
      case 'pv-step':
        pvStep(el.dataset.gp, el.dataset.op, Number(el.dataset.delta));
        break;
      case 'pv-qty':
        T.preview.qty = Math.max(1, T.preview.qty + Number(el.dataset.delta));
        renderPreview();
        break;
      case 'pv-add': {
        const { total, firstInvalid } = pvTotals();
        if (firstInvalid) {
          const head = [...document.querySelectorAll('.pv-group h4')].find((h) => h.textContent === nameOf('group', firstInvalid));
          if (head) {
            const sec = head.closest('.pv-group');
            sec.scrollIntoView({ block: 'center', behavior: 'smooth' });
            sec.classList.remove('is-nudged');
            void sec.offsetWidth;
            sec.classList.add('is-nudged');
          }
          return;
        }
        closeModal();
        toast(`Preview only — nothing was ordered (${money(total)})`, 'info');
        break;
      }
      default:
        break;
    }
  }

  document.addEventListener('click', (e) => {
    const modalClose = e.target.closest('[data-modal-close]');
    if (modalClose) return closeModal();
    const modalAct = e.target.closest('[data-modal-act]');
    if (modalAct && T.modal) return T.modal.actions[Number(modalAct.dataset.modalAct)].onClick();

    const tgl = e.target.closest('[data-toggle]');
    if (tgl) {
      const bind = tgl.dataset.toggle;
      commit(() => {
        const next = !getBind(bind);
        setBind(bind, next);
        if (/\|syncName$/.test(bind) && !next) {
          const [, kind, id] = bind.split('|');
          const ent = entity(kind, id);
          const p = posItem(ent);
          if (p && !ent.name) ent.name = p.name;
        }
      });
      return;
    }
    const seg = e.target.closest('[data-set]');
    if (seg) {
      commit(() => setBind(seg.dataset.set, seg.dataset.value));
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const bind = chip.dataset.chip;
      const v = chip.dataset.vtype === 'int' ? Number(chip.dataset.value) : chip.dataset.value;
      commit(() => {
        const arr = (getBind(bind) || []).slice();
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(v);
        if (chip.dataset.vtype === 'int') arr.sort((a, b) => a - b);
        setBind(bind, arr);
      });
      return;
    }
    const act = e.target.closest('[data-action]');
    if (act && !act.disabled) {
      handleAction(act, e);
      return;
    }
    const row = e.target.closest('.row');
    if (row) {
      select(row.dataset.path, { focusRow: true });
      return;
    }
    const posRow = e.target.closest('.pos-row[data-key]');
    if (posRow) togglePosRow(posRow);
  });

  function togglePosRow(row) {
    const state = S.ui.posQuery.trim() ? T.posSearchExpanded : S.ui.posExpanded;
    state[row.dataset.key] = row.getAttribute('aria-expanded') !== 'true';
    renderPos();
    if (state === S.ui.posExpanded) schedulePersist();
  }

  document.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (!row || e.target.closest('[data-action]')) return;
    S.ui.tabs[row.dataset.kind] = 'general';
    T.focusName = true;
    select(row.dataset.path);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'pos-search') {
      S.ui.posQuery = t.value;
      T.posSearchExpanded = {};
      renderPos();
      return;
    }
    if (t.id === 'canvas-search') {
      S.ui.canvasQuery = t.value;
      render();
      return;
    }
    if (t.id === 'allergen-filter') {
      T.allergenQuery = t.value;
      render();
      return;
    }
    if (t.id === 'picker-search' && T.picker) {
      T.picker.query = t.value;
      renderPicker();
      return;
    }
    if (t.matches('[data-store-search]')) {
      T.storeQuery = t.value;
      render();
      return;
    }
    if (t.matches('[data-cat-product-search]')) {
      T.catProductQuery = t.value;
      render();
      return;
    }
    if (t.matches('[data-cat-menu-search]')) {
      T.menuQuery = t.value;
      render();
      return;
    }
    if (t.matches('[data-segment-draft]') && T.segmentDraft) {
      T.segmentDraft[t.dataset.segmentDraft] = t.value;
      render();
      return;
    }
    if (t.matches('[data-tag-draft]') && T.tagDraft) {
      T.tagDraft[t.dataset.tagDraft] = t.value;
      render();
      return;
    }
    if (t.matches('[data-place-search]')) {
      T.placeQuery = t.value;
      render();
      return;
    }
    if (t.id === 'pv-store' && T.preview) {
      const store = menuStores(activeMenu()).find((s) => s.name.toLowerCase() === t.value.trim().toLowerCase());
      if (store && store.id !== T.preview.storeId) {
        T.preview.storeId = store.id;
        S.ui.previewStoreId = store.id;
        renderPreview();
      }
      return;
    }
    if (t.matches('[data-bind]') && t.tagName !== 'SELECT' && t.type !== 'time' && t.type !== 'datetime-local') {
      const v = parseInput(t);
      commit(() => setBind(t.dataset.bind, v), { key: t.dataset.bind });
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'store-group') {
      S.ui.storeGroupId = t.value;
      loadPos('store-group', render);
    } else if (t.matches('select[data-bind], input[type="time"][data-bind], input[type="datetime-local"][data-bind]')) {
      commit(() => setBind(t.dataset.bind, t.value));
    } else if (t.matches('input[type="file"][data-image]')) {
      readImage(t.files[0], t.dataset.image);
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (T.popover && !T.popover.el.contains(e.target) && !T.popover.anchor.contains(e.target)) closePopover();
  });
  window.addEventListener('resize', closePopover);
  $('#canvas-scroll').addEventListener('scroll', closePopover, { passive: true });

  /* drag and drop */

  function clearDropMark() {
    if (T.markedRow) {
      delete T.markedRow.dataset.drop;
      T.markedRow = null;
    }
    $('#canvas').classList.remove('drop-end');
    T.dropTarget = null;
  }

  function setHint(text, tone = '') {
    const hint = $('#drag-hint');
    if (hint.textContent !== text) hint.textContent = text;
    hint.dataset.tone = tone;
  }

  function endDrag() {
    clearDropMark();
    $$('.row.is-dragging').forEach((r) => r.classList.remove('is-dragging'));
    delete document.body.dataset.dragKind;
    $('#drag-hint').dataset.show = 'false';
    T.drag = null;
  }

  const DRAG_HINT = {
    menu: 'Drop on the canvas to add all its categories',
    category: 'Drop on the menu to add a category',
    product: 'Drop on its POS category, a group, or a menu-only category',
    group: 'Drop on a product that has this group on POS',
  };

  function autoPlaceHint(d) {
    if (d.kind === 'menu') return `Drop to add all categories from ${d.name}`;
    if (d.kind === 'category') return 'Drop to add it to the end of the menu';
    const chain = d.posPath || [];
    if (chain.length < 2) return DRAG_HINT[d.kind];
    return `Drop to add it under ${posLabel(chain[chain.length - 2])}`;
  }

  document.addEventListener('dragstart', (e) => {
    const posRow = e.target.closest && e.target.closest('.pos-row');
    const row = e.target.closest && e.target.closest('.row');
    if (posRow) {
      const kind = posRow.dataset.kind;
      T.drag = {
        origin: 'pos',
        posId: posRow.dataset.posId,
        kind,
        name: posRow.dataset.name,
        source: 'pos',
        ptype: kind === 'product' ? 'pos' : null,
        gtype: kind === 'group' ? 'pos' : null,
        chainCat: posRow.dataset.chainCat || null,
        posPath: posRow.dataset.posPath ? posRow.dataset.posPath.split('/') : [],
      };
    } else if (row) {
      T.drag = dragDescFromPath(row.dataset.path);
      row.classList.add('is-dragging');
    } else return;
    closePopover();
    e.dataTransfer.effectAllowed = T.drag.origin === 'pos' ? 'copy' : 'move';
    e.dataTransfer.setData('text/plain', T.drag.name);
    const ghost = $('#drag-ghost');
    ghost.innerHTML = `<span class="kind-glyph kind-${T.drag.kind}">${icon(KIND_ICON[T.drag.kind], 13)}</span>${esc(T.drag.name)}`;
    e.dataTransfer.setDragImage(ghost, 16, 18);
    document.body.dataset.dragKind = T.drag.kind;
    setHint(DRAG_HINT[T.drag.kind]);
    $('#drag-hint').dataset.show = 'true';
  });

  document.addEventListener('dragend', endDrag);

  function dropPositionFor(row, e, d) {
    const path = row.dataset.path;
    if (d.origin === 'canvas' && (path === d.path || path.startsWith(`${d.path}>`))) return null;
    const kind = row.dataset.kind;
    if (CHILD_KIND[kind] === d.kind) return 'inside';
    if (kind === d.kind) {
      const r = row.getBoundingClientRect();
      return e.clientY - r.top < r.height / 2 ? 'before' : 'after';
    }
    return null;
  }

  const canvasEl = $('#canvas');
  canvasEl.addEventListener('dragover', (e) => {
    const d = T.drag;
    if (!d) return;
    const row = e.target.closest('.row');
    const menuCard = e.target.closest('.menu-card');
    if (d.origin === 'pos' && (d.kind === 'menu' || menuCard)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (T.markedRow && T.markedRow !== menuCard) delete T.markedRow.dataset.drop;
      T.markedRow = menuCard;
      if (menuCard) menuCard.dataset.drop = 'inside';
      canvasEl.classList.toggle('drop-end', !menuCard);
      T.dropTarget = { auto: true };
      setHint(autoPlaceHint(d));
      return;
    }
    if (row) {
      const pos = dropPositionFor(row, e, d);
      if (T.markedRow && T.markedRow !== row) delete T.markedRow.dataset.drop;
      canvasEl.classList.remove('drop-end');
      T.markedRow = row;
      if (!pos) {
        delete row.dataset.drop;
        T.dropTarget = null;
        setHint(DRAG_HINT[d.kind]);
        return;
      }
      const target = { path: row.dataset.path, pos };
      const { parentPath } = resolveDrop(d, target);
      const err = dropError(parentPath, d);
      if (err) {
        row.dataset.drop = 'invalid';
        T.dropTarget = null;
        setHint(err, 'error');
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = d.origin === 'pos' ? 'copy' : 'move';
      row.dataset.drop = pos;
      T.dropTarget = target;
      setHint(DRAG_HINT[d.kind]);
      return;
    }
    if (T.markedRow) {
      delete T.markedRow.dataset.drop;
      T.markedRow = null;
    }
    const overEmpty = e.target.closest('#canvas-scroll');
    const canAuto = d.kind === 'category' || d.origin === 'pos';
    if (overEmpty && canAuto) {
      e.preventDefault();
      e.dataTransfer.dropEffect = d.origin === 'pos' ? 'copy' : 'move';
      canvasEl.classList.add('drop-end');
      T.dropTarget = { auto: true };
      setHint(autoPlaceHint(d));
    } else {
      canvasEl.classList.remove('drop-end');
      T.dropTarget = null;
    }
  });

  canvasEl.addEventListener('dragleave', (e) => {
    if (!canvasEl.contains(e.relatedTarget)) {
      clearDropMark();
      if (T.drag) setHint(DRAG_HINT[T.drag.kind]);
    }
  });

  canvasEl.addEventListener('drop', (e) => {
    const d = T.drag;
    const t = T.dropTarget;
    if (!d) return;
    e.preventDefault();
    endDrag();
    if (t) performDrop(d, t);
  });

  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest && e.target.closest('[data-image-drop]');
    if (zone && !T.drag && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      zone.classList.add('is-over');
    }
  });
  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest && e.target.closest('[data-image-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
  });
  document.addEventListener('drop', (e) => {
    const zone = e.target.closest && e.target.closest('[data-image-drop]');
    if (zone && !T.drag && e.dataTransfer.files.length) {
      e.preventDefault();
      readImage(e.dataTransfer.files[0], zone.dataset.imageDrop);
    }
  });

  /* keyboard */

  function treeKeys(e) {
    const rows = $$('#canvas-tree .row');
    const i = rows.findIndex((r) => r.dataset.path === S.ui.selected);
    const cur = rows[i];
    const go = (r) => {
      if (!r) return;
      e.preventDefault();
      select(r.dataset.path, { focusRow: true });
    };
    switch (e.key) {
      case 'ArrowDown':
        go(rows[i + 1] || (i < 0 ? rows[0] : null));
        break;
      case 'ArrowUp':
        go(rows[i - 1]);
        break;
      case 'ArrowRight':
        if (!cur) return;
        e.preventDefault();
        if (cur.getAttribute('aria-expanded') === 'false') {
          S.ui.expanded[cur.dataset.path] = true;
          T.focusRow = cur.dataset.path;
          render();
        } else if (cur.getAttribute('aria-expanded') === 'true') go(rows[i + 1]);
        break;
      case 'ArrowLeft': {
        if (!cur) return;
        e.preventDefault();
        if (cur.getAttribute('aria-expanded') === 'true') {
          S.ui.expanded[cur.dataset.path] = false;
          T.focusRow = cur.dataset.path;
          render();
        } else {
          const parent = parsePath(cur.dataset.path).parentPath;
          if (parent && parent.includes('>')) select(parent, { focusRow: true });
        }
        break;
      }
      case 'Backspace':
      case 'Delete':
        if (cur) {
          e.preventDefault();
          confirmRemove(cur.dataset.path);
        }
        break;
      case 'Enter':
        if (cur) {
          e.preventDefault();
          S.ui.tabs[cur.dataset.kind] = 'general';
          T.focusName = true;
          render();
        }
        break;
      default:
        break;
    }
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-segment-draft], [data-tag-draft]')) {
      e.preventDefault();
      const save = document.querySelector(e.target.matches('[data-tag-draft]') ? '[data-action="tag-save"]' : '[data-action="segment-save"]');
      if (save && !save.disabled) save.click();
      return;
    }
    if (e.key === 'Escape') {
      if (T.popover) {
        const a = T.popover.anchor;
        closePopover();
        if (a && a.isConnected) a.focus();
        return;
      }
      if (T.modal) return closeModal();
      if (typing) e.target.blur();
      return;
    }
    if (T.popover && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = $$('.pop-item:not([disabled])', T.popover.el);
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      if (next) {
        e.preventDefault();
        next.focus();
      }
      return;
    }
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      redo();
      return;
    }
    if (T.modal || typing || mod) return;
    if (e.key === '/') {
      e.preventDefault();
      $('#pos-search').focus();
      return;
    }
    if (e.target.closest && e.target.closest('#canvas-tree')) treeKeys(e);
  });

  /* ---------- init ---------- */

  load();
  render();
  setInterval(() => {
    const sub = $('#pos-head .panel-sub');
    if (sub) sub.textContent = posSubText();
  }, 30000);
})();
