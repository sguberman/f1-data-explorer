// #13: seasons load from one file (site/data/{year}.json) instead of ~2 f1api.dev requests per round. A
// complete season needs no f1api.dev requests; an in-progress one asks only about rounds after the file;
// a missing file falls back to loading live. Snapshots here are built from the fake season by the real
// generator (tools/snapshot.mjs), and compared with what a live load produces.
module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const full = await buildSnapshot(2026, fakeFetch, Date.now() - 3*60*60*1000); // 12 of 23 rounds, generated 3 hours ago
  const rounds = p => p.evaluate(() => JSON.stringify(F1Controls.state.seasonRounds));

  // The live load, for comparison.
  const live = await h.openPage('drivers'); await h.loaded(live);
  const liveRounds = await rounds(live), liveHits = live.apiHits.length;
  await live.done();
  t.check('without a season file the page loads live (falls back)', liveHits > 20, `${liveHits} requests`);

  // In-progress season, file up to date: one file + a check of the next round only.
  let p = await h.openPage('drivers', { snapshots: { 2026: full } }); await h.loaded(p);
  t.check('season file: same data as a live load', await rounds(p) === liveRounds);
  t.check('season file: f1api.dev is only asked about the round after it', p.apiHits.length > 0 && p.apiHits.length <= 2 && p.apiHits.every(u => /\/2026\/13\//.test(u)), p.apiHits.join(' '));
  t.check('season file: no calendar request (the file carries it)', !p.apiHits.some(u => /\/api\/2026(\?|$)/.test(u)));
  t.check('season file + a live check just now: "updated just now"', /updated just now/.test(await h.text(p, '.f1c-statusline')), await h.text(p, '.f1c-statusline'));
  // Refresh data re-downloads the file (and still only checks the next round).
  const before = p.snapshotHits.length, beforeApi = p.apiHits.length;
  await p.click('.f1c-refresh'); await h.loaded(p);
  t.check('Refresh data re-downloads the season file', p.snapshotHits.length === before + 1);
  t.check('…and only re-checks the round after it', p.apiHits.length - beforeApi <= 2, p.apiHits.slice(beforeApi).join(' '));
  t.check('season file: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // File behind by two rounds: those come from f1api.dev, and the result matches the live load.
  const behind = { ...full, rounds: full.rounds.slice(0, 10) };
  p = await h.openPage('drivers', { snapshots: { 2026: behind } }); await h.loaded(p);
  t.check('older season file: newer rounds are filled in live, same data as a live load', await rounds(p) === liveRounds);
  t.check('…asking f1api.dev only about rounds 11–13', p.apiHits.every(u => /\/2026\/1[123]\//.test(u)) && p.apiHits.length <= 6, p.apiHits.join(' '));
  await p.done();

  // Complete season: nothing from f1api.dev at all, and switching seasons is one request.
  const done = { ...full, complete: true };
  const other = { ...full, year: 2025, complete: true };
  p = await h.openPage('drivers', { snapshots: { 2026: done, 2025: other } }); await h.loaded(p);
  t.check('complete season file: no f1api.dev requests', p.apiHits.length === 0, p.apiHits.join(' '));
  t.check('complete season file: "updated" age is when the file was made', /updated 3 hrs ago/.test(await h.text(p, '.f1c-statusline')), await h.text(p, '.f1c-statusline'));
  await p.selectOption('.f1c-year', '2025'); await h.loaded(p);
  t.check('switching season loads that season\'s file', (await p.evaluate(() => F1Controls.state.year)) === 2025 && (await p.evaluate(() => F1Controls.state.seasonRounds.length)) === 12);
  t.check('switching to a complete season: still no f1api.dev requests', p.apiHits.length === 0, p.apiHits.join(' '));
  t.check('complete season files: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // A broken file is ignored (loads live).
  p = await h.openPage('position', { snapshots: { 2026: { v: 99 } } }); await h.loaded(p);
  t.check('a broken season file is ignored and the season loads live', (await rounds(p)) === liveRounds);
  await p.done();

  // The other pages use the file too (calendar included).
  for(const name of ['simulator', 'whatif', 'constructors', 'position']){
    p = await h.openPage(name, { snapshots: { 2026: done } }); await h.loaded(p);
    t.check(`${name}: loads from the season file with no f1api.dev requests`, p.apiHits.length === 0 && p.errors.length === 0, p.apiHits.join(' ') + p.errors.join('; '));
    await p.done();
  }
};
