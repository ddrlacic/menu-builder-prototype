'use strict';

  /* ---------- inspector ---------- */

  const scopePill = (where) => `<span class="scope" title="Applies only to ${esc(where)}">Only here</span>`;
  const lockPill = (text = 'From POS') => `<span class="scope scope-pos" title="Set on POS. Change it on POS, then sync">${icon('lock', 11)}${esc(text)}</span>`;

  function positionField(path) {
    const info = parsePath(path);
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const index = parent.children.indexOf(info.id);
    const count = parent.children.length;
    if (index < 0 || count < 2) return '';
    const name = esc(nameOf(pInfo.kind, parent));
    const where = {
      menu: `Order customers see in ${name}.`,
      category: `Same order in every menu with ${name}.`,
      group: `Same order in every product that uses ${name}.`,
      product: `Same order everywhere ${name} is used.`,
    }[pInfo.kind];
    const noun = { category: 'products', group: 'options', product: info.kind === 'group' ? 'groups' : 'choices' }[pInfo.kind];
    const anyHidden = noun && parent.children.some((id) => id !== info.id && placement(childPath(info.parentPath, info.kind, id)).hidden);
    const btn = (delta, ic, label) =>
      `<button type="button" class="icon-btn sm" data-action="pos-move" data-path="${esc(path)}" data-delta="${delta}" data-focus-key="pos-move|${delta}|${esc(path)}" aria-label="${label}" title="${label}" ${index + delta < 0 || index + delta >= count ? 'disabled' : ''}>${icon(ic, 14)}</button>`;
    return field(
      'Position',
      `<div class="position-control">
        <input type="number" id="pos-input" class="input tnum" inputmode="numeric" min="1" max="${count}" step="1" value="${index + 1}" data-pos-set data-path="${esc(path)}" data-focus-key="pos-input|${esc(path)}">
        <span class="muted tnum">of ${count}</span>${btn(-1, 'chevUp', 'Move up')}${btn(1, 'chevDown', 'Move down')}
      </div>`,
      { id: 'pos-input', scope: pInfo.kind === 'menu' ? crumbText(path) : '', help: where + (anyHidden ? ` Hidden ${noun} keep their place.` : '') },
    );
  }

  function field(label, control, { help = '', scope = '', id = '', error = '', pos = false } = {}) {
    return `<div class="field${error ? ' has-error' : ''}">
      ${label || scope || pos ? `<div class="field-head">${label ? `<label class="field-label"${id ? ` for="${id}"` : ''}>${esc(label)}</label>` : ''}${scope ? scopePill(scope) : ''}${pos ? lockPill() : ''}</div>` : ''}
      ${control}
      ${error ? `<p class="field-error">${icon('alertCircle', 13)}${esc(error)}</p>` : help ? `<p class="field-help">${help}</p>` : ''}
    </div>`;
  }

  function inputText(bind, value, { id = '', multiline = false, mono = false, rows = 3, placeholder = '', list = '', label = '' } = {}) {
    const attrs = `${id ? `id="${id}" ` : ''}class="input${mono ? ' mono' : ''}" data-bind="${esc(bind)}" data-type="text" data-focus-key="${esc(bind)}" spellcheck="${mono ? 'false' : 'true'}" autocomplete="off"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}${list ? ` list="${esc(list)}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}`;
    return multiline ? `<textarea ${attrs} rows="${rows}">${esc(value || '')}</textarea>` : `<input type="text" ${attrs} value="${esc(value || '')}">`;
  }

  function inputNum(bind, value, { id = '', prefix = '', suffix = '', int = false, min = 0, max = null, placeholder = '', disabled = false, label = '' } = {}) {
    return `<div class="input-affix${disabled ? ' is-disabled' : ''}">
      ${prefix ? `<span class="affix">${prefix}</span>` : ''}
      <input type="number" ${id ? `id="${id}"` : ''} class="input tnum" inputmode="${int ? 'numeric' : 'decimal'}" data-bind="${esc(bind)}" data-type="${int ? 'int' : 'num'}" data-focus-key="${esc(bind)}" step="${int ? 1 : 0.01}" min="${min}"${max != null ? ` max="${max}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''} value="${isNum(value) ? value : ''}" placeholder="${esc(placeholder)}" ${disabled ? 'disabled' : ''}>
      ${suffix ? `<span class="affix">${suffix}</span>` : ''}
    </div>`;
  }

  function toggle(bind, on, { label, help = '', scope = '', disabled = false, action = '' } = {}) {
    const trigger = action ? `data-action="${esc(action)}"` : `data-toggle="${esc(bind)}"`;
    return `<div class="toggle-row${disabled ? ' is-disabled' : ''}">
      <div class="toggle-text">
        <span class="toggle-label">${esc(label)}${scope ? scopePill(scope) : ''}</span>
        ${help ? `<span class="field-help">${help}</span>` : ''}
      </div>
      <button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${trigger} data-focus-key="${esc(bind)}" ${disabled ? 'disabled' : ''}><span class="switch-thumb"></span></button>
    </div>`;
  }

  function segmented(bind, value, options) {
    return `<div class="segmented" role="radiogroup">${options
      .map(
        ([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" class="seg" data-set="${esc(bind)}" data-value="${esc(v)}" data-focus-key="${esc(bind)}=${esc(v)}">${esc(l)}</button>`,
      )
      .join('')}</div>`;
  }

  function chips(bind, values, options, { invert = false, vtype = 'text' } = {}) {
    const arr = values || [];
    return `<div class="chips">${options
      .map(([v, l]) => {
        const on = invert ? !arr.includes(v) : arr.includes(v);
        return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-chip="${esc(bind)}" data-value="${esc(v)}" data-vtype="${vtype}" data-focus-key="${esc(bind)}~${esc(v)}">${on ? icon('check', 12) : ''}${esc(l)}</button>`;
      })
      .join('')}</div>`;
  }

  function selectInput(bind, value, options, { id = '', label = '', disabled = false } = {}) {
    return `<div class="select-wrap"><select ${id ? `id="${id}"` : ''} ${label ? `aria-label="${esc(label)}"` : ''} name="${esc(bind)}" class="input" data-bind="${esc(bind)}" data-type="text" data-focus-key="${esc(bind)}"${disabled ? ' disabled' : ''}>${options
      .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`)
      .join('')}</select>${icon('chevDown', 14)}</div>`;
  }

  function stepper(bind, value, { min = 0, max = 99, label = 'quantity', disabled = false, keepZero = false, start = null } = {}) {
    const v = value || 0;
    const extra = `${keepZero ? ' data-keep-zero="1"' : ''}${start != null ? ` data-start="${start}"` : ''}`;
    return `<div class="stepper${disabled ? ' is-disabled' : ''}">
      <button type="button" class="icon-btn sm" data-action="step" data-bind="${esc(bind)}" data-delta="-1" data-min="${min}" data-max="${max}"${extra} aria-label="Decrease ${label}" ${disabled || v <= min ? 'disabled' : ''}>${icon('minus', 14)}</button>
      <span class="stepper-value tnum">${v}</span>
      <button type="button" class="icon-btn sm" data-action="step" data-bind="${esc(bind)}" data-delta="1" data-min="${min}" data-max="${max}"${extra} aria-label="Increase ${label}" ${disabled || v >= max ? 'disabled' : ''}>${icon('plus', 14)}</button>
    </div>`;
  }

  function range(bindFrom, vFrom, bindTo, vTo, suffix, idFrom, { min = 0 } = {}) {
    return `<div class="range">${inputNum(bindFrom, vFrom, { int: true, id: idFrom, min })}<span class="range-sep">–</span>${inputNum(bindTo, vTo, { int: true, suffix, min, label: 'Up to' })}</div>`;
  }

  const section = (title, body, { desc = '' } = {}) =>
    `<section class="insp-section">${title ? `<h3 class="section-title">${esc(title)}</h3>` : ''}${desc ? `<p class="section-desc">${desc}</p>` : ''}<div class="section-body">${body}</div></section>`;

  const callout = (tone, html, ic) =>
    `<div class="callout tone-${tone}">${icon(ic || (tone === 'error' ? 'alertCircle' : tone === 'warning' ? 'alert' : 'info'), 16)}<div>${html}</div></div>`;

  function imageField(bind, value, { label = 'Image', size = '1200 × 800', help = '', wide = false, posSrc = null } = {}) {
    const posRow =
      posSrc && posSrc !== value
        ? `<div class="pos-image"><button type="button" class="image-open" data-action="image-view" data-src="${esc(posSrc)}" aria-label="Open POS image in new tab" title="Open POS image in new tab"><img class="pos-image-thumb" src="${esc(posSrc)}" alt=""></button>
            <span class="field-help">${value ? 'POS has a different image.' : 'POS has an image.'}</span>
            <button type="button" class="btn secondary sm" data-action="image-use-pos" data-bind="${esc(bind)}" data-src="${esc(posSrc)}">Use POS image</button></div>`
        : '';
    return field(
      label,
      (value
        ? `<div class="image-field${wide ? ' is-wide' : ''}"><button type="button" class="image-open" data-action="image-view" data-bind="${esc(bind)}" aria-label="Open image in new tab" title="Open image in new tab"><img class="image-preview" src="${value}" alt=""></button>
            <div class="image-actions">
              <label class="btn secondary sm">Replace image<input type="file" accept="${IMAGE_TYPES.join(',')}" data-image="${esc(bind)}" hidden></label>
              <button type="button" class="btn ghost sm tone-danger" data-action="image-remove" data-bind="${esc(bind)}">Remove image</button>
            </div></div>`
        : `<label class="dropzone" data-image-drop="${esc(bind)}">${icon('image', 20)}
            <span>Drop an image here or <span class="link">choose a file</span></span>
            <span class="field-help">JPG, PNG, or GIF up to 1 MB. Best at ${size} px.</span>
            <input type="file" accept="${IMAGE_TYPES.join(',')}" data-image="${esc(bind)}" hidden></label>`) +
        (help ? `<p class="field-help">${help}</p>` : '') +
        posRow,
    );
  }

  function descriptionField(bind, value, id, note = '') {
    const len = (value || '').length;
    return field('Description', inputText(bind, value, { id, multiline: true, rows: 4 }), {
      id,
      help: `${note ? `${esc(note)} ` : ''}<span class="tnum help-count">${len} / ${DESC_LIMIT}</span>`,
      error: len > DESC_LIMIT ? `Use ${DESC_LIMIT} characters or fewer` : '',
    });
  }

  function scheduleEditor(base, slots) {
    return `<div class="slots">
      ${slots
        .map(
          (s, i) => `<div class="slot">
          <div class="slot-days" role="group" aria-label="Days">${DAYS.map(
            (d, di) => `<button type="button" class="day${s.days.includes(di) ? ' is-on' : ''}" aria-pressed="${s.days.includes(di)}" data-chip="${esc(base)}.${i}.days" data-value="${di}" data-vtype="int" data-focus-key="${esc(base)}.${i}.days~${di}">${d}</button>`,
          ).join('')}</div>
          <div class="slot-times">
            <input type="time" class="input tnum" aria-label="Start time" data-bind="${esc(base)}.${i}.from" data-type="text" data-focus-key="${esc(base)}.${i}.from" value="${esc(s.from)}">
            <span class="range-sep">–</span>
            <input type="time" class="input tnum" aria-label="End time" data-bind="${esc(base)}.${i}.to" data-type="text" data-focus-key="${esc(base)}.${i}.to" value="${esc(s.to)}">
            <button type="button" class="icon-btn sm" data-action="sched-remove" data-bind="${esc(base)}" data-index="${i}" aria-label="Remove time slot" title="Remove time slot">${icon('x', 14)}</button>
          </div>
          ${s.days.length ? '' : '<p class="field-help">Choose the days for this time slot.</p>'}
        </div>`,
        )
        .join('')}
      <button type="button" class="btn ghost sm" data-action="sched-add" data-bind="${esc(base)}">${icon('plus', 14)}Add time slot</button>
    </div>
    <p class="field-help">${esc(scheduleSummary(slots))}</p>`;
  }

  const STORE_RESULTS = 6;

  function matchStores(stores = STORES) {
    const q = T.storeQuery.trim().toLowerCase();
    if (!q) return [];
    return stores.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q));
  }

  function storeSearch(id, placeholder) {
    return `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">${esc(placeholder)}</span>
      <input id="${id}" type="search" data-store-search data-focus-key="${id}" placeholder="${esc(placeholder)}" value="${esc(T.storeQuery)}" autocomplete="off"></label>`;
  }

  function storeResults(results, rowFn, listClass = 'store-list') {
    if (!T.storeQuery.trim()) return '';
    if (!results.length) return '<p class="field-help">No stores match. Check the spelling.</p>';
    return `<div class="${listClass}">${results.slice(0, STORE_RESULTS).map(rowFn).join('')}</div>${
      results.length > STORE_RESULTS ? `<p class="field-help">Showing ${STORE_RESULTS} of ${results.length} stores. Keep typing to narrow it down.</p>` : ''
    }`;
  }

  function storesList(kind, ent, states, { activeLabel = 'Active', wide = false } = {}) {
    const bind = (sid) => `e|${kind}|${ent.id}|stores.${sid}`;
    const exceptions = Object.entries(ent.stores || {})
      .filter(([, v]) => v !== 'active')
      .map(([id, v]) => ({ store: storeById.get(id), v }))
      .filter((x) => x.store);
    const counts = {};
    exceptions.forEach((x) => (counts[x.v] = (counts[x.v] || 0) + 1));
    const summary = [
      `${activeLabel} at ${STORES.length - exceptions.length} of ${STORES.length} stores`,
      ...Object.entries(counts).map(([v, n]) => `${(states.find((s) => s[0] === v) || [v, v])[1]} at ${plural(n, 'store', 'stores')}`),
    ].join(' · ');
    const row = (s) =>
      `<div class="store-row"><span class="store-name">${icon('store', 15)}${esc(s.name)}</span>${selectInput(bind(s.id), (ent.stores || {})[s.id] || 'active', states, { label: `Status at ${s.name}` })}</div>`;
    const list = wide ? 'store-list is-wide' : 'store-list';
    return `<p class="store-summary">${esc(summary)}</p>
      ${exceptions.length ? `<div class="${list}">${exceptions.map((x) => row(x.store)).join('')}</div>` : ''}
      ${field('Change status at a store', storeSearch('store-status-q', `Search ${STORES.length} stores`))}
      ${storeResults(matchStores(), row, list)}`;
  }

  function nameBlock(kind, ent, { error = '', help = '' } = {}) {
    const bind = `e|${kind}|${ent.id}|name`;
    if (ent.source !== 'pos') return field('Name', inputText(bind, ent.name, { id: 'insp-name' }), { id: 'insp-name', error, help });
    const pos = posItem(ent);
    const posName = pos ? pos.name : ent.reviewed ? ent.reviewed.name : '';
    return field('Name', inputText(bind, ent.name, { id: 'insp-name' }), {
      id: 'insp-name',
      error,
      help: `${help ? `${help} ` : ''}${ent.name === posName ? 'Same as the POS name.' : `POS name: ${esc(posName)}. POS keeps its own name.`}`,
    });
  }

  function posKv(rows) {
    return `<dl class="kv">${rows.map(([k, v, mono]) => `<dt>${esc(k)}</dt><dd${mono ? ' class="mono"' : ''}>${v}</dd>`).join('')}</dl>`;
  }

  const posIdRow = (id) => [
    'POS ID',
    `<span class="kv-copy">${esc(id)}<button type="button" class="icon-btn sm" data-action="copy-text" data-value="${esc(id)}" data-label="POS ID" aria-label="Copy POS ID" title="Copy POS ID">${icon('copy', 13)}</button></span>`,
    true,
  ];

  function sourceSection(kind, ent, path) {
    if (ent.source === 'pos') {
      const pos = posItem(ent);
      const rows = [posIdRow(ent.externalId), ['POS name', esc(pos ? pos.name : ent.reviewed.name)]];
      if (kind === 'product' && ent.originCategoryExt) rows.push(['POS category', esc(posLabel(ent.originCategoryExt))]);
      return section(
        'POS',
        `${isMissingOnPos(ent) ? callout('warning', 'Deleted on POS. Customers cannot order it. Remove it from the menu, or add it back on POS.') : ''}
        ${removedFromPos(path) ? callout('warning', 'Still on POS, but no longer under the same parent there. Remove it here, or check POS.') : ''}
        ${posKv(rows)}`,
      );
    }
    if (kind === 'category')
      return section(
        'Menu-only category',
        callout('info', 'Arranges products your own way. It exists only in your menus, not on POS. Each product inside keeps the price of its own POS category.', 'dashed'),
      );
    if (kind === 'product' && ent.ptype === 'linked')
      return section(
        'Custom version',
        `${callout('info', `Rings up on POS as <strong>${esc(ent.posParentExt ? posLabel(ent.posParentExt) : 'the POS product you choose')}</strong>, at its POS price. Name, image, and preselected options are only for customers.`, 'link')}
        ${ent.posParentExt ? posKv([['Rings up as', esc(posLabel(ent.posParentExt))], ['POS ID', esc(ent.posParentExt), true]]) : ''}`,
      );
    if (kind === 'product' && ent.ptype === 'container')
      return section(
        'Option folder',
        callout('info', 'An option that opens more choices. It is never sent to POS. The choices customers make inside go to POS with the product above it.', 'dashed') +
          `<p class="field-help">Not available on option folders: price, POS ID, allergens, modifier codes, included ingredients, substitutes, half and whole, upsell, and cross-sell. Option folders go only in product groups, not in categories.</p>`,
      );
    if (kind === 'product' && ent.ptype === 'size')
      return section(
        'Choice product',
        callout('info', 'Customers tap it and pick one product, like Small or Large. It is never sent to POS. The product they pick is sent instead, at its POS price.', 'package'),
      );
    if (kind === 'group' && ent.gtype === 'linked')
      return section(
        'Custom version',
        `${callout('info', `Shows only some options from <strong>${esc(posLabel(ent.posGroupExt))}</strong>. Choices ring up on POS in that group, at its POS prices.`, 'link')}
        ${posKv([['POS group', esc(posLabel(ent.posGroupExt))], ['POS ID', esc(ent.posGroupExt), true]])}`,
      );
    if (kind === 'group')
      return section(
        'Add-on group',
        callout('info', 'Suggests extra products. Each one customers pick is added to the order as its own item, at its own POS price.', 'dashed'),
      );
    return '';
  }

  const removeSection = (path, kind, ent) => {
    const pInfo = parsePath(parsePath(path).parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    return section(
      '',
      `<button type="button" class="btn secondary tone-danger" data-action="remove" data-path="${esc(path)}">${icon('trash', 15)}Remove from ${esc(parentName)}</button>
       <p class="field-help">${isVirtual(ent) ? 'Nothing changes on POS.' : `The ${KIND_LABEL[kind].toLowerCase()} stays on POS. You can add it back from POS items.`}</p>`,
    );
  };

  function tabsFor(kind, ent) {
    if (kind === 'menu') return [['general', 'General'], ['ordering', 'Ordering'], ['availability', 'Availability'], ['stores', 'Stores'], ['advanced', 'Advanced']];
    if (kind === 'category') return [['general', 'General'], ['availability', 'Availability'], ['stores', 'Stores'], ['advanced', 'Advanced']];
    if (kind === 'group') {
      const tabs = [['general', 'General'], ['options', 'Options']];
      if (!ent.isSubstitutionContainer) tabs.push(['substitutes', 'Substitutes']);
      if (halvesSupported(ent)) tabs.push(['halves', 'Half and whole']);
      return [...tabs, ['advanced', 'Advanced']];
    }
    const tabs = [['general', 'General'], ['dietary', 'Dietary'], ['ordering', 'Ordering'], ['availability', 'Availability'], ['advanced', 'Advanced']];
    if (ent.ptype === 'size') tabs.splice(1, 0, ['choices', 'Choices']);
    return tabs;
  }

  function renderInspector() {
    const path = S.ui.selected;
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const kind = info.kind;
    const tabs = tabsFor(kind, ent);
    const tab = tabs.some((t) => t[0] === S.ui.tabs[kind]) ? S.ui.tabs[kind] : tabs[0][0];
    const uses = kind === 'menu' ? [] : ctx.usage.get(`${kind}:${info.id}`) || [];
    const issues = ctx.issues.byPath.get(path) || [];
    const chipKind = kind === 'menu' ? 'menu' : isVirtual(ent) && ent.ptype !== 'linked' ? 'virtual' : kind;

    const headPosId = kind === 'menu' ? ent.posExt : posIdOf(kind, ent);
    const kicker = [
      `<span class="kind-chip kind-${chipKind}">${esc(kindLabel(kind, ent))}</span>`,
      headPosId
        ? `<button type="button" class="src-chip src-id" data-action="copy-text" data-value="${esc(headPosId)}" data-label="POS ID" aria-label="Copy POS ID ${esc(headPosId)}" title="Copy POS ID ${esc(headPosId)}">${icon('link', 12)}<span class="mono">${esc(headPosId)}</span>${icon('copy', 12)}</button>`
        : '',
      !['menu', 'category'].includes(kind) && isVirtual(ent) && !isCustomVersion(ent) ? '<span class="src-chip">Menu only</span>' : '',
    ].join('');

    const crumbHtml =
      kind === 'menu'
        ? ''
        : `<nav class="crumbs" aria-label="Location">${crumbs(info.parentPath)
            .map((c) => `<button type="button" class="crumb" data-action="goto" data-path="${esc(c.path)}">${esc(c.name)}</button>`)
            .join('<span class="crumb-sep">›</span>')}</nav>`;

    const canPreview = kind === 'product' && ent.ptype !== 'container';
    $('#inspector-head').innerHTML = `
      <div class="insp-head">
        ${thumb(kind, ent, 'thumb-lg')}
        <div class="insp-titles">
          <div class="insp-kicker">${kicker}</div>
          <h2 class="insp-title" title="${esc(nameOf(kind, ent))}">${esc(nameOf(kind, ent))}</h2>
          ${ent.internalName ? `<p class="insp-alt" title="Internal name: ${esc(ent.internalName)}">${esc(ent.internalName)}</p>` : ''}
          ${crumbHtml}
        </div>
        ${canPreview ? `<button type="button" class="btn secondary sm" data-action="preview" data-path="${esc(path)}">${icon('phone', 14)}Preview</button>` : ''}
      </div>
      ${kind !== 'menu' && typeHelp(kind, ent) ? `<p class="insp-type-help">${esc(typeHelp(kind, ent))}</p>` : ''}
      ${
        uses.length > 1
          ? `<details class="shared">
              <summary>${icon('copy', 14)}<span><strong>Used in ${uses.length} places.</strong> Edits apply everywhere, except settings marked ${scopePill('this placement')}</span>${icon('chevDown', 14)}</summary>
              <ul>${uses
                .map((u) => `<li><button type="button" class="crumb-link${u === path ? ' is-current' : ''}" data-action="goto" data-path="${esc(u)}">${esc(crumbText(u))}</button></li>`)
                .join('')}</ul>
            </details>`
          : ''
      }
      ${issues.length ? `<div class="insp-issues">${issues.map((i) => callout(i.level, esc(i.text))).join('')}</div>` : ''}`;

    $('#inspector-tabs').innerHTML = `<div class="tabs" role="tablist">${tabs
      .map(([id, label]) => `<button type="button" role="tab" class="tab" aria-selected="${id === tab}" data-action="tab" data-kind="${kind}" data-tab="${id}">${label}</button>`)
      .join('')}</div>`;
    const tabBar = $('#inspector-tabs .tabs');
    const tabFade = () => {
      tabBar.classList.toggle('fade-start', tabBar.scrollLeft > 1);
      tabBar.classList.toggle('fade-end', tabBar.scrollLeft + tabBar.clientWidth < tabBar.scrollWidth - 1);
    };
    const selTab = tabBar.querySelector('[aria-selected="true"]');
    if (selTab) {
      const over = selTab.getBoundingClientRect().right - tabBar.getBoundingClientRect().right;
      if (over > 0) tabBar.scrollLeft += over + 16;
    }
    tabFade();
    tabBar.addEventListener('scroll', tabFade, { passive: true });

    const key = `${path}|${tab}`;
    if (T.storeKey !== key) {
      T.storeKey = key;
      T.storeQuery = '';
      T.catProductQuery = '';
      T.catOnlyHidden = false;
      T.menuQuery = '';
      T.placeQuery = '';
      T.showSelectedPlaces = false;
      T.openCard = null;
      T.segmentDraft = null;
      T.tagDraft = null;
    }
    const body = { menu: menuTab, category: categoryTab, product: productTab, group: groupTab }[kind](tab, ent, path);
    const scroller = $('#inspector-scroll');
    $('#inspector-body').innerHTML = body;
    if (scroller.dataset.key !== key) {
      scroller.scrollTop = 0;
      scroller.dataset.key = key;
    }
  }
