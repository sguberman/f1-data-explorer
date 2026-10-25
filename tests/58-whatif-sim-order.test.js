// #195: What-If's simulating buttons. "🎲 Simulate from this order" uses the list as it is (below the Not classified line = pit lane) as the
// starting grid; "🎲 Simulated" uses the starting grid, else the qualifying result, else the saved / OpenF1 Weekend Pace qualifying (Sprint
// Qualifying for the sprint list), else nothing. Interactions never fetch.
const O = require('../site/openf1.js'), fx = require('./lib/openf1-fixture');
module.exports = async (t, h) => {
  const snap = key => { const x = fx.SESSIONS.find(q => q.session_key === key); return O.compact({ laps: [], stints: [], drivers: fx.driversFor(key), raceControl: [], result: fx.resultFor(key) }, { key, year: 2026, name: x.session_name }, Date.parse(fx.NOW)); };
  const list = { v: 1, year: 2026, generatedAt: Date.parse(fx.NOW), sessions: fx.SESSIONS.map(x => Object.fromEntries(O.SESSION_FIELDS.map(f => [f, x[f] === undefined ? null : x[f]]))) };
  const saved = { list: { 2026: list }, sessions: { 204: snap(204), 302: snap(302) } };
  const open = async opts => { const p = await h.openPage('whatif', Object.assign({ grids: { 2026: null }, openf1: {} }, opts)); await h.loaded(p); return p; };
  const order = (p, s) => p.$$eval(`.wiList[data-session="${s}"] > li`, lis => lis.map(li => li.dataset.id || null));
  const seed = p => p.evaluate(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; });
  const setOrder = (p, s, o) => p.evaluate(([s, o]) => { orders[s] = o; render(); }, [s, o]);
  const note = p => p.textContent('#orderNote');

  // ---- Simulate from this order ----
  let p = await open({ pace: saved });
  t.check('the button is next to Simulated and always shown', !(await p.$eval('#useSimOrder', b => b.hidden)) && await p.$eval('#useSim', b => b.nextElementSibling.id) === 'useSimOrder' && /Simulate from this order/.test(await p.textContent('#useSimOrder')));
  const hits = [p.apiHits.length, p.openf1Hits.length, p.paceHits.length];
  const std = await order(p, 'gp'), ids = std.filter(Boolean), last = ids[ids.length - 1], first = ids[0];
  await seed(p); await p.click('#useSim');
  const fromStd = await order(p, 'gp');
  await setOrder(p, 'gp', [last, ...ids.filter(x => x !== last), null]);
  await seed(p); await p.click('#useSimOrder');
  const mine = await order(p, 'gp');
  t.check('simulating from an order with the last-placed driver on pole moves them up compared with the same draws from the standings', mine.indexOf(last) < fromStd.indexOf(last), `${mine.indexOf(last)} vs ${fromStd.indexOf(last)}`);
  t.check('…and the note says it started from your order', /Round 13 is simulated from your starting order\./.test(await note(p)), (await note(p)).slice(-200));
  // below the line = pit lane = last, the same as being last above the line
  const rest = ids.filter(x => x !== first);
  await setOrder(p, 'gp', [...rest, first, null]); await seed(p); await p.click('#useSimOrder'); const above = await order(p, 'gp');
  await setOrder(p, 'gp', [...rest, null, first]); await seed(p); await p.click('#useSimOrder'); const below = await order(p, 'gp');
  t.check('a driver below the Not classified line starts from the pit lane (the same draws as last on the grid)', JSON.stringify(above) === JSON.stringify(below), above.join() + ' / ' + below.join());
  t.check('clicking fetches nothing and causes no errors', p.apiHits.length === hits[0] && p.openf1Hits.length === hits[1] && p.paceHits.length === hits[2] && p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- Sprint weekend (round 11 happened, with a sprint): the sprint list works the same way ----
  p = await open({ pace: saved });
  await h.setRound(p, 11); await p.waitForTimeout(80);
  t.check('round 11 has both lists', (await p.$$('.wiList')).length === 2);
  const sp = await order(p, 'sprint'), sids = sp.filter(Boolean), slast = sids[sids.length - 1];
  await seed(p); await p.click('#useSim'); const sFrom = await order(p, 'sprint');
  t.check('Simulated: the sprint list is simulated from its saved Sprint Qualifying, the Grand Prix from its saved qualifying', /The sprint is simulated from its sprint qualifying result\./.test(await note(p)) && p.openf1Hits.length === 0, (await note(p)).slice(-220));
  await setOrder(p, 'sprint', [slast, ...sids.filter(x => x !== slast), null]);
  await seed(p); await p.click('#useSimOrder'); const sMine = await order(p, 'sprint');
  t.check('Simulate from this order: the sprint list starts from its own order', /The sprint is simulated from your starting order\./.test(await note(p)) && sMine.indexOf(slast) <= sFrom.indexOf(slast), `${sMine.indexOf(slast)} vs ${sFrom.indexOf(slast)}`);
  await p.done();

  // ---- Simulated: the saved Weekend Pace qualifying stands in for the grid file; OpenF1 only without a saved copy; nothing without data ----
  p = await open({ pace: saved });
  await p.click('#useSim');
  t.check('no grid file, saved qualifying: Simulated says Round 13 is simulated from its qualifying result, without asking OpenF1', /Round 13 is simulated from its qualifying result\./.test(await note(p)) && p.openf1Hits.length === 0, (await note(p)).slice(-200));
  t.check('…and a non-sprint round has no sprint part', !/sprint/.test(await note(p)));
  await p.done();
  p = await open({ pace: { list: { 2026: list }, sessions: {} } });
  await p.click('#useSim');
  t.check('no saved qualifying copy: OpenF1 is the fallback', /Round 13 is simulated from its qualifying result\./.test(await note(p)) && p.openf1Hits.some(u => /session_result/.test(u)));
  await p.done();
  p = await open({ pace: {}, openf1: { fail: () => true } });
  await p.click('#useSim');
  t.check('no data anywhere: simulated without it (no source in the note), no errors', /Simulated 30,000 times/.test(await note(p)) && !/is simulated from/.test(await note(p)) && p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
