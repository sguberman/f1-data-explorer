// #186: F1OpenF1, the Weekend Pace page's data layer — grouping sessions into weekends, finding a round's weekend, joining laps with stints
// and drivers, which laps count as pace, best sectors and the ideal lap, top speeds, bins and number formats. Pure functions, run in Node.
const O = require('../site/openf1.js');
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // ---- weekends ----
  const wk = O.weekends(fx.SESSIONS);
  t.check('three weekends in date order; pre-season testing is not one', wk.length === 3 && wk.map(w => w.label).join() === 'Silverstone,Budapest,Zandvoort', wk.map(w => w.label).join());
  t.check('practice, qualifying and the Race are kept, in time order', wk[2].sessions.map(s => s.short).join() === 'FP1,FP2,FP3,Quali,Race', wk[2].sessions.map(s => s.short).join());
  t.check('a cancelled session is left out', O.weekends([{ ...fx.SESSIONS[1], is_cancelled: true }]).length === 0);
  t.check('sprint sessions are kept and named', O.weekends([{ ...fx.SESSIONS[1], session_name: 'Sprint Qualifying' }, { ...fx.SESSIONS[2], session_name: 'Sprint' }])[0].sessions.map(s => s.short).join() === 'Sprint Quali,Sprint');
  const now = Date.parse(fx.NOW);
  t.check('opens the latest weekend that has started', O.defaultWeekend(wk, now).label === 'Zandvoort');
  t.check('before the season, the first weekend', O.defaultWeekend(wk, Date.parse('2026-01-01')).label === 'Silverstone');
  t.check('opens the latest session that has started (FP2 on Friday evening)', O.defaultSession(wk[2], now).short === 'FP2');
  t.check('…and the Race once the weekend is over', O.defaultSession(wk[1], now).short === 'Race');

  // ---- a round's weekend ----
  const cal = { raceDates: { 11: '2026-07-19', 12: '2026-08-02', 13: '2026-08-30' } };
  t.check('a round finds the weekend that ends with its Grand Prix', [11, 12, 13].map(r => O.weekendForRound(wk, cal, r).label).join() === 'Silverstone,Budapest,Zandvoort');
  t.check('a round with no weekend near its date has none', O.weekendForRound(wk, { raceDates: { 5: '2026-04-26' } }, 5) === null);
  t.check('a weekend a day after the date still counts, one a week before does not', O.weekendForRound(wk, { raceDates: { 1: '2026-07-18' } }, 1)?.label === 'Silverstone' && O.weekendForRound(wk, { raceDates: { 1: '2026-08-12' } }, 1) === null);
  t.check('with no calendar dates the round’s place in the list is used', O.weekendForRound(wk, null, 2).label === 'Budapest' && O.weekendForRound(wk, {}, 9) === null);

  // ---- joining ----
  const m = O.build(fx.lapsFor(202), fx.stintsFor(202), fx.driversFor(202));
  t.check('six drivers, 66 laps', m.drivers.length === 6 && m.laps.length === 66, `${m.drivers.length} ${m.laps.length}`);
  t.check('a reserve who drives FP1 only is in FP1 only', O.build(fx.lapsFor(201), fx.stintsFor(201), fx.driversFor(201)).drivers.length === 7 && !m.drivers.some(d => d.code === 'ZZZ'));
  t.check('a driver with no laps is dropped', O.build(fx.lapsFor(202).filter(l => l.driver_number !== 16), fx.stintsFor(202), fx.driversFor(202)).drivers.length === 5);
  t.check('team colour gets a #', m.drivers[0].color === '#111111' && m.drivers[0].code === 'DA0' && m.drivers[0].team === 'Mercedes');
  const lap = (d, n) => m.laps.find(l => l.d === d && l.n === n);
  t.check('lap 3 is on softs, 2 laps into the stint', lap(63, 3).c === 'SOFT' && lap(63, 3).age === 2, JSON.stringify(lap(63, 3)));
  t.check('lap 9 is on mediums that were already 3 laps old at the start (3 + 2)', lap(63, 9).c === 'MEDIUM' && lap(63, 9).age === 5, JSON.stringify(lap(63, 9)));
  t.check('the last lap of the first stint is an in lap; the last lap of the last stint is not', lap(63, 6).inn && !lap(63, 11).inn && !lap(63, 5).inn);
  t.check('pit-out laps are flagged', lap(63, 1).out && lap(63, 7).out && !lap(63, 2).out);
  t.check('a missing time stays null', lap(81, 4).t === null && lap(1, 3).s[0] === null && lap(1, 3).t !== null);
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
  t.check('drivers are sorted fastest best lap first', ds.map(e => e.label).join() === 'DA0,DA1,DB0,DB1,DC0,DC1' && ds[0].best <= ds[1].best, ds.map(e => e.label).join());
  t.check('without the page’s ids, OpenF1’s numbers and team names are used', ds[0].id === '63' && ts.map(e => e.id).join() === 'Mercedes,Ferrari,McLaren');
  t.check('teams pool their drivers', ts.length === 3 && ts[0].label === 'Mercedes' && ts[0].nums.join() === '63,12' && ts[0].drivers.length === 2);
  const site = O.build(fx.lapsFor(202), fx.stintsFor(202), fx.driversFor(202));
  site.drivers.forEach(d => Object.assign(d, { id: 'x_' + d.code, teamId: 'team_' + d.team, teamLabel: 'T ' + d.team, color: '#abcdef' }));
  t.check('with the page’s ids (the site’s driver and team ids, short team names and colours) those are used', O.entities(site, 'drivers')[0].id === 'x_DA0' && O.entities(site, 'drivers')[0].color === '#abcdef' &&
    O.entities(site, 'teams')[0].id === 'team_Mercedes' && O.entities(site, 'teams')[0].label === 'T Mercedes' && O.entities(site, 'drivers')[0].teamId === 'team_Mercedes');
  const s = O.stats(O.lapsOf(m, ds[0]));
  t.check('ideal lap is the three best sectors added', near(s.ideal, s.sec[0] + s.sec[1] + s.sec[2]) && s.sec.every(v => v > 0));
  t.check('the ideal lap is quicker than the best lap (the bests come from different laps)', s.gap > 0 && near(s.gap, s.best - s.ideal), JSON.stringify(s));
  t.check('best sectors are minimums over every lap', s.sec[0] === Math.min(...m.laps.filter(l => l.d === 63).map(l => l.s[0])));
  t.check('top speeds are maximums', s.st === Math.max(...m.laps.filter(l => l.d === 63).map(l => l.st)) && s.i1 === 280 && s.i2 === 201, JSON.stringify([s.st, s.i1, s.i2]));
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
  t.check('speeds: km/h as they are, mph to the nearest 0.1', O.speedIn(321, 'kmh') === 321 && O.speedIn(321, 'mph') === 199.5 && O.speedIn(100, 'mph') === 62.1 && O.speedIn(null, 'mph') === null);

  // ---- qualifying parts, lap start times ----
  t.check('qualifying and sprint qualifying are told from other sessions', O.isQualifying('Qualifying') && O.isQualifying('Sprint Qualifying') && O.isQualifying('Sprint Shootout') && !O.isQualifying('Sprint') && !O.isQualifying('Race') && !O.isQualifying('Practice 1'));
  const rc = fx.raceControlFor(204), seg = O.qualiSegments(rc, false), mins = (x, k) => (x - Date.parse(fx.SESSIONS.find(q => q.session_key === k).date_start)) / 60000;
  t.check('three parts from the race control messages, a red flag and restart inside Q1 does not make a fourth', seg.map(g => g.label).join() === 'Q1,Q2,Q3' && seg.map(g => [mins(g.from, 204), mins(g.to, 204)].join('-')).join() === '0-18,25-40,47-60', JSON.stringify(seg));
  t.check('sprint qualifying parts are SQ1…', O.qualiSegments(rc, true).map(g => g.label).join() === 'SQ1,SQ2,SQ3' && O.qualiSegments([], false).length === 0 && O.qualiSegments(null, false).length === 0);
  t.check('a part still running (no finish yet) ends at the last message', O.qualiSegments(rc.slice(0, 7), false).length === 2 && O.qualiSegments(rc.slice(0, 1), false).length === 1);
  const q = O.build(fx.lapsFor(204), fx.stintsFor(204), fx.driversFor(204));
  t.check('every lap has the time it started', q.laps.every(l => l.at > 0) && mins(q.laps.find(l => l.d === 63 && l.n === 1).at, 204) === 0 && mins(q.laps.find(l => l.d === 63 && l.n === 5).at, 204) === 25 && mins(q.laps.find(l => l.d === 63 && l.n === 9).at, 204) === 47);
};
