// #86: "When the title is decided" on the simulator. Each simulated season records the first round after which its
// champion's lead over every rival is more than the points still available (25 per Grand Prix, 8 per sprint left);
// a lead equal to them isn't enough (a tie goes to countback); not settled earlier = the final round. The card shows
// the share of seasons decided at and by each round. It must not change any existing result for a given seed.
const fs = require('fs');
module.exports = async (t, h) => {
  const grab = async (p, sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) };
  };
  const csvRows = buf => buf.toString('utf8').replace(/^﻿/, '').trim().split(/\r\n/).map(r => r.split(','));
  const simulated = p => p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent), null, { timeout: 60000 });

  // Independent calculation: rounds = [{round, sprint}], perRound[j][i] = driver i's points in round j (GP + sprint).
  function expectDecided(start, rounds, perRound){
    const left = j => rounds.slice(j + 1).reduce((s, r) => s + 25 + (r.sprint ? 8 : 0), 0); // after rounds[j]
    const settled = (tot, room) => { const s = [...tot].sort((a, b) => b - a); return s[0] - (s.length > 1 ? s[1] : -Infinity) > room; };
    const tot = [...start];
    if(settled(tot, left(-1))) return rounds[0].round - 1;
    for(let j = 0; j < rounds.length; j++){
      perRound[j].forEach((v, i) => { tot[i] += v; });
      if(settled(tot, left(j))) return rounds[j].round;
    }
    return rounds[rounds.length - 1].round;
  }

  let p = await h.openPage('simulator'); await h.loaded(p);
  const hits0 = p.apiHits.length;
  t.check('the card is hidden until a run', await p.$eval('#decidedCard', e => e.style.display) === 'none');

  // ---- The decided-round logic on constructed seasons (rounds 13–17 left, start = after round 12) ----
  const cases = [
    { name: 'clinched early', rounds: [13, 14, 15, 16, 17].map(r => ({ round: r })), start: [200, 100, 90],
      pts: [[25, 0, 18], [0, 25, 18], [0, 25, 18], [0, 25, 18], [0, 25, 18]], want: 13 },
    { name: 'only at the final round', rounds: [13, 14, 15, 16, 17].map(r => ({ round: r })), start: [100, 95, 60],
      pts: [[25, 18, 0], [18, 25, 0], [25, 18, 0], [18, 25, 0], [25, 18, 0]], want: 17 },
    { name: 'a lead equal to the points left is a countback tie, not decided', rounds: [13, 14, 15, 16, 17].map(r => ({ round: r })), start: [100, 100, 0],
      pts: [[25, 0, 0], [25, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], want: 16 }, // after 15: lead 50 = 50 left; after 16: 50 > 25
    { name: 'level at the end (countback) counts as the final round', rounds: [13, 14].map(r => ({ round: r })), start: [100, 75],
      pts: [[0, 25], [0, 0]], want: 14 },
    { name: 'sprints count in the points still available', rounds: [{ round: 13 }, { round: 14, sprint: true }, { round: 15 }, { round: 16 }, { round: 17 }],
      start: [230, 100], pts: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], want: 13 }, // lead 130: 5 GPs (125) alone would say "already decided"
    { name: 'a sprint weekend is checked after both its races', rounds: [{ round: 13, sprint: true }, { round: 14 }],
      start: [50, 0], pts: [[8, 0], [0, 0]], want: 13 }, // 58 left before; after round 13 (GP 0 + sprint 8): lead 58 > 25
    { name: 'already out of reach before the remaining rounds', rounds: [13, 14].map(r => ({ round: r })), start: [200, 100],
      pts: [[0, 25], [0, 25]], want: 12 },
  ];
  for(const c of cases){
    const expected = expectDecided(c.start, c.rounds, c.pts);
    const got = await p.evaluate(({ c }) => {
      // events as the simulator builds them: each Grand Prix, then the round's sprint as its own event
      const events = [], eventPts = [];
      c.rounds.forEach((r, j) => {
        events.push({ round: r.round, type: 'gp' });
        if(r.sprint){ events.push({ round: r.round, type: 'sprint' }); const sp = c.pts[j].map(v => Math.min(v, 8)); eventPts.push(c.pts[j].map((v, i) => v - sp[i]), sp); }
        else eventPts.push(c.pts[j]);
      });
      return decidedRoundFor(decidedContext(events, c.rounds[0].round - 1), c.start, eventPts);
    }, { c });
    t.check(`decided round: ${c.name}`, got === c.want && expected === c.want, `page ${got}, independent ${expected}, want ${c.want}`);
  }

  // ---- Existing results unchanged: a seeded run gives exactly what main gave before #86 ----
  // Fingerprint of runSimulation(2000) with seed 12345 on the fake season, taken from main before this change. If the
  // fixture or the race model is changed on purpose, recompute it (same code, on the commit before the change).
  const fp = await p.evaluate(() => {
    rand = seededRandom(12345);
    const run = runSimulation(2000);
    let hsh = 0; for(let i = 0; i < run.totals.length; i++) hsh = (Math.imul(hsh, 31) + run.totals[i] * 7 + run.ranks[i]) | 0;
    return hsh;
  });
  t.check('same seed, same final points and ranks as before #86 (no extra random draws)', fp === -866565658, String(fp));

  // ---- The engine's decided round against an independent replay of each simulated season's races ----
  const eng = await p.evaluate(() => {
    rand = seededRandom(7);
    const ctx = buildSimContext(), GP = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], SP = [8, 7, 6, 5, 4, 3, 2, 1];
    let bad = 0, early = 0, last = 0, totalsOk = true, first = null;
    for(let k = 0; k < 400; k++){
      const sim = simulateSeason(ctx, true), tot = ctx.nowPts.slice();
      let want = 0;
      const room = e => ctx.events.slice(e + 1).reduce((s, ev) => s + (ev.type === 'gp' ? 25 : 8), 0);
      const gap = () => { const s = [...tot].sort((a, b) => b - a); return s[0] - s[1]; };
      if(gap() > room(-1)) want = L;
      ctx.events.forEach((ev, e) => {
        sim.orders[e].forEach((i, pos) => { tot[i] += (ev.type === 'gp' ? GP : SP)[pos] || 0; });
        const endOfRound = e === ctx.events.length - 1 || ctx.events[e + 1].round !== ev.round;
        if(!want && endOfRound && gap() > room(e)) want = ev.round;
      });
      if(!want) want = ctx.events[ctx.events.length - 1].round;
      if(tot.some((v, i) => v !== sim.totals[i])) totalsOk = false;
      if(sim.decided !== want){ bad++; if(!first) first = { got: sim.decided, want }; }
      if(want < ctx.events[ctx.events.length - 1].round) early++; else last++;
    }
    return { bad, early, last, totalsOk, first };
  });
  t.check('the engine records the round an independent replay of each season gives', eng.bad === 0 && eng.totalsOk, JSON.stringify(eng));
  t.check('…with seasons decided both early and at the final round (so the check means something)', eng.early > 20 && eng.last > 20, JSON.stringify(eng));

  // ---- After a run: the chart's numbers ----
  await p.selectOption('#n', '2000'); await p.click('#run'); await simulated(p); await p.waitForTimeout(80);
  const r = await p.evaluate(() => {
    const ds = decidedChart.data.datasets, bars = ds.filter(d => d.type === 'bar'), by = ds.find(d => d.type === 'line').data;
    const at = decidedChart.data.labels.map((_, j) => bars.reduce((s, d) => s + d.data[j], 0)); // the stacked bar's height
    return { labels: decidedChart.data.labels, by, at, N: lastRun.N, n: lastRun.n, L, total: currentCalendar.totalRounds, rows: decidedRows,
             decided: [...lastRun.decided], champion: [...lastRun.champion], ids: lastRun.ids, ranks: [...lastRun.ranks],
             bars: bars.map(d => ({ id: d._id, label: d.label, data: d.data, bg: d.backgroundColor, edge: d.borderColor, bw: d.borderWidth, stack: d.stack })),
             teams: Object.fromEntries(fullRoster.map(d => [d.driverId, d.teamId])), codes: Object.fromEntries(fullRoster.map(d => [d.driverId, d.code])),
             teamColor: Object.fromEntries(fullRoster.map(d => [d.driverId, F1Theme.team(F1Common.teamColor(d.teamId))])),
             key: [...document.querySelectorAll('#decidedKey .ridgeKeyItem[data-id]')].map(e => ({ id: e.dataset.id, text: e.textContent.trim(), flag: !!e.querySelector('.flag') })),
             shown: document.getElementById('decidedCard').style.display, summary: document.getElementById('decidedSummary').textContent,
             afterOdds: document.getElementById('oddsCard').nextElementSibling.id };
  });
  t.check('after a run the card shows, right after the win probability', r.shown === 'block' && r.afterOdds === 'decidedCard', JSON.stringify([r.shown, r.afterOdds]));
  const rounds = Array.from({ length: r.total - r.L + 1 }, (_, i) => r.L + i);
  t.check('one column per round from the current round (already run) to the last', r.labels.join() === rounds.join() && r.rows[0].run && r.rows.slice(1).every(x => !x.run), r.labels.join());
  let cum = 0, cumOk = true, mono = true;
  r.at.forEach((v, j) => { cum += v; if(Math.abs(cum - r.by[j]) > 1e-6) cumOk = false; if(j && r.by[j] < r.by[j - 1]) mono = false; });
  t.check('the line is the running total of the (stacked) bars', cumOk, JSON.stringify({ at: r.at, by: r.by }));
  t.check('…rising and ending at 100% at the final round', mono && r.by[r.by.length - 1] === 100, r.by.join());

  // Independent count from the per-season results the page keeps: lastRun.decided (round) and lastRun.champion (index in ids).
  const N = r.N, perRound = {}, wins = {}, at = {};
  r.decided.forEach((x, s) => { const id = r.ids[r.champion[s]]; perRound[x] = (perRound[x] || 0) + 1; wins[id] = (wins[id] || 0) + 1; at[x + '|' + id] = (at[x + '|' + id] || 0) + 1; });
  t.check('each season\'s champion is the driver ranked 1st in it (as for the win probability)', r.champion.every((c, s) => r.ranks[s * r.n + c] === 1));
  t.check('the bars match the per-season results the page keeps (lastRun.decided)', rounds.every((x, j) => Math.abs(r.at[j] - 100 * (perRound[x] || 0) / N) < 1e-9)
    && Object.keys(perRound).every(x => rounds.includes(+x)), JSON.stringify(perRound));
  const big = Object.keys(wins).filter(id => 100 * wins[id] / N >= 1).sort((a, b) => wins[b] - wins[a]), small = Object.keys(wins).filter(id => !big.includes(id));
  const drv = r.bars.filter(b => b.id !== 'others'), oth = r.bars.find(b => b.id === 'others');
  t.check('one stacked segment per champion with at least 1% of seasons, by title chance', drv.map(b => b.id).join() === big.join() && drv.every(b => b.label === r.codes[b.id])
    && r.bars.every(b => b.stack === 'decided'), JSON.stringify({ bars: drv.map(b => b.id), big, wins }));
  t.check('each driver\'s segment = their share of all seasons decided at that round with them as champion',
    drv.every(b => rounds.every((x, j) => Math.abs(b.data[j] - 100 * (at[x + '|' + b.id] || 0) / N) < 1e-9)), JSON.stringify(at));
  t.check('champions under 1% fold into one Others segment (on top)', small.length ? !!oth && r.bars[r.bars.length - 1].id === 'others'
    && rounds.every((x, j) => Math.abs(oth.data[j] - 100 * small.reduce((s, id) => s + (at[x + '|' + id] || 0), 0) / N) < 1e-9) : !oth, JSON.stringify({ small, oth }));
  t.check('each round\'s segments add up to the bar total (decided at that round)', r.rows.every((row, j) => Math.abs(row.seg.reduce((s, v) => s + v, 0) - row.at) < 1e-9
    && Math.abs(row.at - r.at[j]) < 1e-9), JSON.stringify(r.rows.map(x => [x.at, x.seg])));
  t.check('…and over all rounds each champion\'s segments add up to their title chance', drv.every(b => Math.abs(b.data.reduce((s, v) => s + v, 0) - 100 * wins[b.id] / N) < 1e-9));
  // Colours: the team colour (theme-aware); a teammate a lighter shade with a team-colour edge.
  const seen = {}; let pairs = 0, colOk = true;
  drv.forEach(b => { const tm = r.teams[b.id];
    if(seen[tm]){ pairs++; if(b.bg === seen[tm].bg || b.edge !== seen[tm].bg || !(b.bw > 0)) colOk = false; }
    else { seen[tm] = b; if(b.bg !== r.teamColor[b.id] || b.bw) colOk = false; } });
  t.check('segments in the team colour, a teammate in a different (lighter, edged) shade of it', colOk && pairs >= 1, JSON.stringify(drv.map(b => [b.label, r.teams[b.id], b.bg, b.edge, b.bw])));
  t.check('legend: a flag and code per champion in the same order, then Others', r.key.map(k => k.id).join() === r.bars.map(b => b.id).join()
    && r.key.filter(k => k.id !== 'others').every(k => k.flag && k.text === r.codes[k.id]), JSON.stringify(r.key));
  const mode = r.rows.slice(1).reduce((m, x) => x.at > m.at ? x : m, r.rows[1]);
  t.check('the summary names the most likely round', r.summary.includes(`Round ${mode.round}, ${Math.round(mode.at)}%`) && (mode.round === r.total || r.summary.includes(`${Math.round(r.at[r.at.length - 1])}% go to the final round`)), r.summary);
  const early = {}; r.decided.forEach((x, s) => { if(x < r.total){ const id = r.ids[r.champion[s]]; early[id] = (early[id] || 0) + 1; } });
  const topEarly = Object.keys(early).filter(id => big.includes(id)).sort((a, b) => early[b] - early[a])[0];
  t.check('the summary names who most often clinches before the final round', !!topEarly && r.summary.includes(`Most often clinched early by ${r.codes[topEarly]} (${Math.round(100 * early[topEarly] / N)}% of seasons)`), r.summary);

  // Tooltip: round, the total decided there, each champion's share, and the cumulative share.
  const nz = j => r.bars.filter(b => b.data[j] > 0).length;
  const tj = rounds.reduce((m, _, j) => nz(j) > nz(m) ? j : m, 0), tipRound = rounds[tj]; // the round with the most champions
  await p.$eval('#decidedCanvas', c => c.scrollIntoView({ block: 'center' }));
  const box = await p.evaluate(j => { const c = decidedChart, rc = c.canvas.getBoundingClientRect(); return { x: rc.left + c.scales.x.getPixelForValue(j), y: rc.top + c.chartArea.bottom - 6 }; }, tj);
  await p.mouse.move(box.x, box.y); await p.waitForTimeout(80);
  const tip = await p.evaluate(() => { const tt = decidedChart.tooltip; return { title: tt.title, before: tt.beforeBody, body: tt.body.map(b => b.lines.join('')) }; });
  const pc = v => (v > 0 && v < 0.1 ? '<0.1' : v.toFixed(1)) + '%';
  const wantBody = [...r.bars.filter(b => b.data[tj] > 0).map(b => ` ${b.label} ${pc(b.data[tj])}`), `Decided by this round: ${pc(r.by[tj])}`];
  t.check('tooltip: round, decided at it, each champion\'s share, then decided by it', tip.title[0].startsWith(`Round ${tipRound}`) && tip.before.join() === `Decided at this round: ${pc(r.at[tj])}`
    && tip.body.join('|') === wantBody.join('|') && wantBody.length >= 3, JSON.stringify({ tip, wantBody }));
  // a round with nothing decided at it (the round already run) lists no champions
  const box0 = await p.evaluate(() => { const c = decidedChart, rc = c.canvas.getBoundingClientRect(); return { x: rc.left + c.scales.x.getPixelForValue(0), y: rc.top + c.chartArea.bottom - 6 }; });
  await p.mouse.move(box0.x, box0.y); await p.waitForTimeout(80);
  const tip0 = await p.evaluate(() => decidedChart.tooltip.body.map(b => b.lines.join('')));
  t.check('tooltip: champions with no share at that round are left out', r.at[0] === 0 && tip0.join('|') === `Decided by this round: ${pc(r.by[0])}`, JSON.stringify(tip0));
  await p.mouse.move(1, 1);

  // Others folding and teammates on constructed results: 1,000 seasons, rounds 19 (already run) to 21.
  const fold = await p.evaluate(() => {
    const info = [['AAA', 'mercedes', 1], ['BBB', 'mercedes', 2], ['CCC', 'ferrari', 3], ['DDD', 'mclaren', 4], ['EEE', 'ferrari', 5]].map(([code, teamId, rank]) => ({ code, teamId, rank }));
    const plan = [[0, 20, 400], [0, 21, 300], [1, 21, 200], [2, 19, 85], [3, 21, 10], [4, 20, 5]]; // [driver, round, seasons]
    const N = 1000, decided = new Uint16Array(N), champion = new Uint8Array(N); let s = 0;
    plan.forEach(([i, rd, k]) => { for(let q = 0; q < k; q++, s++){ decided[s] = rd; champion[s] = i; } });
    const st = decidedStats({ N, n: 5, ids: ['a', 'b', 'c', 'd', 'e'], decided, champion, startRound: 19, lastRound: 21, info });
    return { codes: st.champs.map(c => c.code), mates: st.champs.map(c => c.mate), others: st.others, segs: st.rows.map(x => x.seg), ats: st.rows.map(x => x.at),
             fills: st.champs.map(champFill), mercedes: F1Theme.team(F1Common.teamColor('mercedes')) };
  });
  t.check('constructed: under 1% folds into Others, exactly 1% is shown', fold.codes.join() === 'AAA,BBB,CCC,DDD' && Math.abs(fold.others - 0.5) < 1e-9, JSON.stringify(fold));
  t.check('constructed: per-round segments (AAA, BBB, CCC, DDD, Others) adding up to each bar', JSON.stringify(fold.segs) === JSON.stringify([[0, 0, 8.5, 0, 0], [40, 0, 0, 0, 0.5], [30, 20, 0, 1, 0]])
    && JSON.stringify(fold.ats) === JSON.stringify([8.5, 40.5, 51]), JSON.stringify(fold.segs));
  t.check('constructed: the second Mercedes driver is a lighter shade with a Mercedes edge', fold.mates.join() === '0,1,0,0' && fold.fills[0].bg === fold.mercedes
    && fold.fills[1].bg !== fold.mercedes && fold.fills[1].edge === fold.mercedes && !fold.fills[2].edge, JSON.stringify(fold.fills));

  // Short race names in the summary (the fake calendar names rounds "Round N Grand Prix", so give it real ones).
  const named = await p.evaluate(() => {
    const keep = { ...currentCalendar.raceNames };
    for(let x = L; x <= currentCalendar.totalRounds; x++) currentCalendar.raceNames[x] = 'Formula 1 Qatar Airways Qatar Grand Prix 2026';
    renderDecided(lastRun);
    const out = { summary: document.getElementById('decidedSummary').textContent, race: decidedRows[1].race };
    currentCalendar.raceNames = keep; renderDecided(lastRun);
    return out;
  });
  t.check('rounds are named "Round N (short name)"', named.race === 'Qatar' && /Round \d+ \(Qatar\)/.test(named.summary), JSON.stringify(named));

  // A title already out of reach: everything is decided at the current round.
  const already = await p.evaluate(() => {
    const keep = fullRoster.map(d => d.now);
    fullRoster[0].now += 1000;
    const ctx = buildSimContext(); rand = seededRandom(3);
    const run = newRun(ctx, 50); simulateInto(ctx, run, 50);
    fullRoster.forEach((d, i) => { d.now = keep[i]; });
    const st = decidedStats(run), rows = st.rows;
    return { all: [...run.decided].every(x => x === L), first: rows[0].by, summary: decidedSummaryHTML(rows, st.champs), code: fullRoster[0].code,
             champs: st.champs.map(c => c.code), seg: rows[0].seg };
  });
  t.check('a title already out of reach counts as decided at the current round', already.all && already.first === 100 && /Already decided/.test(already.summary)
    && already.summary.includes(already.code) && already.champs.join() === already.code && already.seg[0] === 100, JSON.stringify(already));

  // ---- Export ----
  let f = await grab(p, '#decidedCard .exp-csv'); let rows = csvRows(f.data);
  t.check('CSV: a row per round with the shares decided at and by it', f.name === 'f1-2026-sim-title-decided-r12.csv'
    && rows[0].slice(0, 5).join() === 'Round,Race,Already run,Decided at this round (% of seasons),Decided by this round (% of seasons)'
    && rows.length === 1 + rounds.length && rows.slice(1).every((x, j) => +x[0] === rounds[j] && Math.abs(+x[3] - r.at[j]) < 1e-6 && Math.abs(+x[4] - r.by[j]) < 1e-6)
    && rows[1][2] === 'yes' && rows[2][2] === 'no', f.name + ' ' + rows.slice(0, 3).join('|'));
  // …then a column per champion shown (by title chance) and one for the others, each the share of all seasons, adding up to "decided at".
  const wantHead = [...drv.map(b => `Decided at this round: ${b.label} champion (% of seasons)`), 'Decided at this round: other champion (% of seasons)'];
  const othData = oth ? oth.data : rounds.map(() => 0);
  t.check('CSV: per-champion columns plus others, matching the segments and adding up to the bar', rows[0].slice(5).join('|') === wantHead.join('|')
    && rows.slice(1).every((x, j) => x.length === 5 + wantHead.length && drv.every((b, k) => Math.abs(+x[5 + k] - b.data[j]) < 1e-6) && Math.abs(+x[x.length - 1] - othData[j]) < 1e-6
      && Math.abs(x.slice(5).reduce((s, v) => s + +v, 0) - +x[3]) < 1e-6), rows[0].join('|'));
  f = await grab(p, '#decidedCard .exp-png');
  t.check('PNG of the chart', f.data.readUInt32BE(0) === 0x89504e47 && f.name === 'f1-2026-sim-title-decided-r12.png' && f.data.readUInt32BE(20) > await p.$eval('#decidedCanvas', c => c.clientHeight), f.name);

  // ---- Seeded link: the same chart again ----
  const link = p.url(), shown = JSON.stringify(r.rows);
  t.check('the URL has the run\'s seed and nothing new', /[?&]seed=\d+/.test(link) && [...new URL(link).searchParams.keys()].every(k => ['season', 'round', 'n', 'seed', 'd', 'sort', 'o', 'c'].includes(k)), link);
  // Changing the tracked set redraws the same run; the card doesn't depend on it.
  await p.click('#presetRow button[data-preset="5"]'); await p.waitForTimeout(50);
  t.check('changing the tracked drivers keeps the same chart (the whole grid is simulated)', await p.evaluate(() => JSON.stringify(decidedRows)) === shown);
  t.check('running, exporting and changing the tracked set never fetch', p.apiHits.length === hits0, p.apiHits.slice(hits0).join(' '));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  p = await h.openPage('simulator'); await p.goto(link); await h.loaded(p); await simulated(p); await p.waitForTimeout(80);
  t.check('opening the seeded link re-runs to the same chart', await p.evaluate(() => JSON.stringify(decidedRows)) === shown);
  await p.done();

  // ---- Both themes, a live theme switch, and the phone fit ----
  const GREY = { light: '#aaa9a1', dark: '#6b7280' };
  for(const theme of ['light', 'dark']){
    p = await h.openPage('simulator', { theme, width: 390 }); await h.loaded(p);
    await p.evaluate(GREY => { window.barColoursOk = () => { const seen = {};
      return decidedChart.data.datasets.filter(d => d.type === 'bar').every(d => {
        if(d._id === 'others') return d.backgroundColor === GREY[F1Theme.current()];
        const tm = fullRoster.find(x => x.driverId === d._id).teamId, c = F1Theme.team(F1Common.teamColor(tm)), first = !seen[tm]; seen[tm] = 1;
        return first ? d.backgroundColor === c : d.borderColor === c && d.backgroundColor !== c; }); }; }, GREY);
    await p.selectOption('#n', '2000'); await p.click('#run'); await simulated(p); await p.waitForTimeout(100);
    const fit = await p.evaluate(() => {
      const card = document.getElementById('decidedCard').getBoundingClientRect(), cv = document.getElementById('decidedCanvas').getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth, cardR: card.right, cvR: cv.right, cvW: cv.width, h: cv.height,
               line: decidedChart.data.datasets[0].borderColor, knock: F1Theme.chart().knock, summaryR: document.getElementById('decidedSummary').getBoundingClientRect().right,
               keyR: Math.max(...[...document.querySelectorAll('#decidedKey .ridgeKeyItem')].map(e => e.getBoundingClientRect().right)), barsOk: barColoursOk() };
    });
    t.check(`phone ${theme}: the card fits a 390px screen`, fit.scroll <= 390 && fit.cardR <= 390 && fit.cvR <= fit.cardR && fit.summaryR <= fit.cardR && fit.keyR <= fit.cardR && fit.cvW > 250 && fit.h >= 180, JSON.stringify(fit));
    t.check(`phone ${theme}: drawn in the theme's chart colours (line, team colours, Others grey)`, fit.line === fit.knock && fit.barsOk, JSON.stringify(fit));
    await h.screenshot(p, `simulator-decided-${theme}-390.png`);
    if(theme === 'dark'){
      const hits = p.apiHits.length;
      await p.click('#themeToggle .theme-trigger'); await p.click('#themeToggle .theme-menu button[data-pref="light"]'); await p.waitForTimeout(100);
      const after = await p.evaluate(() => [decidedChart.data.datasets[0].borderColor, F1Theme.chart().knock, barColoursOk()]);
      t.check('a theme switch redraws it in the new colours, without fetching', after[0] === after[1] && after[0] !== fit.line && after[2] && p.apiHits.length === hits, JSON.stringify(after));
    }
    t.check(`phone ${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
