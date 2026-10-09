'use strict';

  function dragDescFromPath(path) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    return {
      origin: 'canvas',
      path,
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
    if (t.pos === 'inside') return { parentPath: t.path, index: Infinity };
    const parentPath = targetInfo.parentPath;
    const pi = parsePath(parentPath);
    const index = entity(pi.kind, pi.id).children.indexOf(targetInfo.id) + (t.pos === 'after' ? 1 : 0);
    return { parentPath, index };
  }

  function performDrop(d, t) {
    if (t.auto) return autoPlace(d);
    let { parentPath, index } = resolveDrop(d, t);
    const err = dropError(parentPath, d);
    if (err) return toast(err, 'error');
    const pInfo = parsePath(parentPath);
    let newPath = null;
    let reused = false;
    let linked = null;
    let alsoIn = null;
    let movedTo = null;
    commit(() => {
      const parent = entity(pInfo.kind, pInfo.id);
      if (pInfo.kind === 'menu' && d.origin === 'pos') linked = linkMenuToPosCategory(parent, d.posId);
      const parentName = nameOf(pInfo.kind, parent);
      let moved = false;
      let id;
      if (d.origin === 'pos') {
        const res = importPos(d.posId);
        id = res.id;
        reused = res.stats.reused > 0 && res.stats.created === 0;
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
          throw new Abort(`${from} adds this group to every option. Remove it on the Options tab of ${from}.`);
        }
        moved = oldParent !== parent;
        oldParent.children.splice(oldIndex, 1);
      }
      parent.children.splice(Math.min(index, parent.children.length), 0, id);
      if (d.origin === 'pos') stageLink(pInfo.kind, pInfo.id, d.kind, id);
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
      newPath = childPath(parentPath, d.kind, id);
      if (moved) {
        rekeyPlacements(d.path, newPath);
        movedTo = parentName;
      }
      if (pInfo.kind === 'product' && parent.ptype === 'size') alsoIn = keepChoiceInMenu(parentPath, id);
      S.ui.expanded[parentPath] = true;
      S.ui.selected = newPath;
      flash(newPath);
    });
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

  function autoPlace(d) {
    const menu = activeMenu();
    if (d.kind === 'menu') return placePosMenu(d);
    if (d.kind === 'category') return performDrop(d, { path: menu.id, pos: 'inside' });
    const chain = d.posPath || [];
    if (chain.length < 2) return toast(`${d.name} is sold only as an option on POS. Drop it on a group instead`, 'error');

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
    if (depth === chain.length) {
      const parent = parsePath(parsePath(path).parentPath);
      expandTo(path);
      flash(path);
      select(path);
      return toast(`${d.name} is already in ${nameOf(parent.kind, entity(parent.kind, parent.id))}`, 'error');
    }
    if (depth === chain.length - 1) return performDrop(d, { path, pos: 'inside' });

    let newPath = null;
    let linked = null;
    commit(() => {
      if (depth === 0) linked = linkMenuToPosCategory(menu, chain[0]);
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
          stageLink(kind, ent.id, topKind, childId);
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
      stageLink(info.kind, info.id, topKind, childId);
      newPath = path;
      for (let i = depth; i < chain.length; i++) {
        const ni = parsePath(newPath);
        const k = childKind(ni.kind, entity(ni.kind, ni.id));
        const ent = findByExt(k, chain[i]);
        newPath = childPath(newPath, k, ent.id);
      }
      expandTo(newPath);
      S.ui.selected = newPath;
      flash(newPath);
    });
    if (newPath) toast(`Added to ${crumbText(parsePath(newPath).parentPath)}`, 'info');
    if (newPath && linked) toast(`Linked to POS menu ${linked.name}`);
  }

  function placePosMenu(d) {
    const menu = activeMenu();
    const pm = S.data.pos.menus.find((m) => m.id === d.posId);
    if (!pm) return;
    const present = new Set(menu.children.map((cid) => entity('category', cid).externalId).filter(Boolean));
    const missing = pm.roots.filter((r) => !present.has(r));
    if (!missing.length) return toast(`All categories from ${pm.name} are already in ${menu.name}`, 'info');
    let firstPath = null;
    commit(() => {
      if (!menu.posExt) {
        menu.posExt = pm.id;
        if (!menu.image && pm.image) menu.image = pm.image;
      }
      for (const r of missing) {
        const res = importPos(r);
        if (!res) continue;
        menu.children.push(res.id);
        stageLink('menu', menu.id, 'category', res.id);
        const p = childPath(menu.id, 'category', res.id);
        if (!firstPath) firstPath = p;
        flash(p);
      }
      if (firstPath) S.ui.selected = firstPath;
    });
    if (firstPath) toast(missing.length === 1 ? `1 category added from ${pm.name}` : `${missing.length} categories added from ${pm.name}`);
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

  function applyPosSync() {
    const items = S.data.pos.items;
    const first = !S.data.pos.syncCount && !!items['pos-truffle'];
    commit(() => {
      if (first) {
        items['pos-truffle'].price = 19;
        items['pos-smash'] = {
          type: 'product',
          name: 'Double Smash Burger',
          price: 15,
          description: 'Two crispy-edged patties, onions, and pickles.',
          children: ['pos-g-temp', 'pos-g-side'],
        };
        items['pos-cat-burgers'].children.push('pos-smash');
        S.data.pos.priceGaps['pos-smash'] = { from: 312, reason: 'Not rolled out yet' };
        items['pos-g-addons'].children = items['pos-g-addons'].children.filter((c) => c !== 'pos-m-avocado');
      }
      S.data.pos.syncCount = (S.data.pos.syncCount || 0) + 1;
      S.data.pos.syncedAt = Date.now();
    });
    if (first) {
      T.flashExt = new Set(['pos-truffle', 'pos-smash', 'pos-m-avocado']);
      render();
      setTimeout(() => T.flashExt.clear(), 1600);
      toast('POS synced. 3 changes to review', 'info', { action: { label: 'Review', onClick: openCompare } });
    } else {
      toast('POS synced. No changes', 'info');
    }
  }

  const IMPORT_MS = 2400;

  function importStaged() {
    if (T.importing || !pendingRows().length) return;
    closePopover();
    T.importing = true;
    render();
    setTimeout(() => {
      T.importing = false;
      const reached = new Set();
      S.data.menus.forEach((m) => walkMenu(m, (k, id) => void reached.add(`${k}:${id}`)));
      for (const [kind, map] of Object.entries(S.data.entities))
        for (const [id, e] of Object.entries(map)) if (e.pending && !reached.has(`${kind}:${id}`)) delete map[id];
      clearPending();
      Object.assign(hist, { past: [], future: [], key: null, at: 0 });
      dataVersion++;
      render();
      toast('POS items successfully imported');
    }, IMPORT_MS);
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
            const ok = commit(() => {
              for (const path of rows) {
                const info = parsePath(path);
                const p = parsePath(info.parentPath);
                const parent = entity(p.kind, p.id);
                parent.children = parent.children.filter((c) => c !== info.id);
                delete S.data.pendingLinks[linkKeyOf(path)];
                for (const k of Object.keys(S.data.placements)) if (k === path || k.startsWith(`${path}>`)) delete S.data.placements[k];
              }
            });
            if (ok) toast(`${plural(rows.length, 'item', 'items')} discarded`, 'success', { action: { label: 'Undo', onClick: undo } });
          },
        },
      ],
    });
  }

  function publish() {
    const m = activeMenu();
    if (T.importing) return;
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
    openModal({
      title: `Publish ${m.name}?`,
      body: `<p>Customers see the changes in ${esc(listJoin(m.channels.map(channelLabel)))} within a few minutes. Nothing changes on POS.</p>
        <dl class="kv"><dt>Stores</dt><dd>${esc(storeCountLabel(m))}</dd><dt>Categories</dt><dd>${m.children.length}</dd><dt>Order types</dt><dd>${esc(listJoin(m.orderTypes.map((o) => (C.orderTypes.find((x) => x[0] === o) || [o, o])[1])))}</dd></dl>
        ${ctx.issues.warnings ? callout('warning', `${plural(ctx.issues.warnings, 'warning remains', 'warnings remain')}. You can still publish.`) : ''}`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: closeModal },
        {
          label: 'Publish menu',
          kind: 'primary',
          onClick: () => {
            closeModal();
            m.status = 'publishing';
            dataVersion++;
            render();
            setTimeout(() => {
              m.status = 'published';
              m.publishedAt = Date.now();
              m.publishedStoreIds = menuStores(m).map((s) => s.id);
              m.pricedKeys = menuPriceKeys(m);
              dataVersion++;
              render();
              toast('Menu successfully published');
            }, 1400);
          },
        },
      ],
    });
  }

  function exportMenu() {
    const m = activeMenu();
    const ser = (kind, id, path, guard) => {
      const e = entity(kind, id);
      if (!e || guard.has(`${kind}:${id}`)) return null;
      const g = new Set(guard).add(`${kind}:${id}`);
      const pl = placement(path);
      const kids = (ck) => e.children.map((c) => ser(ck, c, childPath(path, ck, c), g)).filter(Boolean);
      const out = {
        id: e.id,
        pos_id: e.source === 'pos' ? e.externalId : null,
        name: nameOf(kind, e),
        internal_name: e.internalName || null,
        description: e.description || null,
        is_available: !groupHiddenAt(path),
      };
      if (kind === 'category') {
        Object.assign(out, {
          external_id: e.reportingId || null,
          position: m.children.indexOf(id),
          has_image: !!e.image,
          has_banner_image: !!e.bannerImage,
          is_bundle: e.isBundle,
          is_virtual_container: isVirtual(e),
          venues: Object.fromEntries(hiddenCategoryStores(e).map((s) => [s.id, { state: 2 }])),
          products: kids('product'),
        });
      } else if (kind === 'product') {
        const choices = e.ptype === 'size';
        const a = e.availability;
        const optionRef = (key) => {
          const [gid, pid] = key.split(':');
          return { product_group_id: gid, product_id: pid };
        };
        Object.assign(out, {
          is_original_name_propagated: !!e.namePropagated,
          external_id: e.reportingId || null,
          has_image: !!e.image,
          is_virtual_container: e.ptype === 'container',
          is_product_container: e.ptype === 'size',
          is_linked_product: e.ptype === 'linked',
          pos_parent_entity_id: e.ptype === 'linked' ? e.posParentExt : null,
          pos_origin_category_id: e.originCategoryExt,
          food_types: e.foodType ? [e.foodType] : [],
          allergens: e.ptype === 'container' ? [] : e.allergens,
          calories_from: e.caloriesFrom,
          calories_to: e.caloriesTo,
          serving_people_from: e.servingFrom,
          serving_people_to: e.servingTo,
          min_quantity: e.minQty,
          max_quantity: e.maxQty,
          quantity_limit_scope: isNum(e.minQty) || isNum(e.maxQty) ? e.qtyScope : null,
          is_alcoholic: e.isAlcoholic,
          alcohol_vol_percentage: e.isAlcoholic && isNum(e.alcoholVol) ? Math.round(e.alcoholVol * 100) : null,
          is_modifier_code_required: e.isModifierCodeRequired,
          modifier_codes: e.modifierCodes,
          preselected_modifier_code: e.preselectedCode,
          hidden_modifier_codes: hiddenCodesAt(path),
          preselected_quantity: preselectedAt(path),
          nutrition_info: e.nutrition.active ? e.nutrition : null,
          prep_info: e.prep.active
            ? { prep_station_id: e.prep.station || null, prep_qty_major: e.prep.qty, prep_unit_major: e.prep.unit || null, prep_qty_minor: e.prep.qty2, prep_unit_minor: e.prep.unit2 || null }
            : null,
          limited_availability: a.active
            ? { mode: a.mode, serving_times: a.mode === 'serving' ? a.slots : null, lto: a.mode === 'lto' ? a.lto : null, preorder: a.mode === 'preorder' ? a.preorder : null }
            : null,
          secret_identifiers: e.segments.map((s) => ({ segment_id: s.segmentId, tag: s.tag })),
          metadata: e.metadata,
          upsell: choices
            ? { name: null, products: e.children.map(productRef).filter(Boolean) }
            : e.upsell.products.length
              ? { name: e.upsell.title, products: e.upsell.products.map(productRef).filter(Boolean) }
              : null,
          cross_sell: e.crossSell.map(productRef).filter(Boolean),
          included_ingredients: validIncluded(e).map((i) => ({ product_group_id: i.gid, product_id: i.pid, is_locked: !!i.locked })),
          included_ingredients_group_name: e.included.length ? e.includedName : null,
          substitutes: productOptions(e)
            .map((o) => ({ ...optionRef(o.key), follows_product_group: !substitutesAt(e, o.gid, o.pid).own, ids: substitutesAt(e, o.gid, o.pid).ids }))
            .filter((x) => x.ids.length || !x.follows_product_group)
            .map(({ ids, ...x }) => ({ ...x, substitutes: ids.map(productRef).filter(Boolean) })),
          partial_variants: productOptions(e, { modifierOnly: true })
            .map((o) => ({ ...optionRef(o.key), follows_product_group: !halvesAt(e, o.gid, o.pid).own, h: halvesAt(e, o.gid, o.pid).h }))
            .filter((x) => x.h.left && x.h.right)
            .map(({ h, ...x }) => ({ ...x, left: productRef(h.left), right: productRef(h.right) })),
          sections: e.sections.map((s) => ({ id: s.id, name: s.name, product_group_ids: e.children.filter((gid) => sectionOf(e, gid) === s.id) })),
          product_group_sections: Object.entries(e.optionSections).map(([gid, o]) => ({
            product_group_id: gid,
            is_sections_overridden: true,
            sections: o.sections.map((s) => ({ id: s.id, name: s.name, product_ids: o.children.filter((pid) => sectionOfOption(o, pid) === s.id) })),
          })),
          venues: Object.fromEntries(
            Object.entries(e.stores).map(([sid, st]) => [
              sid,
              {
                show_in_menu: productShownAt(e, sid),
                in_stock: !st.stock,
                out_of_stock_duration: STOCK_DURATION[st.stock] || null,
                ...(hasPosStock(sid) && { pos_available: !st.posStock, pos_unavailable_duration: STOCK_DURATION[st.posStock] || null }),
              },
            ]),
          ),
          product_groups: choices ? [] : kids('group'),
        });
      } else {
        const r = rulesOf(e);
        const groupOf = (pid) => siblingPosGroups(e).find((x) => x.children.includes(pid));
        const partRef = (pid) => (productRef(pid) ? { ...productRef(pid), product_group_id: (groupOf(pid) || {}).id || null } : null);
        delete out.is_original_name_propagated;
        Object.assign(out, {
          type: r.type,
          external_id: e.reportingId || null,
          has_image: !!e.image,
          is_virtual_container: isVirtual(e),
          pos_parent_entity_id: e.gtype === 'linked' ? e.posGroupExt : null,
          min_quantity: r.min,
          max_quantity: r.max,
          max_single_quantity: r.maxSingle,
          free_count: r.freeCount,
          is_substitution_container: e.isSubstitutionContainer,
          propagated_product_groups: isVirtual(e) ? e.propagated : [],
          metadata: e.metadata,
          product_settings: e.children.map((pid, i) => {
            const s = e.optionSettings[pid] || {};
            return {
              product_id: pid,
              position: i,
              name: (s.name || '').trim() || null,
              max_quantity: r.type === 1 && isNum(s.maxQty) ? s.maxQty : null,
              preselected_quantity: e.preselected[pid] || 0,
              hidden_modifier_codes: s.hiddenCodes || [],
              section_id: sectionOfOption(e, pid),
            };
          }),
          sections: e.sections.map((s) => ({ id: s.id, name: s.name, product_ids: e.children.filter((pid) => sectionOfOption(e, pid) === s.id) })),
          substitution_templates: Object.entries(e.swaps).map(([pid, keys]) => ({
            product_id: pid,
            substitutes: keys
              .map((k) => {
                const [gid, sid] = k.split(':');
                return productRef(sid) && { ...productRef(sid), product_group_id: gid };
              })
              .filter(Boolean),
          })),
          partial_variant_templates: halvesSupported(e)
            ? Object.entries(e.halves)
                .filter(([, h]) => h.left && h.right)
                .map(([pid, h]) => ({ product_id: pid, left: partRef(h.left), right: partRef(h.right) }))
            : [],
          products: kids('product'),
        });
      }
      return out;
    };
    const out = {
      name: m.name,
      internal_name: m.internalName || null,
      description: m.description || null,
      external_id: m.externalId || null,
      has_image: !!m.image,
      pos_id: m.posExt,
      menu_channels: m.channels,
      order_types: m.orderTypes,
      external_channels: m.externalChannels,
      availability: m.schedule,
      segments: m.segments.map((s) => ({ segment_id: s.segmentId, tag: s.tag })),
      store_groups: m.storeGroups.map((a) => ({ id: a.id, venue_ids: assignedStores(a).map((s) => s.id), assign_to_new_stores: a.newStores })),
      categories: m.children.map((c) => ser('category', c, childPath(m.id, 'category', c), new Set())).filter(Boolean),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'menu'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Menu successfully exported');
  }
