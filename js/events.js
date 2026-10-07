'use strict';

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
      S.ui.canvasQuery = t.value;
      render();
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
    if (t.id === 'ot-search' && T.ot) {
      T.ot.query = t.value;
      renderOwnTimesStores();
      return;
    }
    if (t.id === 'ms-search' && T.ms) {
      T.ms.query = t.value;
      renderManageStores();
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
    if (t.matches('[data-bind]') && t.tagName !== 'SELECT' && t.type !== 'time' && t.type !== 'datetime-local') {
      const v = parseInput(t);
      commit(() => setBind(t.dataset.bind, v), { key: t.dataset.bind });
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'store-group') {
      const next = datasetOf(t.value);
      if (next === dataset) {
        S.ui.storeGroupId = t.value;
        loadPos('store-group', render);
      } else {
        persistNow();
        S.ui.storeGroupId = t.value;
        loadPos('store-group', () => switchDataset(next, t.value));
      }
    } else if (t.matches('[data-ms-field]') && T.ms && T.ms.bulk) {
      T.ms.bulk[t.dataset.msField] = t.value;
      renderManageStores();
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
    } else if (t.matches('input[type="file"][data-image]')) {
      readImage(t.files[0], t.dataset.image);
    }
  });

  document.addEventListener('pointerdown', (e) => {
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
    if (isSection && list.querySelectorAll('.nest-block').length < 2) return;
    const moving = isSection ? handle.closest('.nest-block') : handle;
    const startY = e.clientY;
    let lifted = false;
    let slots, box, r, line, pick;
    const lift = () => {
      lifted = true;
      box = list.getBoundingClientRect();
      r = moving.getBoundingClientRect();
      const blocks = [...list.querySelectorAll('.nest-block')];
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
      if (to < 0 || to >= order.length) return;
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
    const inside = row.dataset.childKind === d.kind;
    if (kind !== d.kind) return inside ? 'inside' : null;
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (inside && y > 0.25 && y < 0.75) return 'inside';
    return y < 0.5 ? 'before' : 'after';
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
          const parent = cur.dataset.halfOf || parsePath(cur.dataset.path).parentPath;
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
