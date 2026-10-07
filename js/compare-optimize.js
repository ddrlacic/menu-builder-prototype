'use strict';

  /* ---------- compare to POS ---------- */

  function openCompare() {
    T.cmp = { tab: 'pos', sel: new Set() };
    openModal({ title: 'Compare to POS', body: '<div id="cmp"></div>', size: 'lg', foot: '<div class="modal-foot" id="cmp-foot"></div>' });
    renderCompare();
  }

  function renderCompare() {
    if (!T.cmp || !$('#cmp')) return;
    const data = ctx.compare;
    const { tab, sel } = T.cmp;
    for (const k of [...sel]) if (!data.missing.some((m) => m.key === k)) sel.delete(k);
    const posRow = (m, control) => {
      const it = posItemById(m.posId);
      return `<div class="cmp-row">
        ${control}
        <span class="kind-glyph kind-${it.type}">${icon(KIND_ICON[it.type], 13)}</span>
        <span class="cmp-main"><span class="cmp-name">${esc(it.name)}</span><span class="cmp-meta">In ${esc(m.parentName)} · <span class="mono">${esc(m.posId)}</span></span></span>
      </div>`;
    };
    let body = `<div class="segmented cmp-tabs" role="tablist">
      <button type="button" role="tab" class="seg" aria-checked="${tab === 'pos'}" data-action="cmp-tab" data-tab="pos">Changes on POS</button>
      <button type="button" role="tab" class="seg" aria-checked="${tab === 'ignored'}" data-action="cmp-tab" data-tab="ignored">Ignored items<span class="seg-count tnum">${data.ignored.length}</span></button>
    </div>`;
    if (tab === 'pos') {
      if (!data.count) {
        body += `<div class="empty-small">${icon('checkCircle', 20)}<strong>${esc(activeMenu().name)} matches POS</strong><span>Nothing new, changed, or removed since the last review.</span></div>`;
      }
      if (data.missing.length) {
        const allOn = data.missing.every((m) => sel.has(m.key));
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">New on POS<span class="tnum"> · ${data.missing.length}</span></h3>
            <button type="button" class="btn ghost sm" data-action="cmp-all">${allOn ? 'Clear selection' : 'Select all'}</button></header>
          <p class="section-desc">On POS under items in this menu, but not added yet.</p>
          <div class="cmp-list">${data.missing
            .map((m) =>
              posRow(
                m,
                `<button type="button" class="check${sel.has(m.key) ? ' is-on' : ''}" role="checkbox" aria-checked="${sel.has(m.key)}" aria-label="Select ${esc(posItemById(m.posId).name)}" data-action="cmp-toggle" data-key="${esc(m.key)}">${sel.has(m.key) ? icon('check', 12) : ''}</button>`,
              ),
            )
            .join('')}</div>
        </section>`;
      }
      if (data.changed.length) {
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">Changed on POS<span class="tnum"> · ${data.changed.length}</span></h3>
            <button type="button" class="btn ghost sm" data-action="cmp-review">Mark as reviewed</button></header>
          <p class="section-desc">Already in the menu. Prices update automatically. Names update unless you set your own.</p>
          <div class="cmp-list">${data.changed
            .map(
              (c) => `<div class="cmp-row"><span class="kind-glyph kind-${c.kind}">${icon(KIND_ICON[c.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(c.kind, c.ent))}</span><span class="cmp-meta tnum">${c.diffs.map(esc).join(' · ')}</span></span>
                <button type="button" class="btn ghost sm" data-action="cmp-goto" data-path="${esc(c.path)}">Show</button></div>`,
            )
            .join('')}</div>
        </section>`;
      }
      if (data.gone.length) {
        body += `<section class="cmp-section">
          <header class="cmp-head"><h3 class="section-title">No longer on POS<span class="tnum"> · ${data.gone.length}</span></h3></header>
          <p class="section-desc">Customers cannot order these. Remove them, or check POS.</p>
          <div class="cmp-list">${data.gone
            .map(
              (g) => `<div class="cmp-row"><span class="kind-glyph kind-${g.kind}">${icon(KIND_ICON[g.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(g.kind, g.ent))}</span><span class="cmp-meta">${esc(g.label)} · ${esc(crumbText(parsePath(g.path).parentPath))}</span></span>
                <button type="button" class="btn secondary sm tone-danger" data-action="cmp-remove" data-path="${esc(g.path)}">Remove</button></div>`,
            )
            .join('')}</div>
        </section>`;
      }
    } else {
      body += data.ignored.length
        ? `<section class="cmp-section"><p class="section-desc">Hidden from the changes list. They stay on POS.</p><div class="cmp-list">${data.ignored
            .map((m) => posRow(m, '').replace('</div>', '') + `<button type="button" class="btn ghost sm" data-action="cmp-unignore" data-key="${esc(m.key)}">Stop ignoring</button></div>`)
            .join('')}</div></section>`
        : `<div class="empty-small"><strong>No ignored items</strong><span>Items you ignore show up here.</span></div>`;
    }
    $('#cmp').innerHTML = body;
    $('#cmp-foot').innerHTML =
      tab === 'pos' && data.missing.length
        ? `<span class="foot-note tnum">${sel.size} selected</span>
           <button type="button" class="btn secondary" data-action="cmp-ignore" ${sel.size ? '' : 'disabled'}>Ignore selected</button>
           <button type="button" class="btn primary" data-action="cmp-add" ${sel.size ? '' : 'disabled'}>Add selected</button>`
        : `<button type="button" class="btn secondary" data-modal-close>Done</button>`;
  }

  function compareAdd() {
    const picks = ctx.compare.missing.filter((m) => T.cmp.sel.has(m.key));
    let added = 0;
    commit(() => {
      for (const m of picks) {
        const pi = parsePath(m.path);
        const parent = entity(pi.kind, pi.id);
        const it = posItemById(m.posId);
        if (dropError(m.path, { kind: m.kind, source: 'pos', posId: m.posId, name: it.name })) continue;
        const res = importPos(m.posId);
        if (!parent.children.includes(res.id)) {
          parent.children.push(res.id);
          added++;
          S.ui.expanded[m.path] = true;
          flash(childPath(m.path, m.kind, res.id));
        }
      }
    });
    T.cmp.sel.clear();
    renderCompare();
    toast(`${plural(added, 'item', 'items')} added from POS`);
  }

  /* ---------- optimize ---------- */

  function openOptimize(onlyCategoryPath = null) {
    T.opt = {
      step: onlyCategoryPath ? 'review' : 'choose',
      pick: onlyCategoryPath ? { names: false, descriptions: false, sizes: true } : { names: true, descriptions: true, sizes: true },
      only: onlyCategoryPath,
      items: [],
      off: new Set(),
    };
    if (onlyCategoryPath) T.opt.items = buildSuggestions();
    openModal({ title: onlyCategoryPath ? 'Group sizes' : 'Optimize menu', body: '<div id="opt"></div>', size: 'lg', foot: '<div class="modal-foot" id="opt-foot"></div>' });
    renderOptimize();
  }

  function buildSuggestions() {
    const { pick, only } = T.opt;
    const menu = activeMenu();
    const items = [];
    const seen = new Set();
    walkMenu(menu, (kind, id, ent, path) => {
      if (kind === 'category' && pick.sizes && (!only || only === path)) {
        detectSizeSets(ent).forEach((set, i) => items.push({ key: `sizes|${path}|${i}`, type: 'sizes', path, set, name: containerName(set) }));
      }
      if (only || ent.source !== 'pos' || seen.has(`${kind}:${id}`)) return;
      seen.add(`${kind}:${id}`);
      const ext = ent.externalId;
      const posName = (posItem(ent) || ent.reviewed || {}).name;
      if (pick.names && kind === 'product' && ent.name === posName && SUG.names[ext] && SUG.names[ext] !== ent.name)
        items.push({ key: `name|${kind}|${id}`, type: 'name', kind, id, from: nameOf(kind, ent), to: SUG.names[ext] });
      if (pick.descriptions && kind === 'product' && !ent.description && SUG.descriptions[ext])
        items.push({ key: `desc|${id}`, type: 'description', kind, id, name: SUG.names[ext] || nameOf(kind, ent), to: SUG.descriptions[ext] });
    });
    return items;
  }

  function renderOptimize() {
    if (!T.opt || !$('#opt')) return;
    const o = T.opt;
    const checkBtn = (key, on, label) =>
      `<button type="button" class="check${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on}" aria-label="${esc(label)}" data-action="opt-item" data-key="${esc(key)}">${on ? icon('check', 12) : ''}</button>`;
    if (o.step === 'choose') {
      const choice = (key, title, help) =>
        `<button type="button" class="choice-row${o.pick[key] ? ' is-on' : ''}" role="checkbox" aria-checked="${o.pick[key]}" data-action="opt-pick" data-key="${key}">
          <span class="check${o.pick[key] ? ' is-on' : ''}" aria-hidden="true">${o.pick[key] ? icon('check', 12) : ''}</span>
          <span class="choice-text"><strong>${title}</strong><span>${help}</span></span></button>`;
      $('#opt').innerHTML = `<p>Review suggestions before anything changes. POS stays as it is.</p>
        <div class="choice-list">
          ${choice('sizes', 'Group my sizes', 'Combine size variants like Small and Large into one choice product')}
          ${choice('names', 'Suggest names', 'Replace POS shorthand like SML LMNADE with names customers understand')}
          ${choice('descriptions', 'Suggest descriptions', 'Write descriptions for products that have none')}
        </div>`;
      const any = Object.values(o.pick).some(Boolean);
      $('#opt-foot').innerHTML = `<button type="button" class="btn secondary" data-modal-close>Cancel</button>
        <button type="button" class="btn primary" data-action="opt-find" ${any ? '' : 'disabled'}>${icon('sparkles', 15)}Find suggestions</button>`;
      return;
    }
    const groups = [
      ['name', 'Names'],
      ['description', 'Descriptions'],
      ['sizes', 'Choice products'],
    ];
    const on = o.items.filter((i) => !o.off.has(i.key)).length;
    let body = '';
    if (!o.items.length) {
      body = `<div class="empty-small">${icon('checkCircle', 20)}<strong>Nothing to suggest</strong><span>Names, descriptions, and sizes already look good.</span></div>`;
    }
    for (const [type, title] of groups) {
      const list = o.items.filter((i) => i.type === type);
      if (!list.length) continue;
      body += `<section class="cmp-section"><header class="cmp-head"><h3 class="section-title">${title}<span class="tnum"> · ${list.length}</span></h3></header>${type === 'sizes' ? '<p class="section-desc">Each size stays in its category, hidden there, so it keeps its POS price. Customers find it inside the new product.</p>' : ''}<div class="cmp-list">${list
        .map((i) => {
          const isOn = !o.off.has(i.key);
          if (type === 'name')
            return `<div class="cmp-row">${checkBtn(i.key, isOn, `Use ${i.to}`)}<span class="cmp-main"><span class="sug-line"><span class="sug-from">${esc(i.from)}</span>${icon('chevRight', 13)}<span class="cmp-name">${esc(i.to)}</span></span><span class="cmp-meta">POS name stays ${esc(i.from)}</span></span></div>`;
          if (type === 'description')
            return `<div class="cmp-row">${checkBtn(i.key, isOn, `Add description to ${i.name}`)}<span class="cmp-main"><span class="cmp-name">${esc(i.name)}</span><span class="cmp-meta">${esc(i.to)}</span></span></div>`;
          return `<div class="cmp-row">${checkBtn(i.key, isOn, `Create ${i.name}`)}<span class="thumb kind-container thumb-sm">${icon('package', 13)}</span><span class="cmp-main"><span class="cmp-name">${esc(i.name)}</span><span class="cmp-meta">${esc(listJoin(i.set.items.map((x) => capitalize(x.size))))} · in ${esc(nameOf('category', entity('category', parsePath(i.path).id)))}</span></span></div>`;
        })
        .join('')}</div></section>`;
    }
    $('#opt').innerHTML = body;
    $('#opt-foot').innerHTML = `${o.only ? '<button type="button" class="btn secondary" data-modal-close>Cancel</button>' : `<button type="button" class="btn ghost" data-action="opt-back">${icon('chevLeft', 15)}Back</button><span class="foot-spacer"></span>`}
      <button type="button" class="btn primary" data-action="opt-apply" ${on ? '' : 'disabled'}>${on ? `Apply ${plural(on, 'change', 'changes')}` : 'Apply changes'}</button>`;
  }

  function applyOptimize() {
    const picks = T.opt.items.filter((i) => !T.opt.off.has(i.key));
    closeModal();
    commit(() => {
      for (const i of picks) {
        if (i.type === 'name') {
          entity(i.kind, i.id).name = i.to;
        } else if (i.type === 'description') {
          entity('product', i.id).description = i.to;
        }
      }
      for (const i of picks.filter((x) => x.type === 'sizes')) {
        const catPath = i.path;
        const cat = entity('category', parsePath(catPath).id);
        const pids = i.set.items.map((x) => x.pid).filter((pid) => cat.children.includes(pid));
        if (pids.length < 2) continue;
        const container = newProduct({ ptype: 'size', name: i.name, children: pids });
        S.data.entities.product[container.id] = container;
        cat.children.splice(cat.children.indexOf(pids[0]), 0, container.id);
        const cp = childPath(catPath, 'product', container.id);
        pids.forEach((pid) => {
          const sp = childPath(catPath, 'product', pid);
          S.data.placements[sp] = { ...placement(sp), hidden: true };
        });
        S.ui.expanded[catPath] = true;
        S.ui.expanded[cp] = true;
        flash(cp);
      }
    });
    toast(`${plural(picks.length, 'change', 'changes')} applied. POS stays as it is`);
  }

  function openHalfMatch(gid) {
    const g = entity('group', gid);
    const taken = new Set(Object.values(g.halves).flatMap((h) => [h.left, h.right]));
    openModal({ title: 'Group halves', body: '<div id="hh"></div>', size: 'lg', foot: '<div class="modal-foot" id="hh-foot"></div>' });
    T.hh = { gid, items: halfSuggestions(g), unmatched: halfMatches(g).unmatched.filter((pid) => !taken.has(pid)), off: new Set() };
    renderHalfMatch();
  }

  function renderHalfMatch() {
    if (!T.hh || !$('#hh')) return;
    const o = T.hh;
    const g = entity('group', o.gid);
    const nm = (pid) => nameOf('product', entity('product', pid));
    const where = (pid) => {
      const x = siblingPosGroups(g).find((s) => s.children.includes(pid));
      return x && x.id !== g.id ? ` · in ${nameOf('group', x)}` : '';
    };
    const side = (s, pid) => `<span class="hh-side">${icon(s === 'left' ? 'halfLeft' : 'halfRight', 12)}${esc(nm(pid) + where(pid))}</span>`;
    const row = (i) => {
      const on = !o.off.has(i.pid);
      const name = optionName(g, i.pid);
      return `<div class="cmp-row"><button type="button" class="check${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on}" aria-label="Group halves of ${esc(name)}" data-action="hh-item" data-key="${esc(i.pid)}">${on ? icon('check', 12) : ''}</button>
        <span class="cmp-main"><span class="cmp-name">${esc(name)}</span><span class="cmp-meta hh-sides">${side('left', i.left)}${side('right', i.right)}</span></span></div>`;
    };
    const block = (title, desc, list, render) =>
      list.length
        ? `<section class="cmp-section"><header class="cmp-head"><h3 class="section-title">${title}<span class="tnum"> · ${list.length}</span></h3></header>${desc ? `<p class="section-desc">${desc}</p>` : ''}<div class="cmp-list">${list.map(render).join('')}</div></section>`
        : '';
    const exact = o.items.filter((i) => i.exact);
    const close = o.items.filter((i) => !i.exact);
    $('#hh').innerHTML = o.items.length
      ? `<p>Customers pick a topping, then choose the left half, the right half, or the whole. Halves in ${esc(nameOf('group', g))} are matched to toppings by name. POS stays as it is.</p>
        ${block('Same name', '', exact, row)}
        ${block('Similar name', 'Check these before you group them.', close, row)}
        ${block('No matching topping', 'These look like halves, but no topping in this group has a matching name. Set them on the group’s Half and whole tab.', o.unmatched, (pid) => `<div class="cmp-row"><span class="cmp-main"><span class="cmp-name">${esc(nm(pid))}</span></span></div>`)}`
      : `<div class="empty-small">${icon('checkCircle', 20)}<strong>No halves to group</strong><span>Every topping with matching halves is already grouped.</span></div>`;
    const on = o.items.filter((i) => !o.off.has(i.pid)).length;
    $('#hh-foot').innerHTML = `<button type="button" class="btn secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn primary" data-action="hh-apply" ${on ? '' : 'disabled'}>${on ? `Group halves for ${plural(on, 'topping', 'toppings')}` : 'Group halves'}</button>`;
  }

  function applyHalfMatch() {
    const { gid, items, off } = T.hh;
    const picks = items.filter((i) => !off.has(i.pid));
    closeModal();
    if (!picks.length) return;
    const g = entity('group', gid);
    commit(() => picks.forEach((i) => (g.halves[i.pid] = { left: i.left, right: i.right })));
    toast(`Halves successfully grouped for ${plural(picks.length, 'topping', 'toppings')}`);
  }

  function openHalfPicker(g, pid, side, { groups = siblingPosGroups(g), halves = g.halves, onPick } = {}) {
    const whole = normName(nameOf('product', entity('product', pid)));
    const current = (halves[pid] || {})[side];
    const roles = new Map();
    Object.entries(halves).forEach(([w, h]) => ['left', 'right'].forEach((s) => h[s] && roles.set(h[s], { w, s })));
    const seen = new Set();
    const items = [];
    for (const x of groups) {
      for (const id of x.children) {
        if (id === pid || seen.has(id) || !isPlainOption(id)) continue;
        seen.add(id);
        const ent = entity('product', id);
        const name = nameOf('product', ent);
        const parsed = parseHalfName(name);
        const score = parsed ? nameScore(parsed.base, whole) + (parsed.side === side ? 1 : 0) : 0;
        const r = roles.get(id);
        const meta = [
          id === current ? 'Selected' : score >= 1.6 ? 'Suggested' : '',
          r && r.w !== pid ? `${SIDE_LABEL[r.s]} of ${optionName(g, r.w)}` : '',
          x.id === g.id ? '' : `In ${nameOf('group', x)}`,
        ]
          .filter(Boolean)
          .join(' · ');
        items.push({ id, name, alt: posIdOf('product', ent) || '', meta, price: '', score: id === current ? 9 : score });
      }
    }
    items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    openPicker({
      title: `${SIDE_LABEL[side]} of ${optionName(g, pid)}`,
      intro: 'Pick the POS option that rings up when a customer puts this topping on this half.',
      placeholder: 'Search by name or POS ID',
      items,
      noMatch: ['No matching options', 'Try a different name or POS ID.'],
      onPick: (id) => {
        closeModal();
        commit(() => (onPick ? onPick(id) : (g.halves[pid] = { ...(g.halves[pid] || {}), [side]: id })));
      },
    });
  }
