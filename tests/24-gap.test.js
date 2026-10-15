// #83: "Show: Points / Gap to leader" on the points chart of both championship pages. The gap view plots each picked
// entry's points behind the leader (the highest-ranked picked entry, as for the knockout line, #26), actual and
// projected, on a reversed axis (leader at the top), and the knockout line becomes the points still available.
// Checked against an independent calculation from the loaded season. Switching never fetches.
const fs = require('fs');
module.exports = async (t, h) => {
  const TOTAL = 23; // the fixture's season length
  const near = (a, b) => a == null ? b == null : b != null && Math.abs(a - b) < 1e-6;
  const q = p => new URL(p.url()).searchParams;
  const csvRows = buf => buf.toString('utf8').replace(/^﻿/, '').trim().split(/\r\n/).map(r => r.split(','));
  const grab = async (p, cls) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#c >> xpath=ancestor::div[contains(@class,"card")]//button[contains(@class,"' + cls + '")]')]);
    return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) };
  };

  // Independent: cumulative points, last-5-participated projection, leader, gaps, points still available, and the
  // first round each entry's gap is bigger than what's still available.
  function expected({ rounds, sprints }, ids, kind, L){
    const key = r => kind === 'teams' ? r.teamId : r.driverId;
    const per = kind === 'teams' ? [43, 15] : [25, 8];
    const rows = id => rnd => { const r = rounds.find(x => x.round === rnd); return r ? [...(r.raceResults || []), ...(r.sprintResults || [])].filter(x => key(x) === id) : []; };
    const full = {};
    ids.forEach(id => {
      const w = Array.from({ length: L }, (_, i) => rows(id)(i + 1).reduce((s, x) => s + x.points, 0));
      const cum = []; w.forEach((v, i) => cum.push((i ? cum[i - 1] : 0) + v));
      const part = Array.from({ length: L }, (_, i) => i + 1).filter(rnd => rows(id)(rnd).length).slice(-5);
      const rate = part.length ? part.reduce((s, rnd) => s + w[rnd - 1], 0) / part.length : 0;
      full[id] = Array.from({ length: TOTAL }, (_, i) => i < L ? cum[i] : cum[L - 1] + rate * (i - (L - 1)));
    });
    const lead = Array.from({ length: TOTAL }, (_, i) => Math.max(0, ...ids.map(id => full[id][i])));
    const gap = {}, out = {};
    ids.forEach(id => { gap[id] = full[id].map((v, i) => lead[i] - v); });
    const room = Array.from({ length: TOTAL }, (_, i) => per[0] * (TOTAL - i - 1) + per[1] * sprints.filter(s => s > i + 1).length);
    ids.forEach(id => { out[id] = gap[id].findIndex((g, i) => g > room[i] + 1e-6); });
    return { gap, room, out, lead, full };
  }
  // What the page shows: plotted values per dataset, scale and texts.
  const shown = p => p.evaluate(() => { const ch = Chart.getChart(document.getElementById('c'));
    return { L, ids: D.map(d => d.id || d.teamId), codes: D.map(d => d.n), out: D.map(d => d.out),
      sets: ch.data.datasets.map(s => ({ kind: s.kind, name: s.driver || s.team, data: s.data, fill: s.fill })),
      reverse: !!ch.options.scales.y.reverse, yMax: ch.options.scales.y.max, yTitle: ch.options.scales.y.title.text,
      legend: document.getElementById('lg').textContent, note: document.getElementById('sm').textContent,
      handle: Math.abs(parseFloat(document.getElementById('dragHandle').style.left) - ch.scales.x.getPixelForValue(L - 1)) < 1,
      ends: [...document.querySelectorAll('#endLegend .endLegendPts')].map(r => r.textContent.trim()) }; });
  // Inputs: the loaded rounds and the calendar's sprint weekends (the data, not the page's own sums).
  const rounds = p => p.evaluate(() => ({ rounds: F1Controls.state.seasonRounds, sprints: currentCalendar.sprintRounds }));
  const matches = (s, e) => s.ids.every((id, k) => {
    const a = s.sets.filter(x => x.kind === 'a')[k].data, pr = s.sets.filter(x => x.kind === 'p')[k].data;
    return e.gap[id].every((g, i) => near(i < s.L ? g : null, a[i]) && near(i >= s.L - 1 ? g : null, pr[i]));
  });
  const kMatches = (s, e) => { const ka = s.sets.find(x => x.kind === 'ka').data, kp = s.sets.find(x => x.kind === 'kp').data;
    return e.room.every((v, i) => near(i < s.L ? v : null, ka[i]) && near(i >= s.L - 1 ? v : null, kp[i])); };

  for(const [page, kind, one] of [['drivers', 'drivers', 'driver'], ['constructors', 'teams', 'team']]){
    const picker = kind === 'teams' ? '#teamPicker' : '#driverPicker';
    let p = await h.openPage(page, { width: 1000 }); await h.loaded(p); await p.waitForTimeout(80);
    const hits = p.apiHits.length;
    t.check(`${page}: Show dropdown on the points chart, Points by default`,
      await p.$eval('#ptsView', s => s.value + '|' + [...s.options].map(o => o.textContent).join(',') + '|' + s.className) === 'points|Points,Gap to leader|ddSelect');
    const before = await shown(p);
    t.check(`${page}: Points view unchanged (cumulative points, knockout line, normal axis)`,
      !before.reverse && before.yTitle === 'Cumulative championship points' && /Knockout line$/.test(before.legend) && /^Knockout line:/.test(before.note));

    // Gap view: computed values, line, axis and texts.
    await p.selectOption('#ptsView', 'gap'); await p.waitForTimeout(60);
    let s = await shown(p), e = expected(await rounds(p), s.ids, kind, s.L);
    t.check(`${page}: gap view plots each entry's points behind the leader, actual and projected`, s.ids.length === 5 && matches(s, e), JSON.stringify(s.sets[1].data.slice(0, 4)));
    t.check(`${page}: …the leader sits at 0 at each round`, e.lead.every((_, i) => s.ids.some(id => near(e.gap[id][i], 0))));
    t.check(`${page}: knockout line becomes the points still available`, kMatches(s, e) && s.sets.find(x => x.kind === 'ka').name === 'Points still available', JSON.stringify(s.sets.find(x => x.kind === 'kp').data.slice(-3)));
    t.check(`${page}: reversed axis (leader at the top), the out zone shaded below the line`,
      s.reverse && s.yTitle === 'Points behind the leader' && s.sets.find(x => x.kind === 'ka').fill.value === s.yMax, s.yTitle);
    t.check(`${page}: legend and note explain the line`, /Points still available$/.test(s.legend)
      && s.note.startsWith(`Points still available: the biggest gap to `) && s.note.includes(`After round 12, ${Math.round(e.room[11])} pts are still available`) && /Below the line:/.test(s.note), s.note);
    t.check(`${page}: drag handle still at the slider's round`, s.handle);

    // All picked: the eliminated markers are the same in both views and match "gap bigger than what's still available".
    await p.click('#presetRow button[data-preset="all"]'); await p.waitForTimeout(60);
    s = await shown(p); e = expected(await rounds(p), s.ids, kind, s.L);
    t.check(`${page}: eliminated = gap bigger than the points still available (all picked)`,
      s.ids.every((id, k) => s.out[k] === e.out[id]) && s.out.some(o => o >= 0) && matches(s, e), JSON.stringify(s.out));
    await p.selectOption('#ptsView', 'points'); await p.waitForTimeout(60);
    const sp = await shown(p);
    t.check(`${page}: same eliminated entries in the points view`, JSON.stringify(sp.out) === JSON.stringify(s.out));
    await p.click('#presetRow button[data-preset="5"]'); await p.waitForTimeout(60);
    t.check(`${page}: back to Points gives exactly the original chart`, JSON.stringify((await shown(p)).sets) === JSON.stringify(before.sets));

    // Slider, tooltip, end labels, round result in the gap view.
    await p.selectOption('#ptsView', 'gap'); await h.setRound(p, 8); await p.waitForTimeout(60);
    s = await shown(p); e = expected(await rounds(p), s.ids, kind, 8);
    t.check(`${page}: moving the slider keeps the gap view and recomputes it`, s.L === 8 && s.reverse && matches(s, e) && kMatches(s, e) && s.handle);
    const tip = await p.evaluate(() => { const ch = Chart.getChart(document.getElementById('c')), cb = ch.options.plugins.tooltip.callbacks.label;
      return ch.data.datasets.filter(x => x.kind === 'a' || x.kind === 'ka').map(x => cb({ dataset: x, raw: x.data[L - 1] })); });
    const lead8 = s.ids.find(id => near(e.gap[id][7], 0)), other = s.ids.find(id => e.gap[id][7] >= 1);
    t.check(`${page}: tooltip says "leader" / "N behind" / points still available`,
      tip.includes(` ${s.codes[s.ids.indexOf(lead8)]}: leader`) && tip.includes(` ${s.codes[s.ids.indexOf(other)]}: ${Math.round(e.gap[other][7])} behind`)
      && tip.includes(` Points still available: ${Math.round(e.room[7])}`), tip.join('|'));
    const texts = await p.evaluate(() => { const orig = CanvasRenderingContext2D.prototype.fillText, got = [];
      CanvasRenderingContext2D.prototype.fillText = function(x){ if(this.canvas.id === 'c') got.push(String(x)); return orig.apply(this, arguments); };
      Chart.getChart(document.getElementById('c')).draw(); CanvasRenderingContext2D.prototype.fillText = orig; return got; });
    const endWant = s.ids.map((id, k) => s.codes[k] + ' ' + (Math.round(e.gap[id][TOTAL - 1]) > 0 ? '+' + Math.round(e.gap[id][TOTAL - 1]) : '0'));
    t.check(`${page}: end-of-line labels give the final projected gap`, endWant.every(x => texts.includes(x)), endWant.join('|') + ' / ' + texts.filter(x => /[A-Z]/.test(x)).join('|'));
    const pt = await p.evaluate(() => { document.getElementById('c').scrollIntoView({ block: 'center' }); const ch = Chart.getChart(document.getElementById('c')), b = ch.canvas.getBoundingClientRect();
      return { x: b.left + ch.scales.x.getPixelForValue(4), y: b.top + (ch.chartArea.top + ch.chartArea.bottom) / 2 }; });
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(80);
    t.check(`${page}: tapping a round opens its result in the gap view`, await p.$eval('#roundResult', el => !el.hidden && /Round 5/.test(el.textContent)));

    // Export what's shown.
    let f = await grab(p, 'exp-csv'), rows = csvRows(f.data);
    t.check(`${page}: CSV in the gap view is the gaps, leader and points still available`,
      f.name === `f1-2026-${page}-gap-r8.csv` && rows[0].join() === ['Round', 'Race', 'Projected', 'Leader', ...s.codes, 'Points still available'].join()
      && rows.length === 1 + TOTAL && rows.slice(1).every((r, i) => s.ids.every((id, k) => Math.abs(+r[4 + k] - Math.round(e.gap[id][i] * 100) / 100) < 1e-9) && +r[4 + s.ids.length] === e.room[i])
      && rows[8][3] === s.codes[s.ids.indexOf(lead8)], f.name + ' ' + rows[0].join() + ' / ' + rows[8].join());
    f = await grab(p, 'exp-png');
    t.check(`${page}: PNG in the gap view`, f.name === `f1-2026-${page}-gap-r8.png` && f.data.readUInt32BE(0) === 0x89504e47, f.name);

    // URL: pts=gap, round-trips, left out at the default.
    await p.waitForTimeout(60);
    t.check(`${page}: the gap view goes into the URL`, q(p).get('pts') === 'gap', p.url());
    t.check(`${page}: switching, sliding, tapping and exporting never fetch`, p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
    const link = p.url().split('/').pop();
    await p.goto('http://site.test/' + link); await h.loaded(p); await p.waitForTimeout(80);
    t.check(`${page}: the link opens the gap view`, await p.$eval('#ptsView', x => x.value) === 'gap' && (await shown(p)).reverse && p.url().endsWith(link), p.url());
    await p.selectOption('#ptsView', 'points'); await p.waitForTimeout(80);
    t.check(`${page}: Points (the default) is left out of the URL`, !q(p).has('pts') && q(p).get('round') === '8', p.url());
    await p.goto(`http://site.test/${page}.html?season=2026&pts=zzz`); await h.loaded(p);
    t.check(`${page}: a bad value falls back to Points`, await p.$eval('#ptsView', x => x.value) === 'points' && !(await shown(p)).reverse);
    t.check(`${page}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();

    // Phone: the dropdown sits above the legend, nothing overflows, the end legend shows gaps.
    for(const theme of ['light', 'dark']){
      p = await h.openPage(page, { width: 390, theme }); await h.loaded(p);
      await p.selectOption('#ptsView', 'gap'); await p.waitForTimeout(80);
      const fit = await p.evaluate(() => { const v = document.querySelector('.ptsView').getBoundingClientRect(), lg = document.getElementById('lg').getBoundingClientRect(),
        card = document.getElementById('lg').closest('.card').getBoundingClientRect();
        return { scroll: document.documentElement.scrollWidth, vRight: v.right, vBottom: v.bottom, lgTop: lg.top, lgW: lg.width, cardRight: card.right, cardW: card.width }; });
      t.check(`${page} phone ${theme}: dropdown above the legend, legend full width, no horizontal scroll`,
        fit.scroll <= 390 && fit.vRight <= fit.cardRight && fit.vBottom <= fit.lgTop && fit.lgW > fit.cardW - 40, JSON.stringify(fit));
      s = await shown(p); e = expected(await rounds(p), s.ids, kind, s.L);
      const ranked = s.ids.slice().sort((a, b) => e.gap[a][TOTAL - 1] - e.gap[b][TOTAL - 1]);
      t.check(`${page} phone ${theme}: end legend ranks by final gap, leader 0`,
        JSON.stringify(s.ends) === JSON.stringify(ranked.map(id => Math.round(e.gap[id][TOTAL - 1]) > 0 ? '+' + Math.round(e.gap[id][TOTAL - 1]) : '0')) && s.ends[0] === '0', s.ends.join('|'));
      await h.screenshot(p, `gap-${page}-phone-${theme}.png`);
      await p.done();
    }
    // Desktop screenshots, both themes.
    for(const theme of ['light', 'dark']){
      p = await h.openPage(page, { width: 1000, theme }); await h.loaded(p);
      const fit = await p.evaluate(() => { const v = document.querySelector('.ptsView').getBoundingClientRect(), lg = document.getElementById('lg').getBoundingClientRect();
        return { vTop: v.top, lgTop: lg.top, vLeft: v.left, lgRight: lg.right }; });
      t.check(`${page} desktop ${theme}: dropdown beside the legend, on the right`, Math.abs(fit.vTop - fit.lgTop) < 8 && fit.vLeft >= fit.lgRight, JSON.stringify(fit));
      await p.selectOption('#ptsView', 'gap'); await p.waitForTimeout(80);
      await h.screenshot(p, `gap-${page}-desktop-${theme}.png`);
      t.check(`${page} ${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
      await p.done();
    }
  }
};
