// #117: the simulator's race model. Places are drawn one at a time for every position, each driver weighted by their
// finishes at that place or better in the data window (last N Grand Prix starts, or the whole season), plus a bonus
// for finishes just behind it and a small floor (0.03), plus a quarter of their teammate's weight (team strength,
// #162). DNF chance = the window's DNF share blended with 64 races at the grid's rate. Only drivers in the latest
// round race; equal points go to countback. The "Form from" stepper picks the window (default: the whole season);
// it goes in the URL and never fetches.
module.exports = async (t, h) => {
  const p = await h.openPage('simulator'); await h.loaded(p);
  const hits = p.apiHits.length;
  const q = () => new URL(p.url()).searchParams;

  // ---- Weights and DNF chance vs an independent calculation from the raw results ----
  const indep = await p.evaluate(() => {
    // each driver's Grand Prix starts in round order: classified position, or null
    const starts = {}; let all = 0, dnf = 0;
    F1Controls.state.seasonRounds.filter(r => r.round <= L).forEach(r => r.raceResults.forEach(x => {
      const pos = Number.isFinite(x.position) && x.position >= 1 ? x.position : null;
      (starts[x.driverId] = starts[x.driverId] || []).push(pos); all++; if(pos == null) dnf++;
    }));
    const grid = dnf / all;
    const weight = (res, place) => res.reduce((w, f) => f == null ? w : w + (f <= place ? 1 : 0.5 * Math.pow(0.5, f - place - 1)), 0.03);
    // team strength: a quarter of the average weight of the other cars on the same team in the latest round
    const teamAt = {}; F1Controls.state.seasonRounds.filter(r => r.round === L).forEach(r => r.raceResults.forEach(x => { teamAt[x.driverId] = x.teamId; }));
    let withMates = 0;
    const check = win => {
      dataWindow = win;
      const ctx = buildSimContext(), n = ctx.n, bad = [];
      const resOf = id => win === Infinity ? starts[id] : starts[id].slice(-win);
      fullRoster.forEach((d, i) => {
        const res = resOf(d.driverId);
        const mates = teamAt[d.driverId] != null ? fullRoster.filter(m => m !== d && teamAt[m.driverId] === teamAt[d.driverId]) : [];
        if(mates.length) withMates++;
        for(let place = 1; place <= n; place++){
          const want = weight(res, place) + (mates.length ? 0.25 * mates.reduce((s, m) => s + weight(resOf(m.driverId), place), 0) / mates.length : 0);
          if(Math.abs(ctx.W[i * n + place - 1] - want) > 1e-9) bad.push(`${d.code} P${place} ${ctx.W[i * n + place - 1]} vs ${want}`);
        }
        const k = res.filter(f => f == null).length, rate = (k + 64 * grid) / (res.length + 64);
        if(Math.abs(ctx.dnfRate[i] - rate) > 1e-9) bad.push(`${d.code} DNF ${ctx.dnfRate[i]} vs ${rate}`);
      });
      return { n, slots: ctx.W.length, bad: bad.slice(0, 3), count: bad.length };
    };
    const out = { last8: check(8), last4: check(4), season: check(Infinity) };
    // the leader's results and weights at window 8, for a readable example
    dataWindow = 8;
    const ctx = buildSimContext(), lead = fullRoster.slice().sort(byStanding)[0], li = fullRoster.indexOf(lead);
    out.example = { code: lead.code, last8: starts[lead.driverId].slice(-8).join(','), w: [1, 2, 3].map(pl => +ctx.W[li * ctx.n + pl - 1].toFixed(3)) };
    out.grid = grid; out.someDnf = Object.values(starts).some(s => s.includes(null)); out.withMates = withMates;
    return out;
  });
  t.check('weights for every place (P1 to last): finishes there or better + near bonus + floor + a quarter of the teammate\'s, last 8 starts',
    indep.last8.count === 0 && indep.last8.slots === indep.last8.n * indep.last8.n, JSON.stringify(indep.last8));
  t.check('…the same with a window of 4', indep.last4.count === 0, JSON.stringify(indep.last4));
  t.check('…and with the whole season', indep.season.count === 0, JSON.stringify(indep.season));
  t.check('DNF chance = the window\'s DNFs blended with 64 races at the grid rate (checked above; the fake season has DNFs)', indep.someDnf && indep.grid > 0);
  t.check('…and team strength was exercised: drivers with teammates were checked', indep.withMates > 0, String(indep.withMates));
  t.check(`example: ${indep.example.code} (last 8: ${indep.example.last8}) weights P1/P2/P3 ${indep.example.w.join(' / ')}`,
    indep.example.w[0] < indep.example.w[1] && indep.example.w[1] < indep.example.w[2], JSON.stringify(indep.example));

  // ---- Every place is drawn; Grand Prix places feed countback ----
  const draw = await p.evaluate(() => {
    dataWindow = 8; rand = seededRandom(7);
    const ctx = buildSimContext(), n = ctx.n, bad = [];
    for(let k = 0; k < 300; k++){
      const s = simulateSeason(ctx, true), fin = ctx.fin0.slice();
      ctx.events.forEach((e, ei) => {
        const order = s.orders[ei], racing = fullRoster.filter((d, i) => !s.plan.out[i][ei]).length;
        if(order.length !== racing || new Set(order).size !== order.length) bad.push(`event ${ei}: ${order.length} placed of ${racing}`);
        if(e.type === 'gp') order.forEach((i, pos) => { fin[i * n + pos]++; });
      });
      if(fin.some((v, j) => v !== s.fin[j])) bad.push('countback tally differs from the drawn Grand Prix orders');
    }
    return bad.slice(0, 3);
  });
  t.check('every driver still running is placed in every event (not just the top 10)', draw.length === 0, draw.join('; '));

  // ---- Equal points: countback, then the current standings ----
  const cb = await p.evaluate(() => {
    const ctx = buildSimContext(), n = ctx.n, real = simulateSeason;
    const [a, b, c] = fullRoster.map((d, i) => i).sort((x, y) => ctx.rank[x] - ctx.rank[y]).slice(-3); // three backmarkers
    const totals = new Float64Array(n).fill(0); fullRoster.forEach((d, i) => { totals[i] = 500 - ctx.rank[i]; });
    totals[a] = totals[b] = totals[c] = 999; // level on points at the top
    const fin = new Int16Array(n * n);
    fin[a * n + 1] = 3; fin[b * n + 1] = 3; fin[b * n + 4] = 1; fin[c * n + 0] = 1; // c: a win; b beats a on P5s
    simulateSeason = () => ({ totals, fin, decided: L + 1 });
    const run = newRun(ctx, 1); simulateInto(ctx, run, 1);
    simulateSeason = real;
    return { order: [c, b, a].map(i => run.ranks[i]), champion: run.champion[0] === c };
  });
  t.check('level on points: most wins first, then most second places, …', cb.order.join() === '1,2,3' && cb.champion, JSON.stringify(cb));

  // ---- Only drivers in the latest round race ----
  const gone = await p.evaluate(() => {
    const d = fullRoster.slice().sort(byStanding)[3], i = fullRoster.indexOf(d);
    d.active = false; rand = seededRandom(3);
    const ctx = buildSimContext(); let placed = 0, moved = 0;
    for(let k = 0; k < 200; k++){ const s = simulateSeason(ctx, true); s.orders.forEach(o => { if(o.includes(i)) placed++; }); if(s.totals[i] !== d.now) moved++; }
    d.active = true;
    return { placed, moved };
  });
  t.check('a driver who wasn\'t in the latest round never races again and keeps their points', gone.placed === 0 && gone.moved === 0, JSON.stringify(gone));
  const goneSet = await p.evaluate(() => {
    const [a, b] = trackedRoster(), nGP = nGPLeft();
    outcomes = { [a.driverId]: { dnf: 1, win: nGP }, [b.driverId]: { dnf: null, win: null } };
    a.active = false; buildOutcomeInputs();
    const row = document.querySelector(`#outcomeGrid .tag[data-id="${a.driverId}"]`).closest('.oc-item').textContent.replace(/\s+/g, ' ');
    const freed = winMax(b.driverId) === nGP, dropped = !outcomes[a.driverId];
    a.active = true; outcomes = {}; buildOutcomeInputs();
    return { row, freed, dropped };
  });
  t.check('…a tracked driver who isn\'t racing shows "Not racing" and their settings are dropped (their wins free up for others)',
    /Not racing/.test(goneSet.row) && goneSet.freed && goneSet.dropped, JSON.stringify(goneSet));

  // ---- Leaders score about what they have been (the old model gave them far too little, #117) ----
  const pace = await p.evaluate(() => {
    dataWindow = 8; rand = seededRandom(11);
    const ctx = buildSimContext(), T = 3000, top = fullRoster.slice().sort(byStanding).slice(0, 3);
    const PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    return top.map(d => {
      const i = fullRoster.indexOf(d), res = d.results.slice(-8);
      const recent = res.reduce((s, f) => s + (f && f <= 10 ? PTS[f - 1] : 0), 0) / res.length; // points per GP lately
      let sim = 0;
      for(let k = 0; k < T; k++){ const s = simulateSeason(ctx, true); ctx.gpIdx.forEach(ei => { const pos = s.orders[ei].indexOf(i); if(pos >= 0 && pos < 10) sim += PTS[pos]; }); }
      return { code: d.code, recent: +recent.toFixed(1), sim: +(sim / T / ctx.gpIdx.length).toFixed(1) };
    });
  });
  t.check('the top 3 score within 20% of their recent points per Grand Prix', pace.every(x => Math.abs(x.sim - x.recent) <= 0.2 * x.recent), JSON.stringify(pace));

  // ---- The "Form from" stepper ----
  await p.evaluate(() => { dataWindow = WINDOW_DEFAULT; syncWindow(); });
  const val = () => p.$eval('#winVal', e => e.textContent);
  const L = await p.evaluate(() => L);
  t.check('Form from starts at the whole season (#162), not in the URL', await val() === 'whole season' && await p.$eval('#winMore', b => b.disabled) && !q().has('w'), (await val()) + ' ' + p.url());
  await p.click('#run'); await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent));
  await p.click('#winLess'); await p.waitForTimeout(60);
  t.check(`− from the whole season is the last ${L - 1} races, goes into the URL and marks the results out of date`,
    await val() === `last ${L - 1} races` && q().get('w') === String(L - 1) && await p.$eval('#staleNote', e => !e.hidden), p.url());
  for(let k = 0; k < L - 1 - 3; k++) await p.click('#winLess');
  t.check('it stops at the last 3 races', await val() === 'last 3 races' && await p.$eval('#winLess', b => b.disabled));
  for(let k = 0; k < L - 3; k++) await p.click('#winMore');
  await p.waitForTimeout(60);
  t.check('+ ends at the whole season, which is the default so it leaves the URL',
    await val() === 'whole season' && await p.$eval('#winMore', b => b.disabled) && !q().has('w'), (await val()) + ' ' + p.url());
  await p.click('#winLess'); await p.waitForTimeout(60);
  t.check(`− from the whole season is the last ${L - 1} races`, await val() === `last ${L - 1} races`);
  const link = p.url().split('/').pop();
  t.check('Form from never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  const p2 = await h.openPage('simulator'); await p2.goto('http://site.test/' + link); await h.loaded(p2);
  t.check('a link restores Form from', await p2.$eval('#winVal', e => e.textContent) === `last ${L - 1} races`, link);
  // at an early round, a window as long as the season so far is the whole season; moving back up restores it
  await h.setRound(p2, 4); await p2.waitForTimeout(80);
  t.check('at round 4 a window longer than the season so far is the whole season', await p2.$eval('#winVal', e => e.textContent) === 'whole season' && await p2.$eval('#winMore', b => b.disabled));
  await h.setRound(p2, L); await p2.waitForTimeout(80);
  t.check(`…and back at round ${L} the window is the last ${L - 1} races again`, await p2.$eval('#winVal', e => e.textContent) === `last ${L - 1} races`);
  t.check('link and slider: no page errors', p2.errors.length === 0, p2.errors.join('; '));
  await p2.done();
};
