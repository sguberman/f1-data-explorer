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
};
