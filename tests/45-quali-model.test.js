// #167: qualifying and the starting grid as evidence for the Simulator and What-If. The weights (F1RaceModel.evidence and
// weightMatrix with it), the engine's per-event weights, the generator's upcoming round, and the pages: the next race
// uses its starting grid (else qualifying result) when known, this season's qualifying so far counts as form, a missing
// file changes nothing, and nothing is fetched while interacting.
const M = require('../site/racemodel.js');
const { api } = require('./lib/fixture');
module.exports = async (t, h) => {
  // ---- The weights ----
  t.check('no evidence is null', M.evidence(null, []) === null && M.evidence(null, undefined) === null);
  t.check('known position and form give weighted evidence', JSON.stringify(M.evidence(3, [1, 2])) === JSON.stringify([[M.QUALI_KNOWN, [3]], [M.QUALI_FORM, [1, 2]]]));
  const res = [[1, 2, null], [], [5, 4]], teams = ['a', 'a', 'b'], ev = [M.evidence(2, [3, 1]), null, M.evidence(null, [6])];
  const W = M.weightMatrix(res, teams, ev), plain = M.weightMatrix(res, teams), n = 3;
  let ok = true;
  for (let i = 0; i < n; i++) for (let s = 0; s < n; s++) {
    let want = plain[i * n + s];
    if (i === 0) want += M.QUALI_KNOWN * M.posTerm(2, s + 1) + M.QUALI_FORM * (M.posTerm(3, s + 1) + M.posTerm(1, s + 1));
    if (i === 2) want += M.QUALI_FORM * M.posTerm(6, s + 1);
    if (Math.abs(W[i * n + s] - want) > 1e-12) ok = false;
  }
  t.check('weightMatrix adds the evidence on top of the own + teammate weight, only for the drivers that have it', ok);
  t.check('a position at or ahead of the place counts fully, behind it by the near bonus halving', M.posTerm(3, 3) === 1 && M.posTerm(2, 3) === 1 && M.posTerm(4, 3) === M.NEAR_BONUS && M.posTerm(5, 3) === M.NEAR_BONUS * M.NEAR_DECAY);

  // ---- The engine: per-event weights ----
  const B = await import('../tools/backtest.mjs');
  const snap = B.snapshot(2024, 12), ctx = B.simContext(snap, { ...B.DEFAULT, known: 0, form: 0 }), N = ctx.n;
  const target = ctx.roster.findIndex(q => q.active && q.driverId === 'sainz'), e0 = ctx.events.findIndex(e => e.type === 'gp');
  const rig = new Float64Array(N * N); for (let i = 0; i < N; i++) for (let s = 0; s < N; s++) rig[i * N + s] = i === target ? 1e9 : 1e-6;
  ctx.eventW = []; ctx.eventW[e0] = rig; ctx.dnfRate.fill(0);
  const base = ctx.W;
  let allFirst = true, otherEvent = 0;
  const rnd = (() => { let a = 5; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
  for (let k = 0; k < 40; k++) { const s = M.simulateSeason(ctx, rnd, snap.sc.gp, snap.sc.sprint, true); if (s.orders[e0][0] !== target) allFirst = false; if (s.orders[e0 + 1] && s.orders[e0 + 1][0] === target) otherEvent++; }
  t.check('the engine uses an event\'s own weights for that event (the rigged driver wins it every time)', allFirst);
  t.check('…and the other events keep the base weights, and the base matrix is restored afterwards', otherEvent < 20 && ctx.W === base);

  // ---- The generator: the upcoming round has qualifying and no results yet ----
  const { buildGrid } = await import('../tools/qualifying-snapshot.mjs');
  const drv = (id, code) => ({ driverId: id, code }), con = id => ({ constructorId: id });
  const race = (round, extra) => ({ season: '2031', round: String(round), raceName: `Race ${round}`, Circuit: { circuitId: 'c' + round }, ...extra });
  const tables = {
    results: [race(1, { Results: [{ grid: '1', Driver: drv('x', 'X'), Constructor: con('a') }] })],
    qualifying: [race(1, { QualifyingResults: [{ position: '1', Driver: drv('x', 'X'), Constructor: con('a'), Q1: '1:30.000' }] }),
                 race(2, { QualifyingResults: [{ position: '1', Driver: drv('y', 'Y'), Constructor: con('b'), Q1: '1:31.000' }, { position: '2', Driver: drv('x', 'X'), Constructor: con('a'), Q1: '1:31.500' }] })],
    '': [race(1, {}), race(2, {}), race(3, {})],
  };
  const fake = async url => { const m = /\/2031(?:\/(results|qualifying))?\.json\?limit=100&offset=0$/.exec(url); const tb = tables[m ? (m[1] || '') : '']; return m ? { ok: true, status: 200, json: async () => ({ MRData: { total: String(tb.length), limit: '100', RaceTable: { Races: tb } } }) } : { ok: false, status: 404 }; };
  const g = await buildGrid(2031, fake, { now: 1 });
  t.check('a round with qualifying but no results is included, with an empty grid, and the season is not complete',
    g.rounds.length === 2 && g.rounds[1].round === 2 && JSON.stringify(g.rounds[1].grid) === '{}' && g.rounds[1].qualifying.length === 2 && g.complete === false, JSON.stringify(g.rounds.map(r => [r.round, Object.keys(r.grid).length, r.qualifying.length])));
  t.check('each round carries its circuit id', g.rounds[0].circuitId === 'c1' && g.rounds[1].circuitId === 'c2');

  // ---- The pages, with a fake grid file for the fixture season (12 rounds loaded of 23) ----
  const order = api('https://f1api.dev/api/2026/12/race').body.races.results.map(r => r.driver.driverId); // finishing order of round 12
  const rev = order.slice().reverse();
  const qual = ids => ids.map((id, i) => ({ driverId: id, code: null, teamId: null, position: i + 1, q1: null, q2: null, q3: null }));
  const rounds = []; for (let r = 1; r <= 12; r++) rounds.push({ round: r, raceName: 'R' + r, circuitId: 'c' + r, qualifying: qual(r % 2 ? rev : order), grid: {} });
  const next = (grid) => ({ round: 13, raceName: 'R13', circuitId: 'c13', qualifying: qual(rev), grid });
  const file = g13 => ({ v: 1, year: 2026, generatedAt: 1, complete: false, source: 'jolpica', rounds: [...rounds, g13] });
  const qOnly = file(next({})), withGrid = file(next(Object.fromEntries([[rev[0], 0], ...order.slice(0, 5).map((id, i) => [id, i + 1])]))), none = null;

  const sim = async (grids, extra = async () => {}) => {
    const p = await h.openPage('simulator', { grids }); await h.loaded(p);
    await extra(p);
    return p;
  };
  const probe = p => p.evaluate(() => {
    const ctx = buildSimContext(), n = ctx.n, e0 = ctx.events.findIndex(e => e.type === 'gp');
    const res = fullRoster.map(windowResults), teams = fullRoster.map(d => d.active ? d.teamNow : null);
    const form = fullRoster.map(d => d.active ? currentGrid ? currentGrid.rounds.filter(g => g.round <= L).flatMap(g => g.qualifying.filter(q => q.driverId === d.driverId).map(q => q.position)) : [] : []);
    const baseW = F1RaceModel.weightMatrix(res, teams, form.map(f => F1RaceModel.evidence(null, f)));
    const g13 = currentGrid && currentGrid.rounds.find(g => g.round === L + 1);
    const known = fullRoster.map((d, i) => { if(!g13 || !d.active) return null; if(d.driverId in g13.grid) return g13.grid[d.driverId] === 0 ? n : g13.grid[d.driverId]; const q = g13.qualifying.find(x => x.driverId === d.driverId); return q ? q.position : null; });
    const wantEv = F1RaceModel.weightMatrix(res, teams, known.map((k, i) => F1RaceModel.evidence(k, form[i])));
    const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
    return { L, hasEvent: !!ctx.eventW, baseSame: same(ctx.W, baseW), eventSame: ctx.eventW ? same(ctx.eventW[e0], wantEv) : null, e0, onlyOne: ctx.eventW ? ctx.eventW.filter(Boolean).length === 1 : null,
             lede: document.getElementById('lede').textContent, formLen: form.filter(f => f.length).length, pit: known.filter(k => k === n).length };
  });

  let p = await sim({ 2026: qOnly });
  let r = await probe(p);
  t.check('simulator, qualifying only: the next race has its own weights = known position + form on top of the base', r.hasEvent && r.eventSame && r.baseSame && r.onlyOne, JSON.stringify(r));
  t.check('…the base weights carry the qualifying form of rounds 1–12', r.formLen > 0 && r.baseSame);
  t.check('…and the description says Round 13 is simulated from its qualifying result', /Round 13 is simulated from its qualifying result\./.test(r.lede), r.lede.slice(-120));
  t.check('a file request for it was made once with the season', p.gridHits.length === 1, p.gridHits.join(' '));
  const hits = p.apiHits.length, ghits = p.gridHits.length;
  await p.click('#run'); await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent));
  t.check('a run with it works and fetches nothing more', p.apiHits.length === hits && p.gridHits.length === ghits && p.errors.length === 0, p.errors.join('; '));
  // moving the slider back: the next race is round 12, with round 12\'s data, and only rounds 1–11 count as form
  await h.setRound(p, 11); await p.waitForTimeout(100);
  r = await probe(p);
  t.check('slider at round 11: the next race is round 12 (its qualifying), form uses rounds 1–11 only', r.L === 11 && r.hasEvent && r.eventSame && r.baseSame && /Round 12 is simulated from its qualifying result\./.test(r.lede), JSON.stringify(r));
  t.check('moving the slider fetches nothing', p.apiHits.length === hits && p.gridHits.length === ghits);
  await p.done();

  p = await sim({ 2026: withGrid }); r = await probe(p);
  t.check('simulator, with a starting grid: the grid is used (pit lane = last) and the description says so', r.eventSame && r.hasEvent && r.pit === 1 && /Round 13 is simulated from its starting grid\./.test(r.lede), JSON.stringify(r));
  await p.done();

  p = await sim({ 2026: none }); r = await probe(p);
  t.check('simulator, no qualifying file: no per-event weights, no note, the base weights, no errors',
    !r.hasEvent && r.baseSame && !/simulated from its/.test(r.lede) && r.formLen === 0 && p.errors.length === 0, JSON.stringify(r));
  await p.done();

  // ---- What-If: Round 13 from its qualifying result moves the pole-sitter up (seeded, same random numbers) ----
  const wi = async grids => {
    const q = await h.openPage('whatif', { grids }); await h.loaded(q);
    await q.evaluate(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; });
    await q.click('#useSim');
    const got = await q.$$eval('.wiList[data-session="gp"] > li', l => l.map(x => x.dataset.id || null));
    const note = await q.textContent('#orderNote');
    return { q, got, note };
  };
  const pole = rev[0];
  const a = await wi({ 2026: qOnly }), b = await wi({ 2026: none });
  t.check('what-if: with the qualifying result the pole-sitter is simulated further up than without it', a.got.indexOf(pole) < b.got.indexOf(pole), `${a.got.indexOf(pole)} vs ${b.got.indexOf(pole)}`);
  t.check('what-if: the note says Round 13 is simulated from its qualifying result; without the file it does not', /Round 13 is simulated from its qualifying result\./.test(a.note) && !/simulated from its/.test(b.note), a.note.slice(-160));
  t.check('what-if: no errors, and the preset fetched nothing', a.q.errors.length === 0 && b.q.errors.length === 0 && a.q.gridHits.length === 1);
  await a.q.done(); await b.q.done();
  const c = await wi({ 2026: withGrid });
  t.check('what-if, with a starting grid: it says starting grid', /Round 13 is simulated from its starting grid\./.test(c.note));
  await c.q.done();
};
