// #88: "Talking points" card on the drivers' page — facts about the whole field as of the slider's round (leader
// and gap, most wins, longest active points streak, biggest climber / faller over the last 5 rounds, most not
// classified), each checked against an independent calculation here, plus ties, early rounds, following the slider
// and season, never fetching, both themes and the phone fit.
module.exports = async (t, h) => {
  // Independent expectation from the raw season data (no site helpers): standings by points, ties by countback of
  // Grand Prix finishes; facts as described on the card.
  const expected = (p, round) => p.evaluate(round => {
    const all = F1Controls.state.seasonRounds.filter(r => r.round <= round).sort((a, b) => a.round - b.round);
    const code = {};
    const standings = n => { const tot = {}, fin = {};
      all.filter(x => x.round <= n).forEach(x => {
        [...x.raceResults, ...(x.sprintResults || [])].forEach(q => { tot[q.driverId] = (tot[q.driverId] || 0) + q.points; code[q.driverId] = q.code; });
        x.raceResults.forEach(q => { if(q.position >= 1){ const f = fin[q.driverId] = fin[q.driverId] || new Array(40).fill(0); f[q.position - 1]++; } });
      });
      const cb = (a, b) => { const A = fin[a] || [], B = fin[b] || []; for(let i = 0; i < 40; i++){ const d = (B[i] || 0) - (A[i] || 0); if(d) return d; } return 0; };
      return { order: Object.keys(tot).sort((a, b) => tot[b] - tot[a] || cb(a, b)), tot }; };
    const now = standings(round), pos = {}; now.order.forEach((id, i) => { pos[id] = i; });
    const top = (vals, min) => { const ids = Object.keys(vals).filter(id => vals[id] > min); if(!ids.length) return null;
      const n = Math.max(...ids.map(id => vals[id])); return { n, ids: ids.filter(id => vals[id] === n).sort((a, b) => pos[a] - pos[b]) }; };
    const f = {};
    const [a, b] = now.order;
    f.leader = { ids: [a], n: now.tot[a] - now.tot[b], pts: now.tot[a], second: code[b] };
    const wins = {}, nc = {}, starts = {};
    all.forEach(r => r.raceResults.forEach(q => { starts[q.driverId] = (starts[q.driverId] || 0) + 1;
      if(q.position === 1) wins[q.driverId] = (wins[q.driverId] || 0) + 1; if(q.position == null) nc[q.driverId] = (nc[q.driverId] || 0) + 1; }));
    f.wins = top(wins, 0); if(f.wins) f.wins.winners = Object.keys(wins).length;
    const streak = {};
    now.order.forEach(id => { let s = 0;
      for(let i = all.length - 1; i >= 0; i--){ const r = all[i];
        const got = [...r.raceResults, ...(r.sprintResults || [])].filter(q => q.driverId === id).reduce((s, q) => s + q.points, 0);
        if(got > 0) s++; else break; }
      streak[id] = s; });
    f.streak = top(streak, 1);
    if(round >= 6){
      const then = standings(round - 5).order, up = {}, down = {};
      now.order.forEach(id => { const j = then.indexOf(id); if(j >= 0){ up[id] = j - pos[id]; down[id] = pos[id] - j; } });
      f.climber = top(up, 0); f.faller = top(down, 0);
      if(f.climber && f.climber.ids.length === 1) f.climber.path = `P${then.indexOf(f.climber.ids[0]) + 1} → P${pos[f.climber.ids[0]] + 1}`;
    }
    f.nc = top(nc, 0); if(f.nc) f.nc.starts = starts[f.nc.ids[0]];
    Object.keys(f).forEach(k => { if(!f[k]) delete f[k]; else f[k].codes = f[k].ids.map(id => code[id]); });
    return f;
  }, round);
  const shown = p => p.$$eval('#talkingPoints .tp', els => els.map(e => ({ key: e.dataset.fact, ids: e.dataset.ids.split(','), n: +e.dataset.n,
    label: e.querySelector('.tpLabel').textContent, value: e.querySelector('.tpValue').textContent.replace(/\s+/g, ' ').trim(),
    detail: (e.querySelector('.tpDetail') || { textContent: '' }).textContent.trim() })));
  const ORDER = ['leader', 'wins', 'streak', 'climber', 'faller', 'nc'];
  const names = codes => codes.length > 3 ? codes.slice(0, 3).join(', ') + ` +${codes.length - 3} more` : codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes.slice(-1) : codes[0];

  let p = await h.openPage('drivers', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;
  t.check('the card sits right after the points chart card', await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.wrap > .card')]; return cards.indexOf(document.getElementById('tpCard')) === cards.indexOf(document.getElementById('c').closest('.card')) + 1; }));

  for(const round of [12, 9, 6, 5, 2, 1]){
    if(round !== 12){ await h.setRound(p, round); await p.waitForTimeout(80); }
    const want = await expected(p, round), got = await shown(p);
    t.check(`round ${round}: shows exactly the facts that apply, in order`, JSON.stringify(got.map(g => g.key)) === JSON.stringify(ORDER.filter(k => want[k])),
      JSON.stringify([got.map(g => g.key), Object.keys(want)]));
    const bad = got.filter(g => !want[g.key] || JSON.stringify(g.ids) !== JSON.stringify(want[g.key].ids) || g.n !== want[g.key].n || !g.value.startsWith(names(want[g.key].codes) + ' · '));
    t.check(`round ${round}: every fact names the right drivers with the right number`, bad.length === 0, JSON.stringify(bad.map(b => [b, want[b.key]])));
    const g = Object.fromEntries(got.map(x => [x.key, x]));
    if(round < 6) t.check(`round ${round}: no 5-round climber or faller yet`, !g.climber && !g.faller);
    if(round === 1) t.check('round 1: no points streak yet (needs 2 rounds)', !g.streak);
    t.check(`round ${round}: leader shows points and the gap to second`, g.leader && g.leader.value.endsWith(`· ${want.leader.pts} pts`)
      && g.leader.detail === (want.leader.n > 0 ? `${want.leader.n} pt${want.leader.n === 1 ? '' : 's'} ahead of ${want.leader.second}` : `level with ${want.leader.second}, ahead on countback`), JSON.stringify(g.leader));
    if(want.wins) t.check(`round ${round}: wins line counts the different winners`, g.wins.detail === `${want.wins.winners} different winner${want.wins.winners === 1 ? '' : 's'} in ${round} Grand${round === 1 ? ' Prix' : 's Prix'}`, g.wins.detail);
    if(want.nc && want.nc.ids.length === 1) t.check(`round ${round}: not classified says out of how many starts`, g.nc.detail === `of ${want.nc.starts} started`, g.nc.detail);
    if(want.climber && want.climber.path) t.check(`round ${round}: climber shows from and to`, g.climber.detail === `${want.climber.path} · last 5 rounds`, g.climber.detail);
    t.check(`round ${round}: subtitle names the round`, await h.text(p, '#tpSub') === `whole field · after round ${round}`, await h.text(p, '#tpSub'));
  }
  // The fixture has a 4-way points streak at round 12: listed as "+1 more", with everyone in the tooltip.
  await h.setRound(p, 12); await p.waitForTimeout(80);
  const st = await p.$eval('#talkingPoints [data-fact="streak"]', e => ({ ids: e.dataset.ids.split(',').length, more: e.querySelector('.tpMore')?.textContent, title: e.querySelector('.tpMore')?.title, each: /each/.test(e.textContent), flags: e.querySelectorAll('.tpName img.flag').length }));
  t.check('a tie of more than 3 shows three names, "+N more" and everyone on hover', st.ids === 4 && st.more === '+1 more' && st.title.split(', ').length === 4 && st.each && st.flags === 3, JSON.stringify(st));
  t.check('names carry flags', await p.$$eval('#talkingPoints [data-fact="leader"] .tpName img.flag', x => x.length) === 1);

  // Whole field: the picker doesn't change it.
  const before = await p.$eval('#talkingPoints', e => e.innerHTML);
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(60);
  t.check('picking drivers doesn\'t change the facts (whole field)', await p.$eval('#talkingPoints', e => e.innerHTML) === before);
  await p.click('#presetRow [data-preset="5"]'); await p.waitForTimeout(60);

  // Theme switch: colours follow, content stays.
  const bg = () => p.$eval('#talkingPoints .tp', e => getComputedStyle(e).backgroundColor);
  const light = await bg();
  await p.click('#themeToggle .theme-trigger'); await p.click('#themeToggle button[data-pref="dark"]'); await p.waitForTimeout(60);
  t.check('theme switch: tiles take the dark colours, facts unchanged', light === 'rgb(241, 239, 232)' && await bg() === 'rgb(15, 18, 22)' && await p.$eval('#talkingPoints', e => e.innerHTML) === before, light + ' → ' + await bg());
  t.check('moving the slider, picking and switching theme never fetch', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));

  // Season change: a season with no data clears the card; back again fills it.
  await p.selectOption('.f1c-year', '2025'); await p.waitForTimeout(400);
  t.check('a season with no results shows no facts', await p.$$eval('#talkingPoints .tp', x => x.length) === 0 && await h.text(p, '#tpSub') === '');
  await p.selectOption('.f1c-year', '2026'); await h.loaded(p);
  t.check('…and switching back shows them for the new season', (await shown(p)).length >= 4 && await h.text(p, '#tpSub') === 'whole field · after round 12');
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Ties and wording, on a small made-up season: A and B level after 2 rounds with a win each; C wins round 3.
  p = await h.openPage('drivers', { width: 1000 }); await h.loaded(p);
  const tie = await p.evaluate(() => {
    const row = (id, position, points) => ({ driverId: id, code: id.toUpperCase().repeat(3), name: id, teamId: 't' + id, teamName: 'T', position, points, session: 'race' });
    const rounds = [
      { round: 1, raceResults: [row('a', 1, 25), row('b', 2, 18), row('c', 3, 15), row('d', 4, 12)], sprintResults: null },
      { round: 2, raceResults: [row('b', 1, 25), row('a', 2, 18), row('c', 3, 15), row('d', 4, 12)], sprintResults: null },
      { round: 3, raceResults: [row('c', 1, 25), row('a', 2, 18), row('b', 3, 15), row('d', null, 0)], sprintResults: null }];
    const el = document.createElement('div'), read = n => { F1TalkingPoints.render(el, rounds, n);
      return Object.fromEntries([...el.querySelectorAll('.tp')].map(e => [e.dataset.fact, e.querySelector('.tpValue').textContent.replace(/\s+/g, ' ').trim() + ' | ' + (e.querySelector('.tpDetail')?.textContent || '')])); };
    return { r2: read(2), r3: read(3) };
  });
  t.check('tie: level on points reads "level with …, ahead on countback"', tie.r2.leader === 'AAA · 43 pts | level with BBB, ahead on countback', tie.r2.leader);
  t.check('tie: two drivers read "AAA and BBB · 1 win each"', tie.r2.wins === 'AAA and BBB · 1 win each | 2 different winners in 2 Grands Prix', tie.r2.wins);
  t.check('tie: three drivers read "AAA, BBB and CCC"', tie.r3.wins === 'AAA, BBB and CCC · 1 win each | 3 different winners in 3 Grands Prix', tie.r3.wins);
  t.check('tie: four drivers read "AAA, BBB, CCC +1 more"', tie.r2.streak === 'AAA, BBB, CCC +1 more · 2 rounds each | every round so far', tie.r2.streak);
  t.check('a missed score ends a streak; a single driver has no "each"', tie.r3.streak === 'AAA, BBB and CCC · 3 rounds each | every round so far' && tie.r3.nc === 'DDD · 1 Grand Prix | of 3 started', JSON.stringify(tie.r3));
  t.check('nobody not classified: no such fact', !('nc' in tie.r2));
  await p.done();

  // Both themes at desktop and phone width: fits without sideways scrolling.
  for(const [width, theme] of [[1000, 'light'], [1000, 'dark'], [390, 'light'], [390, 'dark']]){
    p = await h.openPage('drivers', { width, theme }); await h.loaded(p);
    const fit = await p.evaluate(() => { const c = document.getElementById('tpCard'), b = c.getBoundingClientRect();
      return { right: b.right, scroll: document.documentElement.scrollWidth, over: [...c.querySelectorAll('.tp')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > b.right).length,
        cols: new Set([...c.querySelectorAll('.tp')].map(e => Math.round(e.getBoundingClientRect().left))).size }; });
    t.check(`${width}px ${theme}: the card fits, nothing overflows`, fit.right <= width && fit.scroll <= width && fit.over === 0, JSON.stringify(fit));
    t.check(`${width}px ${theme}: ${width > 600 ? 'three' : 'two'} tiles across`, fit.cols === (width > 600 ? 3 : 2), JSON.stringify(fit));
    await h.screenshot(p, `talking-points-${width}-${theme}.png`);
    t.check(`${width}px ${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
