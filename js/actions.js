'use strict';

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
        const remove = () => {
          closeModal();
          commit(() => {
            S.data.menus = S.data.menus.filter((x) => x.id !== m.id);
            const next = S.data.menus[0] || null;
            S.ui.activeMenuId = next ? next.id : null;
            S.ui.selected = next ? next.id : null;
          });
          toast('Menu deleted');
        };
        if (!m.publishedAt) {
          openModal({
            title: `Delete ${m.name}?`,
            body: '<p>This will permanently delete the menu</p>',
            actions: [
              { label: 'Cancel', kind: 'secondary', onClick: closeModal },
              { label: 'Delete', kind: 'danger', onClick: remove },
            ],
          });
          break;
        }
        openModal({
          title: `Delete ${m.name}?`,
          size: 'lg',
          body: `<h3 class="delete-warning-title">This action cannot be undone. Proceed with caution.</h3>
            <ul class="delete-warning-list">
              <li>${icon('alertCircle', 18)}<span>This menu will be removed from all stores, online ordering channels, external channels, and associated order types</span></li>
              <li>${icon('alertCircle', 18)}<span>Categories and products within this menu will not be deleted</span></li>
              <li>${icon('alertCircle', 18)}<span>If you have active advanced orders you will not be able to delete this menu. Please cancel all outstanding orders before proceeding.</span></li>
            </ul>
            <button type="button" class="check-toggle delete-confirm-check" role="checkbox" aria-checked="false" data-action="delete-confirm-toggle">
              <span class="check" aria-hidden="true"></span>Yes, I understand
            </button>`,
          actions: [
            { label: 'Cancel', kind: 'secondary', onClick: closeModal },
            { label: 'Delete forever', kind: 'danger', disabled: true, onClick: remove },
          ],
        });
        break;
      }
      case 'delete-confirm-toggle': {
        const checked = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', String(checked));
        $('.check', el).classList.toggle('is-on', checked);
        $('.check', el).innerHTML = checked ? icon('check', 12) : '';
        const confirm = $('[data-modal-act="1"]', $('#modal-root'));
        if (confirm) confirm.disabled = !checked;
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
        walkMenu(activeMenu(), (k, id, ent, p) => {
          S.ui.expanded[p] = false;
        });
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
      case 'group-halves':
        e.stopPropagation();
        openHalfMatch(el.dataset.id);
        break;
      case 'dismiss-half-hint':
        dismissHalfHint(el.dataset.id);
        break;
      case 'hh-item': {
        const k = el.dataset.key;
        if (T.hh.off.has(k)) T.hh.off.delete(k);
        else T.hh.off.add(k);
        renderHalfMatch();
        break;
      }
      case 'hh-apply':
        applyHalfMatch();
        break;
      case 'half-pick':
        openHalfPicker(entity('group', parsePath(S.ui.selected).id), el.dataset.id, el.dataset.side);
        break;
      case 'half-clear': {
        const g = entity('group', parsePath(S.ui.selected).id);
        commit(() => {
          const h = g.halves[el.dataset.id];
          if (h) delete h[el.dataset.side];
        });
        break;
      }
      case 'half-filter':
        T.halfFilter = el.dataset.value;
        render();
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
        const cur = getBind(bind);
        const from = isNum(cur) ? cur : el.dataset.start != null ? Number(el.dataset.start) : 0;
        const next = clamp(from + Number(el.dataset.delta), Number(el.dataset.min), Number(el.dataset.max));
        commit(() => setBind(bind, el.dataset.keepZero ? next : next || null), { key: bind });
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
      case 'menu-manage-stores':
        openManageStores(activeMenu());
        break;
      case 'menu-group-remove':
        removeMenuStoreGroup(activeMenu(), el.dataset.id);
        break;
      case 'ms-open':
        T.ms.open.has(el.dataset.id) ? T.ms.open.delete(el.dataset.id) : T.ms.open.add(el.dataset.id);
        renderManageStores();
        break;
      case 'ms-only':
        T.ms.onlySelected = !T.ms.onlySelected;
        renderManageStores();
        break;
      case 'ms-store':
        setManageStores(el.dataset.group, [el.dataset.id], el.getAttribute('aria-checked') !== 'true');
        break;
      case 'ms-group': {
        const x = manageStoresGroups().find((r) => r.g.id === el.dataset.id);
        if (x) setManageStores(x.g.id, x.list.map((s) => s.id), el.dataset.on === '1');
        break;
      }
      case 'ms-all': {
        const on = el.dataset.on === '1';
        manageStoresGroups().forEach(({ g, list }) => list.forEach((s) => (on ? T.ms.sel[g.id].add(s.id) : T.ms.sel[g.id].delete(s.id))));
        renderManageStores();
        break;
      }
      case 'ms-save':
        saveManageStores();
        break;
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
        if (!draft || !draft.segmentId.trim() || !draft.tag.trim()) break;
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
          const row = btn.closest('.list-row, .segment-row, .opt-item');
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
      case 'add-choice':
        openPosProductPicker(S.ui.selected);
        break;
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
      case 'group-place-toggle':
        togglePlace('group', entity('group', parsePath(S.ui.selected).id), 'product', el.dataset.id);
        break;
      case 'group-link':
      case 'group-change-link':
        openGroupLinkPicker(entity('group', parsePath(S.ui.selected).id));
        break;
      case 'group-unlink':
        unlinkGroup(entity('group', parsePath(S.ui.selected).id));
        break;
      case 'group-delete':
        confirmDeleteGroup(entity('group', parsePath(el.dataset.path).id), el.dataset.path);
        break;
      case 'rules-reset': {
        const g = entity('group', parsePath(S.ui.selected).id);
        commit(() => (g.ruleOverrides = {}));
        toast('Rules reset to POS', 'success', { action: { label: 'Undo', onClick: undo } });
        break;
      }
      case 'pre-pick': {
        const g = entity('group', parsePath(S.ui.selected).id);
        const pid = el.dataset.id;
        const on = (g.preselected[pid] || 0) > 0;
        if (on && rulesOf(g).type === 2) break;
        commit(() => (g.preselected = on ? {} : { [pid]: 1 }));
        break;
      }
      case 'pre-reset':
        commit(() => setBind(`pl|${el.dataset.path}|preselected`, null));
        break;
      case 'swap-add':
        openGroupSwapPicker(entity('group', parsePath(S.ui.selected).id), el.dataset.id);
        break;
      case 'sub-customize':
      case 'half-customize': {
        const p = entity('product', parsePath(S.ui.selected).id);
        const [gid, pid] = el.dataset.key.split(':');
        commit(() => {
          if (a === 'sub-customize') p.substitutes[el.dataset.key] = substitutesAt(p, gid, pid).ids.slice();
          else p.halfWhole[el.dataset.key] = { ...halvesAt(p, gid, pid).h };
        });
        break;
      }
      case 'sub-reset':
      case 'half-reset': {
        const p = entity('product', parsePath(S.ui.selected).id);
        commit(() => delete (a === 'sub-reset' ? p.substitutes : p.halfWhole)[el.dataset.key]);
        break;
      }
      case 'opt-section-add': {
        const g = entity('group', parsePath(S.ui.selected).id);
        commit(() => g.sections.push({ id: uid('osec'), name: `Section ${g.sections.length + 1}` }));
        requestAnimationFrame(() => {
          const inputs = document.querySelectorAll(`[data-bind^="e|group|${g.id}|sections."][data-bind$=".name"]`);
          const last = inputs[inputs.length - 1];
          if (last) last.select();
        });
        break;
      }
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
        const catPath = `${m.id}>c:${catId}`;
        const anyHidden = cat.children.some((pid) => placement(childPath(catPath, 'product', pid)).hidden);
        openModal({
          title: `Remove ${nameOf('category', cat)} from ${menuName}?`,
          body: `<p>${anyHidden ? `Products you hid in ${esc(menuName)} are shown again if you add it back. ` : ''}${cat.source === 'pos' ? 'It stays on POS.' : 'Nothing changes on POS.'}</p>
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
              label: ms.length ? 'Delete forever' : 'Delete category',
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
      case 'cat-delete-ack':
      case 'delete-ack': {
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
      case 'image-view':
        openImage(el.dataset.src || getBind(el.dataset.bind));
        break;
      case 'image-use-pos': {
        const { bind, src } = el.dataset;
        const current = getBind(bind);
        if (!current) {
          commit(() => setBind(bind, src));
          toast('POS image successfully added', 'success', { action: { label: 'Undo', onClick: undo } });
          break;
        }
        openModal({
          title: 'Replace image?',
          body: `<div class="image-compare">
              <figure><img class="image-preview" src="${esc(current)}" alt=""><figcaption class="field-help">Current</figcaption></figure>
              ${icon('chevRight', 16)}
              <figure><img class="image-preview" src="${esc(src)}" alt=""><figcaption class="field-help">POS</figcaption></figure>
            </div>
            <p>The POS image replaces the current one. It stays the same when POS changes.</p>`,
          actions: [
            { label: 'Cancel', kind: 'secondary', onClick: closeModal },
            {
              label: 'Replace image',
              kind: 'primary',
              onClick: () => {
                closeModal();
                commit(() => setBind(bind, src));
                toast('Image successfully replaced', 'success', { action: { label: 'Undo', onClick: undo } });
              },
            },
          ],
        });
        break;
      }
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
      commit(() => setBind(bind, !getBind(bind)));
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
