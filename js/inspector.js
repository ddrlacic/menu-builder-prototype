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
    const anyHidden = noun && parent.children.some((id) => id !== info.id && groupHiddenAt(childPath(info.parentPath, info.kind, id)));
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

  function nestedSections(key, sections, bindOf, items, one, many) {
    if (!sections.length) return '';
    const grip = `<span class="sort-grip" aria-hidden="true">${icon('grip', 14)}</span>`;
    const blocks = sections
      .map((s, i) => {
        const err = s.name.trim() ? lengthError(s.name) : 'Add a section name';
        const label = s.name.trim() || 'section';
        const own = items.filter((it) => it.section === s.id);
        const rows = own.length
          ? own
              .map((it) => `<div class="nest-item" data-nest-row="item" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.name)}, in ${esc(label)}. Drag or use the arrow keys to move it">${grip}<span class="nest-name">${esc(it.name)}</span></div>`)
              .join('')
          : `<div class="nest-empty">No ${many} yet. Drag one here.</div>`;
        return `<div class="nest-block${err ? ' has-error' : ''}" data-sid="${esc(s.id)}">
          <div class="nest-head" data-nest-row="section" tabindex="0" aria-label="${esc(label)}. Drag or use the arrow keys to move it">
            ${sections.length > 1 ? grip : ''}${inputText(bindOf(`sections.${i}.name`), s.name, { label: 'Section name' })}
            <span class="muted tnum">${plural(own.length, one, many)}</span>
            <button type="button" class="icon-btn sm" data-action="nest-section-remove" data-nest="${esc(key)}" data-index="${i}" aria-label="Remove ${esc(label)}" title="${i === 0 && sections.length > 1 ? `Remove section. Its ${many} move to the next one` : sections.length > 1 ? `Remove section. Its ${many} move to the first one` : 'Remove section'}">${icon('x', 14)}</button>
          </div>
          ${err ? slotError(err) : ''}
          ${rows}
        </div>`;
      })
      .join('');
    return `<div class="nest-list" data-nest="${esc(key)}">${blocks}</div>`;
  }

  function placementSection(path) {
    const info = parsePath(path);
    if (!info.parentPath) return '';
    const pInfo = parsePath(info.parentPath);
    const parent = entity(pInfo.kind, pInfo.id);
    const ent = entity(info.kind, info.id);
    const more = { product: productPlacementFields, group: groupPlacementFields }[info.kind];
    const body = positionField(path) + (more ? more(ent, path) : '');
    return body ? section(`In ${nameOf(pInfo.kind, parent)}`, body) : '';
  }

  function tabList(tabs, current, attrs) {
    return `<div class="tabs" role="tablist">${tabs
      .map(
        ([id, label, count]) =>
          `<button type="button" role="tab" class="tab" aria-selected="${id === current}" ${attrs(id)}>${label}${count != null ? `<span class="tab-count tnum">${count}</span>` : ''}</button>`,
      )
      .join('')}</div>`;
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

  function inputNum(bind, value, { id = '', prefix = '', suffix = '', int = false, placeholder = '', disabled = false, label = '' } = {}) {
    return `<div class="input-affix${disabled ? ' is-disabled' : ''}">
      ${prefix ? `<span class="affix">${prefix}</span>` : ''}
      <input type="text" ${id ? `id="${id}"` : ''} class="input tnum" inputmode="${int ? 'numeric' : 'decimal'}" autocomplete="off" data-bind="${esc(bind)}" data-type="${int ? 'int' : 'num'}" data-focus-key="${esc(bind)}"${label ? ` aria-label="${esc(label)}"` : ''} value="${isNum(value) ? value : ''}" placeholder="${esc(placeholder)}" ${disabled ? 'disabled' : ''}>
      ${suffix ? `<span class="affix">${suffix}</span>` : ''}
    </div>`;
  }

  function toggle(bind, on, { label, help = '', scope = '', disabled = false, action = '' } = {}) {
    const trigger = action ? `data-action="${esc(action)}"` : `data-toggle="${esc(bind)}"`;
    return `<div class="toggle-row">
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

  function chips(bind, values, options, { invert = false, vtype = 'text', start = null } = {}) {
    const arr = values || [];
    const startAttr = start ? ` data-start="${esc(JSON.stringify(start))}"` : '';
    return `<div class="chips">${options
      .map(([v, l]) => {
        const on = invert ? !arr.includes(v) : arr.includes(v);
        return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-chip="${esc(bind)}"${startAttr} data-value="${esc(v)}" data-vtype="${vtype}" data-focus-key="${esc(bind)}~${esc(v)}">${on ? icon('check', 12) : ''}${esc(l)}</button>`;
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

  function range(bindFrom, vFrom, bindTo, vTo, suffix, idFrom) {
    if (isNum(vTo)) T.rangeOpen.add(bindTo);
    const on = T.rangeOpen.has(bindTo);
    const inputs = on
      ? `<div class="range">${inputNum(bindFrom, vFrom, { int: true, id: idFrom, suffix, placeholder: 'From' })}<span class="range-sep">–</span>${inputNum(bindTo, vTo, { int: true, suffix, placeholder: 'To', label: 'To' })}</div>`
      : inputNum(bindFrom, vFrom, { int: true, id: idFrom, suffix });
    return `${inputs}<button type="button" class="check-toggle range-toggle" role="checkbox" aria-checked="${on}" data-action="range-toggle" data-bind="${esc(bindTo)}"><span class="check${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span>Enter as range</button>`;
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
    return stores.filter((s) => s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q) || s.id.includes(q));
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
        `${isMissingOnPos(ent) ? callout('warning', `Deleted on POS.${kind === 'product' ? ' Customers cannot order it.' : ''} Remove it from the menu, or add it back on POS.`) : ''}
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
        'Custom product',
        `${callout('info', `Customers see your name, image, and options. POS gets <strong>${esc(ent.posParentExt ? posLabel(ent.posParentExt) : 'the POS product you choose')}</strong>, at its POS price.`, 'link')}
        ${ent.posParentExt ? posKv([['Rings up as', esc(posLabel(ent.posParentExt))], ['POS ID', esc(ent.posParentExt), true]]) : ''}`,
      );
    if (kind === 'product' && ent.ptype === 'container')
      return section(
        'Option folder',
        callout('info', 'An option that opens more options, like Sauces inside Toppings. POS gets only what customers pick inside, as part of the product above it.', 'dashed') +
          `<p class="field-help">Not available on option folders: price, POS ID, dietary info, quantity limits, modifier codes, included ingredients, substitutes, half and whole, upsell, and cross-sell. Option folders go only in product groups, not in categories.</p>`,
      );
    if (kind === 'product' && ent.ptype === 'size')
      return section(
        'Choice product',
        callout('info', 'Customers tap it and pick one product, like a size. POS never gets the choice product, only the product they pick, at its POS price.', 'package'),
      );
    if (kind === 'group' && ent.gtype === 'linked')
      return section(
        'Custom group',
        `${callout('info', `Your name and rules for <strong>${esc(posLabel(ent.posGroupExt))}</strong>. Changing them leaves ${esc(posLabel(ent.posGroupExt))} unchanged on other products. POS gets the options in that group, at its prices.`, 'link')}
        ${posKv([['POS group', esc(posLabel(ent.posGroupExt))], ['POS ID', esc(ent.posGroupExt), true]])}`,
      );
    if (kind === 'group')
      return section(
        'Suggested products',
        callout('info', 'Products customers can add to this item, like fries and a drink. Each one goes on the order as its own item, at its own POS price.', 'dashed'),
      );
    return '';
  }

  const removeSection = (path, kind, ent) => {
    const pInfo = parsePath(parsePath(path).parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const from = inheritedAt(path).map((g) => nameOf('group', g));
    const help = from.length
      ? `${listJoin(from)} adds it to every option. Remove it on the Options tab of ${listJoin(from)}.`
      : isVirtual(ent)
        ? 'Nothing changes on POS.'
        : `The ${KIND_LABEL[kind].toLowerCase()} stays on POS. You can add it back from POS items.`;
    return section(
      '',
      `<button type="button" class="btn secondary tone-danger" data-action="remove" data-path="${esc(path)}" ${from.length ? 'disabled' : ''}>${icon('trash', 15)}Remove from ${esc(parentName)}</button>
       <p class="field-help">${esc(help)}</p>`,
    );
  };

  function stagedBody(kind, ent, path, root) {
    const importBtn = `<button type="button" class="btn primary" data-action="import" ${T.importing ? 'disabled' : ''}>${T.importing ? '<span class="spinner"></span>Importing' : `${icon('download', 15)}Import`}</button>`;
    const imported = (ctx.usage.get(`${kind}:${ent.id}`) || []).filter((u) => !pendingRoot(u));
    const places = imported.length
      ? `<p class="field-help">Edit its settings where it’s already imported:</p>
        <ul class="staged-places">${imported
          .map((u) => `<li><button type="button" class="crumb-link" data-action="goto" data-path="${esc(u)}">${esc(crumbText(u))}</button></li>`)
          .join('')}</ul>`
      : '';
    if (root !== path) {
      const ri = parsePath(root);
      const rootName = nameOf(ri.kind, entity(ri.kind, ri.id));
      return section(
        '',
        `${callout('info', `Not imported yet. It comes in with <button type="button" class="crumb-link" data-action="goto" data-path="${esc(root)}">${esc(rootName)}</button>. Its settings open after you import.`)}
        ${places}<div>${importBtn}</div>`,
      );
    }
    if (!ent.pending) {
      const pInfo = parsePath(parsePath(path).parentPath);
      const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
      return (
        section('', `${callout('info', `Not in ${esc(parentName)} yet. Import to add it here.`)}${places}<div>${importBtn}</div>`) +
        sourceSection(kind, ent, path) +
        removeSection(path, kind, ent)
      );
    }
    return (
      section('', `${callout('info', 'Not imported yet. Name and description go in with the import. The other settings open after you import.')}<div>${importBtn}</div>`) +
      section('General', nameBlock(kind, ent) + descriptionField(`e|${kind}|${ent.id}|description`, ent.description, 'staged-desc')) +
      sourceSection(kind, ent, path) +
      removeSection(path, kind, ent)
    );
  }

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
    if (ent.ptype === 'size') return [tabs[0], ['choices', 'Choices'], ...tabs.slice(1).filter((t) => t[0] !== 'ordering')];
    if (ent.ptype === 'container') return tabs.filter((t) => t[0] !== 'dietary');
    return tabs;
  }

  function renderBulkInspector() {
    const { paths, kind, ents, one, many, noun } = selectionInfo();
    const n = paths.length;
    const names = paths.map(pathName);
    const shown = names.slice(0, 3);
    $('#inspector-head').innerHTML = `
      <div class="insp-head">
        <span class="thumb thumb-lg bulk-count kind-${kind} tnum" aria-hidden="true">${n}</span>
        <div class="insp-titles">
          <div class="insp-kicker"><span class="kind-chip kind-${kind}">${esc(capitalize(many))}</span></div>
          <h2 class="insp-title">${esc(noun(n))} selected</h2>
          <p class="insp-alt" title="${esc(names.join(', '))}">${esc(listJoin(n > 3 ? [...shown, `${n - 3} more`] : shown))}</p>
        </div>
      </div>
      <div class="bulk-tools">
        <span class="field-help">⌘-click to add or remove one. Shift-click to select a range.</span>
        <button type="button" class="btn ghost sm" data-action="sel-clear" title="Clear selection" data-tip-kbd="Esc">Clear selection</button>
      </div>`;
    $('#inspector-tabs').innerHTML = '';

    const live = paths.filter((p) => !pendingRoot(p));
    const liveEnts = ents.filter((e) => !e.pending);
    const pending = n - live.length;
    let html = pending ? callout('info', `${plural(pending, 'item is', 'items are')} not imported yet. Only Remove applies to ${pending === 1 ? 'it' : 'them'} until you import.`) : '';

    if (kind !== 'category' && live.length) {
      const where = sharedParent(live);
      const hidden = live.filter(groupHiddenAt);
      const canShow = hidden.filter(canShowHere).length;
      const canHide = live.filter((p) => !groupHiddenAt(p) && canHideHere(p)).length;
      const notes = [];
      const scoped = live.filter((p) => kind === 'product' && hiddenInProduct(p)).length;
      if (scoped) notes.push(`${plural(scoped, 'option is', 'options are')} hidden only in one product. Change ${scoped === 1 ? 'it' : 'them'} on the Options tab of ${scoped === 1 ? 'its group' : 'their groups'}.`);
      if (kind === 'group') {
        const required = live.filter((p) => !groupHiddenAt(p) && entity('group', parsePath(p).id).children.length && rulesOf(entity('group', parsePath(p).id)).min > 0).length;
        const empty = live.filter((p) => !entity('group', parsePath(p).id).children.length).length;
        if (required) notes.push(`${plural(required, 'required group', 'required groups')} cannot be hidden. Set the minimum to 0 first.`);
        if (empty) notes.push(`${plural(empty, 'group has', 'groups have')} no options to hide.`);
      }
      html += section(
        where ? `In ${where}` : 'In each place',
        `<p class="store-summary tnum">${hidden.length ? `${hidden.length} of ${live.length} hidden` : `All ${live.length} shown`}</p>
        <div class="hint-actions">
          <button type="button" class="btn secondary sm" data-action="bulk-show" ${canShow ? '' : 'disabled'}>${icon('eye', 14)}Show ${many}</button>
          <button type="button" class="btn secondary sm" data-action="bulk-hide" ${canHide ? '' : 'disabled'}>${icon('eyeOff', 14)}Hide ${many}</button>
        </div>
        ${notes.map((t) => `<p class="field-help">${esc(t)}</p>`).join('')}`,
        { desc: where ? 'Hide them here without removing them. Other places stay as they are.' : 'Hides or shows each one where it’s selected, without removing it. Other places stay as they are.' },
      );
    }

    if (kind !== 'group' && liveEnts.length) {
      const withImage = liveEnts.filter((e) => e.image).length;
      html += section(
        'Image',
        `<p class="store-summary tnum">${withImage ? `${withImage} of ${liveEnts.length} have an image` : 'No images yet'}</p>
        <div class="hint-actions"><button type="button" class="btn secondary sm" data-action="bulk-image">${icon('upload', 14)}Upload image</button></div>
        <p class="field-help">JPG, PNG, or GIF up to 1 MB. Each ${one} gets the same image.</p>`,
      );
      html += section(
        'Stores',
        `<div class="hint-actions">
          <button type="button" class="btn secondary sm" data-action="bulk-stores" data-mode="hide">${icon('eyeOff', 14)}Hide at stores</button>
          <button type="button" class="btn secondary sm" data-action="bulk-stores" data-mode="show">${icon('eye', 14)}Show at stores</button>
          ${kind === 'product' ? `<button type="button" class="btn secondary sm" data-action="bulk-stock" aria-haspopup="menu">${icon('package', 14)}Set stock</button>` : ''}
        </div>`,
        { desc: 'Applies in every menu.' },
      );
    }

    const removable = removableRows(paths);
    const inherited = paths.filter((p) => inheritedAt(p).length).length;
    const removeLabel = kind === 'category' ? 'Remove from menu' : sharedParent(removable.length ? removable : paths) ? `Remove from ${sharedParent(removable.length ? removable : paths)}` : `Remove ${many}`;
    const del = bulkDeleteState();
    const tooMany = del.ok.length > DELETE_MAX;
    const delHelp = tooMany
      ? `Delete up to ${DELETE_MAX} at a time.`
      : del.blocked.length === 1
        ? `${nameOf(kind, del.blocked[0])} is skipped. ${deleteBlockOf(kind, del.blocked[0])}`
        : del.blocked.length
          ? `${plural(del.blocked.length, one, many)} are skipped. ${nameOf(kind, del.blocked[0])}: ${deleteBlockOf(kind, del.blocked[0])}`
          : 'Deletes them everywhere they’re used. This cannot be undone.';
    html += section(
      '',
      `<div class="hint-actions">
        <button type="button" class="btn secondary" data-action="bulk-remove" ${removable.length ? '' : 'disabled'}>${icon('x', 15)}${esc(removeLabel)}</button>
        <button type="button" class="btn secondary tone-danger" data-action="bulk-delete" ${del.ok.length && !tooMany ? '' : 'disabled'}>${icon('trash', 15)}Delete ${esc(noun(del.ok.length))}</button>
      </div>
      ${inherited ? `<p class="field-help">${plural(inherited, `${one} is`, `${many} are`)} added by another group and cannot be removed here.</p>` : ''}
      <p class="field-help">${esc(delHelp)}</p>`,
    );
    $('#inspector-body').innerHTML = html;
  }

  function renderEmptyInspector() {
    $('#inspector-head').innerHTML = '';
    $('#inspector-tabs').innerHTML = '';
    $('#inspector-body').innerHTML = `<div class="empty-small insp-empty">${icon('cursorClick', 20)}<strong>Nothing selected</strong><span>Select a category, product, or group to edit it. Shift-click or ⌘-click to select several.</span></div>`;
  }

  function renderInspector() {
    if (T.cleared) return renderEmptyInspector();
    if (T.sel.length > 1) return renderBulkInspector();
    const path = S.ui.selected;
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const kind = info.kind;
    const tabs = tabsFor(kind, ent);
    const tab = tabs.some((t) => t[0] === S.ui.tabs[kind]) ? S.ui.tabs[kind] : tabs[0][0];
    const uses = kind === 'menu' ? [] : ctx.usage.get(`${kind}:${info.id}`) || [];
    const issues = ctx.issues.byPath.get(path) || [];
    const chipKind = kind === 'menu' ? 'menu' : isVirtual(ent) && !isCustomVersion(ent) ? 'virtual' : kind;

    const headPosId = kind === 'menu' ? ent.posExt : posIdOf(kind, ent);
    const kicker = [
      `<span class="kind-chip kind-${chipKind}">${esc(kindLabel(kind, ent))}</span>`,
      headPosId
        ? `<button type="button" class="src-chip src-id" data-action="copy-text" data-value="${esc(headPosId)}" data-label="POS ID" aria-label="Copy POS ID ${esc(headPosId)}" title="Copy POS ID ${esc(headPosId)}">${icon('link', 12)}<span class="mono">${esc(headPosId)}</span>${icon('copy', 12)}</button>`
        : '',
    ].join('');

    const crumbHtml =
      kind === 'menu'
        ? ''
        : `<nav class="crumbs" aria-label="Location">${crumbs(info.parentPath)
            .map((c) => `<button type="button" class="crumb" data-action="goto" data-path="${esc(c.path)}">${esc(c.name)}</button>`)
            .join('<span class="crumb-sep">›</span>')}</nav>`;

    $('#inspector-head').innerHTML = `
      <div class="insp-head">
        ${thumb(kind, ent, 'thumb-lg')}
        <div class="insp-titles">
          <div class="insp-kicker">${kicker}</div>
          <h2 class="insp-title" title="${esc(nameOf(kind, ent))}">${esc(nameOf(kind, ent))}</h2>
          ${ent.internalName ? `<p class="insp-alt" title="Internal name: ${esc(ent.internalName)}">${esc(ent.internalName)}</p>` : ''}
          ${crumbHtml}
        </div>
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

    const root = kind === 'menu' ? null : pendingRoot(path);
    if (root) {
      $('#inspector-tabs').innerHTML = '';
      $('#inspector-body').innerHTML = stagedBody(kind, ent, path, root);
      return;
    }

    $('#inspector-tabs').innerHTML = tabList(tabs, tab, (id) => `data-action="tab" data-kind="${kind}" data-tab="${id}"`);
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
