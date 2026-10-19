// #103: "Projection from" — how many recent rounds the projections average (5 by default), kept between pages and in links.
module.exports = async (t, h) => {
  const p = await h.openPage('drivers'); await h.loaded(p);
  const val = () => p.evaluate(() => document.querySelector('#projStep .projVal').textContent);
  // Independent rate: mean of an entry's points over its last n participated rounds (as of the slider's round).
  const check = (kind, n) => p.evaluate(({kind, n}) => {
    const rs = F1Controls.state.seasonRounds.filter(r => r.round <= L), per = {};
    rs.forEach(r => [...r.raceResults, ...(r.sprintResults||[])].forEach(q => {
      const id = kind === 'teams' ? q.teamId : q.driverId; (per[id] = per[id] || {})[r.round] = (per[id][r.round]||0) + q.points; }));
    return D.every(d => {
      const by = per[kind === 'teams' ? d.teamId : d.id], rr = Object.keys(by).map(Number).sort((a,b) => a-b), last = n === Infinity ? rr : rr.slice(-n);
      return Math.abs(d.rate - last.reduce((s,r) => s + by[r], 0) / last.length) < 1e-9;
    });
  }, {kind, n});

  t.check('drivers: defaults to the last 5 races', await val() === 'last 5 races' && await check('drivers', 5));
  p.apiHits.length = 0;
  await p.click('#projStep .projLess'); await p.waitForTimeout(150);
  t.check('drivers: − uses the last 4 races', await val() === 'last 4 races' && await check('drivers', 4));
  t.check('drivers: link carries pw=4', (await p.evaluate(() => location.search)).includes('pw=4'));
  t.check('drivers: the projected final points match the new rate', await p.evaluate(() => {
    const c = Chart.getChart(document.getElementById('projChart')); return c.data.datasets.every(ds => D.some(d => d.n === ds.name && Math.round(d.full[N-1]) === Math.round(ds.fin))); }));
  await p.selectOption('#posView', 'proj'); await p.waitForTimeout(100);
  for(let i = 0; i < 20; i++) await p.click('#projStep .projLess', {force: true}).catch(() => {});
  t.check('drivers: − stops at 1 race', await val() === 'last 1 races' && await p.evaluate(() => document.querySelector('#projStep .projLess').disabled));
  for(let i = 0; i < 30; i++) await p.click('#projStep .projMore', {force: true}).catch(() => {});
  t.check('drivers: + ends at every race so far', await val() === 'every race so far' && await check('drivers', Infinity));
  t.check('drivers: pw=all in the link', (await p.evaluate(() => location.search)).includes('pw=all'));
  t.check('drivers: stepping never fetches', p.apiHits.length === 0 && p.errors.length === 0, p.errors.join('; '));

  // Kept between pages.
  await p.goto('http://site.test/constructors.html'); await h.loaded(p);
  t.check('constructors: the choice carries over from the drivers page', await val() === 'every race so far' && await check('teams', Infinity));
  await p.click('#projStep .projLess'); await p.waitForTimeout(150);
  const m = await p.evaluate(() => F1Controls.state.seasonRounds.length - 1);
  t.check('constructors: − from every race uses all but one', await val() === `last ${m} races` && await check('teams', m));

  // A link sets it (and beats the saved one); no pw = the default of 5.
  const year = await p.evaluate(() => F1Controls.state.year);
  await p.goto(`http://site.test/constructors.html?season=${year}&pw=3`); await h.loaded(p);
  t.check('constructors: pw=3 in a link', await val() === 'last 3 races' && await check('teams', 3));
  await p.evaluate(() => localStorage.removeItem('f1cache:projWindow'));
  await p.goto(`http://site.test/constructors.html?season=${year}`); await h.loaded(p);
  t.check('constructors: default 5 leaves pw out of the link', await val() === 'last 5 races' && !(await p.evaluate(() => location.search)).includes('pw='));
  await p.done();
};
