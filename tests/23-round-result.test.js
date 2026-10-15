// #29: tap or click a round on the championship points chart to see that round's result under the chart:
// the finishing order (drivers) or each team's points and finishes (constructors), Grand Prix / Sprint on sprint
// weekends, ‹ › to step and × to close. Projected rounds can't be opened. Never fetches; the open round is in the URL.
module.exports = async (t, h) => {
  const tapRound = async (p, n, sel = '#c') => {
    const pt = await p.evaluate(([n, sel]) => { const ch = Chart.getChart(document.querySelector(sel)), b = ch.canvas.getBoundingClientRect();
      return { x: b.left + ch.scales.x.getPixelForValue(n - 1), y: b.top + (ch.chartArea.top + ch.chartArea.bottom) / 2 }; }, [n, sel]);
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(60);
  };
  const panel = p => p.evaluate(() => { const el = document.getElementById('roundResult');
    return { hidden: !el || el.hidden, title: el && el.querySelector('.rr-title')?.textContent.replace(/\s+/g, ' ').trim(),
      rows: el ? [...el.querySelectorAll('tbody tr')].map(tr => [tr.dataset.id, ...[...tr.children].map(td => td.textContent.trim())]) : [],
      picked: el ? [...el.querySelectorAll('tbody tr.rr-pick')].map(tr => tr.dataset.id) : [],
      sprint: !!el?.querySelector('.rr-sprint'), more: el?.querySelector('.rr-more')?.textContent || null }; });
  // Independent expectation: classified finishers by position, then the rest.
  const expected = (p, n, s) => p.evaluate(([n, s]) => { const r = F1Controls.state.seasonRounds.find(x => x.round === n);
    const res = s === 'sprint' ? r.sprintResults : r.raceResults;
    return { name: r.raceName, order: [...res.filter(x => x.position != null).sort((a, b) => a.position - b.position), ...res.filter(x => x.position == null)].map(x => [x.driverId, x.position == null ? 'NC' : String(x.position), String(x.points)]) }; }, [n, s]);

  let p = await h.openPage('drivers', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;
  t.check('starts closed', (await panel(p)).hidden);
  // Find a GP with someone not classified, and the fixture's sprint rounds.
  const info = await p.evaluate(() => { const rs = F1Controls.state.seasonRounds;
    return { nc: rs.find(r => r.raceResults.some(x => x.position == null))?.round, sprints: rs.filter(r => r.sprintResults && r.sprintResults.length).map(r => r.round) }; });
  await tapRound(p, info.nc);
  let s = await panel(p), want = await expected(p, info.nc, 'gp');
  t.check('clicking a round opens its result, titled with the round and race', !s.hidden && s.title === `Round ${info.nc} ${want.name}`, s.title);
  t.check('top 10 in finishing order, with "Show all"', s.rows.length === 10 && JSON.stringify(s.rows.map(r => [r[0], r[1], r[4]])) === JSON.stringify(want.order.slice(0, 10)) && /^Show all \d+$/.test(s.more), JSON.stringify(s.rows.slice(0, 3)));
  await p.click('#roundResult .rr-more'); s = await panel(p);
  t.check('…"Show all" lists everyone, not classified last as NC', JSON.stringify(s.rows.map(r => [r[0], r[1], r[4]])) === JSON.stringify(want.order) && s.rows.slice(-1)[0][1] === 'NC', JSON.stringify(s.rows.slice(-2)));
  await h.screenshot(p, 'round-result-drivers-light.png');
  const sel = await p.evaluate(() => selectedDriverIds.slice().sort());
  t.check('drivers you picked are highlighted', JSON.stringify(s.picked.slice().sort()) === JSON.stringify(sel.filter(id => s.rows.some(r => r[0] === id)).sort()) && s.picked.length > 0, JSON.stringify(s.picked));
  t.check('the round is shaded on the chart', await p.evaluate(n => { const ch = Chart.getChart(document.getElementById('c')), x = Math.round(ch.scales.x.getPixelForValue(n - 1)), y = Math.round(ch.chartArea.bottom - 3);
    const d = ch.ctx.getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data; return d[0] < 250; }, info.nc));
  t.check('tooltip title names the race; footer says click', await p.evaluate(n => { const ch = Chart.getChart(document.getElementById('c')), cb = ch.options.plugins.tooltip.callbacks;
    const it = [{ dataIndex: n - 1 }]; return /^Round \d+ · \S/.test(cb.title(it)) && cb.footer(it) === 'Click for the full result' && cb.footer([{ dataIndex: 20 }]) === ''; }, info.nc));

  // Sprint weekend: switch sessions.
  const sr = info.sprints[0];
  await tapRound(p, sr); s = await panel(p);
  t.check('a sprint weekend has a Grand Prix / Sprint switch, starting on the Grand Prix', s.sprint && JSON.stringify(s.rows.map(r => r[0])) === JSON.stringify((await expected(p, sr, 'gp')).order.map(x => x[0])));
  await p.click('#roundResult .rr-sprint'); s = await panel(p);
  const wantS = await expected(p, sr, 'sprint');
  t.check('…Sprint shows the sprint result', JSON.stringify(s.rows.map(r => [r[0], r[1], r[4]])) === JSON.stringify(wantS.order), JSON.stringify(s.rows.slice(0, 2)));
  t.check('…and goes into the URL', new URL(p.url()).searchParams.get('result') === String(sr) && new URL(p.url()).searchParams.get('session') === 'sprint', p.url());
  const sLink = p.url();

  // Arrows, ends and close.
  await p.click('#roundResult .rr-prev'); s = await panel(p);
  t.check('‹ goes to the previous round', s.title.startsWith(`Round ${sr - 1} `), s.title);
  await tapRound(p, 1);
  t.check('‹ is disabled on round 1', await p.$eval('#roundResult .rr-prev', b => b.disabled));
  await p.focus('#roundResult .rr-next'); await p.keyboard.press('ArrowRight'); s = await panel(p);
  t.check('arrow keys step through rounds', s.title.startsWith('Round 2 '), s.title);
  await tapRound(p, 12);
  t.check('› is disabled on the slider\'s round', await p.$eval('#roundResult .rr-next', b => b.disabled));
  await tapRound(p, 15); s = await panel(p);
  t.check('projected rounds don\'t open', s.title.startsWith('Round 12 '), s.title);
  await h.setRound(p, 8); await p.waitForTimeout(60);
  t.check('moving the slider before the open round closes it', (await panel(p)).hidden);
  await tapRound(p, 3); await p.click('#roundResult .rr-close');
  await p.waitForTimeout(50);
  t.check('× closes it, and it leaves the URL', (await panel(p)).hidden && !new URL(p.url()).searchParams.has('result'), p.url() + ' hidden=' + (await panel(p)).hidden);
  await tapRound(p, 3); await p.keyboard.press('Escape');
  t.check('Escape closes it too', (await panel(p)).hidden);
  t.check('opening results never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // A link opens the same result.
  p = await h.openPage('drivers'); await p.goto(sLink); await h.loaded(p); await p.waitForTimeout(80);
  s = await panel(p);
  t.check('a shared link opens the same round and session', !s.hidden && s.title.startsWith(`Round ${sr} `) && s.rows.length === 10 && JSON.stringify(s.rows.map(r => r[0])) === JSON.stringify(wantS.order.slice(0, 10).map(x => x[0])) && p.url() === sLink, p.url());
  await p.selectOption('.f1c-year', '2025').catch(() => {}); await p.waitForTimeout(200);
  await p.done();

  // Constructors: each team's points and finishes.
  p = await h.openPage('constructors', { width: 1000, theme: 'dark' }); await h.loaded(p);
  await tapRound(p, info.nc); s = await panel(p);
  const teams = await p.evaluate(n => { const r = F1Controls.state.seasonRounds.find(x => x.round === n), t = {};
    r.raceResults.forEach(x => { (t[x.teamId] = t[x.teamId] || { pts: 0, best: 99 }); t[x.teamId].pts += x.points; if(x.position != null) t[x.teamId].best = Math.min(t[x.teamId].best, x.position); });
    return Object.entries(t).sort((a, b) => b[1].pts - a[1].pts || a[1].best - b[1].best).map(([id, v]) => [id, String(v.pts)]); }, info.nc);
  t.check('constructors: every team, most points first, with the round\'s points', JSON.stringify(s.rows.map(r => [r[0], r[4]])) === JSON.stringify(teams) && !s.more, JSON.stringify(s.rows.slice(0, 3)));
  t.check('constructors: each team\'s two finishes', s.rows.every(r => /^(P\d+|NC)(, (P\d+|NC))*$/.test(r[3])) && s.rows.some(r => /NC/.test(r[3])), JSON.stringify(s.rows.map(r => r[3])));
  await h.screenshot(p, 'round-result-constructors-dark.png');
  t.check('constructors: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Phone: tap opens it, it fits, and there's no "click" hint.
  for(const theme of ['light', 'dark']){
    p = await h.openPage('drivers', { width: 390, theme }); await h.loaded(p);
    await tapRound(p, info.sprints[0]); await p.click('#roundResult .rr-sprint');
    const fit = await p.evaluate(() => { const el = document.getElementById('roundResult'), b = el.getBoundingClientRect();
      return { right: b.right, scroll: document.documentElement.scrollWidth, tableW: el.querySelector('table').scrollWidth, panelW: el.clientWidth, head: el.querySelector('.rr-tools').getBoundingClientRect().right }; });
    t.check(`phone ${theme}: the result fits without horizontal scroll`, fit.right <= 390 && fit.scroll <= 390 && fit.tableW <= fit.panelW && fit.head <= 390, JSON.stringify(fit));
    await h.screenshot(p, `round-result-phone-${theme}.png`);
    await p.done();
  }
};
