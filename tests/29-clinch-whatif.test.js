// #85 (version B): title clinch calculator on the What-If page, plus a pointer on the championship pages.
// The fake season is far from decided, so the maths is checked on constructed seasons through the shared helper
// (F1Common.clinchOutlook / titleStatus) against an independent calculation here: decided, can clinch against one
// and two rivals, a sprint weekend, can't yet (earliest round), the final round and countback ties. Then the
// What-If lines and champion marker as the order changes (keyboard moves, buttons), the pointer lines on both
// championship pages (slider, link), never fetching, both themes and the phone fit.
module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const base = await buildSnapshot(2026, fakeFetch, Date.now() - 3*60*60*1000);
  const SPRINTS = base.calendar.sprintRounds; // [2,6,11,14,19,23]
  const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];
  const tmpl = base.rounds[0].raceResults.slice().sort((a, b) => a.driverId < b.driverId ? -1 : 1);
  const FRONT = ['d0_0', 'd1_0', 'd2_0', 'd0_1', 'd2_1', 'd1_1'];
  const ALL = [...FRONT, ...tmpl.map(r => r.driverId).filter(id => !FRONT.includes(id))];
  const [A, B, C] = ALL;
  // A round from the top finishers' ids (everyone else follows in a fixed order: d0_1, d2_1, d1_1, …).
  const session = (top, table, kind) => { const ids = [...top, ...ALL.filter(id => !top.includes(id))];
    return ids.map((id, i) => ({ ...tmpl.find(r => r.driverId === id), position: i+1, points: table[i] || 0, session: kind })); };
  const round = (n, top, spTop) => ({ round: n, raceName: `Round ${n} Grand Prix`, country: base.rounds[0].country,
    raceResults: session(top, GP, 'race'), sprintResults: SPRINTS.includes(n) ? session(spTop || [A, B, C], SP, 'sprint') : null });
  // S: 19 rounds, A leads B by 70 and C by 82 (patterns of A/B/C's finishes: 11× A-C-B, 5× B-A-C, …).
  const pat = { p2:[B,A,C], p3:[C,A,B], p4:[A,C,B], p5:[B,C,A], p6:[C,B,A] };
  const seqS = [...Array(11).fill('p4'), ...Array(5).fill('p2'), 'p3', 'p5', 'p6'];
  const S = seqS.map((p, i) => round(i+1, pat[p]));
  // S2: one rival — A and B swap wins (14 A wins, 5 B wins), B wins one sprint: B is 66 behind, nobody else close.
  const S2 = Array.from({length:19}, (_, i) => round(i+1, i < 14 ? [A, B] : [B, A], i+1 === 19 ? [B, A] : [A, B]));
  // S5: 18 rounds, A 15 wins and B 3 (B second otherwise): A can clinch on the sprint weekend of round 19.
  const S5 = Array.from({length:18}, (_, i) => round(i+1, i < 15 ? [A, B] : [B, A], [A, B]));
  // S3: A wins everything, B second: decided before round 19.
  const S3 = Array.from({length:19}, (_, i) => round(i+1, [A, B]));
  // S4 (20-round calendar): A 10 ahead of B going into the final round.
  const S4 = Array.from({length:19}, (_, i) => round(i+1, i < 10 ? [A, B] : [B, A], [2,6,11,14].includes(i+1) ? [A, B] : [B, A]));
  const cal = base.calendar, cal20 = { ...cal, totalRounds: 20, sprintRounds: SPRINTS.filter(r => r <= 20) };
  const snap = rounds => ({ ...base, rounds, complete: false });

  // ---- Independent calculation (no site helpers) ----
  const idOf = (r, kind) => kind === 'teams' ? r.teamId : r.driverId;
  const totals = (rounds, upto, kind) => { const t = {}; rounds.filter(r => r.round <= upto).forEach(r => [...r.raceResults, ...(r.sprintResults||[])].forEach(q => { t[idOf(q, kind)] = (t[idOf(q, kind)]||0) + q.points; })); return t; };
  const ranked = (rounds, upto, kind) => { const t = totals(rounds, upto, kind), fin = {};
    rounds.filter(r => r.round <= upto).forEach(r => r.raceResults.forEach(q => { if(q.position){ const f = fin[idOf(q, kind)] = fin[idOf(q, kind)] || new Array(40).fill(0); f[q.position-1]++; } }));
    const cb = (a, b) => { for(let i = 0; i < 40; i++){ const d = ((fin[b]||[])[i]||0) - ((fin[a]||[])[i]||0); if(d) return d; } return 0; };
    return { t, order: Object.keys(t).sort((a, b) => t[b] - t[a] || cb(a, b)) }; };
  const maxAt = (r, kind, c) => (kind === 'teams' ? 43 : 25) + (c.sprintRounds.includes(r) ? (kind === 'teams' ? 15 : 8) : 0);
  const leftAfter = (r0, kind, c) => { let s = 0; for(let r = r0+1; r <= c.totalRounds; r++) s += maxAt(r, kind, c); return s; };
  const decidedAfter = (rounds, r, kind, c) => { const { t, order } = ranked(rounds, r, kind); return order.slice(1).every(id => t[id] + leftAfter(r, kind, c) < t[order[0]]); };
  const firstDecided = (rounds, L, kind, c) => { for(let r = 1; r <= L; r++) if(decidedAfter(rounds, r, kind, c)) return r; return null; };
  const earliest = (rounds, L, kind, c) => { const { t, order } = ranked(rounds, L, kind); let S = 0;
    for(let R = L+1; R <= c.totalRounds; R++){ S += maxAt(R, kind, c); if(order.slice(1).every(id => t[id] + leftAfter(R, kind, c) < t[order[0]] + S)) return R; } return null; };
  // Enumerates finishes at round L+1 for the leader and the given rivals (11 = outside the points; nobody else is in
  // reach in these seasons) and checks that a result clinches (every rival's points + all points left after it stay
  // below the leader's) exactly when the leader outscores each rival by at least the helper's margin.
  // Sprint weekends: GP and sprint positions both enumerated.
  const enumerate = (rounds, L, kind, c, rivals, margins) => {
    const { t, order } = ranked(rounds, L, kind), lead = order[0], T = L+1, P = leftAfter(T, kind, c), sprint = c.sprintRounds.includes(T);
    const pos = Array.from({length:11}, (_, i) => i+1), ptsOf = (g, s) => (GP[g-1]||0) + (sprint ? (SP[s-1]||0) : 0);
    const combos = []; const ids = [lead, ...rivals];
    const rec = (k, acc) => { if(k === ids.length){ combos.push(acc); return; }
      for(const g of pos) for(const s of (sprint ? pos : [11])){
        if(acc.some(([g2, s2]) => (g < 11 && g === g2) || (sprint && s < 11 && s === s2))) continue;
        rec(k+1, [...acc, [g, s]]); } };
    rec(0, []);
    const rows = combos.map(cmb => { const sc = cmb.map(([g, s]) => ptsOf(g, s)); const m = rivals.map((id, i) => sc[0] - sc[i+1]);
      const clinch = rivals.every((id, i) => t[id] + sc[i+1] + P < t[lead] + sc[0]); return { m, clinch }; });
    const anyClinch = rows.some(r => r.clinch);
    const exact = !!margins && rows.every(r => r.clinch === rivals.every((id, i) => r.m[i] >= margins[i]));
    // margins from the definition: one point more than (points left after the round − current gap)
    const formula = rivals.map(id => P - (t[lead] - t[id]) + 1);
    return { lead, anyClinch, exact, formula, t };
  };

  const p = await h.openPage('whatif'); await h.loaded(p);
  const hits0 = p.apiHits.length;
  const outlook = (rounds, c, kind, L) => p.evaluate(([r, c, k, L]) => F1Common.clinchOutlook(r, c, 2026, k, L), [rounds, c, kind, L]);
  const status = (rounds, c, kind, L) => p.evaluate(([r, c, k, L]) => F1Common.titleStatus(r, c, 2026, k, L), [rounds, c, kind, L]);
  const J = JSON.stringify;

  // Two rivals (drivers, S after 19 → round 20, no sprint).
  let o = await outlook(S, cal, 'drivers', 19), e = enumerate(S, 19, 'drivers', cal, [B, C], o.rivals && o.rivals.map(r => r.margin));
  t.check('two rivals: leader can clinch at the next round', o.state === 'can' && o.leader === A && o.round === 20 && e.anyClinch, J(o));
  t.check('two rivals: margins = the definition, and clinch ⇔ meeting them over every enumerated result', e.exact && J(o.rivals) === J([{id:B, margin:e.formula[0]}, {id:C, margin:e.formula[1]}]), J([o.rivals, e.formula]));
  const mB = e.formula[0], bPos = GP.findIndex(x => 25 - x >= mB) + 1; // B's highest place that still lets a win clinch
  t.check(`two rivals: example is a win with B P${bPos} or lower`, mB > 7 && J(o.example) === J({rivals:[{id:B, pos:bPos}], both:false}), J(o.example));
  // Constructors on S: Ferrari by 32 or more; McLaren may outscore by up to 23.
  o = await outlook(S, cal, 'teams', 19);
  const tt = totals(S, 19, 'teams'), PT = leftAfter(20, 'teams', cal);
  t.check('constructors: margins = points still available after the round − gap + 1, per rival in reach',
    o.state === 'can' && o.leader === 'mercedes' && J(o.rivals) === J([{id:'mclaren', margin:PT-(tt.mercedes-tt.mclaren)+1}, {id:'ferrari', margin:PT-(tt.mercedes-tt.ferrari)+1}])
    && o.rivals[0].margin > 0 && o.rivals[1].margin < 0 && o.example === null, J([o, tt]));
  // One rival (S2).
  o = await outlook(S2, cal, 'drivers', 19); e = enumerate(S2, 19, 'drivers', cal, [B], o.rivals && o.rivals.map(r => r.margin));
  t.check('one rival: margin = the definition, clinch ⇔ meeting it, nobody else in reach', o.state === 'can' && e.exact && J(o.rivals) === J([{id:B, margin:e.formula[0]}]), J([o, e.formula]));
  const b2 = GP.findIndex(x => 25 - x >= e.formula[0]) + 1;
  t.check(`one rival: example is a win with B P${b2} or lower`, J(o.example) === J({rivals:[{id:B, pos:b2}], both:false}), J(o.example));
  // Sprint weekend: S2 after 18 → round 19 (sprint). Enumerate GP + sprint finishes.
  o = await outlook(S5, cal, 'drivers', 18); e = enumerate(S5, 18, 'drivers', cal, [B], o.rivals && o.rivals.map(r => r.margin));
  t.check('sprint weekend: can clinch, margin = the definition, clinch ⇔ meeting it over GP × sprint finishes',
    e.anyClinch && o.state === 'can' && o.round === 19 && e.exact && o.rivals[0].margin === e.formula[0], J([o, e.formula, e.anyClinch]));
  const sp2 = e.formula[0];
  const certainP = [1,2,3,4,5,6,7,8,9,10].filter(q => [...Array(q)].every((_, i) => (GP[i]+(SP[i]||0)) - (i === 0 ? GP[1]+SP[1] : GP[0]+SP[0]) >= sp2)).pop();
  const bothPos = certainP ? null : [2,3,4,5,6,7,8,9,10,11].find(q => (GP[0]+SP[0]) - ((GP[q-1]||0)+(SP[q-1]||0)) >= sp2);
  t.check(`sprint weekend: example is ${certainP ? 'P'+certainP+' or better in both races' : 'winning both races with B P'+bothPos+' or lower in both'}`, o.example && o.example.both
    && (certainP ? o.example.certain === certainP : J(o.example.rivals) === J([{id:B, pos:bothPos}])), J([o.example, certainP, bothPos]));
  // can't clinch on S2's sprint weekend (B too close) → earliest round
  o = await outlook(S2, cal, 'drivers', 18);
  t.check('S2 after 18: not yet, earliest round matches', o.state === 'later' && o.round === earliest(S2, 18, 'drivers', cal) && !enumerate(S2, 18, 'drivers', cal, [B], null).anyClinch, J(o));
  // Can't yet: S after 12, and the fake season at several rounds.
  for(const [label, rounds, L] of [['constructed season after round 12', S, 12], ['constructed season after round 3', S2, 3]]){
    for(const kind of ['drivers', 'teams']){
      o = await outlook(rounds, cal, kind, L);
      t.check(`can't yet (${label}, ${kind}): earliest round = first round the leader could be clear scoring the maximum while nobody else scores`,
        o.state === 'later' && o.round === earliest(rounds, L, kind, cal), J([o, earliest(rounds, L, kind, cal)]));
    }
  }
  const fake = await p.evaluate(() => F1Controls.state.seasonRounds);
  for(const L of [5, 12]) for(const kind of ['drivers', 'teams']){
    o = await outlook(fake, cal, kind, L);
    t.check(`fake season after round ${L} (${kind}): ${o && o.state === 'later' ? 'earliest round ' + o.round : J(o)}`, o.state === 'later' && o.round === earliest(fake, L, kind, cal));
  }
  // Decided (S3).
  o = await outlook(S3, cal, 'drivers', 19);
  t.check('decided: champion and the round it was decided', o.state === 'decided' && o.champion === A && o.round === firstDecided(S3, 19, 'drivers', cal) && !o.countback, J([o, firstDecided(S3, 19, 'drivers', cal)]));
  // Final round (S4 on a 20-round calendar): A may lose up to 9 to B; losing by 10 would leave them level (countback).
  o = await outlook(S4, cal20, 'drivers', 19); e = enumerate(S4, 19, 'drivers', cal20, [B], o.rivals && o.rivals.map(r => r.margin));
  const g4 = e.t[A] - e.t[B];
  t.check(`final round: no points left after it, margin = 1 − gap (may lose up to ${g4-1})`, o.state === 'can' && o.round === 20 && o.rivals[0].margin === 1 - g4 && e.exact, J([o, g4]));
  // A round-20 order with the leader on aPts and B on bPts (others filling the places from the fixed order; C kept low).
  const orderFor = (aPts, bPts) => { const top = new Array(10).fill(null); const ai = GP.indexOf(aPts), bi = GP.indexOf(bPts);
    if(ai >= 0) top[ai] = A; if(bi >= 0) top[bi] = B;
    const fill = ALL.filter(id => id !== A && id !== B && id !== C); let k = 0;
    const out = top.map(x => x || fill[k++]); if(ai < 0) out.push(fill[k++], A); if(bi < 0) out.push(B); return out; };
  const pair = diff => { for(const a of [...GP, 0]) for(const b of [...GP, 0]) if(a !== b || a === 0) if(a - b === diff) return [a, b]; return null; };
  const [ta, tb] = pair(-g4); // B outscores A by exactly the gap: level on points
  const tieRounds = [...S4, round(20, orderFor(ta, tb))];
  let st = await status(tieRounds, cal20, 'drivers', 20);
  const rk = ranked(tieRounds, 20, 'drivers');
  t.check('final round level on points: champion decided on countback (independent countback)', st.final && st.countback && st.champion === rk.order[0] && rk.t[A] === rk.t[B], J([st.champion, st.countback, rk.order.slice(0,2), rk.t[A], rk.t[B]]));
  const [la, lb] = pair(1 - g4);
  st = await status([...S4, round(20, orderFor(la, lb))], cal20, 'drivers', 20);
  t.check(`final round: losing by ${g4-1} keeps the leader champion`, st.champion === A && !st.countback, J(st.champion));
  // Tie still possible with races left: S + a round-20 result where B ends exactly the points still available behind.
  const [xa, xb] = pair(mB - 1), tieS = [...S, round(20, orderFor(xa, xb))];
  st = await status(tieS, cal, 'drivers', 20);
  const r20 = totals(tieS, 20, 'drivers');
  t.check('races left and a rival can only draw level: not champion, rival marked tieOnly', !st.champion && r20[A] - r20[B] === leftAfter(20, 'drivers', cal)
    && J(st.contenders) === J([{id:B, gap:r20[A]-r20[B], tieOnly:true}]), J([xa, xb, st.contenders, st.champion]));
  const [ya, yb] = pair(mB);
  st = await status([...S, round(20, orderFor(ya, yb))], cal, 'drivers', 20);
  t.check('one more point clear: champion', st.champion === A && !st.contenders.length, J(st.contenders));
  // A finish that's enough whatever the others do: S3 after 18 (sprint weekend next, B may outscore A by up to 21).
  o = await outlook(S3, cal, 'drivers', 18);
  const m3 = leftAfter(19, 'drivers', cal) - (totals(S3, 18, 'drivers')[A] - totals(S3, 18, 'drivers')[B]) + 1, both = q => GP[q-1] + SP[q-1];
  let cert = 0; for(let q = 1; q <= 10 && both(q) - (q === 1 ? both(2) : both(1)) >= m3; q++) cert = q;
  t.check(`certain finish: P${cert} or better in both races is enough whatever the others do`, o.state === 'can' && o.rivals[0].margin === m3 && cert > 1 && J(o.example) === J({certain:cert, both:true}), J([o, m3, cert]));
  // Earliest round exactly at a possible draw: A 75 clear after round 1 of 10. After round 4 a draw would still be
  // possible (75 + 3×25 = 6×25), so the earliest is round 5.
  const one = [{ ...S3[0], raceResults: S3[0].raceResults.map(r => ({ ...r, points: r.driverId === A ? 75 : 0 })), sprintResults: null }];
  const cal10 = { ...cal, totalRounds: 10, sprintRounds: [] };
  o = await outlook(one, cal10, 'drivers', 1);
  t.check('earliest round: a possible draw doesn\'t count (round 5, not 4)', o.state === 'later' && o.round === 5 && earliest(one, 1, 'drivers', cal10) === 5, J(o));
  const maxes = await p.evaluate(() => [[2026,'drivers',false],[2026,'drivers',true],[2026,'teams',true],[2024,'drivers',false],[2024,'teams',true],[2021,'drivers',true],[2021,'teams',true]]
    .map(([y, k, s]) => F1Common.roundMaxPoints(y, k, s)));
  t.check('max points per round: 25 / 33 / 58 (2026), +1 fastest lap until 2024, 3-2-1 sprints in 2021', J(maxes) === J([25, 33, 58, 26, 59, 29, 49]), J(maxes));
  t.check('no calendar: no clinch claims', (await p.evaluate(r => F1Common.clinchOutlook(r, null, 2026, 'drivers', 12), fake)) === null);
  t.check('helper checks never fetch', p.apiHits.length === hits0);
  await p.done();

  // ---- What-If page on the near-decided season S (slider on 19 → round 20) ----
  const text = (pg, sel) => h.text(pg, sel);
  const w = await h.openPage('whatif', { snapshots: { 2026: snap(S) } }); await h.loaded(w);
  const wHits = w.apiHits.length;
  t.check('what-if: round 20 is being edited', /Round 20/.test(await text(w, '#orderHeading')));
  const tS = totals(S, 19, 'drivers'), P20 = leftAfter(20, 'drivers', cal), mC = P20 - (tS[A] - tS[C]) + 1;
  const tT = totals(S, 19, 'teams'), P20t = leftAfter(20, 'teams', cal);
  const mMcl = P20t - (tT.mercedes - tT.mclaren) + 1, mFer = P20t - (tT.mercedes - tT.ferrari) + 1;
  t.check(`what-if season: margins needed are B ${mB}, C ${mC}; McLaren ${mMcl}, Ferrari ${mFer}`, mB === 13 && mC === 0 && mMcl === 17 && mFer === -14);
  t.check('what-if: drivers condition line', await text(w, '#clinchNowDrivers') === `DA0 clinches the drivers’ title here by outscoring DB0 by ${mB} or more and scoring at least as many points as DC0 (e.g. DA0 wins with DB0 P${bPos} or lower).`, await text(w, '#clinchNowDrivers'));
  t.check('what-if: constructors condition line (points only)', await text(w, '#clinchNowTeams') === `Mercedes clinches the constructors’ title here by outscoring McLaren by ${mMcl} or more and losing no more than ${-mFer} points to Ferrari.`, await text(w, '#clinchNowTeams'));
  const box = await w.$eval('#clinchNow', el => { const r = el.getBoundingClientRect(), l = document.getElementById('orders').getBoundingClientRect(); return { above: r.bottom <= l.top, h: r.height }; });
  t.check('what-if: conditions sit above the lists, compact (two short lines)', box.above && box.h < 90, J(box));
  const champRows = async () => w.$$eval('tr.champ', trs => trs.map(tr => tr.dataset.id + ':' + !!tr.querySelector('.champTag')));
  const gpOrder = pg => pg.$$eval('.wiList[data-session="gp"] > li', lis => lis.map(li => li.dataset.id || null));
  // Moves a driver to a place in the Grand Prix list with the arrow keys on their handle.
  const moveTo = async (pg, id, idx) => { const cur = (await gpOrder(pg)).indexOf(id); await pg.focus(`.wiList[data-session="gp"] li[data-id="${id}"] .wiGrip`);
    for(let i = 0; i < Math.abs(idx - cur); i++) await pg.keyboard.press(idx < cur ? 'ArrowUp' : 'ArrowDown'); };
  // Standings order: A P1, B P2 → 7 over B is not enough.
  t.check('standings order: drivers title still open, names who can win', await text(w, '#clinchDrivers') === 'Title still open: DA0 and DB0 can still win.', await text(w, '#clinchDrivers'));
  t.check('standings order: no champion marker', (await champRows()).length === 0);
  // Keyboard: B down to P4 → 13 clear → champion.
  await moveTo(w, B, bPos - 1);
  t.check(`B moved to P${bPos} with the keyboard`, (await gpOrder(w))[bPos - 1] === B, J((await gpOrder(w)).slice(0, 6)));
  t.check(`A wins with B P${bPos}: "With this result, DA0 is champion"`, await text(w, '#clinchDrivers') === '🏆 With this result, DA0 is champion.', await text(w, '#clinchDrivers'));
  t.check('…and the 🏆 Champion tag is on A\'s row only', J(await champRows()) === J([A + ':true']), J(await champRows()));
  t.check('champion tag reads "🏆 Champion" on desktop', (await w.$eval('tr.champ .champTag', el => el.innerText)).replace(/\s+/g, ' ').trim() === '🏆 Champion');
  // B one place up (P3): 10 clear → open again.
  await w.keyboard.press('ArrowUp');
  t.check('B one place up: open again, marker gone', await text(w, '#clinchDrivers') === 'Title still open: DA0 and DB0 can still win.' && (await champRows()).length === 0, await text(w, '#clinchDrivers'));
  // A P2 (18), B P7 (6): 12 clear = B could only draw level → countback named, not champion.
  await w.click('#useStandings');
  await moveTo(w, 'd0_1', 0); await moveTo(w, B, 6);
  const o7 = await gpOrder(w);
  t.check('order set: d0_1 P1, A P2, B P7', o7[0] === 'd0_1' && o7[1] === A && o7[6] === B, J(o7.slice(0, 8)));
  t.check('A P2, B P7: B could only draw level → still open, countback named', await text(w, '#clinchDrivers') === 'Title still open: DB0 can only draw level with DA0 on points, which would go to countback.', await text(w, '#clinchDrivers'));
  t.check('…no champion marker for a possible tie', (await champRows()).length === 0);
  // Constructors: Mercedes 1-2 (A P1, d0_1 P2) with McLaren out of the points → constructors' champion; drivers open.
  await w.click('#useStandings');
  await moveTo(w, 'd0_1', 1); await moveTo(w, C, 15); await moveTo(w, 'd2_1', 15);
  const tot = await w.$$eval('#teamTable tr[data-id]', trs => Object.fromEntries(trs.map(tr => [tr.dataset.id, +tr.children[5].textContent])));
  const teamChamp = Object.entries(tot).every(([k, v]) => k === 'mercedes' || v + P20t < tot.mercedes);
  t.check('constructors: champion line and tag follow the dragged order (independent check of the table totals)',
    teamChamp && await text(w, '#clinchTeams') === '🏆 With this result, Mercedes is champion.' && J(await w.$$eval('#teamTable tr.champ', trs => trs.map(t => t.dataset.id))) === J(['mercedes']), J([tot, await text(w, '#clinchTeams')]));
  t.check('…while the drivers\' title stays open (B P3)', /^Title still open: DA0 and DB0/.test(await text(w, '#clinchDrivers')) && J(await w.$$eval('#driverTable tr.champ', trs => trs.length)) === '0', await text(w, '#clinchDrivers'));
  // "Standings order" button resets → both open again.
  await w.click('#useStandings');
  t.check('Standings order button: back to "Title still open", no tags', /^Title still open/.test(await text(w, '#clinchDrivers')) && /^Title still open/.test(await text(w, '#clinchTeams')) && (await champRows()).length === 0);
  // Slider back to 12 → round 13: can't be decided yet.
  await h.setRound(w, 12);
  const er13 = earliest(S, 12, 'drivers', cal);
  t.check('slider to 12: "can\'t be decided before round N at the earliest"', await text(w, '#clinchNowDrivers') === `The drivers’ title can’t be decided before round ${er13} at the earliest.`, await text(w, '#clinchNowDrivers'));
  // Replaying a past round (slider 18 → round 19 happened, sprint weekend): starts from the actual result.
  await h.setRound(w, 18);
  const o18 = enumerate(S, 18, 'drivers', cal, [B], null);
  const line18 = await text(w, '#clinchNowDrivers');
  t.check('replaying round 19 (sprint): condition line consistent with the enumeration', o18.anyClinch ? /clinches the drivers’ title here/.test(line18) : new RegExp(`can’t be decided before round ${earliest(S, 18, 'drivers', cal)} `).test(line18), line18);
  t.check('what-if: dragging, keys, buttons and slider never fetch', w.apiHits.length === wHits, w.apiHits.slice(wHits).join(' '));
  t.check('what-if: no page errors', w.errors.length === 0, w.errors.join('; '));
  await h.setRound(w, 19);
  await moveTo(w, B, bPos - 1);
  await h.screenshot(w, 'clinch-whatif-light.png');
  await w.done();

  // Decided season on the what-if page.
  const wd = await h.openPage('whatif', { snapshots: { 2026: snap(S3) } }); await h.loaded(wd);
  const dr = firstDecided(S3, 19, 'drivers', cal);
  t.check('decided season: "has already won" line', await text(wd, '#clinchNowDrivers') === `🏆 DA0 has already won the drivers’ title (clinched in round ${dr}).`, await text(wd, '#clinchNowDrivers'));
  t.check('decided season: result line says already champion, tag shown', await text(wd, '#clinchDrivers') === '🏆 DA0 is already champion.' && J(await wd.$$eval('#driverTable tr.champ', trs => trs.map(t => t.dataset.id))) === J([A]));
  await wd.done();

  // Phone + dark.
  const m = await h.openPage('whatif', { snapshots: { 2026: snap(S) }, width: 390, theme: 'dark' }); await h.loaded(m);
  await moveTo(m, B, bPos - 1);
  t.check('phone: no horizontal scroll', await m.evaluate(() => document.documentElement.scrollWidth <= 390));
  t.check('phone: champion tag is just the trophy, fully visible', await m.$eval('tr.champ .champTag', el => { const r = el.getBoundingClientRect(), td = el.closest('td').getBoundingClientRect(); return el.innerText.trim() === '🏆' && r.right <= td.right + 0.5; }));
  t.check('phone: condition lines wrap inside the card', await m.$eval('#clinchNow', el => el.scrollWidth <= el.clientWidth + 1));
  t.check('dark: condition box uses the dark inset colour', await m.$eval('#clinchNow', el => getComputedStyle(el).backgroundColor) === 'rgb(15, 18, 22)');
  await h.screenshot(m, 'clinch-whatif-phone-dark.png');
  t.check('phone: no page errors', m.errors.length === 0, m.errors.join('; '));
  await m.done();

  // ---- Pointer on the championship pages ----
  for(const [page, kind, leaderName] of [['drivers', 'drivers', 'DA0'], ['constructors', 'teams', 'Mercedes']]){
    const c = await h.openPage(page, { snapshots: { 2026: snap(S) } }); await h.loaded(c);
    const note = () => text(c, '#clinchNote');
    t.check(`${page}: pointer says who can clinch at the next race, with a What-If link`, await note() === `${leaderName} can clinch the title in round 20. Try results in What-If →`, await note());
    t.check(`${page}: pointer sits in the knockout note`, await c.$eval('#clinchNote', el => el.closest('#sm') !== null));
    t.check(`${page}: link to whatif.html keeps the season (latest round: no round)`, await c.$eval('#clinchNote a', a => a.getAttribute('href')) === 'whatif.html?season=2026');
    await h.setRound(c, 12);
    t.check(`${page}: slider to 12 → "can't be decided before round N", no link`, await note() === `The title can't be decided before round ${earliest(S, 12, kind, cal)}.` && !(await c.$('#clinchNote a')), await note());
    // a round where the next race can decide it, before the latest round → the link carries the round
    let Lc = null; for(let r = 13; r < 19 && Lc === null; r++){ const { t: tt2, order } = ranked(S, r, kind); const gap = tt2[order[0]] - tt2[order[1]]; if(gap + maxAt(r+1, kind, cal) > leftAfter(r+1, kind, cal) && !decidedAfter(S, r, kind, cal)) Lc = r; }
    if(Lc !== null){
      await h.setRound(c, Lc);
      t.check(`${page}: slider to ${Lc} (can clinch next) → link carries the round`, await c.$eval('#clinchNote a', a => a.getAttribute('href')).catch(() => null) === `whatif.html?season=2026&round=${Lc}`, await note());
    }
    // deselect everything: the line stays (whole field)
    await h.setRound(c, 19);
    await c.click('#presetRow button[data-preset="none"]');
    t.check(`${page}: whole field — pointer stays with nothing picked`, (await note()).startsWith(leaderName + ' can clinch'), await note());
    await c.click('#presetRow button[data-preset="5"]');
    // clicking the link opens What-If on the same season and round
    await c.click('#clinchNote a'); await h.loaded(c);
    t.check(`${page}: the link opens What-If for round 20`, /whatif\.html/.test(c.url()) && /Round 20/.test(await text(c, '#orderHeading')), c.url());
    t.check(`${page}: no page errors`, c.errors.length === 0, c.errors.join('; '));
    await c.done();
  }
  // Never fetches on the slider; decided pointer; both themes and phone.
  for(const [page, theme, width] of [['drivers', 'light', 1000], ['constructors', 'dark', 1000], ['drivers', 'dark', 390], ['constructors', 'light', 390]]){
    const c = await h.openPage(page, { snapshots: { 2026: snap(S) }, theme, width }); await h.loaded(c);
    const cHits = c.apiHits.length;
    for(const r of [10, 15, 18, 19]) await h.setRound(c, r);
    await c.selectOption('#ptsView', 'gap');
    t.check(`${page} ${theme} ${width}px: pointer stays in the gap view`, /can clinch the title/.test(await text(c, '#clinchNote')));
    await c.selectOption('#ptsView', 'points');
    t.check(`${page} ${theme} ${width}px: slider and view switch never fetch`, c.apiHits.length === cHits, c.apiHits.slice(cHits).join(' '));
    t.check(`${page} ${theme} ${width}px: no horizontal scroll`, await c.evaluate(w => document.documentElement.scrollWidth <= w, width));
    const col = await c.$eval('#clinchNote a', a => getComputedStyle(a).color);
    t.check(`${page} ${theme} ${width}px: link uses the theme's ink colour`, col === (theme === 'dark' ? 'rgb(238, 240, 242)' : 'rgb(34, 34, 34)'), col);
    await c.$eval('#sm', el => el.scrollIntoView());
    await h.screenshot(c, `clinch-${page}-${theme}-${width}.png`);
    await c.done();
  }
  const cd = await h.openPage('drivers', { snapshots: { 2026: snap(S3) } }); await h.loaded(cd);
  t.check('drivers (decided season): "clinched the title in round N"', await text(cd, '#clinchNote') === `🏆 DA0 clinched the title in round ${firstDecided(S3, 19, 'drivers', cal)}.`, await text(cd, '#clinchNote'));
  await cd.done();
  // The fake season (live): far from decided.
  const fl = await h.openPage('constructors'); await h.loaded(fl);
  t.check('fake season: constructors pointer names the earliest round', await text(fl, '#clinchNote') === `The title can't be decided before round ${earliest(fake, 12, 'teams', cal)}.`, await text(fl, '#clinchNote'));
  await fl.done();
};
