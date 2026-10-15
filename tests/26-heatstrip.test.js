// #87: results heat strip on the position page: a row per selected driver, a square per round, coloured by the
// Grand Prix finish (stronger = better), NC marked, rounds after the slider blank. Follows the picker, the sort,
// the slider, Sprints (tooltip and CSV) and the theme, fits a phone with 24 rounds, exports, and never fetches.
const fs = require('fs');
module.exports = async (t, h) => {
  const SHOTS = process.env.HEAT_SHOTS; // optional folder for full-size screenshots (looked at by a person)
  const grab = async (p, sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) };
  };
  const csvRows = buf => buf.toString('utf8').replace(/^﻿/, '').trim().split(/\r\n/).map(r => r.split(','));
  // What the strip shows: row codes and each cell's value ('3', 'NC', '' = didn't race, 'later')
  const strip = p => p.evaluate(() => {
    const rows = {}, order = [];
    document.querySelectorAll('#heatStrip .hsCell').forEach(c => {
      const id = c.dataset.id; if(!rows[id]){ rows[id] = []; order.push(id); } rows[id].push(c.dataset.v);
    });
    return { order, rows, codes: [...document.querySelectorAll('#heatStrip .hsLabel')].map(l => l.textContent.trim()) };
  });
  // Independent: each selected driver's Grand Prix finish per round through `round`.
  const expected = (p, round) => p.evaluate(L => {
    const out = {};
    selectedDriverIds.forEach(id => {
      out[id] = F1Controls.state.seasonRounds.map(r => {
        if(r.round > L) return 'later';
        const x = r.raceResults.find(q => q.driverId === id);
        return !x ? '' : x.position == null ? 'NC' : String(x.position);
      });
    });
    return out;
  }, round);
  // Independent standings order through `round`: points (GP + sprint), ties by countback of GP finishes.
  const standings = (p, round) => p.evaluate(L => {
    const pts = {}, fin = {};
    F1Controls.state.seasonRounds.filter(r => r.round <= L).forEach(r => {
      [...r.raceResults, ...(r.sprintResults || [])].forEach(x => { pts[x.driverId] = (pts[x.driverId] || 0) + x.points; });
      r.raceResults.forEach(x => { if(x.position){ const f = fin[x.driverId] = fin[x.driverId] || []; f[x.position-1] = (f[x.position-1] || 0) + 1; } });
    });
    const cb = (a, b) => { for(let i = 0; i < 30; i++){ const d = ((fin[b] || [])[i] || 0) - ((fin[a] || [])[i] || 0); if(d) return d; } return 0; };
    return Object.keys(pts).sort((a, b) => pts[b] - pts[a] || cb(a, b));
  }, round);
  const ridgeOrder = p => p.evaluate(() => ridgeChart.data.datasets.filter(d => !d._baseline).map(d => d._code));
  const lum = rgb => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  // ---- Desktop, light: values, picker, sort, slider, tooltip ----
  let p = await h.openPage('position'); await h.loaded(p);
  const hits = p.apiHits.length;
  let s = await strip(p), exp = await expected(p, 12);
  t.check('a row per selected driver (top 8 by default)', s.order.length === 8 && JSON.stringify(s.order.slice().sort()) === JSON.stringify(Object.keys(exp).sort()), s.order.join());
  t.check('a square per loaded round, a column header per round', Object.values(s.rows).every(r => r.length === 12)
    && await p.$$eval('#heatStrip .hsRound', e => e.map(x => x.textContent).join()) === '1,2,3,4,5,6,7,8,9,10,11,12');
  t.check('each square is the Grand Prix finish (position or NC), matching an independent calc', s.order.every(id => JSON.stringify(s.rows[id]) === JSON.stringify(exp[id])), JSON.stringify(s.rows[s.order[0]]));
  await p.click('#presetRow [data-preset="all"]');
  s = await strip(p); exp = await expected(p, 12);
  const all = Object.values(s.rows).flat();
  t.check('All: every driver, NC squares present and matching', s.order.length === 22 && all.includes('NC') && s.order.every(id => JSON.stringify(s.rows[id]) === JSON.stringify(exp[id])), `${all.filter(v => v === 'NC').length} NC`);
  t.check('NC squares are marked with a cross, positions are coloured, podiums dotted', await p.evaluate(() => {
    const nc = document.querySelector('#heatStrip .hsCell[data-v="NC"]'), p1 = document.querySelector('#heatStrip .hsCell[data-v="1"]'), p9 = document.querySelector('#heatStrip .hsCell[data-v="9"]');
    const elim = getComputedStyle(document.documentElement).getPropertyValue('--elim').trim();
    const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
    return nc.classList.contains('nc') && getComputedStyle(nc).backgroundImage.includes(rgb(elim)) && !nc.style.background
      && p1.classList.contains('pod') && !p9.classList.contains('pod') && !!p1.style.background;
  }));
  // light: P1 darkest, getting lighter down to P20 (the ramp is monotonic)
  const ramp = () => p.evaluate(() => [1, 2, 3, 5, 8, 10, 12, 15, 18, 20].map(n => heatColor(n)));
  let light = await ramp();
  t.check('light: P1 darkest, lighter for every worse finish', light.every((c, i) => i === 0 || lum(c) > lum(light[i - 1])), light.join(' '));
  t.check('P21+ look like P20', await p.evaluate(() => heatColor(22) === heatColor(20)));

  // picker
  const first = s.order[0];
  await p.click(`#driverPicker input[data-id="${first}"]`);
  s = await strip(p);
  t.check('picker: unticking a driver removes their row', !s.order.includes(first) && s.order.length === 21);
  await p.click('#presetRow [data-preset="none"]');
  t.check('picker: None leaves "No drivers selected." and no squares', await p.$$eval('#heatStrip .hsCell', e => e.length) === 0
    && await p.$eval('#heatEmpty', e => getComputedStyle(e).display) === 'block' && await p.$eval('#heatBox', e => getComputedStyle(e).display) === 'none');
  await p.click('#presetRow [data-preset="10"]');
  s = await strip(p);
  t.check('picker: Top 10 gives 10 rows', s.order.length === 10);

  // sort: same order as the ridgeline chart; Championship = independent standings order
  t.check('sort (Most common): rows in the chart\'s order', JSON.stringify(s.codes.map(c => c.trim())) === JSON.stringify(await ridgeOrder(p)), s.codes.join() + ' / ' + (await ridgeOrder(p)).join());
  await p.selectOption('#chartSortSelect', 'champ');
  s = await strip(p);
  const champ = (await standings(p, 12)).filter(id => s.order.includes(id));
  t.check('sort (Championship): rows in standings order (independent calc)', JSON.stringify(s.order) === JSON.stringify(champ), s.order.join());
  await p.selectOption('#chartSortSelect', 'team');
  s = await strip(p);
  t.check('sort (Team): rows in the chart\'s order', JSON.stringify(s.codes) === JSON.stringify(await ridgeOrder(p)) && JSON.stringify(s.order) !== JSON.stringify(champ), s.codes.join());
  await p.selectOption('#chartSortSelect', 'champ');

  // slider
  await h.setRound(p, 5); await p.waitForTimeout(100);
  s = await strip(p); exp = await expected(p, 5);
  t.check('slider: rounds after it are blank, earlier ones unchanged', s.order.every(id => JSON.stringify(s.rows[id]) === JSON.stringify(exp[id]))
    && s.rows[s.order[0]].slice(5).every(v => v === 'later'), JSON.stringify(s.rows[s.order[0]]));
  t.check('slider: later rounds have no colour and dimmed headers', await p.evaluate(() =>
    [...document.querySelectorAll('#heatStrip .hsCell.later')].every(c => !c.style.background && getComputedStyle(c).backgroundImage === 'none')
    && document.querySelectorAll('#heatStrip .hsRound.later').length === 7));
  t.check('slider: rows follow the standings after that round', JSON.stringify(s.order) === JSON.stringify((await standings(p, 5)).filter(id => s.order.includes(id))));
  t.check('slider: the note says later rounds are blank', /Rounds after Round 5 are left blank/.test(await h.text(p, '#heatNote')));

  // tooltip
  const sprintRound = await p.evaluate(() => F1Controls.state.seasonRounds.find(r => r.sprintResults && r.round <= 5).round);
  const who = s.order[0];
  const info = await p.evaluate(([id, n]) => { const r = F1Controls.state.seasonRounds[n - 1];
    const f = rows => { const x = rows.find(q => q.driverId === id); return x.position == null ? 'NC (not classified)' : 'P' + x.position; };
    return { code: r.raceResults.find(q => q.driverId === id).code, race: r.raceName, gp: f(r.raceResults), sp: f(r.sprintResults) }; }, [who, sprintRound]);
  const cellSel = n => `#heatStrip .hsCell[data-id="${who}"][data-round="${n}"]`;
  await p.hover(cellSel(sprintRound));
  let tip = await h.text(p, '#heatTip');
  t.check('tooltip on hover: driver, round, race, Grand Prix and sprint finish', tip.includes(info.code) && tip.includes(`Round ${sprintRound}`) && tip.includes(info.race)
    && tip.includes('Grand Prix: ' + info.gp) && tip.includes('Sprint: ' + info.sp), tip);
  t.check('tooltip: the square is outlined', await p.$eval(cellSel(sprintRound), c => c.classList.contains('sel')));
  await p.hover('h1');
  t.check('tooltip hides when the mouse leaves', await h.text(p, '#heatTip') === '(hidden)');
  await p.click('#chartOptRow input[data-opt="sprint"]'); // Sprints off
  await p.hover(cellSel(sprintRound));
  tip = await h.text(p, '#heatTip');
  t.check('tooltip with Sprints off: Grand Prix finish only', tip.includes(info.gp) && !tip.includes('Sprint') && !tip.includes('Grand Prix:'), tip);
  t.check('Sprints off: the squares stay Grand Prix finishes', JSON.stringify((await strip(p)).rows[who]) === JSON.stringify(exp[who]));
  await p.hover(cellSel(9));
  t.check('tooltip on a round after the slider says so', /After Round 5/.test(await h.text(p, '#heatTip')));
  await p.click('#chartOptRow input[data-opt="sprint"]'); // back on
  await p.mouse.move(0, 0);

  t.check('desktop: never fetches (picker, sort, slider, toggles, tooltip)', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('desktop: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Export ----
  p = await h.openPage('position', { theme: 'dark' }); await h.loaded(p);
  const hits2 = p.apiHits.length;
  t.check('export: PNG and CSV links on the card', await p.$eval('#heatCard .exportRow', r => r.textContent.replace(/\s+/g, ' ').trim()) === 'PNG · CSV');
  let f = await grab(p, '#heatCard .exp-csv'), rows = csvRows(f.data);
  exp = await expected(p, 12);
  const sel = (await strip(p)).order, codes = (await strip(p)).codes;
  const sprints = await p.evaluate(() => F1Controls.state.seasonRounds.filter(r => r.sprintResults).map(r => r.round));
  const head = ['Driver']; for(let n = 1; n <= 12; n++){ head.push('R' + n); if(sprints.includes(n)) head.push(`R${n} sprint`); }
  const spExp = await p.evaluate(ids => ids.map(id => F1Controls.state.seasonRounds.filter(r => r.sprintResults).map(r => {
    const x = r.sprintResults.find(q => q.driverId === id); return !x ? '' : x.position == null ? 'NC' : String(x.position); })), sel);
  t.check('export: CSV named by season and round, a column per round (+ sprint columns with Sprints on)', f.name === 'f1-2026-results-by-round-r12.csv' && rows[0].join() === head.join(), f.name + ' ' + rows[0].join());
  t.check('export: CSV rows are the strip\'s rows with the right finishes', rows.slice(1).map(r => r[0]).join() === codes.join()
    && rows.slice(1).every((r, i) => JSON.stringify(head.map((hd, j) => [hd, r[j]]).filter(([hd]) => /^R\d+$/.test(hd)).map(x => x[1])) === JSON.stringify(exp[sel[i]])
      && JSON.stringify(head.map((hd, j) => [hd, r[j]]).filter(([hd]) => /sprint/.test(hd)).map(x => x[1])) === JSON.stringify(spExp[i])), rows[1].join());
  await p.click('#chartOptRow input[data-opt="sprint"]');
  await h.setRound(p, 4); await p.waitForTimeout(100);
  f = await grab(p, '#heatCard .exp-csv'); rows = csvRows(f.data);
  t.check('export: Sprints off and slider at 4 → R1–R4 only', rows[0].join() === 'Driver,R1,R2,R3,R4' && f.name === 'f1-2026-results-by-round-r4.csv', rows[0].join());
  f = await grab(p, '#heatCard .exp-png'); if(SHOTS) fs.writeFileSync(SHOTS + '/heat-export-dark.png', f.data);
  const img = await p.evaluate(async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const corner = x.getImageData(2, 2, 1, 1).data;
    // count pixels in the strip's hues (bluish: b clearly above r)
    const d = x.getImageData(0, 0, im.width, im.height).data; let blue = 0, red = 0;
    for(let i = 0; i < d.length; i += 4){ if(d[i+2] > d[i] + 60 && d[i+2] > 120) blue++; if(d[i] > 200 && d[i+1] < 110 && d[i+2] < 110) red++; }
    return { w: im.width, h: im.height, corner: [...corner].slice(0, 3), blue, red };
  }, f.data.toString('base64'));
  t.check('export: PNG named, dark panel background, squares and NC crosses drawn', f.name === 'f1-2026-results-by-round-r4.png' && img.corner.join() === '25,29,36' && img.blue > 2000 && img.red > 20, JSON.stringify(img));
  t.check('export: never fetches', p.apiHits.length === hits2);
  t.check('export: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Themes ----
  p = await h.openPage('position', { theme: 'dark' }); await h.loaded(p);
  const dark = await p.evaluate(() => [1, 2, 3, 5, 8, 10, 12, 15, 18, 20].map(n => heatColor(n)));
  t.check('dark: its own ramp, P1 brightest, fainter for every worse finish', dark.every((c, i) => i === 0 || lum(c) < lum(dark[i - 1])) && dark[0] !== light[0], dark.join(' '));
  const p1 = () => p.$eval('#heatStrip .hsCell[data-v="1"]', c => c.style.background);
  const before = await p1();
  const hits3 = p.apiHits.length;
  await p.click('#themeToggle .theme-trigger'); await p.click('#themeToggle .theme-menu button[data-pref="light"]'); await p.waitForTimeout(100);
  t.check('theme switch recolours the squares, without fetching', before === dark[0] && (await p1()) === light[0],`${before} → ${await p1()}`);
  t.check('theme switch: no fetch', p.apiHits.length === hits3);
  await p.done();

  // ---- Phone: tap, fit with 24 rounds ----
  for(const theme of ['light', 'dark']){
    p = await h.openPage('position', { theme, width: 390 }); await h.loaded(p);
    const hits4 = p.apiHits.length;
    await p.click('#presetRow [data-preset="all"]');
    // tap: touch pointer then click
    const tap = cell => p.$eval(cell, c => { c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); c.click(); });
    const target = '#heatStrip .hsCell[data-round="12"]';
    await tap(target);
    const tb = await p.$eval('#heatTip', e => { const b = e.getBoundingClientRect(); return { hidden: e.hidden, l: b.left, r: b.right }; });
    t.check(`phone ${theme}: tapping a square shows its details, inside the screen`, !tb.hidden && tb.l >= 0 && tb.r <= 390, JSON.stringify(tb));
    await tap(target);
    t.check(`phone ${theme}: tapping it again closes them`, await h.text(p, '#heatTip') === '(hidden)');
    await tap(target); await p.click('h1');
    t.check(`phone ${theme}: tapping elsewhere closes them`, await h.text(p, '#heatTip') === '(hidden)');
    // a 24-round season (the fake season's 12 rounds twice), loaded the way F1Controls hands it over
    await p.evaluate(() => {
      const rs = F1Controls.state.seasonRounds, more = rs.map(r => ({ ...r, round: r.round + 12, raceName: r.raceName + ' II' }));
      window.dispatchEvent(new CustomEvent('f1selection', { detail: { year: 2026, round: 24, maxRound: 24, seasonRounds: [...rs, ...more] } }));
    });
    await p.click('#presetRow [data-preset="all"]');
    const fit = await p.evaluate(() => {
      const g = document.getElementById('heatStrip'), card = document.getElementById('heatCard').getBoundingClientRect();
      const cells = [...g.querySelectorAll('.hsCell')].map(c => c.getBoundingClientRect());
      const lastHead = [...g.querySelectorAll('.hsRound')].pop().getBoundingClientRect();
      return { page: document.documentElement.scrollWidth, cols: g.querySelectorAll('.hsRound').length, min: Math.min(...cells.map(c => c.width)), max: Math.max(...cells.map(c => c.width)),
        right: Math.max(...cells.map(c => c.right)), cardRight: card.right - 14, scroll: g.scrollWidth - g.clientWidth, square: cells.every(c => Math.abs(c.width - c.height) < 0.6), head: lastHead.right };
    });
    t.check(`phone ${theme}: 24 rounds fit (no page or strip scroll, cells ~10–13px, square)`, fit.cols === 24 && fit.page <= 390 && fit.scroll <= 0 && fit.right <= fit.cardRight + 0.5
      && fit.head <= fit.cardRight + 2 && fit.min >= 9.5 && fit.max <= 13.5 && fit.square, JSON.stringify(fit));
    if(SHOTS) await (await p.$('#heatCard')).screenshot({ path: `${SHOTS}/heat-390-${theme}.png` });
    await h.screenshot(p, `heatstrip-390-${theme}.png`);
    t.check(`phone ${theme}: never fetches`, p.apiHits.length === hits4);
    t.check(`phone ${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
  // Desktop screenshots with 24 rounds and a slider part-way, both themes
  for(const theme of ['light', 'dark']){
    p = await h.openPage('position', { theme, width: 1000 }); await h.loaded(p);
    await p.evaluate(() => {
      const rs = F1Controls.state.seasonRounds, more = rs.map(r => ({ ...r, round: r.round + 12, raceName: r.raceName + ' II' }));
      window.dispatchEvent(new CustomEvent('f1selection', { detail: { year: 2026, round: 20, maxRound: 24, seasonRounds: [...rs, ...more] } }));
    });
    await p.click('#presetRow [data-preset="10"]');
    const fit = await p.evaluate(() => { const c = document.querySelector('#heatStrip .hsCell').getBoundingClientRect(); return { w: c.width, page: document.documentElement.scrollWidth }; });
    t.check(`desktop ${theme}: 24 rounds, squares ~20px, no page scroll`, fit.w >= 18 && fit.w <= 22.5 && fit.page <= 1000, JSON.stringify(fit));
    await p.hover('#heatStrip .hsCell[data-round="14"]');
    if(SHOTS) await (await p.$('#heatCard')).screenshot({ path: `${SHOTS}/heat-1000-${theme}.png` });
    await h.screenshot(p, `heatstrip-1000-${theme}.png`);
    t.check(`desktop ${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
