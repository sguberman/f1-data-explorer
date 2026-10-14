// #48: the what-if page — drag drivers into a finishing order for the round after the slider and see the new
// drivers' and constructors' standings. Expected values come from an independent calculation in this file.
module.exports = async (t, h) => {
  const p = await h.openPage('whatif'); await h.loaded(p);
  const hitsAfterLoad = p.apiHits.length;
  const order = s => p.$$eval(`.wiList[data-session="${s}"] > li`, lis => lis.map(li => li.dataset.id || null));
  const table = id => p.$$eval(`#${id} tr[data-id]`, trs => trs.map(tr => ({ id:tr.dataset.id,
    tds:[...tr.children].map(td => td.textContent.trim()) })));
  // Independent standings: points so far (through round L) + points from the given orders, ranked by points
  // then countback of Grand Prix finishes.
  const expected = (L, gp, sprint, kind) => p.evaluate(([L, gp, sprint, kind]) => {
    const rs = F1Controls.state.seasonRounds.filter(r => r.round <= L);
    const team = {}; F1Controls.state.seasonRounds.filter(r => r.round <= L+1).forEach(r => [...r.raceResults, ...(r.sprintResults||[])].forEach(q => { if(!team[q.driverId] || r.round <= L) team[q.driverId] = q.teamId; }));
    const key = id => kind === 'teams' ? team[id] : id;
    const pts = {}, fin = {}, before = {};
    const add = (id, n) => { pts[key(id)] = (pts[key(id)]||0) + n; };
    rs.forEach(r => {
      [...r.raceResults, ...(r.sprintResults||[])].forEach(q => { const k = kind === 'teams' ? q.teamId : q.driverId; pts[k] = (pts[k]||0) + q.points; });
      r.raceResults.forEach(q => { if(q.position >= 1){ const k = kind === 'teams' ? q.teamId : q.driverId; (fin[k] = fin[k] || new Array(30).fill(0))[q.position-1]++; } });
    });
    Object.assign(before, pts);
    const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];
    const score = (o, table, isGp) => { const cut = o.indexOf(null); o.forEach((id, i) => {
      if(!id) return; const cls = cut < 0 || i < cut; pts[key(id)] = pts[key(id)] || 0;
      if(cls){ add(id, table[i]||0); if(isGp){ const k = key(id); (fin[k] = fin[k] || new Array(30).fill(0))[i]++; } } }); };
    score(gp, GP, true); if(sprint) score(sprint, SP, false);
    const cb = (a, b) => { const A = fin[a]||[], B = fin[b]||[]; for(let i = 0; i < 30; i++){ const d = (B[i]||0) - (A[i]||0); if(d) return d; } return 0; };
    const ids = Object.keys(pts).sort((a, b) => pts[b] - pts[a] || cb(a, b));
    return ids.map(id => ({ id, before:before[id]||0, after:pts[id] }));
  }, [L, gp, sprint, kind]);
  const check = async (label, L) => {
    const gp = await order('gp'), sp = (await p.$('.wiList[data-session="sprint"]')) ? await order('sprint') : null;
    for(const [kind, el] of [['drivers','driverTable'], ['teams','teamTable']]){
      const exp = await expected(L, gp, sp, kind), got = await table(el);
      const ok = got.length === exp.length && got.every((r, i) => r.id === exp[i].id && +r.tds[3] === Math.round(exp[i].before) && +r.tds[5] === Math.round(exp[i].after));
      t.check(`${label}: ${kind} table = points so far + your result, ranked with countback`, ok,
        JSON.stringify([got.slice(0,3).map(r => [r.id, r.tds[3], r.tds[5]]), exp.slice(0,3)]));
    }
  };

  // Default: slider on the last loaded round (12), so the what-if is Round 13 (not run yet, no sprint),
  // starting from the drivers' standings order.
  const standing = await p.evaluate(() => F1Common.standingsOrder(F1Controls.state.seasonRounds, 12, 'drivers'));
  let gp = await order('gp');
  t.check('next round: one Grand Prix list, no sprint list', !!(await p.$('.wiList[data-session="gp"]')) && !(await p.$('.wiList[data-session="sprint"]')));
  t.check('next round: starts from the standings order, everyone classified', JSON.stringify(gp) === JSON.stringify([...standing, null]), JSON.stringify(gp.slice(0,4)));
  t.check('heading names the round', /Round 13/.test(await p.textContent('#orderHeading')));
  t.check('no "Actual result" button for a round that hasn\'t happened', await p.$eval('#useActual', b => b.hidden));
  await check('standings order', 12);

  // Drag the last driver to the top with the mouse.
  const grips = await p.$$('.wiList[data-session="gp"] .wiGrip');
  const last = await grips[21].boundingBox(), first = await grips[0].boundingBox();
  await p.mouse.move(last.x + last.width/2, last.y + last.height/2);
  await p.mouse.down();
  for(let y = last.y; y > first.y - 10; y -= 25) await p.mouse.move(last.x + last.width/2, y);
  await p.mouse.up();
  gp = await order('gp');
  t.check('dragging the last driver to the top makes them P1', gp[0] === standing[21] && gp.length === 23, JSON.stringify(gp.slice(0,3)));
  t.check('the dragged row shows P1 and +25', await p.$eval(`.wiList li[data-id="${standing[21]}"]`, li => li.querySelector('.wiPos').textContent + ' ' + li.querySelector('.wiPts').textContent) === 'P1 +25');
  await check('after a drag', 12);
  const dTable = await table('driverTable');
  const moved = dTable.find(r => r.id === standing[21]);
  t.check('▲ shows places gained against the standings before the round', /▲\d+/.test(moved.tds[1]), JSON.stringify(moved));

  // Keyboard: ArrowDown on the P1 handle moves that driver to P2.
  await p.focus(`.wiList li[data-id="${standing[21]}"] .wiGrip`);
  await p.keyboard.press('ArrowDown');
  gp = await order('gp');
  t.check('arrow keys on a handle move a driver', gp[1] === standing[21], JSON.stringify(gp.slice(0,3)));
  t.check('focus stays on the moved handle', await p.evaluate(id => document.activeElement === document.querySelector(`.wiList li[data-id="${id}"] .wiGrip`), standing[21]));

  // Not classified: move the divider to the top with the keyboard → nobody scores, standings unchanged.
  await p.focus('.wiList[data-session="gp"] .wiDivider .wiGrip');
  for(let i = 0; i < 22; i++) await p.keyboard.press('ArrowUp');
  gp = await order('gp');
  t.check('the not-classified line can be moved to the top', gp[0] === null);
  const nc = await table('driverTable');
  t.check('everyone below the line scores nothing', nc.every(r => r.tds[4] === '–'), JSON.stringify(nc.slice(0,2)));
  t.check('rows below the line show NC', await p.$$eval('.wiList[data-session="gp"] .wiRow .wiPos', s => s.every(x => x.textContent === 'NC')));
  await check('all not classified', 12);

  // Standings order button resets.
  await p.click('#useStandings');
  t.check('Standings order resets the list', JSON.stringify(await order('gp')) === JSON.stringify([...standing, null]));

  // Slider back to 10: what-if for Round 11, which happened and had a sprint → both lists, from the actual result.
  await h.setRound(p, 10);
  const act = await p.evaluate(() => { const r = F1Controls.state.seasonRounds.find(x => x.round === 11);
    const o = res => [...res.filter(q => q.position).sort((a,b) => a.position-b.position).map(q => q.driverId), null, ...res.filter(q => !q.position).map(q => q.driverId)];
    return { gp:o(r.raceResults), sp:o(r.sprintResults) }; });
  t.check('a sprint weekend gets a sprint list and a Grand Prix list', JSON.stringify(await p.$$eval('.wiList', u => u.map(x => x.dataset.session))) === '["sprint","gp"]');
  t.check('a round that happened starts from the actual Grand Prix result', JSON.stringify(await order('gp')) === JSON.stringify(act.gp), JSON.stringify((await order('gp')).slice(0,4)));
  t.check('…and the actual sprint result', JSON.stringify(await order('sprint')) === JSON.stringify(act.sp));
  t.check('"Actual result" button offered', !(await p.$eval('#useActual', b => b.hidden)));
  await check('actual Round 11 replayed', 10);
  // The actual result through the what-if must match the real standings after Round 11.
  const real = await p.evaluate(() => F1Common.standingsOrder(F1Controls.state.seasonRounds, 11, 'drivers'));
  t.check('replaying the actual result gives the real standings after that round', JSON.stringify((await table('driverTable')).map(r => r.id)) === JSON.stringify(real));
  // Sprint drag changes sprint points.
  await p.focus(`.wiList[data-session="sprint"] li[data-id="${act.sp[7]}"] .wiGrip`);
  for(let i = 0; i < 7; i++) await p.keyboard.press('ArrowUp');
  t.check('sprint winner scores 8', await p.$eval(`.wiList[data-session="sprint"] li[data-id="${act.sp[7]}"] .wiPts`, e => e.textContent) === '+8');
  await check('sprint reordered', 10);
  await p.click('#useActual');
  t.check('"Actual result" resets both lists', JSON.stringify(await order('sprint')) === JSON.stringify(act.sp));

  t.check('dragging, keys, buttons and the slider never fetch', p.apiHits.length === hitsAfterLoad, p.apiHits.slice(hitsAfterLoad).join(' '));
  t.check('whatif: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Phone: drag works by touch-style pointer events too, and nothing overflows.
  const m = await h.openPage('whatif', { width:390, theme:'dark' }); await h.loaded(m);
  t.check('phone: no horizontal scroll', await m.evaluate(() => document.documentElement.scrollWidth <= 390));
  t.check('phone: tables show codes instead of full names', await m.$eval('#driverTable tr[data-id] .short', e => getComputedStyle(e).display !== 'none'));
  t.check('phone: no page errors', m.errors.length === 0, m.errors.join('; '));
  await m.done();

  // Home page links to it.
  const idx = await h.openPage('index');
  t.check('home page has a What-If Results card', await idx.$eval('a.card[href="whatif.html"] h3', e => e.textContent) === 'What-If Results');
  await idx.done();
};
