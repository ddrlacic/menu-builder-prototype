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
    commit(() => {
      const parent = entity(pInfo.kind, pInfo.id);
      if (pInfo.kind === 'menu' && d.origin === 'pos') linked = linkMenuToPosCategory(parent, d.posId);
      const parentName = nameOf(pInfo.kind, parent);
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
        }
        oldParent.children.splice(oldIndex, 1);
      }
      parent.children.splice(Math.min(index, parent.children.length), 0, id);
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
      if (d.origin === 'canvas' && newPath !== d.path) rekeyPlacements(d.path, newPath);
      S.ui.expanded[parentPath] = true;
      S.ui.selected = newPath;
      flash(newPath);
    });
    if (newPath && linked) toast(`Linked to POS menu ${linked.name}`);
    if (newPath && reused) {
      const uses = (ctx.usage.get(`${d.kind}:${parsePath(newPath).id}`) || []).length;
      if (uses > 1) toast(`Reusing ${nameOf(d.kind, entity(d.kind, parsePath(newPath).id))}. Edits apply in all ${uses} places`, 'info');
    }
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
          allergens: ['milk', 'wheat'],
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

  function publish() {
    const m = activeMenu();
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
        is_available: !pl.hidden,
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
          venues: Object.fromEntries(
            Object.entries(e.stores).map(([sid, st]) => [
              sid,
              { show_in_menu: st !== 'hidden', in_stock: !isOutOfStock(st), out_of_stock_duration: { oos_1h: '1h', oos_4h: '4h', oos_eod: 'end_of_day' }[st] || null },
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
          substitution_templates: Object.entries(e.swaps).map(([pid, ids]) => ({ product_id: pid, substitutes: ids.map(productRef).filter(Boolean) })),
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
