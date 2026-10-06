'use strict';

  function priceSection(path) {
    const st = priceStats(path);
    if (st.kind === 'none') return '';
    if (st.pending) return section('Price', callout('info', 'Prices show up after you publish. They come from POS and can differ by store.'));
    const menu = activeMenu();
    const inGroup = parsePath(parsePath(path).parentPath).kind === 'group';
    const label = { base: 'Customers pay', size: 'Customers pay', modifier: 'Customers pay extra', item: 'Added as its own item', from: 'Customers pay from' }[st.kind];
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
    return `<div class="store-list">${ids
      .map((pid, i) => {
        const x = entity('product', pid);
        if (!x) return '';
        const name = nameOf('product', x);
        return `<div class="store-row list-row">${thumb('product', x, 'thumb-sm')}<span class="store-name">${esc(name)}</span><span class="row-tools">${moveButtons(bind, i, ids.length, name)}${removeButton(bind, i, name)}</span></div>`;
      })
      .join('')}</div>`;
  }

  const addButton = (action, label, attrs = '') => `<button type="button" class="btn ghost sm" data-action="${action}" ${attrs}>${icon('plus', 14)}${esc(label)}</button>`;

  function choicesSection(p, path) {
    const pb = productBind(p);
    const pName = nameOf('product', p);
    const add = addButton('add-choice', 'Add POS product');
    if (!p.children.length)
      return section('Choices', `<div class="empty-small"><strong>No choices yet</strong><span>Add the POS products customers choose between, like Small and Large.</span></div>${add}`);
    const rows = p.children
      .map((pid, i) => {
        const x = entity('product', pid);
        if (!x) return '';
        const op = childPath(path, 'product', pid);
        const hidden = !!placement(op).hidden;
        const name = nameOf('product', x);
        const st = priceStats(op);
        const open = T.openCard === `choice:${pid}`;
        const detail = open
          ? `<div class="opt-detail"><div class="opt-detail-foot">
              <div class="position-control"><span class="tnum">${i + 1} of ${p.children.length}</span>${moveButtons(pb('children'), i, p.children.length, name)}</div>
              <button type="button" class="btn ghost sm tone-danger" data-action="remove" data-path="${esc(op)}">${icon('trash', 14)}Remove from ${esc(pName)}</button>
            </div></div>`
          : '';
        return `<div class="opt-item${open ? ' is-open' : ''}"><div class="opt-row${hidden ? ' is-muted' : ''}">
            <button type="button" class="opt-name" data-action="goto" data-path="${esc(op)}">${thumb('product', x, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label" title="${esc(name)}">${esc(name)}</span></span></button>
            <span class="opt-price tnum${st.missingStores.length ? ' tone-warning' : ''}" title="${esc(st.missingStores.length ? `No POS price at ${plural(st.missingStores.length, 'store', 'stores')}` : st.note)}">${esc(priceText(st))}</span>
            <button type="button" class="switch" role="switch" aria-checked="${!hidden}" aria-label="Show ${esc(name)}" data-toggle="pl|${esc(op)}|hidden" data-focus-key="pl|${esc(op)}|hidden"><span class="switch-thumb"></span></button>
            <button type="button" class="icon-btn sm opt-expand" data-action="card-open" data-id="choice:${esc(pid)}" aria-expanded="${open}" aria-label="Settings for ${esc(name)}" title="Settings">${icon('chevDown', 14)}</button>
          </div>${detail}</div>`;
      })
      .join('');
    return (
      section(
        'Choices',
        `<div class="opt-table has-expand no-pre">
          <div class="opt-head"><span>Choice</span><span>POS price</span><span>Shown</span><span class="sr-only">Settings</span></div>
          ${rows}
        </div>
        <p class="field-help">Customers pick one. Only the product they pick is sent to POS, at its own POS price. Ranges mean the price differs by store. Shown applies only in ${esc(crumbText(path))}.</p>
        ${add}`,
      ) +
      section('Copy details', `<button type="button" class="btn secondary sm" data-action="copy-to-choices">${icon('copy', 14)}Copy details to choices</button>`, {
        desc: 'Copying gives each choice this product’s name, description, and image.',
      })
    );
  }

  function productOptions(p, { modifierOnly = false } = {}) {
    const out = [];
    p.children.forEach((gid) => {
      const g = entity('group', gid);
      if (!g || (modifierOnly && rulesOf(g).type !== 1)) return;
      g.children.forEach((pid) => {
        const x = entity('product', pid);
        if (x && x.ptype !== 'container') out.push({ gid, pid, g, x, key: `${gid}:${pid}` });
      });
    });
    return out;
  }

  function groupCards(p, opts, prefix, summary, rowFn) {
    const byGroup = new Map();
    opts.forEach((o) => byGroup.set(o.gid, [...(byGroup.get(o.gid) || []), o]));
    return [...byGroup.entries()]
      .map(([gid, list]) => {
        const key = `${prefix}:${gid}`;
        const open = T.openCard === key;
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
        ${field('Minimum', inputNum(pb('minQty'), p.minQty, { int: true, id: 'p-min', min: 1, max: QTY_MAX, placeholder: 'No limit' }), { id: 'p-min', error: qtyError(p.minQty) })}
        ${field('Maximum', inputNum(pb('maxQty'), p.maxQty, { int: true, id: 'p-max', min: 1, max: QTY_MAX, placeholder: 'No limit' }), { id: 'p-max', error: maxErr })}
      </div>
      ${
        hasLimit
          ? field('Limits apply to', segmented(pb('qtyScope'), p.qtyScope, [['cart', 'Per order'], ['item', 'Per cart item']]), {
              help: p.qtyScope === 'item' ? 'Each cart item is counted on its own.' : 'All of this product in the cart counts toward the limit.',
            })
          : ''
      }`,
      { desc: 'Limit how many customers can order.' },
    );
  }

  function modifierCodesSection(p) {
    const pb = productBind(p);
    const enabled = C.modifierCodes.filter(([v]) => p.modifierCodes.includes(v));
    return section(
      'Modifier codes',
      field('Codes', chips(pb('modifierCodes'), p.modifierCodes, C.modifierCodes), {
        help: 'Let customers ask for none, less, more, or on the side when this is an option.',
      }) +
        toggle(pb('isModifierCodeRequired'), p.isModifierCodeRequired, {
          label: 'Require a modifier code',
          help: enabled.length ? 'Customers need a code to choose this option. One code is always preselected.' : 'Add a code first.',
          disabled: !enabled.length,
        }) +
        (enabled.length
          ? field('Preselected code', segmented(pb('preselectedCode'), p.preselectedCode || '', p.isModifierCodeRequired ? enabled : [['', 'None'], ...enabled]), {
              help: 'Selected when customers open the product. They can change it.',
            })
          : ''),
    );
  }

  function sectionsSection(p) {
    if (!p.children.length) return '';
    const pb = productBind(p);
    const rows = p.sections
      .map((s, i) => {
        const err = s.name.trim() ? lengthError(s.name) : 'Add a section name';
        const label = s.name.trim() || 'section';
        return `<div class="segment-row${err ? ' has-error' : ''}">
          <div class="list-inputs">${inputText(pb(`sections.${i}.name`), s.name, { label: 'Section name' })}${moveButtons(pb('sections'), i, p.sections.length, label)}${removeButton(pb('sections'), i, label)}</div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    const opts = p.sections.map((s) => [s.id, s.name.trim() || 'Untitled section']);
    const groups = p.sections.length
      ? field(
          'Groups',
          `<div class="store-list is-wide">${p.children
            .map((gid) => {
              const g = entity('group', gid);
              return g ? `<div class="store-row"><span class="store-name">${esc(nameOf('group', g))}</span>${selectInput(pb(`groupSection.${gid}`), sectionOf(p, gid), opts, { label: `Section for ${nameOf('group', g)}` })}</div>` : '';
            })
            .join('')}</div>`,
        )
      : '';
    return section('Group sections', `${rows ? `<div class="segment-list">${rows}</div>` : ''}${addButton('section-add', 'Add section')}${groups}`, {
      desc: p.sections.length ? 'Customers see the groups under these headings, in this order.' : 'Split the groups under headings, like Base and Toppings.',
    });
  }

  function includedSection(p) {
    if (!p.children.length) return section('Included ingredients', '<p class="field-help">Add a group to this product first. Ingredients come from its groups.</p>');
    const pb = productBind(p);
    const rows = p.included
      .map((it, i) => {
        const g = entity('group', it.gid);
        const x = entity('product', it.pid);
        if (!g || !x) return '';
        const name = nameOf('product', x);
        return `<div class="store-row list-row">
          <span class="store-name list-name"><span>${esc(name)}</span><span class="muted">${esc(nameOf('group', g))}</span></span>
          <span class="row-tools">
            <button type="button" class="icon-btn sm${it.locked ? ' is-on' : ''}" data-toggle="${esc(pb(`included.${i}.locked`))}" aria-pressed="${!!it.locked}" aria-label="Lock ${esc(name)}" title="${it.locked ? 'Locked. Customers cannot remove it.' : 'Customers can remove it. Select to lock.'}">${icon(it.locked ? 'lock' : 'unlock', 14)}</button>
            ${moveButtons(pb('included'), i, p.included.length, name)}${removeButton(pb('included'), i, name)}
          </span>
        </div>`;
      })
      .join('');
    const nameErr = p.includedName.trim() ? lengthError(p.includedName) : 'Add a group name';
    return section(
      'Included ingredients',
      (p.included.length
        ? field('Group name', inputText(pb('includedName'), p.includedName, { id: 'p-inc-name' }), { id: 'p-inc-name', error: nameErr, help: 'Customers see this name above the ingredients.' }) +
          `<div class="store-list">${rows}</div>`
        : '') + addButton('add-included', 'Add ingredient'),
      {
        desc: p.included.length
          ? 'Customers see these together at the top of the product. Locked ones cannot be removed.'
          : 'Ingredients that come with the product, like the patty and bun. Customers see them together at the top of the product.',
      },
    );
  }

  function followNote(g, own, { customize, reset, key }) {
    if (own) return `<p class="field-help">Set for this product only. <button type="button" class="link-btn" data-action="${reset}" data-key="${esc(key)}">Use the ${esc(nameOf('group', g))} setting</button></p>`;
    return `<p class="field-help">Follows ${esc(nameOf('group', g))}. <button type="button" class="link-btn" data-action="${customize}" data-key="${esc(key)}">Change for this product</button></p>`;
  }

  function substitutesSection(p) {
    const opts = productOptions(p);
    if (!opts.length) return section('Substitutes', '<p class="field-help">Add a group with options to this product first.</p>');
    const pb = productBind(p);
    const subsOf = (o) => substitutesAt(p, o.gid, o.pid).ids.filter((id) => entity('product', id));
    const cards = groupCards(
      p,
      opts,
      'sub',
      (list) => {
        const n = list.filter((o) => subsOf(o).length).length;
        return n ? `${n} of ${list.length} with substitutes` : plural(list.length, 'option', 'options');
      },
      (o) => {
        const subs = subsOf(o);
        const { own } = substitutesAt(p, o.gid, o.pid);
        const fromGroup = (o.g.swaps[o.pid] || []).length > 0;
        const locked = fromGroup && !own;
        const chipsHtml = subs
          .map((sid, i) => {
            const n = nameOf('product', entity('product', sid));
            return locked
              ? `<span class="chip is-on">${esc(n)}</span>`
              : `<button type="button" class="chip is-on has-remove" data-action="arr-remove" data-bind="${esc(pb(`substitutes.${o.key}`))}" data-index="${i}" aria-label="Remove ${esc(n)}" title="Remove">${esc(n)}${icon('x', 12)}</button>`;
          })
          .join('');
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(optionName(o.g, o.pid))}</span>
          <div class="chips">${chipsHtml}${locked ? '' : `<button type="button" class="chip" data-action="add-substitute" data-key="${esc(o.key)}">${icon('plus', 12)}Add</button>`}</div>
          ${fromGroup ? followNote(o.g, own, { customize: 'sub-customize', reset: 'sub-reset', key: o.key }) : ''}
        </div>`;
      },
    );
    return section('Substitutes', `<div class="opt-cards">${cards}</div>`, {
      desc: 'Let customers swap an option for another, like fries for a salad. Substitutes set on a group apply here unless you change them for this product.',
    });
  }

  function halfWholeSection(p) {
    const opts = productOptions(p, { modifierOnly: true });
    if (!opts.length) return section('Half and whole', '<p class="field-help">Add a modifier group, like toppings, to this product first.</p>');
    const pb = productBind(p);
    const seen = new Set();
    const pool = productOptions(p).filter((o) => !seen.has(o.pid) && seen.add(o.pid));
    const cards = groupCards(
      p,
      opts,
      'half',
      (list) => {
        const n = list.filter((o) => halvesAt(p, o.gid, o.pid).h.left && halvesAt(p, o.gid, o.pid).h.right).length;
        return n ? `${n} of ${list.length} with halves` : plural(list.length, 'option', 'options');
      },
      (o) => {
        const { h, own } = halvesAt(p, o.gid, o.pid);
        const name = optionName(o.g, o.pid);
        const fromGroup = halvesSupported(o.g) && !!o.g.halves[o.pid];
        const locked = fromGroup && !own;
        const choices = [['', 'Not added'], ...pool.filter((c) => c.pid !== o.pid).map((c) => [c.pid, nameOf('product', c.x)])];
        const pick = (side, label) =>
          locked
            ? field(label, `<div class="input is-readonly">${esc(h[side] ? nameOf('product', entity('product', h[side])) : 'Not added')}</div>`)
            : field(label, selectInput(pb(`halfWhole.${o.key}.${side}`), h[side] || '', choices, { label: `${label} of ${name}` }));
        return `<div class="opt-sub-row">
          <span class="opt-sub-name">${esc(name)}</span>
          <div class="grid-2">${pick('left', 'Left half')}${pick('right', 'Right half')}</div>
          ${!locked && !h.left !== !h.right ? slotError('Add both halves, or remove both') : ''}
          ${fromGroup ? followNote(o.g, own, { customize: 'half-customize', reset: 'half-reset', key: o.key }) : ''}
        </div>`;
      },
    );
    return section('Half and whole', `<div class="opt-cards">${cards}</div>`, {
      desc: 'Let customers put a topping on the left half, the right half, or the whole product. Halves set on a POS group apply here unless you change them for this product.',
    });
  }

  function upsellSection(p) {
    const pb = productBind(p);
    const titleErr = p.upsell.products.length && !p.upsell.title.trim() ? 'Add a title' : lengthError(p.upsell.title);
    return section(
      'Upsell',
      field('Title', inputText(pb('upsell.title'), p.upsell.title, { id: 'p-upsell-title', placeholder: 'Make it a combo?' }), {
        id: 'p-upsell-title',
        error: titleErr,
        help: 'Customers see it above the products.',
      }) +
        productList(pb('upsell.products'), p.upsell.products, 'No products yet.') +
        addButton('pick-products', 'Add products', `data-bind="${esc(pb('upsell.products'))}" data-title="Add upsell products"`),
      { desc: 'Offer these products, like a combo, after customers add this one.' },
    );
  }

  function crossSellSection(p) {
    const pb = productBind(p);
    return section(
      'Cross-sell',
      productList(pb('crossSell'), p.crossSell, 'No products yet.') + addButton('pick-products', 'Add products', `data-bind="${esc(pb('crossSell'))}" data-title="Add cross-sell products"`),
      { desc: 'Suggest extra products when customers add this one. Applies in every menu.' },
    );
  }

  function linkedGroupsSection(p, path) {
    const allowed = allowedPosGroupsFor(path);
    const missing = allowed.filter((gid) => !p.children.some((c) => posIdOf('group', entity('group', c)) === gid));
    if (!p.posParentExt) return section('Groups', '<p class="field-help">Choose what this custom version rings up as first. Its groups come from that POS product.</p>');
    return section(
      'Groups',
      missing.length
        ? `<p class="field-help">${p.children.length ? `${plural(missing.length, 'group', 'groups')} from ${esc(posLabel(p.posParentExt))} ${missing.length === 1 ? 'is' : 'are'} not added: ${esc(listJoin(missing.map(posLabel)))}.` : `Add the groups of ${esc(posLabel(p.posParentExt))}, or pick only the ones you need with the add button on this product.`}</p>
           <button type="button" class="btn secondary sm" data-action="parent-groups" data-path="${esc(path)}">${icon('plus', 14)}Add all groups</button>`
        : `<p class="field-help">All groups from ${esc(posLabel(p.posParentExt))} are added. Set preselected options in each group.</p>`,
    );
  }

  function productTab(tab, p, path) {
    const pb = productBind(p);
    const info = parsePath(path);
    const parent = parsePath(info.parentPath);
    const parentEnt = entity(parent.kind, parent.id);
    const parentName = nameOf(parent.kind, parentEnt);
    const inGroup = parent.kind === 'group';
    const pl = placement(path);
    const here = crumbText(path);

    if (tab === 'general') {
      let html = section(
        '',
        nameBlock('product', p, { error: lengthError(p.name, 'Add a name'), help: 'Customers see this name in the apps.' }) +
          (p.ptype === 'linked'
            ? field(
                'Rings up as',
                `<div class="input is-readonly">${esc(p.posParentExt ? `${posLabel(p.posParentExt)} · ${p.posParentExt}` : 'Not chosen yet')}<span class="link-btns"><button type="button" class="link-btn" data-action="change-parent" data-path="${esc(path)}">${p.posParentExt ? 'Change' : 'Choose'}</button>${p.posParentExt ? `<button type="button" class="link-btn" data-action="unlink-parent">Unlink</button>` : ''}</span></div>`,
                {
                  help: p.posParentExt
                    ? 'The POS product this custom version rings up as, at its POS price.'
                    : 'Choose a POS product so customers can order this custom version.',
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
      return html + (p.ptype === 'container' ? '' : priceSection(path));
    }

    if (tab === 'choices') return choicesSection(p, path);

    if (tab === 'ordering') {
      let html = '';
      if (inGroup && p.ptype !== 'container') {
        const auto = isAutoAdded(path);
        const groupHidden = groupHiddenCodes(parentEnt, p.id);
        const enabled = C.modifierCodes.filter(([v]) => p.modifierCodes.includes(v) && !groupHidden.includes(v));
        const pr = rulesOf(parentEnt);
        const groupPre = parentEnt.preselected[p.id] || 0;
        const overridden = preselectOverridden(path);
        const optMax = optionMaxOf(parentEnt, p.id, pr);
        let preField;
        if (auto) preField = field('Preselected', stepper(`pl|${path}|preselected`, 1, { label: 'preselected quantity', disabled: true }), { pos: true, help: 'POS adds this option automatically, so it’s always preselected.' });
        else if (pr.type !== 1) {
          const rule = pr.type === 2 ? 'Size groups preselect one option' : 'Combo groups preselect one option at most';
          preField = field('Preselected', `<p class="field-help">${groupPre ? 'Yes' : 'No'}. ${rule} everywhere they are used. Choose it on the Options tab of ${esc(parentName)}.</p>`);
        }
        else
          preField = field('Preselected', stepper(`pl|${path}|preselected`, preselectedAt(path), { max: optMax, label: 'preselected quantity', keepZero: true, start: groupPre }), {
            scope: here,
            help: overridden
              ? `${esc(parentName)} preselects ${groupPre} in other places. <button type="button" class="link-btn" data-action="pre-reset" data-path="${esc(path)}">Use the same here</button>`
              : `Follows ${esc(parentName)}. A change here applies only to this place.`,
          });
        html += section(
          `In ${parentName}`,
          preField +
            field('Name in this group', inputText(`e|group|${parentEnt.id}|optionSettings.${p.id}.name`, (parentEnt.optionSettings[p.id] || {}).name, { id: 'p-grp-name', placeholder: nameOf('product', p) }), {
              id: 'p-grp-name',
              error: lengthError((parentEnt.optionSettings[p.id] || {}).name),
              help: `Customers see this name in ${esc(parentName)}, everywhere it’s used. Leave it empty to use the product name.`,
            }) +
            (enabled.length
              ? field('Modifier codes shown', chips(`pl|${path}|hiddenCodes`, pl.hiddenCodes || [], enabled, { invert: true }), {
                  scope: here,
                  help: groupHidden.length ? `Hidden in ${esc(parentName)} everywhere: ${esc(listJoin(groupHidden.map((c) => (C.modifierCodes.find((x) => x[0] === c) || [c, c])[1])))}.` : '',
                  error:
                    p.isModifierCodeRequired && p.modifierCodes.every((c) => hiddenCodesAt(path).includes(c))
                      ? 'A code is required, so keep at least one visible'
                      : '',
                })
              : groupHidden.length && p.modifierCodes.length
                ? field('Modifier codes shown', `<p class="field-help">None. All codes are hidden in ${esc(parentName)}.</p>`)
                : ''),
        );
      }
      html += quantitySection(p);
      if (p.ptype === 'size') return html;
      if (p.ptype !== 'container') html += modifierCodesSection(p);
      if (p.ptype === 'linked') html += linkedGroupsSection(p, path);
      html += sectionsSection(p);
      if (p.ptype === 'container') return html;
      return html + includedSection(p) + substitutesSection(p) + halfWholeSection(p) + upsellSection(p) + crossSellSection(p);
    }

    if (tab === 'dietary') {
      const q = T.allergenQuery.trim().toLowerCase();
      const allergenOpts = C.allergens.map((a) => [a, allergenLabel(a)]).filter(([, l]) => !q || l.toLowerCase().includes(q));
      const nut = p.nutrition || {};
      const allergens =
        p.ptype === 'container'
          ? ''
          : section(
          'Allergens',
          `<div class="allergen-head">
            <label class="search-field sm">${icon('search', 14)}<span class="sr-only">Filter allergens</span>
              <input id="allergen-filter" type="search" data-focus-key="allergen-filter" placeholder="Filter ${C.allergens.length} allergens" value="${esc(T.allergenQuery)}" autocomplete="off"></label>
            <span class="count tnum">${p.allergens.length} selected</span>
          </div>
          ${allergenOpts.length ? chips(pb('allergens'), p.allergens, allergenOpts) : '<p class="field-help">No allergens match. Check the spelling.</p>'}`,
          { desc: p.allergens.length ? `Contains ${esc(listJoin(p.allergens.map((a) => allergenLabel(a).toLowerCase())))}.` : 'Shown to customers on the product and in the cart.' },
        );
      return (
        section('Food type', segmented(pb('foodType'), p.foodType || '', [['', 'None'], ...C.foodTypes.slice().reverse()]), {
          desc: 'Shown to customers as a badge on the product.',
        }) +
        allergens +
        section(
          'Portion',
          field('Calories', range(pb('caloriesFrom'), p.caloriesFrom, pb('caloriesTo'), p.caloriesTo, 'Cal', 'p-cal'), {
            id: 'p-cal',
            error: rangeError(p.caloriesFrom, p.caloriesTo),
            help: 'Leave the second value empty for a single value.',
          }) +
            field('Serves', range(pb('servingFrom'), p.servingFrom, pb('servingTo'), p.servingTo, 'people', 'p-serv', { min: 1 }), {
              id: 'p-serv',
              error: rangeError(p.servingFrom, p.servingTo, 1),
            }),
        ) +
        section(
          'Alcohol',
          toggle(pb('isAlcoholic'), p.isAlcoholic, { label: 'Contains alcohol', help: 'Customers see an Alcohol tag on the product.' }) +
            (p.isAlcoholic
              ? field('Alcohol by volume', inputNum(pb('alcoholVol'), p.alcoholVol, { suffix: '%', id: 'p-abv', max: 100 }), {
                  id: 'p-abv',
                  help: 'From 0 to 100%.',
                })
              : ''),
        ) +
        section(
          'Nutrition facts',
          toggle(pb('nutrition.active'), nut.active, { label: 'Nutrition facts', help: 'Show macronutrients per serving.' }) +
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
        )
      );
    }

    if (tab === 'availability') {
      return (
        section(
          `In ${parentName}`,
          positionField(path) +
          toggle(`pl|${path}|hidden`, !pl.hidden, {
            label: `Show in ${parentName}`,
            scope: here,
            help: 'Hide it here without removing it. Other places stay as they are.',
          }),
        ) +
        productAvailabilitySection(p) +
        section('Stores', storesList('product', p, STORE_STATES_PRODUCT, { activeLabel: 'Available', wide: true }), {
          desc: 'Status at each store, in every menu. Hidden products still work as upsells and options. Out of stock indefinitely also hides the product.',
        }) +
        appearsInSection(p, path)
      );
    }

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
      segmentsSection(pb('segments'), p.segments, 'product') +
      metadataSection(p) +
      prepSection(p) +
      removeSection(path, 'product', p)
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
      help: a.active ? 'Applies in every menu, within each menu’s serving times.' : `Follows ${esc(menu.name)}: ${esc(menuScheduleSummary(menu).replace(/^During/, 'during'))}`,
    });
    if (a.active) {
      body += field(
        'Available as',
        segmented(pb('availability.mode'), a.mode, [
          ['serving', 'Serving times'],
          ['lto', 'Limited-time offer'],
          ['preorder', 'Preorder'],
        ]),
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
      return `<button type="button" class="store-row store-check" data-action="place-toggle" data-kind="${x.kind}" data-id="${esc(x.id)}" aria-pressed="${sel}" ${last ? 'disabled title="A product needs at least one place. To take it out everywhere, remove it on the Advanced tab."' : ''}>
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

  function metadataSection(p, kind = 'product') {
    const base = `e|${kind}|${p.id}|metadata`;
    const all = [...Object.values(S.data.entities.product), ...Object.values(S.data.entities.group)].flatMap((x) => x.metadata || []);
    const keys = [...new Set([...C.tags.map((t) => t.key), ...all.map((t) => t.key).filter(Boolean)])];
    const draft = T.tagDraft && T.tagDraft.base === base ? T.tagDraft : null;
    const draftKey = draft ? draft.key.trim() : '';
    const values = [
      ...new Set([
        ...C.tags.filter((t) => t.key.toLowerCase() === draftKey.toLowerCase()).flatMap((t) => t.values),
        ...all.filter((t) => t.key.toLowerCase() === draftKey.toLowerCase() && t.value).map((t) => t.value),
      ]),
    ];
    const rows = p.metadata
      .map((t, i) => {
        const err = !t.key.trim() || !t.value.trim() ? 'Add a key and a value' : lengthError(t.key) || lengthError(t.value);
        return `<div class="segment-row${err ? ' has-error' : ''}">
          <div class="segment-inputs">
            ${inputText(`${base}.${i}.key`, t.key, { label: 'Key', list: 'tag-keys' })}
            ${inputText(`${base}.${i}.value`, t.value, { label: 'Value' })}
            ${removeButton(base, i, `${t.key || 'tag'}`)}
          </div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    const dup = draft && draftKey && draft.value.trim() && p.metadata.some((t) => t.key.trim().toLowerCase() === draftKey.toLowerCase() && t.value.trim().toLowerCase() === draft.value.trim().toLowerCase());
    const form = draft
      ? `<div class="segment-draft${dup ? ' has-error' : ''}">
          <div class="segment-labels"><span class="field-label">Key</span><span class="field-label">Value</span></div>
          <div class="segment-inputs">
            <input type="text" class="input" aria-label="Key" list="tag-keys" data-tag-draft="key" data-focus-key="tag-draft-key" value="${esc(draft.key)}" autocomplete="off">
            <input type="text" class="input" aria-label="Value" list="tag-values" data-tag-draft="value" data-focus-key="tag-draft-value" value="${esc(draft.value)}" autocomplete="off">
            <span aria-hidden="true"></span>
          </div>
          ${dup ? slotError('This tag is already added') : ''}
          <div class="segment-draft-actions">
            <button type="button" class="btn ghost sm" data-action="tag-cancel">Cancel</button>
            <button type="button" class="btn primary sm" data-action="tag-save" ${draftKey && draft.value.trim() && !dup ? '' : 'disabled'}>Add tag</button>
          </div>
        </div>`
      : addButton('tag-add', 'Add tag', `data-bind="${esc(base)}"`);
    return section(
      'Metadata tags',
      `<datalist id="tag-keys">${keys.map((k) => `<option value="${esc(k)}"></option>`).join('')}</datalist>
       <datalist id="tag-values">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>
       ${rows ? `<div class="segment-list">${rows}</div>` : ''}${form}`,
      {
        desc: p.metadata.length
          ? `Integrations read these tags.${kind === 'product' ? ' A Badge tag also shows on the canvas.' : ''}`
          : `Pass extra details to integrations, like ${kind === 'product' ? 'a badge or a spice level' : 'a display style'}.`,
      },
    );
  }

  function prepSection(p) {
    const pb = productBind(p);
    const pr = p.prep;
    const e = prepErrors(pr);
    const units = [['', 'Unit'], ...C.prepUnits.map((u) => [u, u])];
    let body = toggle(pb('prep.active'), pr.active, { label: 'Prep info', help: 'Show where and how much to prepare on kitchen prep sheets.' });
    if (pr.active)
      body +=
        field('Prep station', selectInput(pb('prep.station'), pr.station, [['', 'No station'], ...C.prepStations], { id: 'p-prep-st' }), { id: 'p-prep-st' }) +
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
