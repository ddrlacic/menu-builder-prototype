'use strict';

  /* ---------- derived context ---------- */

  let ctxKey = [];
  function derivedCtx() {
    const key = [S.data, dataVersion, activeMenu().id, JSON.stringify(S.ui.halfHintDismissed)];
    if (ctx && key.every((v, i) => v === ctxKey[i])) return ctx;
    ctxKey = key;
    return computeCtx();
  }

  function computeCtx() {
    priceCache = new Map();
    halfCache = new Map();
    const usage = new Map();
    for (const m of S.data.menus) {
      walkMenu(m, (k, id, ent, path) => {
        const key = `${k}:${id}`;
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push(path);
      });
    }
    const menu = activeMenu();
    const inMenuExt = new Set();
    const counts = { category: new Set(), product: new Set(), group: new Set() };
    walkMenu(menu, (k, id, ent) => {
      counts[k].add(id);
      const ext = posIdOf(k, ent);
      if (ext) inMenuExt.add(ext);
    });
    return {
      usage,
      inMenuExt,
      counts: { category: counts.category.size, product: counts.product.size, group: counts.group.size },
      issues: computeIssues(menu),
      compare: compareData(menu),
    };
  }

  function computeIssues(menu) {
    const byPath = new Map();
    const list = [];
    const seen = new Set();
    const add = (path, level, text, dedupeKey, tab) => {
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push({ level, text });
      const k = `${dedupeKey || path}|${text}`;
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ path, level, text, tab });
      }
    };
    if (!menu.name || !menu.name.trim()) add(menu.id, 'error', 'Add a menu name');
    if (!menu.channels.length) add(menu.id, 'error', 'Choose at least one channel');
    if (!menu.orderTypes.length) add(menu.id, 'error', 'Choose at least one order type');
    if (!menu.storeGroups.length) add(menu.id, 'error', 'Add at least one store group');
    menu.storeGroups.forEach((a) => {
      const err = emptyStoreGroupError(a);
      if (err) add(menu.id, 'error', err);
    });
    scheduleProblems(menu.schedule).forEach((t) => add(menu.id, 'error', t));
    if (segmentErrors(menu.segments).some(Boolean)) add(menu.id, 'error', 'Fix the customer segments');
    if (!menu.children.some((cid) => (entity('category', cid) || { children: [] }).children.length)) add(menu.id, 'error', 'Add a category with at least one product');

    walkMenu(menu, (kind, id, ent, path) => {
      const key = `${kind}:${id}`;
      const name = nameOf(kind, ent);
      if (isMissingOnPos(ent)) add(path, 'warning', `${name} was deleted on POS. Customers cannot order it`, key);
      else if (removedFromPos(path)) {
        const pi = parsePath(parsePath(path).parentPath);
        add(path, 'warning', `${name} is no longer under ${nameOf(pi.kind, entity(pi.kind, pi.id))} on POS`, `${pi.kind}:${pi.id}>${key}`);
      }
      if ((ent.description || '').length > DESC_LIMIT) add(path, 'error', `${name}: description is longer than ${DESC_LIMIT} characters`, key);
      if (kind === 'category') {
        const label = name || 'Category';
        if (!(ent.name || '').trim()) add(path, 'error', 'Add a category name', key);
        if ((ent.name || '').length > TEXT_LIMIT) add(path, 'error', `${label}: name is longer than ${TEXT_LIMIT} characters`, key);
        if ((ent.internalName || '').length > TEXT_LIMIT) add(path, 'error', `${label}: internal name is longer than ${TEXT_LIMIT} characters`, key);
        if ((ent.reportingId || '').length > TEXT_LIMIT) add(path, 'error', `${label}: external ID is longer than ${TEXT_LIMIT} characters`, key);
        if (!ent.children.length) add(path, 'warning', `${label} has no products`, key);
        else if (ent.children.every((pid) => placement(childPath(path, 'product', pid)).hidden))
          add(path, 'warning', `${label}: all products are hidden in ${menu.name || 'this menu'}`);
      }
      if (kind === 'product') {
        const label = name || 'Product';
        const pAdd = (level, text, tab) => add(path, level, text, key, tab);
        if (!(ent.name || '').trim()) pAdd('error', 'Add a product name', 'general');
        if ((ent.name || '').length > TEXT_LIMIT) pAdd('error', `${label}: name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.internalName || '').length > TEXT_LIMIT) pAdd('error', `${label}: internal name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.reportingId || '').length > TEXT_LIMIT) pAdd('error', `${label}: external ID is longer than ${TEXT_LIMIT} characters`, 'advanced');
        if (ent.ptype === 'linked') {
          if (!ent.posParentExt) pAdd('error', `${name}: choose the POS product it rings up as, so customers can order it`, 'general');
          else if (!posItemById(ent.posParentExt)) pAdd('error', `${name}: the POS product it rings up as was deleted on POS`, 'general');
        }
        if (ent.ptype === 'container' && !ent.children.length) pAdd('warning', `${name} has no groups. Customers see an empty option`, 'general');
        if (ent.ptype === 'size' && !ent.children.length) pAdd('warning', `${name} has no choices. Customers see it as out of stock`, 'choices');
        const holder = parsePath(parsePath(path).parentPath);
        if (holder.kind === 'product') {
          const home = entity('category', parsePath(holder.parentPath).id);
          if (home && !home.children.includes(id))
            pAdd(
              'warning',
              `${name} is not in ${nameOf('category', home)}, so ${inMenuCategory(menu, id) ? 'delivery apps leave it out of' : 'customers cannot pick it in'} ${nameOf('product', entity('product', holder.id))}`,
              'availability',
            );
        }
        const ps = priceStats(path);
        if (ps.total && ps.missingStores.length && !isMissingOnPos(ent)) {
          const n = ps.missingStores.length;
          if (n === ps.total) pAdd('error', `${name} has no POS price at any store in this menu`, 'general');
          else pAdd('warning', `${name} has no POS price at ${plural(n, 'store', 'stores')}, so customers there cannot ${parsePath(parsePath(path).parentPath).kind === 'category' ? 'order' : 'choose'} it`, 'general');
        }
        if (qtyError(ent.minQty) || qtyError(ent.maxQty)) pAdd('error', `${name}: quantity limits need whole numbers from 1 to ${QTY_MAX}`, 'ordering');
        else if (isNum(ent.minQty) && isNum(ent.maxQty) && ent.maxQty < ent.minQty) pAdd('error', `${name}: maximum quantity is lower than the minimum`, 'ordering');
        if (ent.isAlcoholic && !isNum(ent.alcoholVol)) pAdd('warning', `${name}: alcohol percentage is missing`, 'dietary');
        if (rangeError(ent.caloriesFrom, ent.caloriesTo) || rangeError(ent.servingFrom, ent.servingTo, 1)) pAdd('error', `${name}: fix the calories or serves range`, 'dietary');
        if (ent.isModifierCodeRequired && ent.modifierCodes.length && ent.modifierCodes.every((c) => hiddenCodesAt(path).includes(c)))
          add(path, 'error', `${name}: a modifier code is required, but all codes are hidden here`, undefined, 'ordering');
        if (ent.upsell.products.length && !ent.upsell.title.trim()) pAdd('error', `${name}: add an upsell title`, 'ordering');
        if (ent.included.length && !ent.includedName.trim()) pAdd('error', `${name}: add a name for the included ingredients`, 'ordering');
        if (ent.sections.some((s) => !s.name.trim())) pAdd('error', `${name}: add a name to each group section`, 'ordering');
        if ([ent.upsell.title, ent.includedName, ...ent.sections.map((s) => s.name)].some((v) => lengthError(v)))
          pAdd('error', `${name}: a title on the Ordering tab is longer than ${TEXT_LIMIT} characters`, 'ordering');
        if (ent.metadata.some((t) => lengthError(t.key) || lengthError(t.value))) pAdd('error', `${name}: a metadata tag is longer than ${TEXT_LIMIT} characters`, 'advanced');
        if (Object.values(ent.halfWhole).some((h) => !h.left !== !h.right)) pAdd('warning', `${name}: some toppings have only one half set`, 'ordering');
        const availErr = Object.values(availabilityErrors(ent.availability))[0];
        if (availErr) pAdd('error', `${name} custom availability: ${lcFirst(availErr)}`, 'availability');
        if (segmentErrors(ent.segments).some(Boolean)) pAdd('error', `${name}: fix the customer segments`, 'advanced');
        if (ent.metadata.some((t) => !t.key.trim() || !t.value.trim())) pAdd('error', `${name}: each metadata tag needs a key and a value`, 'advanced');
        const prepErr = Object.values(prepErrors(ent.prep)).find(Boolean);
        if (prepErr) pAdd('error', `${name} prep info: ${lcFirst(prepErr)}`, 'advanced');
        const posId = posIdOf('product', ent);
        if (posId) {
          for (const gid of posChildren(posId)) {
            const pg = posItemById(gid);
            if (!pg || pg.groupType !== 3) continue;
            const present = ent.children.some((c) => posIdOf('group', entity('group', c)) === gid);
            if (!present) pAdd('error', `Combo group ${pg.name} is required. Add it with at least one product`, 'ordering');
          }
        }
      }
      if (kind === 'group') {
        const r = rulesOf(ent);
        const label = name || 'Group';
        const gAdd = (level, text, tab, dedupe = key) => add(path, level, text, dedupe, tab);
        const count = ent.children.length;
        const max = limitOf(r.max);
        if (!(ent.name || '').trim()) gAdd('error', 'Add a group name', 'general');
        if ((ent.name || '').length > TEXT_LIMIT) gAdd('error', `${label}: name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.internalName || '').length > TEXT_LIMIT) gAdd('error', `${label}: internal name is longer than ${TEXT_LIMIT} characters`, 'general');
        if ((ent.reportingId || '').length > TEXT_LIMIT) gAdd('error', `${label}: external ID is longer than ${TEXT_LIMIT} characters`, 'general');
        if (ent.gtype === 'linked' && !posItemById(ent.posGroupExt)) gAdd('error', `${label}: its POS group was deleted on POS. Link it to another group, or unlink it`, 'general');
        const ruleErr = !r.fixed && !ent.isSubstitutionContainer && Object.values(ruleErrors(ent)).find(Boolean);
        if (ruleErr) gAdd('error', `${label}: ${lcFirst(ruleErr)}`, 'options');
        else if (!count) gAdd(r.min > 0 || r.type === 3 ? 'error' : 'warning', `${label} has no products. Add at least one`, 'options');
        else if (r.min > ent.children.reduce((s, pid) => s + optionMaxOf(ent, pid, r), 0))
          gAdd('error', `${label} needs at least ${r.min} choices, but has only ${plural(count, 'option', 'options')}`, 'options');
        if (!ruleErr && max != null && r.freeCount > max) gAdd('warning', `${label}: more free choices than the maximum`, 'options');
        if (Object.values(ent.optionSettings).some((s) => isNum(s.maxQty) && optionMaxError(s.maxQty, null))) gAdd('error', `${label}: an option maximum is not a whole number from 1 to ${QTY_MAX}`, 'options');
        else if (max != null && ent.children.some((pid) => optionMaxOf(ent, pid, r) > max)) gAdd('error', `${label}: an option allows more than the group maximum of ${max}`, 'options');
        if (Object.values(ent.optionSettings).some((s) => lengthError(s.name))) gAdd('error', `${label}: an option name is longer than ${TEXT_LIMIT} characters`, 'options');
        if (ent.sections.some((s) => !s.name.trim())) gAdd('error', `${label}: add a name to each option section`, 'options');
        else if (ent.sections.some((s) => lengthError(s.name))) gAdd('error', `${label}: a section name is longer than ${TEXT_LIMIT} characters`, 'options');
        const preList = ent.children.map((pid) => preselectedAt(childPath(path, 'product', pid)));
        const pre = preList.reduce((s, n) => s + n, 0);
        if (ent.children.some((pid, i) => preList[i] > optionMaxOf(ent, pid, r))) gAdd('error', `${label}: an option is preselected more times than it can be picked`, 'options', null);
        else if (max != null && pre > max) gAdd('error', `${label}: ${pre} options preselected, but the maximum is ${max}`, 'options', null);
        if (r.type === 2 && count && pre !== 1) gAdd('error', `${label}: preselect exactly one size`, 'options', null);
        if (placement(path).hidden && r.min > 0)
          gAdd('error', r.fixed ? `${label} always needs a choice, so it cannot be hidden here. Show it` : `${label} is required, so it cannot be hidden here. Show it, or set the minimum to 0`, 'advanced', null);
        if (halvesSupported(ent) && Object.values(ent.halves).some((h) => !h.left !== !h.right)) gAdd('warning', `${label}: some toppings have only one half set`, 'halves');
        const ungrouped = suggestedHalves(ent)
          .flatMap((s) => [s.left, s.right])
          .filter((pid) => ent.children.includes(pid)).length;
        if (ungrouped) gAdd('warning', `${label}: ${plural(ungrouped, 'option looks', 'options look')} like ${ungrouped === 1 ? 'a half' : 'halves'}. Customers see each one as its own option until you group halves`, 'halves');
        if (ent.metadata.some((t) => !t.key.trim() || !t.value.trim())) gAdd('error', `${label}: each metadata tag needs a key and a value`, 'advanced');
        else if (ent.metadata.some((t) => lengthError(t.key) || lengthError(t.value))) gAdd('error', `${label}: a metadata tag is longer than ${TEXT_LIMIT} characters`, 'advanced');
      }
    });

    list.sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
    return {
      byPath,
      list,
      errors: list.filter((i) => i.level === 'error').length,
      warnings: list.filter((i) => i.level === 'warning').length,
    };
  }

  function isAutoAdded(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath) return false;
    const pi = parsePath(info.parentPath);
    if (pi.kind !== 'group') return false;
    const g = entity('group', pi.id);
    const posG = posItemById(posIdOf('group', g));
    const ent = entity('product', info.id);
    return !!(posG && posG.autoAdded && posG.autoAdded.includes(ent.externalId));
  }

  function groupOfOption(path) {
    const info = parsePath(path);
    if (info.kind !== 'product' || !info.parentPath) return null;
    const pi = parsePath(info.parentPath);
    return pi.kind === 'group' ? entity('group', pi.id) : null;
  }

  function hiddenCodesAt(path) {
    const g = groupOfOption(path);
    return [...new Set([...groupHiddenCodes(g, parsePath(path).id), ...(placement(path).hiddenCodes || [])])];
  }

  const preselectOverridden = (path) => {
    const g = groupOfOption(path);
    return !!g && rulesOf(g).type === 1 && isNum(placement(path).preselected);
  };

  function preselectedAt(path) {
    const pl = placement(path);
    const g = groupOfOption(path);
    const own = g ? (preselectOverridden(path) ? pl.preselected : g.preselected[parsePath(path).id] || 0) : pl.preselected || 0;
    return Math.max(own, isAutoAdded(path) ? 1 : 0);
  }

  function childOnCanvas(kind, path, ent, cid) {
    const ck = childKind(kind, ent);
    const direct = ent.children.some((c) => posIdOf(ck, entity(ck, c)) === cid);
    if (direct) return true;
    if (kind === 'category') {
      return ent.children.some((c) => {
        const p = entity('product', c);
        return !!p && p.ptype === 'size' && p.children.some((s) => posIdOf('product', entity('product', s)) === cid);
      });
    }
    if (kind !== 'product') return false;
    let found = false;
    walkSubtree(path, (k, i, e, p) => {
      if (p !== path && k === 'group' && posIdOf('group', e) === cid) found = true;
    });
    return found;
  }

  function compareData(menu) {
    const missing = new Map();
    const changed = new Map();
    const gone = [];
    const goneSeen = new Set();
    walkMenu(menu, (kind, id, ent, path) => {
      const missingNow = isMissingOnPos(ent);
      const pi = parsePath(parsePath(path).parentPath);
      const linkKey = `${pi.kind}:${pi.id}>${kind}:${id}`;
      if ((missingNow || removedFromPos(path)) && !goneSeen.has(linkKey)) {
        goneSeen.add(linkKey);
        gone.push({ path, kind, ent, label: missingNow ? 'Deleted on POS' : `Removed from ${nameOf(pi.kind, entity(pi.kind, pi.id))} on POS` });
      }
      if (ent.source !== 'pos') return;
      const it = posItem(ent);
      if (!it) return;
      if (ent.reviewed && !changed.has(ent.id)) {
        const diffs = [];
        if (ent.reviewed.name !== it.name) diffs.push(`Name: ${ent.reviewed.name} → ${it.name}`);
        if (kind === 'product' && isNum(it.price) && ent.reviewed.price !== it.price)
          diffs.push('Price changed on POS');
        if (diffs.length) changed.set(ent.id, { kind, ent, path, diffs });
      }
      for (const cid of posChildren(ent.externalId)) {
        const key = `${ent.externalId}/${cid}`;
        if (missing.has(key) || !posItemById(cid) || childOnCanvas(kind, path, ent, cid)) continue;
        missing.set(key, { key, path, kind: childKind(kind, ent), posId: cid, parentName: nameOf(kind, ent), ignored: !!S.data.ignored[key] });
      }
    });
    const all = [...missing.values()];
    const fresh = all.filter((m) => !m.ignored);
    return {
      missing: fresh,
      ignored: all.filter((m) => m.ignored),
      changed: [...changed.values()],
      gone,
      count: fresh.length + changed.size + gone.length,
    };
  }

  /* ---------- binding ---------- */

  function bindTarget(bind, create) {
    const parts = bind.split('|');
    let obj;
    let field;
    if (parts[0] === 'e') {
      obj = entity(parts[1], parts[2]);
      field = parts[3];
    } else if (parts[0] === 'm') {
      obj = menuById(parts[1]);
      field = parts[2];
    } else if (parts[0] === 'pl') {
      obj = S.data.placements[parts[1]];
      if (!obj) {
        if (!create) return { obj: {}, key: parts[2] };
        obj = S.data.placements[parts[1]] = {};
      }
      field = parts[2];
    }
    if (!obj) return { obj: {}, key: field };
    const keys = field.split('.');
    const last = keys.pop();
    for (const k of keys) {
      if (obj[k] == null) {
        if (!create) return { obj: {}, key: last };
        obj[k] = {};
      }
      obj = obj[k];
    }
    return { obj, key: last };
  }

  const getBind = (bind) => {
    const { obj, key } = bindTarget(bind, false);
    return obj[key];
  };
  const setBind = (bind, value) => {
    const { obj, key } = bindTarget(bind, true);
    obj[key] = value;
    const [scope, path, field] = bind.split('|');
    if (scope === 'pl' && field === 'hidden') choicePeerPaths(path).forEach((p) => (S.data.placements[p] = { ...placement(p), hidden: value }));
  };

  function parseInput(el) {
    const raw = el.value;
    const type = el.dataset.type;
    if (type === 'int' || type === 'num') {
      if (raw.trim() === '') return null;
      const v = type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
      return Number.isFinite(v) ? v : null;
    }
    return raw;
  }
