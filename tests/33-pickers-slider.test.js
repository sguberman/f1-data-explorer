// #104 (picker presets: top 4 teams, best of the rest, title contention; contenders as the default selection; the
// picks remembered between pages), #105 (the slider's round kept between pages) and #124 (the picker folds away).
// Contenders and teams are checked against the independent title calculation in lib/clinch.js on a constructed
// season; nothing here fetches.
const { seasonKit, ranked, status } = require('./lib/clinch');
module.exports = async (t, h) => {
  const kit = await seasonKit();
  const N = 14, cal = { ...kit.cal, totalRounds: N, sprintRounds: kit.SPRINTS.filter(r => r <= N) };
  // Two rivals swap wins for 12 rounds, a third trails: only the first two can still take the drivers' title.
  const A = 'd0_0', B = 'd1_0', C = 'd2_0';
  const rounds = Array.from({ length: 12 }, (_, i) => kit.round(i + 1, i % 2 ? [B, A, C] : [A, B, C]));
  const snap = kit.snap(rounds, cal), snapshots = { 2026: snap };
  const teamOf = id => kit.row(id).teamId;
  const sorted = a => a.slice().sort();
  const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  const orderOf = kind => ranked(rounds, 12, kind).order;
  const contenders = kind => { const s = status(rounds, 12, kind, cal); return s.champion ? [s.champion] : [s.leader, ...s.contenders.map(c => c.id)]; };
  const top4Teams = orderOf('teams').slice(0, 4);
  const expDrivers = {
    top4: orderOf('drivers').filter(id => top4Teams.includes(teamOf(id))),
    rest: orderOf('drivers').filter(id => !top4Teams.includes(teamOf(id))),
    contention: contenders('drivers'),
  };
  const dc = contenders('drivers'), tc = contenders('teams');
  t.check('constructed season: two drivers still in it, and a small team field', dc.length === 2 && tc.length >= 2, `${dc} / ${tc}`);
  const expTeamDefault = tc.length >= 2 && tc.length <= 5 ? tc : orderOf('teams').slice(0, 5);

  const checked = p => p.$$eval('#driverPicker input:checked, #teamPicker input:checked', cs => cs.map(c => c.dataset.id));
  const active = p => p.$$eval('#presetRow .pill.active', b => b.map(x => x.dataset.preset));
  const go = async (p, path) => { await p.goto('http://site.test/' + path); await h.loaded(p); await p.waitForTimeout(100); };
  const stored = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
  const open = async () => { const p = await h.openPage('drivers', { snapshots }); await h.loaded(p); await p.waitForTimeout(100); return p; };

  // ---- Default selection = the title contenders, with their preset lit ----
  let p = await open();
  const hits = p.apiHits.length;
  t.check('drivers: the default is the title contenders', eq(await checked(p), expDrivers.contention), (await checked(p)).join());
  t.check('drivers: …and the contention preset is lit', JSON.stringify(await active(p)) === '["contention"]', (await active(p)).join());
  t.check('drivers: …and the URL has no picks (it is the default)', !/[?&]d=/.test(p.url()), p.url());
  for(const k of ['top4', 'rest']){
    await p.click(`#presetRow button[data-preset="${k}"]`); await p.waitForTimeout(80);
    t.check(`drivers: ${k} preset = ${k === 'top4' ? "the top 4 teams' drivers" : 'everyone else'}`, eq(await checked(p), expDrivers[k]), (await checked(p)).join());
    t.check(`drivers: ${k} is the only lit preset`, JSON.stringify(await active(p)) === `["${k}"]`, (await active(p)).join());
  }
  await h.setRound(p, 6); await p.click('#presetRow button[data-preset="contention"]'); await p.waitForTimeout(80);
  const at6 = status(rounds, 6, 'drivers', cal);
  t.check('drivers: presets use the slider\'s round (contention at round 6)', eq(await checked(p), at6.champion ? [at6.champion] : [at6.leader, ...at6.contenders.map(c => c.id)]), (await checked(p)).join());
  await h.setRound(p, 12);
  t.check('drivers: presets never fetch', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));

  // ---- The picks follow you to the other pages ----
  await p.click('#presetRow button[data-preset="top4"]'); await p.waitForTimeout(80);
  t.check('drivers: a non-default pick is remembered', JSON.parse(await stored(p, 'f1cache:pickerSelection')).drivers.length === expDrivers.top4.length);
  for(const page of ['position', 'simulator']){
    await go(p, page + '.html');
    t.check(`${page}: opens with the drivers picked on the drivers page`, eq(await checked(p), expDrivers.top4) && JSON.stringify(await active(p)) === '["top4"]', (await checked(p)).join());
  }
  await go(p, 'constructors.html');
  t.check('constructors: its own picks are separate (default = contenders, or the top 5)', eq(await checked(p), expTeamDefault), (await checked(p)).join());
  await p.click('#presetRow button[data-preset="top4"]'); await p.waitForTimeout(80);
  t.check('constructors: top 4 teams preset', eq(await checked(p), top4Teams), (await checked(p)).join());
  await p.click('#presetRow button[data-preset="rest"]'); await p.waitForTimeout(80);
  t.check('constructors: best of the rest preset', eq(await checked(p), orderOf('teams').slice(4)), (await checked(p)).join());
  await go(p, 'drivers.html');
  t.check('drivers: …and the constructors page left the drivers\' picks alone', eq(await checked(p), expDrivers.top4));
  await p.click('#presetRow button[data-preset="contention"]'); await p.waitForTimeout(80);
  t.check('drivers: picking the default again forgets the picks', JSON.parse(await stored(p, 'f1cache:pickerSelection')).drivers === null);
  // A link's picks beat the remembered ones; stale or foreign ids are ignored.
  await p.click('#presetRow button[data-preset="rest"]'); await p.waitForTimeout(80);
  await go(p, `position.html?season=2026&d=${A},nobody`);
  t.check('position: a link\'s picks win over the remembered ones (unknown ids dropped)', eq(await checked(p), [A]), (await checked(p)).join());
  await p.evaluate(() => localStorage.setItem('f1cache:pickerSelection', JSON.stringify({ year: 1999, drivers: ['d3_0'], teams: null })));
  await go(p, 'drivers.html');
  t.check('drivers: picks remembered for another season are ignored', eq(await checked(p), expDrivers.contention), (await checked(p)).join());
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));

  // ---- The slider's round is kept between pages ----
  await h.setRound(p, 5);
  t.check('slider: a round below the latest is remembered', JSON.parse(await stored(p, 'f1cache:selectedRound')).round === 5);
  for(const page of ['constructors', 'position', 'simulator', 'whatif', 'drivers']){
    await go(p, page + '.html');
    const st = await p.evaluate(() => [F1Controls.state.round, document.querySelector('.f1c-round').value, document.querySelector('.f1c-roundlabel').textContent].join('|'));
    t.check(`slider: ${page} opens on round 5`, st.startsWith('5|5|Round 5 of 12'), st);
  }
  t.check('slider: the other pages follow it in the URL', /[?&]round=5\b/.test(p.url()), p.url());
  await go(p, 'drivers.html?season=2026');
  t.check('slider: a link without a round means the latest', await p.evaluate(() => F1Controls.state.round) === 12);
  await go(p, 'drivers.html?season=2026&round=3');
  t.check('slider: a link\'s round wins', await p.evaluate(() => F1Controls.state.round) === 3);
  await h.setRound(p, 12);
  t.check('slider: back on the latest round, nothing is kept', await stored(p, 'f1cache:selectedRound') === null);
  await go(p, 'position.html');
  t.check('slider: …so the next page opens on the latest', await p.evaluate(() => F1Controls.state.round) === 12);
  await p.evaluate(() => localStorage.setItem('f1cache:selectedRound', JSON.stringify({ year: 2026, round: 99 })));
  await go(p, 'position.html');
  t.check('slider: a saved round that doesn\'t exist is ignored', await p.evaluate(() => F1Controls.state.round) === 12);
  await h.setRound(p, 7); await go(p, 'drivers.html?season=2026&round=7');
  await p.click('.f1c-refresh'); await h.loaded(p); await p.waitForTimeout(150);
  t.check('slider: Refresh data keeps the round', await p.evaluate(() => F1Controls.state.round) === 7);
  await h.setRound(p, 12);

  // ---- The picker folds away (#124) ----
  for(const [page, noun] of [['drivers', 'drivers'], ['position', 'drivers'], ['simulator', 'drivers'], ['constructors', 'teams']]){
    await go(p, page + '.html');
    const list = page === 'constructors' ? '#teamPicker' : '#driverPicker';
    t.check(`${page}: the picker card sits right under the round slider card`, await p.evaluate(sel => { const c = document.querySelector(sel).closest('.card'), f = document.getElementById('f1controls'); return f.nextElementSibling === c; }, list));
    const vis = () => p.$eval(list, e => e.offsetHeight > 0);
    t.check(`${page}: the list starts open`, await vis() && await p.getAttribute('#pickerToggle', 'aria-expanded') === 'true');
    await p.click('#pickerToggle'); await p.waitForTimeout(60);
    const n = (await checked(p)).length, total = await p.$$eval(`${list} input`, i => i.length);
    t.check(`${page}: folded away, the list is hidden and a count is shown`, !await vis() && await p.getAttribute('#pickerToggle', 'aria-expanded') === 'false'
      && await p.$eval('#pickerSummary', e => e.offsetHeight > 0 && e.textContent) === `${n} of ${total} ${noun}`, await p.$eval('#pickerSummary', e => e.textContent));
    if(page !== 'constructors') t.check(`${page}: the sort dropdown is hidden while folded`, await p.$eval('#sortSeg', e => e.offsetHeight === 0));
    t.check(`${page}: the presets stay while folded away`, await p.$eval('#presetRow', e => e.offsetHeight > 0));
    await p.click('#presetRow button[data-preset="all"]'); await p.waitForTimeout(80);
    t.check(`${page}: the count follows the presets`, await p.$eval('#pickerSummary', e => e.textContent) === `${total} of ${total} ${noun}`);
    await go(p, page + '.html');
    t.check(`${page}: stays folded after a reload`, !await vis() && await p.$eval('#pickerSummary', e => e.offsetHeight > 0));
    await p.click('#pickerToggle'); await p.waitForTimeout(60);
    if(page !== 'constructors') t.check(`${page}: the sort dropdown is back when open`, await p.$eval('#sortSeg', e => e.offsetHeight > 0));
    t.check(`${page}: opens again`, await vis() && await p.getAttribute('#pickerToggle', 'aria-expanded') === 'true');
    await p.click('#presetRow button[data-preset="contention"]'); await p.waitForTimeout(60);
  }
  await p.click('#pickerToggle'); // folded state is shared by the pages
  await go(p, 'drivers.html');
  t.check('folded state carries to the other pages', await p.$eval('#driverPicker', e => e.offsetHeight === 0));
  t.check('no page errors across pages', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Phone width: the toggle row fits, folded or not ----
  p = await h.openPage('drivers', { snapshots, width: 390 }); await h.loaded(p);
  for(const fold of [false, true]){
    if(fold) await p.click('#pickerToggle');
    await p.waitForTimeout(60);
    t.check(`phone${fold ? ' (folded)' : ''}: no sideways scroll, presets wrap inside the card`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
      && [...document.querySelectorAll('#presetRow .pill')].every(b => b.getBoundingClientRect().right <= document.querySelector('#presetRow').closest('.card').getBoundingClientRect().right + 1)));
  }
  t.check('phone: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
