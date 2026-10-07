'use strict';

  /* ---------- render ---------- */

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.focusKey) return null;
    const out = { key: el.dataset.focusKey, value: null, start: null, end: null };
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      out.value = el.value;
      try {
        out.start = el.selectionStart;
        out.end = el.selectionEnd;
      } catch (_) {
        /* number inputs have no selection */
      }
    }
    return out;
  }

  function restoreFocus(f) {
    if (!f) return;
    const el = document.querySelector(`[data-focus-key="${cssEsc(f.key)}"]`);
    if (!el) return;
    if (f.value != null && el.value !== f.value) el.value = f.value;
    el.focus({ preventScroll: true });
    if (f.start != null) {
      try {
        el.setSelectionRange(f.start, f.end);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function render() {
    hideTip();
    const focus = captureFocus();
    const menu = activeMenu();
    if (!menu) {
      renderNoMenus();
      restoreFocus(focus);
      schedulePersist();
      return;
    }
    $('#canvas').classList.remove('is-no-menu');
    if (!S.ui.selected || !pathExists(S.ui.selected) || parsePath(S.ui.selected).menuId !== menu.id) S.ui.selected = menu.id;
    ctx = derivedCtx();
    renderTopbar();
    renderPos();
    renderCanvas();
    renderInspector();
    renderCompare();
    restoreFocus(focus);
    if (T.focusName) {
      T.focusName = false;
      const el = $('#insp-name');
      if (el) {
        el.focus();
        el.select && el.select();
      }
    }
    if (T.posScrollTo && !T.posLoading) {
      const row = document.querySelector(`#pos-tree .pos-row[data-pos-path="${cssEsc(T.posScrollTo)}"]`);
      T.posScrollTo = null;
      if (row) row.scrollIntoView({ block: 'start' });
    }
    if (T.flashPaths.has(S.ui.selected)) {
      const row = document.querySelector(`.row[data-path="${cssEsc(S.ui.selected)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
    if (T.focusRow) {
      const row = document.querySelector(`.row[data-path="${cssEsc(T.focusRow)}"]`);
      T.focusRow = null;
      if (row) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
      }
    }
    if (T.idCard && !T.idCard.anchor.isConnected) hideIdCard(true);
    schedulePersist();
  }

  function renderNoMenus() {
    ctx = null;
    T.cmp = null;
    $('#topbar').innerHTML = `
      <div class="brand">
        <span class="brand-mark">${icon('layers', 16)}</span>
        <span class="brand-name">Menu builder</span>
      </div>
      <nav class="menu-tabs" role="tablist" aria-label="Menus">
        <button class="icon-btn" data-action="new-menu" aria-label="Create menu" title="Create menu">${icon('plus', 16)}</button>
      </nav>`;
    renderPos();
    $('#canvas').classList.add('is-no-menu');
    $('#canvas-head').innerHTML = '';
    $('#canvas-tree').innerHTML = `
      <div class="blank">
        <div class="blank-art">${icon('layers', 22)}</div>
        <h3>No menus yet</h3>
        <button class="btn primary" data-action="new-menu">${icon('plus', 15)}Create menu</button>
      </div>`;
    $('#inspector-head').innerHTML = '';
    $('#inspector-tabs').innerHTML = '';
    $('#inspector-body').innerHTML = '';
  }

  const STATUS = {
    draft: ['Draft', 'neutral'],
    publishing: ['Publishing', 'progress'],
    published: ['Published', 'ok'],
    changed: ['Unpublished changes', 'warn'],
  };

  function renderTopbar() {
    const menu = activeMenu();
    const { errors, warnings } = ctx.issues;
    const [statusLabel, statusTone] = STATUS[menu.status] || STATUS.draft;
    const issueTone = errors ? 'error' : warnings ? 'warning' : 'ok';
    const issueLabel = errors ? plural(errors, 'error', 'errors') : warnings ? plural(warnings, 'warning', 'warnings') : 'No issues';
    $('#topbar').innerHTML = `
      <div class="brand">
        <span class="brand-mark">${icon('layers', 16)}</span>
        <span class="brand-name">Menu builder</span>
      </div>
      <nav class="menu-tabs" role="tablist" aria-label="Menus">
        ${S.data.menus
          .map(
            (m) => {
              const shared = S.data.menus.some((o) => o.id !== m.id && (o.name || '').trim() === (m.name || '').trim());
              return `<button class="menu-tab" role="tab" aria-selected="${m.id === menu.id}" data-action="switch-menu" data-id="${m.id}"${m.internalName ? ` title="${esc(m.internalName)}"` : ''}>
              <span class="status-dot tone-${(STATUS[m.status] || STATUS.draft)[1]}"></span>${esc(m.name || 'Untitled menu')}${shared && m.internalName ? `<span class="muted">${esc(m.internalName)}</span>` : ''}</button>`;
            },
          )
          .join('')}
        <button class="icon-btn" data-action="new-menu" aria-label="Create menu" title="Create menu">${icon('plus', 16)}</button>
      </nav>
      <div class="topbar-actions">
        <div class="btn-pair">
          <button class="icon-btn" data-action="undo" aria-label="Undo" title="Undo (⌘Z)" ${hist.past.length ? '' : 'disabled'}>${icon('undo', 16)}</button>
          <button class="icon-btn" data-action="redo" aria-label="Redo" title="Redo (⇧⌘Z)" ${hist.future.length ? '' : 'disabled'}>${icon('redo', 16)}</button>
        </div>
        <button class="issues-btn tone-${issueTone}" data-action="issues" aria-haspopup="menu">
          ${icon(issueTone === 'ok' ? 'checkCircle' : issueTone === 'error' ? 'alertCircle' : 'alert', 15)}<span>${issueLabel}</span>
        </button>
        <span class="status-pill tone-${statusTone}">${statusTone === 'progress' ? '<span class="spinner"></span>' : ''}${statusLabel}</span>
        <button class="icon-btn" data-action="app-more" aria-label="More options" title="More options">${icon('more', 16)}</button>
        <button class="btn primary" data-action="publish" ${menu.status === 'publishing' ? 'disabled' : ''}>${icon('send', 15)}Publish menu</button>
      </div>`;
  }

  function posSubText() {
    return `Synced ${relTime(S.data.pos.syncedAt)}.`;
  }

  function renderPos() {
    const pos = S.data.pos;
    const pm = posMenu();
    const loading = T.posLoading;
    $('#pos-head').innerHTML = `
      <div class="panel-title-row">
        <h2 class="panel-title">POS items</h2>
        <button class="btn ghost sm" data-action="sync-pos" ${loading ? 'disabled' : ''}>${loading === 'sync' ? '<span class="spinner"></span>Syncing' : `${icon('refresh', 14)}Sync POS`}</button>
      </div>
      <p class="panel-sub">${esc(posSubText())}</p>
      <div class="pos-store">
        <label class="sr-only" for="store-group">POS store group</label>
        <div class="select-wrap">
          <select id="store-group" class="input" data-focus-key="store-group" ${loading ? 'disabled' : ''}>${storeGroups()
            .map((g) => `<option value="${g.id}"${g.id === storeGroup().id ? ' selected' : ''}>${esc(g.name)} · ${esc(g.pos)}</option>`)
            .join('')}</select>${icon('chevDown', 14)}
        </div>
      </div>
      <div class="pos-menus" role="tablist" aria-label="POS menus">${pos.menus
        .map((m) => `<button type="button" role="tab" class="pos-menu-tab" aria-selected="${m.id === pm.id}" data-action="pos-menu" data-id="${m.id}">${esc(m.name)}</button>`)
        .join('')}</div>`;

    if (loading) {
      $('#pos-tree').innerHTML = `<div class="empty-small"><span class="spinner"></span><strong>${loading === 'sync' ? 'Syncing with POS' : `Loading ${esc(storeGroup().name)}`}</strong><span>Large menus can take a few minutes.</span></div>`;
      return;
    }

    const q = S.ui.posQuery.trim().toLowerCase();
    const matches = (id) => {
      const it = pos.items[id];
      return it.name.toLowerCase().includes(q) || id.toLowerCase().includes(q) || posLabel(id).toLowerCase().includes(q);
    };
    const subtreeMatches = (id, depth = 0) =>
      depth < 12 && !!pos.items[id] && (matches(id) || (pos.items[id].children || []).some((c) => subtreeMatches(c, depth + 1)));
    const menuHit = !!q && (pm.name.toLowerCase().includes(q) || pm.id.toLowerCase().includes(q));
    const isOpen = (key, fallback) => {
      const state = q ? T.posSearchExpanded : S.ui.posExpanded;
      return key in state ? !!state[key] : fallback;
    };

    const rows = [];
    const rec = (id, chain, depth, chainCat, underHit) => {
      const it = pos.items[id];
      if (!it) return;
      if (q && !underHit && !subtreeMatches(id)) return;
      const key = chain ? `${chain}/${id}` : id;
      const children = it.children || [];
      const hasChildren = children.length > 0;
      const hit = !!q && matches(id);
      const matchBelow = !!q && children.some((c) => subtreeMatches(c, depth));
      const expanded = isOpen(key, matchBelow);
      const cat = it.type === 'category' ? id : chainCat;
      rows.push({ id, it, key, depth, hasChildren, expanded, hit, chainCat: depth === 2 ? chainCat : '' });
      if (hasChildren && expanded && depth < 13) children.forEach((c) => rec(c, key, depth + 1, cat, underHit || hit));
    };
    const menuKey = `menu:${pm.id}`;
    const menuOpen = isOpen(menuKey, true);
    const hasMatches = !q || menuHit || pm.roots.some((r) => subtreeMatches(r));
    if (hasMatches) {
      rows.push({ id: pm.id, it: { type: 'menu', name: pm.name }, key: menuKey, depth: 0, hasChildren: pm.roots.length > 0, expanded: menuOpen, hit: menuHit, isMenu: true });
      if (menuOpen) pm.roots.forEach((r) => rec(r, '', 1, '', menuHit));
    }

    const hl = (name) => {
      if (!q) return esc(name);
      const i = name.toLowerCase().indexOf(q);
      if (i < 0) return esc(name);
      return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
    };

    $('#pos-tree').innerHTML = rows.length
      ? rows
          .map((r) => {
            const inMenu = ctx ? (r.isMenu ? pm.roots.every((c) => ctx.inMenuExt.has(c)) : ctx.inMenuExt.has(r.id)) : false;
            const meta = r.it.type === 'group' ? C.groupTypes[r.it.groupType || 1].label : '';
            const label = r.isMenu ? r.it.name : posLabel(r.id);
            const showAlt = label !== r.it.name;
            return `<div class="pos-row${S.ui.showPosIds ? ' has-id' : ''}${T.flashExt.has(r.id) ? ' is-flash' : ''}" ${r.hasChildren ? `data-key="${esc(r.key)}"` : ''} role="treeitem" aria-level="${r.depth + 1}" ${r.hasChildren ? `aria-expanded="${r.expanded}"` : ''} draggable="true" data-pos-id="${r.id}" data-pos-path="${r.isMenu ? '' : esc(r.key)}" data-kind="${r.it.type}" data-name="${esc(label)}" data-chain-cat="${esc(r.chainCat)}" style="--depth:${r.depth}" title="${esc(r.it.name)} · ${r.id}">
              ${r.hasChildren ? `<button class="twisty" data-action="pos-toggle" data-key="${esc(r.key)}" tabindex="-1" aria-label="${r.expanded ? 'Collapse' : 'Expand'}">${icon('chevRight', 14)}</button>` : '<span class="twisty-spacer"></span>'}
              <span class="kind-glyph kind-${r.it.type}">${icon(KIND_ICON[r.it.type], 13)}</span>
              <span class="pos-name">${hl(r.it.name)}${showAlt ? `<span class="pos-alt">${esc(label)}</span>` : ''}${S.ui.showPosIds ? `<span class="pos-id tnum">${hl(r.id)}</span>` : ''}</span>
              ${meta ? `<span class="pos-meta">${meta}</span>` : ''}
              <span class="pos-added" ${inMenu ? `title="${r.isMenu ? 'All categories are in this menu' : 'In this menu'}"` : ''}>${inMenu ? icon('check', 13) : ''}</span>
              <button type="button" class="icon-btn sm pos-add" data-action="pos-add" aria-label="Add ${esc(label)} to menu" title="Add to menu">${icon('plus', 14)}</button>
            </div>`;
          })
          .join('')
      : `<div class="empty-small"><strong>No matching POS items</strong><span>Try a different name or POS ID.</span></div>`;
  }

  function isExpanded(path, depth) {
    const v = S.ui.expanded[path];
    return v == null ? depth <= 1 : v;
  }

  function visibleRows(menu) {
    const q = S.ui.canvasQuery.trim().toLowerCase();
    const rows = [];
    if (q) {
      const keep = new Set();
      const hits = new Set();
      walkMenu(menu, (k, id, ent, path) => {
        if (nameOf(k, ent).toLowerCase().includes(q) || (posIdOf(k, ent) || '').toLowerCase().includes(q)) {
          hits.add(path);
          keep.add(path);
          ancestorsOf(path).forEach((a) => keep.add(a));
          const role = halfRole(path);
          if (role && role.wholePath) keep.add(role.wholePath);
        }
      });
      walkMenu(menu, (kind, id, ent, path, depth) => {
        if (!keep.has(path)) return false;
        rows.push({ kind, id, ent, path, depth, expanded: true, hit: hits.has(path) });
        return true;
      });
    } else {
      walkMenu(menu, (kind, id, ent, path, depth) => {
        const expanded = isExpanded(path, depth);
        rows.push({ kind, id, ent, path, depth, expanded });
        return expanded;
      });
    }
    return nestHalves(rows);
  }

  function nestHalves(rows) {
    const nested = new Map();
    const top = [];
    for (const r of rows) {
      const role = r.kind === 'product' ? halfRole(r.path) : null;
      if (role) r.half = role;
      if (role && role.wholePath) {
        if (!nested.has(role.wholePath)) nested.set(role.wholePath, []);
        nested.get(role.wholePath).push(r);
      } else top.push(r);
    }
    if (!nested.size) return rows;
    const out = [];
    for (const r of top) {
      out.push(r);
      const kids = nested.get(r.path);
      if (!kids) continue;
      r.halfKids = kids.length;
      if (!r.expanded) continue;
      kids
        .sort((a, b) => (a.half.side === 'left' ? 0 : 1) - (b.half.side === 'left' ? 0 : 1))
        .forEach((k) => out.push({ ...k, depth: r.depth + 1, nestedHalf: true }));
    }
    return out;
  }

  function thumb(kind, ent, cls = '') {
    if (ent.image) return `<img class="thumb thumb-img ${cls}" src="${ent.image}" alt="">`;
    const v = isVirtual(ent) ? ' is-virtual' : '';
    if (kind === 'category') return `<span class="thumb kind-category${v} ${cls}">${icon('folder', 15)}</span>`;
    if (kind === 'group') return `<span class="thumb kind-group${v} ${cls}">${icon('layers', 15)}</span>`;
    if (kind === 'menu') return `<span class="thumb kind-menu ${cls}">${icon('layers', 15)}</span>`;
    if (ent.ptype === 'container') return `<span class="thumb kind-virtual is-virtual ${cls}">${icon('dashed', 15)}</span>`;
    if (ent.ptype === 'size') return `<span class="thumb kind-container is-virtual ${cls}">${icon('package', 15)}</span>`;
    const name = nameOf('product', ent);
    return `<span class="thumb thumb-initials${ent.ptype === 'linked' ? ' is-linked' : ''} ${cls}">${esc(initials(name))}</span>`;
  }

  function typeHelp(kind, ent) {
    if (!isVirtual(ent)) return '';
    if (kind === 'category') return 'Arranges products your own way. Not on POS.';
    if (kind === 'product') {
      if (ent.ptype === 'linked') return ent.posParentExt ? `Your version of ${posLabel(ent.posParentExt)}. POS gets the original, at its price.` : 'Choose the POS product it rings up as.';
      if (ent.ptype === 'container') return 'Opens more options. POS gets only what customers pick inside.';
      if (ent.ptype === 'size') return 'Customers pick one product inside. Only that product goes to POS.';
      return '';
    }
    if (ent.gtype === 'linked') {
      const pos = posLabel(ent.posGroupExt);
      return `Your name and rules for ${pos}. Changing them leaves ${pos} unchanged on other products. POS gets the options in ${pos}.`;
    }
    return 'Products customers can add. Each one goes on the order as its own item.';
  }

  function kindLabel(kind, ent) {
    if (kind === 'menu') return 'Menu';
    if (kind === 'category') return isVirtual(ent) ? 'Menu-only category' : 'Category';
    if (kind === 'product')
      return { pos: 'Product', linked: 'Custom product', container: 'Option folder', size: 'Choice product' }[ent.ptype];
    if (ent.gtype === 'linked') return 'Custom group';
    if (ent.gtype === 'standalone') return 'Suggested products';
    return `${C.groupTypes[rulesOf(ent).type].label} group`;
  }

  function rowHtml(r) {
    const { kind, id, ent, path, depth } = r;
    const info = parsePath(path);
    const parentKind = parsePath(info.parentPath).kind;
    const selected = S.ui.selected === path;
    const hasChildren = ent.children.length > 0 || !!r.halfKids;
    const pl = placement(path);
    const uses = (ctx.usage.get(`${kind}:${id}`) || []).length;
    const issues = ctx.issues.byPath.get(path) || [];
    const issueTone = issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warning' : '';
    const ownerGroup = kind === 'product' && parentKind === 'group' ? entity('group', parsePath(info.parentPath).id) : null;
    const name = ownerGroup ? optionName(ownerGroup, id) : nameOf(kind, ent);

    let meta = '';
    if (kind === 'category') {
      const hiddenKids = ent.children.filter((pid) => placement(childPath(path, 'product', pid)).hidden).length;
      meta = esc((ent.internalName ? `${ent.internalName} · ` : '') + plural(ent.children.length, 'product', 'products') + (hiddenKids ? ` · ${hiddenKids} hidden` : ''));
    } else if (kind === 'product') {
      const halves = r.half ? null : wholeHalves(path);
      if (r.half) {
        const label = r.nestedHalf ? SIDE_LABEL[r.half.side] : `${SIDE_LABEL[r.half.side]} of ${optionName(entity('group', r.half.gid), r.half.whole)}`;
        meta = `<span class="half-meta">${icon(r.half.side === 'left' ? 'halfLeft' : 'halfRight', 11)}${esc(label)}</span>`;
      } else if (ent.ptype === 'size') meta = esc(`Choice product · ${plural(ent.children.length, 'choice', 'choices')}`);
      else if (ent.ptype === 'container') meta = esc(`Option folder · ${plural(ent.children.length, 'group', 'groups')}`);
      else if (ent.ptype === 'linked') meta = `${icon('link', 11)}${esc(ent.posParentExt ? `Rings up as ${posLabel(ent.posParentExt)}` : 'Choose what it rings up as')}`;
      else if (ent.children.length) meta = esc(plural(ent.children.length, 'group', 'groups'));
      else if (halves)
        meta = `<span class="half-meta">${icon('halves', 11)}${esc(halves.left && halves.right ? 'Left and right halves' : `${SIDE_LABEL[halves.left ? 'left' : 'right']} only`)}</span>`;
      if (!r.half && ent.internalName) meta = `${esc(ent.internalName)}${meta ? ' · ' : ''}${meta}`;
    } else if (kind === 'group') {
      const rules = rulesOf(ent);
      const host = parsePath(info.parentPath);
      const withHalves =
        halvesSupported(ent) && host.kind === 'product'
          ? ent.children.filter((pid) => {
              const { h } = halvesAt(entity('product', host.id), ent.id, pid);
              return h.left && h.right;
            }).length
          : 0;
      const extra =
        (ent.gtype === 'linked' ? ` · From ${posLabel(ent.posGroupExt)}` : ent.gtype === 'standalone' ? ' · Each one added as its own item' : '') +
        (withHalves ? ` · ${withHalves} with halves` : '');
      meta = `<span class="type-tag type-${rules.type}">${C.groupTypes[rules.type].label}</span>${esc(ent.isSubstitutionContainer ? 'Substitutes only · Hidden in Web App' : groupRuleShort(rules) + extra)}`;
    }
    const posId = S.ui.showPosIds ? posIdOf(kind, ent) : '';
    if (posId) meta = `${meta ? `${meta}<span aria-hidden="true">·</span>` : ''}<span class="tnum">${esc(posId)}</span>`;

    const issueDot = issueTone ? `<span class="issue-dot tone-${issueTone}" title="${esc(issues.map((i) => i.text).join('\n'))}"></span>` : '';
    const suggestion =
      kind === 'category' && suggestedSizeSets(ent).length
        ? `<button class="badge badge-action" data-action="group-sizes" data-path="${esc(path)}" title="Group size variants into one product">${icon('sparkles', 12)}Group sizes</button>`
        : kind === 'group' && suggestedHalves(ent).length
          ? `<button class="badge badge-action" data-action="group-halves" data-id="${esc(id)}" title="Match left and right halves to their toppings">${icon('sparkles', 12)}Group halves</button>`
          : '';
    const badges = [];
    if (isMissingOnPos(ent)) badges.push(`<span class="badge tone-error">Deleted on POS</span>`);
    else if (removedFromPos(path)) badges.push(`<span class="badge tone-warning">Removed on POS</span>`);
    const hiddenHere = groupHiddenAt(path);
    if (hiddenHere) badges.push(`<span class="badge" title="Hidden in this placement">${icon('eyeOff', 12)}Hidden</span>`);
    if (ownerGroup && name !== nameOf('product', ent)) badges.push(`<span class="badge" title="Product name: ${esc(nameOf('product', ent))}">Renamed</span>`);
    if (kind === 'group' && ruleOverridden(ent)) badges.push(`<span class="badge" title="Rules differ from POS">${icon('diff', 12)}Custom rules</span>`);
    if (kind === 'product') {
      const av = ent.availability;
      if (av && av.active)
        badges.push(`<span class="badge" title="${esc(availabilitySummary(av))}">${icon('clock', 12)}${{ serving: 'Serving times', lto: 'Limited time', preorder: 'Preorder' }[av.mode]}</span>`);
      const pre = preselectedAt(path);
      if (pre) badges.push(`<span class="badge tone-accent">Preselected${pre > 1 ? ` ×${pre}` : ''}</span>`);
      if (isAutoAdded(path)) badges.push(`<span class="badge" title="Added automatically by POS">Auto-added</span>`);
      const ps = priceStats(path);
      if (ps.total && ps.missingStores.length && !isMissingOnPos(ent)) {
        const all = ps.missingStores.length === ps.total;
        badges.push(`<span class="badge tone-${all ? 'error' : 'warning'}" title="No POS price, so customers there cannot order it">No price at ${all ? 'any store' : plural(ps.missingStores.length, 'store', 'stores')}</span>`);
      }
      const sids = Object.keys(ent.stores || {});
      const oos = sids.filter((sid) => productOutAt(ent, sid)).length;
      const hiddenAt = sids.filter((sid) => !productShownAt(ent, sid)).length;
      if (oos) badges.push(`<span class="badge tone-warning">Out of stock at ${plural(oos, 'store', 'stores')}</span>`);
      if (hiddenAt) badges.push(`<span class="badge" title="Hidden from the menu at these stores">Hidden at ${plural(hiddenAt, 'store', 'stores')}</span>`);
    }
    if (kind === 'category') {
      if (ent.isBundle) badges.push(`<span class="badge" title="Quantities scale with the number of guests">${icon('package', 12)}Catering bundles</span>`);
      const off = hiddenCategoryStores(ent).length;
      if (off) badges.push(`<span class="badge" title="Customers at these stores do not see the category">Hidden at ${plural(off, 'store', 'stores')}</span>`);
    }
    if (isCustomVersion(ent)) badges.push(`<span class="badge tone-virtual" title="Rings up on POS as the original">${icon('link', 12)}Custom</span>`);
    else if (isVirtual(ent)) badges.push(`<span class="badge tone-virtual" title="Exists only in this menu. Not on POS">Menu only</span>`);
    if (uses > 1) badges.push(`<span class="badge" title="Used in ${uses} places">${icon('copy', 12)}${uses}</span>`);
    const posLink =
      ent.source === 'pos' && !isMissingOnPos(ent)
        ? `<button type="button" class="pos-link" tabindex="-1" data-action="copy-text" data-value="${esc(ent.externalId)}" data-label="POS ID" data-id-card aria-label="Copy POS ID ${esc(ent.externalId)}">${icon('link', 13)}</button>`
        : '';

    const flashCls = T.flashPaths.has(path) || (ent.externalId && T.flashExt.has(ent.externalId)) ? ' is-flash' : '';
    const addTitle = kind === 'category' ? 'Add product' : kind === 'product' ? (ent.ptype === 'size' ? 'Add choice' : 'Add group') : 'Add option';
    return `<div class="row${selected ? ' is-selected' : ''}${hiddenHere ? ' is-muted' : ''}${r.hit ? ' is-hit' : ''}${r.nestedHalf ? ' is-half' : ''}${flashCls}" role="treeitem" aria-level="${depth}" aria-selected="${selected}" ${hasChildren ? `aria-expanded="${r.expanded}"` : ''} tabindex="${selected ? 0 : -1}" draggable="${r.nestedHalf ? 'false' : 'true'}"${r.nestedHalf ? ` data-half-of="${esc(r.half.wholePath)}"` : ''} data-path="${esc(path)}" data-kind="${kind}" data-child-kind="${childKind(kind, ent)}" data-parent-kind="${parentKind}" data-name="${esc(name)}" style="--depth:${depth - 1}">
      <span class="row-indent" aria-hidden="true"></span>
      ${hasChildren ? `<button class="twisty" data-action="toggle" data-path="${esc(path)}" tabindex="-1" aria-label="${r.expanded ? 'Collapse' : 'Expand'}">${icon('chevRight', 14)}</button>` : '<span class="twisty-spacer"></span>'}
      ${thumb(kind, ent)}
      <span class="row-main"><span class="row-title">${esc(name)}</span>${meta ? `<span class="row-meta">${meta}</span>` : ''}</span>
      ${suggestion}${issueDot}
      <span class="row-swap">
        <span class="row-badges">${badges.join('')}</span>
        <span class="row-actions">
          <button class="icon-btn sm" data-action="add" data-path="${esc(path)}" aria-label="${addTitle}" title="${addTitle}">${icon('plus', 15)}</button>
          <button class="icon-btn sm" data-action="more" data-path="${esc(path)}" aria-label="More options for ${esc(name)}" title="More options">${icon('more', 15)}</button>
        </span>
      </span>
      ${posLink}
    </div>`;
  }

  function renderCanvas() {
    const menu = activeMenu();
    const c = ctx.counts;
    const selected = S.ui.selected === menu.id;
    const changes = ctx.compare.count;
    $('#canvas-head').innerHTML = `
      <button class="menu-card${selected ? ' is-selected' : ''}" data-action="select-menu">
        <span class="menu-card-title">${esc(menu.name || 'Untitled menu')}</span>
        <span class="menu-card-meta tnum">${plural(c.category, 'category', 'categories')} · ${plural(c.product, 'product', 'products')} · ${plural(c.group, 'group', 'groups')}<span class="sep">·</span>${icon('clock', 12)}${esc(menuScheduleSummary(menu))}</span>
      </button>
      <div class="canvas-tools">
        <div class="tools-find">
        <label class="search-field">
          ${icon('search', 15)}
          <span class="sr-only">Search this menu</span>
          <input id="canvas-search" type="search" data-focus-key="canvas-search" placeholder="Search by name or POS ID" value="${esc(S.ui.canvasQuery)}" autocomplete="off">
        </label>
        <button class="icon-btn" data-action="expand-all" aria-label="Expand all" title="Expand all">${icon('expand', 16)}</button>
        <button class="icon-btn" data-action="collapse-all" aria-label="Collapse all" title="Collapse all">${icon('collapse', 16)}</button>
        </div>
        <div class="tools-actions">
        <button class="btn secondary" data-action="compare">${icon('diff', 15)}Compare to POS${changes ? `<span class="btn-count tnum">${changes}</span>` : ''}</button>
        <button class="btn secondary" data-action="optimize">${icon('sparkles', 15)}Optimize</button>
        <button class="btn secondary" data-action="add-category" aria-haspopup="menu">${icon('plus', 15)}Add category</button>
        </div>
      </div>`;

    const tree = $('#canvas-tree');
    if (!menu.children.length) {
      tree.innerHTML = `
        <div class="blank">
          <div class="blank-art">${icon('layers', 22)}</div>
          <h3>Build your first category</h3>
          <p>Add categories from POS, or drag a POS menu here. Products keep their POS prices and options. To arrange products your own way, create a menu-only category.</p>
          <div class="blank-actions">
            <button class="btn primary" data-action="add-pos-category">${icon('plus', 15)}Add POS category</button>
            <button class="btn secondary" data-action="create-category">${icon('dashed', 15)}Create menu-only category</button>
          </div>
        </div>`;
      return;
    }
    const rows = visibleRows(menu);
    tree.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<div class="empty-small"><strong>Nothing matches “${esc(S.ui.canvasQuery)}”</strong><span>Try a different name or POS ID.</span></div>`;
  }
