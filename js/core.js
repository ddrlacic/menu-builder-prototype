'use strict';

  const C = window.MENU_CONSTANTS;
  const SUG = window.MENU_SUGGESTIONS;
  const STORAGE_KEY = 'menu-builder-prototype-v3';
  const START_DATASET = 'cravewave';
  const DATASETS = { example: { pos: window.POS_SEED, products: window.EXAMPLE_PRODUCTS, syncDemo: window.EXAMPLE_SYNC_DEMO }, ...(window.POS_DATASETS || {}) };
  const BASE_MODIFIER_CODES = C.modifierCodes;
  const CHILD_KIND = { menu: 'category', category: 'product', product: 'group', group: 'product' };
  const childKind = (kind, ent) => (kind === 'product' && ent && ent.ptype === 'size' ? 'product' : CHILD_KIND[kind]);
  const SEG = { category: 'c', product: 'p', group: 'g' };
  const SEG_KIND = { c: 'category', p: 'product', g: 'group' };
  const KIND_LABEL = { menu: 'Menu', category: 'Category', product: 'Product', group: 'Product group' };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SIZE_WORDS = ['kids', 'small', 'regular', 'medium', 'large', 'extra large'];
  const SIZE_ABBR = { sml: 'small', sm: 'small', reg: 'regular', med: 'medium', md: 'medium', lrg: 'large', lg: 'large', xl: 'extra large' };
  const STOCK_OPTIONS = [
    ['', 'In stock'],
    ['oos_1h', 'Out of stock for 1 hour'],
    ['oos_4h', 'Out of stock for 4 hours'],
    ['oos_eod', 'Out of stock until end of day'],
    ['out_of_stock', 'Out of stock indefinitely'],
  ];
  const POS_STOCK_OPTIONS = STOCK_OPTIONS.slice(0, 4);
  const STOCK_DURATION = { oos_1h: '1h', oos_4h: '4h', oos_eod: 'end_of_day' };
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
      if (!(s.tag || '').trim()) return 'Add a tag';
      return '';
    });
  }

  const tagName = (s) => String(s || '').trim().toLowerCase().replace(/ /g, '-');
  const tagValuesOf = (text) => [...new Set(String(text || '').split(',').map(tagName).filter(Boolean))];

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
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
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
    halfLeft: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>',
    halfRight: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    halves: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>',
    panelClose: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
    panelOpen: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  };
  const icon = (name, size = 16) =>
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const KIND_ICON = { category: 'folder', product: 'utensils', group: 'layers', menu: 'layers' };
