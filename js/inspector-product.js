'use strict';

  function priceSection(path) {
    const st = priceStats(path);
    if (st.kind === 'none') return '';
    if (st.pending) return section('Price', callout('info', 'Prices show up after you publish. They come from POS and can differ by store.'));
    const menu = activeMenu();
    const inGroup = parsePath(parsePath(path).parentPath).kind === 'group';
    const label = { base: 'Customers pay', size: 'Customers pay', modifier: 'Customers pay extra', item: 'Added as its own item' }[st.kind];
    const plus = st.kind === 'modifier' || st.kind === 'item';
    const fmt = (v) => (v == null ? 'No price' : v === 0 && st.kind === 'modifier' ? 'Free' : `${plus ? '+' : ''}${money(v)}`);
    const missing = st.missingStores;
    const names = missing.slice(0, 12).map((s) => s.name);
    const missingHtml = missing.length
      ? callout(
          missing.length === st.total ? 'error' : 'warning',
          `<strong>No POS price at ${missing.length === st.total ? 'any store' : plural(missing.length, 'store', 'stores')}.</strong> Customers there cannot ${inGroup ? 'choose' : 'order'} it. Add the price on POS, then sync.
          <details class="store-more"><summary>Show stores</summary><p>${esc(names.join(', '))}${missing.length > 12 ? `, and ${missing.length - 12} more` : ''}.</p></details>`,
        )
      : '';
    const check = (s) => {
      const v = priceInfo(path, s).value;
      return `<div class="store-row"><span class="store-name">${icon('store', 15)}${esc(s.name)}</span><span class="store-price tnum${v == null ? ' muted' : ''}">${fmt(v)}</span></div>`;
    };
    return section(
      'Price',
      `<div class="price-hero">
        <span class="price-hero-label">${label}</span>
        <span class="price-hero-value tnum">${esc(priceText(st))}</span>
        <span class="price-hero-src">${icon('lock', 12)}${esc(st.note)}${st.min !== st.max ? '. Varies by store' : ''}</span>
      </div>
      ${missingHtml}
      ${field('Check a store', storeSearch('price-store-q', `Search ${st.total} stores`))}
      ${storeResults(matchStores(menuStores(menu)), check)}
      <p class="field-help">Prices come only from POS and can differ by store. To change a price, update it on POS.</p>`,
      { desc: `Across ${storeCountLabel(menu)} in ${esc(menu.name)}.` },
    );
  }

  const productBind = (p) => (f) => `e|product|${p.id}|${f}`;
  const PRODUCT_SHOWN = 'Shown in Web App and Kiosk, and sent to delivery partners.';

  const moveButtons = (bind, i, count, label) =>
    `<button type="button" class="icon-btn sm" data-action="arr-move" data-bind="${esc(bind)}" data-index="${i}" data-delta="-1" aria-label="Move ${esc(label)} up" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevUp', 14)}</button>` +
    `<button type="button" class="icon-btn sm" data-action="arr-move" data-bind="${esc(bind)}" data-index="${i}" data-delta="1" aria-label="Move ${esc(label)} down" title="Move down" ${i === count - 1 ? 'disabled' : ''}>${icon('chevDown', 14)}</button>`;

  const removeButton = (bind, i, label) =>
    `<button type="button" class="icon-btn sm" data-action="arr-remove" data-bind="${esc(bind)}" data-index="${i}" aria-label="Remove ${esc(label)}" title="Remove">${icon('x', 14)}</button>`;

  function productList(bind, ids, empty) {
    if (!ids.length) return `<p class="field-help">${esc(empty)}</p>`;
    const sortable = ids.length > 1;
    return `<div class="store-list"${sortable ? ` data-sortable="${esc(bind)}"` : ''}>${ids
      .map((pid, i) => {
        const x = entity('product', pid);
        if (!x) return '';
        const name = nameOf('product', x);
        return `<div class="store-row list-row" data-sort-index="${i}"${sortable ? ` tabindex="0" aria-label="${esc(name)}. Drag or use the arrow keys to move it"` : ''}>${thumb('product', x, 'thumb-sm')}<span class="store-name">${esc(name)}</span><span class="row-tools">${removeButton(bind, i, name)}</span>${sortable ? `<span class="sort-grip" aria-hidden="true">${icon('grip', 14)}</span>` : ''}</div>`;
      })
      .join('')}</div>${sortable ? '<p class="field-help">Drag products to change the order customers see.</p>' : ''}`;
  }

  const addButton = (action, label, attrs = '') => `<button type="button" class="btn ghost sm" data-action="${action}" ${attrs}>${icon('plus', 14)}${esc(label)}</button>`;

  const substituteActions = (add, bind, count) =>
    `<div class="hint-actions">${add}${count > 1 ? `<button type="button" class="btn ghost sm tone-danger" data-action="subs-clear" data-bind="${esc(bind)}">${icon('trash', 14)}Remove all</button>` : ''}</div>`;

  function choicesSection(p, path) {
    const pb = productBind(p);
    const pName = nameOf('product', p);
    const add = addButton('add-choice', 'Add POS product');
    if (!p.children.length)
      return section('Choices', `<div class="empty-small"><strong>No choices yet</strong><span>Add the POS products customers choose between, like Small and Large.</span></div>${add}`);
    const menu = menuById(parsePath(path).menuId);
    const menuName = nameOf('menu', menu);
    const home = entity('category', parsePath(parsePath(path).parentPath).id);
    const rows = p.children
      .map((pid, i) => {
        const x = entity('product', pid);
        if (!x) return '';
        const op = childPath(path, 'product', pid);
        const hidden = !!placement(op).hidden;
        const name = nameOf('product', x);
        const st = priceStats(op);
        const sub = !home.children.includes(pid)
          ? `Not in ${nameOf('category', home)}, so ${inMenuCategory(menu, pid) ? 'delivery apps leave it out' : 'customers cannot pick it'}`
          : st.missingStores.length && !isMissingOnPos(x)
            ? `No POS price at ${st.missingStores.length === st.total ? 'any store' : plural(st.missingStores.length, 'store', 'stores')}`
            : '';
        const open = T.openCard === `choice:${pid}`;
        const detail = open
          ? `<div class="opt-detail"><div class="opt-detail-foot">
              <div class="position-control"><span class="tnum">${i + 1} of ${p.children.length}</span>${moveButtons(pb('children'), i, p.children.length, name)}</div>
              <button type="button" class="btn ghost sm tone-danger" data-action="remove" data-path="${esc(op)}">${icon('trash', 14)}Remove from ${esc(pName)}</button>
            </div></div>`
          : '';
        return `<div class="opt-item${open ? ' is-open' : ''}"><div class="opt-row${hidden ? ' is-muted' : ''}">
            <button type="button" class="opt-name" data-action="goto" data-path="${esc(op)}">${thumb('product', x, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label" title="${esc(name)}">${esc(name)}</span>${sub ? `<span class="opt-name-sub"><span class="tone-warning">${esc(sub)}</span></span>` : ''}</span></button>
            <button type="button" class="switch" role="switch" aria-checked="${!hidden}" aria-label="Show ${esc(name)}" data-toggle="pl|${esc(op)}|hidden" data-focus-key="pl|${esc(op)}|hidden"><span class="switch-thumb"></span></button>
            <button type="button" class="icon-btn sm opt-expand" data-action="card-open" data-id="choice:${esc(pid)}" aria-expanded="${open}" aria-label="Settings for ${esc(name)}" title="Settings">${icon('chevDown', 14)}</button>
          </div>${detail}</div>`;
      })
      .join('');
    return (
      section(
        'Choices',
        `<div class="opt-table has-expand no-pre no-price">
          <div class="opt-head"><span>Choice</span><span>Shown</span><span class="sr-only">Settings</span></div>
          ${rows}
        </div>
        <p class="field-help">Customers pick one. Only the product they pick goes to POS, at its own POS price. Select a choice’s name to see its price. Shown applies only in ${esc(menuName)}.</p>
        ${add}`,
      ) +
      section('Copy details', `<button type="button" class="btn secondary sm" data-action="copy-to-choices">${icon('copy', 14)}Copy description and image to choices</button>`, {
        desc: 'Gives each choice this product’s description and image. Names stay as they are.',
      })
    );
  }

  function productOptions(p, { modifierOnly = false, noHalves = false } = {}) {
    const out = [];
    const halves = new Set(noHalves ? p.children.flatMap((gid) => (entity('group', gid) ? [...groupedHalves(entity('group', gid))] : [])) : []);
    p.children.forEach((gid) => {
      const g = entity('group', gid);
      if (!g || (modifierOnly && rulesOf(g).type !== 1)) return;
      g.children.forEach((pid) => {
        const x = entity('product', pid);
        if (x && x.ptype !== 'container' && !halves.has(pid)) out.push({ gid, pid, g, x, key: `${gid}:${pid}` });
      });
    });
    return out;
  }

  function groupCards(p, opts, prefix, summary, rowFn) {
    const byGroup = new Map();
    opts.forEach((o) => byGroup.set(o.gid, [...(byGroup.get(o.gid) || []), o]));
    return [...byGroup.entries()]
      .map(([gid, list]) => {
        const solo = byGroup.size === 1;
        const key = `${solo ? '!' : ''}${prefix}:${gid}`;
        const open = solo ? T.openCard !== key : T.openCard === key;
        return `<div class="group-card${open ? ' is-open' : ''}">
          <div class="group-card-head">
            <button type="button" class="group-card-toggle" data-action="card-open" data-id="${esc(key)}" aria-expanded="${open}">
              ${icon('chevRight', 14)}
              <span class="group-card-title"><strong>${esc(nameOf('group', list[0].g))}</strong><span class="muted tnum">${esc(summary(list))}</span></span>
            </button>
          </div>
          ${open ? `<div class="group-card-body">${list.map(rowFn).join('')}</div>` : ''}
        </div>`;
      })
      .join('');
  }

  function quantitySection(p) {
    const pb = productBind(p);
    const hasLimit = isNum(p.minQty) || isNum(p.maxQty);
    const maxErr = qtyError(p.maxQty) || (isNum(p.minQty) && isNum(p.maxQty) && p.maxQty < p.minQty ? 'Maximum needs to be at least the minimum' : '');
    return section(
      'Quantity limits',
      `<div class="grid-2">
        ${field('Minimum', inputNum(pb('minQty'), p.minQty, { int: true, id: 'p-min', placeholder: 'No limit' }), { id: 'p-min', error: qtyError(p.minQty) })}
        ${field('Maximum', inputNum(pb('maxQty'), p.maxQty, { int: true, id: 'p-max', placeholder: 'No limit' }), { id: 'p-max', error: maxErr })}
      </div>
      ${
        hasLimit
          ? field('Limits apply to', segmented(pb('qtyScope'), p.qtyScope, [['cart', 'Per order'], ['item', 'Per cart item']]), {
              help: p.qtyScope === 'item' ? 'Each cart item is counted on its own.' : 'All of this product in the cart counts toward the limit.',
            })
          : ''
      }`,
      { desc: 'Limit how many customers can order when they order it on its own in Web App and Kiosk, not as an option. Delivery partners do not get these limits.' },
    );
  }

  function modifierCodesSection(p) {
    const pb = productBind(p);
    const enabled = productCodes(p);
    const bind = pb('modifierCodes');
    const rows = enabled
      .map(([v, l], i) => {
        const on = p.preselectedCode === v;
        const sortable = enabled.length > 1;
        return `<div class="store-row list-row code-row" data-sort-index="${i}"${sortable ? ` tabindex="0" aria-label="${esc(l)}. Drag or use the arrow keys to move it"` : ''}>
          <button type="button" class="check-toggle opt-pick" role="radio" aria-checked="${on}" aria-label="Preselect ${esc(l)}" data-action="code-pre" data-id="${esc(v)}"><span class="check is-round${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span></button>
          <span class="store-name">${esc(l)}</span>
          ${on ? '<span class="code-hint">Preselected</span>' : ''}
          ${sortable ? `<span class="sort-grip" aria-hidden="true">${icon('grip', 14)}</span>` : ''}
        </div>`;
      })
      .join('');
    return section(
      'Modifier codes',
      field('Codes', chips(bind, p.modifierCodes, C.modifierCodes)) +
        toggle(pb('isModifierCodeRequired'), p.isModifierCodeRequired, {
          label: 'Require a modifier code',
          help: enabled.length ? 'Customers need a code to choose this option.' : 'Add a code first.',
          disabled: !enabled.length,
        }) +
        (enabled.length
          ? field('Preselection and order', `<div class="store-list"${enabled.length > 1 ? ` data-sortable="${esc(bind)}"` : ''} role="radiogroup" aria-label="Preselected code">${rows}</div>`, {
              help: `${p.isModifierCodeRequired ? 'One code is always preselected.' : 'Preselect one code at most.'} Customers can change it.${enabled.length > 1 ? ' Drag codes to change the order customers see.' : ''}`,
            })
          : ''),
      { desc: 'Customers pick one when they choose this product as an option, like Extra or On the side. Codes come from your brand’s modifier codes.' },
    );
  }

  function sectionsSection(p) {
    if (!p.children.length) return '';
    const pb = productBind(p);
    const items = p.children.filter((gid) => entity('group', gid)).map((gid) => ({ id: gid, name: nameOf('group', entity('group', gid)), section: sectionOf(p, gid) }));
    return section('Group sections', nestedSections(`product|${p.id}|groupSection`, p.sections, pb, items, 'group', 'groups') + addButton('section-add', 'Add section'), {
      desc: p.sections.length
        ? 'Customers see the groups under these headings, in this order. Drag groups and headings to arrange them. Only Web App shows headings.'
        : 'Split the groups under headings, like Base and Toppings. Only Web App shows headings.',
    });
  }

  function includedSection(p) {
    if (!p.children.length) return section('Included ingredients', '<p class="field-help">Add a group to this product first. Ingredients come from its groups.</p>');
    const pb = productBind(p);
    const fromPos = posIncluded(p);
    const label = (it) => {
      const g = entity('group', it.gid);
      const x = entity('product', it.pid);
      return g && x ? `<span class="store-name list-name"><span>${esc(nameOf('product', x))}</span><span class="muted">${esc(nameOf('group', g))}</span></span>` : '';
    };
    const posRows = fromPos
      .map(
        (it) => `<div class="store-row list-row">${label(it)}<span class="row-tools"><span class="scope scope-pos" title="POS adds it automatically, so customers cannot remove it">${icon('lock', 11)}Locked by POS</span></span></div>`,
      )
      .join('');
    const rows = p.included
      .map((it, i) => {
        const x = entity('product', it.pid);
        const head = label(it);
        if (!head) return '';
        const name = nameOf('product', x);
        const sortable = p.included.length > 1;
        return `<div class="store-row list-row" data-sort-index="${i}"${sortable ? ` tabindex="0" aria-label="${esc(name)}. Drag or use the arrow keys to move it"` : ''}>${head}
          <span class="row-tools">
            <button type="button" class="icon-btn sm${it.locked ? ' is-on' : ''}" data-toggle="${esc(pb(`included.${i}.locked`))}" aria-pressed="${!!it.locked}" aria-label="Lock ${esc(name)}" title="${it.locked ? 'Locked. Customers cannot remove it.' : 'Customers can remove it. Select to lock.'}">${icon(it.locked ? 'lock' : 'unlock', 14)}</button>
            ${removeButton(pb('included'), i, name)}
          </span>${sortable ? `<span class="sort-grip" aria-hidden="true">${icon('grip', 14)}</span>` : ''}
        </div>`;
      })
      .join('');
    const any = fromPos.length || p.included.length;
    return section(
      'Included ingredients',
      (any
        ? field('Group name', inputText(pb('includedName'), p.includedName, { id: 'p-inc-name' }), {
            id: 'p-inc-name',
            error: lengthError(p.includedName),
            help: 'Customers see this name above the ingredients.',
          }) + `<div class="store-list"${p.included.length > 1 ? ` data-sortable="${esc(pb('included'))}"` : ''}>${posRows}${rows}</div>`
        : '') + addButton('add-included', 'Add ingredient'),
      {
        desc: any
          ? `When Group included ingredients is on in your brand’s configurations, Web App shows these together at the top of the product. Otherwise they stay in their groups. Locked ones cannot be removed.${p.included.length > 1 ? ' Drag ingredients to change their order.' : ''}`
          : 'Ingredients that come with the product, like the patty and bun. Options that POS adds automatically show here too.',
      },
    );
  }

  function followNote(g, own, { customize, reset, key }) {
    if (own) return `<p class="field-help">Set for this product only. <button type="button" class="link-btn" data-action="${reset}" data-key="${esc(key)}">Use the ${esc(nameOf('group', g))} group’s setting</button></p>`;
    return `<p class="field-help">Same as the ${esc(nameOf('group', g))} group. <button type="button" class="link-btn" data-action="${customize}" data-key="${esc(key)}">Change for this product</button></p>`;
  }

  function substituteList(bind, ids, labelOf, locked) {
    const shown = ids.filter((id) => labelOf(id));
    if (!shown.length) return '';
    const sortable = !locked && shown.length > 1;
    return `<div class="store-list"${sortable ? ` data-sortable="${esc(bind)}"` : ''}>${ids
      .map((sid, i) => {
        const label = labelOf(sid);
        if (!label) return '';
        const { name, sub } = label;
        return `<div class="store-row list-row"${sortable ? ` data-sort-index="${i}" tabindex="0" aria-label="${esc(name)}. Drag or use the arrow keys to move it"` : ''}>
          <span class="store-name list-name"><span>${esc(name)}</span>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</span>
          ${locked ? '' : `<span class="row-tools">${removeButton(bind, i, name)}</span>`}${sortable ? `<span class="sort-grip" aria-hidden="true">${icon('grip', 14)}</span>` : ''}
        </div>`;
      })
      .join('')}</div>`;
  }

  function substitutesSection(p) {
    const opts = productOptions(p, { noHalves: true });
    if (!opts.length) return section('Substitutes', '<p class="field-help">Add a group with options to this product first.</p>');
    const pb = productBind(p);
    const subsOf = (o) => substitutesAt(p, o.gid, o.pid).ids.filter((id) => entity('product', id));
    const groupOf = new Map();
    productOptions(p).forEach((o) => groupOf.has(o.pid) || groupOf.set(o.pid, o.g));
    const sortable = opts.some((o) => substitutesAt(p, o.gid, o.pid).own && subsOf(o).length > 1);
    const cards = groupCards(
      p,
      opts,
      'sub',
      (list) => {
        const n = list.filter((o) => subsOf(o).length).length;
        return n ? `${n} of ${list.length} with substitutes` : plural(list.length, 'option', 'options');
      },
      (o) => {
        const { ids, own } = substitutesAt(p, o.gid, o.pid);
        const fromGroup = groupSubstitutes(p, o.g, o.pid).length > 0;
        const locked = fromGroup && !own;
        const labelOf = (sid) => {
          if (!entity('product', sid)) return null;
          const g = groupOf.get(sid);
          return { name: g ? optionName(g, sid) : nameOf('product', entity('product', sid)), sub: g && g.id !== o.gid ? nameOf('group', g) : '' };
        };
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(optionName(o.g, o.pid))}</span>
          ${substituteList(pb(`substitutes.${o.key}`), ids, labelOf, locked)}
          ${locked ? '' : substituteActions(addButton('add-substitute', 'Add', `data-key="${esc(o.key)}"`), pb(`substitutes.${o.key}`), subsOf(o).length)}
          ${fromGroup ? followNote(o.g, own, { customize: 'sub-customize', reset: 'sub-reset', key: o.key }) : ''}
        </div>`;
      },
    );
    return section('Substitutes', `<div class="opt-cards">${cards}</div>`, {
      desc: `Let customers swap an option for another, like fries for a salad. Substitutes set on a group apply here unless you change them for this product. Only Web App supports this.${sortable ? ' Drag substitutes to change the order customers see.' : ''}`,
    });
  }

  function halfWholeSection(p) {
    const modifiers = productOptions(p, { modifierOnly: true, noHalves: true });
    const opts = modifiers.filter((o) => !(halfMatches(o.g).halfIds.has(o.pid) && !o.g.halves[o.pid]));
    if (!opts.length) return section('Half and whole', '<p class="field-help">Add a modifier group, like toppings, to this product first.</p>');
    const halfCount = productOptions(p, { modifierOnly: true }).length - opts.length;
    const nm = (id) => nameOf('product', entity('product', id));
    const hover = (id, gid) => {
      const x = p.children.map((cid) => entity('group', cid)).find((s) => s && s.children.includes(id));
      return x && x.id !== gid ? `${nm(id)}, in ${nameOf('group', x)}` : nm(id);
    };
    const full = (o) => {
      const { h } = halvesAt(p, o.gid, o.pid);
      return !!(h.left && h.right);
    };
    const missing = opts.filter((o) => !full(o));
    const filter = T.halfFilter === 'missing' && missing.length ? 'missing' : 'all';
    const groups = [...new Set(opts.map((o) => o.gid))].map((gid) => entity('group', gid));
    const pick = (o, side, h, locked) => {
      const v = h[side];
      const label = `${SIDE_LABEL[side]} of ${optionName(o.g, o.pid)}`;
      const inner = `${icon(side === 'left' ? 'halfLeft' : 'halfRight', 13)}<span class="half-pick-label">${esc(v ? nm(v) : locked ? 'Not added' : `Add ${SIDE_LABEL[side].toLowerCase()}`)}</span>`;
      if (locked) return `<div class="half-cell"><div class="input is-readonly half-pick${v ? '' : ' is-empty'}"><span class="sr-only">${esc(SIDE_LABEL[side])}: </span>${inner}</div></div>`;
      return `<div class="half-cell">
        <button type="button" class="input half-pick${v ? '' : ' is-empty'}" data-action="p-half-pick" data-key="${esc(o.key)}" data-side="${side}" aria-label="${esc(label)}"${v ? ` title="${esc(hover(v, o.gid))}"` : ''}>${inner}${icon('chevDown', 14)}</button>
        ${v ? `<button type="button" class="icon-btn sm" data-action="p-half-clear" data-key="${esc(o.key)}" data-side="${side}" aria-label="Remove ${esc(label.toLowerCase())}" title="Remove">${icon('x', 14)}</button>` : ''}
      </div>`;
    };
    const cards = groupCards(
      p,
      filter === 'missing' ? missing : opts,
      'half',
      (list) => {
        const inGroup = opts.filter((o) => o.gid === list[0].gid);
        const n = inGroup.filter(full).length;
        return n ? `${n} of ${inGroup.length} with halves` : plural(inGroup.length, 'option', 'options');
      },
      (o) => {
        const { h, own } = halvesAt(p, o.gid, o.pid);
        const fromGroup = halvesSupported(o.g) && !!o.g.halves[o.pid];
        const locked = fromGroup && !own;
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(optionName(o.g, o.pid))}</span>
          <div class="half-picks">${pick(o, 'left', h, locked)}${pick(o, 'right', h, locked)}</div>
          ${!locked && !h.left !== !h.right ? slotError('Add both halves, or remove both') : ''}
          ${fromGroup ? followNote(o.g, own, { customize: 'half-customize', reset: 'half-reset', key: o.key }) : ''}
        </div>`;
      },
    );
    const hints = groups
      .filter((g) => suggestedHalves(g).length)
      .map((g) => {
        const n = suggestedHalves(g).length;
        const name = esc(nameOf('group', g));
        return `${callout('info', `${n === 1 ? `1 topping in ${name} has` : `${n} toppings in ${name} have`} halves with matching names. Group them, so customers choose a side on the topping instead of seeing each half as its own option. This applies to every product that uses ${name}.`, 'sparkles')}
          <div class="hint-actions">
            <button type="button" class="btn secondary sm" data-action="group-halves" data-id="${esc(g.id)}">${icon('sparkles', 14)}Group halves</button>
            <button type="button" class="btn ghost sm" data-action="dismiss-half-hint" data-id="${esc(g.id)}">Dismiss suggestion</button>
          </div>`;
      });
    const later = groups.filter((g) => halfSuggestions(g).length && !suggestedHalves(g).length);
    const seg = (v, label, n) =>
      `<button type="button" role="radio" aria-checked="${filter === v}" class="seg" data-action="half-filter" data-value="${v}">${label}<span class="seg-count tnum">${n}</span></button>`;
    const body = `<div class="half-tools">
        <div class="segmented" role="radiogroup" aria-label="Show toppings">${seg('all', 'All', opts.length)}${seg('missing', 'Missing halves', missing.length)}</div>
        ${later.map((g) => `<button type="button" class="btn ghost sm" data-action="group-halves" data-id="${esc(g.id)}">${icon('sparkles', 14)}${groups.length > 1 ? `Group halves in ${esc(nameOf('group', g))}` : 'Group halves'}</button>`).join('')}
      </div>
      <div class="opt-cards">${cards}</div>
      ${halfCount ? `<p class="field-help">${halfCount === 1 ? '1 option in this product is a half, so it is not listed.' : `${halfCount} options in this product are halves, so they are not listed.`} You’ll find each half under its topping in the menu.</p>` : ''}`;
    return (
      (hints.length ? section('Suggestion', hints.join('')) : '') +
      section('Half and whole', body, {
        desc: 'Let customers put a topping on the left half, the right half, or the whole product. Halves set on a group apply here unless you change them for this product. Only Web App supports this.',
      })
    );
  }

  function upsellSection(p) {
    const pb = productBind(p);
    const titleErr = p.upsell.products.length && !p.upsell.title.trim() ? 'Add a title' : lengthError(p.upsell.title);
    return section(
      'Upsell',
      (p.upsell.products.length
        ? field('Title', inputText(pb('upsell.title'), p.upsell.title, { id: 'p-upsell-title' }), {
            id: 'p-upsell-title',
            error: titleErr,
            help: 'Customers see it above the products.',
          })
        : '') +
        productList(pb('upsell.products'), p.upsell.products, 'No products yet.') +
        addButton('pick-products', 'Add products', `data-bind="${esc(pb('upsell.products'))}" data-title="Add upsell products"`),
      { desc: 'When customers open this product, Web App and Kiosk offer these instead, like a combo. Customers can still carry on with this product. Delivery partners do not get upsells.' },
    );
  }

  function crossSellSection(p) {
    const pb = productBind(p);
    return section(
      'Cross-sell',
      productList(pb('crossSell'), p.crossSell, 'No products yet.') + addButton('pick-products', 'Add products', `data-bind="${esc(pb('crossSell'))}" data-title="Add cross-sell products"`),
      { desc: 'When customers open this product, Web App suggests these under People also added. Individual product suggestions needs to be on in your brand’s cross-sell settings. Applies in every menu.' },
    );
  }

  function linkedGroupsSection(p, path) {
    const allowed = allowedPosGroupsFor(path);
    const missing = allowed.filter((gid) => !p.children.some((c) => posIdOf('group', entity('group', c)) === gid));
    if (!p.posParentExt) return section('Groups', '<p class="field-help">Choose what this custom product rings up as first. Its groups come from that POS product.</p>');
    return section(
      'Groups',
      missing.length
        ? `<p class="field-help">${p.children.length ? `${plural(missing.length, 'group', 'groups')} from ${esc(posLabel(p.posParentExt))} ${missing.length === 1 ? 'is' : 'are'} not added: ${esc(listJoin(missing.map(posLabel)))}.` : `Add the groups of ${esc(posLabel(p.posParentExt))}, or pick only the ones you need with the add button on this product.`}</p>
           <button type="button" class="btn secondary sm" data-action="parent-groups" data-path="${esc(path)}">${icon('plus', 14)}Add all groups</button>`
        : `<p class="field-help">All groups from ${esc(posLabel(p.posParentExt))} are added. Set preselected options in each group.</p>`,
    );
  }

  function productPlacementFields(p, path) {
    const info = parsePath(path);
    const parent = parsePath(info.parentPath);
    const parentEnt = entity(parent.kind, parent.id);
    const parentName = nameOf(parent.kind, parentEnt);
    const inChoice = parent.kind === 'product' && parentEnt.ptype === 'size';
    const menuName = nameOf('menu', menuById(info.menuId));
    const pl = placement(path);
    const inProduct = hiddenInProduct(path) && nameOf('product', entity('product', productScopePath(path).split('>')[1].slice(2)));
    let html = toggle(`pl|${path}|hidden`, !pl.hidden && !inProduct, {
      label: `Show in ${parentName}`,
      scope: inChoice ? `${parentName} in ${menuName}` : crumbText(path),
      disabled: !!inProduct,
      help: inProduct
        ? `Hidden in ${esc(inProduct)}, in every menu. Show it on the Options tab of ${esc(parentName)}, with ${esc(inProduct)} chosen.`
        : inChoice
          ? `Hide it here without removing it. Applies everywhere ${esc(parentName)} is in ${esc(menuName)}.`
          : 'Hide it here without removing it. Other places stay as they are.',
    });
    if (parent.kind !== 'group' || p.ptype === 'container') return html;

    const scope = productScopeText(path);
    const rootName = nameOf('product', entity('product', productScopePath(path).split('>')[1].slice(2)));
    const onlyRoot = `A change here applies only in ${esc(rootName)}, in every menu.`;
    const groupHidden = groupHiddenCodes(parentEnt, p.id);
    const codes = productCodes(p);
    const pr = rulesOf(parentEnt);
    const groupPre = parentEnt.preselected[p.id] || 0;
    if (isAutoAdded(path))
      html += field('Preselected', stepper(`pl|${path}|preselected`, 1, { label: 'preselected quantity', disabled: true }), { pos: true, help: 'POS adds this option automatically, so it’s always preselected.' });
    else if (pr.type !== 1) {
      const rule = pr.type === 2 ? 'Size groups preselect one option' : 'Combo groups preselect one option at most';
      html += field('Preselected', `<p class="field-help">${groupPre ? 'Yes' : 'No'}. ${rule} everywhere they are used. Choose it on the Options tab of ${esc(parentName)}.</p>`);
    } else
      html += field('Preselected', stepper(`pl|${productScopePath(path)}|preselected`, preselectedAt(path), { max: optionMaxOf(parentEnt, p.id, pr), label: 'preselected quantity', keepZero: true, start: groupPre }), {
        scope,
        help: preselectOverridden(path)
          ? `${esc(parentName)} preselects ${groupPre} in other products. <button type="button" class="link-btn" data-action="pre-reset" data-path="${esc(productScopePath(path))}">Use the same here</button>`
          : `Same as the ${esc(parentName)} group. ${onlyRoot}`,
      });
    html += field('Name in this group', inputText(`e|group|${parentEnt.id}|optionSettings.${p.id}.name`, (parentEnt.optionSettings[p.id] || {}).name, { id: 'p-grp-name', placeholder: nameOf('product', p) }), {
      id: 'p-grp-name',
      error: lengthError((parentEnt.optionSettings[p.id] || {}).name),
      help: `Customers see this name in ${esc(parentName)}, everywhere it’s used. Leave it empty to use the product name.`,
    });
    if (codes.length)
      html += field('Modifier codes shown', chips(`pl|${productScopePath(path)}|codesHere`, hiddenCodesAt(path), codes, { invert: true, start: groupHidden }), {
        scope,
        help: codesOverridden(path)
          ? `Other products use the codes set in ${esc(parentName)}. <button type="button" class="link-btn" data-action="codes-reset" data-path="${esc(productScopePath(path))}">Use the same here</button>`
          : `Same as the ${esc(parentName)} group. ${onlyRoot}`,
        error: p.isModifierCodeRequired && codes.every(([v]) => hiddenCodesAt(path).includes(v)) ? 'A code is required, so keep at least one visible' : '',
      });
    return html;
  }

  function productTab(tab, p, path) {
    const pb = productBind(p);

    if (tab === 'general') {
      let html = placementSection(path) + section(
        '',
        nameBlock('product', p, { error: lengthError(p.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
          (p.ptype === 'linked'
            ? field(
                'Rings up as',
                `<div class="input is-readonly">${esc(p.posParentExt ? `${posLabel(p.posParentExt)} · ${p.posParentExt}` : 'Not chosen yet')}<span class="link-btns"><button type="button" class="link-btn" data-action="change-parent" data-path="${esc(path)}">${p.posParentExt ? 'Change' : 'Choose'}</button>${p.posParentExt ? `<button type="button" class="link-btn" data-action="unlink-parent">Unlink</button>` : ''}</span></div>`,
                {
                  help: p.posParentExt
                    ? 'The POS product this custom product rings up as, at its POS price.'
                    : 'Choose a POS product so customers can order this custom product.',
                  error: p.posParentExt ? '' : 'Choose what it rings up as',
                },
              )
            : '') +
          field('Internal name', inputText(pb('internalName'), p.internalName, { id: 'p-int' }), {
            id: 'p-int',
            error: lengthError(p.internalName),
            help: 'Use it to tell apart products with the same name. Only your team sees it.',
          }) +
          descriptionField(pb('description'), p.description, 'p-desc', PRODUCT_SHOWN) +
          imageField(pb('image'), p.image, { help: PRODUCT_SHOWN, posSrc: posItemImage(p) }),
      );
      return html + priceSection(path);
    }

    if (tab === 'choices') return choicesSection(p, path);

    if (tab === 'ordering') {
      if (p.ptype === 'container')
        return sectionsSection(p) || section('Group sections', '<p class="field-help">Add a group to this option folder first. Its groups can then go under headings.</p>');
      return (
        quantitySection(p) +
        modifierCodesSection(p) +
        (p.ptype === 'linked' ? linkedGroupsSection(p, path) : '') +
        sectionsSection(p) +
        includedSection(p) +
        substitutesSection(p) +
        halfWholeSection(p) +
        upsellSection(p) +
        crossSellSection(p)
      );
    }

    if (tab === 'dietary') {
      const nut = p.nutrition || {};
      const lowerAllergens = (list) => listJoin(list.map((a) => allergenLabel(a).toLowerCase()));
      const choiceAllergens = p.ptype === 'size' ? choiceAllergensMissing(p) : [];
      const allergens = section(
        'Allergens',
        chips(pb('allergens'), p.allergens, C.allergens.map((a) => [a, allergenLabel(a)])) +
          (choiceAllergens.length
            ? `<div class="suggest-row"><span class="field-help">Choices contain ${esc(lowerAllergens(choiceAllergens))}.</span>
                <button type="button" class="btn secondary sm" data-action="add-choice-allergens">Add to ${esc(nameOf('product', p))}</button></div>`
            : ''),
        { desc: p.allergens.length ? `Contains ${esc(lowerAllergens(p.allergens))}.` : 'Listed in the product details in Web App and Kiosk, and sent to delivery partners.' },
      );
      return (
        (p.ptype === 'size' ? callout('info', `Customers see these on ${esc(nameOf('product', p))} before they pick a choice. Each choice keeps its own. Set nutrition facts on each choice.`) : '') +
        section('Food type', segmented(pb('foodType'), p.foodType || '', [['', 'None'], ...C.foodTypes.slice().reverse()]), {
          desc: 'Customers see it as a tag on the product. Also sent to delivery partners.',
        }) +
        allergens +
        section(
          'Portion',
          field('Calories', range(pb('caloriesFrom'), p.caloriesFrom, pb('caloriesTo'), p.caloriesTo, 'Cal', 'p-cal'), {
            id: 'p-cal',
            error: rangeError(p.caloriesFrom, p.caloriesTo),
          }) +
            field('Serves', range(pb('servingFrom'), p.servingFrom, pb('servingTo'), p.servingTo, 'people', 'p-serv'), {
              id: 'p-serv',
              error: rangeError(p.servingFrom, p.servingTo, 1),
              help: 'Shown only for catering orders in Web App.',
            }),
        ) +
        section(
          'Alcohol',
          toggle(pb('isAlcoholic'), p.isAlcoholic, { label: 'Contains alcohol', help: 'Customers see an Alcohol tag on the product. Also sent to delivery partners.' }) +
            (p.isAlcoholic
              ? field('Alcohol by volume', inputNum(pb('alcoholVol'), p.alcoholVol, { suffix: '%', id: 'p-abv' }), {
                  id: 'p-abv',
                  help: 'From 0 to 100%.',
                })
              : ''),
        ) +
        (p.ptype === 'size'
          ? ''
          : section(
          'Nutrition facts',
          toggle(pb('nutrition.active'), nut.active, {
            label: 'Nutrition facts',
            help: 'Per serving. Customers see them in the product details in Web App. Kiosk and delivery partners don’t show them.',
          }) +
            (nut.active
              ? `<div class="grid-2">${[
                  ['protein', 'Protein'],
                  ['carbs', 'Carbohydrates'],
                  ['fat', 'Fat'],
                  ['sugar', 'Sugar'],
                  ['fiber', 'Fiber'],
                ]
                  .map(([k, l]) => field(l, inputNum(pb(`nutrition.${k}`), nut[k], { suffix: 'g', id: `p-n-${k}`, int: true }), { id: `p-n-${k}` }))
                  .join('')}</div>`
              : ''),
        ))
      );
    }

    if (tab === 'availability') return productAvailabilitySection(p) + segmentsSection(pb('segments'), p.segments, 'product') + productStoresSection(p) + appearsInSection(p, path);

    return (
      sourceSection('product', p, path) +
      section(
        'Identifiers',
        field('External ID', inputText(pb('reportingId'), p.reportingId, { id: 'p-ext', mono: true }), {
          id: 'p-ext',
          error: lengthError(p.reportingId),
          help: 'Use it to match this product in reports outside this platform.',
        }),
      ) +
      metadataSection(p) +
      (p.ptype === 'size' ? '' : prepSection(p)) +
      removeSection(path, 'product', p) +
      productDeleteSection(p)
    );
  }

  function productDeleteSection(p) {
    const block = productDeleteBlock(p);
    const places = productParents(p);
    const kids = p.ptype === 'size' ? ' Its choices are not deleted' : p.children.length ? ' Its groups are not deleted' : '';
    const pos = p.source === 'pos' ? ' Nothing changes on POS.' : '';
    const where = places.length === 1 ? `Removes it from ${nameOf(places[0].kind, places[0].ent)}.` : places.length ? `Removes it from all ${places.length} places it appears in.` : 'Deletes it from this brand.';
    const help = block || `${where}${kids ? `${kids}.` : ''}${pos}`;
    return section(
      '',
      `<button type="button" class="btn secondary tone-danger" data-action="prod-delete" data-id="${p.id}" ${block ? 'disabled' : ''}>${icon('trash', 15)}Delete product</button>
      <p class="field-help">${esc(help)}</p>`,
    );
  }

  function productAvailabilitySection(p) {
    const pb = productBind(p);
    const a = p.availability;
    const menu = activeMenu();
    const e = availabilityErrors(a);
    const dt = (f, id, opts = {}) =>
      field(
        opts.label,
        `<input type="datetime-local" id="${id}" class="input tnum" data-bind="${esc(pb(`availability.${f}`))}" data-type="text" data-focus-key="${esc(pb(`availability.${f}`))}" value="${esc(getBind(pb(`availability.${f}`)) || '')}">`,
        { id, error: opts.error || '', help: opts.help || '' },
      );
    let body = toggle(pb('availability.active'), a.active, {
      label: 'Custom availability',
      action: 'avail-toggle',
      help: a.active ? 'Applies in every menu, within each menu’s serving times.' : `Same as ${esc(menu.name)}: ${esc(menuScheduleSummary(menu).replace(/^During/, 'during'))}`,
    });
    if (a.active) {
      body += field(
        'Available as',
        segmented(pb('availability.mode'), a.mode, [
          ['serving', 'Serving times'],
          ['lto', 'Limited-time offer'],
          ['preorder', 'Preorder'],
        ]),
        {
          help: {
            serving: 'Customers can order it only during these times. Web App shows it as unavailable outside them. Delivery partners get the same times.',
            lto: 'Customers see it in Web App only between the start and end. Delivery partners get the same dates.',
            preorder: 'Customers see it in Web App while preorders are open, and pick it up in the pickup window. Delivery partners get only the pickup window. Not shown for Dine-in (FS) orders.',
          }[a.mode],
        },
      );
      if (a.mode === 'serving') {
        const problems = a.slots.length ? scheduleProblems(a.slots).filter((t) => !t.startsWith('Choose')) : [e.slots];
        body += scheduleEditor(pb('availability.slots'), a.slots) + problems.map(slotError).join('');
      } else if (a.mode === 'lto') {
        body +=
          dt('lto.from', 'p-lto-from', { label: 'Start', help: a.lto.from ? fmtDateTime(a.lto.from) : 'Required.' }) +
          dt('lto.to', 'p-lto-to', { label: 'End', error: e.ltoTo, help: a.lto.to ? fmtDateTime(a.lto.to) : 'Optional. Leave empty to keep it on sale.' });
      } else {
        const pre = a.preorder;
        body +=
          `<p class="field-label sub-head">Preorders</p>` +
          dt('preorder.from', 'p-pre-from', { label: 'Open', help: pre.from ? fmtDateTime(pre.from) : 'Required.' }) +
          dt('preorder.to', 'p-pre-to', { label: 'Close', error: e.preTo, help: pre.to ? fmtDateTime(pre.to) : 'Optional.' }) +
          `<p class="field-label sub-head">Pickup</p>` +
          dt('preorder.pickupFrom', 'p-pick-from', {
            label: 'From',
            error: pre.pickupFrom ? e.pickFrom : '',
            help: pre.pickupFrom ? fmtDateTime(pre.pickupFrom) : 'Required. At least 24 hours after preorders open.',
          }) +
          dt('preorder.pickupTo', 'p-pick-to', { label: 'Until', error: e.pickTo, help: pre.pickupTo ? fmtDateTime(pre.pickupTo) : 'Optional.' });
      }
    }
    return section('Schedule', body);
  }

  const PRODUCT_STORE_ROWS = 10;

  function productStoreRow(p, s) {
    const bind = (f) => `e|product|${p.id}|stores.${s.id}.${f}`;
    const brink = hasPosStock(s.id);
    const posOut = !!productPosStockAt(p, s.id);
    const locked = shownLockedAt(p, s.id);
    const shown = productShownAt(p, s.id);
    const pick = (f, label, value, options, disabled = false) =>
      `<div class="stock-field"><label for="st-${s.id}-${f}">${label}</label>${selectInput(bind(f), value, options, { id: `st-${s.id}-${f}`, disabled })}</div>`;
    const note = posOut
      ? 'Out of stock on POS, so customers cannot order it online either.'
      : locked
        ? 'Out of stock indefinitely at a PAR Brink store, so it stays hidden until it is back in stock.'
        : '';
    return `<div class="stock-row${shown ? '' : ' is-muted'}">
        <div class="stock-row-head">
          <span class="store-name list-name"><span class="stock-row-name">${esc(s.name)}</span><span class="muted">${esc(s.city)}${brink ? ' · PAR Brink' : ''}</span></span>
          <button type="button" class="switch" role="switch" aria-checked="${shown}" aria-label="Show at ${esc(s.name)}" data-action="prod-store-toggle" data-id="${s.id}" data-on="${productHiddenAt(p, s.id) ? 1 : 0}" ${locked ? 'disabled' : ''}><span class="switch-thumb"></span></button>
        </div>
        ${pick('stock', 'Stock for online ordering', productStockAt(p, s.id), STOCK_OPTIONS, posOut)}
        ${brink ? pick('posStock', 'Stock on POS', productPosStockAt(p, s.id), POS_STOCK_OPTIONS) : ''}
        ${note ? `<p class="field-help">${note}</p>` : ''}
      </div>`;
  }

  function productStoresSection(p) {
    const all = productStores(p);
    if (!all.length) return section('Stores', '<p class="store-summary">No stores yet</p><p class="field-help">Add stores to its menus on each menu’s Stores tab.</p>');
    const changed = all.filter((s) => productChangedAt(p, s.id));
    const out = changed.filter((s) => productOutAt(p, s.id)).length;
    const hidden = changed.filter((s) => !productShownAt(p, s.id)).length;
    const summary = [
      `Available at ${all.length - changed.length} of ${plural(all.length, 'store', 'stores')}`,
      out ? `Out of stock at ${plural(out, 'store', 'stores')}` : '',
      hidden ? `Hidden at ${plural(hidden, 'store', 'stores')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const row = (s) => productStoreRow(p, s);
    const table = (rows) => `<div class="store-list"><div class="stock-head"><span>Store</span><span>Shown</span></div>${rows}</div>`;
    const q = T.storeQuery.trim();
    const results = matchStores(all);
    return section(
      'Stores',
      `<p class="store-summary tnum">${esc(summary)}</p>
      ${
        changed.length
          ? `${table(changed.slice(0, PRODUCT_STORE_ROWS).map(row).join(''))}
            ${changed.length > PRODUCT_STORE_ROWS ? `<p class="field-help">Showing ${PRODUCT_STORE_ROWS} of ${changed.length} stores. Search for a store to see the rest.</p>` : ''}`
          : ''
      }
      ${field('Find a store', storeSearch('prod-store-q', 'Search by store or city'))}
      ${
        !q
          ? ''
          : results.length
            ? `${table(results.slice(0, STORE_RESULTS).map(row).join(''))}${results.length > STORE_RESULTS ? `<p class="field-help">Showing ${STORE_RESULTS} of ${results.length} stores. Keep typing to narrow it down.</p>` : ''}`
            : '<p class="field-help">No stores match. Check the spelling.</p>'
      }
      <p class="field-help">Out of stock for a set time: Web App shows it as out of stock. Out of stock indefinitely or on POS: Web App hides it. Hidden: customers do not see it in categories, but it still works as an upsell and option.</p>`,
      { desc: 'Applies in every menu. Lists only stores of menus that have the product.' },
    );
  }

  function menuCategoryPlaces() {
    const out = new Map();
    S.data.menus.forEach((m) =>
      m.children.forEach((cid) => {
        const cat = entity('category', cid);
        if (!cat) return;
        const x = out.get(cid) || { kind: 'category', id: cid, ent: cat, path: childPath(m.id, 'category', cid), where: [] };
        x.where.push(m.name);
        out.set(cid, x);
      }),
    );
    return [...out.values()];
  }

  const menuGroupPlaces = () => menuHolderPlaces((kind) => kind === 'group');
  const menuChoicePlaces = () => menuHolderPlaces((kind, ent) => kind === 'product' && ent.ptype === 'size');

  function menuHolderPlaces(match) {
    const out = new Map();
    S.data.menus.forEach((m) =>
      walkMenu(m, (kind, id, ent, path) => {
        if (!match(kind, ent)) return;
        const owner = parsePath(parsePath(path).parentPath);
        const ownerName = nameOf(owner.kind, entity(owner.kind, owner.id));
        const x = out.get(id) || { kind, id, ent, path, where: [] };
        if (!x.where.includes(ownerName)) x.where.push(ownerName);
        out.set(id, x);
      }),
    );
    return [...out.values()];
  }

  function appearsInSection(p, path) {
    const d = dragDescFromPath(path);
    const on = (x) => x.ent.children.includes(p.id);
    const canHold = (x) => on(x) || (!(x.kind === 'group' && reaches('product', p.id, 'group', x.id)) && !dropError(x.path, d));
    const places = [...(p.ptype === 'container' ? [] : menuCategoryPlaces()), ...(p.ptype === 'size' ? [] : menuGroupPlaces()), ...menuChoicePlaces().filter(on)].filter(canHold);
    const long = places.length > 6;
    const q = T.placeQuery.trim().toLowerCase();
    const shown = places
      .filter((x) => (!long || !T.showSelectedPlaces || on(x)) && (!long || !q || nameOf(x.kind, x.ent).toLowerCase().includes(q)))
      .sort((a, b) => on(b) - on(a));
    const count = places.filter(on).length;
    const total = [...Object.values(S.data.entities.category), ...Object.values(S.data.entities.group), ...Object.values(S.data.entities.product).filter((x) => x.ptype === 'size')].filter((x) =>
      x.children.includes(p.id),
    ).length;
    const row = (x) => {
      const sel = on(x);
      const last = sel && total === 1;
      return `<button type="button" class="store-row store-check" data-action="place-toggle" data-kind="${x.kind}" data-id="${esc(x.id)}" aria-pressed="${sel}" ${last ? 'disabled title="A product needs at least one place. To take it out everywhere, delete it on the Advanced tab."' : ''}>
        <span class="check${sel ? ' is-on' : ''}" aria-hidden="true">${sel ? icon('check', 12) : ''}</span>
        <span class="store-name list-name"><span>${esc(nameOf(x.kind, x.ent))}</span><span class="muted">${{ category: 'Category', group: 'Group', product: 'Choice product' }[x.kind]} in ${esc(listJoin(x.where))}</span></span></button>`;
    };
    const tools = long
      ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search places</span><input id="place-q" type="search" data-place-search data-focus-key="place-q" placeholder="Search ${places.length} places" value="${esc(T.placeQuery)}" autocomplete="off"></label>
        <div class="group-card-tools"><span class="store-summary tnum">In ${count} of ${places.length} places</span>
          <button type="button" class="check-toggle" role="checkbox" aria-checked="${T.showSelectedPlaces}" data-action="place-only-selected"><span class="check${T.showSelectedPlaces ? ' is-on' : ''}" aria-hidden="true">${T.showSelectedPlaces ? icon('check', 12) : ''}</span>Show only selected</button></div>`
      : '';
    const list = shown.length ? `<div class="store-list">${shown.map(row).join('')}</div>` : '<p class="field-help">Nothing matches. Check the spelling.</p>';
    const kinds = p.ptype === 'container' ? 'groups' : p.ptype === 'size' ? 'categories' : 'categories and groups';
    return section('Appears in', tools + list, {
      desc: `Lists the ${kinds} that can hold this product. Selecting one adds the product at the end.`,
    });
  }

  const tagError = (t) => lengthError(t.key) || t.values.map((v) => lengthError(v)).find(Boolean) || '';
  const tagTooLong = (t) => !!tagError(t);

  function metadataSection(p, kind = 'product') {
    const base = `e|${kind}|${p.id}|metadata`;
    const all = [...Object.values(S.data.entities.product), ...Object.values(S.data.entities.group)].flatMap((x) => x.metadata || []);
    const keys = [...new Set([...C.tags.map((t) => t.key), ...all.map((t) => t.key)])].sort((a, b) => a.localeCompare(b));
    const draft = T.tagDraft && T.tagDraft.base === base ? T.tagDraft : null;
    const editing = !!draft && draft.index != null;
    const draftKey = draft ? tagName(draft.key) : '';
    const draftValues = draft ? tagValuesOf(draft.values) : [];
    const known = draftKey
      ? [...new Set([...C.tags.filter((t) => t.key === draftKey).flatMap((t) => t.values), ...all.filter((t) => t.key === draftKey).flatMap((t) => t.values)])].filter((v) => !draftValues.includes(v))
      : [];
    const taken = !!draft && !editing && !!draftKey && p.metadata.some((t) => t.key === draftKey);
    const form = draft
      ? `<div class="segment-draft${taken ? ' has-error' : ''}">
          <label class="field-label" for="tag-draft-key">Key</label>
          <input id="tag-draft-key" type="text" class="input mono" list="tag-keys" data-tag-draft="key" data-focus-key="tag-draft-key" value="${esc(draft.key)}" autocomplete="off" spellcheck="false" ${editing ? 'disabled' : ''}>
          ${taken ? slotError('This key is already added. Edit it to add values') : ''}
          <label class="field-label" for="tag-draft-values">Values</label>
          <input id="tag-draft-values" type="text" class="input" data-tag-draft="values" data-focus-key="tag-draft-values" value="${esc(draft.values)}" autocomplete="off" spellcheck="false">
          <p class="field-help">Separate values with commas. Keys and values are saved in lowercase, with hyphens for spaces.</p>
          ${known.length ? `<div class="chips">${known.slice(0, 12).map((v) => `<button type="button" class="chip" data-action="tag-suggest" data-value="${esc(v)}">${icon('plus', 12)}${esc(v)}</button>`).join('')}</div>` : ''}
          <div class="segment-draft-actions">
            <button type="button" class="btn ghost sm" data-action="tag-cancel">Cancel</button>
            <button type="button" class="btn primary sm" data-action="tag-save" ${draftKey && draftValues.length && !taken ? '' : 'disabled'}>${editing ? 'Save tag' : 'Add tag'}</button>
          </div>
        </div>`
      : '';
    const rows = p.metadata
      .map((t, i) => {
        if (editing && draft.index === i) return form;
        const err = tagError(t);
        const chipsHtml = t.values
          .map((v, j) =>
            t.values.length > 1
              ? `<button type="button" class="chip is-on has-remove" data-action="arr-remove" data-bind="${esc(`${base}.${i}.values`)}" data-index="${j}" aria-label="Remove ${esc(v)}" title="Remove">${esc(v)}${icon('x', 12)}</button>`
              : `<span class="chip is-on">${esc(v)}</span>`,
          )
          .join('');
        return `<div class="tag-row${err ? ' has-error' : ''}">
          <div class="tag-row-head">
            <span class="tag-key mono">${esc(t.key)}</span>
            <button type="button" class="btn ghost sm" data-action="tag-edit" data-bind="${esc(base)}" data-index="${i}" ${draft ? 'disabled' : ''}>Edit</button>
            ${removeButton(base, i, t.key)}
          </div>
          <div class="chips">${chipsHtml}</div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    const example = kind === 'product' ? 'foodlabelingtags' : 'selections';
    return section(
      'Metadata tags',
      `<datalist id="tag-keys">${keys.map((k) => `<option value="${esc(k)}"></option>`).join('')}</datalist>
       ${rows ? `<div class="segment-list">${rows}</div>` : ''}${editing ? '' : form || addButton('tag-add', 'Add tag', `data-bind="${esc(base)}"`)}`,
      { desc: `Extra details sent to delivery partners with the menu. Today only ezCater reads them, for keys like ${example}. Customers do not see them.` },
    );
  }

  function prepSection(p) {
    const pb = productBind(p);
    const pr = p.prep;
    const e = prepErrors(pr);
    const units = [['', 'Unit'], ...C.prepUnits.map((u) => [u, u])];
    let body = toggle(pb('prep.active'), pr.active, {
      label: 'Prep info',
      help: 'For catering orders. Prep sheets and the prep list show this station and quantity, scaled to the number ordered.',
    });
    if (pr.active)
      body +=
        field('Prep station', selectInput(pb('prep.station'), pr.station, [['', 'No station'], ...C.prepStations], { id: 'p-prep-st' }), {
          id: 'p-prep-st',
          help: 'The prep list groups products by station. Add stations on the Prep stations page.',
        }) +
        field(
          'Quantity',
          `<div class="qty-unit">${inputNum(pb('prep.qty'), pr.qty, { id: 'p-prep-q', placeholder: 'None' })}${selectInput(pb('prep.unit'), pr.unit, units, { label: 'Unit' })}</div>`,
          { id: 'p-prep-q', error: e.qty || e.unit },
        ) +
        field(
          'Second quantity',
          `<div class="qty-unit">${inputNum(pb('prep.qty2'), pr.qty2, { id: 'p-prep-q2', placeholder: 'None', disabled: !isNum(pr.qty) })}${selectInput(pb('prep.unit2'), pr.unit2, units, { label: 'Second unit', disabled: !isNum(pr.qty) })}</div>`,
          { id: 'p-prep-q2', error: e.qty2 || e.unit2, help: isNum(pr.qty) ? 'For example, 2 ea and 8 oz.' : 'Available after you add a quantity.' },
        ) +
        (e.group ? '<p class="field-help">Add a prep station or a quantity.</p>' : '');
    return section('Prep sheets', body);
  }
