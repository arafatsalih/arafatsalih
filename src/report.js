// Monthly report: a self-contained HTML page (shown in the app, saved as PDF, or printed).
(function (root) {
  const M = root.Model;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null || isNaN(n) ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmt0 = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('en-US'));
  const pct = (n) => (n == null || isNaN(n) ? '–' : (n > 0 ? '+' : '') + n.toFixed(1) + '%');

  // Single-series bar chart as SVG. Each bar has a <title> so hovering shows the exact value.
  function barChart(values, labels, opts = {}) {
    const W = opts.width || 760, H = opts.height || 200, padL = 56, padB = 22, padT = 8, padR = 8;
    const max = Math.max(0, ...values) || 1;
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const n = values.length || 1;
    const bw = (W - padL - padR) / n;
    const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
    const fill = opts.color ? ` fill="${opts.color}"` : '';
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'chart')}">`;
    for (let i = 0; i <= 4; i++) {
      const v = (nice / 4) * i, yy = y(v);
      s += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="${opts.grid || '#e5e5e2'}" stroke-width="1"/>`;
      s += `<text x="${padL - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="${opts.ink || '#666'}">${fmt0(v)}</text>`;
    }
    values.forEach((v, i) => {
      const x = padL + i * bw + Math.max(1, bw * 0.12);
      const w = Math.max(1, bw * 0.76);
      const top = y(Math.max(0, v)), h = Math.max(0, y(0) - top);
      const r = Math.min(4, w / 2, h);
      // Rounded top, square bottom on the baseline.
      const d = h > 0
        ? `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y(0)} Z`
        : '';
      s += `<g><title>${esc(labels[i])}: ${fmt(v)}</title>`;
      s += `<rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>`;
      if (d) s += `<path class="bar" d="${d}"${fill}/>`;
      s += `</g>`;
      const every = n > 16 ? 2 : 1;
      if (i % every === 0) s += `<text x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${opts.ink || '#666'}">${esc(opts.short ? opts.short[i] : labels[i])}</text>`;
    });
    return s + '</svg>';
  }

  function hBars(rows, total) {
    if (!rows.length) return '<p class="muted">No entries this month.</p>';
    const max = Math.max(...rows.map((r) => r.amount)) || 1;
    return `<table class="t"><thead><tr><th>Category</th><th class="r">Amount</th><th class="r">Share</th><th style="width:34%"></th></tr></thead><tbody>${[...rows]
      .sort((a, b) => b.amount - a.amount)
      .map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${fmt(r.amount)}</td><td class="r">${total ? ((r.amount / total) * 100).toFixed(1) + '%' : ''}</td>
        <td><div style="height:8px;border-radius:0 4px 4px 0;background:#2a78d6;width:${Math.max(1, (r.amount / max) * 100)}%"></div></td></tr>`)
      .join('')}<tr class="tot"><td>Total</td><td class="r">${fmt(total)}</td><td></td><td></td></tr></tbody></table>`;
  }

  function monthReportHTML(data, yearNum, m) {
    const s = M.monthSummary(data, yearNum, m);
    const cp = M.cashPosition(data, yearNum);
    const year = data.years[yearNum];
    const mo = year.months[m];
    const prev = m > 0 ? M.monthSummary(data, yearNum, m - 1) : null;
    const name = `${M.MONTHS[m]} ${yearNum}`;
    const cls = (v) => (v == null ? '' : v >= 0 ? 'up' : 'down');
    const vsPrev = (k) => (prev && prev[k] ? pct(((s[k] - prev[k]) / prev[k]) * 100) : '–');
    const dayLabels = s.dailySales.map((_, i) => `${i + 1} ${M.MONTHS[m].slice(0, 3)}`);
    const avgDay = s.daysWithSales ? s.sales / s.daysWithSales : 0;
    const best = s.dailySales.reduce((b, v, i) => (v > b.v ? { v, i } : b), { v: 0, i: -1 });
    const salaries = s.salaries.filter((x) => x.amount);

    const p = s.prev;
    const lyName = `${M.MONTHS[m]} ${p.year}`;
    const srcNote = (x) => (x.src === 'typed' ? ' (typed)' : '');
    const lyRow = (label, now, x) => `<tr><td>${label}</td><td class="r">${fmt(now)}</td><td class="r">${x.v == null ? '–' : fmt(x.v) + srcNote(x)}</td>
      <td class="r">${x.v == null ? '–' : fmt(now - x.v)}</td><td class="r ${x.v == null || !now ? '' : cls(now - x.v)}">${x.v == null || !now ? '–' : pct(M.pctChange(now, x.v))}</td></tr>`;
    const hasLy = ['sales', 'cash', 'payouts', 'general', 'credit', 'totalR', 'salaryTotal'].some((k) => p[k].v != null);
    const catTable = (sheet, title) => {
      if (!p.stored) return '';
      const rows = M.categoryComparison(data, yearNum, m, sheet);
      if (!rows.length) return '';
      return `<h3>${title}</h3><table class="t"><thead><tr><th>Category</th><th class="r">${esc(name)}</th><th class="r">${esc(lyName)}</th><th class="r">Change</th><th class="r">%</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${fmt(r.now)}</td><td class="r">${fmt(r.before)}</td><td class="r">${fmt(r.change)}</td><td class="r">${r.before && r.now ? pct(r.pct) : r.before ? 'stopped' : 'new'}</td></tr>`).join('')}</tbody></table>`;
    };
    const compareSection = hasLy ? `<h2>Compared with ${esc(lyName)}</h2>
      <table class="t"><thead><tr><th></th><th class="r">${esc(name)}</th><th class="r">${esc(lyName)}</th><th class="r">Change</th><th class="r">%</th></tr></thead><tbody>
        ${lyRow('Total sales', s.sales, p.sales)}${lyRow('Daily cash', s.cash, p.cash)}${lyRow('Paid from till', s.payouts, p.payouts)}
        ${lyRow('General expenses', s.general, p.general)}${lyRow('Salaries', s.salaryTotal, p.salaryTotal)}${lyRow('Credit card', s.credit, p.credit)}${lyRow('Total R', s.totalR, p.totalR)}
      </tbody></table>
      ${p.stored ? '' : `<p class="muted">${p.year} isn't in the app, so only the figures typed for last year are compared. Import ${p.year} to compare everything, including categories.</p>`}
      ${catTable('general', 'General expenses by category')}${catTable('daily', 'Paid from till by category')}` : '';
    // Earlier years for this month's credit card: stored data wins over typed rows for the same year.
    const cardMap = new Map();
    for (const c of mo.card.compare) cardMap.set(String(c.label).trim(), { label: String(c.label).trim(), credit: c.credit == null || c.credit === '' ? null : M.val(c.credit), totalR: c.totalR == null || c.totalR === '' ? null : M.val(c.totalR), typed: true });
    for (const y of Object.keys(data.years)) {
      if (Number(y) >= Number(yearNum)) continue;
      const t = M.monthTotals(data, Number(y), m);
      if (t && (t.credit || t.totalR)) cardMap.set(String(y), { label: String(y), credit: t.credit, totalR: t.totalR, typed: false });
    }
    const cardYears = [...cardMap.values()].sort((a, b) => b.label.localeCompare(a.label));
    const tile = (label, value, sub, subCls) => `<div class="tile"><div class="l">${label}</div><div class="v">${value}</div>${sub ? `<div class="s ${subCls || ''}">${sub}</div>` : ''}</div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>Monthly Report ${esc(name)}</title><style>
      *{box-sizing:border-box}body{font:12px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#151515;margin:0;padding:28px;background:#fff}
      h1{font-size:22px;margin:0}h3{font-size:12px;margin:14px 0 6px;color:#444}h2{font-size:14px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd}
      .head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px}.muted{color:#777}
      .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tile{min-width:0;border:1px solid #e1e1dc;border-radius:8px;padding:8px 10px}
      .tile .l{color:#555;font-size:11px}.tile .v{font-size:17px;font-weight:650;font-variant-numeric:tabular-nums}.tile .s{font-size:11px;color:#777}
      .up{color:#1a7f3c!important}.down{color:#c0392b!important}
      table.t{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}table.t th,table.t td{padding:4px 6px;border-bottom:1px solid #eee;text-align:left}
      table.t th{color:#555;font-weight:600;background:#f5f5f2}.r{text-align:right!important}tr.tot td{font-weight:700;background:#f5f5f2}
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}.chart svg{width:100%;height:auto}
      .notes{white-space:pre-wrap;border:1px solid #eee;border-radius:6px;padding:8px}
      @page{size:A4;margin:12mm}@media print{body{padding:0}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
    </style></head><body>
    <div class="head"><div><h1>Monthly Report</h1><div class="muted">${esc(name)} · Stadium</div></div>
      <div class="muted">Generated ${new Date().toLocaleDateString('en-GB')}</div></div>

    <div class="tiles">
      ${tile('Total sales', fmt(s.sales), s.salesChangePct != null ? `${pct(s.salesChangePct)} vs ${esc(lyName)} (${fmt0(s.lySales)})` : `${vsPrev('sales')} vs previous month`, cls(s.salesChangePct))}
      ${tile('Daily cash', fmt(s.cash), s.cashChangePct != null ? `${pct(s.cashChangePct)} vs ${esc(lyName)} (${fmt0(s.lyCash)})` : `${vsPrev('cash')} vs previous month`, cls(s.cashChangePct))}
      ${tile('General expenses', fmt(s.general), p.general.v != null && s.general ? `${pct(M.pctChange(s.general, p.general.v))} vs ${esc(lyName)} (${fmt0(p.general.v)})` : `${vsPrev('general')} vs previous month`)}
      ${tile('Cash on hand (month end)', fmt(cp.months[m].balance), `Net this month ${fmt(s.netCash)}`, cls(s.netCash))}
      ${tile('Credit card', fmt(s.credit), `Total R ${fmt(s.totalR)}`)}
      ${tile('Card difference', fmt(s.cardDiff), 'Credit − Total R', cls(s.cardDiff))}
      ${tile('Paid from till', fmt(s.payouts), 'Daily expenses')}
      ${tile('Average per day', fmt(avgDay), best.i >= 0 ? `Best day: ${best.i + 1} ${M.MONTHS[m]} (${fmt0(best.v)})` : '')}
    </div>

    <h2>Daily total sales</h2>
    <div class="chart">${barChart(s.dailySales, dayLabels, { short: s.dailySales.map((_, i) => String(i + 1)), color: '#2a78d6', label: 'Daily total sales' })}</div>

    <h2>Cash flow</h2>
    <table class="t"><tbody>
      <tr><td>Daily cash collected</td><td class="r">${fmt(s.cash)}</td></tr>
      <tr><td>− General expenses</td><td class="r">${fmt(s.general)}</td></tr>
      <tr><td>− Bank deposits</td><td class="r">${fmt(s.deposits)}</td></tr>
      <tr><td>+ Bank withdrawals</td><td class="r">${fmt(s.withdrawals)}</td></tr>
      <tr class="tot"><td>Net cash this month</td><td class="r">${fmt(s.netCash)}</td></tr>
      <tr><td>Cash on hand at start of month</td><td class="r">${fmt(m > 0 ? cp.months[m - 1].balance : cp.opening)}</td></tr>
      <tr class="tot"><td>Cash on hand at end of month</td><td class="r">${fmt(cp.months[m].balance)}</td></tr>
    </tbody></table>

    ${compareSection}

    <h2>General expenses</h2>${hBars(s.generalRows, s.general)}
    <h2>Paid from till (daily expenses)</h2>${hBars(s.payoutRows, s.payouts)}

    <div class="cols">
      <div><h2>Salaries</h2>${salaries.length ? `<table class="t"><tbody>${salaries.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${fmt(x.amount)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="r">${fmt(s.salaryTotal)}</td></tr></tbody></table>` : '<p class="muted">No salary entries.</p>'}</div>
      <div><h2>Bank</h2>${s.bankItems.length ? `<table class="t"><thead><tr><th>Date</th><th class="r">Deposit</th><th class="r">Withdraw</th><th>Note</th></tr></thead><tbody>
        ${s.bankItems.map((b) => `<tr><td>${esc(b.date)}</td><td class="r">${b.deposit ? fmt(M.val(b.deposit)) : ''}</td><td class="r">${b.withdraw ? fmt(M.val(b.withdraw)) : ''}</td><td>${esc(b.note || '')}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="r">${fmt(s.deposits)}</td><td class="r">${fmt(s.withdrawals)}</td><td></td></tr></tbody></table>` : '<p class="muted">No bank movements.</p>'}</div>
    </div>

    ${cardYears.length ? `<h2>Credit card vs previous years</h2><table class="t"><thead><tr><th>Year</th><th class="r">Credit</th><th class="r">Total R</th><th class="r">Credit change</th></tr></thead><tbody>
      <tr class="tot"><td>${yearNum}</td><td class="r">${fmt(s.credit)}</td><td class="r">${fmt(s.totalR)}</td><td></td></tr>
      ${cardYears.map((c) => `<tr><td>${esc(c.label)}${c.typed ? ' (typed)' : ''}</td><td class="r">${c.credit == null ? '–' : fmt(c.credit)}</td><td class="r">${c.totalR == null ? '–' : fmt(c.totalR)}</td>
        <td class="r">${c.credit && s.credit ? pct(M.pctChange(s.credit, c.credit)) : '–'}</td></tr>`).join('')}</tbody></table>` : ''}

    <h2>Day by day</h2>
    <table class="t"><thead><tr><th>Day</th><th class="r">Total sales</th><th class="r">Daily cash</th><th class="r">Paid from till</th><th class="r">General exp.</th><th class="r">Card</th></tr></thead><tbody>
      ${s.dailySales.map((v, i) => {
        const d = i + 1;
        const gen = M.dayTotal(mo.general.rows, d);
        const card = M.val((mo.card.days[d] || {}).credit);
        if (!v && !gen && !card) return '';
        return `<tr><td>${d} ${M.MONTHS[m].slice(0, 3)} <span class="muted">${new Date(yearNum, m, d).toLocaleDateString('en-GB', { weekday: 'short' })}</span></td>
          <td class="r">${fmt(v)}</td><td class="r">${fmt(s.dailyCash[i])}</td><td class="r">${fmt(v - s.dailyCash[i])}</td><td class="r">${fmt(gen)}</td><td class="r">${fmt(card)}</td></tr>`;
      }).join('')}
      <tr class="tot"><td>Total</td><td class="r">${fmt(s.sales)}</td><td class="r">${fmt(s.cash)}</td><td class="r">${fmt(s.payouts)}</td><td class="r">${fmt(s.general)}</td><td class="r">${fmt(s.credit)}</td></tr>
    </tbody></table>
    ${mo.notes ? `<h2>Notes</h2><div class="notes">${esc(mo.notes)}</div>` : ''}
    </body></html>`;
  }

  root.Report = { monthReportHTML, barChart, fmt, fmt0, pct, esc };
})(window);
