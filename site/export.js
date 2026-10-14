/* F1Export (#33): a "⤓ PNG · CSV" row under a chart. PNG is a self-explanatory picture of the chart: its title,
   the season and round, the legend, the chart itself and the site's address, on the current theme's background.
   CSV is the data behind the chart. Both are made in the browser from what's already drawn — nothing is fetched.

   F1Export.attach(cardEl, {
     name:     'drivers-points'            file name part,
     title:    () => 'Drivers’ Championship', subtitle: () => '2026 · after Round 17',
     canvas:   () => canvasEl              the chart to draw, or
     draw:     (ctx, x, y, width) => h     draws its own picture (for HTML charts) and returns its height,
     legend:   () => [{label, color, dash}] optional,
     csv:      () => [[header…], [row…], …] (or null when there's nothing to export),
     csvLabel: 'CSV'                       (optional; csv2/csv2Label add a second CSV link),
   }) */
const F1Export = (() => {
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const font = (weight, size) => `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;

  function fileBase(opts){
    const st = typeof F1Controls !== 'undefined' ? F1Controls.state : {};
    return ['f1', st.year, opts.name, st.round ? 'r' + st.round : ''].filter(Boolean).join('-');
  }
  function download(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---- CSV ----
  const cell = v => { if(v == null) return ''; const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

  // ---- PNG ----
  // Lays the legend out in rows; returns the items with positions and the height used.
  function legendLayout(ctx, items, width){
    ctx.font = font(600, 12);
    const out = []; let x = 0, y = 0;
    items.forEach(it => {
      const w = 22 + 6 + ctx.measureText(it.label).width + 16;
      if(x > 0 && x + w > width){ x = 0; y += 20; }
      out.push({ ...it, x, y }); x += w;
    });
    return { items: out, height: items.length ? y + 20 : 0 };
  }
  function picture(opts){
    const S = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), pad = 22; // match the chart canvas's own resolution
    const chart = opts.canvas ? opts.canvas() : null;
    const innerW = Math.round(chart ? chart.clientWidth : (opts.width || 640));
    const W = innerW + 2 * pad;
    const probe = document.createElement('canvas').getContext('2d');
    const legend = legendLayout(probe, (opts.legend && opts.legend()) || [], innerW);
    let bodyH = chart ? Math.round(chart.clientHeight) : 0;
    if(opts.draw){ const c = document.createElement('canvas').getContext('2d'); bodyH = opts.draw(c, 0, 0, innerW, true); }
    const H = pad + 22 + 18 + 12 + legend.height + (legend.height ? 8 : 0) + bodyH + 12 + 16 + pad;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d'); ctx.scale(S, S);
    ctx.fillStyle = css('--panel') || '#fff'; ctx.fillRect(0, 0, W, H);
    let y = pad;
    ctx.textBaseline = 'top';
    ctx.fillStyle = css('--ink') || '#222'; ctx.font = font(700, 17); ctx.fillText(opts.title(), pad, y); y += 22;
    ctx.fillStyle = css('--sub') || '#777'; ctx.font = font(400, 12.5); ctx.fillText(opts.subtitle ? opts.subtitle() : '', pad, y); y += 18 + 12;
    if(legend.height){
      ctx.textBaseline = 'middle'; ctx.font = font(600, 12);
      legend.items.forEach(it => {
        const lx = pad + it.x, ly = y + it.y + 9;
        ctx.strokeStyle = it.color; ctx.lineWidth = 2.6; ctx.setLineDash(it.dash || []);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = css('--ink2') || '#444'; ctx.fillText(it.label, lx + 28, ly);
      });
      y += legend.height + 8; ctx.textBaseline = 'top';
    }
    if(chart) ctx.drawImage(chart, pad, y, innerW, bodyH);
    else if(opts.draw) opts.draw(ctx, pad, y, innerW, false);
    y += bodyH + 12;
    ctx.fillStyle = css('--sub') || '#777'; ctx.font = font(500, 11); ctx.textAlign = 'right';
    ctx.fillText('f1.gubes.net', W - pad, y);
    return cv;
  }

  function attach(card, opts){
    if(!card) return;
    const row = document.createElement('div');
    row.className = 'exportRow';
    row.innerHTML = `${ICON}<button type="button" class="f1c-link exp-png">PNG</button>`
      + ` · <button type="button" class="f1c-link exp-csv">${opts.csvLabel || 'CSV'}</button>`
      + (opts.csv2 ? ` · <button type="button" class="f1c-link exp-csv2">${opts.csv2Label}</button>` : '');
    if(opts.noPng){ row.querySelector('.exp-png').nextSibling.remove(); row.querySelector('.exp-png').remove(); }
    card.appendChild(row);
    const png = row.querySelector('.exp-png');
    if(png) png.addEventListener('click', () => {
      const cv = picture(opts);
      cv.toBlob(b => b && download(b, fileBase(opts) + '.png'), 'image/png');
    });
    const csvLink = (btn, fn, suffix) => btn && btn.addEventListener('click', () => {
      const rows = fn(); if(!rows || rows.length < 2) return;
      download(new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' }), fileBase(opts) + (suffix || '') + '.csv');
    });
    csvLink(row.querySelector('.exp-csv'), opts.csv, opts.csvSuffix);
    csvLink(row.querySelector('.exp-csv2'), opts.csv2, opts.csv2Suffix);
  }

  // A round label for subtitles: "2026 · after Round 17 of 23".
  function roundText(total){
    const st = typeof F1Controls !== 'undefined' ? F1Controls.state : {};
    return st.year ? `${st.year} season · after Round ${st.round}${total ? ' of ' + total : ''}` : '';
  }
  // The three charts on the drivers' and constructors' pages (same layout). get() returns the page's current
  // {D, N, L, R, thr, projChart, posChart}.
  function championshipPage(kind, get){
    const noun = kind === 'teams' ? 'Constructors’' : 'Drivers’', who = kind === 'teams' ? 'Team' : 'Driver';
    const card = id => document.getElementById(id) && document.getElementById(id).closest('.card');
    attach(card('c'), {
      name: kind === 'teams' ? 'constructors-points' : 'drivers-points',
      title: () => `${noun} Championship: points by round`,
      subtitle: () => { const g = get(); return roundText(g.N) + (g.L < g.N ? ' · later rounds projected from the last 5' : ''); },
      canvas: () => document.getElementById('c'),
      legend: () => get().D.map(d => ({ label: d.n, color: F1Theme.team(d.c), dash: d.d && d.d.length ? [5, 3] : null }))
        .concat([{ label: 'Knockout line', color: F1Theme.chart().knock }]),
      csv: () => { const g = get(); if(!g.D.length) return null;
        return [['Round', 'Race', 'Projected', ...g.D.map(d => d.n), 'Knockout line'],
          ...Array.from({ length: g.N }, (_, i) => [i + 1, g.R[i], i < g.L ? 'no' : 'yes', ...g.D.map(d => d.full[i]), g.thr[i]])]; },
    });
    attach(card('projChart'), {
      name: kind === 'teams' ? 'constructors-projected' : 'drivers-projected',
      title: () => `${noun} Championship: projected final points`,
      subtitle: () => { const st = F1Controls.state; return `${st.year} season · as projected after each round`; },
      canvas: () => document.getElementById('projChart'),
      legend: () => { const ch = get().projChart; return ch ? ch.data.datasets.map(d => ({ label: d.name, color: d.borderColor, dash: d.borderDash })) : []; },
      csv: () => { const ch = get().projChart; if(!ch || !ch.data.datasets.length) return null; const ds = ch.data.datasets;
        return [['After round', ...ds.map(d => d.name)], ...ds[0].data.map((_, i) => [i + 1, ...ds.map(d => d.data[i] && d.data[i].y)])]; },
    });
    attach(card('posChart'), {
      name: kind === 'teams' ? 'constructors-positions' : 'drivers-positions',
      title: () => `${noun} Championship: ${document.getElementById('posView').value === 'proj' ? 'projected final position' : 'position'} by round`,
      subtitle: () => { const st = F1Controls.state; return `${st.year} season · all ${kind === 'teams' ? 'teams' : 'drivers'} · through Round ${st.maxRound}`; },
      canvas: () => document.getElementById('posChart'),
      csv: () => { const ch = get().posChart; if(!ch) return null; const ds = ch.data.datasets;
        return [['Round', ...ds.map(d => d.label)], ...ds[0]._vals.map((_, i) => [i + 1, ...ds.map(d => d._vals[i])])]; },
    });
  }

  // Rows of an HTML table (header row first), using the long name where a cell has long/short versions.
  function tableRows(table){
    return [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => {
      const long = td.querySelector('.long'); return (long ? long.textContent : td.textContent).trim();
    }));
  }

  return { attach, picture, toCSV, roundText, championshipPage, tableRows };
})();
