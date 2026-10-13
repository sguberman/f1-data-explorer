// issues #23 (Refresh data), #48 (loading and error states), #49 (last-updated time).
module.exports = async (t, h) => {
  // Normal load on every data page: status line, no error.
  for(const name of ['drivers','constructors','position','simulator']){
    const p = await h.openPage(name); await h.loaded(p);
    const st = await h.text(p, '.f1c-statusline');
    t.check(`${name}: status line`, /12 rounds loaded · updated just now · Refresh data/.test(st), st);
    t.check(`${name}: no error message`, (await h.text(p, '.f1c-error')) === '(hidden)');
    await p.done();
  }

  const p = await h.openPage('drivers'); await h.loaded(p);
  // #23: Refresh clears every f1cache:v2: entry, refetches, and keeps the theme + selected season.
  p.apiHits.length = 0;
  await p.click('.f1c-refresh'); await h.loaded(p);
  const keys = await p.evaluate(() => Object.keys(localStorage));
  t.check('Refresh data refetches from f1api.dev', p.apiHits.length > 20, `${p.apiHits.length} requests`);
  t.check('Refresh data keeps theme and season', keys.includes('f1-theme') && keys.includes('f1cache:selectedSeason'), keys.filter(k => !k.startsWith('f1cache:v2:')).join(','));
  t.check('cache entries record their fetch time', await p.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith('f1cache:v2:2026/')).every(k => JSON.parse(localStorage[k]).t > 0)));
  // House rule: moving the slider never fetches.
  p.apiHits.length = 0;
  for(const r of [3, 9, 12]) await h.setRound(p, r);
  await p.waitForTimeout(200);
  t.check('round slider makes no network requests', p.apiHits.length === 0, `${p.apiHits.length}`);
  // #49: the age comes from the cache, and isn't reset to "just now" by re-stamping the latest round's TTL.
  await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('f1cache:v2:')).forEach(k => {
    const e = JSON.parse(localStorage[k]); e.t -= 3*3600e3; localStorage[k] = JSON.stringify(e); }));
  await p.reload(); await h.loaded(p);
  t.check('age read from cache ("3 hrs ago")', /updated 3 hrs ago/.test(await h.text(p, '.f1c-statusline')), await h.text(p, '.f1c-statusline'));
  t.check('exact time on hover', !!(await p.$eval('.f1c-age', e => e.title)));
  await p.done();

  // #48: partial failure (round 8 down) -> 7 rounds + message; Retry recovers once the API is back.
  let down = true;
  const q = await h.openPage('drivers', {fail: u => down && /\/2026\/8\/race$/.test(u)}); await h.loaded(q);
  t.check('partial failure: message', /some results may be missing \(showing rounds 1–7\)/.test(await h.text(q, '.f1c-error')), await h.text(q, '.f1c-error'));
  t.check('partial failure: 7 rounds loaded', /7 rounds loaded/.test(await h.text(q, '.f1c-statusline')));
  down = false;
  await q.click('.f1c-retry'); await h.loaded(q);
  t.check('Retry recovers', (await h.text(q, '.f1c-error')) === '(hidden)' && /12 rounds loaded/.test(await h.text(q, '.f1c-statusline')));
  t.check('partial failure: no page errors', q.errors.length === 0, q.errors.join('; '));
  await q.done();

  // #48: total failure on every page.
  for(const name of ['drivers','constructors','position','simulator']){
    const r = await h.openPage(name, {fail: u => /\/race$/.test(u)}); await h.loaded(r, 15000);
    t.check(`${name}: total failure message`, /Couldn't load the 2026 season from f1api.dev/.test(await h.text(r, '.f1c-error')), await h.text(r, '.f1c-error'));
    t.check(`${name}: total failure, no page errors`, r.errors.length === 0, r.errors.join('; '));
    await r.done();
  }

  // #48: a slow load shows the loading state, then clears it.
  const s = await h.openPage('position', {delay:600});
  await s.waitForTimeout(500);
  t.check('slow load: loading state shown', await s.evaluate(() => document.documentElement.classList.contains('f1-loading')));
  await h.loaded(s, 15000);
  t.check('slow load: loading state cleared', !(await s.evaluate(() => document.documentElement.classList.contains('f1-loading'))));
  await s.done();
};
