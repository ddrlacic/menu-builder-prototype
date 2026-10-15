'use strict';

  /* ---------- overlays ---------- */

  function openPopover(anchor, items, { align = 'end', className = '', at = null, label = '' } = {}) {
    closePopover();
    const el = document.createElement('div');
    const html = typeof items === 'string';
    el.className = `popover ${className}`;
    el.setAttribute('role', html ? 'dialog' : 'menu');
    if (label) el.setAttribute('aria-label', label);
    if (html) el.tabIndex = -1;
    el.innerHTML = html ? items : items
      .map((it, i) => {
        if (it === '-') return '<div class="pop-sep" role="separator"></div>';
        if (it.heading) return `<div class="pop-heading">${esc(it.heading)}</div>`;
        if (it.empty) return `<div class="pop-empty">${it.empty}</div>`;
        const check = it.checked !== undefined;
        return `<button type="button" role="${check ? 'menuitemcheckbox' : 'menuitem'}" ${check ? `aria-checked="${!!it.checked}"` : ''} class="pop-item${it.tone ? ` tone-${it.tone}` : ''}" data-pop="${i}" ${it.disabled ? 'disabled' : ''}>
            ${it.icon ? icon(it.icon, 15) : ''}<span class="pop-label"><span class="pop-text">${esc(it.label)}</span>${it.hint ? `<span class="pop-hint">${esc(it.hint)}</span>` : ''}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.submenu ? icon('chevRight', 14) : ''}${it.checked ? `<span class="pop-check">${icon('check', 15)}</span>` : ''}
          </button>`;
      })
      .join('');
    $('#popover-root').appendChild(el);
    const r = at ? { left: at.x, right: at.x, top: at.y, bottom: at.y - 6 } : anchor.getBoundingClientRect();
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
    const first = html ? el : el.querySelector('.pop-item:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }

  const SHORTCUTS = [
    ['Select', [
      ['Select a row', ['Click']],
      ['Add or remove a row', ['⌘', 'Click']],
      ['Select a range', ['⇧', 'Click']],
      ['Extend the selection', ['⇧', '↑'], ['⇧', '↓']],
      ['Select all of the same kind', ['⌘', 'A']],
      ['Go back to one row', ['Esc']],
    ]],
    ['Move around', [
      ['Previous or next row', ['↑'], ['↓']],
      ['Expand or collapse', ['→'], ['←']],
      ['Expand or collapse everything inside', ['⌥', 'Click']],
      ['Search this menu', ['⌘', 'F']],
      ['Go to the first match', ['↓'], ['Enter']],
      ['Clear the search', ['Esc']],
    ]],
    ['Edit', [
      ['Rename', ['Enter']],
      ['Move up or down', ['⌥', '↑'], ['⌥', '↓']],
      ['Remove from its parent', ['⌫']],
      ['Add to another place too', ['⌥', 'Drag']],
      ['More actions', ['Right-click'], ['⇧', 'F10']],
      ['Undo', ['⌘', 'Z']],
      ['Redo', ['⇧', '⌘', 'Z']],
    ]],
    ['POS items', [
      ['Search POS items', ['/']],
      ['Go to the first match', ['↓'], ['Enter']],
      ['Previous or next item', ['↑'], ['↓']],
      ['Expand or collapse', ['→'], ['←']],
      ['Add or remove an item', ['⌘', 'Click']],
      ['Select a range', ['⇧', 'Click']],
      ['Extend the selection', ['⇧', '↑'], ['⇧', '↓']],
      ['Clear the selection', ['Esc']],
      ['Add to the menu', ['Enter']],
    ]],
    ['Menu tabs', [
      ['Move left or right', ['⌥', '←'], ['⌥', '→']],
      ['Duplicate, move, or delete', ['Right-click'], ['⇧', 'F10']],
    ]],
    ['View', [
      ['Show or hide POS items', ['⌘', 'B']],
      ['Keyboard shortcuts', ['?'], ['⌘', '/']],
    ]],
  ];

  function toggleShortcuts() {
    const anchor = $('#shortcuts-btn');
    if (T.popover && T.popover.anchor === anchor) return closePopover();
    const keys = (combos) => combos.map((c) => c.map((k) => `<kbd>${esc(k)}</kbd>`).join('')).join('<span>or</span>');
    openPopover(
      anchor,
      SHORTCUTS.map(([title, rows]) => `<div class="pop-heading">${esc(title)}</div>${rows.map(([label, ...combos]) => `<div class="sc-row"><span>${esc(label)}</span><span class="sc-keys">${keys(combos)}</span></div>`).join('')}`).join(''),
      { align: 'start', className: 'shortcuts', label: 'Keyboard shortcuts' },
    );
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

  function showIdCard(anchor) {
    clearTimeout(T.idCardTimer);
    if (T.idCard && T.idCard.anchor === anchor) return;
    hideIdCard(true);
    const { value, label } = anchor.dataset;
    const el = document.createElement('div');
    el.className = 'id-card';
    el.setAttribute('role', 'tooltip');
    el.innerHTML = `${icon('link', 14)}<span class="mono">${esc(value)}</span><span class="id-card-sep" aria-hidden="true"></span>
      <button type="button" data-action="copy-text" data-value="${esc(value)}" data-label="${esc(label)}">Copy</button>`;
    $('#popover-root').appendChild(el);
    const r = anchor.getBoundingClientRect();
    const left = clamp(r.left + r.width / 2 - el.offsetWidth / 2, 8, window.innerWidth - el.offsetWidth - 8);
    const below = r.top - el.offsetHeight - 10 < 8;
    el.style.left = `${left}px`;
    el.style.top = `${below ? r.bottom + 10 : r.top - el.offsetHeight - 10}px`;
    el.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
    el.dataset.side = below ? 'bottom' : 'top';
    el.addEventListener('pointerenter', () => clearTimeout(T.idCardTimer));
    el.addEventListener('pointerleave', () => scheduleHideIdCard());
    el.addEventListener('click', (e) => e.target.closest('button') && setTimeout(() => hideIdCard(true)));
    T.idCard = { el, anchor };
    requestAnimationFrame(() => (el.dataset.open = 'true'));
  }

  function tipTarget(node) {
    const el = node && node.closest && node.closest('[title], [data-tip]');
    if (!el || el.matches('.row, .pos-row') || el.closest('#popover-root')) return null;
    if (el.hasAttribute('title')) {
      const text = el.getAttribute('title');
      el.removeAttribute('title');
      if (!text) return null;
      el.dataset.tip = text;
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
    }
    if (el.dataset.tip === el.textContent.trim() && el.scrollWidth <= el.clientWidth) return null;
    return el;
  }

  function showTip(anchor) {
    if (T.tip && T.tip.anchor === anchor) return;
    hideTip();
    const el = document.createElement('div');
    el.className = 'tip';
    el.setAttribute('role', 'tooltip');
    el.textContent = anchor.dataset.tip;
    if (anchor.dataset.tipKbd) {
      const k = document.createElement('kbd');
      k.textContent = anchor.dataset.tipKbd;
      el.append(k);
    }
    $('#popover-root').appendChild(el);
    const r = anchor.getBoundingClientRect();
    const left = clamp(r.left + r.width / 2 - el.offsetWidth / 2, 8, window.innerWidth - el.offsetWidth - 8);
    const below = r.top - el.offsetHeight - 8 < 8;
    el.style.left = `${left}px`;
    el.style.top = `${below ? r.bottom + 8 : r.top - el.offsetHeight - 8}px`;
    el.style.setProperty('--arrow-x', `${clamp(r.left + r.width / 2 - left, 10, el.offsetWidth - 10)}px`);
    el.dataset.side = below ? 'bottom' : 'top';
    T.tip = { el, anchor };
    requestAnimationFrame(() => (el.dataset.open = 'true'));
  }

  function hideTip() {
    if (!T.tip) return;
    T.tip.el.remove();
    T.tip = null;
  }

  function scheduleHideIdCard() {
    clearTimeout(T.idCardTimer);
    T.idCardTimer = setTimeout(() => hideIdCard(), 200);
  }

  function hideIdCard(now = false) {
    clearTimeout(T.idCardTimer);
    if (!T.idCard) return;
    const { el } = T.idCard;
    T.idCard = null;
    if (now) return el.remove();
    el.dataset.open = 'false';
    setTimeout(() => el.remove(), 120);
  }

  function openModal({ title, body, actions = [], size = 'md', foot = '', top = false }) {
    closeModal(true);
    const root = $('#modal-root');
    root.classList.toggle('is-top', top);
    root.innerHTML = `<div class="modal-backdrop" data-modal-close></div>
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Close">${icon('x', 16)}</button></div>
        <div class="modal-scroll"><div class="modal-body">${body}</div></div>
        ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.kind || 'secondary'}" data-modal-act="${i}" ${a.disabled ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>` : foot}
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
    T.picker = null;
    T.lp = null;
    T.cmp = null;
    T.opt = null;
    T.hh = null;
    if (T.bi) T.bi.files.forEach((f) => URL.revokeObjectURL(f.url));
    T.bi = null;
    T.ms = null;
    T.mc = null;
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
    const list = T.picker.items.filter((it) => !q || (it.search || [it.name, it.alt, it.id]).some((s) => (s || '').toLowerCase().includes(q)));
    $('#picker-list').innerHTML = list.length
      ? list
          .map(
            (it) => `<button type="button" class="picker-row" role="option" data-action="pick" data-id="${esc(it.id)}"${it.disabled ? ' disabled aria-disabled="true"' : ''}>
              ${it.thumb || `<span class="thumb thumb-product thumb-sm">${icon('utensils', 13)}</span>`}
              <span class="picker-main"><span class="picker-name">${esc(it.name)}</span><span class="picker-meta">${esc([it.meta, it.code].filter(Boolean).join(' · '))}</span></span>
              <span class="picker-price tnum">${esc(it.price)}</span></button>`,
          )
          .join('')
      : !T.picker.items.length && T.picker.empty
        ? `<div class="empty-small">${icon('checkCircle', 18)}<strong>${esc(T.picker.empty)}</strong></div>`
        : `<div class="empty-small"><strong>${esc(T.picker.noMatch[0])}</strong><span>${esc(T.picker.noMatch[1])}</span></div>`;
  }

  function openListPicker({ title, intro, groups, empty, noun, placeholder = `Search ${noun[1]}`, onAdd, cta = null, onSave = null, single = false }) {
    groups = groups.filter((g) => g.items.length);
    const total = new Set(groups.flatMap((g) => g.items.map((it) => it.id))).size;
    openModal({
      title,
      size: 'lg',
      body: `${intro ? `<p>${esc(intro)}</p>` : ''}
        <label class="search-field">${icon('search', 15)}<span class="sr-only">${esc(placeholder)}</span>
          <input id="lp-search" type="search" placeholder="${esc(placeholder)}" autocomplete="off"></label>
        <div id="lp-list"></div>`,
      foot: '<div class="modal-foot" id="lp-foot"></div>',
    });
    const off = new Set(groups.flatMap((g) => g.items.filter((it) => it.disabled).map((it) => it.id)));
    T.lp = { groups, empty, noun, onAdd, cta, onSave, single, off, sel: new Set(), open: new Set(groups.length === 1 || total <= 40 ? groups.map((g) => g.id) : []), query: '', onlySelected: false };
    renderListPicker();
    $('#lp-search').focus();
  }

  const listSub = (it) => [it.alt && it.alt !== it.name ? it.alt : '', it.code].filter(Boolean).join(' · ');

  function listPickerGroups() {
    const o = T.lp;
    const q = o.query.trim().toLowerCase();
    return o.groups
      .map((g) => {
        let list = g.items;
        if (o.onlySelected) list = list.filter((it) => o.sel.has(it.id));
        if (q && !g.name.toLowerCase().includes(q)) list = list.filter((it) => [it.name, it.alt, it.code, it.meta].some((s) => (s || '').toLowerCase().includes(q)));
        return { g, list };
      })
      .filter((x) => x.list.length);
  }

  function renderListPicker() {
    if (!T.lp || !$('#lp-list')) return;
    const o = T.lp;
    const q = o.query.trim();
    const groups = listPickerGroups();
    const flat = o.groups.length === 1;
    const stateOf = (list) => {
      const open = list.filter((it) => !o.off.has(it.id));
      if (list.length && !open.length) return 'on';
      const n = open.filter((it) => o.sel.has(it.id)).length;
      return n === 0 ? 'off' : n === open.length ? 'on' : 'mixed';
    };
    const lockedAll = (list) => list.every((it) => o.off.has(it.id));
    const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
    const checked = (st) => (st === 'mixed' ? 'mixed' : String(st === 'on'));
    const allSt = stateOf(groups.flatMap((x) => x.list));
    const row = (it) => {
      const locked = o.off.has(it.id);
      const on = locked || o.sel.has(it.id);
      const mark = o.single ? `<span class="check is-round${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>` : box(on ? 'on' : 'off');
      return `<button type="button" class="ms-row ms-store" role="${o.single ? 'radio' : 'checkbox'}" aria-checked="${on}" data-action="lp-item" data-id="${esc(it.id)}"${locked ? ' disabled' : ''}>${mark}${it.thumb || ''}<span class="ms-name">${esc(it.name)}${listSub(it) ? `<span class="ms-sub">${esc(listSub(it))}</span>` : ''}</span>${it.tag ? `<span class="badge tone-staged">${esc(it.tag)}</span>` : ''}${it.meta ? `<span class="ms-city">${esc(it.meta)}</span>` : ''}</button>`;
    };
    $('#lp-list').innerHTML = !o.groups.length
      ? `<div class="empty-small">${icon('checkCircle', 18)}<strong>${esc(o.empty)}</strong></div>`
      : groups.length
        ? `<div class="ms-tree"${o.single ? ' role="radiogroup"' : ''}>
          ${o.single ? '' : `<button type="button" class="ms-row ms-all" role="checkbox" aria-checked="${checked(allSt)}" data-action="lp-all" data-on="${allSt === 'on' ? 0 : 1}"${lockedAll(groups.flatMap((x) => x.list)) ? ' disabled' : ''}>${box(allSt)}Select all</button>`}
          ${
            flat
              ? `<div class="ms-stores ms-flat">${groups[0].list.map(row).join('')}</div>`
              : groups
                  .map(({ g, list }) => {
                    const st = stateOf(list);
                    const open = !!q || o.onlySelected || o.open.has(g.id);
                    return `<div class="ms-group">
                <div class="ms-group-head">
                  <button type="button" class="icon-btn sm ms-chev" data-action="lp-open" data-id="${esc(g.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(g.name)}">${icon('chevRight', 14)}</button>
                  <button type="button" class="ms-row" role="checkbox" aria-checked="${checked(st)}" data-action="lp-group" data-id="${esc(g.id)}" data-on="${st === 'on' ? 0 : 1}"${lockedAll(g.items) ? ' disabled' : ''}>${box(st)}<strong class="ms-name">${esc(g.name)}${g.sub ? `<span class="ms-sub">${esc(g.sub)}</span>` : ''}</strong><span class="ms-city tnum">${g.items.filter((it) => o.sel.has(it.id) || o.off.has(it.id)).length} of ${g.items.length}</span></button>
                </div>
                ${open ? `<div class="ms-stores">${list.map(row).join('')}</div>` : ''}
              </div>`;
                  })
                  .join('')
          }
        </div>`
        : q
          ? `<div class="empty-small"><strong>No matching ${esc(o.noun[1])}</strong><span>Try a different name.</span></div>`
          : `<div class="empty-small"><strong>No ${esc(o.noun[1])} selected</strong></div>`;
    const n = o.sel.size;
    $('#lp-foot').innerHTML = `${o.single ? '' : `<button type="button" class="check-toggle ms-only" role="checkbox" aria-checked="${o.onlySelected}" data-action="lp-only"${o.groups.length ? '' : ' disabled'}>${box(o.onlySelected ? 'on' : 'off')}Show only selected</button>`}
      <button type="button" class="btn secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn primary" data-action="lp-add"${n ? '' : ' disabled'}>${esc(o.cta ? o.cta(n) : n ? `Add ${plural(n, o.noun[0], o.noun[1])}` : `Add ${o.noun[1]}`)}</button>`;
  }

  function setListPicker(ids, on) {
    if (T.lp.single) {
      T.lp.sel.clear();
      on = true;
    }
    ids.filter((id) => !T.lp.off.has(id)).forEach((id) => (on ? T.lp.sel.add(id) : T.lp.sel.delete(id)));
    renderListPicker();
  }

  function addFromListPicker() {
    const o = T.lp;
    const order = [...new Set(o.groups.flatMap((g) => g.items.map((it) => it.id)))].filter((id) => o.sel.has(id));
    if (!order.length) return;
    closeModal();
    if (o.onSave) return o.onSave(order);
    commit(() => o.onAdd(order));
    toast(`${plural(order.length, o.noun[0], o.noun[1])} added`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function toast(msg, tone = 'success', { action, onClose } = {}) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast tone-${tone}`;
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(tone === 'error' ? 'alertCircle' : tone === 'info' ? 'info' : 'checkCircle', 16)}<span class="toast-msg">${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}`;
    root.appendChild(el);
    let timer;
    let closed = false;
    const dismiss = (silent) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      el.dataset.state = 'closing';
      setTimeout(() => el.remove(), 180);
      if (onClose && silent !== true) onClose();
    };
    el.dismissToast = dismiss;
    if (action) el.querySelector('.toast-action').addEventListener('click', () => { action.onClick(); dismiss(); });
    requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = 'open')));
    timer = setTimeout(dismiss, action ? 6000 : tone === 'error' ? 5000 : 3200);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => (timer = setTimeout(dismiss, 1600)));
    const all = root.querySelectorAll('.toast:not([data-state="closing"])');
    if (all.length > 3) all[0].dismissToast();
    return { dismiss };
  }

  function copyText(value, label) {
    const done = () => toast(`${label} copied`);
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, () => toast(`Couldn’t copy the ${label}. Select it and copy it manually.`, 'error'));
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
        : [{ empty: `<strong>No POS groups</strong><span>${esc(nameOf('product', p))} has no groups on POS. Use suggested products instead.</span>` }],
    );
  }

  function rowMenu(anchor, path, which, opts) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const pInfo = parsePath(info.parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const staged = !!pendingRoot(path);
    const built = (it) => (staged ? { ...it, disabled: true, submenu: false, hint: 'Available after you import' } : it);
    if (which === 'add') {
      const customProduct = built({
        label: 'Custom product',
        hint: 'Your name, image, and options for a POS product. POS gets the original',
        icon: 'link',
        onClick: () => openLinkedProductPicker(path),
      });
      if (info.kind === 'category') {
        const items = [
          addMenuItem(path),
          { heading: 'Create' },
          customProduct,
          built({ label: 'Choice product', hint: 'Customers pick one product, like a size. Only that product goes to POS', icon: 'package', onClick: () => createChoiceProduct(path) }),
        ];
        if (detectSizeSets(ent).length) items.push('-', { label: 'Group sizes', hint: 'Turn size variants into one choice product', icon: 'sparkles', onClick: () => groupSizes(path) });
        return openPopover(anchor, items);
      }
      if (info.kind === 'product' && ent.ptype === 'size') return openAddDialog(path);
      if (info.kind === 'product') {
        return openPopover(anchor, [
          addMenuItem(path),
          { heading: 'Create' },
          built({
            label: 'Custom group',
            hint: 'Your own name and rules for a POS group. POS gets the original group',
            icon: 'link',
            submenu: true,
            onClick: () => linkedGroupMenu(anchor, path),
          }),
          built({ label: 'Suggested products', hint: 'Products customers can add to this item. Each one goes on the order as its own item', icon: 'dashed', onClick: () => createVirtualGroup(path, 'upsell') }),
        ]);
      }
      if (ent.gtype === 'standalone') {
        return openPopover(anchor, [
          addMenuItem(path),
          { heading: 'Create' },
          customProduct,
        ]);
      }
      return openPopover(anchor, [
        addMenuItem(path),
        { heading: 'Create' },
        built({
          label: 'Option folder',
          hint: 'An option that opens more options. POS gets only what customers pick inside',
          icon: 'dashed',
          onClick: () => createVirtualContainer(path),
        }),
      ]);
    }
    const targets = T.sel.length > 1 && T.sel.includes(path) ? T.sel.slice() : [path];
    const many = targets.length > 1;
    const items = [];
    const sep = () => items.length && items[items.length - 1] !== '-' && items.push('-');
    if (choiceFromBlock(targets) === '') items.push({ label: 'Create choice product', icon: 'package', onClick: () => createChoiceFromSelection(targets) });
    if (!many && canCustomizeProduct(path)) items.push(built({ label: 'Create custom product', icon: 'link', onClick: () => createCustomProductFrom(path) }));
    if (!many && canCustomizeGroup(path)) items.push(built({ label: 'Create custom group', icon: 'link', onClick: () => createCustomGroupFrom(path) }));
    if (!many && canUngroup(path)) items.push({ label: 'Ungroup', icon: 'layers', onClick: () => ungroupChoiceProduct(path) });
    sep();
    if (info.kind === 'category' && detectSizeSets(ent).length) items.push({ label: 'Group sizes', icon: 'sparkles', onClick: () => groupSizes(path) });
    if (info.kind === 'category') items.push(built({ label: 'Upload images', icon: 'upload', onClick: () => openBulkImages(path) }));
    if (!staged) {
      if (info.kind === 'category' && suggestedSizeSets(ent).length) items.push({ label: 'Dismiss suggestion', icon: 'x', onClick: () => dismissSizeHint(path) });
      if (info.kind === 'group' && halfSuggestions(ent).length) items.push({ label: 'Group halves', icon: 'sparkles', onClick: () => openHalfMatch(ent.id) });
      if (info.kind === 'group' && suggestedHalves(ent).length) items.push({ label: 'Dismiss suggestion', icon: 'x', onClick: () => dismissHalfHint(ent.id) });
    }
    const role = info.kind === 'product' ? halfRole(path) : null;
    if (['product', 'group'].includes(info.kind) && !(role && role.wholePath)) {
      const noun = many ? ` ${plural(placeDescs(targets, 'move').length, ...BULK_NOUN[info.kind])}` : '';
      const place = (mode, label, iconName) => {
        const fits = placeTargets(placeDescs(targets, mode), mode).length > 0;
        return { label, icon: iconName, disabled: !fits, hint: fits ? '' : 'No other place in this menu fits', onClick: () => openPlacePicker(targets, mode) };
      };
      sep();
      if (!staged) items.push(...hideShowItems(targets));
      if (!targets.some((p) => inheritedAt(p).length)) items.push(place('move', `Move${noun} to another place`, 'moveTo'));
      items.push(place('add', `Add${noun} to another place`, 'copy'));
    }
    if (ent.children.length)
      items.push({
        label: 'Expand all inside',
        icon: 'expand',
        kbd: '⌥ Click',
        onClick: () => {
          walkSubtree(path, (k, id, e, p) => setExpanded(p, true));
          render();
        },
      });
    const posId = !many && posIdOf(info.kind, ent);
    if (posId) items.push({ label: 'Copy POS ID', icon: 'copy', hint: posId, onClick: () => copyText(posId, 'POS ID') });
    sep();
    if (many) {
      const removable = removableRows(targets);
      const where = sharedParent(removable.length ? removable : targets);
      items.push({
        label: info.kind === 'category' ? 'Remove from menu' : where ? `Remove from ${where}` : `Remove ${BULK_NOUN[info.kind][1]}`,
        icon: 'x',
        tone: 'danger',
        kbd: '⌫',
        disabled: !removable.length,
        onClick: bulkRemove,
      });
    } else items.push({ label: `Remove from ${parentName}`, icon: 'x', tone: 'danger', kbd: '⌫', onClick: () => confirmRemove(path) });
    items.push(...deleteItems(path, targets));
    openPopover(anchor, items, opts);
  }

  function hideShowItems(targets) {
    const rows = targets.filter((p) => !pendingRoot(p));
    if (!rows.length) return [];
    const where = sharedParent(rows);
    const scope = where ? `in ${where}` : 'in each place';
    if (rows.length > 1) {
      const [one, many] = BULK_NOUN[parsePath(rows[0]).kind];
      const hideN = rows.filter((p) => !groupHiddenAt(p) && canHideHere(p)).length;
      const showN = rows.filter((p) => groupHiddenAt(p) && canShowHere(p)).length;
      return [
        hideN && { label: `Hide ${plural(hideN, one, many)} ${scope}`, icon: 'eyeOff', onClick: () => bulkSetHidden(true, rows) },
        showN && { label: `Show ${plural(showN, one, many)} ${scope}`, icon: 'eye', onClick: () => bulkSetHidden(false, rows) },
      ].filter(Boolean);
    }
    const [path] = rows;
    const info = parsePath(path);
    const hidden = groupHiddenAt(path);
    let why = '';
    if (hidden && !canShowHere(path)) why = 'Hidden only in one product. Change it on the Options tab of its group';
    else if (!hidden && info.kind === 'group') {
      const g = entity('group', info.id);
      if (!g.children.length) why = 'It has no options to hide';
      else if (rulesOf(g).min > 0) why = 'Required groups can’t be hidden. Set the minimum to 0 first';
    }
    return [{ label: `${hidden ? 'Show' : 'Hide'} ${scope}`, icon: hidden ? 'eye' : 'eyeOff', disabled: !!why, hint: why, onClick: () => bulkSetHidden(!hidden, [path]) }];
  }

  function deleteItems(path, targets) {
    const info = parsePath(path);
    if (targets.length > 1) {
      const { ok, noun } = bulkDeleteState();
      const tooMany = ok.length > DELETE_MAX;
      if (!ok.length) return [];
      return [{ label: `Delete ${noun(ok.length)}`, icon: 'trash', tone: 'danger', disabled: tooMany, hint: tooMany ? `Delete up to ${DELETE_MAX} at a time` : '', onClick: bulkDelete }];
    }
    const ent = entity(info.kind, info.id);
    if (!ent || ent.pending || pendingRoot(path)) return [];
    const block = deleteBlockOf(info.kind, ent);
    const run = () => (info.kind === 'product' ? confirmDeleteProduct(ent) : info.kind === 'group' ? confirmDeleteGroup(ent, path) : confirmDeleteCategory(ent));
    return [{ label: `Delete ${KIND_LABEL[info.kind].toLowerCase()}`, icon: 'trash', tone: 'danger', disabled: !!block, hint: block, onClick: run }];
  }

  function openReplaceCodes() {
    if (!bulkCodeState().ok.length) return;
    openModal({ title: 'Replace modifier codes', body: '<div id="mc"></div>', foot: '<div class="modal-foot" id="mc-foot"></div>' });
    T.mc = { codes: [], pre: null, req: false };
    renderReplaceCodes();
    const first = $('#mc .chip');
    if (first) first.focus({ preventScroll: true });
  }

  function renderReplaceCodes() {
    const o = T.mc;
    if (!o || !$('#mc')) return;
    const { ok, skipped, noun } = bulkCodeState();
    const focus = captureFocus();
    const codeChips = C.modifierCodes
      .map(([v, l]) => {
        const on = o.codes.includes(v);
        return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-action="mc-code" data-id="${esc(v)}" data-focus-key="mc-code~${esc(v)}">${on ? icon('check', 12) : ''}${esc(l)}</button>`;
      })
      .join('');
    const rows = o.codes
      .map((v) => {
        const on = o.pre === v;
        const l = codeLabel(v);
        return `<div class="store-row list-row code-row">
          <button type="button" class="check-toggle opt-pick" role="radio" aria-checked="${on}" aria-label="Preselect ${esc(l)}" data-action="mc-pre" data-id="${esc(v)}" data-focus-key="mc-pre~${esc(v)}"><span class="check is-round${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span></button>
          <span class="store-name">${esc(l)}</span>
          ${on ? '<span class="code-hint">Preselected</span>' : ''}
        </div>`;
      })
      .join('');
    $('#mc').innerHTML = `<p>${esc(noun(ok.length))} get the codes you select, in that order. Their other codes are removed.</p>
      ${skipped ? `<p class="field-help">${plural(skipped, 'product is', 'products are')} skipped. Option folders and choice products do not have modifier codes.</p>` : ''}
      ${field('Codes', `<div class="chips">${codeChips}</div>`, { help: o.codes.length ? 'Codes are in the order you select them.' : 'Select none to remove all codes.' })}
      ${toggle('mc-req', o.req, { label: 'Require a modifier code', action: 'mc-req', help: o.codes.length ? 'Customers need a code to choose these options.' : 'Add a code first.', disabled: !o.codes.length })}
      ${o.codes.length ? field('Preselection', `<div class="store-list" role="radiogroup" aria-label="Preselected code">${rows}</div>`, { help: `${o.req ? 'One code is always preselected.' : 'Preselect one code at most.'} Customers can change it.` }) : ''}`;
    $('#mc-foot').innerHTML = `<button type="button" class="btn secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn primary" data-action="mc-apply">Replace codes</button>`;
    restoreFocus(focus);
  }

  function editReplaceCodes(action, v) {
    const o = T.mc;
    if (!o) return;
    if (action === 'mc-code') {
      o.codes = o.codes.includes(v) ? o.codes.filter((c) => c !== v) : [...o.codes, v];
      if (!o.codes.includes(o.pre)) o.pre = null;
      if (!o.codes.length) o.req = false;
    } else if (action === 'mc-pre') {
      if (o.pre === v && o.req) return;
      o.pre = o.pre === v ? null : v;
    } else if (action === 'mc-req') {
      if (!o.codes.length) return;
      o.req = !o.req;
    }
    if (o.req && !o.pre) o.pre = o.codes[0];
    renderReplaceCodes();
  }

  function menuTabMenu(anchor, id, opts) {
    const m = menuById(id);
    if (!m) return;
    const i = S.data.menus.indexOf(m);
    const dupBlock = menuDuplicateBlock(m);
    const delBlock = menuDeleteBlock(m);
    openPopover(
      anchor,
      [
        { label: 'Duplicate menu', icon: 'copy', disabled: !!dupBlock, hint: dupBlock, onClick: () => duplicateMenu(id) },
        '-',
        { label: 'Move left', icon: 'chevLeft', disabled: i === 0, onClick: () => moveMenu(id, i - 1) },
        { label: 'Move right', icon: 'chevRight', disabled: i === S.data.menus.length - 1, onClick: () => moveMenu(id, i + 1) },
        '-',
        { label: 'Delete menu', icon: 'trash', tone: 'danger', disabled: !!delBlock, hint: delBlock, onClick: () => handleAction({ dataset: { action: 'delete-menu', id } }) },
      ],
      { align: 'start', label: `${nameOf('menu', m)} actions`, ...opts },
    );
  }

  function canvasMoreMenu(anchor) {
    const menu = activeMenu();
    const changes = ctx.compare.count;
    const opt = optimizeState(menu);
    openPopover(
      anchor,
      [
        { label: 'Compare to POS', icon: 'diff', hint: changes ? `${plural(changes, 'change', 'changes')} to review` : '', onClick: openCompare },
        { label: 'Optimize', icon: 'sparkles', hint: opt.hint, onClick: openOptimize },
        { label: 'Upload images', icon: 'upload', disabled: !ctx.counts.product, hint: ctx.counts.product ? '' : 'Add products first', onClick: openBulkImages },
        '-',
        { label: 'Show POS IDs', icon: 'link', hint: 'In the menu tree and the POS items list', checked: !!S.ui.showPosIds, onClick: () => toggleView('showPosIds') },
        { label: 'Show internal names', icon: 'tag', hint: 'In the menu tree', checked: !S.ui.hideInternalNames, onClick: () => toggleView('hideInternalNames') },
        { label: 'Show images', icon: 'image', hint: 'In the menu tree', checked: !S.ui.hideImages, onClick: () => toggleView('hideImages') },
      ],
      { align: 'end', label: 'More actions' },
    );
  }

  function toggleView(key) {
    S.ui[key] = !S.ui[key];
    render();
  }

  function appMenu(anchor) {
    openPopover(anchor, [
      { label: 'Discard items not imported', icon: 'x', disabled: !ctx.pending.length || T.importing, onClick: discardStaged },
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
                  localStorage.removeItem(storageKey());
                  seed();
                  normalizeAll();
                  S.ui = defaultUi();
                  focusPosCategory();
                  clearHistory();
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

  function openImage(src) {
    if (!src) return;
    let url = src;
    if (src.startsWith('data:')) {
      const [head, data] = src.split(',');
      const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: head.slice(5).split(';')[0] }));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    window.open(url, '_blank', 'noopener');
  }

  function loadImage(file, maxSide, done) {
    if (!file || !IMAGE_TYPES.includes(file.type)) {
      toast('Could not add the image. Use a JPG, PNG, or GIF file.', 'error');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast('Could not add the image. Choose a file of 1 MB or less.', 'error');
      return;
    }
    shrinkImage(file, maxSide).then(done, () => toast('Could not add the image. Use a JPG, PNG, or GIF file.', 'error'));
  }

  function shrinkImage(file, maxSide, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(src);
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(src);
        reject(new Error('unreadable'));
      };
      img.src = src;
    });
  }

  function readImage(file, bind) {
    loadImage(file, /\|bannerImage$/.test(bind) ? 1200 : 480, (url) => commit(() => setBind(bind, url)));
  }
