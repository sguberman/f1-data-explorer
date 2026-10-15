// #59: 2021–2023 are patched from Jolpica (the Ergast successor) for what f1api.dev lacks there: sprint results
// and who wasn't classified. Round trip: take the fake season, strip it the way f1api.dev's 2021–23 data looks
// (no sprints, every driver numbered), patch it from a fake Jolpica built from the original, and it must come
// back exactly. Mismatches between the two sources leave the season alone.
module.exports = async (t, h) => {
  const { buildSnapshot, patchFromJolpica, PATCH_YEARS } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const original = await buildSnapshot(2026, fakeFetch, 0);
  const clone = o => JSON.parse(JSON.stringify(o));

  // f1api.dev's 2021–23 shape: no sprints, and every driver numbered in finishing order.
  const degrade = s => { const d = clone(s);
    d.rounds.forEach(r => { r.sprintResults = null; let n = r.raceResults.filter(q => q.position).length;
      r.raceResults.forEach(q => { if(q.position === null) q.position = ++n; }); });
    return d; };
  // A fake Jolpica: Ergast-style JSON, 100 rows a page (so races split across pages), positionText "R" when not classified.
  const jolpicaFrom = (s, tweak = {}) => async url => {
    const m = url.match(/\/f1\/(\d{4})\/(results|sprint)\.json\?limit=(\d+)&offset=(\d+)/);
    if(!m) return { ok: false, status: 404, json: async () => ({}) };
    const [, , kind, limit, offset] = m, key = kind === 'sprint' ? 'SprintResults' : 'Results';
    const rows = [];
    s.rounds.forEach(r => (kind === 'sprint' ? r.sprintResults || [] : r.raceResults).forEach((q, i) => rows.push({ round: r.round, row: {
      position: String(i + 1), positionText: q.position == null ? 'R' : String(q.position), points: String(q.points),
      Driver: { driverId: (tweak.rename && tweak.rename[q.driverId]) || q.driverId, code: q.code }, Constructor: { constructorId: q.teamId } } })));
    const page = rows.slice(+offset, +offset + +limit), races = [];
    page.forEach(({ round, row }) => { let r = races.find(x => x.round === String(round)); if(!r) races.push(r = { round: String(round), [key]: [] }); r[key].push(row); });
    return { ok: true, status: 200, json: async () => ({ MRData: { total: String(rows.length), limit, offset, RaceTable: { Races: races } } }) };
  };

  t.check('patches 2021, 2022 and 2023', JSON.stringify(PATCH_YEARS) === '[2021,2022,2023]');
  const degraded = degrade(original);
  t.check('(test setup) the stripped season has no sprints and no unclassified drivers',
    degraded.rounds.every(r => !r.sprintResults && r.raceResults.every(q => q.position)) && original.rounds.some(r => r.sprintResults));
  let calls = 0;
  const counted = f => async url => { calls++; return f(url); };
  const { snap, report } = await patchFromJolpica(degraded, counted(jolpicaFrom(original)));
  t.check('round trip: the patched season equals the original (sprints back, "not classified" back)',
    JSON.stringify(snap.rounds) === JSON.stringify(original.rounds), JSON.stringify(report));
  t.check('…reporting what it changed', report.sprints === original.rounds.filter(r => r.sprintResults).length
    && report.nc === original.rounds.flatMap(r => r.raceResults).filter(q => q.position === null).length && report.pointsChanged === 0, JSON.stringify(report));
  t.check('…and marking the file as patched', snap.patched && snap.patched.source === 'jolpica' && snap.patched.version === 1);
  t.check('reads every page (races split across pages)', calls > 2, String(calls));

  // Mismatches: nothing is patched.
  const fails = async (label, f, s = degraded) => { let err = null; try{ await patchFromJolpica(s, f); }catch(e){ err = e.message; } t.check(label, !!err, err || 'no error'); };
  const someone = original.rounds[0].raceResults[0].driverId;
  await fails('a driver Jolpica doesn\'t know stops the patch', jolpicaFrom(original, { rename: { [someone]: 'nobody' } }));
  const noSprints = clone(original); noSprints.rounds.forEach(r => { r.sprintResults = null; });
  await fails('sprints that don\'t match the calendar stop the patch', jolpicaFrom(noSprints));
  await fails('Jolpica being down stops the patch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
  t.check('the original snapshot object is never changed', degraded.rounds.every(r => !r.sprintResults));
};
