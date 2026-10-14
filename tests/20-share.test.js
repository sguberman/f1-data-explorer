// #31: every page's setup is in its URL, so a link opens exactly the same view (the simulator re-runs to the same
// results); a Share button copies it. Defaults are left out of the URL. Interactions never fetch.
module.exports = async (t, h) => {
  const q = p => new URL(p.url()).searchParams;
  const go = async (p, path) => { await p.goto('http://site.test/' + path); await h.loaded(p); await p.waitForTimeout(80); };
  const checked = p => p.$$eval('#driverPicker input:checked, #teamPicker input:checked', cs => cs.map(c => c.dataset.id).sort());

  // ---- Drivers: a plain visit carries only the season; changes go into the URL as they happen ----
  let p = await h.openPage('drivers'); await h.loaded(p); await p.waitForTimeout(80);
  t.check('drivers: a plain visit puts just the season in the URL', p.url().endsWith('/drivers.html?season=2026'), p.url());
  const hits = p.apiHits.length;
  await h.setRound(p, 8);
  await p.click('#presetRow button[data-preset="10"]');
  await p.selectOption('#sortSeg', 'rank');
  await p.selectOption('#posView', 'proj');
  await p.waitForTimeout(80);
  const want = await checked(p);
  t.check('drivers: round, picks, sort and position view go into the URL',
    q(p).get('round') === '8' && q(p).get('d').split(',').sort().join() === want.join() && want.length === 10 && q(p).get('sort') === 'rank' && q(p).get('pos') === 'proj', p.url());
  t.check('drivers: changing the setup never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  const link = p.url();
  await p.done();

  // Opening that link elsewhere gives the same view.
  p = await h.openPage('drivers'); await go(p, link.split('/').pop());
  t.check('drivers: the link restores round, picks, sort and position view',
    await p.evaluate(() => F1Controls.state.round) === 8 && JSON.stringify(await checked(p)) === JSON.stringify(want)
    && await p.$eval('#sortSeg', s => s.value) === 'rank' && await p.$eval('#posView', s => s.value) === 'proj');
  t.check('drivers: …and keeps the same URL', p.url() === link, p.url());
  // Back to the defaults: those keys leave the URL.
  await p.click('#presetRow button[data-preset="5"]');
  await h.setRound(p, 12); await p.selectOption('#sortSeg', 'team'); await p.selectOption('#posView', 'actual'); await p.waitForTimeout(80);
  t.check('drivers: defaults are left out of the URL', p.url().endsWith('/drivers.html?season=2026'), p.url());
  // Junk is ignored: unknown ids dropped, bad values fall back.
  await go(p, 'drivers.html?season=1999&round=99&d=nobody,d0_0&sort=zzz');
  t.check('drivers: a bad link falls back sensibly (season, round, unknown ids, bad sort)',
    await p.evaluate(() => [F1Controls.state.year, F1Controls.state.round].join()) === '2026,12'
    && JSON.stringify(await checked(p)) === '["d0_0"]' && await p.$eval('#sortSeg', s => s.value) === 'team', p.url());
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Share button ----
  p = await h.openPage('constructors'); await h.loaded(p);
  await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { window.__copied = s; } } }); });
  await p.click('#teamPicker input[data-id="ferrari"]'); // deselect Ferrari
  await p.click('.f1c-share'); await p.waitForTimeout(120);
  const copied = await p.evaluate(() => window.__copied);
  t.check('Share copies the full link to this view', copied === p.url() && /[?&]t=/.test(copied) && !copied.split('t=')[1].split('&')[0].split(',').includes('ferrari'), copied);
  t.check('Share says the link was copied', /Link copied/.test(await p.textContent('.f1c-share')));
  await p.selectOption('#posView', 'proj'); await p.waitForTimeout(50);
  const cLink = p.url(), teams = await checked(p);
  await go(p, cLink.split('/').pop());
  t.check('constructors: the link restores teams and position view', JSON.stringify(await checked(p)) === JSON.stringify(teams) && await p.$eval('#posView', s => s.value) === 'proj');
  await p.done();

  // ---- Positions: chart sort and show toggles ----
  p = await h.openPage('position'); await go(p, 'position.html?season=2026&chart=champ&below10=1&sprint=0&d=d0_0,d1_0');
  t.check('position: the link restores sort, toggles and drivers',
    await p.$eval('#chartSortSelect', s => s.value) === 'champ'
    && await p.$eval('#chartOptRow input[data-opt="below10"]', c => c.checked) && !(await p.$eval('#chartOptRow input[data-opt="sprint"]', c => c.checked))
    && await p.evaluate(() => ridgeChart.data.labels.slice(-1)[0]) === 'NC' && JSON.stringify(await checked(p)) === '["d0_0","d1_0"]', p.url());
  t.check('position: …and the URL keeps them', ['chart', 'below10', 'sprint', 'd'].every(k => q(p).get(k) != null), p.url());
  await p.done();

  // ---- What-if: a dragged order ----
  p = await h.openPage('whatif'); await h.loaded(p);
  const first = await p.$eval('.wiList[data-session="gp"] li:nth-child(3)', li => li.dataset.id);
  await p.focus(`.wiList[data-session="gp"] li[data-id="${first}"] .wiGrip`);
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(80);
  const order = await p.$$eval('.wiList[data-session="gp"] > li', lis => lis.map(li => li.dataset.id || '-').join(','));
  t.check('what-if: the dragged order goes into the URL', q(p).get('gp') === order, q(p).get('gp'));
  const table = await p.$$eval('#driverTable tr[data-id]', trs => trs.map(tr => tr.textContent).join('|'));
  const wLink = p.url(); await p.done();
  p = await h.openPage('whatif'); await go(p, wLink.split('/').pop());
  t.check('what-if: the link restores the order and the tables', await p.$$eval('.wiList[data-session="gp"] > li', lis => lis.map(li => li.dataset.id || '-').join(',')) === order
    && await p.$$eval('#driverTable tr[data-id]', trs => trs.map(tr => tr.textContent).join('|')) === table);
  await p.click('#useActual').catch(() => {}); await p.click('#useStandings'); await p.waitForTimeout(50);
  t.check('what-if: back to the starting order, the order leaves the URL', !q(p).has('gp'), p.url());
  await p.done();

  // ---- Simulator: settings, collisions and a seeded run reproduce exactly ----
  p = await h.openPage('simulator'); await h.loaded(p);
  await p.selectOption('#n', '2000');
  const firstTag = await p.$eval('#outcomeGrid .tag', e => e.dataset.id);
  await p.click(`#outcomeGrid .stepper button[data-kind="dnf"][data-key="${firstTag}"][data-dir="1"]`);
  await p.click('#addCollision');
  await p.click('#run');
  await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(80);
  const sp = q(p);
  t.check('simulator: settings, collision, runs, round and seed go into the URL',
    sp.get('o') === `${firstTag}:1:a` && /^[\w]+:[\w]+:1$/.test(sp.get('c')) && sp.get('n') === '2000' && sp.get('round') === '12' && /^\d+$/.test(sp.get('seed')), p.url());
  const odds = await p.$eval('#odds', e => e.textContent.replace(/\s+/g, ' '));
  const pts = await p.evaluate(() => JSON.stringify(ridgeCharts.points.data.datasets.filter(d => !d._baseline).map(d => d._pct)));
  const sLink = p.url(); await p.done();
  p = await h.openPage('simulator'); await go(p, sLink.split('/').pop());
  await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  t.check('simulator: the link restores the DNF setting and the collision', await p.$eval(`#outcomeGrid .val[data-kind="dnf"][data-key="${firstTag}"]`, e => e.textContent) === '1'
    && await p.$$eval('#collisionList .col-row', r => r.length) === 1);
  t.check('simulator: opening the link re-runs to exactly the same win probabilities', await p.$eval('#odds', e => e.textContent.replace(/\s+/g, ' ')) === odds, odds);
  t.check('simulator: …and the same points spread', await p.evaluate(() => JSON.stringify(ridgeCharts.points.data.datasets.filter(d => !d._baseline).map(d => d._pct))) === pts);
  await p.click(`#outcomeGrid .stepper button[data-kind="dnf"][data-key="${firstTag}"][data-dir="1"]`); await p.waitForTimeout(80);
  t.check('simulator: once the settings change, the seed leaves the URL (it no longer matches what you see)', !q(p).has('seed') && q(p).get('o') === `${firstTag}:2:a`, p.url());
  t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
