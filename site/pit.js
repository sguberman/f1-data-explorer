// F1Pit (#203): pit stop times (time in the box) from the saved OpenF1 /pit rows, and the pure helpers behind pit.html (also `require`d by Node tests).
// OpenF1's /pit has `stop_duration` (the car standing still in its box: the time we show) and `lane_duration` (pit lane entry to exit). Box time is missing
// before 2025 and for some stops since, so every figure says how many of the stops were timed.
const F1Pit = (() => {
  const FIRST_YEAR = 2025; // the first season with box times
  const LONG = 10; // seconds: a stop over this is a repair or a penalty rather than a pit stop, left out of the figures unless "Include long stops" is on
  const KINDS = ['Race', 'Sprint'];

  // ---- the saved file, written by tools/pit-snapshot.mjs ----
  // site/data/pit/{year}.json = {v:1, year, generatedAt, sessions:[{key, meeting, name:'Race'|'Sprint', start, location, drivers:[[number, code]], stops:[[number, lap, box s|null, lane s|null]]}]}
  const num = x => typeof x === 'number' && isFinite(x) ? x : null;
  function compact(pit, drivers, meta){
    const stops = (pit || []).filter(r => r && r.driver_number != null && r.lap_number != null)
      .sort((a, b) => (a.lap_number - b.lap_number) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(r => [r.driver_number, r.lap_number, num(r.stop_duration), num(r.lane_duration != null ? r.lane_duration : r.pit_duration)]);
    const seen = new Map();
    (drivers || []).forEach(d => { if(d.driver_number != null && d.name_acronym && !seen.has(d.driver_number)) seen.set(d.driver_number, d.name_acronym); });
    return { key: meta.key, meeting: meta.meeting, name: meta.name, start: meta.start, location: meta.location, drivers: [...seen], stops };
  }

  // ---- sessions to rounds ----
  // The championship round a saved session belongs to: the calendar round whose Grand Prix date is from a day before to two days after the session's start
  // (a Sprint is a day before its Grand Prix, a Race the same day; races are a week apart). null when none fits.
  function roundOf(start, calendar){
    const dates = calendar && calendar.raceDates; if(!dates) return null;
    const at = Date.parse(start), DAY = 864e5;
    for(const r of Object.keys(dates)){
      const d = Date.parse(dates[r] + 'T12:00:00Z') - at;
      if(d >= -DAY && d <= 2 * DAY) return +r;
    }
    return null;
  }

  // ---- every stop of a season, with its driver and team ----
  // The team is the driver's team in that round's results. Stops are numbered per driver and session, in lap order. A driver who is not in the round's
  // results (a session OpenF1 has a stop for, but the site has no result for) is left out.
  // → [{round, kind, key, number, code, driverId, name, teamId, teamName, lap, n, stop, lane, long}]
  function stopsOf(file, calendar, rounds){
    const out = [];
    (file && file.sessions || []).forEach(s => {
      const round = roundOf(s.start, calendar), res = round && (rounds || []).find(r => r.round === round);
      if(!res || !res.raceResults || !res.raceResults.length) return;
      const code = new Map(s.drivers), byCode = new Map(res.raceResults.map(x => [x.code, x])), count = new Map();
      s.stops.forEach(([number, lap, stop, lane]) => {
        const c = code.get(number), d = c && byCode.get(c); if(!d) return;
        const n = (count.get(number) || 0) + 1; count.set(number, n);
        out.push({ round, kind: s.name, key: s.key, number, code: c, driverId: d.driverId, name: d.name, teamId: d.teamId, teamName: d.teamName, lap, n, stop, lane, long: stop != null && stop > LONG });
      });
    });
    return out;
  }

  // ---- what is in view ----
  // scope = {from, to (rounds, inclusive), kinds: Set of 'Race'/'Sprint', longs: include stops over LONG}
  // → {inView: the stops in those rounds and sessions, used: the ones the figures are made from, untimed, long: how many were left out}
  function select(stops, { from = 1, to = 999, kinds = new Set(KINDS), longs = false } = {}){
    const inView = stops.filter(s => s.round >= from && s.round <= to && kinds.has(s.kind));
    const used = inView.filter(s => s.stop != null && (longs || !s.long));
    return { inView, used, untimed: inView.filter(s => s.stop == null).length, long: longs ? 0 : inView.filter(s => s.long).length };
  }

  const median = a => { if(!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  // Figures per driver or team: {id, label, color id (teamId), n (timed stops used), total (all stops in view), fastest, mean, median, best (the fastest stop)}
  // by 'drivers' | 'teams'. Everyone with a stop in view is listed, also with no timed one (their figures are null).
  function aggregate(view, by){
    const key = s => by === 'teams' ? s.teamId : s.driverId, rows = new Map();
    view.inView.forEach(s => {
      if(!rows.has(key(s))) rows.set(key(s), { id: key(s), label: by === 'teams' ? s.teamName : s.name, code: by === 'teams' ? null : s.code, teamId: s.teamId, total: 0, times: [], best: null });
      rows.get(key(s)).total++;
    });
    view.used.forEach(s => { const r = rows.get(key(s)); r.times.push(s.stop); if(!r.best || s.stop < r.best.stop) r.best = s; });
    return [...rows.values()].map(r => ({ id: r.id, label: r.label, code: r.code, teamId: r.teamId, total: r.total, n: r.times.length,
      fastest: r.times.length ? Math.min(...r.times) : null, mean: mean(r.times), median: median(r.times), best: r.best }));
  }

  // The statistic per round, for the trend: {rounds: [round numbers in view that have a stop], series: {id: [value|null per round]}}
  function perRound(view, by, stat){
    const key = s => by === 'teams' ? s.teamId : s.driverId, rounds = [...new Set(view.inView.map(s => s.round))].sort((a, b) => a - b);
    const series = {};
    view.used.forEach(s => { (series[key(s)] = series[key(s)] || {}); (series[key(s)][s.round] = series[key(s)][s.round] || []).push(s.stop); });
    const f = { mean, median, fastest: a => a.length ? Math.min(...a) : null }[stat] || mean;
    return { rounds, series: Object.fromEntries(Object.entries(series).map(([id, byRound]) => [id, rounds.map(r => byRound[r] ? f(byRound[r]) : null)])) };
  }

  const fmt = (x, digits = 1) => x == null ? '–' : x.toFixed(digits);
  const api = { FIRST_YEAR, LONG, KINDS, compact, roundOf, stopsOf, select, aggregate, perRound, median, mean, fmt };
  return api;
})();
if(typeof module !== 'undefined' && module.exports) module.exports = F1Pit; // Node (the tests, tools/pit-snapshot.mjs)
