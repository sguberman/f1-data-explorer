// #85 (version A): the "Title race" line under the points chart on the drivers' and constructors' pages — what the
// championship leader needs at the next race to clinch the title, or the earliest round it can be decided, for the
// whole field. The fake fixture season is far from decided, so the calculation is checked on constructed seasons
// (decided, can clinch next race against one or two rivals, a sprint weekend, can't yet, final round, countback ties)
// against an independent calculation written here, for drivers and teams at every round. The rendered text, slider
// following, never fetching, both themes and the phone fit are checked on both pages.
const path = require('path');
module.exports = async (t, h) => {
  const SHOTS = process.env.CLINCH_SHOTS || null; // a folder: save card screenshots there
  const GP = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], SP = [8, 7, 6, 5, 4, 3, 2, 1];
  const DRV = [['ver', 'VER', 'red_bull', 'Netherlands'], ['tsu', 'TSU', 'red_bull', 'Japan'], ['nor', 'NOR', 'mclaren', 'British'], ['pia', 'PIA', 'mclaren', 'Australian'],
    ['lec', 'LEC', 'ferrari', 'Monaco'], ['ham', 'HAM', 'ferrari', 'British'], ['rus', 'RUS', 'mercedes', 'British'], ['ant', 'ANT', 'mercedes', 'Italy'],
    ['alo', 'ALO', 'aston_martin', 'Spain'], ['str', 'STR', 'aston_martin', 'Canada'], ['gas', 'GAS', 'alpine', 'France'], ['col', 'COL', 'alpine', 'Argentina']];
  const BY = Object.fromEntries(DRV.map(d => [d[0], d]));
  const NAMES = ['Australian', 'Chinese', 'Japanese', 'Miami', 'Canadian', 'Monaco', 'Spanish', 'Austrian', 'Las Vegas', 'Abu Dhabi', 'Qatar', 'Brazilian'];
  // One round: gp = finishing order (ids; the rest follow in DRV order), pts = point overrides, sprint = sprint order.
  const row = (id, i, pts, session) => { const [driverId, code, teamId, nat] = BY[id];
    return { driverId, code, name: code[0] + code.slice(1).toLowerCase() + ' Driver', teamId, teamName: teamId + ' F1 Team', number: i + 1, nationality: nat, teamNationality: 'Italy',
      position: i + 1, points: pts, session }; };
  const fill = order => [...order, ...DRV.map(d => d[0]).filter(id => !order.includes(id))];
  const mkRound = (r, gp, { pts = {}, sprint = null } = {}) => ({ round: r, raceName: `${NAMES[r - 1] || 'Round ' + r} Grand Prix`, country: 'Italy',
    raceResults: fill(gp).map((id, i) => row(id, i, id in pts ? pts[id] : (GP[i] || 0), 'race')),
    sprintResults: sprint ? fill(sprint).map((id, i) => row(id, i, SP[i] || 0, 'sprint')) : null });
  const base = ['ver', 'nor', 'pia', 'lec', 'ham', 'rus', 'ant', 'tsu', 'alo', 'str', 'gas', 'col'];
  const rot = r => { const rest = base.slice(2); return ['ver', 'nor', ...rest.slice(r % 10), ...rest.slice(0, r % 10)]; };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const S = {
    // VER wins every round, NOR second: decided after round 8 of 10.
    decided: { N: 10, sprints: [], rounds: range(1, 9).map(r => mkRound(r, base)) },
    // VER wins, NOR second, the rest rotate behind: one rival left at round 7.
    oneRival: { N: 10, sprints: [], rounds: range(1, 9).map(r => mkRound(r, rot(r))) },
    // After round 8 of 10: VER 14 ahead of NOR and 23 ahead of PIA.
    twoRivals: { N: 10, sprints: [], rounds: range(1, 8).map(r => mkRound(r, ['ver', 'pia', 'nor'], r === 1 ? { pts: { nor: 81, pia: 51 } } : {})) },
    // The same, with a sprint at round 9.
    sprintNext: { N: 10, sprints: [9], rounds: range(1, 8).map(r => mkRound(r, ['ver', 'pia', 'nor'], r === 1 ? { pts: { nor: 81, pia: 51 } } : {})) },
    // Down to the final round: VER 5 ahead of NOR, PIA 20 behind VER.
    final: { N: 10, sprints: [3, 7], rounds: range(1, 9).map(r => mkRound(r, r % 2 ? ['ver', 'nor', 'pia'] : ['nor', 'ver', 'pia'], { pts: r === 1 ? { pia: 1 } : {}, sprint: [3, 7].includes(r) ? ['nor', 'ver', 'pia'] : null })) },
    // A lead equal to the points left after round 3 of 4, countback already settled: AAA (VER) wins twice, NOR never.
    cbSafe: { N: 4, sprints: [], rounds: [mkRound(1, ['ver', 'nor'], { pts: { ver: 25, nor: 15, lec: 0 } }), mkRound(2, ['ver', 'nor'], { pts: { ver: 25, nor: 14, lec: 0 } }), mkRound(3, ['lec', 'ver', 'nor'], { pts: { ver: 18, nor: 14, lec: 25 } })] },
    // A lead equal to the points left, but NOR would win countback by winning the last race: not decided; then it does.
    cbOpen: { N: 4, sprints: [], rounds: [mkRound(1, ['ver', 'nor'], { pts: { ver: 25, nor: 15, lec: 0 } }), mkRound(2, ['lec', 'nor', 'ver'], { pts: { ver: 25, nor: 14, lec: 0 } }), mkRound(3, ['lec', 'nor', 'ver'], { pts: { ver: 18, nor: 14, lec: 0 } }),
      mkRound(4, ['nor', 'lec', 'ham', 'rus', 'ant', 'tsu', 'alo', 'str', 'gas', 'col', 'pia', 'ver'], { pts: { nor: 25, ver: 0, lec: 0 } })] },
  };
  const calendar = s => ({ totalRounds: s.N, sprintRounds: s.sprints, raceNames: Object.fromEntries(range(1, s.N).map(r => [r, `${NAMES[r - 1]} Grand Prix`])) });

  // ---- Independent calculation (no site code): standings, clinch, next-race margins by search, earliest round. ----
  function indep(s, L, kind) {
    const gpMax = kind === 'teams' ? 43 : 25, spMax = kind === 'teams' ? 15 : 8;
    const per = r => gpMax + (s.sprints.includes(r) ? spMax : 0);
    const left = k => range(k + 1, s.N).reduce((a, r) => a + per(r), 0);
    const idOf = x => kind === 'teams' ? x.teamId : x.driverId;
    const snap = k => { const pts = {}, fin = {};
      s.rounds.filter(r => r.round <= k).forEach(r => {
        [...r.raceResults, ...(r.sprintResults || [])].forEach(x => { pts[idOf(x)] = (pts[idOf(x)] || 0) + x.points; });
        r.raceResults.forEach(x => { const f = fin[idOf(x)] = fin[idOf(x)] || new Array(30).fill(0); f[x.position - 1]++; }); });
      const cb = (a, b) => { for(let i = 0; i < 30; i++){ const d = fin[b][i] - fin[a][i]; if(d) return d; } return 0; };
      return { pts, fin, order: Object.keys(pts).sort((a, b) => pts[b] - pts[a] || cb(a, b)) }; };
    const clinched = k => { const { pts, fin, order } = snap(k); const a = order[0];
      if(k >= s.N) return a;
      const ok = order.slice(1).every(x => { const d = pts[a] - pts[x], M = left(k);
        if(d !== M) return d > M;
        const X = fin[x].slice(); X[0] += s.N - k; if(kind === 'teams') X[1] += s.N - k;
        for(let i = 0; i < 10; i++) if(fin[a][i] !== X[i]) return fin[a][i] > X[i];
        return false; });
      return ok ? a : null; };
    for(let k = 1; k <= L; k++){ const c = clinched(k); if(c) return { state: 'decided', champion: c, clinched: k }; }
    const { pts, order } = snap(L), n = L + 1, mx = per(n);
    const alive = order.filter(c => pts[c] + left(L) >= pts[order[0]]);
    const lead = [];
    alive.forEach(c => { let can = true; const conds = {};
      order.filter(x => x !== c).forEach(x => {
        let need = null; for(let t = -mx; t <= mx; t++) if(pts[c] + t - pts[x] > left(n)){ need = t; break; }
        if(need === null) can = false; else if(need > -mx) conds[x] = need; });
      if(can) lead.push({ id: c, conds }); });
    if(lead.length) return { state: 'next', lead };
    for(let r = n, add = 0; r <= s.N; r++){ add += per(r);
      if(alive.some(c => order.every(x => x === c || pts[c] + add - pts[x] >= left(r)))) return { state: 'later', earliest: r, leader: order[0] }; }
    return { state: 'later', earliest: s.N };
  }
  const brief = tr => tr.state === 'decided' ? { state: tr.state, champion: tr.champion, clinched: tr.clinched }
    : tr.state === 'next' ? { state: tr.state, lead: tr.lead.map(l => ({ id: l.id, conds: Object.fromEntries(l.conds.map(c => [c.id, c.need])) })) }
    : { state: tr.state, earliest: tr.earliest, leader: tr.leader };

  let p = await h.openPage('drivers', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;

  // Every scenario, every round, both kinds: the page's helper against the independent calculation.
  const site = (s, L, kind, year = 2026) => p.evaluate(([rounds, L, kind, cal, year]) => F1Common.titleRace(rounds, L, kind, { year, calendar: cal }), [s.rounds, L, kind, calendar(s), year]);
  const results = {};
  for(const [name, s] of Object.entries(S)) for(const kind of ['drivers', 'teams']){
    const bad = [];
    for(const L of s.rounds.map(r => r.round)){
      const got = await site(s, L, kind), want = indep(s, L, kind);
      const g = brief(got); if(want.state === 'next') want.lead.forEach(l => { l.conds = Object.fromEntries(Object.entries(l.conds)); });
      const norm = o => JSON.stringify(o.state === 'next' ? { state: o.state, lead: o.lead.map(l => ({ id: l.id, conds: Object.fromEntries(Object.entries(l.conds).sort()) })) } : o);
      if(norm(g) !== norm(want)) bad.push(`R${L}: site ${norm(g)} ≠ ${norm(want)}`);
      results[`${name}:${kind}:${L}`] = got;
    }
    t.check(`${name} (${kind}): every round matches the independent calculation`, bad.length === 0, bad.join(' | '));
  }
  const R = (k) => results[k];
  // The states the scenarios were built for.
  t.check('decided: VER clinched in round 8 (lead 56 > 50 left), 2 rounds to spare', R('decided:drivers:9').state === 'decided' && R('decided:drivers:9').champion === 'ver' && R('decided:drivers:9').clinched === 8 && R('decided:drivers:8').clinched === 8, JSON.stringify(R('decided:drivers:9')));
  t.check('decided: not yet after round 7 — VER can clinch at round 8', R('decided:drivers:7').state === 'next' && R('decided:drivers:7').lead[0].id === 'ver');
  const one = R('oneRival:drivers:7');
  t.check('one rival: at round 7 VER must outscore NOR by 2 or more, nobody else matters', one.state === 'next' && one.lead.length === 1 && JSON.stringify(one.lead[0].conds) === '[{"id":"nor","need":2}]', JSON.stringify(one));
  const two = R('twoRivals:drivers:8');
  t.check('two rivals: VER must outscore NOR by 12 or more and PIA by 3 or more', two.state === 'next' && JSON.stringify(two.lead[0].conds) === '[{"id":"nor","need":12},{"id":"pia","need":3}]', JSON.stringify(two.lead));
  t.check('two rivals: example is a win with NOR P4 or lower (PIA free)', JSON.stringify(two.lead[0].example) === '{"sprint":false,"rivals":[{"id":"nor","place":4}]}', JSON.stringify(two.lead[0].example));
  const sp = R('sprintNext:drivers:8');
  t.check('sprint weekend next: same margins, up to 33 points in reach, NOR on 21 or fewer if VER wins both', sp.state === 'next' && sp.sprintNext && JSON.stringify(sp.lead[0].example) === '{"sprint":true,"rivals":[{"id":"nor","maxPts":21}]}', JSON.stringify(sp.lead));
  t.check('can\'t yet: after round 3 the earliest is round 7', R('decided:drivers:3').state === 'later' && R('decided:drivers:3').earliest === 7, JSON.stringify(R('decided:drivers:3')));
  t.check('can\'t yet: after round 1 (7 ahead) the earliest is round 6', R('decided:drivers:1').earliest === 6, JSON.stringify(R('decided:drivers:1')));
  const fin = R('final:drivers:9');
  t.check('final round: VER may lose up to 4 points to NOR; NOR can also clinch by outscoring VER by 6', fin.state === 'next' && fin.final && fin.lead[0].id === 'ver' && fin.lead[0].conds.find(c => c.id === 'nor').need === -4
    && fin.lead.some(l => l.id === 'nor' && l.conds.find(c => c.id === 'ver').need === 6), JSON.stringify(fin.lead));
  t.check('countback: a lead equal to the points left is decided when countback is already settled', R('cbSafe:drivers:3').state === 'decided' && R('cbSafe:drivers:3').clinched === 3, JSON.stringify(R('cbSafe:drivers:3')));
  t.check('countback: …and not when the rival would win countback by winning the last race', R('cbOpen:drivers:3').state === 'next' && R('cbOpen:drivers:3').lead[0].conds.find(c => c.id === 'nor').need === -24, JSON.stringify(R('cbOpen:drivers:3')));
  t.check('countback: level on points at the end goes to countback (NOR champion, level with VER)', R('cbOpen:drivers:4').state === 'decided' && R('cbOpen:drivers:4').champion === 'nor' && R('cbOpen:drivers:4').tieWith === 'ver' && R('cbOpen:drivers:4').over, JSON.stringify(R('cbOpen:drivers:4')));
  t.check('teams: McLaren and Red Bull scenarios produce a next-race clinch too', ['decided', 'oneRival', 'twoRivals'].some(n => Object.keys(results).some(k => k.startsWith(n + ':teams') && results[k].state === 'next')));
  // Season rules: fastest-lap point 2019–2024, 3-2-1 sprints in 2021.
  const W = await p.evaluate(() => [2026, 2024, 2021].map(y => [F1Common.maxWeekendPoints(y, 'drivers'), F1Common.maxWeekendPoints(y, 'teams')].map(w => w.gp + '/' + w.sprint).join(' ')));
  t.check('the most a weekend can give follows the season (fastest lap to 2024, 2021 sprints)', JSON.stringify(W) === '["25/8 43/15","26/8 44/15","26/3 44/5"]', JSON.stringify(W));
  // VER 51 ahead after round 8 of 10: 50 points left under 2026 rules (decided), 52 with the fastest-lap point (not yet).
  const flEdge = { N: 10, sprints: [], rounds: range(1, 9).map(r => mkRound(r, base, r === 1 ? { pts: { nor: 23 } } : {})) };
  const fl26 = await site(flEdge, 8, 'drivers', 2026), fl24 = await site(flEdge, 8, 'drivers', 2024), fl24b = await site(flEdge, 9, 'drivers', 2024);
  t.check('2024 rules: the fastest-lap point keeps a 51-point lead with two races left open; 2026 rules don\'t',
    fl26.state === 'decided' && fl26.clinched === 8 && fl24.state === 'next' && fl24b.state === 'decided' && fl24b.clinched === 9, JSON.stringify([brief(fl26), brief(fl24), brief(fl24b)]));

  // ---- The fake season on the page: text, placement, whole field, slider, theme, never fetching. ----
  const fixtureWant = await p.evaluate(() => { const rs = F1Controls.state.seasonRounds; return { rounds: rs }; });
  const fx = { N: 23, sprints: [2, 6, 11, 14, 19, 23], rounds: fixtureWant.rounds };
  const fxWant = indep(fx, 12, 'drivers');
  const codeOf = id => fx.rounds[0].raceResults.concat(...fx.rounds.map(r => r.raceResults)).find(x => x.driverId === id).code;
  const tot = (id, k) => fx.rounds.filter(r => r.round <= k).flatMap(r => [...r.raceResults, ...(r.sprintResults || [])]).filter(x => x.driverId === id).reduce((a, x) => a + x.points, 0);
  const second = (() => { const ids = [...new Set(fx.rounds.flatMap(r => r.raceResults.map(x => x.driverId)))].sort((a, b) => tot(b, 12) - tot(a, 12)); return ids[1]; })();
  const want12 = `${codeOf(fxWant.leader)} leads ${codeOf(second)} by ${tot(fxWant.leader, 12) - tot(second, 12)} points. The title can't be decided before round ${fxWant.earliest} at the earliest.`;
  const main = () => p.$eval('#titleRace .trText', e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '(missing)');
  t.check('fake season, round 12: says who leads and the earliest round, from the independent calculation', await main() === want12, await main() + ' ≠ ' + want12);
  t.check('…labelled "Title race", with "Every driver, after round 12." under it', await h.text(p, '#titleRace .trLabel') === 'Title race' && await h.text(p, '#titleRace .trSub') === 'Every driver, after round 12.', await h.text(p, '#titleRace'));
  t.check('placement: in the points card, under the chart, above the knockout note', await p.evaluate(() => {
    const el = document.getElementById('titleRace'), card = document.getElementById('c').closest('.card');
    return card.contains(el) && el.nextElementSibling.id === 'sm' && el.getBoundingClientRect().top > document.getElementById('chartWrap').getBoundingClientRect().bottom; }));
  t.check('names carry flags', await p.$$eval('#titleRace .trName img.flag', x => x.length) === 2);
  for(const r of [6, 2]){
    await h.setRound(p, r); await p.waitForTimeout(60);
    const w = indep(fx, r, 'drivers');
    t.check(`slider to round ${r}: follows (earliest round ${w.earliest})`, (await main()).endsWith(`before round ${w.earliest} at the earliest.`) && (await h.text(p, '#titleRace .trSub')) === `Every driver, after round ${r}.`, await main());
  }
  await h.setRound(p, 12); await p.waitForTimeout(60);
  const before = await p.$eval('#titleRace', e => e.innerHTML);
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(60);
  t.check('whole field: picking no drivers doesn\'t change it (and it stays visible)', await p.$eval('#titleRace', e => e.innerHTML) === before && !(await p.$eval('#titleRace', e => e.hidden)));
  await p.click('#presetRow [data-preset="5"]'); await p.waitForTimeout(60);
  const bg = () => p.$eval('#titleRace', e => getComputedStyle(e).backgroundColor);
  const light = await bg();
  await p.click('#themeToggle .theme-trigger'); await p.click('#themeToggle button[data-pref="dark"]'); await p.waitForTimeout(60);
  t.check('theme switch: takes the dark colours, text unchanged', light === 'rgb(241, 239, 232)' && await bg() === 'rgb(15, 18, 22)' && await p.$eval('#titleRace', e => e.innerHTML) === before, light + ' → ' + await bg());
  await p.selectOption('#ptsView', 'gap'); await p.waitForTimeout(60);
  t.check('the gap view keeps it', await p.$eval('#titleRace', e => e.innerHTML) === before);
  t.check('slider, picker, theme and view never fetch', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  await p.selectOption('.f1c-year', '2025'); await p.waitForTimeout(400);
  t.check('a season with no results hides it', await p.$eval('#titleRace', e => e.hidden));
  await p.selectOption('.f1c-year', '2026'); await h.loaded(p);
  t.check('…and switching back shows it again', !(await p.$eval('#titleRace', e => e.hidden)) && await main() === want12);
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Constructed seasons on the pages (season files), the wording of each state. ----
  const snap = s => ({ v: 1, year: 2026, generatedAt: Date.now() - 3600e3, complete: true, calendar: calendar(s), rounds: s.rounds });
  const open = async (name, s, opts = {}) => { const q = await h.openPage(name, { snapshots: { 2026: snap(s) }, ...opts }); await h.loaded(q); return q; };
  const wording = [
    ['drivers', 'twoRivals', 8, 'VER clinches the title in round 9 (Las Vegas) by outscoring NOR by 12 or more and PIA by 3 or more. For example, a win with NOR P4 or lower.'],
    ['drivers', 'sprintNext', 8, 'VER clinches the title in round 9 (Las Vegas) by outscoring NOR by 12 or more and PIA by 3 or more. For example, winning both with NOR on 21 points or fewer for the weekend.'],
    ['drivers', 'oneRival', 7, 'VER clinches the title in round 8 (Austrian) by outscoring NOR by 2 or more. A win would do it, whatever the others do.'],
    ['drivers', 'decided', 9, 'VER is champion: clinched in round 8 (Austrian), with 2 rounds to spare.'],
    ['drivers', 'decided', 3, 'VER leads NOR by 21 points. The title can\'t be decided before round 7 (Spanish) at the earliest.'],
    ['drivers', 'final', 9, null],
    ['drivers', 'cbOpen', 4, 'NOR is the 2026 champion: clinched in the final round (Miami), level on points with VER and ahead on countback.'],
  ];
  for(const [name, sc, L, want] of wording){
    const q = await open(name, S[sc]);
    if(L !== S[sc].rounds.length){ await h.setRound(q, L); await q.waitForTimeout(60); }
    const got = await q.$eval('#titleRace .trText', e => e.textContent.replace(/\s+/g, ' ').trim());
    if(want) t.check(`${name}, ${sc}, round ${L}: "${want}"`, got === want, got);
    else { const f = results['final:drivers:9'], ver = f.lead[0], others = f.lead.slice(1);
      t.check(`${name}, final round: names the final round, the leader's terms and the other contenders`, got.startsWith('VER clinches the title in round 10 (Abu Dhabi), the final round, unless ') && got.includes('the final round, unless NOR outscores VER by 5 or more.')
        && got.includes('NOR can also clinch it there by outscoring VER by 6 or more') && others.length >= 1, got); }
    if(SHOTS) await q.locator('#titleRace').screenshot({ path: path.join(SHOTS, `clinch-state-${sc}-${L}.png`) });
    t.check(`${name}, ${sc}: the countback note shows only for a next-race clinch`, (await q.$('#titleRace .trTie') !== null) === (results[`${sc}:drivers:${L}`].state === 'next'));
    await q.done();
  }
  // Constructors: points only (no finishing-position example), team names.
  const tq = await open('constructors', S.twoRivals);
  const tr = results['twoRivals:teams:8'], tmain = await tq.$eval('#titleRace .trText', e => e.textContent.replace(/\s+/g, ' ').trim());
  const tname = { red_bull: 'Red Bull', mclaren: 'McLaren', ferrari: 'Ferrari', mercedes: 'Mercedes', aston_martin: 'Aston Martin', alpine: 'Alpine' };
  const wantT = tr.state === 'next' ? `${tname[tr.lead[0].id]} clinches the title in round 9 (Las Vegas)` : tr.state === 'decided' ? `${tname[tr.champion]} is champion` : `${tname[tr.leader]} leads`;
  t.check(`constructors, twoRivals round 8: team names, points only ("${wantT}…")`, tmain.startsWith(wantT) && !/ P\d| a win/i.test(tmain) && await h.text(tq, '#titleRace .trSub') === 'Every team, after round 8.', tmain);
  const iw = indep(S.twoRivals, 8, 'teams'), [[rid, rneed]] = Object.entries(iw.lead[0].conds);
  t.check(`constructors: a single rival who may outscore the leader by a little reads "…unless ${tname[rid]} outscores ${tname[iw.lead[0].id]} by ${1 - rneed} or more."`,
    Object.keys(iw.lead[0].conds).length === 1 && rneed < 0 && tmain === `${tname[iw.lead[0].id]} clinches the title in round 9 (Las Vegas) unless ${tname[rid]} outscores ${tname[iw.lead[0].id]} by ${1 - rneed} or more.`, tmain);
  for(const L of [7, 3]){
    await h.setRound(tq, L); await tq.waitForTimeout(60);
    const w = indep(S.twoRivals, L, 'teams'), m = await tq.$eval('#titleRace .trText', e => e.textContent.replace(/\s+/g, ' ').trim());
    const ok = w.state === 'next' ? m.startsWith(`${tname[w.lead[0].id]} clinches the title in round ${L + 1}`) && Object.entries(w.lead[0].conds).every(([id, n]) => n > 0 ? m.includes(`${tname[id]} by ${n} or more`) : n === 0 ? m.includes(tname[id]) : m.includes(`unless ${tname[id]} outscores ${tname[w.lead[0].id]} by ${1 - n} or more`))
      : w.state === 'decided' ? m.startsWith(`${tname[w.champion]} is champion: clinched in round ${w.clinched}`) : m.includes(`before round ${w.earliest}`);
    t.check(`constructors: slider to round ${L} follows (${w.state})`, ok, m + ' ' + JSON.stringify(w));
  }
  t.check('constructors: no page errors', tq.errors.length === 0, tq.errors.join('; '));
  await tq.done();
  // Constructors on the fake season: the independent earliest round.
  const cq = await h.openPage('constructors'); await h.loaded(cq);
  const cw = indep(fx, 12, 'teams'), cm = await cq.$eval('#titleRace .trText', e => e.textContent.replace(/\s+/g, ' ').trim());
  t.check(`constructors, fake season: "…before round ${cw.earliest} at the earliest."`, cw.state === 'later' && cm.endsWith(`The title can't be decided before round ${cw.earliest} at the earliest.`) && cm.startsWith('Mercedes leads '), cm);
  await cq.done();

  // ---- Both pages, both themes, desktop and phone: fits, nothing overflows, the chart isn't pushed down. ----
  for(const name of ['drivers', 'constructors']) for(const [width, theme] of [[1000, 'light'], [1000, 'dark'], [390, 'light'], [390, 'dark']]){
    const q = await open(name, S.twoRivals, { width, theme });
    const fit = await q.evaluate(() => { const el = document.getElementById('titleRace'), b = el.getBoundingClientRect(), card = el.closest('.card').getBoundingClientRect();
      return { right: b.right, cardRight: card.right, scroll: document.documentElement.scrollWidth, h: Math.round(b.height), over: el.scrollWidth > el.clientWidth + 1 }; });
    t.check(`${name} ${width}px ${theme}: fits the card with no sideways scroll`, fit.right <= fit.cardRight && fit.scroll <= width && !fit.over, JSON.stringify(fit));
    t.check(`${name} ${width}px ${theme}: compact (≤ ${width > 600 ? 80 : 160}px tall)`, fit.h <= (width > 600 ? 80 : 160), JSON.stringify(fit));
    await h.screenshot(q, `clinch-${name}-${width}-${theme}.png`);
    if(SHOTS) await q.locator('#chartWrap').locator('xpath=..').screenshot({ path: path.join(SHOTS, `clinch-card-${name}-${width}-${theme}.png`) });
    t.check(`${name} ${width}px ${theme}: no page errors`, q.errors.length === 0, q.errors.join('; '));
    await q.done();
  }
};
