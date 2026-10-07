'use strict';

  const TEXT_LIMIT = 255;
  const MENU_PARTNER_ONLY = 'Not shown in our ordering apps. Sent to delivery partners with the menu.';
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
        field('Name', inputText(mb('name'), m.name, { id: 'insp-name' }), { id: 'insp-name', error: lengthError(m.name, 'Add a name'), help: 'Customers see it when a store has more than one menu.' }) +
          field('Internal name', inputText(mb('internalName'), m.internalName, { id: 'm-int' }), { id: 'm-int', error: lengthError(m.internalName), help: 'Use it to tell apart menus with the same name. Only your team sees it.' }) +
          descriptionField(mb('description'), m.description, 'm-desc', MENU_PARTNER_ONLY) +
          imageField(mb('image'), m.image, { help: MENU_PARTNER_ONLY, posSrc: posImageOf(m) }),
      );
    }
    if (tab === 'ordering') return menuOrderingTab(m, mb);
    if (tab === 'availability') return menuAvailabilityTab(m, mb);
    if (tab === 'stores') return menuStoresTab(m);
    const posMenu = linkedPosMenu(m);
    return (
      section(
        'POS',
        m.posExt
          ? posKv([posIdRow(m.posExt), ...(posMenu ? [['POS name', esc(posMenu.name)]] : [])])
          : '<p class="field-help">Not linked to a POS menu. Add a category from POS to link it.</p>',
      ) +
      section(
        'Identifiers',
        field('External ID', inputText(mb('externalId'), m.externalId, { id: 'm-ext', mono: true }), {
          id: 'm-ext',
          error: lengthError(m.externalId),
          help: 'Use it to match this menu in reports outside this platform.',
        }),
      ) +
      section(
        '',
        `<button type="button" class="btn secondary tone-danger" data-action="delete-menu" data-id="${m.id}" ${m.status === 'publishing' ? 'disabled' : ''}>${icon('trash', 15)}Delete menu</button>` +
          (m.status === 'publishing' ? '<p class="field-help">You can delete the menu once publishing finishes.</p>' : ''),
      )
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
      }
      ${ownTimesNote(m)}`;

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

  function ownTimesStores(m) {
    const on = new Set(menuStores(m).map((s) => s.id));
    return m.ownTimesStoreIds.filter((id) => on.has(id)).map((id) => storeById.get(id));
  }

  function ownTimesNote(m) {
    const own = ownTimesStores(m);
    if (!own.length) return '';
    const few = own.length <= 3;
    const who = few ? `${listJoin(own.map((s) => s.name))} ${own.length === 1 ? 'has' : 'have'}` : `${own.length} of ${menuStores(m).length} stores have`;
    return `${callout('info', `${esc(who)} their own serving times, so the menu’s times do not apply there.`)}
      <div class="hint-actions">
        <button type="button" class="btn secondary sm" data-action="own-times-view">View stores</button>
        <button type="button" class="btn ghost sm" data-action="own-times-reset-all">Reset to menu times</button>
      </div>`;
  }

  const ownTimesWho = (ids) => (ids.length === 1 ? storeById.get(ids[0]).name : plural(ids.length, 'store', 'stores'));

  function confirmOwnTimesReset(m, ids, onCancel = closeModal) {
    openModal({
      title: `Reset ${ownTimesWho(ids)} to menu times?`,
      body: `<p>Their own serving times are replaced with the menu’s. From then on, they follow the menu when its times change.</p>`,
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: onCancel },
        { label: 'Reset to menu times', kind: 'primary', onClick: () => { closeModal(); resetOwnTimes(m, ids); } },
      ],
    });
  }

  function resetOwnTimes(m, ids) {
    const gone = new Set(ids);
    const ok = commit(() => {
      m.ownTimesStoreIds = m.ownTimesStoreIds.filter((id) => !gone.has(id));
    });
    if (ok) toast(`${ownTimesWho(ids)} reset to menu times`, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function openOwnTimesStores(m, sel = new Set(), query = '') {
    openModal({
      title: 'Stores with own serving times',
      body: `<p>The menu’s serving times do not apply at these stores. Edit a store’s times on its menu page, or reset stores to the menu’s times here.</p>
        <label class="search-field">${icon('search', 15)}<span class="sr-only">Search by store or city</span>
          <input id="ot-search" type="search" placeholder="Search by store or city" autocomplete="off" value="${esc(query)}"></label>
        <div id="ot-list"></div>`,
      foot: '<div class="modal-foot" id="ot-foot"></div>',
    });
    T.ot = { menuId: m.id, query, sel };
    renderOwnTimesStores();
    $('#ot-search').focus();
  }

  function ownTimesShown() {
    const q = T.ot.query.trim().toLowerCase();
    return ownTimesStores(S.data.menus.find((x) => x.id === T.ot.menuId)).filter((s) => !q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
  }

  function renderOwnTimesStores() {
    if (!T.ot || !$('#ot-list')) return;
    const { sel } = T.ot;
    const list = ownTimesShown();
    const box = (on) => `<span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>`;
    const n = list.filter((s) => sel.has(s.id)).length;
    const allOn = n === list.length;
    $('#ot-list').innerHTML = list.length
      ? `<div class="ms-tree ot-tree">
          <button type="button" class="ms-row ms-all" role="checkbox" aria-checked="${allOn ? 'true' : n ? 'mixed' : 'false'}" data-action="ot-all" data-on="${allOn ? 0 : 1}"><span class="check${n ? ' is-on' : ''}" aria-hidden="true">${allOn ? icon('check', 12) : n ? icon('minus', 12) : ''}</span>Select all</button>
          <div class="ms-stores">${list
            .map((s) => `<button type="button" class="ms-row" role="checkbox" aria-checked="${sel.has(s.id)}" data-action="ot-store" data-id="${s.id}">${box(sel.has(s.id))}<span class="ms-name">${esc(s.name)}${ownTimesOf(s.id).map((t) => `<span class="ms-sub">${esc(scheduleSummary([t]))}</span>`).join('')}</span><span class="ms-city">${esc(s.city)}</span></button>`)
            .join('')}</div>
        </div>`
      : '<div class="empty-small"><strong>No stores match</strong><span>Check the spelling or search by city.</span></div>';
    $('#ot-foot').innerHTML = `<button type="button" class="btn secondary" data-modal-close>Close</button>
      <button type="button" class="btn primary" data-action="ot-reset"${sel.size ? '' : ' disabled'}>Reset to menu times</button>`;
  }

  function resetSelectedOwnTimes() {
    const { menuId, sel, query } = T.ot;
    const m = S.data.menus.find((x) => x.id === menuId);
    const ids = ownTimesStores(m).map((s) => s.id).filter((id) => sel.has(id));
    if (!ids.length) return;
    confirmOwnTimesReset(m, ids, () => openOwnTimesStores(m, sel, query));
  }

  function menuStoresTab(m) {
    const total = menuStores(m).length;
    const error = m.storeGroups.length ? '' : 'Add at least one store group';
    return section(
      'Store groups',
      `<p class="store-summary">${total ? `${plural(total, 'store', 'stores')} from ${plural(m.storeGroups.length, 'group', 'groups')}` : 'No stores yet'}</p>
      <div class="group-cards">${m.storeGroups.map((a, i) => storeGroupCard(m, a, i)).join('')}</div>
      ${field('', `<button type="button" class="btn secondary sm" data-action="menu-manage-stores">${icon('store', 14)}Manage stores</button>`, { error })}`,
      { desc: 'The menu goes live at these stores when you publish.' },
    );
  }

  function storeGroupCard(m, a, i) {
    const g = groupDef(a.id);
    const name = g ? g.name : a.id;
    return `<div class="group-card">
      <div class="group-card-head">
        <span class="group-card-title"><strong>${esc(name)}</strong><span class="muted tnum">${assignedStores(a).length} of ${plural(groupStores(a.id).length, 'store', 'stores')}</span></span>
        <button type="button" class="icon-btn sm" data-action="menu-group-remove" data-id="${a.id}" aria-label="Remove ${esc(name)}" title="Remove store group">${icon('x', 14)}</button>
      </div>
      ${emptyStoreGroupError(a) ? slotError(emptyStoreGroupError(a)) : ''}
      ${toggle(`m|${m.id}|storeGroups.${i}.newStores`, a.newStores, { label: 'Add new stores automatically', help: 'Stores added to this group later get the menu. Publish it at each new store to make it live.' })}
    </div>`;
  }

  function openManageStores(m) {
    const sel = {};
    C.menuStoreGroups.forEach((g) => {
      const a = m.storeGroups.find((x) => x.id === g.id);
      sel[g.id] = new Set(a ? assignedStores(a).map((s) => s.id) : []);
    });
    const shown = C.menuStoreGroups.filter((g) => groupStores(g.id).length);
    openModal({
      title: 'Manage stores',
      body: `<label class="search-field">${icon('search', 15)}<span class="sr-only">Search by store or city</span>
          <input id="ms-search" type="search" placeholder="Search by store or city" autocomplete="off"></label>
        <div id="ms-list"></div>`,
      foot: '<div id="ms-warn"></div><div class="modal-foot" id="ms-foot"></div>',
    });
    T.ms = { menuId: m.id, sel, open: new Set(shown.length === 1 ? [shown[0].id] : []), query: '', onlySelected: false };
    renderManageStores();
    $('#ms-search').focus();
  }

  function msGroupStores(gid) {
    const all = groupStores(gid);
    if (!T.ms.vis) return all;
    const on = new Set(visStores(T.ms.vis).map((s) => s.id));
    return all.filter((s) => on.has(s.id));
  }

  function manageStoresGroups() {
    const o = T.ms;
    const q = o.query.trim().toLowerCase();
    return C.menuStoreGroups
      .map((g) => {
        let list = msGroupStores(g.id);
        if (o.onlySelected) list = list.filter((s) => (o.vis ? !o.sel[g.id].has(s.id) : o.sel[g.id].has(s.id)));
        if (q && !g.name.toLowerCase().includes(q)) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
        return { g, list };
      })
      .filter((x) => x.list.length);
  }

  function manageStoresRemoved(o) {
    const m = S.data.menus.find((x) => x.id === o.menuId);
    const on = new Set(Object.values(o.sel).flatMap((set) => [...set]));
    return m.publishedStoreIds.filter((id) => !on.has(id));
  }

  function renderManageStores() {
    if (!T.ms || !$('#ms-list')) return;
    const o = T.ms;
    const q = o.query.trim();
    const groups = manageStoresGroups();
    const state = (gid, list) => {
      const n = list.filter((s) => o.sel[gid].has(s.id)).length;
      return n === 0 ? 'off' : n === list.length ? 'on' : 'mixed';
    };
    const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
    const checked = (st) => (st === 'mixed' ? 'mixed' : String(st === 'on'));
    const states = groups.map(({ g, list }) => state(g.id, list));
    const allSt = states.every((st) => st === 'on') ? 'on' : states.every((st) => st === 'off') ? 'off' : 'mixed';
    const storeRow = (g, s) => {
      const on = o.sel[g.id].has(s.id);
      return `<button type="button" class="ms-row ms-store" role="checkbox" aria-checked="${on}" data-action="ms-store" data-group="${g.id}" data-id="${s.id}">${box(on ? 'on' : 'off')}<span class="ms-name">${esc(s.name)}</span><span class="ms-city">${esc(s.city)}</span></button>`;
    };
    $('#ms-list').innerHTML = groups.length
      ? `<div class="ms-tree">
          <button type="button" class="ms-row ms-all" role="checkbox" aria-checked="${checked(allSt)}" data-action="ms-all" data-on="${allSt === 'on' ? 0 : 1}">${box(allSt)}Select all</button>
          ${groups
            .map(({ g, list }, i) => {
              const st = states[i];
              const open = !!q || o.open.has(g.id);
              return `<div class="ms-group">
                <div class="ms-group-head">
                  <button type="button" class="icon-btn sm ms-chev" data-action="ms-open" data-id="${g.id}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(g.name)}">${icon('chevRight', 14)}</button>
                  <button type="button" class="ms-row" role="checkbox" aria-checked="${checked(st)}" data-action="ms-group" data-id="${g.id}" data-on="${st === 'on' ? 0 : 1}">${box(st)}<strong class="ms-name">${esc(g.name)}</strong><span class="ms-city tnum">${o.sel[g.id].size} of ${msGroupStores(g.id).length}</span></button>
                </div>
                ${open ? `<div class="ms-stores">${list.map((s) => storeRow(g, s)).join('')}</div>` : ''}
              </div>`;
            })
            .join('')}
        </div>`
      : q
        ? '<div class="empty-small"><strong>No stores match</strong><span>Check the spelling or search by city.</span></div>'
        : `<div class="empty-small"><strong>${o.vis ? 'No stores hidden' : 'No stores selected'}</strong></div>`;
    if (o.vis) {
      const published = visPublishedIds(o.vis);
      const live = visibilityChange(o).hide.filter((id) => published.has(id));
      $('#ms-warn').innerHTML = live.length ? callout('warning', `Customers at ${plural(live.length, 'store', 'stores')} you unticked stop seeing the ${o.vis.kind} right away.`) : '';
    } else {
      const removed = manageStoresRemoved(o);
      $('#ms-warn').innerHTML = removed.length
        ? callout('warning', `The menu is published at ${plural(removed.length, 'store', 'stores')} you unticked. Saving removes it from them right away.`)
        : '';
    }
    $('#ms-foot').innerHTML = `<button type="button" class="check-toggle ms-only" role="checkbox" aria-checked="${o.onlySelected}" data-action="ms-only">${box(o.onlySelected ? 'on' : 'off')}${o.vis ? 'Show only hidden' : 'Show only selected'}</button>
      <button type="button" class="btn secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn primary" data-action="ms-save">Save</button>`;
  }

  function setManageStores(gid, ids, on) {
    const set = T.ms.sel[gid];
    ids.forEach((id) => (on ? set.add(id) : set.delete(id)));
    renderManageStores();
  }

  function saveManageStores() {
    const o = T.ms;
    if (o.vis) return saveVisibilityStores(o);
    const m = S.data.menus.find((x) => x.id === o.menuId);
    const removed = manageStoresRemoved(o);
    const pick = (gid, newStores) => {
      const all = groupStores(gid);
      const set = o.sel[gid];
      return { id: gid, storeIds: set.size === all.length ? null : all.filter((s) => set.has(s.id)).map((s) => s.id), newStores };
    };
    const next = [
      ...m.storeGroups.filter((a) => o.sel[a.id] && o.sel[a.id].size).map((a) => pick(a.id, a.newStores)),
      ...C.menuStoreGroups.filter((g) => o.sel[g.id].size && !m.storeGroups.some((a) => a.id === g.id)).map((g) => pick(g.id, true)),
    ];
    closeModal();
    if (JSON.stringify(next) === JSON.stringify(m.storeGroups)) return;
    const ok = commit(() => {
      m.storeGroups = next;
      dropRemovedStores(m);
    });
    if (!ok) return;
    const msg = removed.length ? `Menu removed from ${removed.length === 1 ? storeById.get(removed[0]).name : plural(removed.length, 'store', 'stores')}` : 'Stores successfully updated';
    toast(msg, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  const menusWithCategory = (catId) => S.data.menus.filter((m) => m.children.includes(catId));
  const isCateringMenu = (m) => m.orderTypes.some((o) => o.startsWith('catering'));

  function categoryStores(cat) {
    const ids = new Set(menusWithCategory(cat.id).flatMap((m) => menuStores(m).map((s) => s.id)));
    return STORES.filter((s) => ids.has(s.id));
  }
  const isHiddenAt = (cat, sid) => (cat.stores || {})[sid] === 'disabled';
  const hiddenCategoryStores = (cat) => (Object.keys(cat.stores || {}).length ? categoryStores(cat).filter((s) => isHiddenAt(cat, s.id)) : []);
  const categoryPublishedIds = (catId) => new Set(menusWithCategory(catId).flatMap((m) => m.publishedStoreIds));
  const CAT_HIDDEN_ROWS = 10;

  function categoryStoresTab(cat) {
    const all = categoryStores(cat);
    if (!all.length) {
      return section('', '<p class="store-summary">No stores yet</p><p class="field-help">Add stores to its menu on the menu’s Stores tab.</p>');
    }
    const hidden = hiddenCategoryStores(cat);
    const summary = `Shown at ${all.length - hidden.length} of ${plural(all.length, 'store', 'stores')}${hidden.length ? ` · Hidden at ${plural(hidden.length, 'store', 'stores')}` : ''}`;
    const row = (s) => `<div class="store-row list-row"><span class="store-name list-name"><span>${esc(s.name)}</span><span class="muted">${esc(s.city)}</span></span>
      <button type="button" class="switch" role="switch" aria-checked="false" aria-label="Show at ${esc(s.name)}" data-action="cat-store-show" data-id="${s.id}"><span class="switch-thumb"></span></button></div>`;
    return section(
      '',
      `<p class="store-summary tnum">${esc(summary)}</p>
      ${
        hidden.length
          ? `<div class="store-list">${hidden.slice(0, CAT_HIDDEN_ROWS).map(row).join('')}</div>
            ${hidden.length > CAT_HIDDEN_ROWS ? `<p class="field-help">Showing ${CAT_HIDDEN_ROWS} of ${hidden.length} hidden stores. See them all in Manage stores.</p>` : ''}
            <p class="field-help">Customers at these stores do not see the category or its products. Applies in every menu.</p>`
          : '<p class="field-help">Hide it at stores that do not offer it. Applies in every menu.</p>'
      }
      ${field('', `<button type="button" class="btn secondary sm" data-action="cat-manage-stores">${icon('store', 14)}Manage stores</button>`)}`,
    );
  }

  const visStores = (vis) => (vis.kind === 'category' ? categoryStores : productStores)(entity(vis.kind, vis.id));
  const visHiddenAt = (vis, sid) => (vis.kind === 'category' ? isHiddenAt : productHiddenAt)(entity(vis.kind, vis.id), sid);
  const visPublishedIds = (vis) => (vis.kind === 'category' ? categoryPublishedIds(vis.id) : productPublishedIds(entity('product', vis.id)));

  function openVisibilityStores(kind, ent) {
    const vis = { kind, id: ent.id };
    const all = visStores(vis);
    const sel = {};
    C.menuStoreGroups.forEach((g) => (sel[g.id] = new Set()));
    all.forEach((s) => {
      if (visHiddenAt(vis, s.id)) return;
      const g = C.menuStoreGroups.find((x) => groupStores(x.id).includes(s));
      if (g) sel[g.id].add(s.id);
    });
    const shown = C.menuStoreGroups.filter((g) => groupStores(g.id).some((s) => all.includes(s)));
    openModal({
      title: 'Manage stores',
      body: `<p>Customers see ${esc(nameOf(kind, ent))} at the stores you tick.</p>
        <label class="search-field">${icon('search', 15)}<span class="sr-only">Search by store or city</span>
          <input id="ms-search" type="search" placeholder="Search by store or city" autocomplete="off"></label>
        <div id="ms-list"></div>`,
      foot: '<div id="ms-warn"></div><div class="modal-foot" id="ms-foot"></div>',
    });
    T.ms = { vis, sel, open: new Set(shown.length === 1 ? [shown[0].id] : []), query: '', onlySelected: false };
    renderManageStores();
    $('#ms-search').focus();
  }

  function visibilityChange(o) {
    const on = new Set(Object.values(o.sel).flatMap((set) => [...set]));
    const all = visStores(o.vis);
    return {
      hide: all.filter((s) => !on.has(s.id) && !visHiddenAt(o.vis, s.id)).map((s) => s.id),
      show: all.filter((s) => on.has(s.id) && visHiddenAt(o.vis, s.id)).map((s) => s.id),
    };
  }

  const storesWho = (ids) => (ids.length === 1 ? storeById.get(ids[0]).name : plural(ids.length, 'store', 'stores'));

  function setStoreVisibility(kind, ent, { hide = [], show = [] }) {
    if (!hide.length && !show.length) return;
    const ok = commit(() => {
      if (!ent.stores) ent.stores = {};
      if (kind === 'category') {
        hide.forEach((id) => (ent.stores[id] = 'disabled'));
        show.forEach((id) => delete ent.stores[id]);
        return;
      }
      hide.forEach((id) => (ent.stores[id] = { ...(ent.stores[id] || {}), hidden: true }));
      show.forEach((id) => {
        const { hidden, ...rest } = ent.stores[id] || {};
        if (rest.stock) ent.stores[id] = rest;
        else delete ent.stores[id];
      });
    });
    if (!ok) return;
    const label = kind === 'category' ? 'Category' : 'Product';
    const msg = hide.length && show.length ? 'Stores successfully updated' : hide.length ? `${label} hidden at ${storesWho(hide)}` : `${label} shown at ${storesWho(show)}`;
    toast(msg, 'success', { action: { label: 'Undo', onClick: undo } });
  }

  function saveVisibilityStores(o) {
    const change = visibilityChange(o);
    closeModal();
    setStoreVisibility(o.vis.kind, entity(o.vis.kind, o.vis.id), change);
  }

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
    const matches = (m) => !q || [nameOf('menu', m), m.internalName || ''].some((s) => s.toLowerCase().includes(q));
    const list = (onlySelected ? selected : [...selected, ...all.filter((m) => !inMenus.has(m.id))]).filter(matches);
    const row = (m) => {
      const on = inMenus.has(m.id);
      const hint = m.id === menu.id ? 'This menu' : plural(m.children.length, 'category', 'categories');
      const name = m.internalName
        ? `<span class="store-name list-name"><span>${esc(nameOf('menu', m))}</span><span class="muted">${esc(m.internalName)}</span></span>`
        : `<span class="store-name">${esc(nameOf('menu', m))}</span>`;
      return `<button type="button" class="store-row store-check" data-action="cat-menu-toggle" data-id="${m.id}" aria-pressed="${on}">
        <span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>
        ${name}<span class="muted">${esc(hint)}</span></button>`;
    };
    return section(
      'Menus',
      `${
        big
          ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search menus</span><input id="cat-menu-q" type="search" data-cat-menu-search data-focus-key="cat-menu-q" placeholder="Search by name or internal name" value="${esc(T.menuQuery)}" autocomplete="off"></label>
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
        placementSection(path) +
        sizeHintSection(cat, path) +
        section(
          '',
          nameBlock('category', cat, { error: lengthError(cat.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
            field('Internal name', inputText(cb('internalName'), cat.internalName, { id: 'c-int' }), {
              id: 'c-int',
              error: lengthError(cat.internalName),
              help: 'Use it to tell apart categories with the same name. Only your team sees it.',
            }) +
            descriptionField(cb('description'), cat.description, 'c-desc', 'Shown under the category name in Web App, and sent to delivery partners.') +
            imageField(cb('image'), cat.image, { help: 'Shown on Kiosk, and in apps built with the Ordering API.', posSrc: posItemImage(cat) }) +
            imageField(cb('bannerImage'), cat.bannerImage, { label: 'Header image', size: '2114 × 288', wide: true, help: 'Shown across the top of the category in Web App, on desktop and tablet.' }),
        )
      );
    }
    if (tab === 'availability') return categoryProductsSection(cat, path, menu) + categoryMenusSection(cat, menu);
    if (tab === 'stores') return categoryStoresTab(cat);
    const inMenus = menusWithCategory(cat.id);
    const publishing = inMenus.some((m) => m.status === 'publishing');
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
        toggle(cb('isBundle'), cat.isBundle, { label: 'Catering bundles', help: 'Only for catering orders in Web App. Option quantities scale to the number of guests, and prices are hidden.' }) +
          (cat.isBundle && !isCateringMenu(menu) ? callout('info', `${esc(menu.name)} has no catering order types, so this has no effect there.`) : ''),
      ) +
      removeSection(path, 'category', cat) +
      section(
        '',
        `<button type="button" class="btn secondary tone-danger" data-action="cat-delete" data-id="${cat.id}" ${publishing ? 'disabled' : ''}>${icon('trash', 15)}Delete category</button>
        <p class="field-help">${publishing ? 'You can delete the category once publishing finishes.' : `Removes it from ${inMenus.length > 1 ? `all ${inMenus.length} menus` : esc(menu.name)}. Its products are not deleted${cat.source === 'pos' ? ', and nothing changes on POS' : ''}.`}</p>`,
      )
    );
  }
