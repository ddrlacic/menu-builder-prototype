'use strict';

  /* ---------- compare to POS ---------- */

  function openCompare() {
    openModal({ title: 'Compare to POS', body: '<div id="cmp"></div>', size: 'lg', top: true, foot: '<div class="modal-foot" id="cmp-foot"></div>' });
    const d = ctx.compare;
    const changes = d.changed.length + d.ignoredChanged.length;
    T.cmp = { tab: d.missing.length || !(changes || d.gone.length) ? 'new' : changes ? 'changed' : 'gone', sel: new Set() };
    renderCompare();
  }

  function renderCompare() {
    if (!T.cmp || !$('#cmp')) return;
    const data = ctx.compare;
    const { tab, sel } = T.cmp;
    for (const k of [...sel]) if (!data.missing.some((m) => m.key === k)) sel.delete(k);
    const posRow = (m, control, grouped, tail = '', note = '') => {
      const it = posItemById(m.posId);
      const ps = grouped ? m.parents.slice(1) : m.parents;
      const where = ps.length > 1 ? `${ps[0]} and ${ps.length - 1} more` : ps[0];
      const place = ps.length ? `<span${ps.length > 1 ? ` title="${esc(listJoin(ps))}"` : ''}>${grouped ? 'Also in' : 'In'} ${esc(where)}</span> · ` : '';
      return `<div class="cmp-row">
        ${control}
        <span class="kind-glyph kind-${it.type}">${icon(KIND_ICON[it.type], 13)}</span>
        <span class="cmp-main"><span class="cmp-name">${esc(it.name)}</span><span class="cmp-meta">${place}<span class="mono">${esc(m.posId)}</span></span>${note ? `<span class="cmp-meta tnum">${esc(note)}</span>` : ''}</span>
        ${tail}
      </div>`;
    };
    const tabs = [
      ['new', 'New on POS', data.missing.length],
      ['changed', 'Changed on POS', data.changed.length + data.ignoredChanged.length],
      ['gone', 'No longer on POS', data.gone.length],
      ['ignored', 'Ignored items', data.ignored.length],
    ];
    let body = `<div class="cmp-tabs">${tabList(tabs, tab, (id) => `data-action="cmp-tab" data-tab="${id}"`)}</div>`;
    const empty = (title) => `<div class="empty-small">${icon('checkCircle', 20)}<strong>${title}</strong></div>`;
    if (tab !== 'ignored' && !data.count) {
      body += `<div class="empty-small">${icon('checkCircle', 20)}<strong>${esc(activeMenu().name)} matches POS</strong><span>Nothing new, changed, or removed since the last review.</span></div>`;
    } else if (tab === 'new') {
      if (!data.missing.length) body += empty('Nothing new on POS');
      else {
        const allOn = data.missing.every((m) => sel.has(m.key));
        const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
        body += `<section class="cmp-section">
          <header class="cmp-head"><p class="section-desc">On POS, but not in ${esc(activeMenu().name)} yet. Anything you leave out is ignored when you import.</p>
            <button type="button" class="btn ghost sm" data-action="cmp-all">${allOn ? 'Clear selection' : 'Select all'}</button></header>
          <div class="cmp-groups">${compareGroups(data.missing)
            .map((g) => {
              const n = g.items.filter((m) => sel.has(m.key)).length;
              const st = n === 0 ? 'off' : n === g.items.length ? 'on' : 'mixed';
              const pi = parsePath(g.path);
              const where = pi.kind === 'menu' || pi.kind === 'category' ? '' : crumbText(pi.parentPath);
              return `<div class="cmp-list">
                <button type="button" class="cmp-row cmp-group-head" role="checkbox" aria-checked="${st === 'mixed' ? 'mixed' : st === 'on'}" data-action="cmp-toggle-group" data-group="${esc(g.key)}">
                  ${box(st)}
                  <span class="kind-glyph kind-${pi.kind}">${icon(KIND_ICON[pi.kind], 13)}</span>
                  <span class="cmp-main"><span class="cmp-name">${esc(g.name)}</span>${where ? `<span class="cmp-meta">${esc(where)}</span>` : ''}</span>
                  <span class="cmp-count tnum">${g.items.length}</span>
                </button>
                ${g.items
                  .map((m) =>
                    posRow(
                      m,
                      `<button type="button" class="check${sel.has(m.key) ? ' is-on' : ''}" role="checkbox" aria-checked="${sel.has(m.key)}" aria-label="Select ${esc(posItemById(m.posId).name)}" data-action="cmp-toggle" data-key="${esc(m.key)}">${sel.has(m.key) ? icon('check', 12) : ''}</button>`,
                      true,
                    ),
                  )
                  .join('')}
              </div>`;
            })
            .join('')}</div>
        </section>`;
      }
    } else if (tab === 'changed') {
      if (!data.changed.length && !data.ignoredChanged.length) body += empty('Nothing changed on POS');
      if (data.changed.length) {
        body += `<section class="cmp-section">
          <header class="cmp-head"><p class="section-desc">Already in the menu. Nothing changes here until you use the POS name or rules.</p>
            <button type="button" class="btn ghost sm" data-action="cmp-review">Mark as reviewed</button></header>
          <div class="cmp-list">${data.changed
            .map(
              (c) => `<div class="cmp-row"><span class="kind-glyph kind-${c.kind}">${icon(KIND_ICON[c.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(c.kind, c.ent))}</span><span class="cmp-meta tnum">${c.diffs.map(esc).join(' · ')}</span>${c.type ? '<span class="cmp-meta">A group’s type can’t change here. To use the POS type, delete the group, then import it again from POS.</span>' : ''}</span>
                ${c.name && c.ent.name !== posItem(c.ent).name ? `<button type="button" class="btn secondary sm" data-action="cmp-use-name" data-path="${esc(c.path)}">Use POS name</button>` : ''}
                ${c.rules && rulesDifferFromPos(c.ent) ? `<button type="button" class="btn secondary sm" data-action="cmp-use-rules" data-path="${esc(c.path)}">Use POS rules</button>` : ''}
                <button type="button" class="btn ghost sm" data-action="cmp-goto" data-path="${esc(c.path)}">Show</button></div>`,
            )
            .join('')}</div>
        </section>`;
      }
      if (data.ignoredChanged.length) {
        body += `<section class="cmp-section">
          <p class="section-desc">Ignored items that changed on POS. Stop ignoring one to add it from New on POS.</p>
          <div class="cmp-list">${data.ignoredChanged
            .map((m) =>
              posRow(
                m,
                '',
                false,
                `<button type="button" class="btn secondary sm" data-action="cmp-unignore" data-key="${esc(m.key)}">Stop ignoring</button>
                <button type="button" class="btn ghost sm" data-action="cmp-keep-ignoring" data-key="${esc(m.key)}">Keep ignoring</button>`,
                m.diffs.join(' · '),
              ),
            )
            .join('')}</div>
        </section>`;
      }
    } else if (tab === 'gone') {
      if (!data.gone.length) body += empty('Nothing deleted or moved on POS');
      else {
        body += `<section class="cmp-section">
          <p class="section-desc">Products and options deleted on POS are hidden from customers. Remove them from the menu, or add them back on POS.</p>
          <div class="cmp-list">${data.gone
            .map((g) => {
              const crumbs = g.paths.map((p) => crumbText(parsePath(p).parentPath));
              const where = crumbs.length > 1 ? `${crumbs[0]} and ${crumbs.length - 1} more` : crumbs[0];
              return `<div class="cmp-row"><span class="kind-glyph kind-${g.kind}">${icon(KIND_ICON[g.kind], 13)}</span>
                <span class="cmp-main"><span class="cmp-name">${esc(nameOf(g.kind, g.ent))}</span><span class="cmp-meta"${crumbs.length > 1 ? ` title="${esc(crumbs.join('\n'))}"` : ''}>${esc(g.label)} · ${esc(where)}</span></span>
                <button type="button" class="btn secondary sm tone-danger" data-action="cmp-remove" data-key="${esc(g.key)}">Remove</button></div>`;
            })
            .join('')}</div>
        </section>`;
      }
    } else {
      body += data.ignored.length
        ? `<section class="cmp-section"><p class="section-desc">Hidden from New on POS. They stay on POS, and show under Changed on POS if they change there.</p><div class="cmp-list">${data.ignored
            .map((m) => posRow(m, '', false, `<button type="button" class="btn ghost sm" data-action="cmp-unignore" data-key="${esc(m.key)}">Stop ignoring</button>`))
            .join('')}</div></section>`
        : `<div class="empty-small"><strong>No ignored items</strong><span>Items you ignore show up here.</span></div>`;
    }
    $('#cmp').innerHTML = body;
    $('#cmp-foot').innerHTML =
      tab === 'new' && data.missing.length
        ? `<span class="foot-note tnum">${sel.size} selected</span>
           <button type="button" class="btn secondary" data-action="cmp-ignore" ${sel.size ? '' : 'disabled'}>Ignore selected</button>
           <button type="button" class="btn primary" data-action="cmp-add" ${sel.size ? '' : 'disabled'}>Add selected</button>`
        : `<button type="button" class="btn secondary" data-modal-close>Done</button>`;
  }

  function compareGroups(list) {
    const groups = new Map();
    for (const m of list) {
      let g = groups.get(m.group);
      if (!g) groups.set(m.group, (g = { key: m.group, path: m.paths[0], name: m.parents[0], items: [] }));
      g.items.push(m);
    }
    return [...groups.values()];
  }

  function compareAdd() {
    const picks = ctx.compare.missing.filter((m) => T.cmp.sel.has(m.key));
    const added = [];
    let places = 0;
    commit(() => {
      for (const m of picks) {
        const it = posItemById(m.posId);
        let placed = false;
        for (const path of m.paths) {
          const pi = parsePath(path);
          const parent = entity(pi.kind, pi.id);
          if (dropError(path, { kind: m.kind, source: 'pos', posId: m.posId, name: it.name })) continue;
          const res = importPos(m.posId);
          if (parent.children.includes(res.id)) continue;
          parent.children.push(res.id);
          stagePosLink(path, m.kind, res.id);
          placed = true;
          places++;
          openRow(path);
          flash(childPath(path, m.kind, res.id));
        }
        if (placed) added.push(it.name);
      }
    });
    T.cmp.sel.clear();
    renderCompare();
    toast(added.length === 1 && places > 1 ? `${added[0]} added to ${places} places` : `${plural(added.length, 'item', 'items')} added from POS`);
  }

  function usePosName(path) {
    const info = parsePath(path);
    const ent = entity(info.kind, info.id);
    const it = posItem(ent);
    if (!it) return;
    commit(() => {
      ent.name = it.name;
      ent.reviewed = { ...ent.reviewed, name: it.name };
    });
  }

  function usePosRules(g) {
    const now = posRulesNow(g);
    if (!now || now.groupType !== groupTypeOf(g)) return commit(() => (g.ruleOverrides = {}));
    return commit(() => {
      g.posRules = { ...(g.posRules || {}), min: now.min, max: now.max };
      g.ruleOverrides = {};
      if (g.reviewed) g.reviewed = { ...g.reviewed, rules: { ...(g.reviewed.rules || now), min: now.min, max: now.max } };
    });
  }

  /* ---------- optimize ---------- */

  const NOT_SHORTHAND = new Set(['BBQ', 'BLT', 'IPA', 'NY', 'XL', 'GF', 'PB', 'OZ']);
  const OPT_PLURAL = { category: 'categories', product: 'products', group: 'groups' };

  function looksLikeShorthand(name) {
    const words = String(name || '').match(/[A-Za-z]+/g) || [];
    return words.some((w) => (w.length >= 2 && w === w.toUpperCase() && !NOT_SHORTHAND.has(w)) || (w.length >= 3 && !/[aeiouy]/i.test(w)));
  }

  function isMenuItemPath(path) {
    const p = parsePath(parsePath(path).parentPath);
    const parent = entity(p.kind, p.id) || {};
    return p.kind === 'category' || (p.kind === 'product' && parent.ptype === 'size') || (p.kind === 'group' && parent.gtype === 'standalone');
  }

  const optEntity = (kind, id) => (kind === 'menu' ? S.data.menus.find((m) => m.id === id) : entity(kind, id));

  function optScope(paths) {
    const menu = activeMenu();
    if (!paths || !paths.length) return { menuId: menu.id, paths: null, kind: 'menu', title: 'Optimize menu' };
    const { kind } = parsePath(paths[0]);
    const info = parsePath(paths[0]);
    const title = paths.length === 1 ? `Optimize ${nameOf(kind, entity(kind, info.id))}` : `Optimize ${plural(paths.length, kind, OPT_PLURAL[kind])}`;
    return { menuId: menu.id, paths: [...paths], kind, title };
  }

  const canGroupSizes = (scope) => scope.kind === 'menu' || scope.kind === 'category';
  const OPT_BATCH_MAX = 100;
  const OPT_PARALLEL = 4;
  const OPT_TABS = [
    ['name', 'Names', 'name', 'names'],
    ['description', 'Descriptions', 'description', 'descriptions'],
    ['sizes', 'Choice products', 'choice product', 'choice products'],
  ];

  function openOptimize(paths = null) {
    const run = T.optRun;
    if (!paths && run && !run.sizesOnly && run.scope.menuId === activeMenu().id && (run.running || run.items.length)) return showOptimize();
    const scope = optScope(paths);
    startOptimize(scope, { sizes: canGroupSizes(scope), names: true, descriptions: true });
    showOptimize();
  }

  function groupSizes(path) {
    const scope = { ...optScope([path]), title: 'Group sizes' };
    startOptimize(scope, { sizes: true, names: false, descriptions: false }, true);
    showOptimize();
  }

  function showOptimize() {
    openModal({ title: T.optRun.scope.title, body: '<div id="opt"></div>', size: 'lg', top: true, foot: '<div class="modal-foot" id="opt-foot"></div>' });
    T.opt = {};
    renderOptimize();
    render();
  }

  function optimizeRequests(scope, pick) {
    const menu = S.data.menus.find((m) => m.id === scope.menuId);
    const roots = scope.paths || menu.children.map((cid) => childPath(menu.id, 'category', cid));
    const sizes = [];
    const batches = new Map();
    const seen = new Set();
    const ask = (catPath, q) => {
      const k = `${q.field}|${q.kind}|${q.id}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (!batches.has(catPath)) batches.set(catPath, []);
      batches.get(catPath).push(q);
    };
    if (!scope.paths && pick.names && roots.length && menu.name === (linkedPosMenu(menu) || {}).name && looksLikeShorthand(menu.name))
      ask(roots[0], { kind: 'menu', id: menu.id, path: menu.id, field: 'name' });
    for (const root of roots) {
      if (!pathExists(root)) continue;
      const catPath = root.split('>').slice(0, 2).join('>');
      walkSubtree(root, (kind, id, ent, path) => {
        if (kind === 'category' && pick.sizes)
          detectSizeSets(ent).forEach((set) => {
            const key = `sizes|${path}|${set.base.toLowerCase()}`;
            if (seen.has(key)) return;
            seen.add(key);
            sizes.push({ key, type: 'sizes', path, set, name: containerName(set) });
          });
        if (pick.names && ent.source === 'pos' && ent.name === (posItem(ent) || ent.reviewed || {}).name && looksLikeShorthand(ent.name)) ask(catPath, { kind, id, path, field: 'name' });
        if (pick.descriptions && !ent.description && (kind === 'category' || (kind === 'product' && isMenuItemPath(path)))) ask(catPath, { kind, id, path, field: 'description' });
      });
    }
    const chunks = [];
    [...batches.values()].forEach((qs, cat) => {
      const ents = [...new Set(qs.map((q) => `${q.kind}|${q.id}`))];
      for (let i = 0; i < ents.length; i += OPT_BATCH_MAX) {
        const part = new Set(ents.slice(i, i + OPT_BATCH_MAX));
        chunks.push({ cat, qs: qs.filter((q) => part.has(`${q.kind}|${q.id}`)) });
      }
    });
    return { sizes, chunks, categories: batches.size };
  }

  function startOptimize(scope, pick, sizesOnly = false) {
    const id = (T.optRunId = (T.optRunId || 0) + 1);
    const { sizes, chunks, categories } = optimizeRequests(scope, pick);
    const left = chunks.reduce((m, c) => ((m[c.cat] = (m[c.cat] || 0) + 1), m), {});
    T.optRun = {
      id, scope, pick, sizesOnly, items: sizes, off: new Set(), edits: {},
      queue: chunks, inflight: 0, left, total: categories, done: 0, running: chunks.length > 0, stopped: false,
      tab: sizesOnly ? 'sizes' : 'name', tabPicked: sizesOnly, applied: {},
    };
    pumpOptimize(T.optRun);
  }

  function pumpOptimize(run) {
    while (run.inflight < OPT_PARALLEL && run.queue.length) {
      const chunk = run.queue.shift();
      run.inflight += 1;
      setTimeout(() => receiveOptimizeBatch(run.id, chunk), 700 + Math.random() * 900);
    }
  }

  function stopOptimize() {
    const run = T.optRun;
    if (!run || !run.running) return;
    Object.assign(run, { queue: [], running: false, stopped: true });
    renderOptimize();
    render();
  }

  function optAnswer(q) {
    const ent = optEntity(q.kind, q.id);
    if (!ent) return null;
    const ext = q.kind === 'menu' ? ent.posExt : ent.externalId;
    const to = (q.field === 'name' ? SUG.names : SUG.descriptions)[ext];
    if (!to) return null;
    if (q.field === 'name') return to === ent.name ? null : { key: `name|${q.kind}|${q.id}`, type: 'name', kind: q.kind, id: q.id, path: q.path, from: ent.name, to };
    return ent.description ? null : { key: `desc|${q.kind}|${q.id}`, type: 'description', kind: q.kind, id: q.id, path: q.path, name: SUG.names[ext] || nameOf(q.kind, ent), to };
  }

  function receiveOptimizeBatch(id, chunk) {
    const run = T.optRun;
    if (!run || run.id !== id || run.stopped) return;
    run.inflight -= 1;
    run.items.push(...chunk.qs.map(optAnswer).filter(Boolean));
    run.left[chunk.cat] -= 1;
    if (!run.left[chunk.cat]) run.done += 1;
    run.running = run.done < run.total;
    pumpOptimize(run);
    renderOptimize();
    render();
    if (run.running || T.opt) return;
    if (run.items.length) toast(`${plural(run.items.length, 'suggestion', 'suggestions')} to review`, 'info', { action: { label: 'Review', onClick: () => openOptimize() } });
    else {
      T.optRun = null;
      toast('Nothing to suggest. Names and descriptions already look good', 'info');
      render();
    }
  }

  function optKindWord(i) {
    if (i.kind === 'product') return isMenuItemPath(i.path) ? 'Product' : 'Option';
    return capitalize(i.kind);
  }

  const optValue = (run, i) => String(run.edits[i.key] ?? (i.type === 'sizes' ? i.name : i.to)).trim();
  const optOn = (run, i) => !run.off.has(i.key) && !!optValue(run, i);

  function sizesStaged(i) {
    return !!pendingRoot(i.path) || i.set.items.some((x) => isPendingLink(childPath(i.path, 'product', x.pid)));
  }

  function renderOptimize() {
    if (!T.opt || !$('#opt')) return;
    const focus = captureFocus();
    renderOptimizeReview();
    restoreFocus(focus);
  }

  function optTabs(run) {
    return OPT_TABS.filter(([type]) => (type === 'sizes' ? run.pick.sizes : !run.sizesOnly));
  }

  function optCurrentTab(run) {
    if (!run.tabPicked) {
      const first = optTabs(run).find(([type]) => run.items.some((i) => i.type === type));
      if (first) Object.assign(run, { tab: first[0], tabPicked: true });
    }
    return run.tab;
  }

  function renderOptimizeReview() {
    const run = T.optRun;
    const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
    const checkBtn = (key, on, label) =>
      `<button type="button" class="check${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on}" aria-label="${esc(label)}" data-action="opt-item" data-key="${esc(key)}">${on ? icon('check', 12) : ''}</button>`;
    const field = (i, label, max, area = false) => {
      const attrs = `class="input sm opt-input" data-opt-edit="${esc(i.key)}" data-focus-key="opt|${esc(i.key)}" aria-label="${esc(label)}" maxlength="${max}"`;
      const v = esc(run.edits[i.key] ?? (i.type === 'sizes' ? i.name : i.to));
      return area ? `<textarea ${attrs} rows="2">${v}</textarea>` : `<input type="text" ${attrs} value="${v}">`;
    };
    const tab = optCurrentTab(run);
    const word = Object.fromEntries(OPT_TABS.map(([t, , one, many]) => [t, [one, many]]));
    const tabs = optTabs(run);
    let body = tabs.length > 1 ? `<div class="cmp-tabs">${tabList(tabs.map(([t, label]) => [t, label, run.items.filter((i) => i.type === t).length]), tab, (id) => `data-action="opt-tab" data-tab="${id}"`)}</div>` : '';
    if (!run.sizesOnly && (run.running || run.stopped))
      body += `<div class="opt-progress tnum">${run.running ? '<span class="spinner"></span><span>Finding suggestions' : '<span>Stopped'} · Checked ${run.done} of ${plural(run.total, 'category', 'categories')}</span></div>`;
    const list = run.items.filter((i) => i.type === tab);
    if (!list.length) {
      const done = run.applied[tab];
      const [one, many] = word[tab];
      const empty = {
        name: ['No name suggestions', 'Only POS shorthand like SML LMNADE gets a suggestion'],
        description: ['No description suggestions', 'Every product and category already has one'],
        sizes: ['No sizes to group', 'Every size is already in a choice product'],
      }[tab];
      if (done) body += `<div class="empty-small">${icon('checkCircle', 20)}<strong>${plural(done, one, many)} ${tab === 'sizes' ? 'created' : 'applied'}</strong></div>`;
      else if (run.running && tab !== 'sizes') body += `<div class="empty-small"><span class="spinner"></span><span>Suggestions show here as they come in</span></div>`;
      else body += `<div class="empty-small">${icon('checkCircle', 20)}<strong>${empty[0]}</strong><span>${run.stopped && tab !== 'sizes' ? 'Search stopped before every category was checked' : empty[1]}</span></div>`;
    } else {
      const n = list.filter((i) => !run.off.has(i.key)).length;
      const st = n === 0 ? 'off' : n === list.length ? 'on' : 'mixed';
      const desc =
        tab === 'sizes'
          ? '<p class="section-desc">Each size stays in its category, hidden there, so it keeps its POS price. Customers find it inside the new product.</p>'
          : tab === 'name'
            ? '<p class="section-desc">POS keeps its own names</p>'
            : '';
      body += `<section class="cmp-section">${desc}<header class="cmp-head"><button type="button" class="opt-all" role="checkbox" aria-checked="${st === 'mixed' ? 'mixed' : st === 'on'}" data-action="opt-section" data-type="${tab}">${box(st)}<span>Select all</span></button></header><div class="cmp-list">${list
        .map((i) => {
          const isOn = !run.off.has(i.key);
          if (tab === 'name')
            return `<div class="cmp-row opt-row">${checkBtn(i.key, isOn, `Use new name for ${i.from}`)}<span class="cmp-main"><span class="cmp-meta">${optKindWord(i)} · ${esc(i.from)}</span>${field(i, `New name for ${i.from}`, 255)}</span></div>`;
          if (tab === 'description')
            return `<div class="cmp-row opt-row">${checkBtn(i.key, isOn, `Add description to ${i.name}`)}<span class="cmp-main"><span class="cmp-meta">${optKindWord(i)} · ${esc(i.name)}</span>${field(i, `Description for ${i.name}`, DESC_LIMIT, true)}</span></div>`;
          const staged = sizesStaged(i);
          return `<div class="cmp-row opt-row">${checkBtn(i.key, isOn, `Create ${i.name}`)}<span class="cmp-main"><span class="cmp-meta">${esc(listJoin(i.set.items.map((x) => capitalize(x.size))))} · in ${esc(nameOf('category', entity('category', parsePath(i.path).id)))}</span>${field(i, 'Choice product name', 255)}</span>${staged ? '<span class="badge tone-staged" title="Import creates it">Not imported</span>' : ''}</div>`;
        })
        .join('')}</div></section>`;
    }
    $('#opt').innerHTML = body;
    const on = list.filter((i) => optOn(run, i)).length;
    const [one, many] = word[tab];
    const verb = tab === 'sizes' ? 'Create' : 'Apply';
    $('#opt-foot').innerHTML = `${run.running ? `<button type="button" class="btn ghost" data-action="opt-stop">Stop search</button><span class="foot-spacer"></span>` : ''}
      <button type="button" class="btn secondary" data-modal-close>${run.sizesOnly ? 'Cancel' : 'Close'}</button>
      <button type="button" class="btn primary" data-action="opt-apply" ${on ? '' : 'disabled'}>${verb} ${on ? plural(on, one, many) : many}</button>`;
  }

  function applyOptimize() {
    const run = T.optRun;
    const tab = run.tab;
    const picks = run.items.filter((i) => i.type === tab && optOn(run, i));
    let applied = 0;
    const ok = commit(() => {
      for (const i of picks) {
        if (i.type === 'sizes') continue;
        const ent = optEntity(i.kind, i.id);
        if (!ent) continue;
        if (i.type === 'name') {
          if (ent.name !== i.from) continue;
          ent.name = optValue(run, i);
        } else {
          if (ent.description) continue;
          ent.description = optValue(run, i);
        }
        applied += 1;
      }
      for (const i of picks.filter((x) => x.type === 'sizes')) {
        const catPath = i.path;
        if (!pathExists(catPath)) continue;
        const cat = entity('category', parsePath(catPath).id);
        const grouped = new Set(cat.children.flatMap((pid) => (entity('product', pid) || {}).ptype === 'size' ? entity('product', pid).children : []));
        const pids = i.set.items.map((x) => x.pid).filter((pid) => cat.children.includes(pid) && !grouped.has(pid));
        if (pids.length < 2) continue;
        const staged = sizesStaged(i);
        const sizePaths = pids.map((pid) => childPath(catPath, 'product', pid));
        const container = newProduct({ ptype: 'size', name: optValue(run, i), children: pids });
        if (staged) Object.assign(container, { pending: true, hideOnImport: sizePaths });
        S.data.entities.product[container.id] = container;
        cat.children.splice(cat.children.indexOf(pids[0]), 0, container.id);
        const cp = childPath(catPath, 'product', container.id);
        if (!staged) sizePaths.forEach((sp) => (S.data.placements[sp] = { ...placement(sp), hidden: true }));
        openRow(catPath);
        openRow(cp);
        flash(cp);
        applied += 1;
      }
    });
    if (!ok) return;
    run.items.filter((i) => i.type === tab).forEach((i) => {
      run.off.delete(i.key);
      delete run.edits[i.key];
    });
    run.items = run.items.filter((i) => i.type !== tab);
    run.applied[tab] = (run.applied[tab] || 0) + applied;
    if (!run.items.length && !run.running) {
      T.optRun = null;
      closeModal();
    } else {
      const next = optTabs(run).find(([type]) => run.items.some((i) => i.type === type));
      if (next) run.tab = next[0];
      renderOptimize();
    }
    render();
    const [one, many] = OPT_TABS.find(([t]) => t === tab).slice(2);
    if (applied) toast(`${plural(applied, one, many)} successfully ${tab === 'sizes' ? 'created' : 'applied'}`, 'success', { action: { label: 'Undo', onClick: undo } });
    else toast('No changes applied. These items changed after the suggestions came in', 'info');
  }

  function finishStagedSizes() {
    for (const p of Object.values(S.data.entities.product)) {
      if (!p.hideOnImport) continue;
      p.hideOnImport.filter(pathExists).forEach((sp) => (S.data.placements[sp] = { ...placement(sp), hidden: true }));
      delete p.hideOnImport;
    }
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
    const current = (halves[pid] || {})[side];
    const otherSide = side === 'left' ? 'right' : 'left';
    const other = (halves[pid] || {})[otherSide];
    const roles = new Map();
    Object.entries(halves).forEach(([w, h]) => ['left', 'right'].forEach((s) => h[s] && roles.set(h[s], { w, s })));
    const item = (id) => {
      const ent = entity('product', id);
      const r = roles.get(id);
      const meta = id === other ? `Already the ${SIDE_LABEL[otherSide].toLowerCase()}` : r && r.w !== pid ? `${SIDE_LABEL[r.s]} of ${optionName(g, r.w)}` : '';
      return { id, name: nameOf('product', ent), code: posIdOf('product', ent) || '', meta, disabled: id === other };
    };
    openListPicker({
      title: `${SIDE_LABEL[side]} of ${optionName(g, pid)}`,
      intro: 'Pick the POS option that rings up when a customer puts this topping on this half.',
      placeholder: 'Search by name or POS ID',
      groups: groups.map((x) => ({ id: x.id, name: nameOf('group', x), items: x.children.filter((id) => id !== pid && isHalfOption(id)).map(item) })),
      noun: ['option', 'options'],
      empty: 'No options to pick from',
      single: true,
      selected: current ? [current] : [],
      openAll: true,
      cta: () => (current ? 'Save' : `Add ${SIDE_LABEL[side].toLowerCase()}`),
      onSave: ([id]) => {
        if (id === current) return;
        commit(() => (onPick ? onPick(id) : (g.halves[pid] = { ...(g.halves[pid] || {}), [side]: id })));
      },
    });
  }

  const BULK_IMAGE_SIDE = 360;

  function openBulkImages(path = null) {
    const menu = activeMenu();
    const scopeName = path ? nameOf('category', entity('category', parsePath(path).id)) : menu.name || 'Untitled menu';
    openModal({ title: 'Upload images', body: '<div id="bi"></div>', size: 'lg', foot: '<div class="modal-foot" id="bi-foot"></div>' });
    T.bi = { menuId: menu.id, roots: path ? [path] : menu.children.map((cid) => childPath(menu.id, 'category', cid)), scopeName, step: 'pick', files: [], skipped: 0, empty: false };
    renderBulkImages();
  }

  function bulkImageProducts(o) {
    const out = new Map();
    const skip = new Set();
    o.roots.filter(pathExists).forEach((root) =>
      walkSubtree(root, (kind, id, ent, p) => {
        if (kind !== 'product' || skip.has(id) || pendingRoot(p)) return;
        if (halfRole(p) || isHalfName(nameOf('product', ent))) {
          if (!out.has(id)) skip.add(id);
          return;
        }
        if (!out.has(id)) out.set(id, { ent, path: p, contexts: new Set() });
        const cat = parsePath(p.split('>').slice(0, 2).join('>'));
        const parent = parsePath(parsePath(p).parentPath);
        if (cat.kind === 'category') out.get(id).contexts.add(nameOf('category', entity('category', cat.id)));
        if (parent.kind === 'group') out.get(id).contexts.add(nameOf('group', entity('group', parent.id)));
      }),
    );
    return [...out.values()].map((x) => ({ ...x, contexts: [...x.contexts] }));
  }

  async function filesFromDrop(dt) {
    const entries = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return [...dt.files].map((file) => ({ file, rel: file.name }));
    const out = [];
    const walk = async (entry) => {
      if (entry.isFile) {
        out.push({ file: await new Promise((res, rej) => entry.file(res, rej)), rel: entry.fullPath.replace(/^\//, '') });
        return;
      }
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    };
    for (const e of entries) await walk(e);
    return out;
  }

  function dropBulkImages(dt) {
    const o = T.bi;
    o.step = 'reading';
    renderBulkImages();
    filesFromDrop(dt).then(
      (list) => T.bi === o && receiveBulkImages(list),
      () => T.bi === o && receiveBulkImages([]),
    );
  }

  function receiveBulkImages(list) {
    const o = T.bi;
    if (!o) return;
    o.files.forEach((f) => URL.revokeObjectURL(f.url));
    const visible = list.filter((x) => !x.file.name.startsWith('.'));
    const imgs = visible.filter((x) => IMAGE_EXT_RE.test(x.file.name));
    const tops = new Set(imgs.map((x) => x.rel.split('/')[0]));
    const strip = tops.size === 1 && imgs.every((x) => x.rel.includes('/'));
    o.files = imgs.map((x, n) => ({
      id: `f${n}`,
      file: x.file,
      rel: strip ? x.rel.slice(x.rel.indexOf('/') + 1) : x.rel,
      title: x.file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(x.file),
    }));
    o.skipped = visible.length - imgs.length;
    if (!o.files.length) {
      Object.assign(o, { step: 'pick', empty: true });
      return renderBulkImages();
    }
    const { items, unused } = matchProductImages(bulkImageProducts(o), o.files);
    Object.assign(o, { step: 'review', empty: false, items, unused, picks: {}, tab: 'match', off: new Set(items.filter((i) => i.ent.image).map((i) => i.ent.id)) });
    renderBulkImages();
  }

  const biChosen = (o, i) => i.cands[o.picks[i.ent.id] || 0];
  const biOn = (o) => o.items.filter((i) => i.cands.length && !o.off.has(i.ent.id));

  function biWhere(path) {
    const p = parsePath(parsePath(path).parentPath);
    const parent = nameOf(p.kind, entity(p.kind, p.id));
    return isMenuItemPath(path) ? `In ${parent}` : `Option in ${parent}`;
  }

  function renderBulkImages() {
    const o = T.bi;
    if (!o || !$('#bi')) return;
    const focus = captureFocus();
    $('#bi').innerHTML = o.step === 'review' ? bulkImagesReview(o) : bulkImagesPick(o);
    const n = o.step === 'review' ? biOn(o).length : 0;
    $('#bi-foot').innerHTML =
      o.step === 'saving'
        ? `<span class="opt-progress tnum"><span class="spinner"></span>Uploading ${o.done} of ${plural(o.total, 'image', 'images')}</span>`
        : o.step === 'review'
          ? `<button type="button" class="btn ghost" data-action="bi-restart">Choose other images</button><span class="foot-spacer"></span>
            <button type="button" class="btn secondary" data-modal-close>Cancel</button>
            <button type="button" class="btn primary" data-action="bi-apply" ${n ? '' : 'disabled'}>${n ? `Upload images to ${plural(n, 'product', 'products')}` : 'Upload images'}</button>`
          : '<button type="button" class="btn secondary" data-modal-close>Cancel</button>';
    restoreFocus(focus);
  }

  function bulkImagesPick(o) {
    const intro = `<p>Images are matched to products in ${esc(o.scopeName)} by file name. Sizes like Large or 20oz are ignored, so one image covers every size.</p>`;
    if (o.step === 'reading') return `${intro}<div class="empty-small"><span class="spinner"></span><span>Reading images</span></div>`;
    return `${intro}
      ${o.empty ? callout('warning', `No JPG, PNG, or GIF images found${o.skipped ? ` in ${plural(o.skipped, 'file', 'files')}` : ''}. Choose a different folder or images.`) : ''}
      <div class="dropzone bi-drop" data-bi-drop>${icon('image', 20)}
        <span>Drop a folder or images here</span>
        <span><label class="link">Choose a folder<input type="file" data-bi-files webkitdirectory multiple hidden></label> or <label class="link">choose images<input type="file" data-bi-files multiple accept="${IMAGE_TYPES.join(',')}" hidden></label></span>
        <span class="field-help">JPG, PNG, or GIF. Subfolders are included and large images are made smaller.</span>
      </div>`;
  }

  function bulkImagesReview(o) {
    const match = o.items.filter((i) => i.cands.length);
    const missing = o.items.filter((i) => !i.cands.length && !i.ent.image);
    const tabs = [
      ['match', 'Matched', match.length],
      ['missing', 'No image found', missing.length],
      ['unused', 'Not used', o.unused.length],
    ];
    const box = (st) => `<span class="check${st === 'off' ? '' : ' is-on'}" aria-hidden="true">${st === 'on' ? icon('check', 12) : st === 'mixed' ? icon('minus', 12) : ''}</span>`;
    const empty = (title, text) => `<div class="empty-small">${icon('checkCircle', 20)}<strong>${title}</strong>${text ? `<span>${text}</span>` : ''}</div>`;
    const list = (rows) => `<div class="cmp-list">${rows.join('')}</div>`;
    let body = `<div class="cmp-tabs">${tabList(tabs, o.tab, (id) => `data-action="bi-tab" data-tab="${id}"`)}</div>`;
    if (o.skipped) body += `<p class="section-desc">${plural(o.skipped, 'file', 'files')} skipped. Only JPG, PNG, and GIF images can be uploaded.</p>`;
    if (o.tab === 'match') {
      if (!match.length) return body + empty('No images match', `No file name matches a product in ${esc(o.scopeName)}. Check the names, or choose other images.`);
      const on = match.filter((i) => !o.off.has(i.ent.id)).length;
      const st = on === 0 ? 'off' : on === match.length ? 'on' : 'mixed';
      const desc = match.some((i) => i.ent.image) ? '<p class="section-desc">Products that already have an image are not selected. Select them to replace their image.</p>' : '';
      return `${body}<section class="cmp-section">${desc}<header class="cmp-head"><button type="button" class="opt-all" role="checkbox" aria-checked="${st === 'mixed' ? 'mixed' : st === 'on'}" data-action="bi-all">${box(st)}<span>Select all</span></button></header>${list(
        match.map((i) => {
          const name = nameOf('product', i.ent);
          const c = biChosen(o, i);
          const isOn = !o.off.has(i.ent.id);
          const meta = [biWhere(i.path), i.cands.length > 1 ? `${i.cands.length} images match` : c.file.rel, !c.exact && c.dropped.length ? `Matched without ${listJoin(c.dropped.map((w) => `“${w}”`))}` : ''].filter(Boolean).join(' · ');
          const pick =
            i.cands.length > 1
              ? `<select class="input sm bi-pick" data-bi-pick="${esc(i.ent.id)}" aria-label="Image for ${esc(name)}">${i.cands.map((x, n) => `<option value="${n}" ${x === c ? 'selected' : ''}>${esc(x.file.rel)}</option>`).join('')}</select>`
              : '';
          return `<div class="cmp-row bi-row">
            <button type="button" class="check${isOn ? ' is-on' : ''}" role="checkbox" aria-checked="${isOn}" aria-label="Upload image to ${esc(name)}" data-action="bi-item" data-key="${esc(i.ent.id)}">${isOn ? icon('check', 12) : ''}</button>
            <img class="thumb thumb-img thumb-lg" src="${c.file.url}" alt="">
            <span class="cmp-main"><span class="cmp-name">${esc(name)}</span><span class="cmp-meta">${esc(meta)}</span></span>
            ${i.ent.image ? `<span class="badge" title="Select it to replace the image">Has an image</span>` : ''}${pick}</div>`;
        }),
      )}</section>`;
    }
    if (o.tab === 'missing') {
      if (!missing.length) return body + empty('Every product has an image or a match');
      const row = (i) => `<div class="cmp-row bi-row">${thumb('product', i.ent, 'thumb-lg')}<span class="cmp-main"><span class="cmp-name">${esc(nameOf('product', i.ent))}</span><span class="cmp-meta">${esc(biWhere(i.path))}</span></span></div>`;
      const part = (title, rows) => (rows.length ? `<section class="cmp-section"><h3 class="section-title">${title}<span class="tnum"> · ${rows.length}</span></h3>${list(rows.map(row))}</section>` : '');
      return `${body}<p class="section-desc">No file name matches these products. Rename the images to match, or add them one by one.</p><div class="cmp-groups">${part(
        'Products',
        missing.filter((i) => isMenuItemPath(i.path)),
      )}${part(
        'Options',
        missing.filter((i) => !isMenuItemPath(i.path)),
      )}</div>`;
    }
    if (!o.unused.length) return body + empty('Every image matches a product');
    return `${body}<p class="section-desc">No product in ${esc(o.scopeName)} has a matching name.</p>${list(
      o.unused.map((f) => `<div class="cmp-row bi-row"><img class="thumb thumb-img thumb-lg" src="${f.url}" alt=""><span class="cmp-main"><span class="cmp-name">${esc(f.title)}</span><span class="cmp-meta">${esc(f.rel)}</span></span></div>`),
    )}`;
  }

  async function applyBulkImages() {
    const o = T.bi;
    const picks = biOn(o).map((i) => ({ id: i.ent.id, path: i.path, file: biChosen(o, i).file }));
    if (!picks.length) return;
    const files = [...new Set(picks.map((p) => p.file))];
    Object.assign(o, { step: 'saving', done: 0, total: files.length });
    renderBulkImages();
    const urls = new Map();
    for (const f of files) {
      try {
        urls.set(f, await shrinkImage(f.file, BULK_IMAGE_SIDE, 0.72));
      } catch (_) {
        /* counted below */
      }
      if (T.bi !== o) return;
      o.done += 1;
      renderBulkImages();
    }
    const ok = picks.filter((p) => urls.has(p.file) && entity('product', p.id));
    const failed = files.length - urls.size;
    closeModal();
    if (!ok.length) return toast('Couldn’t read the images. Use JPG, PNG, or GIF files', 'error');
    if (!commit(() => ok.forEach((p) => (entity('product', p.id).image = urls.get(p.file))))) return;
    ok.forEach((p) => flash(p.path));
    render();
    const one = ok.length === 1 ? nameOf('product', entity('product', ok[0].id)) : '';
    toast(one ? `Image successfully added to ${one}` : `Images successfully added to ${plural(ok.length, 'product', 'products')}`, 'success', { action: { label: 'Undo', onClick: undo } });
    if (failed) toast(`Couldn’t read ${plural(failed, 'image', 'images')}. Add ${failed === 1 ? 'it' : 'them'} one by one`, 'error');
  }
