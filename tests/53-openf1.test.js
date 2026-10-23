// #186: F1OpenF1, the Weekend Pace page's data layer — grouping sessions into weekends, joining laps with stints and drivers,
// which laps count as pace, best sectors and the ideal lap, top speeds, bins and number formats. Pure functions, run in Node.
const O = require('../site/openf1.js');
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // ---- weekends ----
  const wk = O.weekends(fx.SESSIONS);
  t.check('two weekends, in date order', wk.length === 2 && wk[0].label === 'Marina Bay' && wk[1].label === 'Austin', wk.map(w => w.label).join());
  t.check('the Race is left out; practice and qualifying are kept, in time order', wk[1].sessions.map(s => s.short).join() === 'FP1,FP2,FP3,Quali', wk[1].sessions.map(s => s.short).join());
  t.check('a cancelled session is left out', O.weekends([{ ...fx.SESSIONS[0], is_cancelled: true }]).length === 0);
  t.check('sprint sessions are kept and named', O.weekends([{ ...fx.SESSIONS[0], session_name: 'Sprint Qualifying' }, { ...fx.SESSIONS[1], session_name: 'Sprint' }])[0].sessions.map(s => s.short).join() === 'Sprint Quali,Sprint');
  const now = Date.parse(fx.NOW);
  t.check('opens the latest weekend that has started', O.defaultWeekend(wk, now).label === 'Austin');
  t.check('before the season, the first weekend', O.defaultWeekend(wk, Date.parse('2026-01-01')).label === 'Marina Bay');
  t.check('opens the latest session that has started (FP2 on Thursday night)', O.defaultSession(wk[1], now).short === 'FP2');
  t.check('…and the last one once the weekend is over', O.defaultSession(wk[0], now).short === 'Quali');

  // ---- joining ----
  const m = O.build(fx.lapsFor(202), fx.stintsFor(202), fx.driversFor(202));
  t.check('six drivers, 66 laps', m.drivers.length === 6 && m.laps.length === 66, `${m.drivers.length} ${m.laps.length}`);
  t.check('a driver with no laps is dropped', O.build(fx.lapsFor(202).filter(l => l.driver_number !== 3), fx.stintsFor(202), fx.driversFor(202)).drivers.length === 5);
  t.check('team colour gets a #', m.drivers[0].color === '#FF0000' && m.drivers[0].code === 'AAA' && m.drivers[0].team === 'Alpha');
  const lap = (d, n) => m.laps.find(l => l.d === d && l.n === n);
  t.check('lap 3 is on softs, 2 laps into the stint', lap(1, 3).c === 'SOFT' && lap(1, 3).age === 2, JSON.stringify(lap(1, 3)));
  t.check('lap 9 is on mediums that were already 3 laps old at the start (3 + 2)', lap(1, 9).c === 'MEDIUM' && lap(1, 9).age === 5, JSON.stringify(lap(1, 9)));
  t.check('the last lap of the first stint is an in lap; the last lap of the last stint is not', lap(1, 6).inn && !lap(1, 11).inn && !lap(1, 5).inn);
  t.check('pit-out laps are flagged', lap(1, 1).out && lap(1, 7).out && !lap(1, 2).out);
  t.check('a missing time stays null', lap(6, 4).t === null && lap(5, 3).s[0] === null && lap(5, 3).t !== null);
  t.check('laps without stints get no tyre', O.build(fx.lapsFor(202), [], fx.driversFor(202)).laps.every(l => l.c === null));

  // ---- pace laps ----
  const best = O.sessionBest(m.laps);
  t.check('the session best is the fastest timed lap', best === Math.min(...m.laps.map(l => l.t).filter(v => v != null)));
  const pl = O.pace(m.laps);
  t.check('pace laps: no pit-out, in or untimed laps, and no slow cool-down lap', pl.every(l => !l.out && !l.inn && l.t != null && l.t <= best * O.SLOW) && !pl.some(l => l.n === 11), String(pl.length));
  t.check('6 drivers × 7 push laps, less the untimed one', pl.length === 41, String(pl.length));
  t.check('"include slow laps" brings back the cool-down laps (not the out, in or untimed ones)', O.pace(m.laps, { slow: true }).length === 41 + 6 && O.pace(m.laps, { slow: true }).every(l => !l.out && !l.inn && l.t != null));
  t.check('a session with no laps has no best', O.sessionBest([]) === null && O.pace([]).length === 0);

  // ---- entities, stats ----
  const ds = O.entities(m, 'drivers'), ts = O.entities(m, 'teams');
  t.check('drivers are sorted fastest best lap first', ds.map(e => e.label).join() === 'AAA,BBB,CCC,DDD,EEE,FFF' && ds[0].best <= ds[1].best, ds.map(e => e.label).join());
  t.check('teams pool their drivers', ts.length === 3 && ts[0].label === 'Alpha' && ts[0].nums.join() === '1,2' && ts[0].drivers.length === 2);
  const s = O.stats(O.lapsOf(m, ds[0]));
  t.check('ideal lap is the three best sectors added', near(s.ideal, s.sec[0] + s.sec[1] + s.sec[2]) && s.sec.every(v => v > 0));
  t.check('the ideal lap is quicker than the best lap (the bests come from different laps)', s.gap > 0 && near(s.gap, s.best - s.ideal), JSON.stringify(s));
  t.check('best sectors are minimums over every lap', s.sec[0] === Math.min(...m.laps.filter(l => l.d === 1).map(l => l.s[0])));
  t.check('top speeds are maximums', s.st === Math.max(...m.laps.filter(l => l.d === 1).map(l => l.st)) && s.i1 === 280 && s.i2 === 201, JSON.stringify([s.st, s.i1, s.i2]));
  const noS1 = O.stats(O.lapsOf(m, ds[4]));
  t.check('a missing sector time on one lap does not stop the ideal lap', noS1.ideal != null && noS1.n === 11);
  t.check('with a sector never timed there is no ideal lap', O.stats([{ t: 90, s: [28, null, 27], st: null, i1: null, i2: null }]).ideal === null && O.stats([]).best === null);
  const team = O.stats(O.lapsOf(m, ts[0]));
  t.check('a team’s bests are the better of its drivers', team.best === Math.min(O.stats(O.lapsOf(m, ds[0])).best, O.stats(O.lapsOf(m, ds[1])).best) && team.n === 22);

  // ---- bins and formats ----
  t.check('bins count laps and clamp the ends', JSON.stringify(O.bin([90.0, 90.05, 90.1, 89, 99], 90, 0.1, 3)) === '[3,1,1]', JSON.stringify(O.bin([90.0, 90.05, 90.1, 89, 99], 90, 0.1, 3)));
  t.check('bin width: about 24 bins, never under 0.1 s', O.binWidth(90, 91) === 0.1 && O.binWidth(90, 96) === 0.3 && O.binWidth(90, 90) === 0.1);
  t.check('lap time format', O.fmt(83.456) === '1:23.456' && O.fmt(65.0) === '1:05.000' && O.fmt(28.1234) === '28.123' && O.fmt(83.456, 1) === '1:23.5' && O.fmt(null) === '–');
  t.check('gap format', O.gapText(0.0614) === '+0.061' && O.gapText(-0.2) === '−0.200' && O.gapText(null) === '–');
};
