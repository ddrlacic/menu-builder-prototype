'use strict';

  function togglePosRow(row) {
    const state = searchTerm(S.ui.posQuery) ? T.posSearchExpanded : S.ui.posExpanded;
    const refocus = row === document.activeElement;
    state[row.dataset.key] = row.getAttribute('aria-expanded') !== 'true';
    renderPos();
    if (refocus) focusPosKey(row.dataset.rowKey);
    if (state === S.ui.posExpanded) schedulePersist();
  }

  function focusPosRow(row) {
    if (!row) return;
    T.posFocus = row.dataset.rowKey;
    $$('#pos-tree .pos-row[tabindex="0"]').forEach((r) => (r.tabIndex = -1));
    row.tabIndex = 0;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }

  const focusPosKey = (key) => focusPosRow($(`#pos-tree .pos-row[data-row-key="${cssEsc(key)}"]`));

  function posKeys(e) {
    const rows = $$('#pos-tree .pos-row');
    const cur = e.target.closest('.pos-row');
    const i = rows.indexOf(cur);
    const open = cur.getAttribute('aria-expanded');
    const go = (r) => {
      if (!r) return;
      e.preventDefault();
      focusPosRow(r);
    };
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      extendPosSelection(cur, e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        go(rows[i + 1]);
        break;
      case 'ArrowUp':
        go(rows[i - 1]);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (open === 'false') togglePosRow(cur);
        else if (open === 'true') go(rows[i + 1]);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (open === 'true') return togglePosRow(cur);
        const level = Number(cur.getAttribute('aria-level'));
        go(rows.slice(0, i).reverse().find((r) => Number(r.getAttribute('aria-level')) < level));
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const key = cur.dataset.rowKey;
        cur.querySelector('[data-action="pos-add"]').click();
        focusPosKey(key);
        break;
      }
      default:
        break;
    }
  }

  function togglePosPanel(open = !!S.ui.posCollapsed) {
    hideTip();
    const a = document.activeElement;
    const hadFocus = !!(a.closest('.pos') || a.matches('[data-action="pos-panel"]'));
    S.ui.posCollapsed = !open;
    render();
    if (hadFocus) $(open ? '[data-focus-key="pos-hide"]' : '[data-focus-key="pos-show"]').focus();
  }

  function focusPosSearch() {
    if (S.ui.posCollapsed) togglePosPanel(true);
    $('#pos-search').focus();
  }

  document.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (!row || e.target.closest('[data-action]')) return;
    S.ui.tabs[row.dataset.kind] = 'general';
    T.focusName = true;
    select(row.dataset.path);
  });

  document.addEventListener('contextmenu', (e) => {
    const fromKeyboard = !e.clientX && !e.clientY;
    const tab = e.target.closest('.menu-tab[data-id]');
    if (tab) {
      e.preventDefault();
      hideTip();
      menuTabMenu(tab, tab.dataset.id, fromKeyboard ? undefined : { at: { x: e.clientX, y: e.clientY } });
      return;
    }
    const row = e.target.closest('#canvas-tree .row');
    if (!row) return;
    e.preventDefault();
    hideTip();
    rowMenu(row.querySelector('[data-action="remove-row"]'), row.dataset.path, 'more', fromKeyboard ? undefined : { at: { x: e.clientX, y: e.clientY }, align: 'start' });
  });

  document.addEventListener('beforeinput', (e) => {
    const t = e.target;
    const type = t.dataset && t.dataset.type;
    if (type !== 'int' && type !== 'num') return;
    const data = e.data != null ? e.data : e.dataTransfer ? e.dataTransfer.getData('text/plain') : null;
    if (data == null) return;
    const next = t.value.slice(0, t.selectionStart) + data + t.value.slice(t.selectionEnd);
    if (!(type === 'int' ? /^\d*$/ : /^\d*\.?\d*$/).test(next)) e.preventDefault();
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
      const was = !!canvasTerm();
      S.ui.canvasQuery = t.value;
      T.canvasSearchOpen = {};
      if (was && !canvasTerm()) revealSelection();
      render();
      return;
    }
    if (t.matches('[data-opt-edit]') && T.optRun) {
      T.optRun.edits[t.dataset.optEdit] = t.value;
      renderOptimize();
      return;
    }
    if (t.id === 'picker-search' && T.picker) {
      T.picker.query = t.value;
      renderPicker();
      return;
    }
    if (t.id === 'lp-search' && T.lp) {
      T.lp.query = t.value;
      renderListPicker();
      return;
    }
    if (t.id === 'ms-search' && T.ms) {
      T.ms.query = t.value;
      renderManageStores();
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
    if (t.matches('[data-bind]') && t.tagName !== 'SELECT' && t.type !== 'time' && t.type !== 'datetime-local') {
      const v = parseInput(t);
      commit(() => setBind(t.dataset.bind, v), { key: t.dataset.bind });
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'store-group') {
      const id = t.value;
      t.value = S.ui.storeGroupId;
      confirmSwitchStoreGroup(id);
    } else if (t.matches('select[data-bind], input[type="time"][data-bind], input[type="datetime-local"][data-bind]')) {
      commit(() => setBind(t.dataset.bind, t.value));
    } else if (t.matches('[data-pos-set]')) {
      const info = parsePath(t.dataset.path);
      const pInfo = parsePath(info.parentPath);
      const siblings = entity(pInfo.kind, pInfo.id).children;
      const n = parseInt(t.value, 10);
      const to = Number.isFinite(n) ? Math.max(1, Math.min(siblings.length, n)) : siblings.indexOf(info.id) + 1;
      t.value = String(to);
      moveChild(t.dataset.path, to - 1);
    } else if (t.matches('[data-menu-order]')) {
      const n = parseInt(t.value, 10);
      const to = Number.isFinite(n) ? clamp(n, 1, S.data.menus.length) : S.data.menus.findIndex((m) => m.id === t.dataset.id) + 1;
      t.value = String(to);
      moveMenu(t.dataset.id, to - 1);
    } else if (t.matches('input[type="file"][data-image]')) {
      readImage(t.files[0], t.dataset.image);
    } else if (t.matches('input[type="file"][data-bi-files]') && T.bi) {
      receiveBulkImages([...t.files].map((file) => ({ file, rel: file.webkitRelativePath || file.name })));
    } else if (t.matches('select[data-bi-pick]') && T.bi) {
      T.bi.picks[t.dataset.biPick] = Number(t.value);
      renderBulkImages();
    } else if (t.id === 'row-image-input' && t.files[0] && T.rowImage) {
      const paths = T.rowImage;
      T.rowImage = null;
      loadImage(t.files[0], 480, (url) => applyImage(paths, url));
    }
  });

  document.addEventListener('pointerdown', (e) => {
    T.dismissing = !!T.popover;
    if (T.popover && !T.popover.el.contains(e.target) && !T.popover.anchor.contains(e.target)) closePopover();
  });

  function moveInList(bind, from, to, refocus = false) {
    const list = (getBind(bind) || []).slice();
    if (to === from || to < 0 || to >= list.length) return false;
    list.splice(to, 0, list.splice(from, 1)[0]);
    commit(() => setBind(bind, list));
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-sortable="${CSS.escape(bind)}"] [data-sort-index="${to}"]`);
      if (!row) return;
      row.classList.add('is-flash');
      if (refocus) row.focus({ preventScroll: true });
    });
    return true;
  }

  document.addEventListener('pointerdown', (e) => {
    const row = e.button === 0 && e.target.closest('[data-sortable] [data-sort-index]');
    if (!row || e.target.closest('button, input, a')) return;
    const list = row.closest('[data-sortable]');
    const startY = e.clientY;
    let rows, from, to, box, r, step, mids;
    let lifted = false;
    const lift = () => {
      lifted = true;
      rows = [...list.querySelectorAll('[data-sort-index]')];
      from = to = rows.indexOf(row);
      box = { top: rows[0].getBoundingClientRect().top, bottom: rows[rows.length - 1].getBoundingClientRect().bottom };
      r = row.getBoundingClientRect();
      step = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
      mids = rows.map((x) => {
        const b = x.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      row.setPointerCapture(e.pointerId);
      list.classList.add('is-sorting');
      row.classList.add('is-lifted');
    };
    const move = (ev) => {
      if (!lifted) {
        if (Math.abs(ev.clientY - startY) < 4) return;
        lift();
      }
      const dy = clamp(ev.clientY - startY, box.top - r.top, box.bottom - r.bottom);
      const mid = mids[from] + dy;
      to = mids.filter((m, i) => i !== from && m < mid).length;
      row.style.transform = `translateY(${dy}px)`;
      rows.forEach((x, i) => {
        if (x === row) return;
        const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!lifted || moveInList(list.dataset.sortable, from, to)) return;
      list.classList.remove('is-sorting');
      row.classList.remove('is-lifted');
      rows.forEach((x) => (x.style.transform = ''));
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });

  document.addEventListener('keydown', (e) => {
    const row = (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.matches && e.target.matches('[data-sortable] [data-sort-index]');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    const from = Number(e.target.dataset.sortIndex);
    moveInList(e.target.closest('[data-sortable]').dataset.sortable, from, from + (e.key === 'ArrowUp' ? -1 : 1), true);
  }, true);
  const nestOrder = (list) =>
    [...list.querySelectorAll('.nest-block')].map((b) => ({ sid: b.dataset.sid, ids: [...b.querySelectorAll('[data-nest-row="item"]')].map((x) => x.dataset.id) }));

  function applyNest(list, order, focus) {
    const key = list.dataset.nest;
    commit(() => arrangeSections(key, order));
    requestAnimationFrame(() => {
      const fresh = document.querySelector(`[data-nest="${CSS.escape(key)}"]`);
      const el = fresh && fresh.querySelector(focus.sid ? `.nest-block[data-sid="${CSS.escape(focus.sid)}"] .nest-head` : `[data-nest-row="item"][data-id="${CSS.escape(focus.id)}"]`);
      if (!el) return;
      el.classList.add('is-flash');
      if (focus.keyboard) el.focus({ preventScroll: true });
    });
  }

  document.addEventListener('pointerdown', (e) => {
    const handle = e.button === 0 && e.target.closest('.nest-list [data-nest-row]');
    if (!handle || e.target.closest('button, input, a')) return;
    const list = handle.closest('.nest-list');
    const isSection = handle.dataset.nestRow === 'section';
    if (isSection && list.querySelectorAll('.nest-block:not(.nest-outside)').length < 2) return;
    const moving = isSection ? handle.closest('.nest-block') : handle;
    const startY = e.clientY;
    let lifted = false;
    let slots, box, r, line, pick;
    const lift = () => {
      lifted = true;
      box = list.getBoundingClientRect();
      r = moving.getBoundingClientRect();
      const blocks = [...list.querySelectorAll(isSection ? '.nest-block:not(.nest-outside)' : '.nest-block')];
      if (isSection) {
        const others = blocks.filter((b) => b !== moving);
        slots = others.map((b, i) => ({ y: b.getBoundingClientRect().top - 4, at: i }));
        if (others.length) slots.push({ y: others[others.length - 1].getBoundingClientRect().bottom + 4, at: others.length });
      } else {
        slots = blocks.flatMap((b) => {
          const head = b.querySelector('.nest-head');
          const rows = [...b.querySelectorAll('[data-nest-row="item"]')].filter((x) => x !== moving);
          const first = { y: (b.querySelector('.field-error') || head).getBoundingClientRect().bottom, sid: b.dataset.sid, at: 0 };
          return [first, ...rows.map((x, i) => ({ y: x.getBoundingClientRect().bottom, sid: b.dataset.sid, at: i + 1 }))];
        });
      }
      line = document.createElement('div');
      line.className = 'nest-line';
      list.appendChild(line);
      handle.setPointerCapture(e.pointerId);
      list.classList.add('is-nesting');
      moving.classList.add('is-lifted');
    };
    const move = (ev) => {
      if (!lifted) {
        if (Math.abs(ev.clientY - startY) < 4) return;
        lift();
      }
      const dy = clamp(ev.clientY - startY, box.top - r.top - 8, box.bottom - r.bottom + 8);
      moving.style.transform = `translateY(${dy}px)`;
      const y = (dy < 0 ? r.top : r.bottom) + dy;
      pick = slots.reduce((best, s) => (Math.abs(s.y - y) < Math.abs(best.y - y) ? s : best), slots[0]);
      if (pick) line.style.top = `${pick.y - box.top - 1}px`;
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!lifted) return;
      line.remove();
      list.classList.remove('is-nesting');
      moving.classList.remove('is-lifted');
      moving.style.transform = '';
      if (!pick) return;
      const order = nestOrder(list);
      if (isSection) {
        const sid = moving.dataset.sid;
        const from = order.findIndex((o) => o.sid === sid);
        const [block] = order.splice(from, 1);
        order.splice(pick.at, 0, block);
        if (pick.at !== from) applyNest(list, order, { sid });
      } else {
        const id = moving.dataset.id;
        const src = order.find((o) => o.ids.includes(id));
        const was = src.ids.indexOf(id);
        src.ids.splice(was, 1);
        order.find((o) => o.sid === pick.sid).ids.splice(pick.at, 0, id);
        if (src.sid !== pick.sid || pick.at !== was) applyNest(list, order, { id });
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !e.target.matches || !e.target.matches('.nest-list [data-nest-row]')) return;
    e.preventDefault();
    e.stopPropagation();
    const up = e.key === 'ArrowUp';
    const list = e.target.closest('.nest-list');
    const order = nestOrder(list);
    if (e.target.dataset.nestRow === 'section') {
      const sid = e.target.closest('.nest-block').dataset.sid;
      const from = order.findIndex((o) => o.sid === sid);
      const to = from + (up ? -1 : 1);
      if (to < 0 || to >= order.filter((o) => o.sid).length) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      return applyNest(list, order, { sid, keyboard: true });
    }
    const id = e.target.dataset.id;
    const si = order.findIndex((o) => o.ids.includes(id));
    const ids = order[si].ids;
    const i = ids.indexOf(id);
    ids.splice(i, 1);
    if (up && i > 0) ids.splice(i - 1, 0, id);
    else if (!up && i < ids.length) ids.splice(i + 1, 0, id);
    else if (up && si > 0) order[si - 1].ids.push(id);
    else if (!up && si < order.length - 1) order[si + 1].ids.unshift(id);
    else return;
    applyNest(list, order, { id, keyboard: true });
  }, true);

  window.addEventListener('resize', closePopover);
  $('#canvas-scroll').addEventListener('scroll', closePopover, { passive: true });

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || document.body.dataset.dragKind || document.querySelector('.is-sorting, .is-nesting')) return;
    const a = tipTarget(e.target);
    if (a) showTip(a);
    else if (T.tip && !T.tip.anchor.contains(e.target)) hideTip();
  });
  document.addEventListener('pointerout', (e) => {
    if (T.tip && T.tip.anchor.contains(e.target) && !T.tip.anchor.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('focusin', (e) => {
    const a = e.target.matches && e.target.matches(':focus-visible') && tipTarget(e.target);
    if (a === e.target) showTip(a);
  });
  document.addEventListener('focusout', (e) => T.tip && T.tip.anchor === e.target && hideTip());
  document.addEventListener('scroll', hideTip, { capture: true, passive: true });
  window.addEventListener('resize', hideTip);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || document.body.dataset.dragKind) return;
    const a = e.target.closest('[data-id-card]');
    if (!a) return;
    clearTimeout(T.idCardTimer);
    if (T.idCard) return showIdCard(a);
    T.idCardTimer = setTimeout(() => a.isConnected && showIdCard(a), 300);
  });
  document.addEventListener('pointerout', (e) => {
    const a = e.target.closest('[data-id-card]');
    if (!a || a.contains(e.relatedTarget)) return;
    if (T.idCard) scheduleHideIdCard();
    else clearTimeout(T.idCardTimer);
  });
  $('#canvas-scroll').addEventListener('scroll', () => hideIdCard(true), { passive: true });
  window.addEventListener('resize', () => hideIdCard(true));
  document.addEventListener('dragstart', () => hideIdCard(true));

  /* drag and drop */

  function unmark(el) {
    delete el.dataset.drop;
    el.style.removeProperty('--drop-depth');
  }

  function clearDropMark() {
    if (T.markedRow) {
      unmark(T.markedRow);
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
    delete document.body.dataset.menuDrop;
    $('#drag-hint').dataset.show = 'false';
    T.drag = null;
  }

  const DRAG_HINT = {
    menu: 'Drop on the canvas to add all its categories',
    category: 'Drop on the menu to add a category',
    product: 'Drop on its POS category, a group, or a menu-only category',
    group: 'Drop on a product that has this group on POS',
  };
  const MOVE_HINT = {
    category: 'Drop between categories to change the order',
    product: 'Drop between products to change the order, or on a category or group to move it. Hold ⌥ to add it there too.',
    group: 'Drop between groups to change the order, or on a product to move it. Hold ⌥ to add it there too.',
    section: 'Drop between sections to change the order',
  };
  const DRAG_HINT_MANY = {
    category: 'Drop on the menu to add the categories',
    product: 'Drop on their POS category, a group, or a menu-only category',
    group: 'Drop on a product that has these groups on POS',
  };
  const baseHint = (d) => {
    if (d.multi && d.origin === 'pos') return DRAG_HINT_MANY[d.kind];
    const hint = (d.origin === 'canvas' ? MOVE_HINT : DRAG_HINT)[d.kind];
    return d.multi ? hint.replace('. Hold ⌥ to add it there too.', '').replace(/\bit\b/, 'them') : hint;
  };

  function autoPlaceManyHint(d) {
    const pm = posMenu();
    if (T.newMenu) return `Drop to link the new menu to ${pm.name}`;
    const menu = menuOfPosMenu(pm);
    if (!menu) return 'Drop to add them with their POS menu';
    const other = menu !== activeMenu() ? menu.name : '';
    if (d.kind === 'category') return `Drop to add them to the end of ${other || 'the menu'}`;
    const inOther = other ? ` in ${other}` : '';
    const parents = [...new Set(d.multi.map((x) => x.posPath[x.posPath.length - 2]))];
    if (parents.length === 1) return `Drop to add them under ${posLabel(parents[0])}${inOther}`;
    const types = [...new Set(parents.map((p) => (posItemById(p) || {}).type))];
    return types.length === 1 && BULK_NOUN[types[0]] ? `Drop to add them under their POS ${BULK_NOUN[types[0]][1]}${inOther}` : `Drop to add them where they are on POS${inOther}`;
  }

  function autoPlaceHint(d) {
    if (d.origin === 'canvas') return `Drop to move ${d.multi ? 'them' : 'it'} to the end of the menu`;
    if (d.multi) return autoPlaceManyHint(d);
    const chain = d.posPath || [];
    if (d.kind !== 'menu' && d.kind !== 'category' && chain.length < 2) return DRAG_HINT[d.kind];
    const pm = posMenuOf(d);
    if (pm && T.newMenu) return `Drop to link the new menu to ${pm.name}`;
    const menu = pm && menuOfPosMenu(pm);
    if (pm && !menu) return d.kind === 'menu' ? `Drop to add ${pm.name} as a menu` : 'Drop to add it with its POS menu';
    const other = menu && menu !== activeMenu() ? menu.name : '';
    if (d.kind === 'menu') return `Drop to add all categories from ${d.name}${other ? ` to ${other}` : ''}`;
    if (d.kind === 'category') return `Drop to add it to the end of ${other || 'the menu'}`;
    return `Drop to add it under ${posLabel(chain[chain.length - 2])}${other ? ` in ${other}` : ''}`;
  }

  const menuCardDrop = (d) => (d.origin === 'pos' ? d.kind === 'menu' || d.kind === 'category' || (d.posPath || []).length >= 2 : d.kind === 'category');

  window.addEventListener('beforeunload', (e) => {
    if (!S.data || !pendingRows().length) return;
    e.preventDefault();
    e.returnValue = '';
  });

  document.addEventListener('dragstart', (e) => {
    if (T.importing) {
      e.preventDefault();
      return;
    }
    const posRow = e.target.closest && e.target.closest('.pos-row');
    const row = e.target.closest && e.target.closest('.row');
    if (posRow) {
      const multi = posSelFor(posRow);
      T.drag = multi ? { ...multi[0], multi, name: plural(multi.length, ...BULK_NOUN[multi[0].kind]) } : posRowDesc(posRow);
    } else if (row && T.sel.length > 1 && T.sel.includes(row.dataset.path)) {
      const multi = multiDragDescs(T.sel);
      T.drag = { ...dragDescFromPath(row.dataset.path), multi, name: plural(multi.length, ...BULK_NOUN[row.dataset.kind]) };
      $$('#canvas-tree .row.is-selected').forEach((r) => r.classList.add('is-dragging'));
    } else if (row) {
      T.drag = dragDescFromPath(row.dataset.path);
      row.classList.add('is-dragging');
    } else return;
    closePopover();
    e.dataTransfer.effectAllowed = T.drag.origin === 'pos' ? 'copy' : 'copyMove';
    e.dataTransfer.setData('text/plain', T.drag.name);
    const ghost = $('#drag-ghost');
    ghost.innerHTML = `<span class="kind-glyph kind-${T.drag.glyph || T.drag.kind}">${icon(KIND_ICON[T.drag.kind], 13)}</span>${esc(T.drag.name)}`;
    e.dataTransfer.setDragImage(ghost, 16, 18);
    document.body.dataset.dragKind = T.drag.kind;
    const cardText = $('.menu-card-drop');
    if (cardText && menuCardDrop(T.drag)) {
      cardText.textContent = autoPlaceHint(T.drag);
      document.body.dataset.menuDrop = '';
    }
    setHint(baseHint(T.drag));
    $('#drag-hint').dataset.show = 'true';
  });

  document.addEventListener('dragend', endDrag);

  function endTabDrag() {
    T.tabDrag = null;
    $$('.menu-tab[data-drop]').forEach((t) => delete t.dataset.drop);
    $$('.menu-tab.is-dragging').forEach((t) => t.classList.remove('is-dragging'));
  }

  document.addEventListener('dragstart', (e) => {
    const tab = e.target.closest && e.target.closest('.menu-tab');
    if (!tab || T.importing) return;
    T.tabDrag = tab.dataset.id;
    tab.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.textContent.trim());
  });
  document.addEventListener('dragend', endTabDrag);
  document.addEventListener('dragover', (e) => {
    if (!T.tabDrag) return;
    const tab = e.target.closest && e.target.closest('.menu-tab[data-id]');
    $$('.menu-tab[data-drop]').forEach((t) => t !== tab && delete t.dataset.drop);
    if (!tab) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tab.dataset.id === T.tabDrag) return delete tab.dataset.drop;
    const r = tab.getBoundingClientRect();
    tab.dataset.drop = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  });
  document.addEventListener('drop', (e) => {
    if (!T.tabDrag) return;
    const id = T.tabDrag;
    const tab = e.target.closest && e.target.closest('.menu-tab[data-id]');
    const pos = tab && tab.dataset.drop;
    if (tab) e.preventDefault();
    endTabDrag();
    if (!pos) return;
    const rest = S.data.menus.map((m) => m.id).filter((x) => x !== id);
    moveMenu(id, rest.indexOf(tab.dataset.id) + (pos === 'after' ? 1 : 0));
  });

  function dropPositionFor(row, e, d) {
    const path = row.dataset.path;
    if (d.origin === 'canvas' && (d.multi || [d]).some((x) => path === x.path || path.startsWith(`${x.path}>`))) return null;
    const kind = row.dataset.kind;
    const inside = row.dataset.childKind === d.kind;
    if (kind !== d.kind) return inside ? 'inside' : null;
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (inside && y > 0.25 && y < 0.75) return 'inside';
    return y < 0.5 ? 'before' : 'after';
  }

  function snapTarget(row, e, d) {
    const segs = row.dataset.path.split('>');
    let anc = null;
    for (let i = segs.length - 1; i > 1 && !anc; i--) {
      const p = segs.slice(0, i).join('>');
      if (parsePath(p).kind === d.kind) anc = p;
    }
    if (!anc || (d.origin === 'canvas' && (d.multi || [d]).some((x) => anc === x.path || anc.startsWith(`${x.path}>`)))) return null;
    const rows = $$('#canvas-tree .row').filter((r) => r.dataset.path === anc || r.dataset.path.startsWith(`${anc}>`));
    const head = rows.find((r) => r.dataset.path === anc);
    if (!head) return null;
    const last = rows[rows.length - 1];
    const top = head.getBoundingClientRect().top;
    const bottom = last.getBoundingClientRect().bottom;
    const pos = e.clientY < (top + bottom) / 2 ? 'before' : 'after';
    return { path: anc, pos, mark: pos === 'before' ? head : last, depth: head.style.getPropertyValue('--depth') };
  }

  function sectionBlockRows(head) {
    const rows = $$('#canvas-tree .row');
    const level = Number(head.getAttribute('aria-level'));
    const out = [head];
    for (let i = rows.indexOf(head) + 1; i < rows.length && Number(rows[i].getAttribute('aria-level')) > level; i++) out.push(rows[i]);
    return out;
  }

  function sectionHeadFor(row, hostPath) {
    const rows = $$('#canvas-tree .row');
    let level = Number(row.getAttribute('aria-level'));
    for (let i = rows.indexOf(row); i >= 0; i--) {
      const r = rows[i];
      const lv = Number(r.getAttribute('aria-level'));
      if (i !== rows.indexOf(row) && lv >= level) continue;
      if (r.dataset.kind === 'section' && parsePath(r.dataset.path).parentPath === hostPath) return r;
      if (r.dataset.path === hostPath) return null;
      level = lv;
    }
    return null;
  }

  function sectionDragOver(e, row, d) {
    const head = sectionHeadFor(row, d.hostPath);
    if (T.markedRow) unmark(T.markedRow);
    canvasEl.classList.remove('drop-end');
    T.markedRow = null;
    T.dropTarget = null;
    if (!head) {
      T.markedRow = row;
      row.dataset.drop = 'invalid';
      const hi = parsePath(d.hostPath);
      return setHint(`Sections move only within ${nameOf(hi.kind, entity(hi.kind, hi.id))}`, 'error');
    }
    const block = sectionBlockRows(head);
    const pos = e.clientY < (head.getBoundingClientRect().top + block[block.length - 1].getBoundingClientRect().bottom) / 2 ? 'before' : 'after';
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHint(baseHint(d));
    if (head.dataset.path === d.path) return;
    const mark = pos === 'before' ? head : block[block.length - 1];
    mark.dataset.drop = pos;
    mark.style.setProperty('--drop-depth', head.style.getPropertyValue('--depth'));
    T.markedRow = mark;
    T.dropTarget = { path: head.dataset.path, pos };
  }

  const canvasEl = $('#canvas');
  canvasEl.addEventListener('dragover', (e) => {
    const d = T.drag;
    if (!d) return;
    const row = e.target.closest('.row');
    if (d.kind === 'section') {
      if (row) return sectionDragOver(e, row, d);
      clearDropMark();
      return;
    }
    const menuCard = e.target.closest('.menu-card');
    if ((d.origin === 'pos' && d.kind === 'menu') || (menuCard && menuCardDrop(d))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = d.origin === 'pos' ? 'copy' : 'move';
      if (T.markedRow && T.markedRow !== menuCard) unmark(T.markedRow);
      T.markedRow = menuCard;
      if (menuCard) menuCard.dataset.drop = 'inside';
      canvasEl.classList.toggle('drop-end', !menuCard);
      T.dropTarget = { auto: true };
      setHint(autoPlaceHint(d));
      return;
    }
    if (row) {
      let pos = dropPositionFor(row, e, d);
      let path = row.dataset.path;
      let mark = row;
      let depth = null;
      if (!pos && row.dataset.kind !== d.kind) {
        const snap = snapTarget(row, e, d);
        if (snap) ({ pos, path, mark, depth } = snap);
      }
      if (T.markedRow && T.markedRow !== mark) unmark(T.markedRow);
      canvasEl.classList.remove('drop-end');
      T.markedRow = mark;
      if (!pos) {
        unmark(row);
        T.dropTarget = null;
        setHint(baseHint(d));
        return;
      }
      if (depth !== null) mark.style.setProperty('--drop-depth', depth);
      else mark.style.removeProperty('--drop-depth');
      const link = d.origin === 'canvas' && e.altKey;
      const target = { path, pos, link };
      const { parentPath } = resolveDrop(d, target);
      const err = d.multi
        ? link
          ? 'Drag one row at a time to add it to another place'
          : d.origin === 'pos'
            ? posMultiDropError(parentPath, d.multi)
            : multiDropError(parentPath, d.multi)
        : link
          ? linkError(d, parentPath)
          : dropError(parentPath, d);
      if (err) {
        if (mark !== row) {
          unmark(mark);
          T.markedRow = row;
        }
        row.dataset.drop = 'invalid';
        T.dropTarget = null;
        setHint(err, 'error');
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = d.origin === 'pos' || link ? 'copy' : 'move';
      mark.dataset.drop = pos;
      T.dropTarget = target;
      const pi = parsePath(parentPath);
      setHint(link ? `Drop to also add it to ${nameOf(pi.kind, entity(pi.kind, pi.id))}` : baseHint(d));
      return;
    }
    if (T.markedRow) {
      unmark(T.markedRow);
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
      if (T.drag) setHint(baseHint(T.drag));
    }
  });

  canvasEl.addEventListener('drop', (e) => {
    const d = T.drag;
    const t = T.dropTarget;
    if (!d) return;
    e.preventDefault();
    endDrag();
    if (!t) return;
    if (d.kind === 'section') {
      const from = sectionAt(d.path);
      const to = sectionAt(t.path);
      if (!from || !to) return;
      const at = to.index + (t.pos === 'after' ? 1 : 0);
      return moveSection(d.path, at > from.index ? at - 1 : at);
    }
    if (d.multi) return d.origin === 'pos' ? performPosMultiDrop(d.multi, t) : confirmMultiDrop(d.multi, t);
    if (t.link) {
      const { parentPath, index } = resolveDrop(d, t);
      return linkExisting(parentPath, d.kind, d.id, index);
    }
    confirmDrop(d, t);
  });

  const imageRowOf = (e) => !T.drag && e.target.closest && e.target.closest('#canvas-tree .row[data-image-ok]');
  const rowImagePaths = (path) => (T.sel.length > 1 && T.sel.includes(path) ? T.sel.slice() : [path]);
  function markImageRow(row) {
    if (T.imageOverRow === row) return;
    if (T.imageOverRow) T.imageOverRow.classList.remove('is-image-over');
    T.imageOverRow = row;
    if (!row) return;
    const paths = rowImagePaths(row.dataset.path);
    $$('#canvas-tree .row').forEach((r) => r.classList.toggle('is-image-over', paths.includes(r.dataset.path)));
  }
  const clearImageRows = () => {
    T.imageOverRow = null;
    $$('#canvas-tree .row.is-image-over').forEach((r) => r.classList.remove('is-image-over'));
  };

  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    const zone = e.target.closest && e.target.closest('[data-image-drop], [data-bi-drop]');
    if (zone && !T.drag) {
      e.preventDefault();
      zone.classList.add('is-over');
    }
    const row = imageRowOf(e);
    if (row) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      markImageRow(row);
    } else if (T.imageOverRow) clearImageRows();
  });
  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest && e.target.closest('[data-image-drop], [data-bi-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
    if (T.imageOverRow && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#canvas-tree .row[data-image-ok]'))) clearImageRows();
  });
  document.addEventListener('drop', (e) => {
    const biZone = e.target.closest && e.target.closest('[data-bi-drop]');
    if (biZone && T.bi) {
      e.preventDefault();
      dropBulkImages(e.dataTransfer);
      return;
    }
    const zone = e.target.closest && e.target.closest('[data-image-drop]');
    if (zone && !T.drag && e.dataTransfer.files.length) {
      e.preventDefault();
      readImage(e.dataTransfer.files[0], zone.dataset.imageDrop);
      return;
    }
    const row = imageRowOf(e);
    if (row && e.dataTransfer.files.length) {
      e.preventDefault();
      const paths = rowImagePaths(row.dataset.path);
      clearImageRows();
      loadImage(e.dataTransfer.files[0], 480, (url) => applyImage(paths, url));
    } else if (T.imageOverRow) clearImageRows();
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
    if (e.altKey && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      nudgeSelection(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.shiftKey && e.key === 'F10' && cur) {
      e.preventDefault();
      hideTip();
      rowMenu(cur.querySelector('[data-action="remove-row"]'), cur.dataset.path, 'more');
      return;
    }
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      extendSelection(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
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
          setExpanded(cur.dataset.path, true);
          T.focusRow = cur.dataset.path;
          render();
        } else if (cur.getAttribute('aria-expanded') === 'true') go(rows[i + 1]);
        break;
      case 'ArrowLeft': {
        if (!cur) return;
        e.preventDefault();
        if (cur.getAttribute('aria-expanded') === 'true') {
          setExpanded(cur.dataset.path, false);
          T.focusRow = cur.dataset.path;
          render();
        } else {
          const parent = cur.dataset.halfOf || sectionOfRow(cur.dataset.path) || parsePath(cur.dataset.path).parentPath;
          if (parent && parent.includes('>')) select(parent, { focusRow: true });
        }
        break;
      }
      case 'Backspace':
      case 'Delete':
        if (T.sel.length > 1) {
          e.preventDefault();
          bulkRemove();
        } else if (cur) {
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
    if (e.key === 'Escape' && T.tip) return hideTip();
    if (e.key === 'Escape') {
      if (T.idCard) return hideIdCard();
      if (T.popover) {
        const a = T.popover.anchor;
        closePopover();
        if (a && a.isConnected) a.focus();
        return;
      }
      if (T.modal) return closeModal();
      if (typing && (e.target.id === 'canvas-search' || e.target.id === 'pos-search') && e.target.value) {
        e.preventDefault();
        e.target.value = '';
        e.target.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const posRow = e.target.closest && e.target.closest('#pos-tree .pos-row');
      if (typing) e.target.blur();
      else if (posRow && T.posSel.length) clearPosSelection(posRow.dataset.rowKey);
      else if (T.sel.length > 1) select(S.ui.selected, { focusRow: true });
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
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && !T.modal) {
      e.preventDefault();
      togglePosPanel();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a' && !T.modal && !typing && e.target.closest && e.target.closest('#canvas-tree')) {
      e.preventDefault();
      selectAllOfKind();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !T.modal && $('#canvas-search')) {
      e.preventDefault();
      $('#canvas-search').focus();
      $('#canvas-search').select();
      return;
    }
    if (mod && !e.altKey && e.key === '/' && !T.modal) {
      e.preventDefault();
      toggleShortcuts();
      return;
    }
    if (e.target.id === 'canvas-search' && (e.key === 'ArrowDown' || e.key === 'Enter') && !mod && !e.shiftKey && !e.altKey) {
      const row = $('#canvas-tree .row.is-hit') || $('#canvas-tree .row');
      if (row) {
        e.preventDefault();
        select(row.dataset.path, { focusRow: true });
      }
      return;
    }
    if (e.target.id === 'pos-search' && (e.key === 'ArrowDown' || e.key === 'Enter') && !mod && !e.shiftKey && !e.altKey) {
      const row = $('#pos-tree .pos-row.is-hit') || $('#pos-tree .pos-row');
      if (row) {
        e.preventDefault();
        focusPosRow(row);
      }
      return;
    }
    if (T.modal || typing || mod) return;
    const tab = e.target.closest && e.target.closest('.menu-tab[data-id]');
    if (tab && e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      hideTip();
      menuTabMenu(tab, tab.dataset.id);
      return;
    }
    if (tab && e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const id = tab.dataset.id;
      moveMenu(id, S.data.menus.findIndex((m) => m.id === id) + (e.key === 'ArrowRight' ? 1 : -1));
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      toggleShortcuts();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      focusPosSearch();
      return;
    }
    if (e.target.closest && e.target.closest('#pos-tree .pos-row')) posKeys(e);
    else if (e.target.closest && e.target.closest('#canvas-tree')) treeKeys(e);
  });

  document.addEventListener('focusin', (e) => {
    const row = e.target.closest && e.target.closest('#pos-tree .pos-row');
    if (row) T.posFocus = row.dataset.rowKey;
  });
