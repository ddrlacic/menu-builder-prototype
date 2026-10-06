'use strict';

  function groupTab(tab, g, path) {
    const gb = (f) => `e|group|${g.id}|${f}`;
    const here = crumbText(path);
    const rules = rulesOf(g);
    const fromPos = g.gtype === 'pos';
    if (tab === 'general') {
      const t = C.groupTypes[rules.type];
      let posField = '';
      if (fromPos)
        posField = field('POS group', `<div class="input is-readonly">${esc(posLabel(g.externalId))}</div>`, { pos: true, help: 'Choices ring up on POS as options of this group.' });
      else if (g.gtype === 'linked')
        posField = field(
          'POS group',
          `<div class="input is-readonly">${esc(posLabel(g.posGroupExt))}</div>
          <div class="link-btns field-actions"><button type="button" class="link-btn" data-action="group-change-link">Change</button><button type="button" class="link-btn" data-action="group-unlink">Unlink</button></div>`,
          { help: 'Choices ring up on POS as options of this group, at its POS prices.' },
        );
      else
        posField = field(
          'POS group',
          `<div class="input is-readonly muted">Not linked</div>
          <div class="link-btns field-actions"><button type="button" class="link-btn" data-action="group-link">Link to a POS group</button></div>`,
          { help: 'Each choice is added to the order as its own item. Link a POS group to ring up choices as its options instead.' },
        );
      return (
        section(
          '',
          nameBlock('group', g, { error: lengthError(g.name, 'Add a group name') }) +
            field('Internal name', inputText(gb('internalName'), g.internalName, { id: 'g-int' }), {
              id: 'g-int',
              error: lengthError(g.internalName),
              help: 'Use it to tell apart groups with the same name. Only your team sees it.',
            }) +
            field('Type', `<div class="type-display"><span class="type-tag type-${rules.type}">${t.label}</span><span>${esc(t.help)}</span></div>`, {
              help: fromPos
                ? `${icon('lock', 12)} Set by the POS group.`
                : g.gtype === 'linked'
                  ? `${icon('lock', 12)} Follows the linked POS group.`
                  : `${icon('lock', 12)} Add-on groups are always Modifier groups. Linking a POS group uses its type instead.`,
            }) +
            posField +
            field('External ID', inputText(gb('reportingId'), g.reportingId, { id: 'g-ext', mono: true }), {
              id: 'g-ext',
              error: lengthError(g.reportingId),
              help: 'Use it to match this group in reports outside this platform.',
            }) +
            descriptionField(gb('description'), g.description, 'g-desc', 'Not shown in our ordering apps. Apps built with the Ordering API can show it.') +
            imageField(gb('image'), g.image, { help: 'Not shown in our ordering apps. Apps built with the Ordering API can show it.' }),
        ) +
        (rules.type === 1
          ? section(
              'Behavior',
              toggle(gb('isSubstitutionContainer'), g.isSubstitutionContainer, {
                label: 'Substitution group',
                help: 'Customers do not see this group. Its options can only be offered as substitutes for other options.',
              }),
            )
          : '')
      );
    }
    if (tab === 'options') {
      const gpos = posIdOf('group', g);
      const notShown = gpos
        ? posChildren(gpos).filter((cid) => posItemById(cid) && !g.children.some((pid) => entity('product', pid).externalId === cid))
        : [];
      const missingHtml = notShown.length
        ? section(
            g.gtype === 'pos' ? 'Removed from this group' : `Other options in ${posLabel(gpos)}`,
            `<div class="missing-list">${notShown
              .map(
                (cid) => `<div class="missing-row"><span class="missing-name">${esc(posLabel(cid))}</span><span class="tnum muted">${esc(rangeText(statsOf((s) => posOptionPrice(gpos, cid, null, s)), { plus: true, freeWord: g.gtype !== 'standalone' }))}</span>
                  <button type="button" class="btn ghost sm" data-action="add-option" data-path="${esc(path)}" data-pos-id="${esc(cid)}">${icon('plus', 14)}Add</button></div>`,
              )
              .join('')}</div>`,
            { desc: 'On POS in this group, but not shown to customers.' },
          )
        : '';
      const rulesHtml = groupRulesSection(g, gb, rules);
      if (!g.children.length) {
        const hint =
          g.gtype === 'standalone'
            ? 'Drag any POS product here. Each choice is added to the order as its own item, at its POS price.'
            : `Add options from ${esc(posLabel(gpos))}.`;
        return rulesHtml + section('Options', `<div class="empty-small"><strong>No options yet</strong><span>${hint}</span></div>`) + missingHtml;
      }
      return rulesHtml + groupOptionsSection(g, path, gb, rules) + missingHtml + groupSectionsSection(g, gb);
    }
    if (tab === 'substitutes') return groupSwapsSection(g, gb);
    if (tab === 'halves') return groupHalvesSection(g);
    const pInfo = parsePath(parsePath(path).parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const pl = placement(path);
    const lockHide = rules.min > 0 && !pl.hidden;
    const parents = groupParents(g.id);
    return (
      section(
        `In ${parentName}`,
        positionField(path) +
        toggle(`pl|${path}|hidden`, !pl.hidden, {
          label: `Show in ${parentName}`,
          scope: here,
          disabled: lockHide,
          help: lockHide
            ? rules.fixed
              ? 'Customers always pick one option in this group, so it cannot be hidden.'
              : 'Required groups cannot be hidden. Set the minimum to 0 first.'
            : 'Hide it here without removing it. Other places stay as they are.',
        }),
      ) +
      groupAppearsInSection(g, path) +
      metadataSection(g, 'group') +
      sourceSection('group', g, path) +
      removeSection(path, 'group', g) +
      section(
        '',
        `<button type="button" class="btn secondary tone-danger" data-action="group-delete" data-path="${esc(path)}">${icon('trash', 15)}Delete group</button>
        <p class="field-help">${parents.length > 1 ? `Removes it from all ${parents.length} products that use it.` : 'Removes it and its settings.'} Its options are not deleted.</p>`,
      )
    );
  }

  function groupRulesSection(g, gb, rules) {
    const preview = `<div class="rule-preview">
        <span class="rule-preview-kicker">${icon('phone', 13)}Customers see</span>
        <strong>${esc(customerRule(rules))}</strong>
        <p>${esc(groupRuleSentence(rules))}</p>
      </div>`;
    if (g.isSubstitutionContainer)
      return section('Rules', callout('info', 'Customers do not see this group, so it has no rules. Its options can be offered as substitutes on the products that use it.'));
    if (rules.fixed) {
      const why = `${C.groupTypes[rules.type].label} groups always need exactly one choice.`;
      return section(
        'Rules',
        `<div class="rule-grid">${[
          ['Minimum', 1],
          ['Maximum', 1],
          ['Per option', 1],
          ['Free choices', 0],
        ]
          .map(([l, v]) => `<div class="rule-cell"><span class="rule-label">${l}</span><span class="rule-value tnum">${v}</span></div>`)
          .join('')}</div>
        <p class="field-help">${icon('lock', 12)} ${why} These rules cannot be changed.</p>${preview}`,
      );
    }
    const fromPos = g.gtype === 'pos';
    const posR = fromPos ? posRulesOf(g) : null;
    const errs = ruleErrors(g);
    const bindOf = (k) => (fromPos ? gb(`ruleOverrides.${k}`) : gb(k));
    const posText = (k) => (k === 'max' && posR.max == null ? 'no limit' : posR[k]);
    const cells = [
      ['Minimum', 'min', 'g-min', 0, '0 makes the group optional.'],
      ['Maximum', 'max', 'g-max', 1, 'Leave it empty for no limit.'],
      ['Per option', 'maxSingle', 'g-single', 1, 'Times the same option can be picked.'],
      ['Free choices', 'freeCount', 'g-free', 0, 'Included in the price.'],
    ];
    const grid = cells
      .map(([l, k, id, min, help]) =>
        field(l, inputNum(bindOf(k), rawRule(g, k), { int: true, id, min, max: QTY_MAX, placeholder: k === 'max' ? 'No limit' : '' }), {
          id,
          help: fromPos && hasOwn(g.ruleOverrides, k) ? `POS: ${posText(k)}. ${help}` : help,
          error: errs[k],
        }),
      )
      .join('');
    const note = fromPos
      ? ruleOverridden(g)
        ? `<p class="field-help">Changed from the POS rules. <button type="button" class="link-btn" data-action="rules-reset">Reset to POS rules</button></p>`
        : '<p class="field-help">Same as the POS rules. A change applies to every product that uses this group.</p>'
      : g.gtype === 'linked'
        ? `<p class="field-help">Started from the rules of ${esc(posLabel(g.posGroupExt))} on POS.</p>`
        : '';
    return section('Rules', `<div class="grid-2">${grid}</div>${note}${preview}`);
  }

  function groupOptionsSection(g, path, gb, rules) {
    const here = crumbText(path);
    const max = limitOf(rules.max);
    const pick = rules.fixed || max === 1;
    const rows = g.children
      .map((pid, i) => {
        const p = entity('product', pid);
        if (!p) return '';
        const op = childPath(path, 'product', pid);
        const opl = placement(op);
        const auto = isAutoAdded(op);
        const folder = p.ptype === 'container';
        const name = optionName(g, pid);
        const open = T.openCard === `opt:${pid}`;
        const pre = g.preselected[pid] || 0;
        let preCell = '';
        if (pick && !folder) {
          const on = pre > 0;
          preCell = `<button type="button" class="check-toggle opt-pick" role="radio" aria-checked="${on}" aria-label="Preselect ${esc(name)}" data-action="pre-pick" data-id="${esc(pid)}" ${auto ? 'disabled' : ''}><span class="check is-round${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span></button>`;
        } else preCell = stepper(gb(`preselected.${pid}`), auto ? 1 : pre, { max: optionMaxOf(g, pid, rules), label: `preselected ${name}`, disabled: auto || folder });
        const subs = [];
        if (auto) subs.push('Auto-added by POS');
        else if (folder) subs.push('Option folder');
        if (name !== nameOf('product', p)) subs.push(`Product: ${nameOf('product', p)}`);
        if (preselectOverridden(op)) subs.push(`Preselects ${opl.preselected} here`);
        const row = `<div class="opt-row${opl.hidden ? ' is-muted' : ''}">
            <button type="button" class="opt-name" data-action="goto" data-path="${esc(op)}">${thumb('product', p, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label" title="${esc(name)}">${esc(name)}</span>${subs.length ? `<span class="opt-name-sub">${esc(subs.join(' · '))}</span>` : ''}</span></button>
            <span class="opt-price tnum${priceStats(op).missingStores.length ? ' tone-warning' : ''}" title="${esc(priceStats(op).missingStores.length ? `No POS price at ${plural(priceStats(op).missingStores.length, 'store', 'stores')}` : priceStats(op).note)}">${folder ? '<span class="muted">—</span>' : esc(priceText(priceStats(op)))}</span>
            ${preCell}
            <button type="button" class="switch" role="switch" aria-checked="${!opl.hidden}" aria-label="Show ${esc(name)}" data-toggle="pl|${esc(op)}|hidden" data-focus-key="pl|${esc(op)}|hidden"><span class="switch-thumb"></span></button>
            <button type="button" class="icon-btn sm opt-expand" data-action="card-open" data-id="opt:${esc(pid)}" aria-expanded="${open}" aria-label="Settings for ${esc(name)}" title="Settings">${icon('chevDown', 14)}</button>
          </div>`;
        return `<div class="opt-item${open ? ' is-open' : ''}">${row}${open ? optionDetail(g, pid, p, op, i, gb, rules, max) : ''}</div>`;
      })
      .join('');
    const preHelp =
      rules.type === 2
        ? ' Exactly one option needs to be preselected. It applies everywhere this group is used.'
        : rules.type === 3
          ? ' Preselect one option at most. Preselection applies everywhere this group is used.'
          : ` ${pick ? 'Preselect one option at most. Preselection applies' : 'Preselected quantities apply'} everywhere this group is used. To change one place only, open the option there.`;
    return section(
      'Options',
      `<div class="opt-table has-expand">
        <div class="opt-head"><span>Option</span><span>POS price</span><span>Preselected</span><span>Shown</span><span class="sr-only">Settings</span></div>
        ${rows}
      </div>
      <p class="field-help">${g.gtype === 'standalone' ? 'Each choice is added to the order as its own item.' : 'Prices come from POS.'} Ranges mean the price differs by store.${preHelp} Shown applies only in ${esc(here)}.</p>`,
    );
  }

  function optionDetail(g, pid, p, op, i, gb, rules, max) {
    const name = optionName(g, pid);
    const s = g.optionSettings[pid] || {};
    const folder = p.ptype === 'container';
    const hidden = groupHiddenCodes(g, pid);
    const codes = C.modifierCodes.filter(([v]) => p.modifierCodes.includes(v));
    let body = field('Name in this group', inputText(gb(`optionSettings.${pid}.name`), s.name, { id: `g-on-${pid}`, placeholder: nameOf('product', p) }), {
      id: `g-on-${pid}`,
      error: lengthError(s.name),
      help: 'Customers see this name in this group. Leave it empty to use the product name.',
    });
    if (rules.type === 1 && !folder && max !== 1)
      body += field('Max per option', inputNum(gb(`optionSettings.${pid}.maxQty`), s.maxQty, { int: true, id: `g-om-${pid}`, min: 1, max: max != null ? max : QTY_MAX, placeholder: String(rules.maxSingle) }), {
        id: `g-om-${pid}`,
        error: optionMaxError(s.maxQty, max),
        help: `Times customers can pick this option. Leave it empty to use the group setting (${rules.maxSingle}).`,
      });
    if (rules.type === 1 && codes.length)
      body += field('Modifier codes shown', chips(gb(`optionSettings.${pid}.hiddenCodes`), hidden, codes, { invert: true }), {
        error: p.isModifierCodeRequired && codes.every(([v]) => hidden.includes(v)) ? 'A code is required, so keep at least one visible' : '',
        help: 'Applies everywhere this group is used.',
      });
    if (g.sections.length)
      body += field('Section', selectInput(gb(`optionSection.${pid}`), sectionOfOption(g, pid), g.sections.map((x) => [x.id, x.name || 'Untitled section']), { id: `g-os-${pid}` }), { id: `g-os-${pid}` });
    body += `<div class="opt-detail-foot">
        <div class="position-control"><span class="tnum">${i + 1} of ${g.children.length}</span>${moveButtons(gb('children'), i, g.children.length, name)}</div>
        <button type="button" class="btn ghost sm tone-danger" data-action="remove" data-path="${esc(op)}">${icon('trash', 14)}Remove from group</button>
      </div>`;
    return `<div class="opt-detail">${body}</div>`;
  }

  function groupSectionsSection(g, gb) {
    const rows = g.sections
      .map((x, i) => {
        const n = g.children.filter((pid) => sectionOfOption(g, pid) === x.id).length;
        const err = !x.name.trim() ? 'Add a section name' : lengthError(x.name);
        return `<div class="segment-row${err ? ' has-error' : ''}">
          <div class="segment-inputs is-section">
            ${inputText(gb(`sections.${i}.name`), x.name, { label: 'Section name' })}
            <span class="muted tnum">${plural(n, 'option', 'options')}</span>
            <span class="row-tools">${moveButtons(gb('sections'), i, g.sections.length, x.name || 'section')}${removeButton(gb('sections'), i, x.name || 'section')}</span>
          </div>
          ${err ? slotError(err) : ''}
        </div>`;
      })
      .join('');
    return section('Option sections', `${rows ? `<div class="segment-list">${rows}</div>` : ''}${addButton('opt-section-add', 'Add section')}`, {
      desc: g.sections.length
        ? 'Customers see options under these headings. Options without a section go in the first one. Choose the section in each option’s settings.'
        : 'Split a long list under headings, like Cheese and Veggies.',
    });
  }

  function groupSwapsSection(g, gb) {
    const opts = g.children.filter((pid) => entity('product', pid) && entity('product', pid).ptype !== 'container');
    const parents = groupParents(g.id);
    const own = (p) => opts.filter((pid) => hasOwn(p.substitutes, `${g.id}:${pid}`)).length;
    const body =
      opts.length < 2
        ? '<p class="field-help">Add at least two options to this group first.</p>'
        : `<div class="opt-cards"><div class="group-card is-open"><div class="group-card-body">${opts
            .map((pid) => {
              const subs = (g.swaps[pid] || []).filter((id) => entity('product', id));
              const name = optionName(g, pid);
              return `<div class="opt-sub-row">
                <span class="opt-sub-name">${esc(name)}</span>
                <div class="chips">${subs
                  .map((sid, i) => {
                    const n = optionName(g, sid);
                    return `<button type="button" class="chip is-on has-remove" data-action="arr-remove" data-bind="${esc(gb(`swaps.${pid}`))}" data-index="${i}" aria-label="Remove ${esc(n)}" title="Remove">${esc(n)}${icon('x', 12)}</button>`;
                  })
                  .join('')}<button type="button" class="chip" data-action="swap-add" data-id="${esc(pid)}">${icon('plus', 12)}Add</button></div>
              </div>`;
            })
            .join('')}</div></div></div>`;
    const applies = parents.length
      ? `<div class="store-list">${parents
          .map((p) => {
            const n = own(p);
            return `<div class="store-row"><span class="store-name list-name"><span>${esc(nameOf('product', p))}</span><span class="muted">${n ? `Uses its own substitutes for ${plural(n, 'option', 'options')}` : 'Follows this group'}</span></span></div>`;
          })
          .join('')}</div>`
      : '';
    return (
      section('Substitutes', body, { desc: 'Let customers swap an option for another option in this group, like fries for a salad.' }) +
      (applies ? section('Applies to', applies, { desc: 'Products follow these substitutes unless they set their own on their Ordering tab.' }) : '')
    );
  }

  function groupHalvesSection(g) {
    const matched = halfMatches(g).halfIds;
    const mapped = new Set(Object.entries(g.halves).flatMap(([w, h]) => [h.left, h.right].filter((x) => x && x !== w)));
    const isHalf = (pid) => (mapped.has(pid) || matched.has(pid)) && !g.halves[pid];
    const opts = g.children.filter((pid) => entity('product', pid) && entity('product', pid).ptype !== 'container' && !isHalf(pid));
    const halfCount = g.children.filter(isHalf).length;
    const parents = groupParents(g.id);
    const own = (p) => opts.filter((pid) => hasOwn(p.halfWhole, `${g.id}:${pid}`)).length;
    const nm = (pid) => nameOf('product', entity('product', pid));
    const missing = opts.filter((pid) => !(g.halves[pid] && g.halves[pid].left && g.halves[pid].right));
    const filter = T.halfFilter === 'missing' && missing.length ? 'missing' : 'all';
    const list = filter === 'missing' ? missing : opts;
    const pick = (pid, side) => {
      const v = (g.halves[pid] || {})[side];
      const label = `${SIDE_LABEL[side]} of ${optionName(g, pid)}`;
      return `<div class="half-cell">
        <button type="button" class="input half-pick${v ? '' : ' is-empty'}" data-action="half-pick" data-id="${esc(pid)}" data-side="${side}" aria-label="${esc(label)}"${v ? ` title="${esc(nm(v))}"` : ''}>${icon(side === 'left' ? 'halfLeft' : 'halfRight', 13)}<span class="half-pick-label">${esc(v ? nm(v) : `Add ${SIDE_LABEL[side].toLowerCase()}`)}</span>${icon('chevDown', 14)}</button>
        ${v ? `<button type="button" class="icon-btn sm" data-action="half-clear" data-id="${esc(pid)}" data-side="${side}" aria-label="Remove ${esc(label.toLowerCase())}" title="Remove">${icon('x', 14)}</button>` : ''}
      </div>`;
    };
    const seg = (v, label, n) =>
      `<button type="button" role="radio" aria-checked="${filter === v}" class="seg" data-action="half-filter" data-value="${v}">${label}<span class="seg-count tnum">${n}</span></button>`;
    const sugg = suggestedHalves(g);
    const canGroup = halfSuggestions(g).length > 0;
    const hint = sugg.length
      ? section(
          'Suggestion',
          `${callout('info', `${plural(sugg.length, 'topping has', 'toppings have')} halves with matching names. Group them, so customers choose a side on the topping instead of seeing each half as its own option.`, 'sparkles')}
          <div class="hint-actions">
            <button type="button" class="btn secondary sm" data-action="group-halves" data-id="${esc(g.id)}">${icon('sparkles', 14)}Group halves</button>
            <button type="button" class="btn ghost sm" data-action="dismiss-half-hint" data-id="${esc(g.id)}">Dismiss suggestion</button>
          </div>`,
        )
      : '';
    const body = opts.length
      ? `<div class="half-tools">
          <div class="segmented" role="radiogroup" aria-label="Show toppings">${seg('all', 'All', opts.length)}${seg('missing', 'Missing halves', missing.length)}</div>
          ${canGroup && !sugg.length ? `<button type="button" class="btn ghost sm" data-action="group-halves" data-id="${esc(g.id)}">${icon('sparkles', 14)}Group halves</button>` : ''}
        </div>
        <div class="half-table">
          ${list
            .map((pid) => {
              const h = g.halves[pid] || {};
              return `<div class="half-row">
                <span class="half-name">${esc(optionName(g, pid))}</span>
                <div class="half-picks">${pick(pid, 'left')}${pick(pid, 'right')}</div>
                ${!h.left !== !h.right ? slotError('Add both halves, or remove both') : ''}
              </div>`;
            })
            .join('')}
        </div>
        ${halfCount ? `<p class="field-help">${halfCount === 1 ? '1 option in this group is a half, so it is not listed.' : `${halfCount} options in this group are halves, so they are not listed.`} You’ll find each half under its topping in the menu.</p>` : ''}`
      : '<p class="field-help">Add options to this group first.</p>';
    const applies = parents.length
      ? `<div class="store-list">${parents
          .map((p) => {
            const n = own(p);
            return `<div class="store-row"><span class="store-name list-name"><span>${esc(nameOf('product', p))}</span><span class="muted">${n ? `Uses its own halves for ${plural(n, 'option', 'options')}` : 'Follows this group'}</span></span></div>`;
          })
          .join('')}</div>`
      : '';
    return (
      hint +
      section('Half and whole', body, {
        desc: 'Let customers put a topping on the left half, the right half, or the whole product. For each half, pick the POS option that rings up. Options come from the POS groups of the products that use this group.',
      }) +
      (applies ? section('Applies to', applies, { desc: 'Products follow these halves unless they set their own on their Ordering tab.' }) : '')
    );
  }

  function groupAppearsInSection(g, path) {
    const d = dragDescFromPath(path);
    const places = new Map();
    S.data.menus.forEach((m) =>
      walkMenu(m, (kind, id, ent, p) => {
        if (kind !== 'product' || ent.ptype === 'size') return;
        const owner = parsePath(parsePath(p).parentPath);
        const ownerName = nameOf(owner.kind, entity(owner.kind, owner.id));
        const x = places.get(id) || { kind: 'product', id, ent, path: p, where: [] };
        if (!x.where.includes(ownerName)) x.where.push(ownerName);
        places.set(id, x);
      }),
    );
    groupParents(g.id).forEach((p) => places.has(p.id) || places.set(p.id, { kind: 'product', id: p.id, ent: p, path: null, where: [] }));
    const on = (x) => x.ent.children.includes(g.id);
    const all = [...places.values()].filter((x) => on(x) || (!reaches('group', g.id, 'product', x.id) && !dropError(x.path, d)));
    const long = all.length > 6;
    const q = T.placeQuery.trim().toLowerCase();
    const shown = all
      .filter((x) => (!long || !T.showSelectedPlaces || on(x)) && (!long || !q || nameOf('product', x.ent).toLowerCase().includes(q)))
      .sort((a, b) => on(b) - on(a));
    const count = all.filter(on).length;
    const total = groupParents(g.id).length;
    const row = (x) => {
      const sel = on(x);
      const last = sel && total === 1;
      return `<button type="button" class="store-row store-check" data-action="group-place-toggle" data-id="${esc(x.id)}" aria-pressed="${sel}" ${last ? 'disabled title="A group needs at least one product. To take it out everywhere, delete it below."' : ''}>
        <span class="check${sel ? ' is-on' : ''}" aria-hidden="true">${sel ? icon('check', 12) : ''}</span>
        <span class="store-name list-name"><span>${esc(nameOf('product', x.ent))}</span><span class="muted">${x.where.length ? `In ${esc(listJoin(x.where))}` : 'Not in any menu'}</span></span></button>`;
    };
    const tools = long
      ? `<label class="search-field sm">${icon('search', 14)}<span class="sr-only">Search products</span><input id="place-q" type="search" data-place-search data-focus-key="place-q" placeholder="Search ${all.length} products" value="${esc(T.placeQuery)}" autocomplete="off"></label>
        <div class="group-card-tools"><span class="store-summary tnum">In ${count} of ${all.length} products</span>
          <button type="button" class="check-toggle" role="checkbox" aria-checked="${T.showSelectedPlaces}" data-action="place-only-selected"><span class="check${T.showSelectedPlaces ? ' is-on' : ''}" aria-hidden="true">${T.showSelectedPlaces ? icon('check', 12) : ''}</span>Show only selected</button></div>`
      : '';
    const list = shown.length ? `<div class="store-list">${shown.map(row).join('')}</div>` : '<p class="field-help">Nothing matches. Check the spelling.</p>';
    return section('Appears in', tools + list, {
      desc: `Lists the products that can hold this group${g.source === 'pos' ? ' on POS' : ''}. Selecting one adds the group at the end, with the same options and rules.`,
    });
  }
