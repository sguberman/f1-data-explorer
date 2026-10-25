// #191: What-If's "Qualifying order" and "Starting grid" presets: round T's qualifying classification or starting grid
// (pit lane at the back) as the Grand Prix order, shown only when the grid file has that round, with no fetching.
const { api } = require('./lib/fixture');
module.exports = async (t, h) => {
  const order = api('https://f1api.dev/api/2026/12/race').body.races.results.map(r => r.driverId || r.driver.driverId);
  const rev = order.slice().reverse();
  const qual = ids => ids.map((id, i) => ({ driverId: id, code: null, teamId: null, position: i + 1, q1: null, q2: null, q3: null }));
  const rounds = []; for (let r = 1; r <= 12; r++) rounds.push({ round: r, raceName: 'R' + r, circuitId: 'c' + r, qualifying: qual(order), grid: {} });
  // round 13: qualifying is the reverse of round 12's finish; the grid puts the first of the finish in the pit lane and swaps the next two
  const grid13 = { [order[0]]: 0, [order[1]]: 2, [order[2]]: 1 };
  const file = g13 => ({ v: 1, year: 2026, generatedAt: 1, complete: false, source: 'jolpica', rounds: [...rounds, g13] });
  const full = file({ round: 13, raceName: 'R13', circuitId: 'c13', qualifying: qual(rev), grid: grid13 });
  const qOnly = file({ round: 13, raceName: 'R13', circuitId: 'c13', qualifying: qual(rev), grid: {} });

  const open = async grids => { const p = await h.openPage('whatif', { grids }); await h.loaded(p); return p; };
  const order13 = p => p.$$eval('.wiList[data-session="gp"] > li', lis => lis.map(li => li.dataset.id || null));
  const hidden = (p, id) => p.$eval(id, b => b.hidden);

  let p = await open({ 2026: full });
  const hits = p.apiHits.length, ghits = p.gridHits.length;
  t.check('both buttons show when round 13 has qualifying and a grid', !(await hidden(p, '#useQuali')) && !(await hidden(p, '#useGrid')));
  await p.click('#useQuali');
  const q = await order13(p);
  t.check('Qualifying order: the grid file’s classification, then the NC line', JSON.stringify(q.slice(0, rev.length)) === JSON.stringify(rev) || q.slice(0, 5).every((id, i) => id === rev[i]), q.join());
  await p.click('#useGrid');
  const g = await order13(p);
  t.check('Starting grid: grid positions first, the pit-lane starter after the others in the grid map', g[0] === order[2] && g[1] === order[1] && g.indexOf(order[0]) === 2, g.slice(0, 4).join());
  t.check('the line is last and everyone is listed once', g[g.length - 1] === null && new Set(g.filter(Boolean)).size === g.filter(Boolean).length);
  await p.click('#useStandings');
  t.check('Standings order still resets', JSON.stringify(await order13(p)) !== JSON.stringify(g));
  t.check('presets fetch nothing and cause no errors', p.apiHits.length === hits && p.gridHits.length === ghits && p.errors.length === 0, p.errors.join('; '));
  await p.done();

  p = await open({ 2026: qOnly });
  t.check('qualifying only: Qualifying order shows, Starting grid does not', !(await hidden(p, '#useQuali')) && (await hidden(p, '#useGrid')));
  await p.done();

  p = await open({ 2026: null });
  t.check('no grid file: neither button shows', (await hidden(p, '#useQuali')) && (await hidden(p, '#useGrid')));
  await p.done();

  // ---- #191: the slider's round is the round being edited (it reaches the next race), and the qualifying order falls back to OpenF1 ----
  p = await open({ 2026: null });
  const st = await p.evaluate(() => [F1Controls.state.round, document.querySelector('.f1c-round').min, document.querySelector('.f1c-round').max, document.querySelector('.f1c-roundlabel').textContent].join('|'));
  t.check('slider opens on the next race (13), which is the round edited; it runs 2 to 13', st.startsWith('13|2|13|Round 13 of 13') && /Round 13/.test(await p.textContent('#orderHeading')), st);
  await h.setRound(p, 12); await p.waitForTimeout(80);
  t.check('slider 12 edits round 12, from its actual result', /Round 12/.test(await p.textContent('#orderHeading')) && !(await hidden(p, '#useActual')));
  await p.done();

  const opts = (extra = {}) => ({ grids: { 2026: null }, openf1: Object.assign({}, extra) });
  p = await h.openPage('whatif', opts()); await h.loaded(p);
  const oh = p.openf1Hits.length;
  t.check('no grid file: OpenF1 is asked for round 13\'s qualifying once at load', p.openf1Hits.some(u => /session_result/.test(u)), p.openf1Hits.join(' '));
  t.check('…and the Qualifying order preset shows (Starting grid does not)', !(await hidden(p, '#useQuali')) && (await hidden(p, '#useGrid')));
  await p.click('#useQuali');
  const oq = await order13(p);
  t.check('…and fills the order from OpenF1\'s classification, one row per driver and the NC line last', oq[oq.length - 1] === null && new Set(oq.filter(Boolean)).size === oq.filter(Boolean).length, oq.join());
  t.check('the preset fetches nothing more', p.openf1Hits.length === oh && p.errors.length === 0, p.errors.join('; '));
  await p.done();

  p = await h.openPage('whatif', opts({ fail: () => true })); await h.loaded(p);
  t.check('OpenF1 failing: no button, no errors on the page', (await hidden(p, '#useQuali')) && (await p.$$('.wiList li')).length > 0);
  await p.done();

  // saved copies first: with the list and the qualifying session saved, OpenF1 is never asked
  const O = require('../site/openf1.js'), fx = require('./lib/openf1-fixture');
  const snap = key => { const x = fx.SESSIONS.find(q => q.session_key === key); return O.compact({ laps: [], stints: [], drivers: fx.driversFor(key), raceControl: [], result: fx.resultFor(key) }, { key, year: 2026, name: x.session_name }, Date.parse(fx.NOW)); };
  const list = { v: 1, year: 2026, generatedAt: Date.parse(fx.NOW), sessions: fx.SESSIONS.map(x => Object.fromEntries(O.SESSION_FIELDS.map(f => [f, x[f] === undefined ? null : x[f]]))) };
  p = await h.openPage('whatif', { grids: { 2026: null }, openf1: {}, pace: { list: { 2026: list }, sessions: { 204: snap(204) } } }); await h.loaded(p);
  t.check('saved list and qualifying: the preset shows and OpenF1 is not asked at all', !(await hidden(p, '#useQuali')) && p.openf1Hits.length === 0 && p.paceHits.some(u => /pace\/2026\/204\.json/.test(u)), p.openf1Hits.join(' '));
  await p.done();
  // a saved list without the qualifying session: OpenF1 is the fallback
  p = await h.openPage('whatif', { grids: { 2026: null }, openf1: {}, pace: { list: { 2026: list }, sessions: {} } }); await h.loaded(p);
  t.check('no saved qualifying session: OpenF1 is the fallback, and the preset shows', !(await hidden(p, '#useQuali')) && p.openf1Hits.some(u => /session_result/.test(u)), p.openf1Hits.join(' '));
  await p.done();
};
