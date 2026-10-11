// Stadium Cashbook UI.
(function () {
  const M = window.Model;
  const { fmt, pct, esc, barChart } = window.Report;
  const native = window.native || null; // present when running inside the Mac app

  const state = { data: null, view: 'dashboard', month: new Date().getMonth(), tab: 'daily', list: 0, reportMonth: Math.max(0, new Date().getMonth() - 1) };
  const $ = (sel, el = document) => el.querySelector(sel);
  const view = () => $('#view');
  const year = () => state.data.years[state.data.currentYear];
  const Y = () => Number(state.data.currentYear);

  // ---------- storage ----------
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const json = JSON.stringify(state.data);
      try {
        if (native) await native.saveData(json);
        else localStorage.setItem('cashbook-data', json);
      } catch (e) {
        toast('Could not save: ' + e.message);
      }
    }, 300);
  }
  async function load() {
    let json = null;
    try { json = native ? await native.loadData() : localStorage.getItem('cashbook-data'); } catch { json = null; }
    state.data = M.normalize(json ? JSON.parse(json) : null);
  }
  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); const json = JSON.stringify(state.data); if (native) native.saveData(json); else localStorage.setItem('cashbook-data', json); }
  });

  // ---------- small helpers ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const money = (n) => fmt(n);
  const blank0 = (n) => (n ? fmt(n) : '');
  const changeSpan = (v) => (v == null ? '' : `<span class="${v >= 0 ? 'up' : 'down'}">${pct(v)}</span>`);
  const cellText = (raw) => (raw === null || raw === undefined || raw === '' ? '' : M.isExpression(raw) ? fmt(M.evalExpr(raw)) : isNaN(M.evalExpr(raw)) ? String(raw) : fmt(M.evalExpr(raw)));
  const parseInput = (s) => {
    s = String(s).trim();
    if (!s) return null;
    if (M.isExpression(s)) return s.replace(/^=/, '');
    const v = M.evalExpr(s);
    return isNaN(v) ? s : v;
  };

  function popupMenu(x, y, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { closeMenu(); items[b.dataset.i].action(); } });
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    function outside(e) { if (!m.contains(e.target)) closeMenu(); }
    m._outside = outside;
  }
  // window.prompt does not exist in Electron, so text questions use this small dialog.
  function ask(message, def = '') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-back';
      wrap.innerHTML = `<form class="modal"><p>${esc(message)}</p><input value="${esc(def)}" spellcheck="false"><div class="toolbar"><span class="spacer"></span><button type="button" class="btn" data-x>Cancel</button><button class="btn primary">OK</button></div></form>`;
      document.body.appendChild(wrap);
      const inp = wrap.querySelector('input');
      inp.focus();
      inp.select();
      const done = (v) => { wrap.remove(); resolve(v); };
      wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(inp.value); });
      wrap.querySelector('[data-x]').addEventListener('click', () => done(null));
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    });
  }
  function closeMenu() { document.querySelectorAll('.menu').forEach((m) => { document.removeEventListener('mousedown', m._outside); m.remove(); }); }

  async function pickFile(extensions, title) {
    if (native) return native.openFile({ title, extensions });
    return new Promise((resolve) => {
      const inp = $('#fileInput');
      inp.accept = extensions.map((e) => '.' + e).join(',');
      inp.value = '';
      inp.onchange = async () => { const f = inp.files[0]; resolve(f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null); };
      inp.click();
    });
  }
  async function saveFile(defaultName, data, extensions) {
    if (native) return native.saveFile({ defaultName, data: data instanceof Uint8Array ? data : new Uint8Array(data), extensions });
    const blob = new Blob([data]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return defaultName;
  }

  // ---------- navigation ----------
  function renderNav() {
    const sel = $('#yearSelect');
    sel.innerHTML = Object.keys(state.data.years).sort().map((y) => `<option ${Number(y) === Y() ? 'selected' : ''}>${y}</option>`).join('') + '<option value="new">+ New year…</option>';
    const item = (id, label, extra = '') => `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${label}${extra}</button>`;
    const monthBtns = M.MONTHS.map((n, m) => {
      const has = M.monthSummary(state.data, Y(), m).hasData;
      return `<button data-view="month" data-month="${m}" class="${state.view === 'month' && state.month === m ? 'active' : ''}">${n.slice(0, 3)}${has ? '<span class="dot"></span>' : ''}</button>`;
    }).join('');
    $('#nav').innerHTML = `
      ${item('dashboard', 'Overview')}
      <div class="group">Months</div><div class="months">${monthBtns}</div>
      <div class="group">Year</div>
      ${item('cash', 'Cash on Hand')}
      ${item('bank', 'Bank')}
      ${item('employees', 'Employees')}
      ${item('profit', 'Profitability')}
      ${item('compare', 'Compare Years')}
      ${item('lists', 'Other Lists')}
      <div class="group">Reports</div>
      ${item('report', 'Monthly Report')}
      ${item('settings', 'Import / Export')}`;
  }

  function go(viewName, extra = {}) {
    Object.assign(state, { view: viewName }, extra);
    render();
  }

  function render() {
    closeMenu();
    renderNav();
    const scroll = view().scrollTop;
    const views = { dashboard: renderDashboard, month: renderMonth, cash: renderCash, bank: renderBank, employees: renderEmployees, profit: renderProfit, compare: renderCompare, lists: renderLists, report: renderReport, settings: renderSettings };
    (views[state.view] || renderDashboard)();
    if (state._keepScroll) view().scrollTop = scroll;
    state._keepScroll = false;
  }
  const setHeader = (title, actions = '') => { $('#title').textContent = title; $('#actions').innerHTML = actions; };

  // ---------- Overview ----------
  function renderDashboard() {
    const t = M.yearTotals(state.data, Y());
    const cp = M.cashPosition(state.data, Y());
    setHeader(`Overview ${Y()}`, `<button class="btn" data-act="import">Import Excel…</button><button class="btn" data-act="export">Export to Excel…</button><button class="btn primary" data-act="report">Monthly Report</button>`);
    const months = cp.months;
    const monthLabels = M.MONTHS.map((n) => n.slice(0, 3));
    view().innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="label">Cash on hand</div><div class="value">${money(cp.total)}</div><div class="sub">Opening ${money(cp.opening)}</div></div>
        <div class="tile"><div class="label">Total sales</div><div class="value">${money(t.sales)}</div></div>
        <div class="tile"><div class="label">Daily cash</div><div class="value">${money(t.cash)}</div></div>
        <div class="tile"><div class="label">General expenses</div><div class="value">${money(t.general)}</div></div>
        <div class="tile"><div class="label">Paid from till</div><div class="value">${money(t.payouts)}</div></div>
        <div class="tile"><div class="label">Credit card</div><div class="value">${money(t.credit)}</div><div class="sub">Diff vs Total R ${money(t.cardDiff)}</div></div>
      </div>
      <div class="card"><h2>Total sales by month</h2><div class="chart">${barChart(months.map((s) => s.sales), M.MONTHS.map((n) => `${n} ${Y()}`), { short: monthLabels, label: 'Total sales by month', height: 180 })}</div></div>
      <div class="card"><h2>Months</h2>
        <table class="data"><thead><tr><th>Month</th><th>Total sales</th><th>vs last year</th><th>Daily cash</th><th>vs last year</th><th>Paid from till</th><th>General exp.</th><th>Credit card</th><th>Bank in/out</th><th>Net cash</th><th>Cash on hand</th></tr></thead>
        <tbody>${months.map((s, m) => `<tr class="click" data-month="${m}"><td>${s.name}</td><td>${money(s.sales)}</td><td>${changeSpan(s.salesChangePct)}</td><td>${money(s.cash)}</td><td>${changeSpan(s.cashChangePct)}</td>
          <td>${money(s.payouts)}</td><td>${money(s.general)}</td><td>${money(s.credit)}</td><td>${money(s.withdrawals - s.deposits)}</td><td class="${s.netCash < 0 ? 'down' : ''}">${money(s.netCash)}</td><td>${money(s.balance)}</td></tr>`).join('')}
          <tr class="total"><td>Year</td><td>${money(t.sales)}</td><td></td><td>${money(t.cash)}</td><td></td><td>${money(t.payouts)}</td><td>${money(t.general)}</td><td>${money(t.credit)}</td><td>${money(t.withdrawals - t.deposits)}</td><td>${money(t.netCash)}</td><td>${money(cp.total)}</td></tr>
        </tbody></table>
        <p class="hint">Click a month to open it. Cash on hand = opening balance + daily cash − general expenses − bank deposits + bank withdrawals (+ adjustments on the Cash on Hand page).</p>
      </div>`;
    view().querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', () => go('month', { month: Number(tr.dataset.month) })));
  }

  // ---------- Month ----------
  function renderMonth() {
    const m = state.month;
    const s = M.monthSummary(state.data, Y(), m);
    setHeader(`${M.MONTHS[m]} ${Y()}`, `<button class="btn" data-act="prev-month">‹ Prev</button><button class="btn" data-act="next-month">Next ›</button><button class="btn primary" data-act="month-report">Report for this month</button>`);
    const tab = (id, label) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`;
    view().innerHTML = `
      <div class="tiles" id="monthTiles"></div>
      <div class="tabs">${tab('daily', 'Daily (Till)')}${tab('general', 'General Expenses')}${tab('card', 'Credit Card')}${tab('notes', 'Notes')}</div>
      <div id="tabBody"></div>`;
    renderMonthTiles(s);
    view().querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderMonth(); }));
    const body = $('#tabBody');
    const mo = year().months[m];
    if (state.tab === 'daily') renderGrid(body, mo.daily, { cash: true, totalLabel: 'Total Sales' });
    else if (state.tab === 'general') renderGrid(body, mo.general, { cash: false, totalLabel: 'Total Expenses' });
    else if (state.tab === 'card') renderCard(body, mo);
    else renderNotes(body, mo);
  }

  // "2025: 251,527.00 +4.2%" with a note when the figure was typed rather than taken from stored data.
  function lyLine(p, now) {
    if (p.v == null) return '';
    const ch = now ? M.pctChange(now, p.v) : null;
    return `${Y() - 1}${p.src === 'typed' ? ' (typed)' : ''}: ${money(p.v)} ${changeSpan(ch)}`;
  }
  function renderMonthTiles(s) {
    const el = $('#monthTiles');
    if (!el) return;
    el.innerHTML = `
      <div class="tile"><div class="label">Total sales</div><div class="value">${money(s.sales)}</div><div class="sub">${lyLine(s.prev.sales, s.sales)}</div></div>
      <div class="tile"><div class="label">Daily cash</div><div class="value">${money(s.cash)}</div><div class="sub">${lyLine(s.prev.cash, s.cash)}</div></div>
      <div class="tile"><div class="label">Paid from till</div><div class="value">${money(s.payouts)}</div><div class="sub">${lyLine(s.prev.payouts, s.payouts)}</div></div>
      <div class="tile"><div class="label">General expenses</div><div class="value">${money(s.general)}</div><div class="sub">${lyLine(s.prev.general, s.general)}</div></div>
      <div class="tile"><div class="label">Credit card</div><div class="value">${money(s.credit)}</div><div class="sub">Diff ${money(s.cardDiff)}${s.prev.credit.v != null ? ` · ${lyLine(s.prev.credit, s.credit)}` : ''}</div></div>
      <div class="tile"><div class="label">Net cash</div><div class="value ${s.netCash < 0 ? 'down' : ''}">${money(s.netCash)}</div></div>`;
  }
  const refreshTiles = () => renderMonthTiles(M.monthSummary(state.data, Y(), state.month));

  // Spreadsheet-style grid: categories down, days across.
  function renderGrid(body, sheet, opts) {
    const m = state.month, days = M.daysInMonth(Y(), m);
    const today = new Date();
    const isWeekend = (d) => { const w = new Date(Y(), m, d).getDay(); return w === 0; };
    const head = ['<th class="name">Category</th>'];
    for (let d = 1; d <= days; d++) {
      const wd = new Date(Y(), m, d).toLocaleDateString('en-GB', { weekday: 'short' });
      head.push(`<th class="${isWeekend(d) ? 'weekend' : ''}">${d}<small>${wd}</small></th>`);
    }
    head.push('<th class="total">Total</th>');
    const rowHtml = (r, idx, special) => {
      const cells = special ? sheet.cash : r.cells;
      let h = `<tr class="${special ? 'special' : ''}" data-row="${special ? 'cash' : idx}"><td class="name">`;
      h += special ? `<input value="Daily Cash" disabled>` : `<input class="rname" value="${esc(r.name)}" spellcheck="false"><button class="icon rowmenu" title="Row options">⋯</button>`;
      h += '</td>';
      for (let d = 1; d <= days; d++) {
        const raw = cells[d];
        const cls = [M.isExpression(raw) ? 'expr' : '', raw != null && raw !== '' && isNaN(M.evalExpr(raw)) ? 'invalid' : ''].join(' ');
        h += `<td class="cell ${isWeekend(d) ? 'weekend' : ''}"><input data-d="${d}" class="${cls}" value="${esc(cellText(raw))}" title="${M.isExpression(raw) ? esc('=' + raw) : ''}"></td>`;
      }
      h += `<td class="total">${blank0(special ? M.mapTotal(cells) : M.rowTotal(r))}</td></tr>`;
      return h;
    };
    let rows = sheet.rows.map((r, i) => rowHtml(r, i, false)).join('');
    if (opts.cash) rows += rowHtml(null, -1, true);
    let sum = `<tr class="sum"><td class="name">${opts.totalLabel}</td>`;
    for (let d = 1; d <= days; d++) sum += `<td data-sum="${d}"></td>`;
    sum += `<td class="total" data-sum="all"></td></tr>`;

    const ly = sheet.lastYear;
    body.innerHTML = `
      <div class="toolbar">
        <button class="btn" data-g="add">+ Add category</button>
        <button class="btn" data-g="copyprev">Copy categories from previous month</button>
        <span class="spacer"></span>
        <span class="hint">Type numbers or sums like <b>270+360</b>. Enter/arrow keys move between cells.</span>
      </div>
      <div class="grid-wrap"><table class="grid"><thead><tr>${head.join('')}</tr></thead><tbody>${rows}${sum}</tbody></table></div>
      ${opts.cash ? `<div class="card" style="margin-top:12px"><h2>Compare with last year</h2><div class="compare">
        <label>Last year daily cash<input id="lyCash" value="${esc(ly.cash ?? '')}" placeholder="${state.data.years[Y() - 1] ? esc(fmt(M.monthTotals(state.data, Y() - 1, m).cash)) : ''}"></label>
        <label>Last year total sales<input id="lySales" value="${esc(ly.sales ?? '')}" placeholder="${state.data.years[Y() - 1] ? esc(fmt(M.monthTotals(state.data, Y() - 1, m).sales)) : ''}"></label>
        <div id="lyResult" class="hint"></div></div>
        <p class="hint">${state.data.years[Y() - 1]
          ? `${Y() - 1} is in the app, so its real totals are used automatically. Anything typed here takes priority — clear these boxes to use the ${Y() - 1} data.`
          : `Leave empty if you don't know. If you import or enter ${Y() - 1}, its real totals are used automatically.`}</p></div>` : ''}`;

    const table = $('table.grid', body);
    const updateSums = () => {
      let all = 0;
      for (let d = 1; d <= days; d++) {
        const v = M.dayTotal(sheet.rows, d) + (opts.cash ? M.val(sheet.cash[d]) : 0);
        all += v;
        table.querySelector(`[data-sum="${d}"]`).textContent = v ? money(v) : '';
      }
      table.querySelector('[data-sum="all"]').textContent = money(all);
      if (opts.cash) {
        const s = M.monthSummary(state.data, Y(), m);
        const lr = $('#lyResult', body);
        if (lr) lr.innerHTML = [
          s.cashChange != null ? `Daily cash: ${money(s.cashChange)} (${changeSpan(s.cashChangePct)}) vs ${money(s.lyCash)}${s.lyCashSource === 'data' ? ` from ${Y() - 1} data` : ''}` : '',
          s.salesChange != null ? `Total sales: ${money(s.salesChange)} (${changeSpan(s.salesChangePct)}) vs ${money(s.lySales)}${s.lySalesSource === 'data' ? ` from ${Y() - 1} data` : ''}` : '',
        ].filter(Boolean).join(' &nbsp;·&nbsp; ');
      }
    };
    updateSums();

    table.addEventListener('focusin', (e) => {
      const inp = e.target;
      if (!inp.dataset.d) return;
      const tr = inp.closest('tr');
      const r = tr.dataset.row === 'cash' ? sheet.cash : sheet.rows[tr.dataset.row].cells;
      const raw = r[inp.dataset.d];
      inp.value = raw == null ? '' : M.isExpression(raw) ? '=' + raw : String(raw);
      inp.select();
    });
    table.addEventListener('focusout', (e) => {
      const inp = e.target;
      const tr = inp.closest('tr');
      if (inp.classList.contains('rname')) {
        const row = sheet.rows[tr.dataset.row];
        if (row.name !== inp.value.trim()) { row.name = inp.value.trim(); save(); }
        return;
      }
      if (!inp.dataset.d) return;
      const cells = tr.dataset.row === 'cash' ? sheet.cash : sheet.rows[tr.dataset.row].cells;
      const d = inp.dataset.d;
      const v = parseInput(inp.value);
      if (v === null) delete cells[d]; else cells[d] = v;
      inp.value = cellText(v);
      inp.className = [M.isExpression(v) ? 'expr' : '', v != null && isNaN(M.evalExpr(v)) ? 'invalid' : ''].join(' ');
      inp.title = M.isExpression(v) ? '=' + v : '';
      tr.querySelector('td.total').textContent = blank0(tr.dataset.row === 'cash' ? M.mapTotal(cells) : M.rowTotal(sheet.rows[tr.dataset.row]));
      updateSums();
      refreshTiles();
      save();
    });
    table.addEventListener('keydown', (e) => {
      const inp = e.target;
      if (inp.tagName !== 'INPUT') return;
      const td = inp.closest('td'), tr = td.closest('tr');
      const ci = [...tr.children].indexOf(td);
      let target = null;
      const at = (rowEl, i) => rowEl && rowEl.children[i] && rowEl.children[i].querySelector('input:not([disabled])');
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.altKey)) target = at(tr.nextElementSibling, ci);
      else if (e.key === 'ArrowUp') target = at(tr.previousElementSibling, ci);
      else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length) target = at(tr, ci + 1);
      else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && inp.selectionEnd === 0) target = at(tr, ci - 1);
      else if (e.key === 'Escape') { inp.blur(); return; }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && inp.selectionStart === 0 && inp.selectionEnd === inp.value.length && inp.dataset.d) { inp.value = ''; e.preventDefault(); return; }
      if (target) { e.preventDefault(); target.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
    table.addEventListener('click', (e) => {
      const b = e.target.closest('.rowmenu');
      if (!b) return;
      const idx = Number(b.closest('tr').dataset.row);
      const r = b.getBoundingClientRect();
      const emp = year().employees.find((x) => M.normName(x.name) === M.normName(sheet.rows[idx].name));
      popupMenu(r.left, r.bottom + 4, [
        { label: 'Move up', action: () => moveRow(sheet, idx, -1) },
        { label: 'Move down', action: () => moveRow(sheet, idx, 1) },
        { label: 'Insert row below', action: () => { sheet.rows.splice(idx + 1, 0, M.newRow('New category')); save(); state._keepScroll = true; render(); } },
        { label: 'Add to all later months', action: () => addToLaterMonths(sheet.rows[idx].name) },
        emp ? { label: `Employee: ${emp.name} ✓`, action: () => go('employees') } : { label: 'Mark as employee (salary)', action: () => { year().employees.push({ id: M.uid(), name: sheet.rows[idx].name, aliases: [], bankPaid: 0 }); save(); toast(`${sheet.rows[idx].name} added to Employees`); } },
        { label: 'Delete row', danger: true, action: () => {
          const row = sheet.rows[idx];
          if (M.rowTotal(row) && !confirm(`Delete "${row.name}" and its ${money(M.rowTotal(row))} of entries?`)) return;
          sheet.rows.splice(idx, 1); save(); state._keepScroll = true; render();
        } },
      ]);
    });
    body.querySelector('[data-g="add"]').addEventListener('click', () => {
      sheet.rows.push(M.newRow(''));
      save();
      state._keepScroll = true;
      render();
      const inputs = view().querySelectorAll('.rname');
      inputs[inputs.length - 1].focus();
    });
    body.querySelector('[data-g="copyprev"]').addEventListener('click', () => {
      const key = state.tab;
      const prev = state.month > 0 ? year().months[state.month - 1] : (state.data.years[Y() - 1] || {}).months?.[11];
      if (!prev) return toast('No previous month to copy from');
      const have = new Set(sheet.rows.map((r) => M.normName(r.name)));
      const added = prev[key].rows.filter((r) => !have.has(M.normName(r.name)));
      added.forEach((r) => sheet.rows.push(M.newRow(r.name)));
      save();
      render();
      toast(added.length ? `Added ${added.length} categories` : 'All categories already present');
    });
    if (opts.cash) {
      for (const [id, key] of [['lyCash', 'cash'], ['lySales', 'sales']]) {
        $('#' + id, body).addEventListener('change', (e) => { sheet.lastYear[key] = parseInput(e.target.value); save(); updateSums(); refreshTiles(); });
      }
    }
  }

  function moveRow(sheet, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= sheet.rows.length) return;
    [sheet.rows[idx], sheet.rows[j]] = [sheet.rows[j], sheet.rows[idx]];
    save();
    state._keepScroll = true;
    render();
  }
  function addToLaterMonths(name) {
    let n = 0;
    for (let m = state.month + 1; m < 12; m++) {
      const sh = year().months[m][state.tab];
      if (!sh.rows.some((r) => M.normName(r.name) === M.normName(name))) { sh.rows.push(M.newRow(name)); n++; }
    }
    save();
    toast(n ? `Added "${name}" to ${n} later month(s)` : 'Already in all later months');
  }

  function renderCard(body, mo) {
    const m = state.month, days = M.daysInMonth(Y(), m);
    let rows = '';
    for (let d = 1; d <= days; d++) {
      const v = mo.card.days[d] || {};
      const wd = new Date(Y(), m, d).toLocaleDateString('en-GB', { weekday: 'short' });
      rows += `<tr data-d="${d}"><td>${d} <span class="hint">${wd}</span></td>
        <td><input data-k="credit" value="${esc(cellText(v.credit))}"></td>
        <td><input data-k="totalR" value="${esc(cellText(v.totalR))}"></td>
        <td class="diff"></td></tr>`;
    }
    body.innerHTML = `<div class="row">
      <div class="card" style="max-width:560px"><h2>Credit card by day</h2>
        <table class="data" id="cardTable"><thead><tr><th>Day</th><th>Credit</th><th>Total R</th><th>Diff</th></tr></thead><tbody>${rows}
        <tr class="total"><td>Total</td><td id="ctC"></td><td id="ctR"></td><td id="ctD"></td></tr></tbody></table></div>
      <div class="card"><h2>Previous years</h2>
        <table class="data" id="cmpTable"><thead><tr><th class="left">Year</th><th>Credit</th><th>Total R</th><th>Change in credit</th><th></th></tr></thead><tbody>
        ${mo.card.compare.map((c, i) => `<tr data-i="${i}"><td class="left"><input data-k="label" value="${esc(c.label)}" style="width:80px"></td><td><input data-k="credit" value="${esc(cellText(c.credit))}"></td><td><input data-k="totalR" value="${esc(cellText(c.totalR))}"></td><td class="chg"></td><td><button class="icon" data-del="${i}" title="Remove">✕</button></td></tr>`).join('')}
        </tbody></table>
        <div class="toolbar"><button class="btn" id="addCmp">+ Add year</button></div>
        <p class="hint">Diff = Credit − Total R.</p></div></div>`;
    const tbl = $('#cardTable', body);
    const update = () => {
      let c = 0, r = 0;
      tbl.querySelectorAll('tbody tr[data-d]').forEach((tr) => {
        const v = mo.card.days[tr.dataset.d] || {};
        const cr = M.val(v.credit), tr2 = M.val(v.totalR);
        c += cr; r += tr2;
        tr.querySelector('.diff').textContent = cr || tr2 ? money(cr - tr2) : '';
      });
      $('#ctC', body).textContent = money(c);
      $('#ctR', body).textContent = money(r);
      $('#ctD', body).textContent = money(c - r);
      $('#cmpTable', body).querySelectorAll('tr[data-i]').forEach((tr) => {
        const cc = mo.card.compare[tr.dataset.i];
        const base = M.val(cc.credit);
        tr.querySelector('.chg').innerHTML = base ? changeSpan(((c - base) / base) * 100) : '';
      });
    };
    update();
    tbl.addEventListener('focusin', (e) => { const i = e.target; if (i.dataset.k) { const raw = (mo.card.days[i.closest('tr').dataset.d] || {})[i.dataset.k]; i.value = raw == null ? '' : String(raw); i.select(); } });
    tbl.addEventListener('focusout', (e) => {
      const i = e.target;
      if (!i.dataset.k) return;
      const d = i.closest('tr').dataset.d;
      const day = (mo.card.days[d] = mo.card.days[d] || {});
      day[i.dataset.k] = parseInput(i.value);
      if (day.credit == null && day.totalR == null) delete mo.card.days[d];
      i.value = cellText(day[i.dataset.k]);
      update(); refreshTiles(); save();
    });
    tbl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const td = e.target.closest('td'), tr = td.closest('tr');
      const ci = [...tr.children].indexOf(td);
      const next = (e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling);
      const t = next && next.children[ci] && next.children[ci].querySelector('input');
      if (t) { e.preventDefault(); t.focus(); }
    });
    const cmp = $('#cmpTable', body);
    cmp.addEventListener('change', (e) => {
      const i = e.target;
      const c = mo.card.compare[i.closest('tr').dataset.i];
      c[i.dataset.k] = i.dataset.k === 'label' ? i.value : parseInput(i.value);
      save(); update();
    });
    cmp.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { mo.card.compare.splice(Number(b.dataset.del), 1); save(); renderMonth(); } });
    $('#addCmp', body).addEventListener('click', () => { mo.card.compare.push({ label: String(Y() - 1), credit: null, totalR: null }); save(); renderMonth(); });
  }

  function renderNotes(body, mo) {
    body.innerHTML = `<div class="card"><h2>Notes for ${M.MONTHS[state.month]}</h2><textarea id="notes" rows="14" style="width:100%">${esc(mo.notes || '')}</textarea>
      <p class="hint">Notes are included at the end of the monthly report.</p></div>`;
    $('#notes').addEventListener('input', (e) => { mo.notes = e.target.value; save(); });
  }

  // ---------- Cash on hand (Total sheet) ----------
  function renderCash() {
    const y = year();
    const cp = M.cashPosition(state.data, Y());
    setHeader('Cash on Hand');
    view().innerHTML = `
      <div class="tiles"><div class="tile"><div class="label">Cash on hand now</div><div class="value">${money(cp.total)}</div></div></div>
      ${importCheckCard(y, cp)}
      <div class="card"><h2>Opening balance</h2><div class="compare">
        <label>Description<input id="openLabel" value="${esc(y.openingLabel)}" style="width:260px;text-align:left"></label>
        <label>Amount<input id="openAmt" value="${esc(cellText(y.openingBalance))}"></label></div></div>
      <div class="card"><h2>Month by month</h2><table class="data"><thead><tr><th>Month</th><th>Daily cash</th><th>− General exp.</th><th>− Deposits</th><th>+ Withdrawals</th><th>Net</th><th>Balance</th></tr></thead><tbody>
        <tr><td>Opening</td><td></td><td></td><td></td><td></td><td></td><td>${money(cp.opening)}</td></tr>
        ${cp.months.map((s) => `<tr><td>${s.name}</td><td>${money(s.cash)}</td><td>${money(s.general)}</td><td>${money(s.deposits)}</td><td>${money(s.withdrawals)}</td><td class="${s.netCash < 0 ? 'down' : ''}">${money(s.netCash)}</td><td>${money(s.balance)}</td></tr>`).join('')}
        ${cp.undated ? `<tr><td>Bank rows without a date in ${Y()}</td><td></td><td></td><td></td><td></td><td>${money(cp.undated)}</td><td></td></tr>` : ''}
        <tr><td>Adjustments</td><td></td><td></td><td></td><td></td><td>${money(cp.adjustments)}</td><td></td></tr>
        <tr class="total"><td>Cash on hand</td><td></td><td></td><td></td><td></td><td></td><td>${money(cp.total)}</td></tr></tbody></table></div>
      <div class="card"><h2>Adjustments</h2><p class="hint">Extra amounts that change the cash total (positive adds, negative subtracts).</p>
        <table class="data" id="adjTable"><thead><tr><th class="left">Description</th><th>Amount</th><th></th></tr></thead><tbody>
        ${y.adjustments.map((a, i) => `<tr data-i="${i}"><td class="left"><input data-k="label" value="${esc(a.label)}"></td><td><input data-k="amount" value="${esc(a.amount ?? '')}"></td><td><button class="icon" data-del="${i}">✕</button></td></tr>`).join('')}
        </tbody></table><div class="toolbar"><button class="btn" id="addAdj">+ Add adjustment</button></div></div>`;
    $('#openLabel').addEventListener('change', (e) => { y.openingLabel = e.target.value; save(); });
    $('#openAmt').addEventListener('change', (e) => { y.openingBalance = parseInput(e.target.value) ?? 0; save(); state._keepScroll = true; render(); });
    const t = $('#adjTable');
    t.addEventListener('change', (e) => { const a = y.adjustments[e.target.closest('tr').dataset.i]; a[e.target.dataset.k] = e.target.dataset.k === 'amount' ? parseInput(e.target.value) : e.target.value; save(); state._keepScroll = true; render(); });
    t.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { y.adjustments.splice(Number(b.dataset.del), 1); save(); state._keepScroll = true; render(); } });
    $('#addAdj').addEventListener('click', () => { y.adjustments.push({ id: M.uid(), label: '', amount: null }); save(); state._keepScroll = true; render(); });
  }

  // Shows how the app's cash on hand compared with the workbook's "Total Cash Amount" when it was imported.
  function importCheckCard(y, cp) {
    const ic = y.importCheck;
    if (!ic) return '';
    const diff = M.round2((ic.appTotal ?? cp.total) - ic.excelTotal);
    const ok = Math.abs(diff) < 0.01;
    return `<div class="card"><h2>Check against Excel (imported ${esc(ic.date)})</h2>
      <table class="data" style="max-width:520px"><tbody>
        <tr><td>Excel "Total Cash Amount"</td><td>${money(ic.excelTotal)}</td></tr>
        <tr><td>App cash on hand at import</td><td>${money(ic.appTotal)}</td></tr>
        <tr class="total"><td>Difference</td><td class="${ok ? 'up' : 'down'}">${ok ? '✓ Same' : money(diff)}</td></tr></tbody></table>
      ${ic.adjustmentsAdded ? `<p class="hint">${ic.adjustmentsAdded} amount(s) that the Excel formula adds outside the normal daily cash / expenses / bank figures were added below under Adjustments, so the totals match the workbook.</p>` : ''}
      ${ic.notes.length ? `<ul class="hint">${ic.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="hint">Since the import, the cash on hand changes as you enter new figures. That's expected.</p></div>`;
  }

  // ---------- Bank ----------
  function renderBank() {
    const y = year();
    setHeader('Bank', `<button class="btn primary" data-act="add-bank">+ Add movement</button>`);
    const sorted = y.bank.map((b, i) => ({ b, i })).sort((a, z) => String(a.b.date).localeCompare(String(z.b.date)));
    const dep = y.bank.reduce((s, b) => s + M.val(b.deposit), 0), wd = y.bank.reduce((s, b) => s + M.val(b.withdraw), 0);
    view().innerHTML = `<div class="card">
      <div class="compare" style="margin-bottom:10px"><label>Bank name<input id="bankName" value="${esc(y.bankName || '')}" style="text-align:left;width:220px"></label></div>
      <table class="data" id="bankTable"><thead><tr><th class="left">Date</th><th>Deposit</th><th>Withdraw</th><th class="left">Note</th><th></th></tr></thead><tbody>
      ${sorted.map(({ b, i }) => `<tr data-i="${i}"><td class="left"><input type="date" data-k="date" value="${esc(b.date)}" style="width:150px"></td><td><input data-k="deposit" value="${esc(b.deposit ?? '')}"></td><td><input data-k="withdraw" value="${esc(b.withdraw ?? '')}"></td><td class="left"><input data-k="note" value="${esc(b.note || '')}"></td><td><button class="icon" data-del="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No bank movements yet.</td></tr>'}
      <tr class="total"><td>Total</td><td>${money(dep)}</td><td>${money(wd)}</td><td class="left">Net to bank ${money(dep - wd)}</td><td></td></tr></tbody></table>
      <p class="hint">Deposits reduce cash on hand; withdrawals add to it.</p></div>`;
    $('#bankName').addEventListener('change', (e) => { y.bankName = e.target.value; save(); });
    const t = $('#bankTable');
    t.addEventListener('change', (e) => {
      const b = y.bank[e.target.closest('tr').dataset.i];
      const k = e.target.dataset.k;
      b[k] = k === 'deposit' || k === 'withdraw' ? parseInput(e.target.value) : e.target.value;
      save(); state._keepScroll = true; render();
    });
    t.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b && confirm('Delete this bank movement?')) { y.bank.splice(Number(b.dataset.del), 1); save(); render(); } });
  }

  // ---------- Employees ----------
  function renderEmployees() {
    const y = year();
    const rows = M.employeeTable(state.data, Y());
    setHeader('Employees', `<button class="btn primary" data-act="add-emp">+ Add employee</button>`);
    const monthTotals = M.MONTHS.map((_, m) => rows.reduce((s, r) => s + r.months[m], 0));
    view().innerHTML = `<div class="card"><h2>Total salary given per month</h2>
      <div style="overflow:auto"><table class="data" id="empTable"><thead><tr><th class="left">Employee</th><th class="left">Also matches</th>${M.MONTHS.map((n) => `<th>${n.slice(0, 3)}</th>`).join('')}<th>Total</th><th>Paid via bank</th><th>All total</th><th>Avg / month</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-i="${i}"><td class="left"><input data-k="name" value="${esc(r.emp.name)}" style="width:150px"></td>
        <td class="left"><input data-k="aliases" value="${esc((r.emp.aliases || []).join(', '))}" placeholder="other spellings" style="width:150px"></td>
        ${r.months.map((v) => `<td>${v ? money(v) : ''}</td>`).join('')}<td><b>${money(r.total)}</b></td>
        <td><input data-k="bankPaid" value="${esc(r.emp.bankPaid || '')}" style="width:110px"></td><td>${money(r.allTotal)}</td><td>${money(r.average)}</td>
        <td><button class="icon" data-del="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="19" class="empty">No employees yet.</td></tr>'}
      <tr class="total"><td>Total</td><td></td>${monthTotals.map((v) => `<td>${money(v)}</td>`).join('')}<td>${money(monthTotals.reduce((a, b) => a + b, 0))}</td><td></td><td>${money(rows.reduce((s, r) => s + r.allTotal, 0))}</td><td></td><td></td></tr>
      </tbody></table></div>
      <p class="hint">A salary is every row with the employee's name in a month's Daily (Till) and General Expenses sheets. Capital letters, spaces and Turkish letters are ignored. If a name is spelled differently somewhere (e.g. "AHMET CAYLAK"), add it under "Also matches", separated by commas.</p></div>`;
    const t = $('#empTable');
    t.addEventListener('change', (e) => {
      const emp = y.employees[e.target.closest('tr').dataset.i];
      const k = e.target.dataset.k;
      if (k === 'aliases') emp.aliases = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'bankPaid') emp.bankPaid = parseInput(e.target.value) ?? 0;
      else emp.name = e.target.value.trim();
      save(); state._keepScroll = true; render();
    });
    t.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b && confirm('Remove this employee? (Their expense rows stay in the months.)')) { y.employees.splice(Number(b.dataset.del), 1); save(); render(); } });
  }

  // ---------- Profitability (3AYLIK NAKIT) ----------
  function renderProfit() {
    const y = year(), st = state.data.settings;
    const p = M.profitability(state.data, Y());
    setHeader('Profitability');
    const res = (r, label) => `<div class="card"><h2>${label}</h2><table class="data"><tbody>
      <tr><td>Cash revenue</td><td>${money(r.cash)}</td></tr><tr><td>Prescription revenue</td><td>${money(r.rx)}</td></tr>
      <tr class="total"><td>Total revenue</td><td>${money(r.total)}</td></tr>
      <tr><td>Profit on cash (${st.cashMargin}%)</td><td>${money(r.cashProfit)}</td></tr><tr><td>Profit on prescriptions (${st.rxMargin}%)</td><td>${money(r.rxProfit)}</td></tr>
      <tr class="total"><td>Yearly profit</td><td>${money(r.profit)}</td></tr>
      <tr><td>Monthly revenue (÷${st.avgMonths})</td><td>${money(r.monthlyRevenue)}</td></tr>
      <tr><td>Monthly profit (÷${st.avgMonths})</td><td>${money(r.monthlyProfit)}</td></tr>
      <tr><td>Profit margin</td><td>${r.margin == null ? '–' : r.margin.toFixed(1) + '%'}</td></tr>
      <tr><td>Operating cost / month</td><td>${money(r.cost)}</td></tr>
      <tr class="total"><td>Net monthly profit</td><td class="${r.net < 0 ? 'down' : 'up'}">${money(r.net)}</td></tr></tbody></table></div>`;
    view().innerHTML = `<div class="card"><h2>Monthly revenue</h2><div style="overflow:auto"><table class="data" id="revTable"><thead><tr><th></th>${M.MONTHS.map((n) => `<th>${n.slice(0, 3)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      <tr><td>Cash (Nakit)</td>${y.revenue.map((r, m) => `<td><input data-m="${m}" data-k="cash" value="${esc(r.cash ?? '')}" style="width:96px"></td>`).join('')}<td>${money(p.actual.cash)}</td></tr>
      <tr><td>Prescription (Recete)</td>${y.revenue.map((r, m) => `<td><input data-m="${m}" data-k="rx" value="${esc(r.rx ?? '')}" style="width:96px"></td>`).join('')}<td>${money(p.actual.rx)}</td></tr>
      <tr class="total"><td>Total revenue</td>${p.rows.map((r) => `<td>${r.total ? money(r.total) : ''}</td>`).join('')}<td>${money(p.actual.total)}</td></tr>
      <tr><td>Cash share</td>${p.rows.map((r) => `<td>${r.cashShare == null ? '' : r.cashShare.toFixed(1) + '%'}</td>`).join('')}<td></td></tr></tbody></table></div>
      <div class="toolbar"><button class="btn" id="fillCash">Fill cash from Total Sales of each month</button></div></div>
      <div class="card"><h2>Assumptions</h2><div class="compare" id="settingsForm">
        <label>Profit on cash %<input data-s="cashMargin" value="${st.cashMargin}"></label>
        <label>Profit on prescriptions %<input data-s="rxMargin" value="${st.rxMargin}"></label>
        <label>Months to average over<input data-s="avgMonths" value="${st.avgMonths}"></label>
        <label>Operating cost / month (ISL ORT MAL)<input data-s="operatingCost" value="${st.operatingCost}"></label>
        <label>Projection factor<input data-s="projection" value="${st.projection}"></label></div></div>
      <div class="row">${res(p.actual, 'Actual')}${res(p.projected, `Projection (× ${st.projection})`)}</div>`;
    $('#revTable').addEventListener('change', (e) => { const i = e.target; y.revenue[i.dataset.m][i.dataset.k] = parseInput(i.value); save(); state._keepScroll = true; render(); });
    $('#settingsForm').addEventListener('change', (e) => { const v = M.evalExpr(e.target.value); if (!isNaN(v)) st[e.target.dataset.s] = v; save(); state._keepScroll = true; render(); });
    $('#fillCash').addEventListener('click', () => {
      if (!confirm('Replace the Cash row with each month\'s Total Sales from the Daily (Till) sheets?')) return;
      for (let m = 0; m < 12; m++) { const s = M.monthSummary(state.data, Y(), m); y.revenue[m].cash = s.sales ? M.round2(s.sales) : null; }
      save(); render();
    });
  }

  // ---------- Compare years ----------
  function renderCompare() {
    const metric = state.compareMetric || 'sales';
    const c = M.yearComparison(state.data, metric);
    setHeader('Compare Years', `<select id="cmpMetric">${Object.entries(M.COMPARE_METRICS).map(([k, l]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
    if (!c.years.length) {
      view().innerHTML = `<div class="empty">No data to compare yet. Import your workbooks from earlier years (Import / Export → Import Excel…), each one into its own year.</div>`;
    } else {
      const ys = c.years;
      const last = ys[ys.length - 1], before = ys.length > 1 ? ys[ys.length - 2] : null;
      const colorOf = (y) => `var(--series-${(((y % 8) + 8) % 8) + 1})`;
      const cell = (v) => (v == null ? '<span class="hint">–</span>' : money(v));
      const chg = (now, was) => (now == null || was == null ? '' : changeSpan(M.pctChange(now, was)));
      const typedNote = ys.some((y) => y.typed);
      view().innerHTML = `
        <div class="tiles">
          ${ys.slice().reverse().map((y) => `<div class="tile"><div class="label"><span class="swatch" style="background:${colorOf(y.year)}"></span>${y.year}${y.typed ? ' (typed)' : ''}</div><div class="value">${money(y.total)}</div><div class="sub">${y.months} month${y.months === 1 ? '' : 's'} · avg ${money(y.average)}</div></div>`).join('')}
          ${c.ytd && c.ytd.months ? `<div class="tile"><div class="label">${c.ytd.to} vs ${c.ytd.from}, same ${c.ytd.months} month${c.ytd.months === 1 ? '' : 's'}</div><div class="value">${changeSpan(c.ytd.pct) || '–'}</div><div class="sub">${money(c.ytd.now)} vs ${money(c.ytd.before)}</div></div>` : ''}
        </div>
        <div class="card"><h2>${c.label} by month</h2>
          <div class="legend">${ys.map((y) => `<span><span class="swatch" style="background:${colorOf(y.year)}"></span>${y.year}${y.typed ? ' (typed)' : ''}</span>`).join('')}</div>
          <div class="chart">${groupedChart(ys, colorOf)}</div></div>
        <div class="card"><h2>Table</h2><div style="overflow:auto"><table class="data"><thead><tr><th>Month</th>${ys.map((y) => `<th>${y.year}${y.typed ? '*' : ''}</th>`).join('')}${before ? `<th>${last.year} vs ${before.year}</th>` : ''}</tr></thead><tbody>
          ${M.MONTHS.map((n, m) => `<tr><td>${n}</td>${ys.map((y) => `<td>${cell(y.values[m])}</td>`).join('')}${before ? `<td>${chg(last.values[m], before.values[m])}</td>` : ''}</tr>`).join('')}
          <tr class="total"><td>Total</td>${ys.map((y) => `<td>${money(y.total)}</td>`).join('')}${before ? `<td>${chg(last.total, before.total)}</td>` : ''}</tr>
          <tr><td>Monthly average</td>${ys.map((y) => `<td>${cell(y.average)}</td>`).join('')}${before ? `<td>${chg(last.average, before.average)}</td>` : ''}</tr>
        </tbody></table></div>
        <p class="hint">Every year in the app is shown. ${typedNote ? '* Typed: this year isn\'t in the app, so the "last year" figures typed on (or imported into) the following year are used. ' : ''}A year's total only includes months with entries, so compare a part year using the "same months" tile.</p></div>`;
    }
    $('#cmpMetric').addEventListener('change', (e) => { state.compareMetric = e.target.value; renderCompare(); });
  }

  // Grouped bars: one group per month, one bar per year. Hover a bar for its exact value.
  function groupedChart(years, colorOf) {
    const W = 900, H = 260, padL = 64, padB = 24, padT = 8, padR = 8;
    const max = Math.max(1, ...years.flatMap((y) => y.values.map((v) => v || 0)));
    const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p;
    const nice = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    const gw = (W - padL - padR) / 12, inner = gw * 0.8, bw = inner / years.length;
    const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparison by month">`;
    for (let i = 0; i <= 4; i++) {
      const v = (nice / 4) * i;
      svg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v).toLocaleString('en-US')}</text>`;
    }
    M.MONTHS.forEach((n, m) => {
      const gx = padL + m * gw + (gw - inner) / 2;
      years.forEach((yr, i) => {
        const v = yr.values[m];
        if (!v || v <= 0) return;
        const x = gx + i * bw + 1, w = Math.max(1, bw - 2), top = y(v), h = y(0) - top, r = Math.min(4, w / 2, h);
        svg += `<g><title>${n} ${yr.year}: ${money(v)}</title><path d="M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y(0)} Z" style="fill:${colorOf(yr.year)}"/></g>`;
      });
      svg += `<text x="${padL + m * gw + gw / 2}" y="${H - 7}" text-anchor="middle">${n.slice(0, 3)}</text>`;
    });
    return svg + '</svg>';
  }

  // ---------- Other lists (Alinan Ilaclar, cheques, zekat…) ----------
  function renderLists() {
    const y = year();
    if (state.list >= y.lists.length) state.list = Math.max(0, y.lists.length - 1);
    const l = y.lists[state.list];
    setHeader('Other Lists', `<button class="btn" data-act="add-list">+ New list</button>${l ? `<button class="btn" data-act="rename-list">Rename</button><button class="btn danger" data-act="del-list">Delete list</button>` : ''}`);
    if (!l) { view().innerHTML = '<div class="empty">No lists yet. Lists are for anything else you track — medicines taken, cheques, zekat, etc.</div>'; return; }
    const groups = M.listGroups(l);
    const total = l.entries.reduce((s, e) => s + M.val(e.amount), 0);
    view().innerHTML = `<div class="tabs">${y.lists.map((x, i) => `<button data-list="${i}" class="${i === state.list ? 'active' : ''}">${esc(x.name)}</button>`).join('')}</div>
      <div class="row"><div class="card" style="flex:2"><table class="data" id="listTable"><thead><tr><th class="left">Date</th><th class="left">Description</th><th class="left">Group / person</th><th>Amount</th><th></th></tr></thead><tbody>
      ${l.entries.map((e, i) => `<tr data-i="${i}"><td class="left"><input type="date" data-k="date" value="${esc(e.date || '')}" style="width:140px"></td><td class="left"><input data-k="description" value="${esc(e.description || '')}"></td><td class="left"><input data-k="group" list="groupList" value="${esc(e.group || '')}"></td><td><input data-k="amount" value="${esc(e.amount ?? '')}" style="width:120px"></td><td><button class="icon" data-del="${i}">✕</button></td></tr>`).join('')}
      <tr class="total"><td>Total</td><td></td><td></td><td>${money(total)}</td><td></td></tr></tbody></table>
      <datalist id="groupList">${Object.keys(groups).map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="toolbar"><button class="btn" id="addEntry">+ Add entry</button></div></div>
      <div class="card" style="flex:1"><h2>Totals by group</h2><table class="data"><tbody>${Object.entries(groups).map(([g, v]) => `<tr><td>${esc(g)}</td><td>${money(v)}</td></tr>`).join('') || '<tr><td class="empty">–</td></tr>'}</tbody></table></div></div>`;
    view().querySelectorAll('[data-list]').forEach((b) => b.addEventListener('click', () => { state.list = Number(b.dataset.list); render(); }));
    const t = $('#listTable');
    t.addEventListener('change', (e) => { const en = l.entries[e.target.closest('tr').dataset.i]; const k = e.target.dataset.k; en[k] = k === 'amount' ? parseInput(e.target.value) : e.target.value; save(); state._keepScroll = true; render(); });
    t.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { l.entries.splice(Number(b.dataset.del), 1); save(); state._keepScroll = true; render(); } });
    $('#addEntry').addEventListener('click', () => { l.entries.push({ id: M.uid(), date: new Date().toISOString().slice(0, 10), description: '', group: '', amount: null }); save(); state._keepScroll = true; render(); });
  }

  // ---------- Monthly report ----------
  function renderReport() {
    const m = state.reportMonth;
    setHeader('Monthly Report', `<select id="repMonth">${M.MONTHS.map((n, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${n} ${Y()}</option>`).join('')}</select>
      <button class="btn primary" data-act="report-pdf">Save as PDF…</button><button class="btn" data-act="report-xlsx">Save as Excel…</button><button class="btn" data-act="report-print">Print…</button>`);
    view().innerHTML = `<iframe id="repFrame" class="report-frame" style="width:100%;height:calc(100vh - 120px);border:0" sandbox="allow-same-origin allow-modals"></iframe>`;
    $('#repFrame').srcdoc = window.Report.monthReportHTML(state.data, Y(), m);
    $('#repMonth').addEventListener('change', (e) => { state.reportMonth = Number(e.target.value); renderReport(); });
  }

  async function reportPdf() {
    const m = state.reportMonth;
    const html = window.Report.monthReportHTML(state.data, Y(), m);
    const name = `Report ${M.MONTHS[m]} ${Y()}.pdf`;
    if (native) { const p = await native.savePdf({ defaultName: name, html }); if (p) toast('Saved ' + p); }
    else reportPrint();
  }
  function reportPrint() {
    const f = $('#repFrame');
    if (f && f.contentWindow) f.contentWindow.print();
  }
  async function reportXlsx() {
    const m = state.reportMonth;
    const buf = await window.ExcelIO.exportMonthReport(state.data, Y(), m);
    const p = await saveFile(`Report ${M.MONTHS[m]} ${Y()}.xlsx`, buf, ['xlsx']);
    if (p) toast('Saved ' + p);
  }

  // ---------- Import / export / backup ----------
  function renderSettings() {
    setHeader('Import / Export');
    view().innerHTML = `
      <div class="row">
        <div class="card"><h2>Excel</h2>
          <p>Import your existing workbook (e.g. <b>2026StadiumInfo.xlsx</b>). The year is taken from the file name. Months, General Expenses, CreditCard, BankDeposit, Total, Employees and 3AYLIK NAKIT are read; any other sheets become Other Lists.</p>
          <div class="toolbar"><button class="btn primary" data-act="import">Import Excel…</button></div>
          <p>Export the whole year back to an Excel workbook with the same layout and working formulas.</p>
          <div class="toolbar"><button class="btn" data-act="export">Export ${Y()} to Excel…</button></div></div>
        <div class="card"><h2>Backup</h2>
          <p>Your data is saved automatically on this Mac${native ? ' (and a daily backup copy is kept for 30 days)' : ''}. You can also save a backup file anywhere, e.g. iCloud Drive or a USB stick.</p>
          <div class="toolbar"><button class="btn" data-act="backup">Save backup file…</button><button class="btn" data-act="restore">Restore from backup…</button></div></div>
      </div>
      <div class="row">
        <div class="card"><h2>Years</h2>
          <p>Start a new year when January comes: categories and employees are copied, and this year's cash on hand becomes the opening balance.</p>
          <div class="toolbar"><button class="btn" data-act="new-year">Start ${Number(Object.keys(state.data.years).sort().pop()) + 1}…</button><button class="btn danger" data-act="del-year">Delete ${Y()}…</button></div></div>
        <div class="card"><h2>Appearance</h2><div class="toolbar">
          <select id="theme"><option value="">Follow macOS</option><option value="light">Light</option><option value="dark">Dark</option></select></div></div>
      </div>`;
    const th = $('#theme');
    th.value = localStorage.getItem('theme') || '';
    th.addEventListener('change', () => { localStorage.setItem('theme', th.value); applyTheme(); });
  }
  function applyTheme() {
    const t = localStorage.getItem('theme');
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }

  async function importExcel() {
    const f = await pickFile(['xlsx', 'xlsm'], 'Import Excel workbook');
    if (!f) return;
    try {
      toast('Reading workbook…');
      const res = await window.ExcelIO.importWorkbook(f.data, f.name);
      let yearNum = res.yearNum;
      const ans = await ask(`Import "${f.name}" as which year?`, String(yearNum));
      if (!ans) return;
      yearNum = Number(ans);
      if (!yearNum) return toast('Invalid year');
      if (state.data.years[yearNum] && M.yearTotals(state.data, yearNum).sales + M.yearTotals(state.data, yearNum).general !== 0 &&
        !confirm(`${yearNum} already has data. Replace it with the workbook? (A backup copy of the current data is kept.)`)) return;
      state.data.years[yearNum] = res.year;
      Object.assign(state.data.settings, res.settings);
      state.data.currentYear = yearNum;
      state.data = M.normalize(state.data);
      const ic = state.data.years[yearNum].importCheck;
      if (ic) ic.appTotal = M.round2(M.cashPosition(state.data, yearNum).total);
      save();
      if (ic && Math.abs(ic.appTotal - ic.excelTotal) >= 0.01) {
        go('cash');
        toast(`Imported. Cash on hand differs from Excel by ${money(ic.appTotal - ic.excelTotal)} — see "Check against Excel".`);
      } else {
        go('dashboard');
        toast(`Imported ${f.name} into ${yearNum}${ic ? ' — cash on hand matches Excel ✓' : ''}`);
      }
    } catch (e) {
      console.error(e);
      alert('Could not import this file: ' + e.message);
    }
  }
  async function exportExcel() {
    try {
      const buf = await window.ExcelIO.exportYear(state.data, Y());
      const p = await saveFile(`${Y()}StadiumInfo.xlsx`, buf, ['xlsx']);
      if (p) toast('Saved ' + p);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + e.message);
    }
  }
  async function backup() {
    const p = await saveFile(`Stadium Cashbook backup ${new Date().toISOString().slice(0, 10)}.json`, new TextEncoder().encode(JSON.stringify(state.data, null, 1)), ['json']);
    if (p) toast('Backup saved');
  }
  async function restore() {
    const f = await pickFile(['json'], 'Restore backup');
    if (!f) return;
    try {
      const d = JSON.parse(new TextDecoder().decode(f.data));
      if (!d.years) throw new Error('Not a Stadium Cashbook backup');
      if (!confirm('Replace ALL current data with this backup?')) return;
      state.data = M.normalize(d);
      save();
      go('dashboard');
      toast('Backup restored');
    } catch (e) {
      alert('Could not restore: ' + e.message);
    }
  }
  function newYear() {
    const last = Number(Object.keys(state.data.years).sort().pop());
    const next = last + 1;
    if (!confirm(`Start ${next}? Categories and employees are copied from ${last}, and ${last}'s cash on hand becomes the opening balance.`)) return;
    const prev = state.data.years[last];
    const y = M.newYear(prev);
    y.openingBalance = M.round2(M.cashPosition(state.data, last).total);
    y.openingLabel = `Transfer from ${last}`;
    y.bankName = prev.bankName;
    state.data.years[next] = y;
    state.data.currentYear = next;
    save();
    go('dashboard');
    toast(`${next} created`);
  }
  async function deleteYear() {
    if (Object.keys(state.data.years).length === 1) return toast('This is the only year');
    if (await ask(`Type ${Y()} to permanently delete this year's data:`) !== String(Y())) return;
    delete state.data.years[Y()];
    state.data.currentYear = Number(Object.keys(state.data.years).sort().pop());
    save();
    go('dashboard');
  }

  // ---------- actions ----------
  const actions = {
    import: importExcel,
    export: exportExcel,
    report: () => go('report'),
    'month-report': () => go('report', { reportMonth: state.month }),
    'prev-month': () => { if (state.month > 0) go('month', { month: state.month - 1 }); },
    'next-month': () => { if (state.month < 11) go('month', { month: state.month + 1 }); },
    'report-pdf': reportPdf,
    'report-xlsx': reportXlsx,
    'report-print': reportPrint,
    backup, restore,
    'new-year': newYear,
    'del-year': deleteYear,
    'add-bank': () => { year().bank.push({ id: M.uid(), date: new Date().toISOString().slice(0, 10), deposit: null, withdraw: null, note: '' }); save(); render(); },
    'add-emp': async () => { const n = await ask('Employee name (as written in the expense rows):'); if (n) { year().employees.push({ id: M.uid(), name: n.trim(), aliases: [], bankPaid: 0 }); save(); render(); } },
    'add-list': async () => { const n = await ask('Name of the new list:'); if (n) { year().lists.push({ id: M.uid(), name: n.trim(), entries: [] }); state.list = year().lists.length - 1; save(); render(); } },
    'rename-list': async () => { const l = year().lists[state.list]; const n = await ask('New name:', l.name); if (n) { l.name = n.trim(); save(); render(); } },
    'del-list': () => { const l = year().lists[state.list]; if (confirm(`Delete the list "${l.name}"?`)) { year().lists.splice(state.list, 1); save(); render(); } },
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && actions[a.dataset.act]) { actions[a.dataset.act](); return; }
    const nb = e.target.closest('#nav button');
    if (nb) go(nb.dataset.view, nb.dataset.month !== undefined ? { month: Number(nb.dataset.month) } : {});
  });
  $('#yearSelect').addEventListener('change', (e) => {
    if (e.target.value === 'new') { newYear(); renderNav(); return; }
    state.data.currentYear = Number(e.target.value);
    save();
    render();
  });
  if (native) native.onMenu((cmd) => ({ 'import-excel': importExcel, 'export-excel': exportExcel, report: () => go('report'), backup, restore }[cmd] || (() => {}))());

  // Test hook for automated checks in a browser.
  window.__cashbook = { state, render, go, importBuffer: async (buf, name) => { const r = await window.ExcelIO.importWorkbook(buf, name); state.data.years[r.yearNum] = r.year; Object.assign(state.data.settings, r.settings); state.data.currentYear = r.yearNum; state.data = M.normalize(state.data); const ic = state.data.years[r.yearNum].importCheck; if (ic) ic.appTotal = M.round2(M.cashPosition(state.data, r.yearNum).total); save(); render(); } };

  applyTheme();
  load().then(() => {
    if (state.data.currentYear !== new Date().getFullYear()) state.month = 0;
    render();
  });
})();
