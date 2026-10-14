// #60: f1api.dev is asked about rounds newer than the season file at most once a day per season, across the
// whole site. Other pages and season switches reuse that check; Refresh data checks again; a failed check
// isn't kept.
module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const full = await buildSnapshot(2026, fakeFetch, Date.now() - 3*60*60*1000); // 12 of 23 rounds
  const rounds = p => p.evaluate(() => JSON.stringify(F1Controls.state.seasonRounds));
  const go = async (p, name) => { await p.goto(`http://site.test/${name}.html`); await h.loaded(p); };
  const since = (p, n) => p.apiHits.slice(n).join(' ') || 'none';

  // First load checks the round after the file; other pages and season switches then don't.
  let p = await h.openPage('drivers', { snapshots: { 2026: full, 2025: { ...full, year: 2025, complete: true } } }); await h.loaded(p);
  const first = p.apiHits.length, firstRounds = await rounds(p);
  t.check('first load checks the round after the season file', first > 0 && p.apiHits.every(u => /\/2026\/13\//.test(u)), since(p, 0));
  for(const name of ['constructors', 'position', 'simulator', 'whatif', 'drivers']){
    await go(p, name);
    t.check(`${name}: no new check (reuses the first one)`, p.apiHits.length === first, since(p, first));
  }
  t.check('…with the same data', await rounds(p) === firstRounds);
  t.check('…and "updated" still says when the check was made', /updated just now/.test(await h.text(p, '.f1c-statusline')), await h.text(p, '.f1c-statusline'));
  await p.selectOption('.f1c-year', '2025'); await h.loaded(p);
  await p.selectOption('.f1c-year', '2026'); await h.loaded(p);
  t.check('switching season away and back: no new check', p.apiHits.length === first, since(p, first));
  t.check('…same data after switching back', await rounds(p) === firstRounds);

  // A day later, the next load checks again.
  await p.evaluate(() => { const k = 'f1cache:v2:2026/checked', e = JSON.parse(localStorage.getItem(k)); e.exp = Date.now() - 1; localStorage.setItem(k, JSON.stringify(e)); });
  await go(p, 'drivers');
  t.check('a day later the next load checks again', p.apiHits.length > first && p.apiHits.slice(first).every(u => /\/2026\/13\//.test(u)), since(p, first));
  const afterDay = p.apiHits.length;
  t.check('the check is remembered for a day', await p.evaluate(() => { const e = JSON.parse(localStorage.getItem('f1cache:v2:2026/checked')); return e.exp - Date.now() > 23.9*3600e3; }));

  // Refresh data checks right away.
  await p.click('.f1c-refresh'); await h.loaded(p);
  t.check('Refresh data checks right away', p.apiHits.length > afterDay, since(p, afterDay));
  const afterRefresh = p.apiHits.length;
  await go(p, 'constructors');
  t.check('…and the next page reuses that check', p.apiHits.length === afterRefresh, since(p, afterRefresh));
  t.check('daily check: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // A failed check isn't kept: the next load tries again, and then remembers the good one.
  let failing = true;
  p = await h.openPage('drivers', { snapshots: { 2026: full }, fail: u => failing && /\/2026\/13\//.test(u) }); await h.loaded(p);
  failing = false;
  const failedHits = p.apiHits.length;
  await go(p, 'drivers');
  t.check('after a failed check, the next load checks again', p.apiHits.length > failedHits, since(p, failedHits));
  const okHits = p.apiHits.length;
  await go(p, 'position');
  t.check('…and after it succeeds, the next page doesn\'t', p.apiHits.length === okHits, since(p, okHits));
  await p.done();

  // A newer season file still shows up without a check: the remembered rounds are dropped where the file covers them.
  const snaps = { 2026: { ...full, rounds: full.rounds.slice(0, 10) } };
  p = await h.openPage('drivers', { snapshots: snaps }); await h.loaded(p);
  const behindHits = p.apiHits.length;
  snaps[2026] = full; // the scheduled job updated the file
  await go(p, 'drivers');
  t.check('newer season file: no check, same 12 rounds', p.apiHits.length === behindHits && await rounds(p) === firstRounds, since(p, behindHits));
  await p.done();

  // No season file (live fallback): the whole season's check is reused too.
  p = await h.openPage('position'); await h.loaded(p);
  const liveHits = p.apiHits.length, liveRounds = await rounds(p);
  await go(p, 'simulator');
  // (the simulator still asks for the calendar once, since there's no season file to carry it)
  t.check('no season file: the next page asks f1api.dev for no rounds', liveHits > 20 && !p.apiHits.slice(liveHits).some(u => /\/2026\/\d+\//.test(u)), `${liveHits} then ${since(p, liveHits)}`);
  t.check('…with the same data', await rounds(p) === liveRounds && liveRounds === firstRounds);
  t.check('live fallback: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
