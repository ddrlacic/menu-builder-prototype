'use strict';

  /* ---------- mutations ---------- */

  function select(path, { focusRow = false } = {}) {
    S.ui.selected = path;
    T.sel = [];
    T.selAnchor = path;
    if (focusRow) T.focusRow = path;
    render();
  }

  const BULK_NOUN = { category: ['category', 'categories'], product: ['product', 'products'], group: ['group', 'groups'] };
  const isSelected = (path) => S.ui.selected === path || T.sel.includes(path);
  const treePaths = () => $$('#canvas-tree .row').map((r) => r.dataset.path);

  function setSelection(paths, primary, anchor = T.selAnchor) {
    T.sel = paths.length > 1 ? paths : [];
    S.ui.selected = primary;
    T.selAnchor = anchor;
    T.focusRow = primary;
    render();
  }

  function toggleInSelection(path) {
    const kind = parsePath(path).kind;
    const base = T.sel.length ? T.sel : parsePath(S.ui.selected).kind === 'menu' ? [] : [S.ui.selected];
    if (!base.length || parsePath(base[0]).kind !== kind) return select(path, { focusRow: true });
    const next = base.includes(path) ? base.filter((p) => p !== path) : [...base, path];
    if (!next.length) return;
    setSelection(next, next.includes(path) ? path : next[next.length - 1], path);
  }

  function selectRange(path) {
    const anchor = T.selAnchor || S.ui.selected;
    const kind = parsePath(path).kind;
    const paths = treePaths();
    let a = paths.indexOf(anchor);
    let b = paths.indexOf(path);
    if (a < 0 || b < 0 || parsePath(anchor).kind !== kind) return select(path, { focusRow: true });
    if (a > b) [a, b] = [b, a];
    setSelection(paths.slice(a, b + 1).filter((p) => parsePath(p).kind === kind), path, anchor);
  }

  function extendSelection(dir) {
    const kind = parsePath(S.ui.selected).kind;
    if (kind === 'menu') return;
    const paths = treePaths();
    for (let i = paths.indexOf(S.ui.selected) + dir; i >= 0 && i < paths.length; i += dir) if (parsePath(paths[i]).kind === kind) return selectRange(paths[i]);
  }

  function selectAllOfKind() {
    const kind = parsePath(S.ui.selected).kind;
    if (kind === 'menu') return;
    setSelection(treePaths().filter((p) => parsePath(p).kind === kind), S.ui.selected);
  }

  function selectionInfo() {
    const paths = T.sel.length ? T.sel : [S.ui.selected];
    const kind = parsePath(paths[0]).kind;
    const ents = [...new Set(paths.map((p) => parsePath(p).id))].map((id) => entity(kind, id)).filter(Boolean);
    const [one, many] = BULK_NOUN[kind] || ['item', 'items'];
    return { paths, kind, ents, one, many, noun: (n) => plural(n, one, many) };
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
        const res = performDrop(posDesc(id, { chainCat }), { path: parentPath, pos: 'inside' });
        const now = entity(pi.kind, pi.id);
        if (!T.picker || !now || !now.children.some((c) => posIdOf(ck, entity(ck, c)) === id)) return;
        T.picker.items = T.picker.items.filter((it) => it.id !== id);
        renderPicker();
        if (!(res && res.alsoIn)) toast(`${posLabel(id)} added`);
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
    if (parent.ptype === 'size') {
      const home = entity('category', parsePath(pi.parentPath).id);
      const own = !isVirtual(home);
      return openAddPicker({
        title: 'Add POS product',
        intro: own
          ? `Products in ${posLabel(home.externalId)} on POS, where ${nameOf('product', parent)} is. Customers pick one. Only that product is sent to POS.`
          : 'Customers pick one of these products. Only that product is sent to POS.',
        parentPath,
        ids: posProductChoices()
          .map((c) => c.id)
          .filter((id) => !dropError(parentPath, posDesc(id))),
        noun: own ? `products from ${posLabel(home.externalId)}` : 'POS products',
      });
    }
    if (parent.gtype === 'standalone') {
      return openAddPicker({
        title: 'Add POS product',
        intro: 'Each product customers pick is added to the order as its own item.',
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
      ...existingMenuItems(activeMenu().id),
    ]);
  }

  function keepChoiceInMenu(choiceProductPath, pid) {
    const ent = entity('product', pid);
    const d = { kind: 'product', name: nameOf('product', ent), source: ent.source, posId: ent.source === 'pos' ? ent.externalId : null, ptype: ent.ptype };
    const staged = isPendingLink(childPath(choiceProductPath, 'product', pid));
    const added = [];
    for (const catPath of choiceProductCategoryPaths(choiceProductPath)) {
      const cat = entity('category', parsePath(catPath).id);
      if (cat.children.includes(pid) || dropError(catPath, d)) continue;
      cat.children.push(pid);
      if (staged) stageLink('category', cat.id, 'product', pid);
      const pp = childPath(catPath, 'product', pid);
      S.data.placements[pp] = { ...placement(pp), hidden: true };
      added.push(cat);
    }
    return added.length ? added : null;
  }

  const alsoInText = (name, cats) =>
    `${name} added. It’s also in ${cats.map((c) => nameOf('category', c)).join(' and ')} now, hidden there, so it gets its POS price`;

  function keepChoicesInCategory(cp, cat) {
    const before = new Set(cat.children);
    S.data.menus
      .filter((m) => m.children.includes(cat.id))
      .forEach((m) => {
        const cpPath = childPath(childPath(m.id, 'category', cat.id), 'product', cp.id);
        cp.children.forEach((pid) => keepChoiceInMenu(cpPath, pid));
      });
    return cat.children.filter((pid) => !before.has(pid)).length;
  }

  const EXISTING = {
    category: { noun: 'category', label: 'Existing category', hint: 'Menu-only category you made', intro: 'Menu-only categories you made in MC.' },
    product: { noun: 'product', label: 'Existing product', hint: 'Custom or choice product you made', intro: 'Custom and choice products you made in MC.' },
    upsell: { noun: 'product', label: 'Existing product', hint: 'Custom product you made', intro: 'Custom products you made in MC.' },
    group: { noun: 'group', label: 'Existing group', hint: 'Custom group or suggested products you made', intro: 'Custom groups and suggested products you made in MC.' },
    folder: { noun: 'option folder', label: 'Existing option folder', hint: 'Option folder you made', intro: 'Option folders you made in MC.' },
  };

  function existingFor(parentPath) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    if (pi.kind === 'product' && parent.ptype === 'size') return null;
    const ck = childKind(pi.kind, parent);
    const which = pi.kind === 'menu' ? 'category' : pi.kind === 'category' ? 'product' : pi.kind === 'product' ? 'group' : parent.gtype === 'standalone' ? 'upsell' : 'folder';
    const fits = {
      category: (x) => isVirtual(x),
      product: (x) => x.ptype === 'linked' || x.ptype === 'size',
      upsell: (x) => x.ptype === 'linked',
      group: (x) => x.gtype === 'linked' || x.gtype === 'standalone',
      folder: (x) => x.ptype === 'container',
    }[which];
    const ents = Object.values(S.data.entities[ck])
      .filter((x) => fits(x) && !x.pending && !parent.children.includes(x.id))
      .filter((x) => pi.kind === 'menu' || !reaches(ck, x.id, pi.kind, pi.id))
      .filter((x) => !dropError(parentPath, { origin: 'canvas', id: x.id, kind: ck, name: nameOf(ck, x), source: x.source, ptype: x.ptype || null, gtype: x.gtype || null }))
      .sort((a, b) => nameOf(ck, a).localeCompare(nameOf(ck, b)));
    return { ...EXISTING[which], kind: ck, ents };
  }

  function existingMenuItems(parentPath, wrap = (it) => it) {
    const ex = existingFor(parentPath);
    if (!ex || !ex.ents.length) return [];
    return [{ heading: 'Add existing' }, wrap({ label: ex.label, hint: ex.hint, icon: 'copy', onClick: () => openExistingPicker(parentPath) })];
  }

  function openExistingPicker(parentPath) {
    const ex = existingFor(parentPath);
    const pi = parsePath(parentPath);
    const nouns = ex.noun === 'category' ? 'categories' : `${ex.noun}s`;
    openPicker({
      title: `Add existing ${ex.noun}`,
      intro: `${ex.intro} It stays one ${ex.noun}, so edits apply everywhere it’s used.`,
      placeholder: 'Search by name or internal name',
      items: ex.ents.map((x) => {
        const uses = (ctx.usage.get(`${ex.kind}:${x.id}`) || []).length;
        return { id: x.id, name: nameOf(ex.kind, x), alt: x.internalName, meta: `${kindLabel(ex.kind, x)} · ${uses ? `Used in ${plural(uses, 'place', 'places')}` : 'Not in any menu'}`, price: '' };
      }),
      empty: `No ${nouns} to add to ${nameOf(pi.kind, entity(pi.kind, pi.id))}`,
      noMatch: [`No matching ${nouns}`, 'Try a different name.'],
      keepOpen: true,
      onPick: (id) => {
        if (!linkExisting(parentPath, ex.kind, id) || !T.picker) return;
        T.picker.items = T.picker.items.filter((it) => it.id !== id);
        renderPicker();
      },
    });
  }

  function linkExisting(parentPath, kind, id, index = Infinity) {
    const pi = parsePath(parentPath);
    const parent = entity(pi.kind, pi.id);
    const ent = entity(kind, id);
    const parentName = nameOf(pi.kind, parent);
    const name = nameOf(kind, ent);
    if (parent.children.includes(id)) return toast(`${name} is already in ${parentName}`, 'error');
    if (pi.kind !== 'menu' && reaches(kind, id, pi.kind, pi.id)) return toast(`${name} already contains ${parentName}, so it cannot go inside it`, 'error');
    const staged = !!pendingRoot(parentPath);
    if (staged && ent.source !== 'pos') return toast(`${name} can go in ${parentName} after you import it`, 'info');
    let newPath = null;
    let choices = 0;
    const done = commit(() => {
      parent.children.splice(Math.min(index, parent.children.length), 0, id);
      if (ent.source === 'pos') stageLink(pi.kind, pi.id, kind, id);
      if (pi.kind === 'category' && ent.ptype === 'size') choices = keepChoicesInCategory(ent, parent);
      if (pi.kind === 'product' && parent.ptype === 'size') keepChoiceInMenu(parentPath, id);
      newPath = childPath(parentPath, kind, id);
      S.ui.expanded[parentPath] = true;
      S.ui.selected = newPath;
      flash(newPath);
    });
    if (!done) return null;
    const uses = (ctx.usage.get(`${kind}:${id}`) || []).length;
    const text = choices
      ? `${name} added to ${parentName}. ${plural(choices, 'choice is', 'choices are')} also in ${parentName} now, hidden there, so they get their POS prices`
      : uses > 1
        ? `${name} added to ${parentName}. Edits apply in all ${uses} places`
        : `${name} added to ${parentName}`;
    toast(text, 'success', { action: { label: 'Undo', onClick: undo } });
    return newPath;
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
      title: 'Create custom product',
      intro: 'Choose the POS product it rings up as. The custom product gets its own name, image, and preselected options, and always uses that product’s POS price. It starts with that product’s description and dietary info.',
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
              ...(source ? dietaryOf(source) : {}),
            }),
          );
        });
        toast('Custom product created. Add its groups next', 'success');
      },
    });
  }

  function changePosParent(path) {
    const ent = entity('product', parsePath(path).id);
    openPicker({
      title: 'Change what it rings up as',
      intro: 'The custom product rings up on POS as this product, at its POS price. Groups that this product does not have are flagged.',
      placeholder: 'Search by product name or POS ID',
      items: posProductChoices(),
      onPick: (posId) => {
        closeModal(true);
        commit(() => (ent.posParentExt = posId));
        toast(`Now rings up as ${posLabel(posId)}`);
      },
    });
  }

  function categorizedProducts(menus = S.data.menus) {
    const out = new Map();
    menus.forEach((m) =>
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

  function nestTarget(key) {
    const [kind, id, mapKey] = key.split('|');
    if (kind === 'place') {
      const [pid, gid] = id.split(':');
      return { ent: ownSections(entity('product', pid), entity('group', gid)), mapKey };
    }
    return { ent: entity(kind, id), mapKey };
  }

  function arrangeSections(key, order) {
    const { ent, mapKey } = nestTarget(key);
    const byId = new Map(ent.sections.map((s) => [s.id, s]));
    ent.sections = order.map((o) => byId.get(o.sid)).filter(Boolean);
    order.forEach((o) => o.ids.forEach((id) => (ent[mapKey][id] = o.sid)));
    const placed = order.flatMap((o) => o.ids);
    ent.children = [...placed, ...ent.children.filter((id) => !placed.includes(id))];
  }

  function removeNestSection(key, index) {
    const { ent, mapKey } = nestTarget(key);
    const sectionOfItem = mapKey === 'groupSection' ? sectionOf : sectionOfOption;
    const [gone] = ent.sections.splice(index, 1);
    ent.children.forEach((id) => {
      if (ent[mapKey][id] === gone.id) delete ent[mapKey][id];
    });
    arrangeSections(
      key,
      ent.sections.map((s) => ({ sid: s.id, ids: ent.children.filter((id) => sectionOfItem(ent, id) === s.id) })),
    );
    return gone;
  }

  const pickItem = (x, extra = {}) => ({ id: x.id, name: nameOf('product', x), alt: x.internalName || '', meta: posIdOf('product', x) || '', thumb: thumb('product', x, 'thumb-sm'), ...extra });

  function optionGroups(opts, itemOf) {
    const byGroup = new Map();
    opts.forEach((o) => {
      if (!byGroup.has(o.gid)) byGroup.set(o.gid, { id: o.gid, name: nameOf('group', o.g), items: [] });
      byGroup.get(o.gid).items.push(itemOf(o));
    });
    return [...byGroup.values()];
  }

  function openProductListPicker(p, bind, title) {
    const chosen = new Set(getBind(bind) || []);
    const name = nameOf('product', p);
    const menus = S.data.menus.filter((m) => categorizedProducts([m]).has(p.id));
    const groups = menus.flatMap((m) =>
      m.children
        .map((cid) => entity('category', cid))
        .filter(Boolean)
        .map((c) => ({
          id: `${m.id}:${c.id}`,
          name: menus.length > 1 ? `${nameOf('category', c)} · ${nameOf('menu', m)}` : nameOf('category', c),
          items: c.children
            .filter((pid) => !pendingRoot(childPath(childPath(m.id, 'category', c.id), 'product', pid)))
            .map((pid) => entity('product', pid))
            .filter((x) => x && x.id !== p.id && ['pos', 'linked'].includes(x.ptype) && !chosen.has(x.id))
            .map((x) => pickItem(x)),
        })),
    );
    openListPicker({
      title,
      intro: `Products from the menus that have ${name}.`,
      groups,
      noun: ['product', 'products'],
      empty: menus.length ? 'Every product is already added' : `Add ${name} to a category first`,
      onAdd: (ids) => {
        if (bind === productBind(p)('upsell.products') && !p.upsell.title.trim()) p.upsell.title = UPSELL_TITLE;
        setBind(bind, [...(getBind(bind) || []), ...ids]);
      },
    });
  }

  function openIncludedPicker(p) {
    const taken = new Set([...posIncluded(p), ...p.included].map((it) => `${it.gid}:${it.pid}`));
    openListPicker({
      title: 'Add included ingredients',
      intro: `Options from the groups of ${nameOf('product', p)}.`,
      groups: optionGroups(
        productOptions(p, { noHalves: true }).filter((o) => !taken.has(o.key)),
        (o) => pickItem(o.x, { id: o.key, name: optionName(o.g, o.pid) }),
      ),
      noun: ['ingredient', 'ingredients'],
      empty: 'Every option is already included',
      onAdd: (keys) =>
        keys.forEach((key) => {
          const [gid, pid] = key.split(':');
          p.included.push({ gid, pid, locked: false });
        }),
    });
  }

  function openSubstitutePicker(p, key) {
    const [gid, originId] = key.split(':');
    const chosen = substitutesAt(p, gid, originId).ids;
    const seen = new Set([originId, p.id, ...chosen]);
    openListPicker({
      title: `Add substitutes for ${nameOf('product', entity('product', originId))}`,
      intro: `Options from the groups of ${nameOf('product', p)}.`,
      groups: optionGroups(
        productOptions(p, { noHalves: true }).filter((o) => !seen.has(o.pid) && seen.add(o.pid)),
        (o) => pickItem(o.x, { name: optionName(o.g, o.pid) }),
      ),
      noun: ['substitute', 'substitutes'],
      placeholder: 'Search options',
      empty: 'Every option is already a substitute',
      onAdd: (ids) => (p.substitutes[key] = [...substitutesAt(p, gid, originId).ids, ...ids]),
    });
  }

  function openGroupSwapPicker(g, originId) {
    const all = originId === '*';
    const current = all ? g.swapAll : g.swaps[originId] || [];
    const chosen = new Set([...(all ? [] : [originId]), ...current.map((k) => k.split(':')[1]), ...siblingGroupedHalves(g)]);
    const parents = groupParents(g.id);
    const byName = (a, b) => a.localeCompare(b);
    const origins = swapOrigins(g);
    openListPicker({
      title: `Add substitutes for ${all ? (origins.length > 1 ? `every option in ${nameOf('group', g)}` : optionName(g, origins[0])) : optionName(g, originId)}`,
      intro:
        parents.length > 1
          ? `Options from groups on at least two of the products that use ${nameOf('group', g)}. A substitute works only on products that have its group.`
          : `Options from the other groups of ${nameOf('product', parents[0])}.`,
      groups: swapSourceGroups(g).map((x) => ({
        id: x.id,
        name: nameOf('group', x),
        sub: (() => {
          const off = parents.filter((p) => !p.children.includes(x.id)).map((p) => nameOf('product', p)).sort(byName);
          return off.length ? `Not on ${fewNames(off)}` : '';
        })(),
        items: listedOptions(x)
          .map((pid) => entity('product', pid))
          .filter((y) => y.ptype !== 'container' && !chosen.has(y.id))
          .map((y) => pickItem(y, { id: `${x.id}:${y.id}`, name: optionName(x, y.id) })),
      })),
      noun: ['substitute', 'substitutes'],
      placeholder: 'Search options',
      empty: 'Every option in the other groups is already a substitute',
      onAdd: (keys) => {
        if (all) g.swapAll = [...g.swapAll, ...keys];
        else g.swaps[originId] = [...(g.swaps[originId] || []), ...keys];
      },
    });
  }

  function setGroupSwapScope(g, value) {
    if ((value === 'all') === Array.isArray(g.swapAll)) return;
    if (value === 'each') {
      commit(() => (g.swapAll = null));
      return;
    }
    const lists = swapOrigins(g).map((pid) => g.swaps[pid] || []);
    const union = [...new Set(lists.flat())];
    const same = lists.every((l) => JSON.stringify(l) === JSON.stringify(lists[0]));
    if (same) {
      commit(() => (g.swapAll = union));
      return;
    }
    const name = nameOf('group', g);
    openModal({
      title: 'Use same substitutes for every option?',
      body: `<p>Every option in ${esc(name)} gets all the substitutes set on its options now. Lists set for single options are replaced.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Use same substitutes',
          kind: 'primary',
          onClick: () => {
            closeModal();
            commit(() => (g.swapAll = union));
            toast(`Same substitutes for every option in ${name}`, 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
  }

  function confirmCopyToChoices(p) {
    const kids = p.children.map((id) => entity('product', id)).filter(Boolean);
    const name = nameOf('product', p);
    openModal({
      title: `Copy description and image to ${plural(kids.length, 'choice', 'choices')}?`,
      body: `<p>Each choice gets the description and image of ${esc(name)}.${p.image ? '' : ' This product has no image, so the choices lose theirs.'} Names stay as they are, so customers can tell the choices apart.</p>
        <p>The choices change everywhere they are used.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Copy',
          kind: 'primary',
          onClick: () => {
            closeModal();
            commit(() =>
              kids.forEach((x) => {
                x.description = p.description;
                x.image = p.image;
              }),
            );
            toast(`Description and image copied to ${plural(kids.length, 'choice', 'choices')}`, 'success', { action: { label: 'Undo', onClick: undo } });
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
      const also = new Set();
      let choices = 0;
      commit(() => {
        parent.children.push(child.id);
        if (childKind === 'product' && kind === 'category' && child.ptype === 'size') choices = keepChoicesInCategory(child, parent);
        if (childKind !== 'product' || kind !== 'product' || parent.ptype !== 'size') return;
        for (const cpPath of ctx.usage.get(`product:${parent.id}`) || []) (keepChoiceInMenu(cpPath, child.id) || []).forEach((c) => also.add(c));
      });
      const text = choices
        ? `Added to ${name}. ${plural(choices, 'choice is', 'choices are')} also in ${name} now, hidden there, so they get their POS prices`
        : also.size
          ? alsoInText(nameOf(childKind, child), [...also])
          : `Added to ${name}`;
      toast(text, 'success', { action: { label: 'Undo', onClick: undo } });
      return;
    }
    const choiceProducts = childKind === 'product' && kind === 'category' ? choiceProductsHolding(parent, child.id) : [];
    const segs = [`${SEG[kind]}:${id}>${SEG[childKind]}:${child.id}`, ...choiceProducts.map((cp) => `p:${cp.id}>p:${child.id}`)];
    const inSeg = (k) => segs.some((seg) => k.endsWith(`>${seg}`) || k.includes(`>${seg}>`));
    commit(() => {
      parent.children = parent.children.filter((c) => c !== child.id);
      choiceProducts.forEach((cp) => (cp.children = cp.children.filter((c) => c !== child.id)));
      for (const k of Object.keys(S.data.placements)) if (inSeg(k)) delete S.data.placements[k];
      const seg = segs.find((s) => S.ui.selected.endsWith(`>${s}`) || S.ui.selected.includes(`>${s}>`));
      if (seg) S.ui.selected = S.ui.selected.slice(0, S.ui.selected.indexOf(`>${seg}`) + 1 + seg.lastIndexOf('>'));
    });
    const text = choiceProducts.length ? `Removed from ${name} and ${choiceProducts.map((cp) => nameOf('product', cp)).join(' and ')}` : `Removed from ${name}`;
    toast(text, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function dropOptions(g, pids) {
    if (!pids.length) return;
    const segs = pids.map((pid) => `g:${g.id}>p:${pid}`);
    const hit = (k) => segs.some((s) => k.endsWith(`>${s}`) || k.includes(`>${s}>`));
    g.children = g.children.filter((pid) => !pids.includes(pid));
    for (const map of [g.preselected, g.optionSettings, g.optionSection, g.swaps, g.halves]) pids.forEach((pid) => map && delete map[pid]);
    for (const k of Object.keys(S.data.placements)) if (hit(k)) delete S.data.placements[k];
    if (hit(S.ui.selected)) S.ui.selected = S.ui.selected.slice(0, S.ui.selected.indexOf(`>g:${g.id}>`) + `>g:${g.id}`.length);
  }

  function posGroupChoices(g, productPath) {
    return allowedPosGroupsFor(productPath)
      .filter((id) => id !== g.posGroupExt && posItemById(id))
      .map((id) => {
        const it = posItemById(id);
        return {
          id,
          name: posLabel(id),
          alt: it.name,
          meta: `${C.groupTypes[it.groupType || 1].label} · ${plural((it.children || []).length, 'option', 'options')} · ${id}`,
          price: '',
        };
      });
  }

  function openGroupLinkPicker(g, productPath) {
    const product = entity('product', parsePath(productPath).id);
    const name = nameOf('product', product);
    const uses = (ctx.usage.get(`group:${g.id}`) || []).length;
    openPicker({
      title: 'Change the linked POS group',
      intro: `Groups of ${name} on POS. This group gets the options of the group you pick. Choices ring up as options of that group, at its POS prices. Options that are not in it are removed.${uses > 1 ? ' A change applies everywhere this custom group is used.' : ''}`,
      placeholder: 'Search by group name or POS ID',
      items: posGroupChoices(g, productPath),
      empty: `${name} has no other groups on POS`,
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
        const folders = g.children.filter((pid) => {
          const x = entity('product', pid);
          return x && x.ptype === 'container';
        });
        g.gtype = 'linked';
        g.posGroupExt = posId;
        delete g.role;
        dropOptions(g, dropped);
        g.children = allowed
          .map((c) => importPos(c))
          .filter(Boolean)
          .map((r) => r.id)
          .concat(folders);
      });
      toast(`Linked to ${posLabel(posId)}`, 'success', { action: { label: 'Undo', onClick: undo } });
    };
    if (!dropped.length) return apply();
    openModal({
      title: `Link to ${posLabel(posId)}?`,
      body: `<p>${plural(dropped.length, 'option is', 'options are')} not in ${esc(posLabel(posId))} on POS, so ${dropped.length === 1 ? 'it is' : 'they are'} removed from this group: ${esc(listJoin(dropped.map((pid) => nameOf('product', entity('product', pid)))))}.</p><p>This group then has the options of ${esc(posLabel(posId))}.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Link group', kind: 'primary', onClick: () => { closeModal(); apply(); } },
      ],
    });
  }

  function openPropagatePicker(g) {
    const name = nameOf('group', g);
    const items = Object.values(S.data.entities.group)
      .filter((x) => x.id !== g.id && !g.propagated.includes(x.id) && !reaches('group', x.id, 'group', g.id))
      .sort((a, b) => nameOf('group', a).localeCompare(nameOf('group', b)))
      .map((x) => ({
        id: x.id,
        name: nameOf('group', x),
        alt: x.internalName,
        meta: `${kindLabel('group', x)} · ${plural(x.children.length, 'option', 'options')} · in ${plural(groupParents(x.id).length, 'product', 'products')}`,
        price: '',
      }));
    openPicker({
      title: 'Add a group to every option',
      intro: `Each option in ${name} gets this group, with the same options and rules. Options you add later get it too.`,
      placeholder: 'Search by group name',
      items,
      empty: 'No other groups to add',
      noMatch: ['No matching groups', 'Try a different name.'],
      onPick: (gid) => {
        closeModal(true);
        commit(() => g.propagated.push(gid));
        toast(`${nameOf('group', entity('group', gid))} added to every option`, 'success', { action: { label: 'Undo', onClick: undo } });
      },
    });
  }

  function removePropagated(g, gid) {
    commit(() => (g.propagated = g.propagated.filter((x) => x !== gid)));
    toast(`${nameOf('group', entity('group', gid))} removed from every option`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function groupDeleteBlock(g) {
    if (groupMenus(g).some((m) => m.status === 'publishing')) return 'You can delete the group once publishing finishes.';
    const halfIn = groupHalfUse(g);
    if (halfIn.length) return `Its options are halves in ${listJoin(halfIn)}. Remove them from half and whole there first, then delete it.`;
    return '';
  }

  function deleteGroupNow(g) {
    groupMenus(g).forEach((m) => m.status === 'published' && (m.status = 'changed'));
    groupParents(g.id).forEach((p) => (p.children = p.children.filter((c) => c !== g.id)));
    for (const p of Object.values(S.data.entities.product)) for (const k of Object.keys(p.halfWhole || {})) if (k.startsWith(`${g.id}:`)) delete p.halfWhole[k];
    for (const k of Object.keys(S.data.placements)) if (k.split('>').includes(`g:${g.id}`)) delete S.data.placements[k];
    delete S.data.entities.group[g.id];
  }

  function confirmDeleteGroup(g, path) {
    if (groupDeleteBlock(g)) return;
    const name = nameOf('group', g);
    const parents = groupParents(g.id);
    const remove = () => {
      closeModal();
      commit(() => {
        deleteGroupNow(g);
        S.ui.selected = parsePath(path).parentPath;
      });
      toast('Group deleted');
    };
    if (!parents.length) {
      openModal({
        title: `Delete ${name}?`,
        body: '<p>This will permanently delete the product group</p>',
        actions: [
          { label: 'Cancel', kind: 'secondary', onClick: closeModal },
          { label: 'Delete', kind: 'danger', onClick: remove },
        ],
      });
      return;
    }
    const lines = [
      'This product group will be removed from all stores, online ordering channels, external channels, and associated order types',
      'This product group will be removed from all products',
      'Products within this product group will not be deleted',
    ];
    openModal({
      title: `Delete ${name}?`,
      size: 'lg',
      body: `<h3 class="delete-warning-title">This action cannot be undone. Proceed with caution.</h3>
        <ul class="delete-warning-list">${lines.map((t) => `<li>${icon('alertCircle', 18)}<span>${esc(t)}</span></li>`).join('')}</ul>
        <button type="button" class="check-toggle delete-confirm-check" role="checkbox" aria-checked="false" data-action="delete-confirm-toggle">
          <span class="check" aria-hidden="true"></span>Yes, I understand
        </button>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Delete forever', kind: 'danger', disabled: true, onClick: remove },
      ],
    });
  }

  const ringsUpAs = (p) => (p.source === 'pos' ? Object.values(S.data.entities.product).filter((x) => x.ptype === 'linked' && x.posParentExt === p.externalId) : []);

  function productDeleteBlock(p) {
    if (productMenus(p).some((m) => m.status === 'publishing')) return 'You can delete the product once publishing finishes.';
    const hw = halfWholeUse(p);
    if (hw.halfIn.length) return `It is a half in ${listJoin(hw.halfIn)}. Remove it from half and whole there first, then delete it.`;
    return '';
  }

  function deleteProductNow(p) {
    productMenus(p).forEach((m) => m.status === 'published' && (m.status = 'changed'));
    productParents(p).forEach(({ ent }) => (ent.children = ent.children.filter((c) => c !== p.id)));
    for (const x of Object.values(S.data.entities.product)) {
      x.upsell.products = x.upsell.products.filter((id) => id !== p.id);
      x.crossSell = x.crossSell.filter((id) => id !== p.id);
      for (const [k, ids] of Object.entries(x.substitutes)) x.substitutes[k] = ids.filter((id) => id !== p.id);
    }
    ringsUpAs(p).forEach((x) => (x.posParentExt = null));
    for (const k of Object.keys(S.data.placements)) if (k.split('>').includes(`p:${p.id}`)) delete S.data.placements[k];
    delete S.data.entities.product[p.id];
    const at = S.ui.selected.split('>').indexOf(`p:${p.id}`);
    if (at > 0) S.ui.selected = S.ui.selected.split('>').slice(0, at).join('>');
  }

  const categoryDeleteBlock = (cat) =>
    S.data.menus.some((m) => m.children.includes(cat.id) && m.status === 'publishing') ? 'You can delete the category once publishing finishes.' : '';

  function deleteCategoryNow(cat) {
    S.data.menus.forEach((m) => (m.children = m.children.filter((c) => c !== cat.id)));
    for (const k of Object.keys(S.data.placements)) if (k.split('>')[1] === `c:${cat.id}`) delete S.data.placements[k];
    delete S.data.entities.category[cat.id];
  }

  function confirmDeleteProduct(p) {
    if (productDeleteBlock(p)) return;
    const name = nameOf('product', p);
    const parents = productParents(p);
    const linked = ringsUpAs(p);
    const remove = () => {
      closeModal();
      commit(() => deleteProductNow(p));
      toast('Product deleted');
    };
    if (!parents.length) {
      openModal({
        title: `Delete ${name}?`,
        body: '<p>This will permanently delete the product</p>',
        actions: [
          { label: 'Cancel', kind: 'secondary', onClick: closeModal },
          { label: 'Delete', kind: 'danger', onClick: remove },
        ],
      });
      return;
    }
    const lines = [
      'This product will be removed from all stores, online ordering channels, external channels, and associated order types',
      'This product will be removed from all product groups, categories and menus',
      'This product will be removed from all discounts',
      p.ptype === 'size' ? 'Choices within this product will not be deleted' : 'Product groups within this product will not be deleted',
      linked.length ? `${listJoin(linked.map((x) => nameOf('product', x)))} ${linked.length > 1 ? 'ring' : 'rings'} up as this product and will lose that link` : '',
      'If you have active advanced orders that contain this product, you will not be able to delete it. Please cancel all outstanding orders before proceeding.',
    ].filter(Boolean);
    openModal({
      title: `Delete ${name}?`,
      size: 'lg',
      body: `<h3 class="delete-warning-title">This action cannot be undone. Proceed with caution.</h3>
        <ul class="delete-warning-list">${lines.map((t) => `<li>${icon('alertCircle', 18)}<span>${esc(t)}</span></li>`).join('')}</ul>
        <button type="button" class="check-toggle delete-confirm-check" role="checkbox" aria-checked="false" data-action="delete-confirm-toggle">
          <span class="check" aria-hidden="true"></span>Yes, I understand
        </button>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Delete forever', kind: 'danger', disabled: true, onClick: remove },
      ],
    });
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
          stageLink('product', p.id, 'group', res.id);
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
      if (!g.children.includes(res.id)) {
        g.children.push(res.id);
        stageLink('group', g.id, 'product', res.id);
      }
      S.ui.expanded[groupPath] = true;
      flash(childPath(groupPath, 'product', res.id));
    });
  }

  function rekeyPlacements(oldPath, newPath) {
    const scoped = [];
    walkSubtree(newPath, (k, id, ent, p) => {
      const from = productScopePath(oldPath + p.slice(newPath.length));
      const to = productScopePath(p);
      if (from !== to && from.startsWith('@>') && to.startsWith('@>') && S.data.placements[from]) scoped.push([from, to, S.data.placements[from]]);
    });
    scoped.forEach(([from]) => delete S.data.placements[from]);
    scoped.forEach(([, to, pl]) => (S.data.placements[to] = { ...placement(to), ...pl }));
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
    const from = inheritedAt(path).map((g) => nameOf('group', g));
    if (from.length) {
      toast(`${listJoin(from)} adds this group to every option. Remove it on the Options tab of ${listJoin(from)}.`, 'error');
      return;
    }
    const info = parsePath(path);
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    let choiceProducts = [];
    const ok = commit(() => (choiceProducts = unlinkPath(path)), { menu: menuById(info.menuId) });
    if (!ok || quiet) return;
    const text = choiceProducts.length
      ? `${nameOf('product', entity('product', info.id))} removed from ${nameOf('category', parent)} and ${choiceProducts.map((p) => nameOf('product', p)).join(' and ')}`
      : `${KIND_LABEL[info.kind]} removed`;
    toast(text, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function unlinkPath(path) {
    const info = parsePath(path);
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const choiceProducts = info.kind === 'product' && pInfo.kind === 'category' ? choiceProductsHolding(parent, info.id) : [];
    parent.children = parent.children.filter((c) => c !== info.id);
    delete S.data.pendingLinks[linkKeyOf(path)];
    if (pInfo.kind === 'product' && parent.ptype === 'size') {
      for (const catPath of choiceProductCategoryPaths(info.parentPath)) {
        const copy = childPath(catPath, 'product', info.id);
        const cat = entity('category', parsePath(catPath).id);
        if (!S.data.pendingLinks[linkKeyOf(copy)] || choiceProductsHolding(cat, info.id).length) continue;
        cat.children = cat.children.filter((c) => c !== info.id);
        delete S.data.pendingLinks[linkKeyOf(copy)];
        for (const k of Object.keys(S.data.placements)) if (k === copy || k.startsWith(`${copy}>`)) delete S.data.placements[k];
      }
    }
    const segs = choiceProducts.map((p) => `>p:${p.id}>p:${info.id}`);
    for (const k of Object.keys(S.data.placements)) {
      if (k === path || k.startsWith(`${path}>`) || segs.some((s) => k.endsWith(s) || k.includes(`${s}>`))) delete S.data.placements[k];
    }
    choiceProducts.forEach((p) => (p.children = p.children.filter((c) => c !== info.id)));
    if (S.ui.selected === path || S.ui.selected.startsWith(`${path}>`) || segs.some((s) => S.ui.selected.endsWith(s) || S.ui.selected.includes(`${s}>`)))
      S.ui.selected = info.parentPath;
    return choiceProducts;
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
    if (inheritedAt(path).length || isPendingLink(path)) return removeLink(path);
    if (info.kind === 'category') return confirmRemoveCategory(entity('category', info.id), menuById(info.menuId));
    const pInfo = parsePath(info.parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const parentUses = pInfo.kind === 'menu' ? 1 : (ctx.usage.get(`${pInfo.kind}:${pInfo.id}`) || []).length;
    if (parentUses <= 1) return removeLink(path);
    const name = nameOf(info.kind, entity(info.kind, info.id));
    const choiceNames =
      info.kind === 'product' && pInfo.kind === 'category' ? choiceProductsHolding(entity('category', pInfo.id), info.id).map((p) => nameOf('product', p)) : [];
    openModal({
      title: `Remove ${name}?`,
      body: `<p>${esc(parentName)} is used in ${parentUses} places, so ${esc(name)} is removed from all of them${choiceNames.length ? `, and from ${esc(choiceNames.join(' and '))}` : ''}. Nothing changes on POS.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: `Remove ${KIND_LABEL[info.kind].toLowerCase()}`, kind: 'danger', onClick: () => { closeModal(); removeLink(path); } },
      ],
    });
  }

  /* ---------- bulk ---------- */

  const DELETE_MAX = 100;
  const parentPathOf = (path) => parsePath(path).parentPath;
  const pathName = (path) => {
    const info = parsePath(path);
    return nameOf(info.kind, entity(info.kind, info.id));
  };
  const parentKey = (path) => {
    const pi = parsePath(parentPathOf(path));
    return `${pi.kind}:${pi.id}`;
  };
  const sharedParent = (paths) => (new Set(paths.map(parentKey)).size === 1 ? pathName(parentPathOf(paths[0])) : '');

  function canHideHere(path) {
    const info = parsePath(path);
    if (info.kind === 'category') return false;
    if (info.kind === 'product') return !hiddenInProduct(path);
    const g = entity('group', info.id);
    return g.children.length > 0 && !(rulesOf(g).min > 0);
  }
  const canShowHere = (path) => parsePath(path).kind !== 'category' && !hiddenInProduct(path);

  function bulkSetHidden(hide) {
    const { paths, noun } = selectionInfo();
    const list = paths.filter((p) => !pendingRoot(p) && groupHiddenAt(p) !== hide && (hide ? canHideHere(p) : canShowHere(p)));
    if (!list.length) return;
    const where = sharedParent(list);
    const ok = commit(() => {
      list.forEach((p) => setBind(`pl|${p}|hidden`, hide));
      T.focusRow = S.ui.selected;
    });
    if (ok) toast(`${noun(list.length)} ${hide ? 'hidden' : 'shown'}${where ? ` in ${where}` : ''}`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function removableRows(paths) {
    const seen = new Set();
    return paths.filter((p) => {
      const k = linkKeyOf(p);
      if (inheritedAt(p).length || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function bulkRemove() {
    const { paths, kind, noun, many } = selectionInfo();
    const list = removableRows(paths).sort((a, b) => b.split('>').length - a.split('>').length);
    if (!list.length) return;
    const n = list.length;
    const run = () => {
      closeModal();
      const ok = commit(() => {
        list.forEach(unlinkPath);
        T.focusRow = S.ui.selected;
      });
      if (ok) toast(`${noun(n)} removed`, 'success', { action: { label: 'Undo', onClick: undo } });
    };
    const cancel = { label: 'Cancel', kind: 'secondary', onClick: closeModal };
    if (kind === 'category') {
      const m = activeMenu();
      const menuName = nameOf('menu', m);
      const only = list.filter((p) => !S.data.menus.some((x) => x.id !== m.id && x.children.includes(parsePath(p).id))).length;
      const who = only === n ? (n === 1 ? 'It is' : 'They are') : `${only} of them are`;
      return openModal({
        title: `Remove ${noun(n)} from ${menuName}?`,
        body: `<p>${m.publishedStoreIds.length ? `Customers stop seeing them in ${esc(menuName)} right away. ` : ''}Nothing changes on POS.</p>
          ${only ? callout('warning', `${who} not in any other menu, so customers will not see ${only === 1 ? 'it' : 'them'} anywhere.`) : ''}`,
        actions: [cancel, { label: 'Remove categories', kind: 'danger', onClick: run }],
      });
    }
    const shared = [
      ...new Set(
        list
          .filter((p) => !isPendingLink(p))
          .map((p) => parsePath(parentPathOf(p)))
          .filter((pi) => pi.kind !== 'menu' && (ctx.usage.get(`${pi.kind}:${pi.id}`) || []).length > 1)
          .map((pi) => nameOf(pi.kind, entity(pi.kind, pi.id))),
      ),
    ];
    if (!shared.length) return run();
    const one = shared.length === 1;
    openModal({
      title: `Remove ${noun(n)}?`,
      body: `<p>${esc(listJoin(shared))} ${one ? 'is' : 'are'} used in more than one place, so ${many} in ${one ? 'it' : 'them'} are removed everywhere ${one ? 'it’s' : 'they’re'} used. Nothing changes on POS.</p>`,
      actions: [cancel, { label: `Remove ${many}`, kind: 'danger', onClick: run }],
    });
  }

  const deleteBlockOf = (kind, e) => (kind === 'product' ? productDeleteBlock(e) : kind === 'group' ? groupDeleteBlock(e) : categoryDeleteBlock(e));

  function bulkDeleteState() {
    const info = selectionInfo();
    const live = info.ents.filter((e) => !e.pending);
    const blocked = live.filter((e) => deleteBlockOf(info.kind, e));
    return { ...info, ok: live.filter((e) => !blocked.includes(e)), blocked };
  }

  function bulkDelete() {
    const { kind, ok, noun } = bulkDeleteState();
    if (!ok.length || ok.length > DELETE_MAX) return;
    const n = ok.length;
    const linked = kind === 'product' ? [...new Set(ok.flatMap(ringsUpAs))].filter((x) => !ok.includes(x)) : [];
    const lines = {
      product: [
        'These products will be removed from all stores, online ordering channels, external channels, and associated order types',
        'These products will be removed from all product groups, categories and menus',
        'These products will be removed from all discounts',
        ok.some((p) => p.ptype === 'size') ? 'Choices and product groups within these products will not be deleted' : 'Product groups within these products will not be deleted',
        linked.length ? `${listJoin(linked.map((x) => nameOf('product', x)))} ${linked.length > 1 ? 'ring' : 'rings'} up as one of these products and will lose that link` : '',
        'If you have active advanced orders that contain these products, you will not be able to delete them. Please cancel all outstanding orders before proceeding.',
      ],
      group: [
        'These product groups will be removed from all stores, online ordering channels, external channels, and associated order types',
        'These product groups will be removed from all products',
        'Products within these product groups will not be deleted',
      ],
      category: [
        'These categories will be removed from all stores, online ordering channels, external channels, and associated order types',
        'These categories will be removed from all menus',
        'Products within these categories will not be deleted',
      ],
    }[kind].filter(Boolean);
    const first = T.sel[0] || S.ui.selected;
    const remove = () => {
      closeModal();
      const done = commit(() => {
        ok.forEach((e) => (kind === 'product' ? deleteProductNow(e) : kind === 'group' ? deleteGroupNow(e) : deleteCategoryNow(e)));
        S.ui.selected = parentPathOf(first);
        T.focusRow = S.ui.selected;
      });
      if (done) toast(`${noun(n)} deleted`);
    };
    openModal({
      title: `Delete ${noun(n)}?`,
      size: 'lg',
      body: `<h3 class="delete-warning-title">This action cannot be undone. Proceed with caution.</h3>
        <ul class="delete-warning-list">${lines.map((t) => `<li>${icon('alertCircle', 18)}<span>${esc(t)}</span></li>`).join('')}</ul>
        <button type="button" class="check-toggle delete-confirm-check" role="checkbox" aria-checked="false" data-action="delete-confirm-toggle">
          <span class="check" aria-hidden="true"></span>Yes, I understand
        </button>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        { label: 'Delete forever', kind: 'danger', disabled: true, onClick: remove },
      ],
    });
  }

  const storesOf = (kind, e) => (kind === 'category' ? categoryStores(e) : productStores(e));

  function openBulkStores(mode, stock = '') {
    const { kind, ents, noun, many } = selectionInfo();
    const live = ents.filter((e) => !e.pending);
    const n = live.length;
    const on = new Set(live.flatMap((e) => storesOf(kind, e).map((s) => s.id)));
    if (!on.size) return toast('No stores yet. Add stores on the menu’s Stores tab', 'info');
    const hiddenAt = (e, sid) => (kind === 'category' ? isHiddenAt(e, sid) : productHiddenAt(e, sid));
    const status = (sid) => {
      const k = live.filter((e) => (mode === 'stock' ? productOutAt(e, sid) : hiddenAt(e, sid))).length;
      const word = mode === 'stock' ? 'Out of stock' : 'Hidden';
      return !k ? '' : k === n ? word : `${word} for ${k} of ${n}`;
    };
    const label = (STOCK_OPTIONS.find((o) => o[0] === stock) || ['', ''])[1];
    const [title, intro, cta] = {
      hide: ['Hide at stores', `Customers at the stores you select do not see these ${many}${kind === 'category' ? ' or their products' : ''}. Applies in every menu.`, 'Hide at'],
      show: ['Show at stores', `Customers at the stores you select see these ${many} again. Applies in every menu.`, 'Show at'],
      stock: ['Set stock at stores', `${noun(n)} ${stock ? `are ${lcFirst(label)}` : 'are back in stock'} at the stores you select. Applies in every menu.`, 'Set stock at'],
    }[mode];
    openListPicker({
      title,
      intro,
      groups: C.menuStoreGroups
        .map((g) => ({
          id: g.id,
          name: g.name,
          items: groupStores(g.id)
            .filter((s) => on.has(s.id))
            .map((s) => ({ id: s.id, name: s.name, alt: status(s.id), meta: s.city })),
        }))
        .filter((g) => g.items.length),
      empty: 'No stores yet',
      noun: ['store', 'stores'],
      placeholder: 'Search by store or city',
      cta: (c) => `${cta} ${c ? plural(c, 'store', 'stores') : 'stores'}`,
      onSave: (ids) => applyBulkStores(kind, live, mode, stock, ids, noun(n)),
    });
  }

  function applyBulkStores(kind, ents, mode, stock, ids, who) {
    const ok = commit(() => {
      T.focusRow = S.ui.selected;
      ents.forEach((e) => {
        const mine = new Set(storesOf(kind, e).map((s) => s.id));
        if (!e.stores) e.stores = {};
        ids.forEach((sid) => {
          if (!mine.has(sid)) return;
          if (kind === 'category') {
            if (mode === 'hide') e.stores[sid] = 'disabled';
            else delete e.stores[sid];
            return;
          }
          if (mode === 'stock' && productPosStockAt(e, sid)) return;
          const cur = { ...(e.stores[sid] || {}) };
          if (mode === 'hide') cur.hidden = true;
          else if (mode === 'show') delete cur.hidden;
          else if (stock) cur.stock = stock;
          else delete cur.stock;
          if (Object.keys(cur).length) e.stores[sid] = cur;
          else delete e.stores[sid];
        });
      });
    });
    if (!ok) return;
    const where = storesWho(ids);
    const what = mode === 'hide' ? 'hidden' : mode === 'show' ? 'shown' : stock ? 'out of stock' : 'back in stock';
    toast(`${who} ${what} at ${where}`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function imageTargets(paths) {
    const out = [];
    paths.forEach((p) => {
      const info = parsePath(p);
      const e = entity(info.kind, info.id);
      if (!e || pendingRoot(p) || (info.kind !== 'product' && info.kind !== 'category') || out.includes(e)) return;
      out.push(e);
    });
    return out;
  }

  function uploadRowImage(paths) {
    T.rowImage = paths;
    const input = $('#row-image-input');
    input.value = '';
    input.click();
  }

  function applyImage(paths, url) {
    const targets = imageTargets(paths);
    if (!targets.length) return;
    const [one, many] = BULK_NOUN[parsePath(paths[0]).kind];
    const n = targets.length;
    const had = targets.filter((e) => e.image);
    const others = targets.filter((e) => !e.image);
    const set = (list) => {
      closeModal();
      if (
        !commit(() => {
          list.forEach((e) => (e.image = url));
          T.focusRow = S.ui.selected;
        })
      )
        return;
      const msg = n === 1 ? (had.length ? 'Image successfully replaced' : 'Image successfully added') : `Image successfully added to ${plural(list.length, one, many)}`;
      toast(msg, 'success', { action: { label: 'Undo', onClick: undo } });
    };
    if (n === 1 || !had.length) return set(targets);
    const them = had.length === 1 ? 'it' : 'them';
    openModal({
      title: 'Replace images?',
      body: `<p>${had.length === n ? `All ${n} ${many} already have an image.` : `${had.length} of ${n} ${many} already ${had.length === 1 ? 'has' : 'have'} an image.`} ${
        others.length === 1
          ? `Replace ${them}, or keep ${them} and add this image only to ${esc(nameOf(parsePath(paths[0]).kind, others[0]))}.`
          : others.length
            ? `Replace ${them}, or keep ${them} and add this image only to the other ${others.length}.`
            : `This image replaces ${them}.`
      }</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        ...(others.length ? [{ label: had.length === 1 ? 'Keep existing image' : 'Keep existing images', kind: 'secondary', onClick: () => set(others) }] : []),
        { label: 'Replace images', kind: 'primary', onClick: () => set(targets) },
      ],
    });
  }
