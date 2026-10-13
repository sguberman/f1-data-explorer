// issue #39: the simulator's DNF modeling. Untracked drivers retire at their own DNF rate this season
// (any cause); tracked drivers retire only as often as their DNF stepper says; the finishing-position
// data the race orders are drawn from only covers races a driver finished.
module.exports = async (t, h) => {
  const p = await h.openPage('simulator'); await h.loaded(p);

  // DNF rate and finish histogram vs an independent calculation from the raw results.
  const r = await p.evaluate(() => {
    const exp = {};
    F1Controls.state.seasonRounds.filter(x => x.round <= L).forEach(x => x.raceResults.forEach(q => {
      const e = exp[q.driverId] = exp[q.driverId] || {starts:0, dnfs:0, finishes:0};
      e.starts++;
      if(Number.isFinite(q.position) && q.position >= 1 && !q.mechanical) e.finishes++; else e.dnfs++;
    }));
    return fullRoster.map(d => ({ id:d.driverId, rate:d.dnfRate, histTotal:d.posHist.reduce((a,b)=>a+b,0), exp:exp[d.driverId] }));
  });
  const badRate = r.filter(d => Math.abs(d.rate - d.exp.dnfs / d.exp.starts) > 1e-9);
  t.check('DNF rate = DNFs of any cause / Grand Prix starts', badRate.length === 0, JSON.stringify(badRate.slice(0,2)));
  const badHist = r.filter(d => d.histTotal !== d.exp.finishes);
  t.check('finishing-position data counts only finished races', badHist.length === 0, JSON.stringify(badHist.slice(0,2)));
  t.check('the fake season has drivers with non-mechanical DNFs (so the checks above mean something)', r.some(d => d.exp.dnfs > 0 && d.rate > 0));

  // DNF sets: tracked drivers get exactly their stepper count; untracked follow their rate.
  const s = await p.evaluate(() => {
    const E = remainingEvents.length, trials = 4000;
    const tracked = fullRoster[0], untracked = fullRoster.find(d => d.dnfRate > 0);
    const zeroRate = { ...untracked, driverId:'zero-rate', dnfRate:0 };
    const trackedSet = new Set([tracked.driverId]);
    const out = { E, k0:[], k3:[], zero:0, untrackedDnfs:0, rate:untracked.dnfRate };
    dnfState[tracked.driverId] = 0;
    for(let i = 0; i < 200; i++) out.k0.push(buildDnfSets([tracked], trackedSet, E)[0].size);
    dnfState[tracked.driverId] = 3;
    for(let i = 0; i < 200; i++) out.k3.push(buildDnfSets([tracked], trackedSet, E)[0].size);
    dnfState[tracked.driverId] = 0;
    for(let i = 0; i < trials; i++){
      const [u, z] = buildDnfSets([untracked, zeroRate], trackedSet, E);
      out.untrackedDnfs += u.size; out.zero += z.size;
    }
    out.untrackedRate = out.untrackedDnfs / (trials * E);
    return out;
  });
  t.check('tracked driver set to 0 DNFs never retires', s.k0.every(n => n === 0));
  t.check('tracked driver set to 3 DNFs retires in exactly 3 events', s.k3.every(n => n === 3));
  t.check('untracked driver with a 0% DNF rate never retires', s.zero === 0);
  t.check('untracked driver retires at about their DNF rate', Math.abs(s.untrackedRate - s.rate) < 0.02,
    `simulated ${s.untrackedRate.toFixed(3)} vs actual ${s.rate.toFixed(3)}`);

  // End to end: a tracked driver set to retire from every remaining event can't add any points.
  const e2e = await p.evaluate(async () => {
    const d = fullRoster.find(x => (selectedDriverIds||[]).includes(x.driverId));
    dnfState[d.driverId] = remainingEvents.length;
    document.getElementById('n').value = '2000';
    document.getElementById('run').click();
    for(let i = 0; i < 100 && !/seasons simulated/.test(document.getElementById('status').textContent); i++)
      await new Promise(res => setTimeout(res, 100));
    const i = lastTrackedRoster.findIndex(x => x.driverId === d.driverId);
    return { now:d.now, finals:[...new Set(lastFinals[i])] };
  });
  t.check('a tracked driver retiring from every event keeps their current points', e2e.finals.length === 1 && e2e.finals[0] === e2e.now, JSON.stringify(e2e));
  t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
