'use strict';

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
    const ck = childKind(pi.kind, parent);
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
    if (pi.kind === 'category') {
      const own = !isVirtual(parent);
      return openAddPicker({
        title: 'Add POS product',
        intro: own ? `Products in ${posLabel(parent.externalId)} on POS.` : 'Any product from POS. It keeps its POS price and options.',
        parentPath,
        ids: own ? posChildren(parent.externalId) : posProductChoices().map((c) => c.id),
        noun: own ? `products from ${posLabel(parent.externalId)}` : 'POS products',
      });
    }
    if (parent.gtype === 'standalone' || parent.ptype === 'size') {
      return openAddPicker({
        title: 'Add POS product',
        intro: parent.ptype === 'size' ? 'Customers pick one of these products. The one they pick is sent to POS.' : 'Each product customers pick is added to the order as its own item.',
        parentPath,
        ids: posProductChoices().map((c) => c.id),
        noun: 'POS products',
      });
    }
    const gpos = posIdOf('group', parent);
    openAddPicker({
      title: 'Add POS option',
      intro: `Options of ${posLabel(gpos)} on POS.`,
      parentPath,
      ids: posChildren(gpos),
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
    commit(() => insertNew(categoryPath, 'product', newProduct({ ptype: 'size', name: 'New choice product' })));
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
          out.push({ id: pid, name: posLabel(pid), alt: posItemById(pid).name, meta: `${posLabel(cid)} · ${pid}` });
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
    const [gid, originId] = key.split(':');
    const chosen = substitutesAt(p, gid, originId).ids;
    const seen = new Set([originId, p.id, ...chosen]);
    const items = productOptions(p)
      .filter((o) => !seen.has(o.pid) && seen.add(o.pid))
      .map((o) => ({ id: o.pid, name: nameOf('product', o.x), alt: o.x.internalName || '', meta: nameOf('group', o.g), price: '' }));
    openListPicker({
      title: `Add substitutes for ${nameOf('product', entity('product', originId))}`,
      intro: `Options from the groups of ${nameOf('product', p)}.`,
      items,
      empty: 'Every option is already a substitute',
      onAdd: (pid) => (p.substitutes[key] = [...substitutesAt(p, gid, originId).ids, pid]),
    });
  }

  function openGroupSwapPicker(g, originId) {
    const chosen = new Set([originId, ...(g.swaps[originId] || [])]);
    openListPicker({
      title: `Add substitutes for ${optionName(g, originId)}`,
      intro: `Options in ${nameOf('group', g)}. To offer an option from another group, add the substitute on the product instead.`,
      items: g.children
        .filter((pid) => !chosen.has(pid) && entity('product', pid) && entity('product', pid).ptype !== 'container')
        .map((pid) => ({ id: pid, name: optionName(g, pid), alt: entity('product', pid).internalName || '', meta: '', price: '' })),
      empty: `Every option in ${nameOf('group', g)} is already a substitute`,
      onAdd: (pid) => (g.swaps[originId] = [...(g.swaps[originId] || []), pid]),
    });
  }

  function confirmCopyToChoices(p) {
    const kids = p.children.map((id) => entity('product', id)).filter(Boolean);
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

  const toggleProductPlace = (p, kind, id) => togglePlace('product', p, kind, id);

  function togglePlace(childKind, child, kind, id) {
    const parent = entity(kind, id);
    const name = nameOf(kind, parent);
    if (!parent.children.includes(child.id)) {
      commit(() => parent.children.push(child.id));
      toast(`Added to ${name}`, 'success', { action: { label: 'Undo', onClick: undo } });
      return;
    }
    const seg = `${SEG[kind]}:${id}>${SEG[childKind]}:${child.id}`;
    const inSeg = (k) => k.endsWith(`>${seg}`) || k.includes(`>${seg}>`);
    commit(() => {
      parent.children = parent.children.filter((c) => c !== child.id);
      for (const k of Object.keys(S.data.placements)) if (inSeg(k)) delete S.data.placements[k];
      if (inSeg(S.ui.selected)) {
        const at = S.ui.selected.indexOf(`>${seg}`);
        S.ui.selected = S.ui.selected.slice(0, at + 1 + `${SEG[kind]}:${id}`.length);
      }
    });
    toast(`Removed from ${name}`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function dropOptions(g, pids) {
    if (!pids.length) return;
    const segs = pids.map((pid) => `g:${g.id}>p:${pid}`);
    const hit = (k) => segs.some((s) => k.endsWith(`>${s}`) || k.includes(`>${s}>`));
    g.children = g.children.filter((pid) => !pids.includes(pid));
    for (const k of Object.keys(S.data.placements)) if (hit(k)) delete S.data.placements[k];
    if (hit(S.ui.selected)) S.ui.selected = S.ui.selected.slice(0, S.ui.selected.indexOf(`>g:${g.id}>`) + `>g:${g.id}`.length);
  }

  function posGroupChoices(g) {
    const own = new Set(groupParents(g.id).flatMap((p) => posChildren(posIdOf('product', p))));
    return Object.entries(S.data.pos.items)
      .filter(([id, it]) => it.type === 'group' && id !== g.posGroupExt)
      .sort(([a], [b]) => own.has(b) - own.has(a))
      .map(([id, it]) => ({
        id,
        name: posLabel(id),
        alt: it.name,
        meta: `${C.groupTypes[it.groupType || 1].label} · ${plural((it.children || []).length, 'option', 'options')} · ${id}`,
        price: own.has(id) ? 'On this product' : '',
      }));
  }

  function openGroupLinkPicker(g) {
    const changing = g.gtype === 'linked';
    openPicker({
      title: changing ? 'Change the linked POS group' : 'Link to a POS group',
      intro: 'Choices then ring up on POS as options of this group, at its POS prices. Options that are not in the POS group are removed.',
      placeholder: 'Search by group name or POS ID',
      items: posGroupChoices(g),
      noMatch: ['No matching POS groups', 'Try a different name or POS ID.'],
      onPick: (posId) => {
        closeModal(true);
        linkGroup(g, posId);
      },
    });
  }

  function linkGroup(g, posId) {
    const allowed = posChildren(posId);
    const dropped = g.children.filter((pid) => {
      const x = entity('product', pid);
      return !x || (x.ptype !== 'container' && !(x.source === 'pos' && allowed.includes(x.externalId)));
    });
    const apply = () => {
      commit(() => {
        g.gtype = 'linked';
        g.posGroupExt = posId;
        delete g.role;
        dropOptions(g, dropped);
      });
      toast(`Linked to ${posLabel(posId)}`, 'success', { action: { label: 'Undo', onClick: undo } });
    };
    if (!dropped.length) return apply();
    openModal({
      title: `Link to ${posLabel(posId)}?`,
      body: `<p>${plural(dropped.length, 'option is', 'options are')} not in ${esc(posLabel(posId))} on POS, so ${dropped.length === 1 ? 'it is' : 'they are'} removed from this group: ${esc(listJoin(dropped.map((pid) => nameOf('product', entity('product', pid)))))}.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Link group', kind: 'primary', onClick: () => { closeModal(); apply(); } },
      ],
    });
  }

  function unlinkGroup(g) {
    const was = posLabel(g.posGroupExt);
    const dropped = g.children.filter((pid) => {
      const x = entity('product', pid);
      return x && x.source === 'pos' && !posCategoriesOf(x.externalId).length;
    });
    openModal({
      title: `Unlink from ${was}?`,
      body: `<p>Its options become suggested products. Each pick then goes on the order as its own item, at its own POS price.</p>
        ${dropped.length ? `<p>${plural(dropped.length, 'option is', 'options are')} sold only as options on POS, so ${dropped.length === 1 ? 'it is' : 'they are'} removed: ${esc(listJoin(dropped.map((pid) => nameOf('product', entity('product', pid)))))}.</p>` : ''}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Unlink group',
          kind: 'primary',
          onClick: () => {
            closeModal();
            commit(() => {
              g.gtype = 'standalone';
              g.posGroupExt = null;
              g.type = 1;
              dropOptions(g, dropped);
            });
            toast(`Unlinked from ${was}`, 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
  }

  function confirmDeleteGroup(g, path) {
    const parents = groupParents(g.id);
    openModal({
      title: `Delete ${nameOf('group', g)}?`,
      body: `<ul class="modal-list">
          ${parents.length ? `<li>It is removed from ${parents.length > 1 ? `${parents.length} products: ` : ''}${esc(listJoin(parents.map((p) => nameOf('product', p))))}, with its settings there.</li>` : ''}
          <li>Its options are not deleted.</li>
          <li>${g.source === 'pos' ? 'It stays on POS. You can add it back from POS items.' : 'It exists only in this menu builder, so nothing changes on POS.'}</li>
        </ul>
        ${parents.length ? '<button type="button" class="check-toggle" role="checkbox" aria-checked="false" data-action="delete-ack"><span class="check" aria-hidden="true"></span>Yes, I understand</button>' : ''}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: parents.length ? 'Delete forever' : 'Delete group',
          kind: 'danger',
          onClick: () => {
            closeModal();
            commit(() => {
              parents.forEach((p) => (p.children = p.children.filter((c) => c !== g.id)));
              for (const k of Object.keys(S.data.placements)) if (k.split('>').includes(`g:${g.id}`)) delete S.data.placements[k];
              delete S.data.entities.group[g.id];
              S.ui.selected = parsePath(path).parentPath;
            });
            toast('Group deleted', 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
    if (!parents.length) return;
    $('#modal-root .modal-foot .btn.danger').disabled = true;
    $('#modal-root [data-action="delete-ack"]').focus({ preventScroll: true });
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
    }, { menu: menuById(info.menuId) });
    if (ok && !quiet) toast(`${KIND_LABEL[info.kind]} removed`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function moveChild(path, to) {
    const info = parsePath(path);
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const from = parent.children.indexOf(info.id);
    const dest = Math.max(0, Math.min(parent.children.length - 1, to));
    if (from < 0 || dest === from) return false;
    return commit(
      () => {
        parent.children.splice(from, 1);
        parent.children.splice(dest, 0, info.id);
      },
      { menu: menuById(info.menuId) },
    );
  }

  function dropRemovedStores(m) {
    const on = new Set(menuStores(m).map((s) => s.id));
    const gone = m.publishedStoreIds.filter((id) => !on.has(id));
    m.publishedStoreIds = m.publishedStoreIds.filter((id) => on.has(id));
    m.ownTimesStoreIds = m.ownTimesStoreIds.filter((id) => on.has(id));
    return gone;
  }

  function removeMenuStoreGroup(m, groupId) {
    const grp = m.storeGroups.find((a) => a.id === groupId);
    if (!grp) return;
    const name = (groupDef(groupId) || { name: groupId }).name;
    const published = assignedStores(grp).filter((s) => m.publishedStoreIds.includes(s.id)).length;
    const remove = () => {
      const ok = commit(() => {
        m.storeGroups = m.storeGroups.filter((a) => a.id !== groupId);
        dropRemovedStores(m);
      });
      if (ok) toast('Store group removed', 'success', { action: { label: 'Undo', onClick: undo } });
    };
    if (!published) return remove();
    openModal({
      title: `Remove ${name}?`,
      body: `<p>The menu is published at ${plural(published, 'store', 'stores')} in this group. Customers there can no longer order from it. This happens right away.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Remove store group', kind: 'danger', onClick: () => { closeModal(); remove(); } },
      ],
    });
  }

  function confirmRemoveCategory(cat, m) {
    const menuName = nameOf('menu', m);
    const catPath = `${m.id}>c:${cat.id}`;
    const elsewhere = S.data.menus.some((x) => x.id !== m.id && x.children.includes(cat.id));
    const anyHidden = cat.children.some((pid) => placement(childPath(catPath, 'product', pid)).hidden);
    openModal({
      title: `Remove ${nameOf('category', cat)} from ${menuName}?`,
      body: `<p>${m.publishedStoreIds.length ? `Customers stop seeing it in ${esc(menuName)} right away. ` : ''}${anyHidden ? `Products you hid in ${esc(menuName)} are shown again if you add it back. ` : ''}${cat.source === 'pos' ? 'It stays on POS.' : 'Nothing changes on POS.'}</p>
        ${elsewhere ? '' : callout('warning', 'It is not in any other menu, so customers will not see it anywhere.')}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Remove category', kind: 'danger', onClick: () => { closeModal(); removeLink(catPath); } },
      ],
    });
  }

  function confirmRemove(path) {
    const info = parsePath(path);
    if (info.kind === 'menu') return;
    if (info.kind === 'category') return confirmRemoveCategory(entity('category', info.id), menuById(info.menuId));
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
