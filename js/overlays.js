'use strict';

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
        const check = it.checked !== undefined;
        return `<button type="button" role="${check ? 'menuitemcheckbox' : 'menuitem'}" ${check ? `aria-checked="${!!it.checked}"` : ''} class="pop-item${it.tone ? ` tone-${it.tone}` : ''}" data-pop="${i}" ${it.disabled ? 'disabled' : ''}>
            ${it.icon ? icon(it.icon, 15) : ''}<span class="pop-label">${esc(it.label)}${it.hint ? `<span class="pop-hint">${esc(it.hint)}</span>` : ''}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.submenu ? icon('chevRight', 14) : ''}${it.checked ? `<span class="pop-check">${icon('check', 15)}</span>` : ''}
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

  function openModal({ title, body, actions = [], size = 'md', foot = '' }) {
    closeModal(true);
    const root = $('#modal-root');
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
    T.ms = null;
    T.ot = null;
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

  function openListPicker({ title, intro, groups, empty, noun, placeholder = `Search ${noun[1]}`, onAdd }) {
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
    T.lp = { groups, empty, noun, onAdd, sel: new Set(), open: new Set(groups.length === 1 || total <= 40 ? groups.map((g) => g.id) : []), query: '', onlySelected: false };
    renderListPicker();
    $('#lp-search').focus();
  }

  function listPickerGroups() {
    const o = T.lp;
    const q = o.query.trim().toLowerCase();
    return o.groups
      .map((g) => {
        let list = g.items;
        if (o.onlySelected) list = list.filter((it) => o.sel.has(it.id));
        if (q && !g.name.toLowerCase().includes(q)) list = list.filter((it) => [it.name, it.alt, it.meta].some((s) => (s || '').toLowerCase().includes(q)));
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
      const n = list.filter((it) => o.sel.has(it.id)).length;
      return n === 0 ? 'off' : n === list.length ? 'on' : 'mixed';
    };
    const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
    const checked = (st) => (st === 'mixed' ? 'mixed' : String(st === 'on'));
    const allSt = stateOf(groups.flatMap((x) => x.list));
    const row = (it) => {
      const on = o.sel.has(it.id);
      return `<button type="button" class="ms-row ms-store" role="checkbox" aria-checked="${on}" data-action="lp-item" data-id="${esc(it.id)}">${box(on ? 'on' : 'off')}${it.thumb || ''}<span class="ms-name">${esc(it.name)}${it.alt ? `<span class="ms-sub">${esc(it.alt)}</span>` : ''}</span>${it.meta ? `<span class="ms-city">${esc(it.meta)}</span>` : ''}</button>`;
    };
    $('#lp-list').innerHTML = !o.groups.length
      ? `<div class="empty-small">${icon('checkCircle', 18)}<strong>${esc(o.empty)}</strong></div>`
      : groups.length
        ? `<div class="ms-tree">
          <button type="button" class="ms-row ms-all" role="checkbox" aria-checked="${checked(allSt)}" data-action="lp-all" data-on="${allSt === 'on' ? 0 : 1}">${box(allSt)}Select all</button>
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
                  <button type="button" class="ms-row" role="checkbox" aria-checked="${checked(st)}" data-action="lp-group" data-id="${esc(g.id)}" data-on="${st === 'on' ? 0 : 1}">${box(st)}<strong class="ms-name">${esc(g.name)}</strong><span class="ms-city tnum">${g.items.filter((it) => o.sel.has(it.id)).length} of ${g.items.length}</span></button>
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
    $('#lp-foot').innerHTML = `<button type="button" class="check-toggle ms-only" role="checkbox" aria-checked="${o.onlySelected}" data-action="lp-only"${o.groups.length ? '' : ' disabled'}>${box(o.onlySelected ? 'on' : 'off')}Show only selected</button>
      <button type="button" class="btn secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn primary" data-action="lp-add"${n ? '' : ' disabled'}>${n ? `Add ${plural(n, o.noun[0], o.noun[1])}` : `Add ${esc(o.noun[1])}`}</button>`;
  }

  function setListPicker(ids, on) {
    ids.forEach((id) => (on ? T.lp.sel.add(id) : T.lp.sel.delete(id)));
    renderListPicker();
  }

  function addFromListPicker() {
    const o = T.lp;
    const order = [...new Set(o.groups.flatMap((g) => g.items.map((it) => it.id)))].filter((id) => o.sel.has(id));
    if (!order.length) return;
    closeModal();
    commit(() => o.onAdd(order));
    toast(`${plural(order.length, o.noun[0], o.noun[1])} added`, 'success', { action: { label: 'Undo', onClick: undo } });
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
        : [{ empty: `<strong>No POS groups</strong><span>${esc(nameOf('product', p))} has no groups on POS. Use suggested products instead.</span>` }],
    );
  }

  function rowMenu(anchor, path, which) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const pInfo = parsePath(info.parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    if (which === 'add') {
      const customProduct = {
        label: 'Custom product',
        hint: 'Your name, image, and options for a POS product. POS gets the original',
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
          customProduct,
          { label: 'Choice product', hint: 'Customers pick one product, like a size. Only that product goes to POS', icon: 'package', onClick: () => createChoiceProduct(path) },
        ];
        if (detectSizeSets(ent).length) items.push('-', { label: 'Group sizes', hint: 'Turn size variants into one choice product', icon: 'sparkles', onClick: () => openOptimize(path) });
        return openPopover(anchor, items);
      }
      if (info.kind === 'product' && ent.ptype === 'size') return openPosProductPicker(path);
      if (info.kind === 'product') {
        const items = [
          { heading: 'Add from POS' },
          { label: 'POS group', hint: 'All its options, as on POS', icon: 'layers', submenu: true, onClick: () => posGroupMenu(anchor, path) },
        ];
        if (ent.ptype === 'linked') items.push({ label: 'All POS groups', hint: `Every group of ${posLabel(ent.posParentExt)}`, icon: 'plus', onClick: () => addParentGroups(path) });
        items.push(
          { heading: 'Create' },
          {
            label: 'Custom group',
            hint: 'Your own name and rules for a POS group. POS gets the original group',
            icon: 'link',
            submenu: true,
            onClick: () => linkedGroupMenu(anchor, path),
          },
          { label: 'Suggested products', hint: 'Products customers can add to this item. Each one goes on the order as its own item', icon: 'dashed', onClick: () => createVirtualGroup(path, 'upsell') },
        );
        return openPopover(anchor, items);
      }
      if (ent.gtype === 'standalone') {
        return openPopover(anchor, [
          { heading: 'Add from POS' },
          { label: 'POS product', hint: 'Keeps its own POS price', icon: 'utensils', onClick: () => openPosProductPicker(path) },
          { heading: 'Create' },
          customProduct,
        ]);
      }
      return openPopover(anchor, [
        { heading: 'Add from POS' },
        { label: 'POS option', hint: `From ${posLabel(posIdOf('group', ent))} on POS`, icon: 'utensils', onClick: () => openPosProductPicker(path) },
        { heading: 'Create' },
        {
          label: 'Option folder',
          hint: 'An option that opens more options. POS gets only what customers pick inside',
          icon: 'dashed',
          onClick: () => createVirtualContainer(path),
        },
      ]);
    }
    const items = [];
    if (info.kind === 'category' && detectSizeSets(ent).length) items.push({ label: 'Group sizes', icon: 'sparkles', onClick: () => openOptimize(path) });
    if (info.kind === 'category' && suggestedSizeSets(ent).length) items.push({ label: 'Dismiss suggestion', icon: 'x', onClick: () => dismissSizeHint(path) });
    if (info.kind === 'group' && halfSuggestions(ent).length) items.push({ label: 'Group halves', icon: 'sparkles', onClick: () => openHalfMatch(ent.id) });
    if (info.kind === 'group' && suggestedHalves(ent).length) items.push({ label: 'Dismiss suggestion', icon: 'x', onClick: () => dismissHalfHint(ent.id) });
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
      {
        label: 'Show POS IDs',
        icon: 'link',
        hint: 'In the menu tree and the POS items list',
        checked: !!S.ui.showPosIds,
        onClick: () => {
          S.ui.showPosIds = !S.ui.showPosIds;
          render();
        },
      },
      '-',
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
