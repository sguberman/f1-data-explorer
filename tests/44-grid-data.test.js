// #158: qualifying and starting-grid files (site/data/grid/{year}.json, tools/qualifying-snapshot.mjs). The generator turns
// Jolpica's tables into per-round qualifying rows and a grid map (fake Jolpica here), and the committed files line up with
// the season files. Plain Node, no browser.
const fs = require('fs'), path = require('path');
module.exports = async (t, h) => {
  const { buildGrid, lapMs, FIRST_YEAR } = await import('../tools/qualifying-snapshot.mjs');

  t.check('lap times to milliseconds', lapMs('1:30.031') === 90031 && lapMs('59.9') === 59900 && lapMs('2:01.005') === 121005 && lapMs('') === null && lapMs(undefined) === null && lapMs('DNF') === null);

  // ---- The generator, with fake Jolpica data: a 2-round season of which round 1 has happened ----
  const drv = (id, code) => ({ driverId: id, code });
  const con = id => ({ constructorId: id });
  const race = (round, extra) => ({ season: '2030', round: String(round), raceName: `Race ${round}`, ...extra });
  const tables = {
    results: [race(1, { Results: [{ grid: '2', Driver: drv('x_one', 'ONE'), Constructor: con('a') }, { grid: '0', Driver: drv('x_two', 'TWO'), Constructor: con('b') }, { grid: '1', Driver: drv('x_new', 'NEW'), Constructor: con('b') }] })],
    qualifying: [race(1, { QualifyingResults: [
      { position: '1', Driver: drv('x_new', 'NEW'), Constructor: con('b'), Q1: '1:30.100', Q2: '1:29.500', Q3: '1:28.900' },
      { position: '2', Driver: drv('x_one', 'ONE'), Constructor: con('a'), Q1: '1:30.500', Q2: '1:29.900', Q3: '1:29.001' },
      { position: '3', Driver: drv('x_two', 'TWO'), Constructor: con('b'), Q1: '1:31.000' }] })],
    '': [race(1, {}), race(2, {})],
  };
  const urls = [];
  const fake = async url => {
    urls.push(url);
    const m = /\/2030(?:\/(results|qualifying))?\.json\?limit=100&offset=0$/.exec(url);
    if (!m) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ MRData: { total: String(tables[m[1] || ''].length), limit: '100', RaceTable: { Races: tables[m[1] || ''] } } }) };
  };
  const g = await buildGrid(2030, fake, { now: 1, canon: d => d.driverId === 'x_new' ? 'new_driver' : d.driverId });
  const r1 = g.rounds[0];
  t.check('one round with results gives one round', g.rounds.length === 1 && r1.round === 1 && r1.raceName === 'Race 1');
  t.check('a season with a round still to come is not complete', g.complete === false);
  t.check('grid: starting positions per driver, pit lane as 0, the canon map applied', JSON.stringify(r1.grid) === JSON.stringify({ x_one: 2, x_two: 0, new_driver: 1 }), JSON.stringify(r1.grid));
  t.check('qualifying: position, team and times in ms; no Q2/Q3 gives null', JSON.stringify(r1.qualifying.map(q => [q.driverId, q.teamId, q.position, q.q1, q.q2, q.q3])) ===
    JSON.stringify([['new_driver', 'b', 1, 90100, 89500, 88900], ['x_one', 'a', 2, 90500, 89900, 89001], ['x_two', 'b', 3, 91000, null, null]]), JSON.stringify(r1.qualifying));
  t.check('three tables fetched', urls.length === 3 && urls.every(u => /^https:\/\/api\.jolpi\.ca\/ergast\/f1\/2030/.test(u)), urls.join(' '));
  let failed = false; try { await buildGrid(2030, async () => ({ ok: false, status: 500 }), { wait: async () => {} }); } catch (e) { failed = true; }
  t.check('a failing source throws (so no file is overwritten)', failed);

  // ---- The committed files against the season files ----
  const dir = path.join(__dirname, '..', 'site', 'data');
  let starts = 0, withGrid = 0, bad = [];
  const last = Math.max(...fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)));
  for (let y = FIRST_YEAR; y <= last; y++) {
    const file = path.join(dir, 'grid', `${y}.json`);
    if (!fs.existsSync(file)) { bad.push(`${y}: no file`); continue; }
    const gf = JSON.parse(fs.readFileSync(file, 'utf8')), sf = JSON.parse(fs.readFileSync(path.join(dir, `${y}.json`), 'utf8'));
    if (gf.year !== y || gf.v !== 1) bad.push(`${y}: header`);
    const sr = sf.rounds.map(r => r.round), have = gf.rounds.map(r => r.round);
    // the season file's rounds, then (#167) any upcoming round that has qualifying but no results yet and so an empty grid
    if (have.slice(0, sr.length).join() !== sr.join() || gf.rounds.slice(sr.length).some(r => Object.keys(r.grid).length || !r.qualifying.length)) bad.push(`${y}: rounds differ`);
    for (const r of gf.rounds) {
      if (!r.qualifying.length) bad.push(`${y} R${r.round}: no qualifying`);
      if (!r.circuitId) bad.push(`${y} R${r.round}: no circuit id`);
      if (r.qualifying.some(q => !Number.isInteger(q.position) || q.position < 1 || (q.q1 != null && !Number.isInteger(q.q1)))) bad.push(`${y} R${r.round}: qualifying row`);
      if (!Object.values(r.grid).every(v => Number.isInteger(v) && v >= 0)) bad.push(`${y} R${r.round}: grid`);
      const srnd = sf.rounds.find(x => x.round === r.round);
      if (srnd) for (const id of new Set(srnd.raceResults.map(x => x.driverId))) { starts++; if (id in r.grid) withGrid++; }
    }
  }
  t.check('every season 2014 on has a grid file with the season file\'s rounds, qualifying and a clean grid', bad.length === 0, bad.slice(0, 6).join('; '));
  t.check('nearly every driver in the season files has a starting grid position', withGrid / starts > 0.99, `${withGrid} of ${starts}`);
};
