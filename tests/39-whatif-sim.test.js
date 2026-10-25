// #133: What-If's "🎲 Simulated" preset: 30,000 simulated races (the simulator's race model, #117, with #162's team
// strength) turned into one finishing order, with the simulator's "Form from" stepper (default: the whole season). The expected order is worked out here by an
// independent re-implementation of the model, fed the same seeded random numbers.
module.exports = async (t, h) => {
  const p = await h.openPage('whatif'); await h.loaded(p);
  const hits = p.apiHits.length;
  const order = s => p.$$eval(`.wiList[data-session="${s}"] > li`, lis => lis.map(li => li.dataset.id || null));
  const seed = () => p.evaluate(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; });
  const val = () => p.textContent('#winVal');

  t.check('Simulated button and Form from stepper (default: the whole season) are shown', !(await p.$eval('#useSim', b => b.hidden)) && (await val()) === 'whole season' && await p.$eval('#winMore', b => b.disabled));
  t.check('the default whole season is not in the URL', !new URL(p.url()).searchParams.has('w'), p.url());
  // Stepper limits: down to 3, up to the whole season (round 12 loaded, so 11 clicks takes the whole season to 3... 9).
  for(let i = 0; i < 9; i++) await p.click('#winLess');
  t.check('Form from stops at 3 races', (await val()) === 'last 3 races' && await p.$eval('#winLess', b => b.disabled));
  await p.waitForTimeout(100);
  t.check('…and the URL carries it', new URL(p.url()).searchParams.get('w') === '3', p.url());
  for(let i = 0; i < 9; i++) await p.click('#winMore');
  t.check('Form from tops out at the whole season', (await val()) === 'whole season' && await p.$eval('#winMore', b => b.disabled));
  await p.waitForTimeout(100);
  t.check('back at the whole season (the default), w leaves the URL', !new URL(p.url()).searchParams.has('w'), p.url());
  await p.click('#winLess'); await p.waitForTimeout(100);
  t.check('one race fewer: the last 11 races, in the URL', (await val()) === 'last 11 races' && new URL(p.url()).searchParams.get('w') === '11', p.url());
  await p.click('#winMore'); await p.waitForTimeout(100);

  // The simulated order against an independent calculation (same random numbers).
  await seed();
  await p.click('#useSim');
  const got = await order('gp');
  const exp = await p.evaluate(async () => {
    const L = 12, win = Infinity, runs = 30000, GP = [25,18,15,12,10,8,6,4,2,1];
    const rounds = F1Controls.state.seasonRounds.filter(r => r.round <= L);
    const res = {}, raced = new Set(), team = {};
    rounds.forEach(r => r.raceResults.forEach(q => { (res[q.driverId] = res[q.driverId] || []).push(q.position >= 1 ? q.position : null); if(r.round === L){ raced.add(q.driverId); team[q.driverId] = q.teamId; } }));
    let st = 0, dn = 0; Object.values(res).forEach(a => { st += a.length; dn += a.filter(x => x == null).length; });
    const grid = dn / st;
    const ids = F1Common.standingsOrder(F1Controls.state.seasonRounds, L, 'drivers');
    const run = ids.filter(id => raced.has(id)), rest = ids.filter(id => !raced.has(id));
    const n = run.length, rs = run.map(id => win === Infinity ? res[id] : res[id].slice(-win));
    const w = (r, place) => { let s = 0.03; r.forEach(f => { if(f != null) s += f <= place ? 1 : 0.5 * Math.pow(0.5, f - place - 1); }); return s; };
    const rate = rs.map(r => (r.filter(x => x == null).length + 64 * grid) / (r.length + 64));
    // team strength: a quarter of the average weight of the other cars on the same team
    const mates = run.map((id, i) => run.map((o, j) => j !== i && team[id] != null && team[o] === team[id] ? j : -1).filter(j => j >= 0)); // a car with no team has no teammates
    const WT = rs.map((r, i) => Array.from({ length: n }, (_, s) => w(r, s + 1) + (mates[i].length ? 0.25 * mates[i].reduce((a, j) => a + w(rs[j], s + 1), 0) / mates[i].length : 0)));
    let a = 12345; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const pts = new Array(n).fill(0), cls = new Array(n).fill(0), pos = run.map(() => new Array(n + 1).fill(0));
    for(let k = 0; k < runs; k++){
      let alive = []; for(let i = 0; i < n; i++){ if(rnd() < rate[i]) pos[i][n]++; else alive.push(i); }
      // a draw per place from the cars still unplaced; the pick swaps with the front of the rest, as the engine does,
      // so the same random numbers give the same order
      const len = alive.length;
      for(let s = 0; s < len; s++){
        let tot = 0; for(let x = s; x < len; x++) tot += WT[alive[x]][s];
        let r = rnd() * tot, j = len - 1;
        for(let x = s; x < len; x++){ r -= WT[alive[x]][s]; if(r <= 0){ j = x; break; } }
        const i = alive[j]; alive[j] = alive[s]; alive[s] = i; pts[i] += GP[s] || 0; cls[i]++; pos[i][s]++;
      }
    }
    const med = i => { let c = 0; for(let q = 0; q <= n; q++){ c += pos[i][q]; if(c * 2 >= runs) return q; } return n; };
    const idx = run.map((_, i) => i).sort((x, y) => pts[y] - pts[x] || med(x) - med(y) || x - y);
    return [...idx.filter(i => cls[i] / runs >= 0.5).map(i => run[i]), null, ...idx.filter(i => cls[i] / runs < 0.5).map(i => run[i]), ...rest];
  });
  t.check('the Simulated order matches an independent run of the race model', JSON.stringify(got) === JSON.stringify(exp), JSON.stringify([got.slice(0, 6), exp.slice(0, 6)]));
  t.check('every driver is listed once, with one not-classified line', got.length === 23 && new Set(got).size === 23 && got.filter(x => x === null).length === 1);
  t.check('the note says it was simulated', /Simulated 30,000 times from each driver’s whole season \(and a little from their teammate’s\)/.test(await p.textContent('#orderNote')));
  t.check('the tables follow the simulated order', await p.$$eval('#driverTable tr[data-id]', r => r.length) > 0);

  // Dragging works afterwards, and Standings order clears the note.
  const second = got[1];
  await p.focus(`.wiList[data-session="gp"] li[data-id="${second}"] .wiGrip`);
  await p.keyboard.press('ArrowUp');
  t.check('a simulated order can still be dragged', (await order('gp'))[0] === second);
  await p.click('#useStandings');
  t.check('Standings order replaces it and drops the note', !/Simulated/.test(await p.textContent('#orderNote')));

  // Form from changes the window used; w goes in the URL and a link restores it.
  for(let i = 0; i < 6; i++) await p.click('#winLess'); // whole season = 12 races, so 11 … 6
  await p.waitForTimeout(100);
  t.check('last 6 races: w=6 in the URL', new URL(p.url()).searchParams.get('w') === '6', p.url());
  await p.click('#useSim');
  t.check('the note names the window used', /last 6 races \(and a little from their teammate’s\): drivers/.test(await p.textContent('#orderNote')));
  const link = p.url();
  t.check('simulating never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('whatif sim: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Sprint weekend: both lists are simulated. Round 11 had a sprint (slider at 10).
  const s = await h.openPage('whatif'); await h.loaded(s);
  await s.goto(link.replace(/round=\d+&?/, '') + '&round=11'); await h.loaded(s);
  t.check('a link restores Form from', (await s.textContent('#winVal')) === 'last 6 races');
  await s.click('#useSim');
  const sp = await s.$$eval('.wiList[data-session="sprint"] > li', l => l.map(x => x.dataset.id || null));
  const gp2 = await s.$$eval('.wiList[data-session="gp"] > li', l => l.map(x => x.dataset.id || null));
  t.check('a sprint weekend gets both lists simulated', sp.length === gp2.length && sp.length > 1 && /Simulated/.test(await s.textContent('#orderNote')));
  t.check('the sprint list has the sprint points', await s.$eval('.wiList[data-session="sprint"] li .wiPts', e => e.textContent) === '+8');
  await s.done();

  // Phone, both themes: the preset row stays inside the card.
  for(const theme of ['light', 'dark']){
    const m = await h.openPage('whatif', { width:390, theme }); await h.loaded(m);
    const fit = await m.evaluate(() => { const card = document.getElementById('orderCard').getBoundingClientRect();
      return { inside: [...document.querySelectorAll('#presetBar > *, #presetBar .stepper > *')].every(b => b.getBoundingClientRect().right <= card.right + 0.5), scroll: document.documentElement.scrollWidth }; });
    t.check(`phone ${theme}: Simulated and Form from fit in the card`, fit.inside && fit.scroll <= 390, JSON.stringify(fit));
    await m.done();
  }
};
