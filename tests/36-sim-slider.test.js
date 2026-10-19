// #112: the simulator's round slider sticks to the top, and moving it re-simulates by itself:
// a quick preview while dragging, the chosen number of seasons once released.
module.exports = async (t, h) => {
  const p = await h.openPage('simulator'); await h.loaded(p);
  await p.selectOption('#n', '10000');
  const done = n => p.waitForFunction(n => lastRun && lastRun.N === n && !document.getElementById('staleNote').hidden === false && /seasons simulated/.test(document.getElementById('status').textContent), n);

  // No run yet: moving the slider doesn't start one.
  await h.setRound(p, (await p.evaluate(() => L)) - 1); await p.waitForTimeout(250);
  t.check('no run yet: the slider does not start one', await p.evaluate(() => !lastRun));

  await p.click('#run'); await done(10000);
  const hits = p.apiHits.length;
  const L0 = await p.evaluate(() => L);

  // Dragging (input only) runs a 2,000-season preview for the new round.
  await h.setRound(p, L0 - 1); await done(2000);
  const prev = await p.evaluate(() => ({ L, N: lastRun.N, key: lastRun.key === settingsKey(), stale: !document.getElementById('staleNote').hidden, status: document.getElementById('status').textContent }));
  t.check('dragging re-simulates a quick preview for the new round', prev.N === 2000 && prev.key && !prev.stale && /quick preview/.test(prev.status), JSON.stringify(prev));

  // Releasing runs the chosen number of seasons.
  await p.evaluate(() => document.querySelector('.f1c-round').dispatchEvent(new Event('change')));
  await done(10000);
  t.check('releasing runs the full number of seasons', await p.evaluate(() => lastRun.N === 10000 && lastRun.key === settingsKey()));

  // The controls stay in view when scrolled and shrink to the slider.
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(150);
  const s = await p.evaluate(() => { const r = document.querySelector('.f1c-round').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, compact: document.getElementById('f1controls').classList.contains('compact'), year: getComputedStyle(document.querySelector('.f1c-year')).display }; });
  t.check('the slider stays at the top while scrolled, with the season row folded away', s.top >= 0 && s.bottom < 200 && s.compact, JSON.stringify(s));
  await h.screenshot(p, '36-sim-slider.png');

  t.check('the slider never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('simulator slider: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
