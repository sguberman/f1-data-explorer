// #169: track history. tools/track-history.mjs turns the season files into each driver's results at each circuit relative
// to their own season; the model turns earlier visits into an expected position (F1RaceModel.trackPosition); the pages use
// only seasons before the one shown, for every remaining race (and its sprint), and carry on without the file.
const fs = require('fs'), path = require('path');
const M = require('../site/racemodel.js');
const { api } = require('./lib/fixture');
module.exports = async (t, h) => {
  const T = await import('../tools/track-history.mjs');

  // ---- The generator, on made-up seasons ----
  const row = (id, pos) => ({ driverId: id, position: pos });
  const seasons = {
    2020: { rounds: [{ round: 1, raceResults: [row('a', 1), row('b', 2), row('b', 5)] }, { round: 2, raceResults: [row('a', 3), row('b', null)] }, { round: 3, raceResults: [row('a', 2), row('b', 4)] }] },
    2021: { rounds: [{ round: 1, raceResults: [row('a', 4), row('b', 1)] }] },
  };
  const grids = { 2020: { rounds: [{ round: 1, circuitId: 'x' }, { round: 2, circuitId: 'y' }, { round: 3, circuitId: 'x' }] }, 2021: { rounds: [{ round: 1, circuitId: 'y' }] } };
  const th = T.buildTrackHistory([2020, 2021, 2022], y => seasons[y] || null, y => grids[y] || null);
  // a: finishes 1, 3, 2 in 2020 (mean 2): deltas -1 at x, +1 at y, 0 at x; 2021: 4 (mean 4): 0 at y.  b: 2 (the duplicate 5 ignored), none, 4 (mean 3): -1 at x, +1 at x; 2021: 1: 0 at y
  t.check('deltas are the finish minus the driver\'s average classified finish that season, per circuit, with the year',
    JSON.stringify(th.circuits.x.a) === JSON.stringify([[2020, -1], [2020, 0]]) && JSON.stringify(th.circuits.y.a) === JSON.stringify([[2020, 1], [2021, 0]]), JSON.stringify(th.circuits));
  t.check('a driver listed twice in a round counts once, and a non-classified result has no entry',
    JSON.stringify(th.circuits.x.b) === JSON.stringify([[2020, -1], [2020, 1]]) && JSON.stringify(th.circuits.y.b) === JSON.stringify([[2021, 0]]));
  t.check('a season without a file is skipped; the circuits and drivers are sorted; the header says what it is', th.v === 1 && th.firstYear === 2014 && Object.keys(th.circuits).join() === 'x,y' && Object.keys(th.circuits.x).join() === 'a,b');

  // ---- The expected position ----
  t.check('no earlier visits: none', M.trackPosition([], 5, 20) === null && M.trackPosition(undefined, 5, 20) === null);
  t.check('visits move the average finish by their mean delta, shrunk by (visits + 3)', M.trackPosition([-2, -1], 5, 20) === 4 && M.trackPosition([-6], 5, 20) === 3 && M.trackPosition([4, 4, 4], 10, 20) === 12);
  t.check('with no finishes this season it starts mid-field; the result is kept within 1 to the number of cars', M.trackPosition([3], null, 20) === 11 && M.trackPosition([-50], 2, 20) === 1 && M.trackPosition([90, 90, 90], 18, 20) === 20);
  t.check('evidence carries the track weight on the expected position', JSON.stringify(M.evidence(null, [], 7)) === JSON.stringify([[M.TRACK_WEIGHT, [7]]]) && M.evidence(null, [], null) === null);

  // ---- The committed file against the season files (an independent recomputation) ----
  const dir = path.join(__dirname, '..', 'site', 'data'), file = JSON.parse(fs.readFileSync(path.join(dir, 'tracks.json'), 'utf8'));
  t.check('tracks.json: version, first year, circuits', file.v === 1 && file.firstYear === 2014 && Object.keys(file.circuits).length >= 25);
  let bad = 0, count = 0;
  for (const c of Object.values(file.circuits)) for (const list of Object.values(c)) for (const [y, d] of list) { count++; if (!(y >= 2014 && y <= 2030) || !Number.isFinite(d) || Math.abs(d) > 21) bad++; }
  t.check('every entry is a season from 2014 on and a sensible delta', bad === 0 && count > 4000, `${bad} bad of ${count}`);
  const s18 = JSON.parse(fs.readFileSync(path.join(dir, '2018.json'), 'utf8')), g18 = JSON.parse(fs.readFileSync(path.join(dir, 'grid', '2018.json'), 'utf8'));
  const fin = s18.rounds.map(r => ({ r: r.round, p: (r.raceResults.find(x => x.driverId === 'hamilton') || {}).position })).filter(x => Number.isFinite(x.p) && x.p >= 1);
  const mean = fin.reduce((a, x) => a + x.p, 0) / fin.length, first = fin[0], circuit = g18.rounds.find(g => g.round === first.r).circuitId;
  const entry = file.circuits[circuit].hamilton.find(([y]) => y === 2018);
  t.check('Hamilton\'s 2018 entry at his first race\'s circuit is his finish minus his 2018 average', entry && Math.abs(entry[1] - (first.p - mean)) < 0.0051, JSON.stringify([circuit, entry, first.p - mean]));

  // ---- The pages (fixture season: 12 of 23 rounds loaded; sprints at 2, 6, 11, 14, 19, 23) ----
  const order = api('https://f1api.dev/api/2026/12/race').body.races.results.map(r => r.driver.driverId);
  const circuits = {}; for (let r = 1; r <= 23; r++) circuits[r] = 'c' + r;
  const grid = { v: 1, year: 2026, generatedAt: 1, complete: false, source: 'jolpica', circuits, rounds: [] };
  // order[0] is strong at c13 and c14 (a sprint weekend) in 2020 and 2021, and has an entry for 2026 itself, which must be ignored
  const star = order[order.length - 1], other = order[0];
  const tracks = { v: 1, generatedAt: 1, firstYear: 2014, circuits: { c13: { [star]: [[2020, -6], [2021, -5], [2026, -20]] }, c14: { [star]: [[2021, -4]], [other]: [[2019, 3], [2027, -9]] } } };

  const probe = p => p.evaluate(() => {
    const ctx = buildSimContext(), n = ctx.n;
    const res = fullRoster.map(windowResults), teams = fullRoster.map(d => d.active ? d.teamNow : null), form = fullRoster.map(() => []);
    const cur = fullRoster.map(d => { const c = d.results.filter(f => f != null); return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null; });
    const expect = (circuit) => F1RaceModel.weightMatrix(res, teams, fullRoster.map((d, i) => {
      const e = currentTracks && currentTracks.circuits[circuit] && currentTracks.circuits[circuit][d.driverId];
      return F1RaceModel.evidence(null, form[i], d.active ? F1RaceModel.trackPosition(e ? e.filter(x => x[0] < currentYear).map(x => x[1]) : [], cur[i], n) : null);
    }));
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
    const rounds = ctx.events.map(e => e.round + e.type[0]);
    const idx = r => ctx.events.findIndex(e => e.round === r && e.type === 'gp'), sidx = r => ctx.events.findIndex(e => e.round === r && e.type === 'sprint');
    return { rounds: rounds.join(' '), set: ctx.eventW ? ctx.eventW.map((w, i) => w ? rounds[i] : null).filter(Boolean).join(' ') : '',
      gp13: same(ctx.eventW && ctx.eventW[idx(13)], expect('c13')), gp14: same(ctx.eventW && ctx.eventW[idx(14)], expect('c14')), sp14: same(ctx.eventW && ctx.eventW[sidx(14)], expect('c14')),
      sameMatrix: !!ctx.eventW && ctx.eventW[idx(14)] === ctx.eventW[sidx(14)], base: same(ctx.W, expect('none')), hasEvents: !!ctx.eventW };
  });
  let p = await h.openPage('simulator', { grids: { 2026: grid }, tracks }); await h.loaded(p);
  let r = await probe(p);
  t.check('simulator: races at circuits with track history have their own weights (the 2026 entry and a future year are ignored), the others keep the base',
    r.gp13 && r.gp14 && r.base && r.set === '13g 14g 14s', JSON.stringify(r));
  t.check('…a sprint shares its Grand Prix\'s circuit weights', r.sp14 && r.sameMatrix);
  t.check('…the description mentions it', /done at the track before/.test(await p.textContent('#lede')));
  const hits = p.apiHits.length, th0 = p.trackHits.length;
  await p.click('#run'); await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent));
  await h.setRound(p, 11); await p.waitForTimeout(100);
  t.check('a run and moving the slider fetch nothing; the file was requested once with the season', p.apiHits.length === hits && p.trackHits.length === th0 && th0 === 1 && p.errors.length === 0, p.errors.join('; '));
  await p.done();

  p = await h.openPage('simulator', { grids: { 2026: grid }, tracks: null }); await h.loaded(p); r = await probe(p);
  t.check('simulator, no track file: nothing changes and there are no errors', !r.hasEvents && r.base && p.errors.length === 0, JSON.stringify(r));
  await p.done();

  const wi = async tr => {
    const q = await h.openPage('whatif', { grids: { 2026: grid }, tracks: tr }); await h.loaded(q);
    await q.evaluate(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; });
    await q.click('#useSim');
    const got = await q.$$eval('.wiList[data-session="gp"] > li', l => l.map(x => x.dataset.id || null));
    return { q, got };
  };
  const a = await wi(tracks), b = await wi(null);
  t.check('what-if: a driver with strong history at round 13\'s circuit is simulated further up than without the file', a.got.indexOf(star) < b.got.indexOf(star), `${a.got.indexOf(star)} vs ${b.got.indexOf(star)}`);
  t.check('what-if: no errors either way', a.q.errors.length === 0 && b.q.errors.length === 0);
  await a.q.done(); await b.q.done();
};
