'use strict';

  function dragDescFromPath(path) {
    const info = parsePath(path);
    if (info.kind === 'section') {
      const at = sectionAt(path);
      return { origin: 'canvas', path, id: info.id, kind: 'section', name: sectionLabel(at.section), hostPath: at.sc.hostPath, glyph: at.sc.kind === 'group' ? 'gsection' : 'osection' };
    }
    const ent = entity(info.kind, info.id);
    return {
      origin: 'canvas',
      path,
      id: info.id,
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
    if (targetInfo.kind === 'section') return { parentPath: targetInfo.parentPath, index: Infinity, section: { sid: targetInfo.id } };
    if (t.pos === 'inside') return { parentPath: t.path, index: Infinity };
    const parentPath = targetInfo.parentPath;
    const pi = parsePath(parentPath);
    const index = entity(pi.kind, pi.id).children.indexOf(targetInfo.id) + (t.pos === 'after' ? 1 : 0);
    const sc = d.kind !== 'section' ? sectionCtx(parentPath) : null;
    const section = sc && sc.src.sections.length && sc.ids.includes(targetInfo.id) ? { sid: sectionIdIn(sc, targetInfo.id) || '', [t.pos === 'after' ? 'after' : 'before']: targetInfo.id } : null;
    return { parentPath, index, section };
  }

  const inParentRow = (d, parentPath) => d.origin === 'canvas' && parsePath(d.path).parentPath === parentPath;

  function placeDropped(parentPath, ids, section, fresh) {
    const sc = sectionCtx(parentPath);
    if (!sc || !ids.length) return;
    if (section.sid) openRow(childPath(parentPath, 'section', section.sid));
    placeInSection(parentPath, ids, { ...section, shared: fresh && sc.kind === 'option' && !!sc.p && !sc.own });
  }

  function dropInto(d, parentPath, index) {
    const pInfo = parsePath(parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const out = { newPath: null, index, reused: false, linked: null, alsoIn: null, movedTo: null };
    if (pInfo.kind === 'menu' && d.origin === 'pos') out.linked = linkMenuToPosCategory(parent, d.posId);
    const parentName = nameOf(pInfo.kind, parent);
    let moved = false;
    let id;
    if (d.origin === 'pos') {
      const res = importPos(d.posId);
      id = res.id;
      out.reused = res.stats.reused > 0 && res.stats.created === 0;
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
      } else if (inheritedAt(d.path).length) {
        const from = listJoin(inheritedAt(d.path).map((g) => nameOf('group', g)));
        throw new Abort(`${from} adds this group to every option. Remove it on the Options tab of ${from}`);
      }
      moved = oldParent !== parent;
      oldParent.children.splice(oldIndex, 1);
    }
    out.index = Math.min(index, parent.children.length);
    parent.children.splice(out.index, 0, id);
    if (d.origin === 'pos') stagePosLink(parentPath, d.kind, id);
    else if (S.data.pendingLinks[linkKeyOf(d.path)]) {
      delete S.data.pendingLinks[linkKeyOf(d.path)];
      stageLink(pInfo.kind, pInfo.id, d.kind, id);
    }
    if (pInfo.kind !== 'menu') {
      const ck = childKind(pInfo.kind, parent);
      if (reaches(ck, id, pInfo.kind, pInfo.id)) {
        throw new Abort(`${nameOf(d.kind, entity(d.kind, id))} already contains ${parentName}, so it cannot go inside it`);
      }
    }
    if (d.kind === 'product' && d.chainCat) {
      const ent = entity('product', id);
      if (ent.source === 'pos' && !ent.originCategoryExt) ent.originCategoryExt = d.chainCat;
    }
    out.newPath = childPath(parentPath, d.kind, id);
    if (moved) {
      rekeyPlacements(d.path, out.newPath);
      out.movedTo = parentName;
      if (pInfo.kind === 'category' && d.ptype === 'size') keepChoicesInCategory(entity('product', id), parent);
    }
    if (pInfo.kind === 'product' && parent.ptype === 'size') out.alsoIn = keepChoiceInMenu(parentPath, id);
    openRow(parentPath);
    return out;
  }

  function performDrop(d, t) {
    if (t.auto) return autoPlace(d);
    const { parentPath, index, section } = resolveDrop(d, t);
    const err = dropError(parentPath, d);
    if (err) return toast(err, 'error');
    let r = {};
    commit(() => {
      const stay = section && inParentRow(d, parentPath);
      const had = !stay && entity(parsePath(parentPath).kind, parsePath(parentPath).id).children.includes(d.id);
      r = stay ? { newPath: d.path } : dropInto(d, parentPath, index);
      if (section) placeDropped(parentPath, [parsePath(r.newPath).id], section, !stay && !had);
      S.ui.selected = r.newPath;
      if (d.origin === 'canvas') T.focusRow = r.newPath;
      flash(r.newPath);
    });
    const { newPath, movedTo, linked, alsoIn, reused } = r;
    if (newPath && movedTo) toast(`${d.name} moved to ${movedTo}`, 'success', { action: { label: 'Undo', onClick: undo } });
    if (newPath && linked) toast(`Linked to POS menu ${linked.name}`);
    if (newPath && alsoIn) toast(alsoInText(nameOf('product', entity('product', parsePath(newPath).id)), alsoIn));
    if (newPath && reused) {
      const uses = (ctx.usage.get(`${d.kind}:${parsePath(newPath).id}`) || []).length;
      if (uses > 1) toast(`Reusing ${nameOf(d.kind, entity(d.kind, parsePath(newPath).id))}. Edits apply in all ${uses} places`, 'info');
    }
    return { newPath, alsoIn };
  }

  function confirmDrop(d, t) {
    if (d.origin !== 'canvas' || t.auto || isPendingLink(d.path)) return performDrop(d, t);
    const { parentPath } = resolveDrop(d, t);
    const from = parsePath(parsePath(d.path).parentPath);
    const to = parsePath(parentPath);
    if (from.kind === 'menu' || (from.kind === to.kind && from.id === to.id) || dropError(parentPath, d)) return performDrop(d, t);
    const uses = (ctx.usage.get(`${from.kind}:${from.id}`) || []).length;
    if (uses <= 1) return performDrop(d, t);
    openModal({
      title: `Move ${d.name}?`,
      body: `<p>${esc(nameOf(from.kind, entity(from.kind, from.id)))} is used in ${uses} places, so ${esc(d.name)} is removed from all of them. Nothing changes on POS.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: `Move ${KIND_LABEL[d.kind].toLowerCase()}`, kind: 'primary', onClick: () => { closeModal(); performDrop(d, t); } },
      ],
    });
  }

  function multiDragDescs(paths) {
    return paths.filter((p) => !paths.some((o) => o !== p && p.startsWith(`${o}>`))).map(dragDescFromPath);
  }

  const multiDropError = (parentPath, ds) => ds.map((d) => dropError(parentPath, d)).find(Boolean) || null;

  function performMultiDrop(ds, t) {
    const { parentPath, index, section } = resolveDrop(ds[0], t.auto ? { path: activeMenu().id, pos: 'inside' } : t);
    const err = multiDropError(parentPath, ds);
    if (err) return toast(err, 'error');
    const pi = parsePath(parentPath);
    const paths = [];
    let moved = 0;
    const ok = commit(() => {
      let at = index;
      const fresh = [];
      ds.forEach((d) => {
        if (section && inParentRow(d, parentPath)) return paths.push(d.path);
        const had = entity(pi.kind, pi.id).children.includes(d.id);
        const r = dropInto(d, parentPath, at);
        at = r.index + 1;
        paths.push(r.newPath);
        if (!had) fresh.push(parsePath(r.newPath).id);
        if (r.movedTo) moved++;
      });
      if (section) {
        const ids = paths.map((p) => parsePath(p).id);
        placeDropped(parentPath, ids.filter((id) => !fresh.includes(id)), section, false);
        placeDropped(parentPath, fresh, section.sid ? { sid: section.sid } : section, true);
      }
      paths.forEach(flash);
      T.sel = paths;
      S.ui.selected = paths[paths.length - 1];
      T.focusRow = S.ui.selected;
    });
    const [one, many] = BULK_NOUN[ds[0].kind];
    if (ok && moved) toast(`${plural(moved, one, many)} moved to ${nameOf(pi.kind, entity(pi.kind, pi.id))}`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function posDropSplit(parentPath, ds) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    const isIn = (d) => {
      const e = findByExt(d.kind, d.posId);
      return !!e && parent.children.includes(e.id);
    };
    return { fresh: ds.filter((d) => !isIn(d)), present: ds.filter(isIn).length };
  }

  function posMultiDropError(parentPath, ds) {
    const { fresh } = posDropSplit(parentPath, ds);
    if (fresh.length) return multiDropError(parentPath, fresh);
    const pi = parsePath(parentPath);
    return `These ${BULK_NOUN[ds[0].kind][1]} are already in ${nameOf(pi.kind, entity(pi.kind, pi.id))}`;
  }

  function performPosMultiDrop(ds, t) {
    if (t.auto) return autoPlaceMany(ds);
    const { parentPath, index, section } = resolveDrop(ds[0], t);
    const err = posMultiDropError(parentPath, ds);
    if (err) return toast(err, 'error');
    const { fresh, present } = posDropSplit(parentPath, ds);
    const paths = [];
    let linked = null;
    const ok = commit(() => {
      let at = index;
      fresh.forEach((d) => {
        const r = dropInto(d, parentPath, at);
        at = r.index + 1;
        linked = linked || r.linked;
        paths.push(r.newPath);
      });
      if (section) placeDropped(parentPath, paths.map((p) => parsePath(p).id), section, true);
      selectAdded(paths);
    });
    if (!ok) return;
    toast(addedText(paths.length, ds[0].kind, crumbText(parentPath), present));
    if (linked) toast(`Linked to POS menu ${linked.name}`);
  }

  function confirmMultiDrop(ds, t) {
    const { parentPath } = resolveDrop(ds[0], t.auto ? { path: activeMenu().id, pos: 'inside' } : t);
    const to = parsePath(parentPath);
    const shared = [
      ...new Set(
        ds
          .filter((d) => !isPendingLink(d.path))
          .map((d) => parsePath(parsePath(d.path).parentPath))
          .filter((f) => f.kind !== 'menu' && !(f.kind === to.kind && f.id === to.id) && (ctx.usage.get(`${f.kind}:${f.id}`) || []).length > 1)
          .map((f) => nameOf(f.kind, entity(f.kind, f.id))),
      ),
    ];
    if (!shared.length || multiDropError(parentPath, ds)) return performMultiDrop(ds, t);
    const [, many] = BULK_NOUN[ds[0].kind];
    const one = shared.length === 1;
    openModal({
      title: `Move ${plural(ds.length, BULK_NOUN[ds[0].kind][0], many)}?`,
      body: `<p>${esc(listJoin(shared))} ${one ? 'is' : 'are'} used in more than one place, so ${many} in ${one ? 'it' : 'them'} are removed everywhere ${one ? 'it’s' : 'they’re'} used. Nothing changes on POS.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: `Move ${many}`, kind: 'primary', onClick: () => { closeModal(); performMultiDrop(ds, t); } },
      ],
    });
  }

  const posMenuOf = (d) => (d.kind === 'menu' ? S.data.pos.menus.find((m) => m.id === d.posId) : posMenu()) || null;

  function menuOfPosMenu(pm) {
    const active = activeMenu();
    if (active && active.posExt === pm.id) return active;
    return S.data.menus.find((m) => m.posExt === pm.id) || null;
  }

  function autoPlace(d) {
    const chain = d.kind === 'category' ? [d.posId] : d.posPath || [];
    if (d.kind !== 'menu' && d.kind !== 'category' && chain.length < 2) return toast(`${d.name} is sold only as an option on POS. Drop it on a group instead`, 'error');
    const pm = posMenuOf(d);
    if (!pm) return;
    const menu = T.newMenu ? null : menuOfPosMenu(pm);
    if (!menu) return addMenuFromPos(pm, d.kind === 'menu' ? null : chain);
    if (menu !== activeMenu()) {
      S.ui.activeMenuId = menu.id;
      S.ui.selected = menu.id;
      S.ui.canvasQuery = '';
      render();
    }
    if (d.kind === 'menu') return placePosMenu(menu, pm);
    if (d.kind === 'category') return performDrop(d, { path: menu.id, pos: 'inside' });

    const { path, depth } = posChainIn(menu, chain);
    if (depth === chain.length) {
      const parent = parsePath(parsePath(path).parentPath);
      expandTo(path);
      flash(path);
      select(path);
      return toast(`${d.name} is already in ${nameOf(parent.kind, entity(parent.kind, parent.id))}`, 'error');
    }
    if (depth === chain.length - 1) return performDrop(d, { path, pos: 'inside' });

    let r = {};
    commit(() => {
      r = addPosChain(menu, chain, path, depth);
      S.ui.selected = r.newPath;
    });
    if (r.newPath) toast(`Added to ${crumbText(parsePath(r.newPath).parentPath)}`, 'info');
    if (r.newPath && r.linked) toast(`Linked to POS menu ${r.linked.name}`);
  }

  function posChainIn(menu, chain) {
    let path = menu.id;
    let depth = 0;
    for (; depth < chain.length; depth++) {
      const info = parsePath(path);
      const ck = childKind(info.kind, entity(info.kind, info.id));
      const match = entity(info.kind, info.id).children.find((cid) => {
        const c = entity(ck, cid);
        return c && c.source === 'pos' && c.externalId === chain[depth];
      });
      if (!match) break;
      path = childPath(path, ck, match);
    }
    return { path, depth };
  }

  const posChainOf = (d) => (d.kind === 'category' ? [d.posId] : d.posPath || []);

  function selectAdded(paths) {
    paths.forEach((p) => {
      expandTo(p);
      flash(p);
    });
    T.sel = paths.length > 1 ? paths : [];
    S.ui.selected = paths[paths.length - 1];
    T.selAnchor = paths[0];
    T.focusRow = S.ui.selected;
  }

  function addedText(n, kind, where, present) {
    const [one, many] = BULK_NOUN[kind];
    const already = present ? `. ${present} ${present === 1 ? 'was' : 'were'} already there` : '';
    return `${plural(n, one, many)} successfully added to ${where}${already}`;
  }

  function autoPlaceMany(ds) {
    const loose = ds.find((d) => d.kind !== 'category' && posChainOf(d).length < 2);
    if (loose) return toast(`${loose.name} is sold only as an option on POS. Drop it on a group instead`, 'error');
    const pm = posMenu();
    const wasNew = T.newMenu;
    let menu = wasNew ? null : menuOfPosMenu(pm);
    if (menu && menu !== activeMenu()) {
      S.ui.activeMenuId = menu.id;
      S.ui.selected = menu.id;
      S.ui.canvasQuery = '';
      render();
    }
    const paths = [];
    const presentIn = new Set();
    let present = 0;
    let linked = null;
    let created = false;
    const ok = commit(() => {
      if (!menu) {
        created = true;
        T.newMenu = null;
        menu = newMenu({ name: pm.name, posExt: pm.id, image: pm.image || null });
        S.data.menus.push(menu);
        S.ui.activeMenuId = menu.id;
        S.ui.canvasQuery = '';
      }
      ds.forEach((d) => {
        const chain = posChainOf(d);
        const { path, depth } = posChainIn(menu, chain);
        if (depth === chain.length) {
          presentIn.add(parsePath(path).parentPath);
          return present++;
        }
        let r;
        if (depth === chain.length - 1) {
          const err = dropError(path, d);
          if (err) throw new Abort(err);
          r = dropInto(d, path, Infinity);
        } else r = addPosChain(menu, chain, path, depth);
        linked = linked || r.linked;
        paths.push(r.newPath);
      });
      if (!paths.length) {
        const [only] = presentIn.size === 1 ? [...presentIn] : [];
        const where = only ? nameOf(parsePath(only).kind, entity(parsePath(only).kind, parsePath(only).id)) : menu.name;
        throw new Abort(`These ${BULK_NOUN[ds[0].kind][1]} are already in ${where}`);
      }
      selectAdded(paths);
    });
    if (!ok) {
      T.newMenu = wasNew;
      return render();
    }
    if (created) return toast(`${pm.name} successfully added as a menu. Choose its channels and order types next`);
    const parents = [...new Set(paths.map((p) => parsePath(p).parentPath))];
    const where = parents.length === 1 ? crumbText(parents[0]) : menu.name;
    toast(addedText(paths.length, ds[0].kind, where, present));
    if (linked) toast(`Linked to POS menu ${linked.name}`);
  }

  function addPosChain(menu, chain, path, depth) {
    const linked = depth === 0 ? linkMenuToPosCategory(menu, chain[0]) : null;
    const leaf = importPos(chain[chain.length - 1]);
    let topKind = leaf.kind;
    let childId = leaf.id;
    for (let i = chain.length - 2; i >= depth; i--) {
      const posId = chain[i];
      const kind = posItemById(posId).type;
      const ent = findByExt(kind, posId) || newPosEntity(posId);
      if (!ent.children.includes(childId)) {
        if (reaches(topKind, childId, kind, ent.id)) {
          throw new Abort(`${nameOf(topKind, entity(topKind, childId))} already contains ${nameOf(kind, ent)}, so it cannot go inside it`);
        }
        ent.children.push(childId);
        if (ent.pending || entity(topKind, childId).pending || pendingRoot(path)) stageLink(kind, ent.id, topKind, childId);
      }
      topKind = kind;
      childId = ent.id;
    }
    const info = parsePath(path);
    const anchor = entity(info.kind, info.id);
    if (info.kind !== 'menu' && reaches(topKind, childId, info.kind, info.id)) {
      throw new Abort(`${nameOf(topKind, entity(topKind, childId))} already contains ${nameOf(info.kind, anchor)}, so it cannot go inside it`);
    }
    anchor.children.push(childId);
    stagePosLink(path, topKind, childId);
    let newPath = path;
    for (let i = depth; i < chain.length; i++) {
      const ni = parsePath(newPath);
      const k = childKind(ni.kind, entity(ni.kind, ni.id));
      newPath = childPath(newPath, k, findByExt(k, chain[i]).id);
    }
    expandTo(newPath);
    flash(newPath);
    return { newPath, linked };
  }

  function addPosCategories(menu, posIds) {
    let firstPath = null;
    for (const r of posIds) {
      const res = importPos(r);
      if (!res) continue;
      menu.children.push(res.id);
      stagePosLink(menu.id, 'category', res.id);
      const p = childPath(menu.id, 'category', res.id);
      if (!firstPath) firstPath = p;
      flash(p);
    }
    return firstPath;
  }

  function placePosMenu(menu, pm) {
    const present = new Set(menu.children.map((cid) => entity('category', cid).externalId).filter(Boolean));
    const missing = pm.roots.filter((r) => !present.has(r));
    if (!missing.length) return toast(`All categories from ${pm.name} are already in ${menu.name}`, 'info');
    let firstPath = null;
    commit(() => {
      if (!menu.posExt) {
        menu.posExt = pm.id;
        if (!menu.image && pm.image) menu.image = pm.image;
      }
      firstPath = addPosCategories(menu, missing);
      if (firstPath) S.ui.selected = firstPath;
    });
    if (firstPath) toast(missing.length === 1 ? `1 category added from ${pm.name}` : `${missing.length} categories added from ${pm.name}`);
  }

  function addMenuFromPos(pm, chain) {
    const wasNew = T.newMenu;
    const ok = commit(() => {
      T.newMenu = null;
      const menu = newMenu({ name: pm.name, posExt: pm.id, image: pm.image || null });
      S.data.menus.push(menu);
      S.ui.activeMenuId = menu.id;
      S.ui.canvasQuery = '';
      const first = chain ? addPosChain(menu, chain, menu.id, 0).newPath : addPosCategories(menu, pm.roots);
      S.ui.selected = first || menu.id;
    });
    if (ok) return toast(`${pm.name} successfully added as a menu. Choose its channels and order types next`);
    T.newMenu = wasNew;
    render();
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

  function applySyncDemo(demo) {
    const items = S.data.pos.items;
    const touched = new Set();
    for (const [id, name] of Object.entries(demo.rename || {})) if (items[id]) (items[id].name = name), touched.add(id);
    for (const [id, price] of Object.entries(demo.price || {})) if (items[id]) (items[id].price = price), touched.add(id);
    for (const [id, r] of Object.entries(demo.rules || {})) if (items[id]) Object.assign(items[id], r), touched.add(id);
    for (const [id, item] of Object.entries(demo.add || {})) (items[id] = JSON.parse(JSON.stringify(item))), touched.add(id);
    for (const [parent, child] of demo.addTo || []) if (items[parent] && !items[parent].children.includes(child)) items[parent].children.push(child), touched.add(child);
    for (const [pmId, cat] of demo.addRoot || []) {
      const pm = S.data.pos.menus.find((m) => m.id === pmId);
      if (pm && items[cat] && !pm.roots.includes(cat)) pm.roots.push(cat), touched.add(cat);
    }
    for (const [parent, child] of demo.removeFrom || []) if (items[parent]) (items[parent].children = items[parent].children.filter((c) => c !== child)), touched.add(child);
    for (const [id, list] of Object.entries(demo.includedModifiers || {})) if (items[id]) items[id].includedModifiers = JSON.parse(JSON.stringify(list));
    for (const id of demo.delete || []) {
      if (!items[id]) continue;
      delete items[id];
      for (const it of Object.values(items)) if (it.children) it.children = it.children.filter((c) => c !== id);
      touched.add(id);
    }
    return touched;
  }

  function applyPosSync() {
    const demo = !S.data.pos.syncCount && DATASETS[dataset].syncDemo;
    const before = ctx.compare.count;
    let touched = new Set();
    commit(() => {
      if (demo) touched = applySyncDemo(demo);
      S.data.pos.syncCount = (S.data.pos.syncCount || 0) + 1;
      S.data.pos.syncedAt = Date.now();
    });
    const added = ctx.compare.count - before;
    if (touched.size) {
      T.flashExt = touched;
      render();
      setTimeout(() => T.flashExt.clear(), 1600);
    }
    if (added > 0) toast(`POS synced. ${plural(added, 'change', 'changes')} to review`, 'info', { action: { label: 'Review', onClick: openCompare } });
    else toast('POS synced. No changes', 'info');
  }

  const canSyncIncluded = (p) => p.source === 'pos' && p.ptype === 'pos' && !!posItemById(p.externalId);

  function posIncludedRows(p) {
    if (!canSyncIncluded(p)) return null;
    const groups = p.children.map((gid) => entity('group', gid)).filter((g) => g && g.source === 'pos');
    const seen = new Set();
    return (posItemById(p.externalId).includedModifiers || []).flatMap(([groupPos, optionPos, flag]) => {
      const g = groups.find((x) => x.externalId === groupPos);
      const pid = g && g.children.find((c) => (entity('product', c) || {}).externalId === optionPos);
      if (!pid || seen.has(`${g.id}:${pid}`)) return [];
      seen.add(`${g.id}:${pid}`);
      return [{ gid: g.id, pid, source: flag === 'auto' ? 'pos_auto_added' : 'pos_included' }];
    });
  }

  function applyPosIncluded(p) {
    const desired = posIncludedRows(p);
    if (!desired) return null;
    const key = (r) => `${r.gid}:${r.pid}`;
    const manual = new Set(p.included.filter((r) => r.source === 'manual').map(key));
    const want = new Map(desired.filter((r) => !manual.has(key(r))).map((r) => [key(r), r]));
    const fresh = (r) => ({ ...r, locked: r.source === 'pos_auto_added' });
    const res = { added: 0, updated: 0, removed: 0, preselected: 0 };
    const gone = [];
    const next = [];
    for (const r of p.included) {
      const w = r.source !== 'manual' && want.get(key(r));
      want.delete(key(r));
      if (r.source === 'manual' || (w && w.source === r.source)) next.push(r);
      else if (w) {
        res.updated++;
        next.push(fresh(w));
      } else {
        res.removed++;
        gone.push(r);
      }
    }
    res.added = want.size;
    next.push(...[...want.values()].map(fresh));
    p.included = next;
    res.preselected = matchPosPreselections(p, gone);
    return res;
  }

  function matchPosPreselections(p, gone = []) {
    const preKey = (r) => `@>p:${p.id}>g:${r.gid}>p:${r.pid}`;
    const groupPre = (r) => entity('group', r.gid).preselected[r.pid] || 0;
    let changed = 0;
    for (const r of gone) {
      const pl = S.data.placements[preKey(r)];
      if (!pl || !isNum(pl.preselected)) continue;
      if (pl.preselected !== groupPre(r)) changed++;
      delete pl.preselected;
      if (!Object.keys(pl).length) delete S.data.placements[preKey(r)];
    }
    for (const r of p.included) {
      const g = r.source !== 'manual' && entity('group', r.gid);
      if (!g || rulesOf(g).type !== 1) continue;
      const pl = (S.data.placements[preKey(r)] = S.data.placements[preKey(r)] || {});
      if ((isNum(pl.preselected) ? pl.preselected : groupPre(r)) !== 1) changed++;
      pl.preselected = 1;
    }
    return changed;
  }

  function syncIncludedFromPos(p) {
    let res;
    const ok = commit(() => {
      res = applyPosIncluded(p);
      if (!res || !(res.added + res.updated + res.removed + res.preselected)) throw new Abort('');
    });
    if (!ok) return res && toast('Included ingredients already match POS', 'info');
    const parts = [res.added && `${res.added} added`, res.updated && `${res.updated} updated`, res.removed && `${res.removed} removed`].filter(Boolean);
    toast(parts.length ? `Included ingredients now match POS: ${listJoin(parts)}` : 'Preselections now match POS', 'success', { action: { label: 'Undo', onClick: undo } });
  }

  const IMPORT_MS = 2400;

  function ignoreLeftOut(menus) {
    const scopes = new Map();
    for (const menu of menus) {
      const key = ignoreKey(menu, '');
      if (!scopes.has(key)) scopes.set(key, S.data.menus.filter((m) => ignoreKey(m, '') === key));
    }
    for (const shared of scopes.values()) {
      const inMenu = new Set();
      const missing = new Set();
      const todo = [];
      for (const menu of shared) {
        const pm = linkedPosMenu(menu);
        if (pm) todo.push(...pm.roots);
        walkMenu(menu, (k, id, ent) => {
          const posId = posIdOf(k, ent);
          if (posId) inMenu.add(posId);
          if (ent.source === 'pos') todo.push(...posChildren(ent.externalId));
        });
        const d = compareData(menu);
        [...d.missing, ...d.ignored].forEach((m) => missing.add(m.posId));
      }
      const seen = new Set();
      while (todo.length) {
        const id = todo.pop();
        if (seen.has(id) || !posItemById(id)) continue;
        seen.add(id);
        todo.push(...posChildren(id));
      }
      for (const id of new Set([...seen, ...missing])) {
        const key = ignoreKey(shared[0], id);
        if (inMenu.has(id) && !missing.has(id)) delete S.data.ignored[key];
        else if (!S.data.ignored[key]) S.data.ignored[key] = ignoreBaseline(posItemById(id));
      }
    }
  }

  function importStaged(done) {
    if (T.importing || !pendingRows().length) return;
    closePopover();
    T.importing = true;
    render();
    setTimeout(() => {
      T.importing = false;
      const imported = new Set(pendingRows().map((p) => parsePath(p).menuId));
      const reached = new Set();
      S.data.menus.forEach((m) => walkMenu(m, (k, id) => void reached.add(`${k}:${id}`)));
      for (const [kind, map] of Object.entries(S.data.entities))
        for (const [id, e] of Object.entries(map)) if (e.pending && !reached.has(`${kind}:${id}`)) delete map[id];
      finishStagedSizes();
      Object.values(S.data.entities.product).forEach((p) => p.pending && applyPosIncluded(p));
      clearPending();
      ignoreLeftOut(S.data.menus.filter((m) => imported.has(m.id)));
      clearHistory();
      dataVersion++;
      render();
      toast('POS items successfully imported');
      if (done) done();
    }, IMPORT_MS);
  }

  function removeStaged(rows) {
    return commit(() => {
      for (const path of rows) {
        const info = parsePath(path);
        const p = parsePath(info.parentPath);
        const parent = entity(p.kind, p.id);
        parent.children = parent.children.filter((c) => c !== info.id);
        delete S.data.pendingLinks[linkKeyOf(path)];
        for (const k of Object.keys(S.data.placements)) if (k === path || k.startsWith(`${path}>`)) delete S.data.placements[k];
      }
    });
  }

  function discardStaged() {
    const rows = pendingRows();
    if (!rows.length) return;
    openModal({
      title: 'Discard items not imported?',
      body: `<p>${plural(rows.length, 'item comes', 'items come')} off the menu. Items already imported stay as they are.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Discard items',
          kind: 'danger',
          onClick: () => {
            closeModal();
            if (removeStaged(rows)) toast(`${plural(rows.length, 'item', 'items')} discarded`, 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
  }

  function switchStoreGroup(id) {
    const next = datasetOf(id);
    T.newMenu = null;
    if (next === dataset) {
      S.ui.storeGroupId = id;
      loadPos('store-group', render);
    } else {
      persistNow();
      S.ui.storeGroupId = id;
      loadPos('store-group', () => switchDataset(next, id));
    }
  }

  function confirmSwitchStoreGroup(id) {
    const rows = pendingRows();
    if (!rows.length) return switchStoreGroup(id);
    openModal({
      title: 'Switch store group?',
      body: `<p>${plural(rows.length, 'item is', 'items are')} not imported yet. Import them first, or they’re discarded.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Discard items',
          kind: 'danger',
          onClick: () => {
            closeModal();
            removeStaged(rows);
            toast(`${plural(rows.length, 'item', 'items')} discarded`);
            switchStoreGroup(id);
          },
        },
        {
          label: 'Import items',
          kind: 'primary',
          onClick: () => {
            closeModal();
            importStaged(() => switchStoreGroup(id));
          },
        },
      ],
    });
  }

  const PUBLISH_TRIES = 3;
  const notLiveStores = (m) => {
    const live = new Set(m.publishedStoreIds);
    return menuStores(m).filter((s) => !live.has(s.id));
  };
  const needsPublish = (m) => m.status !== 'published' || notLiveStores(m).length > 0;
  const canRetryPublish = (m) => m.status === 'failed' && m.publishRun.tries < PUBLISH_TRIES;

  function publishBody(m) {
    const total = menuStores(m).length;
    const off = notLiveStores(m).length;
    const where = plural(total, 'store', 'stores');
    const text = m.publishedStoreIds.length
      ? `New items and serving times reach ${where}. Other edits reached customers when you saved them.${off ? ` It also goes live at ${plural(off, 'store', 'stores')} where it’s not live now.` : ''}`
      : `It goes live at ${where} in ${esc(listJoin(m.channels.map(channelLabel)))}.`;
    return `<p>${text} Nothing changes on POS.</p>`;
  }

  function publish() {
    const m = activeMenu();
    if (T.importing || m.status === 'publishing') return;
    if (m.status === 'failed') return retryPublish(m);
    const staged = pendingRows().length;
    if (staged) {
      openModal({
        title: 'Import items first',
        body: `<p>${plural(staged, 'item is', 'items are')} not imported yet. Import them first, or they will not be published.</p>`,
        actions: [
          { label: 'Cancel', kind: 'secondary', onClick: closeModal },
          { label: 'Import items', kind: 'primary', onClick: () => { closeModal(); importStaged(); } },
        ],
      });
      return;
    }
    if (ctx.issues.errors) {
      toast(`Couldn’t publish ${m.name}. Fix ${plural(ctx.issues.errors, 'error', 'errors')} first`, 'error');
      openIssues($('[data-action="issues"]'));
      return;
    }
    if (!needsPublish(m)) return;
    openModal({
      title: `Publish ${m.name}?`,
      body: `${publishBody(m)}
        <dl class="kv"><dt>Stores</dt><dd>${esc(storeCountLabel(m))}</dd><dt>Categories</dt><dd>${m.children.length}</dd><dt>Order types</dt><dd>${esc(listJoin(m.orderTypes.map((o) => (C.orderTypes.find((x) => x[0] === o) || [o, o])[1])))}</dd></dl>
        <p class="field-help">Large menus can take a few minutes. You can keep editing, but adding, moving, and removing items waits until it finishes.</p>
        ${ctx.issues.warnings ? callout('warning', `${plural(ctx.issues.warnings, 'warning remains', 'warnings remain')}. You can still publish.`) : ''}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Publish menu',
          kind: 'primary',
          onClick: () => {
            closeModal();
            runPublish(m, menuStores(m).map((s) => s.id));
          },
        },
      ],
    });
  }

  function retryPublish(m) {
    if (canRetryPublish(m)) runPublish(m, m.publishRun.failedStoreIds);
  }

  function runPublish(m, storeIds) {
    settleDelete();
    const id = m.id;
    const demo = !S.data.publishFailDemo && storeIds.length > 4;
    if (demo) S.data.publishFailDemo = true;
    const failIds = demo ? [storeIds[2], storeIds[storeIds.length - 2]] : [];
    const run = { done: 0, total: storeIds.length };
    T.publishing[id] = run;
    m.status = 'publishing';
    dataVersion++;
    render();
    const step = Math.max(1, Math.ceil(run.total / 14));
    const tick = () => {
      const pm = menuById(id);
      if (!pm || pm.status !== 'publishing') return void delete T.publishing[id];
      run.done = Math.min(run.total, run.done + step);
      if (run.done < run.total) {
        renderTopbar();
        return void setTimeout(tick, 110);
      }
      delete T.publishing[id];
      finishPublish(pm, failIds);
    };
    setTimeout(tick, 110);
  }

  function finishPublish(m, failIds) {
    if (failIds.length) {
      m.status = 'failed';
      m.publishRun = { failedStoreIds: failIds, tries: (m.publishRun ? m.publishRun.tries : 0) + 1 };
      dataVersion++;
      render();
      toast(`Couldn’t publish ${m.name} at ${plural(failIds.length, 'store', 'stores')}`, 'error', { action: { label: 'View stores', onClick: () => openPublishFailed(m.id) } });
      return;
    }
    m.publishRun = null;
    m.status = 'published';
    m.publishedAt = Date.now();
    m.publishedStoreIds = menuStores(m).map((s) => s.id);
    dataVersion++;
    render();
    toast('Menu successfully published');
  }

  function openPublishFailed(menuId) {
    const m = menuById(menuId);
    if (!m || m.status !== 'failed') return;
    const { failedStoreIds, tries } = m.publishRun;
    const canRetry = canRetryPublish(m);
    const n = failedStoreIds.length;
    const others = menuStores(m).length - n;
    const now = m.publishedStoreIds.length
      ? `The other ${plural(others, 'store', 'stores')} have the latest ${esc(m.name)}.`
      : `${esc(m.name)} goes live at every store once ${n === 1 ? 'this store gets' : 'these stores get'} it.`;
    const rows = failedStoreIds
      .map((sid) => storeById.get(sid))
      .filter(Boolean)
      .map((s) => `<div class="store-row list-row"><span class="store-name list-name"><span>${esc(s.name)}</span><span class="muted">${esc(s.city)}</span></span></div>`)
      .join('');
    openModal({
      title: `Couldn’t publish at ${plural(n, 'store', 'stores')}`,
      body: `<p>${now} ${canRetry ? `Retry to send it to ${n === 1 ? 'this store' : 'them'} again.` : `Publishing failed ${tries} times. Contact support to publish it.`}</p>
        <div class="store-list">${rows}</div>
        ${callout('info', `Until it’s published, adding, moving, and removing items in ${esc(m.name)} is paused`)}`,
      actions: [
        { label: 'Close', kind: 'secondary', onClick: closeModal },
        ...(canRetry ? [{ label: 'Retry publishing', kind: 'primary', onClick: () => { closeModal(); retryPublish(m); } }] : []),
      ],
    });
  }

  function confirmUnpublish(m) {
    const live = m.publishedStoreIds.length;
    if (!live || m.status === 'publishing') return;
    openModal({
      title: `Unpublish ${m.name}?`,
      body: `<p>Customers at ${plural(live, 'store', 'stores')} can no longer order from it. This happens right away.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Unpublish menu',
          kind: 'danger',
          onClick: () => {
            closeModal();
            settleDelete();
            m.status = 'unpublished';
            m.publishedStoreIds = [];
            m.publishRun = null;
            dataVersion++;
            render();
            toast('Menu unpublished');
          },
        },
      ],
    });
  }
