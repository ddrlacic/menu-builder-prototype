'use strict';

  /* ---------- preview ---------- */

  function openPreview(path) {
    const sel = {};
    const order = {};
    walkSubtree(path, (kind, id, ent, p) => {
      if (kind !== 'product' || p === path) return;
      const pre = preselectedAt(p);
      const og = groupOfOption(p);
      if (pre && !placement(p).hidden && !(og && og.isSubstitutionContainer)) {
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
    const optMax = (op) => Math.max(1, optionMaxOf(g, parsePath(op).id, r));
    const maxSingle = Math.max(1, r.maxSingle, ...g.children.map((pid) => optionMaxOf(g, pid, r)));
    return { s, count, min: r.min, max: limitOf(r.max), maxSingle, optMax, free: r.freeCount };
  }

  const pvShown = (g, gp) => !!g && !g.isSubstitutionContainer && !placement(gp).hidden;

  function pvVisibleGroups(productPath) {
    const out = [];
    const rec = (pp) => {
      const p = entity('product', parsePath(pp).id);
      for (const gid of p.children) {
        const g = entity('group', gid);
        const gp = childPath(pp, 'group', gid);
        if (!pvShown(g, gp)) continue;
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
        if (!pvShown(g, gp)) continue;
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
                <button type="button" class="icon-btn sm" data-action="pv-step" data-gp="${esc(gp)}" data-op="${esc(o.op)}" data-delta="1" aria-label="Add one" ${n >= st.optMax(o.op) || full ? 'disabled' : ''}>${icon('plus', 14)}</button>
              </div>`
            : `<span class="pv-control pv-${mode}${n ? ' is-on' : ''}">${n && mode === 'check' ? icon('check', 12) : ''}</span>`;
        const nested = n && o.ent.children.length
          ? `<div class="pv-nested">${o.ent.children
              .map((gid) => {
                const ng = entity('group', gid);
                const ngp = childPath(o.op, 'group', gid);
                return pvShown(ng, ngp) ? pvGroupHtml(ngp, ng, depth + 1) : '';
              })
              .join('')}</div>`
          : '';
        const tag = mode === 'stepper' ? 'div' : 'button';
        const sub = o.ent.children.length ? (n ? 'Customize below' : 'Has more choices') : '';
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="pv-opt${n ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}" ${mode !== 'stepper' ? `data-action="pv-pick" data-gp="${esc(gp)}" data-op="${esc(o.op)}" data-mode="${mode}"` : ''} ${disabled ? 'aria-disabled="true"' : ''}>
            ${mode !== 'stepper' ? control : ''}
            <span class="pv-opt-name">${esc(optionName(g, o.pid))}${sub ? `<span class="pv-opt-sub">${sub}</span>` : ''}</span>
            <span class="pv-opt-price tnum">${optPrice}</span>
            ${mode === 'stepper' ? control : ''}
          </${tag}>${nested}`;
      });
    const body = g.sections.length
      ? g.sections
          .map((sec) => {
            const html = opts.map((o, i) => (sectionOfOption(g, o.pid) === sec.id ? rows[i] : '')).join('');
            return html ? `<h5 class="pv-opt-section">${esc(sec.name)}</h5>${html}` : '';
          })
          .join('')
      : rows.join('');
    return `<section class="pv-group">
      <header class="pv-group-head">
        <div><h4>${esc(isChoiceGroup(g) ? nameOf('product', entity('product', parsePath(parsePath(gp).parentPath).id)) : nameOf('group', g))}</h4><span class="pv-rule">${esc(customerRule(rulesOf(g)))}</span></div>
        ${st.min > 0 ? `<span class="pv-status${done ? ' is-done' : ''}">${done ? `${icon('check', 12)}Done` : 'Required'}</span>` : ''}
      </header>
      <div class="pv-opts">${body || '<p class="field-help">No options to show.</p>'}</div>
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
      return pvShown(g, gp) ? pvGroupHtml(gp, g, 0) : '';
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
    const next = clamp(cur + delta, 0, st.optMax(op));
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
