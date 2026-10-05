'use strict';

  const TEXT_LIMIT = 255;
  const channelLabel = (id) => (C.channels.find((c) => c[0] === id) || [id, id])[1];
  const lengthError = (value, required = '') => {
    const v = value || '';
    if (required && !v.trim()) return required;
    return v.length > TEXT_LIMIT ? `Use ${TEXT_LIMIT} characters or fewer` : '';
  };

  function menuTab(tab, m) {
    const mb = (f) => `m|${m.id}|${f}`;
    if (tab === 'general') {
      return section(
        '',
        field('Name', inputText(mb('name'), m.name, { id: 'insp-name' }), { id: 'insp-name', error: lengthError(m.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
          field('Internal name', inputText(mb('internalName'), m.internalName, { id: 'm-int' }), { id: 'm-int', error: lengthError(m.internalName), help: 'Use it to tell apart menus with the same name. Only your team sees it.' }) +
          descriptionField(mb('description'), m.description, 'm-desc') +
          imageField(mb('image'), m.image),
      );
    }
    if (tab === 'ordering') return menuOrderingTab(m, mb);
    if (tab === 'availability') return menuAvailabilityTab(m, mb);
    if (tab === 'stores') return menuStoresTab(m);
    return (
      section(
        'Identifiers',
        field(
          'POS ID',
          m.posExt
            ? `<div class="copy-field"><input type="text" class="input mono" value="${esc(m.posExt)}" readonly aria-label="POS ID">
                <button type="button" class="icon-btn sm" data-action="copy-text" data-value="${esc(m.posExt)}" data-label="POS ID" aria-label="Copy POS ID" title="Copy POS ID">${icon('copy', 14)}</button></div>`
            : '<p class="field-help">Not linked to a POS menu. Drag a POS menu onto the canvas to link it.</p>',
          { pos: !!m.posExt },
        ) +
          field('External ID', inputText(mb('externalId'), m.externalId, { id: 'm-ext', mono: true }), {
            id: 'm-ext',
            error: lengthError(m.externalId),
            help: 'Use it to match this menu in reports outside this platform.',
          }),
      ) +
      (S.data.menus.length > 1
        ? section('', `<button type="button" class="btn secondary tone-danger" data-action="delete-menu" data-id="${m.id}">${icon('trash', 15)}Delete menu</button>`)
        : '')
    );
  }

  function menuOrderingTab(m, mb) {
    const bind = mb('orderTypes');
    const orderTypeRows = C.orderTypes
      .map(([v, l]) => {
        const on = m.orderTypes.includes(v);
        const on_ = (C.orderTypeChannels[v] || []).map(channelLabel);
        return `<button type="button" class="option-row" aria-pressed="${on}" data-chip="${esc(bind)}" data-value="${esc(v)}" data-focus-key="${esc(bind)}~${esc(v)}">
          <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
          <span class="option-text"><span class="option-label">${esc(l)}</span>${on_.length ? `<span class="option-hint">Available on ${esc(listJoin(on_))}</span>` : ''}</span>
        </button>`;
      })
      .join('');
    return (
      section(
        'Channels',
        field('', chips(mb('channels'), m.channels, C.channels), {
          error: m.channels.length ? '' : 'Choose at least one channel',
          help: 'Customers can order from this menu in these apps.',
        }),
      ) +
      section(
        'Order types',
        field('', `<div class="option-list">${orderTypeRows}</div>`, {
          error: m.orderTypes.length ? '' : 'Choose at least one order type',
          help: 'Customers see this menu only for these order types.',
        }),
      ) +
      section('Delivery partners', field('', chips(mb('externalChannels'), m.externalChannels, C.deliveryPartners), { help: 'Third-party apps that also get this menu.' }))
    );
  }

  const slotError = (text) => `<p class="field-error">${icon('alertCircle', 13)}${esc(text)}</p>`;

  function segmentTags() {
    const tags = new Set(C.segmentTags);
    S.data.menus.forEach((x) => x.segments.forEach((s) => s.tag && tags.add(s.tag)));
    Object.values(S.data.entities.product).forEach((p) => (p.segments || []).forEach((s) => s.tag && tags.add(s.tag)));
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  function menuAvailabilityTab(m, mb) {
    const custom = m.schedule.length > 0;
    const overlap = scheduleOverlapDays(m.schedule);
    const sameTimes = m.schedule.some((s) => s.from === s.to);
    const schedule = `<div class="segmented" role="radiogroup" aria-label="Serving times">
        <button type="button" role="radio" class="seg" aria-checked="${!custom}" data-action="menu-sched-mode" data-mode="store">Store hours</button>
        <button type="button" role="radio" class="seg" aria-checked="${custom}" data-action="menu-sched-mode" data-mode="custom">Custom times</button>
      </div>
      ${
        custom
          ? scheduleEditor(mb('schedule'), m.schedule) +
            (overlap.length ? slotError(`Time slots overlap on ${listJoin(overlap.map((d) => DAYS[d]))}`) : '') +
            (sameTimes ? slotError('Each time slot needs different start and end times') : '') +
            '<p class="field-help">Customers can order only when the store is open too.</p>'
          : '<p class="field-help">Customers can order from this menu whenever the store is open.</p>'
      }`;

    return section('Serving times', schedule, { desc: 'Products can narrow these times further.' }) + segmentsSection(mb('segments'), m.segments, 'menu');
  }

  function segmentsSection(base, segments, subject) {
    const errors = segmentErrors(segments);
    const tagList = `<datalist id="segment-tags">${segmentTags().map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
    const segmentRows = segments
      .map(
        (s, i) => `<div class="segment-row${errors[i] ? ' has-error' : ''}">
          <div class="segment-inputs">
            <input type="text" class="input mono" aria-label="Segment ID" data-bind="${esc(`${base}.${i}.segmentId`)}" data-type="text" data-focus-key="${esc(`${base}.${i}.segmentId`)}" value="${esc(s.segmentId)}" autocomplete="off" spellcheck="false">
            <input type="text" class="input" aria-label="Tag" list="segment-tags" data-bind="${esc(`${base}.${i}.tag`)}" data-type="text" data-focus-key="${esc(`${base}.${i}.tag`)}" value="${esc(s.tag)}" autocomplete="off">
            <button type="button" class="icon-btn sm" data-action="segment-remove" data-bind="${esc(base)}" data-index="${i}" aria-label="Remove segment" title="Remove segment">${icon('x', 14)}</button>
          </div>
          ${errors[i] ? slotError(errors[i]) : ''}
        </div>`,
      )
      .join('');
    const draft = T.segmentDraft && T.segmentDraft.base === base ? T.segmentDraft : null;
    const draftId = draft ? draft.segmentId.trim().toLowerCase() : '';
    const draftDup = draftId && segments.some((s) => s.segmentId.trim().toLowerCase() === draftId);
    const draftForm = draft
      ? `<div class="segment-draft${draftDup ? ' has-error' : ''}">
          <div class="segment-labels"><span class="field-label">Segment ID</span><span class="field-label">Tag</span></div>
          <div class="segment-inputs">
            <input type="text" class="input mono" aria-label="Segment ID" data-segment-draft="segmentId" data-focus-key="segment-draft-id" value="${esc(draft.segmentId)}" autocomplete="off" spellcheck="false">
            <input type="text" class="input" aria-label="Tag" list="segment-tags" data-segment-draft="tag" data-focus-key="segment-draft-tag" value="${esc(draft.tag)}" autocomplete="off">
            <span aria-hidden="true"></span>
          </div>
          ${draftDup ? slotError('This segment is already added') : ''}
          <div class="segment-draft-actions">
            <button type="button" class="btn ghost sm" data-action="segment-cancel">Cancel</button>
            <button type="button" class="btn primary sm" data-action="segment-save" ${draftId && !draftDup && draft.tag.trim() ? '' : 'disabled'}>Add segment</button>
          </div>
        </div>`
      : `<button type="button" class="btn ghost sm" data-action="segment-add" data-bind="${esc(base)}">${icon('plus', 14)}Add segment</button>`;
    return section('Customer segments', `${tagList}${segmentRows ? `<div class="segment-list">${segmentRows}</div>` : ''}${draftForm}`, {
      desc: segments.length ? `Only customers in these segments see this ${subject}.` : `Everyone sees this ${subject}. Add a segment to limit it to specific customers.`,
    });
  }

  function menuStoresTab(m) {
    const total = menuStores(m).length;
    const free = C.menuStoreGroups.filter((g) => !m.storeGroups.some((a) => a.id === g.id));
    const error = !m.storeGroups.length ? 'Add at least one store group' : total ? '' : 'Choose at least one store';
    return section(
      'Store groups',
      `<p class="store-summary">${total ? `${plural(total, 'store', 'stores')} from ${plural(m.storeGroups.length, 'group', 'groups')}` : 'No stores yet'}</p>
      <div class="group-cards">${m.storeGroups.map((a, i) => storeGroupCard(m, a, i)).join('')}</div>
      ${field('', `<button type="button" class="btn secondary sm" data-action="menu-group-add" ${free.length ? '' : 'disabled'}>${icon('plus', 14)}Add store group</button>`, { error })}`,
      { desc: 'The menu goes live at these stores when you publish.' },
    );
  }

  function storeGroupCard(m, a, i) {
    const g = groupDef(a.id);
    const all = groupStores(a.id);
    const chosen = assignedStores(a);
    const sel = new Set(chosen.map((s) => s.id));
    const published = new Set(m.publishedStoreIds);
    const open = T.openStoreGroup === a.id;
    const row = (s) => {
      const on = sel.has(s.id);
      const status = on ? (published.has(s.id) ? ['Published', 'ok'] : ['Ready to publish', 'neutral']) : null;
      return `<button type="button" class="store-row store-check" data-action="menu-group-store" data-group="${a.id}" data-id="${s.id}" aria-pressed="${on}">
        <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
        <span class="store-name">${esc(s.name)}</span>${status ? `<span class="store-status tone-${status[1]}">${status[0]}</span>` : `<span class="muted">${esc(s.city)}</span>`}</button>`;
    };
    const q = T.storeQuery.trim();
    const onlySelected = T.showSelectedStores;
    const pool = onlySelected ? chosen : all;
    const results = matchStores(pool);
    const scope = q ? results : all;
    const list = onlySelected ? chosen : [...chosen, ...all.filter((s) => !sel.has(s.id))];
    const allOn = scope.length && scope.every((s) => sel.has(s.id));
    const bulkLabel = q
      ? `${allOn ? 'Remove' : 'Add'} ${plural(results.length, 'matching store', 'matching stores')}`
      : allOn
        ? 'Clear all'
        : 'Select all';
    return `<div class="group-card${open ? ' is-open' : ''}">
      <div class="group-card-head">
        <button type="button" class="group-card-toggle" data-action="menu-group-open" data-id="${a.id}" aria-expanded="${open}">
          ${icon('chevRight', 14)}
          <span class="group-card-title"><strong>${esc(g ? g.name : a.id)}</strong><span class="muted tnum">${chosen.length} of ${all.length} stores</span></span>
        </button>
        <button type="button" class="icon-btn sm" data-action="menu-group-remove" data-id="${a.id}" aria-label="Remove ${esc(g ? g.name : a.id)}" title="Remove store group">${icon('x', 14)}</button>
      </div>
      ${toggle(`m|${m.id}|storeGroups.${i}.newStores`, a.newStores, { label: 'Add new stores automatically', help: 'Stores added to this group later get the menu too.' })}
      ${
        open
          ? `<div class="group-card-body">
            ${storeSearch(`msg-q-${a.id}`, 'Search by store or city')}
            <div class="group-card-tools">
              ${scope.length && !onlySelected ? `<button type="button" class="btn ghost sm" data-action="menu-group-bulk" data-group="${a.id}" data-on="${allOn ? 0 : 1}">${bulkLabel}</button>` : '<span></span>'}
              <button type="button" class="check-toggle" role="checkbox" aria-checked="${onlySelected}" data-action="menu-group-only-selected">
                <span class="check${onlySelected ? ' is-on' : ''}" aria-hidden="true">${onlySelected ? icon('check', 12) : ''}</span>Show only selected</button>
            </div>
            ${
              q
                ? storeResults(results, row)
                : list.length
                  ? `<div class="store-list">${list.slice(0, 8).map(row).join('')}</div>${list.length > 8 ? `<p class="field-help">And ${list.length - 8} more. Search to find a store.</p>` : ''}`
                  : '<p class="field-help">No stores selected in this group yet.</p>'
            }
          </div>`
          : ''
      }
    </div>`;
  }

  const menusWithCategory = (catId) => S.data.menus.filter((m) => m.children.includes(catId));
  const isCateringMenu = (m) => m.orderTypes.some((o) => o.startsWith('catering'));

  function categoryProductsSection(cat, path, menu) {
    const rows = cat.children.map((pid) => ({ p: entity('product', pid), pp: childPath(path, 'product', pid) })).filter((r) => r.p);
    if (!rows.length) return section(`Products in ${menu.name}`, '<p class="field-help">No products yet. Drag products from POS items onto this category.</p>');
    const hidden = rows.filter((r) => placement(r.pp).hidden);
    const q = T.catProductQuery.trim().toLowerCase();
    const onlyHidden = T.catOnlyHidden && hidden.length > 0;
    const list = (onlyHidden ? hidden : rows).filter((r) => !q || nameOf('product', r.p).toLowerCase().includes(q));
    const row = ({ p, pp }) => {
      const off = !!placement(pp).hidden;
      const name = nameOf('product', p);
      return `<div class="opt-row${off ? ' is-muted' : ''}">
        <button type="button" class="opt-name" data-action="goto" data-path="${esc(pp)}">${thumb('product', p, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label">${esc(name)}</span></span></button>
        <button type="button" class="switch" role="switch" aria-checked="${!off}" aria-label="Show ${esc(name)} in ${esc(menu.name)}" data-toggle="pl|${esc(pp)}|hidden" data-focus-key="pl|${esc(pp)}|hidden"><span class="switch-thumb"></span></button>
      </div>`;
    };
    const summary = hidden.length ? `${rows.length - hidden.length} of ${rows.length} shown` : `All ${plural(rows.length, 'product', 'products')} shown`;
    return section(
      `Products in ${menu.name}`,
      `${rows.length > 8 ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search products</span><input id="cat-product-q" type="search" data-cat-product-search data-focus-key="cat-product-q" placeholder="Search products" value="${esc(T.catProductQuery)}" autocomplete="off"></label>` : ''}
      <div class="group-card-tools">
        <span class="store-summary tnum">${esc(summary)}</span>
        ${
          hidden.length
            ? `<button type="button" class="check-toggle" role="checkbox" aria-checked="${onlyHidden}" data-action="cat-only-hidden"><span class="check${onlyHidden ? ' is-on' : ''}" aria-hidden="true">${onlyHidden ? icon('check', 12) : ''}</span>Show only hidden</button>`
            : ''
        }
      </div>
      ${
        list.length
          ? `<div class="opt-table is-compact"><div class="opt-head"><span>Product</span><span>Shown</span></div>${list.map(row).join('')}</div>`
          : '<p class="field-help">No products match. Check the spelling.</p>'
      }
      ${hidden.length ? `<button type="button" class="btn ghost sm" data-action="cat-show-all" data-path="${esc(path)}">${icon('eye', 14)}${hidden.length === 1 ? 'Show the hidden product' : `Show all ${hidden.length} hidden products`}</button>` : ''}`,
      { desc: `Hidden products stay in the category. Applies only in ${esc(menu.name)}.` },
    );
  }

  function categoryMenusSection(cat, menu) {
    const inMenus = new Set(menusWithCategory(cat.id).map((m) => m.id));
    const all = [...S.data.menus].sort((x, y) => (x.id === menu.id ? -1 : y.id === menu.id ? 1 : 0));
    const selected = all.filter((m) => inMenus.has(m.id));
    const big = all.length > 6;
    const q = big ? T.menuQuery.trim().toLowerCase() : '';
    const onlySelected = big && T.showSelectedMenus;
    const list = (onlySelected ? selected : [...selected, ...all.filter((m) => !inMenus.has(m.id))]).filter((m) => !q || nameOf('menu', m).toLowerCase().includes(q));
    const row = (m) => {
      const on = inMenus.has(m.id);
      const hint = m.id === menu.id ? 'This menu' : plural(m.children.length, 'category', 'categories');
      return `<button type="button" class="store-row store-check" data-action="cat-menu-toggle" data-id="${m.id}" aria-pressed="${on}">
        <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
        <span class="store-name">${esc(nameOf('menu', m))}</span><span class="muted">${esc(hint)}</span></button>`;
    };
    return section(
      'Menus',
      `${
        big
          ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search menus</span><input id="cat-menu-q" type="search" data-cat-menu-search data-focus-key="cat-menu-q" placeholder="Search ${all.length} menus" value="${esc(T.menuQuery)}" autocomplete="off"></label>
            <div class="group-card-tools"><span class="store-summary tnum">In ${selected.length} of ${all.length} menus</span>
              <button type="button" class="check-toggle" role="checkbox" aria-checked="${onlySelected}" data-action="cat-only-selected-menus"><span class="check${onlySelected ? ' is-on' : ''}" aria-hidden="true">${onlySelected ? icon('check', 12) : ''}</span>Show only selected</button></div>`
          : ''
      }
      ${list.length ? `<div class="store-list">${list.map(row).join('')}</div>` : '<p class="field-help">No menus match. Check the spelling.</p>'}`,
      { desc: 'Customers see the category only in the menus you select. Adding it to a menu puts it at the end.' },
    );
  }

  function sizeHintSection(cat, path) {
    const sets = suggestedSizeSets(cat);
    if (!sets.length) return '';
    const names = listJoin(sets.map((s) => `<strong>${esc(containerName(s))}</strong>`));
    return section(
      'Suggestion',
      `${callout('info', `${names} ${sets.length === 1 ? 'is' : 'are'} listed once per size. Group the sizes into one product, so customers choose a size after picking it.`, 'sparkles')}
       <div class="hint-actions">
         <button type="button" class="btn secondary sm" data-action="group-sizes" data-path="${esc(path)}">${icon('sparkles', 14)}Group sizes</button>
         <button type="button" class="btn ghost sm" data-action="dismiss-size-hint" data-path="${esc(path)}">Dismiss suggestion</button>
       </div>`,
    );
  }

  function categoryTab(tab, cat, path) {
    const cb = (f) => `e|category|${cat.id}|${f}`;
    const menu = activeMenu();
    if (tab === 'general') {
      return (
        sizeHintSection(cat, path) +
        section(
          '',
          nameBlock('category', cat, { error: lengthError(cat.name, 'Add a name'), help: 'Customers see this name in the apps.', sync: false }) +
            field('Internal name', inputText(cb('internalName'), cat.internalName, { id: 'c-int' }), {
              id: 'c-int',
              error: lengthError(cat.internalName),
              help: 'Use it to tell apart categories with the same name. Only your team sees it.',
            }) +
            descriptionField(cb('description'), cat.description, 'c-desc'),
        )
      );
    }
    if (tab === 'images') {
      return section(
        '',
        imageField(cb('image'), cat.image, { help: 'Shown on Kiosk, and in apps built with the Ordering API.' }) +
          imageField(cb('bannerImage'), cat.bannerImage, { label: 'Header image', size: '2114 × 288', wide: true, help: 'Shown across the top of the category in the apps.' }),
      );
    }
    if (tab === 'availability') {
      const index = menu.children.indexOf(cat.id);
      const count = menu.children.length;
      const moveBtn = (delta, ic, label) =>
        `<button type="button" class="icon-btn sm" data-action="cat-move" data-path="${esc(path)}" data-delta="${delta}" aria-label="${label}" title="${label}" ${index + delta < 0 || index + delta >= count ? 'disabled' : ''}>${icon(ic, 14)}</button>`;
      return (
        section(
          `In ${menu.name}`,
          field('Position', `<div class="position-control"><span class="tnum">${index + 1} of ${count}</span>${moveBtn(-1, 'chevUp', 'Move up')}${moveBtn(1, 'chevDown', 'Move down')}</div>`, {
              scope: crumbText(path),
              help: `Order customers see in ${esc(menu.name)}. You can also drag it on the canvas.`,
            }),
        ) +
        categoryProductsSection(cat, path, menu) +
        categoryMenusSection(cat, menu)
      );
    }
    if (tab === 'stores') {
      return section('', storesList('category', cat, STORE_STATES), { desc: 'Status at each store, in every menu. At disabled stores, customers do not see the category.' });
    }
    const inMenus = menusWithCategory(cat.id);
    return (
      sourceSection('category', cat, path) +
      section(
        'Identifiers',
        field('External ID', inputText(cb('reportingId'), cat.reportingId, { id: 'c-ext', mono: true }), {
          id: 'c-ext',
          error: lengthError(cat.reportingId),
          help: 'Use it to match this category in reports outside this platform.',
        }),
      ) +
      section(
        'Catering',
        toggle(cb('isBundle'), cat.isBundle, { label: 'Catering bundles', help: 'Quantities scale with the number of guests customers choose.' }) +
          (cat.isBundle && !isCateringMenu(menu) ? callout('info', `${esc(menu.name)} has no catering order types, so this has no effect there.`) : ''),
      ) +
      removeSection(path, 'category', cat) +
      section(
        '',
        `<button type="button" class="btn secondary tone-danger" data-action="cat-delete" data-id="${cat.id}">${icon('trash', 15)}Delete category</button>
        <p class="field-help">Removes it from ${inMenus.length > 1 ? `all ${inMenus.length} menus` : esc(menu.name)}. Its products are not deleted${cat.source === 'pos' ? ', and nothing changes on POS' : ''}.</p>`,
      )
    );
  }
