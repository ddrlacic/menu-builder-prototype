'use strict';

  function groupTab(tab, g, path) {
    const gb = (f) => `e|group|${g.id}|${f}`;
    const rules = rulesOf(g);
    if (tab === 'general') {
      const posField =
        g.gtype === 'linked'
          ? field(
              'POS group',
              `<div class="input is-readonly">${esc(posLabel(g.posGroupExt))}</div>
          <div class="link-btns field-actions"><button type="button" class="link-btn" data-action="group-change-link">Change</button></div>`,
              { help: `Choices go to POS as options of ${esc(posLabel(g.posGroupExt))}, at its prices. This name and these rules stay on this group.` },
            )
          : '';
      return (
        placementSection(path) +
        section(
          '',
          nameBlock('group', g, { error: lengthError(g.name, 'Add a group name'), help: 'Customers see this name in Web App and Kiosk.' }) +
            field('Internal name', inputText(gb('internalName'), g.internalName, { id: 'g-int' }), {
              id: 'g-int',
              error: lengthError(g.internalName),
              help: 'Use it to tell apart groups with the same name. Only your team sees it.',
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
                help: 'Web App hides this group. Use its options as substitutes. Kiosk still shows the group.',
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
            ? 'Drag any POS product here. Each one customers pick goes on the order as its own item, at its POS price.'
            : `Add options from ${esc(posLabel(gpos))}.`;
        return rulesHtml + section('Options', `<div class="empty-small"><strong>No options yet</strong><span>${hint}</span></div>`) + missingHtml;
      }
      return rulesHtml + groupOptionsSection(g, path, gb, rules) + missingHtml + groupSectionsSection(g, gb, path);
    }
    if (tab === 'substitutes') return groupSwapsSection(g, gb);
    if (tab === 'halves') return groupHalvesSection(g);
    const parents = groupParents(g.id);
    return (
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

  function groupPlacementFields(g, path) {
    const pInfo = parsePath(parsePath(path).parentPath);
    const parentName = nameOf(pInfo.kind, entity(pInfo.kind, pInfo.id));
    const rules = rulesOf(g);
    const hidden = groupHiddenAt(path);
    const noOptions = !g.children.length;
    const lockHide = noOptions || (rules.min > 0 && !hidden);
    const hiddenCount = g.children.filter((pid) => groupHiddenAt(childPath(path, 'product', pid))).length;
    let help = 'Hides every option here. Showing one option shows the group again. Other places stay as they are.';
    if (noOptions) help = 'Add an option before hiding this group.';
    else if (lockHide)
      help = rules.fixed
        ? 'Customers always pick one option in this group, so it cannot be hidden.'
        : 'Required groups cannot be hidden. Set the minimum to 0 first.';
    else if (hidden) help = 'Every option is hidden here, so the group is hidden. Turn this on to show every option. Other places stay as they are.';
    else if (hiddenCount) help = `${hiddenCount} of ${g.children.length} options are hidden here. The group stays visible until every option is hidden.`;
    return toggle(`pl|${path}|hidden`, !hidden, {
      label: `Show in ${parentName}`,
      scope: crumbText(path),
      disabled: lockHide,
      help,
    });
  }

  function groupRulesSection(g, gb, rules) {
    const preview = `<div class="rule-preview">
        <span class="rule-preview-kicker">${icon('phone', 13)}Customers see</span>
        <strong>${esc(customerRule(rules))}</strong>
        <p>${esc(groupRuleSentence(rules))}</p>
      </div>`;
    if (g.isSubstitutionContainer)
      return section('Rules', callout('info', 'Web App hides this group, so it has no rules. Kiosk still shows it. Its options can be offered as substitutes on the products that use it.'));
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
      ['Minimum', 'min', 'g-min', '0 makes the group optional.'],
      ['Maximum', 'max', 'g-max', 'Leave it empty for no limit.'],
      ['Per option', 'maxSingle', 'g-single', 'Times the same option can be picked.'],
      ['Free choices', 'freeCount', 'g-free', 'Included in the price.'],
    ];
    const grid = cells
      .map(([l, k, id, help]) =>
        field(l, inputNum(bindOf(k), rawRule(g, k), { int: true, id, placeholder: k === 'max' ? 'No limit' : '' }), {
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
    const host = sectionHost(path);
    const onlyHere = !!host && T.preHere === path;
    const preHere = onlyHere && rules.type === 1;
    const lockPre = onlyHere && !preHere;
    const pName = host ? esc(nameOf('product', host.p)) : '';
    const listed = listedOptions(g);
    const rows = listed
      .map((pid, i) => {
        const p = entity('product', pid);
        const op = childPath(path, 'product', pid);
        const auto = isAutoAdded(op);
        const folder = p.ptype === 'container';
        const name = optionName(g, pid);
        const open = T.openCard === `opt:${pid}`;
        const pre = g.preselected[pid] || 0;
        let preCell = '';
        if (preHere) {
          preCell = stepper(`pl|${productScopePath(op)}|preselected`, preselectedAt(op), { max: optionMaxOf(g, pid, rules), label: `preselected ${name}`, disabled: auto || folder, keepZero: true, start: pre });
        } else if (pick && !folder) {
          const on = pre > 0;
          preCell = `<button type="button" class="check-toggle opt-pick" role="radio" aria-checked="${on}" aria-label="Preselect ${esc(name)}" data-action="pre-pick" data-id="${esc(pid)}" ${auto || lockPre ? 'disabled' : ''}><span class="check is-round${on ? ' is-on' : ''}" aria-hidden="true">${on ? icon('check', 12) : ''}</span></button>`;
        } else preCell = stepper(gb(`preselected.${pid}`), auto ? 1 : pre, { max: optionMaxOf(g, pid, rules), label: `preselected ${name}`, disabled: auto || folder || lockPre });
        const subs = [];
        if (auto) subs.push('Auto-added by POS');
        else if (folder) subs.push('Option folder');
        if (name !== nameOf('product', p)) subs.push(`Product: ${nameOf('product', p)}`);
        const changed = host && (preselectOverridden(op) || codesOverridden(op) || hiddenInProduct(op));
        const ps = priceStats(op);
        const noPrice = !folder && ps.missingStores.length && !isMissingOnPos(p) ? `No POS price at ${ps.missingStores.length === ps.total ? 'any store' : plural(ps.missingStores.length, 'store', 'stores')}` : '';
        const halves = halvesNote(g, pid);
        const sub = [esc(subs.join(' · ')), changed && `<span class="half-meta">${onlyHere ? 'Changed here' : `Changed in ${pName}`}</span>`, halves && `<span class="half-meta">${icon('halves', 11)}${esc(halves)}</span>`, noPrice && `<span class="tone-warning">${noPrice}</span>`].filter(Boolean).join(' · ');
        const shownCell = onlyHere
          ? `<button type="button" class="switch" role="switch" aria-checked="${!hiddenInProduct(op)}" aria-label="Show ${esc(name)} in ${pName}" data-toggle="pl|${esc(productScopePath(op))}|hidden" data-focus-key="pl|${esc(productScopePath(op))}|hidden"><span class="switch-thumb"></span></button>`
          : '';
        const row = `<div class="opt-row${groupHiddenAt(op) ? ' is-muted' : ''}">
            <button type="button" class="opt-name" data-action="goto" data-path="${esc(op)}">${thumb('product', p, 'thumb-sm')}<span class="opt-name-text"><span class="opt-name-label" title="${esc(name)}">${esc(name)}</span>${sub ? `<span class="opt-name-sub">${sub}</span>` : ''}</span></button>
            ${preCell}
            ${shownCell}
            <button type="button" class="icon-btn sm opt-expand" data-action="card-open" data-id="opt:${esc(pid)}" aria-expanded="${open}" aria-label="Settings for ${esc(name)}" title="Settings">${icon('chevDown', 14)}</button>
          </div>`;
        return `<div class="opt-item${open ? ' is-open' : ''}">${row}${open ? optionDetail(g, pid, p, op, i, listed.length, gb, rules, max, onlyHere) : ''}</div>`;
      })
      .join('');
    const preHelp =
      rules.type === 2
        ? ' Exactly one option needs to be preselected. It applies everywhere this group is used.'
        : rules.type === 3
          ? ' Preselect one option at most. Preselection applies everywhere this group is used.'
          : ` ${pick ? 'Preselect one option at most. Preselection applies' : 'Preselected quantities apply'} everywhere this group is used. To change one place only, open the option there.`;
    const bulk = onlyHere ? null : bulkPreselect(g, path);
    const changedHere = onlyHere && listed.some((pid) => {
        const op = childPath(path, 'product', pid);
        return preselectOverridden(op) || codesOverridden(op) || hiddenInProduct(op);
      });
    const bulkHtml = changedHere
      ? '<div class="link-btns field-actions"><button type="button" class="link-btn" data-action="pre-reset-here">Use the same as other products</button></div>'
      : bulk && (bulk.canAll || bulk.canClear)
        ? `<div class="link-btns field-actions">${bulk.canAll ? '<button type="button" class="link-btn" data-action="pre-all">Preselect all</button>' : ''}${bulk.canClear ? '<button type="button" class="link-btn" data-action="pre-clear">Clear preselection</button>' : ''}</div>`
        : '';
    const scopeHtml = host ? scopeSwitch(path, host, onlyHere, 'pre-scope') : '';
    const help = preHere
      ? `Changes here apply only to ${pName}, in every menu. To hide an option in one menu only, open the option there.`
      : onlyHere
        ? `${C.groupTypes[rules.type].label} groups preselect the same option in every product. Shown applies only to ${pName}, in every menu.`
        : `${g.gtype === 'standalone' ? 'Each one customers pick goes on the order as its own item.' : 'Prices come from POS. Select an option’s name to see its price.'}${preHelp}${host ? ` To hide options in ${pName}, choose ${pName} above.` : ''}`;
    return section(
      'Options',
      `${scopeHtml}<div class="opt-table has-expand no-price${onlyHere ? '' : ' no-shown'}">
        <div class="opt-head"><span>Option</span><span>Preselected</span>${onlyHere ? '<span>Shown</span>' : ''}<span class="sr-only">Settings</span></div>
        ${rows}
      </div>${bulkHtml}
      <p class="field-help">${help}</p>`,
    );
  }

  function optionDetail(g, pid, p, op, i, count, gb, rules, max, onlyHere) {
    const name = optionName(g, pid);
    const s = g.optionSettings[pid] || {};
    const folder = p.ptype === 'container';
    const hidden = groupHiddenCodes(g, pid);
    const codes = productCodes(p);
    let body = onlyHere ? '' : field('Name in this group', inputText(gb(`optionSettings.${pid}.name`), s.name, { id: `g-on-${pid}`, placeholder: nameOf('product', p) }), {
      id: `g-on-${pid}`,
      error: lengthError(s.name),
      help: 'Customers see this name in this group. Leave it empty to use the product name.',
    });
    if (!onlyHere && rules.type === 1 && !folder && max !== 1)
      body += field('Maximum per option', inputNum(gb(`optionSettings.${pid}.maxQty`), s.maxQty, { int: true, id: `g-om-${pid}`, placeholder: String(rules.maxSingle) }), {
        id: `g-om-${pid}`,
        error: optionMaxError(s.maxQty, max),
        help: `Times customers can pick this option. Leave it empty to use the group setting (${rules.maxSingle}).`,
      });
    if (rules.type === 1 && codes.length) {
      const shownHere = onlyHere ? hiddenCodesAt(op) : hidden;
      body += field(
        'Modifier codes shown',
        onlyHere
          ? chips(`pl|${productScopePath(op)}|codesHere`, shownHere, codes, { invert: true, start: hidden })
          : chips(gb(`optionSettings.${pid}.hiddenCodes`), hidden, codes, { invert: true }),
        {
          scope: onlyHere ? productScopeText(op) : '',
          error: p.isModifierCodeRequired && codes.every(([v]) => shownHere.includes(v)) ? 'A code is required, so keep at least one visible' : '',
          help: onlyHere ? (codesOverridden(op) ? 'Other products use the codes set in this group.' : 'Same as in other products.') : 'Applies everywhere this group is used.',
        },
      );
    }
    if (!onlyHere) body += `<div class="opt-detail-foot">
        <div class="position-control"><span class="tnum">${i + 1} of ${count}</span>${[
          [-1, 'chevUp', 'up', i === 0],
          [1, 'chevDown', 'down', i === count - 1],
        ]
          .map(([d, ic, w, off]) => `<button type="button" class="icon-btn sm" data-action="opt-move" data-id="${esc(pid)}" data-delta="${d}" aria-label="Move ${esc(name)} ${w}" title="Move ${w}" ${off ? 'disabled' : ''}>${icon(ic, 14)}</button>`)
          .join('')}</div>
        <button type="button" class="btn ghost sm tone-danger" data-action="remove" data-path="${esc(op)}">${icon('trash', 14)}Remove from group</button>
      </div>`;
    return `<div class="opt-detail">${body}</div>`;
  }

  function scopeSwitch(path, host, onlyHere, action) {
    return `<div class="field"><div class="field-head"><span class="field-label">Edit for</span>${onlyHere ? scopePill(productScopeText(path)) : ''}</div>
        <div class="segmented" role="radiogroup" aria-label="Edit for">${[
          ['all', 'Every product'],
          ['here', esc(nameOf('product', host.p))],
        ]
          .map(([v, l]) => `<button type="button" role="radio" aria-checked="${(v === 'here') === onlyHere}" class="seg" data-action="${action}" data-value="${v}">${l}</button>`)
          .join('')}</div></div>`;
  }

  function groupSectionsSection(g, gb, path) {
    const host = sectionHost(path);
    const gName = esc(nameOf('group', g));
    const onlyHere = !!host && T.sectionsHere === path;
    const scopeHtml = host ? scopeSwitch(path, host, onlyHere, 'sections-scope') : '';
    const sectionsBox = (body, desc) => (host ? section('Option sections', `${scopeHtml}${desc ? `<p class="section-desc">${desc}</p>` : ''}${body}`) : section('Option sections', body, { desc }));
    if (onlyHere && !host.own) {
      const pName = esc(nameOf('product', host.p));
      return sectionsBox(
        `<p class="field-help">${g.sections.length ? 'Same sections as other products.' : 'No sections, same as other products.'}</p>
        <div class="link-btns field-actions"><button type="button" class="link-btn" data-action="own-sections-start">Use own sections in ${pName}</button></div>`,
      );
    }
    if (onlyHere) {
      const own = host.own;
      const pName = esc(nameOf('product', host.p));
      const listed = new Set(listedOptions(g));
      const items = own.children.filter((pid) => listed.has(pid)).map((pid) => ({ id: pid, name: optionName(g, pid), section: sectionOfOption(own, pid) }));
      const ob = (f) => `e|product|${host.p.id}|optionSections.${g.id}.${f}`;
      return sectionsBox(
        nestedSections(`place|${host.p.id}:${g.id}|optionSection`, own.sections, ob, items, 'option', 'options') +
          addButton('own-section-add', 'Add section') +
          `<div class="link-btns field-actions"><button type="button" class="link-btn" data-action="own-sections-reset">Use the same as other products</button></div>`,
        `Customers see these headings in ${pName} only. Drag options and headings to arrange them.`,
      );
    }
    const items = listedOptions(g).map((pid) => ({ id: pid, name: optionName(g, pid), section: sectionOfOption(g, pid) }));
    const others = groupParents(g.id).filter((p) => p.optionSections && p.optionSections[g.id]).length;
    const note = others ? `${plural(others, 'product uses', 'products use')} its own sections.` : '';
    return sectionsBox(
      nestedSections(`group|${g.id}|optionSection`, g.sections, gb, items, 'option', 'options') + addButton('opt-section-add', 'Add section') + (note ? `<p class="field-help">${note}</p>` : ''),
      g.sections.length
        ? `Customers see the options under these headings, in this order, in every product that uses ${gName}. Drag options and headings to arrange them.`
        : 'Split the options under headings, like Cheese and Veggies.',
    );
  }

  function groupSwapsSection(g, gb) {
    const halves = siblingGroupedHalves(g);
    const opts = g.children.filter((pid) => entity('product', pid) && entity('product', pid).ptype !== 'container' && !halves.has(pid));
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
            return `<div class="store-row"><span class="store-name list-name"><span>${esc(nameOf('product', p))}</span><span class="muted">${n ? `Uses its own substitutes for ${plural(n, 'option', 'options')}` : 'Same as this group'}</span></span></div>`;
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
    const mapped = groupedHalves(g);
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
            return `<div class="store-row"><span class="store-name list-name"><span>${esc(nameOf('product', p))}</span><span class="muted">${n ? `Uses its own halves for ${plural(n, 'option', 'options')}` : 'Same as this group'}</span></span></div>`;
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
