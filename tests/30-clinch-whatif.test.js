// #85: the title clinch calculator on the What-If page. The page uses the championship pages' maths and wording
// (F1Common.titleRace / titleRaceText, checked against an independent calculation in 29-clinch-pages): a "Title race"
// box above the lists says what each championship needs at the round being edited, from the standings before it, and a
// live line above each result table plus a 🏆 Champion tag on the champion's row follow the dragged order. Checked on
// constructed near-decided seasons (season files built from the fake fixture) against an independent calculation
// written here: the box's wording, the live line and tag appearing and disappearing with keyboard drags, the
// constructors' title won while the drivers' stays open, a lead that only a draw could close (countback), a final-round
// tie decided on countback, a decided season, a replayed sprint round, never fetching, both themes and the phone fit.
const path = require('path');
module.exports = async (t, h) => {
  const SHOTS = process.env.CLINCH_SHOTS || null; // a folder: save box / table screenshots there
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const base = await buildSnapshot(2026, fakeFetch, Date.now() - 3*60*60*1000);
  const SPRINTS = base.calendar.sprintRounds; // [2,6,11,14,19,23]
  const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];
  const tmpl = base.rounds[0].raceResults.slice().sort((a, b) => a.driverId < b.driverId ? -1 : 1);
  const FRONT = ['d0_0', 'd1_0', 'd2_0', 'd0_1', 'd2_1', 'd1_1'];
  const ALL = [...FRONT, ...tmpl.map(r => r.driverId).filter(id => !FRONT.includes(id))];
  const [A, B, C] = ALL, F = ALL.slice(3);
  const CODE = Object.fromEntries(tmpl.map(r => [r.driverId, r.code]));
  // A round from the top finishers' ids (everyone else follows in ALL's order).
  const session = (top, table, kind) => { const ids = [...top, ...ALL.filter(id => !top.includes(id))];
    return ids.map((id, i) => ({ ...tmpl.find(r => r.driverId === id), position: i+1, points: table[i] || 0, session: kind })); };
  const round = (n, top, spTop) => ({ round: n, raceName: `Round ${n} Grand Prix`, country: base.rounds[0].country,
    raceResults: session(top, GP, 'race'), sprintResults: SPRINTS.includes(n) ? session(spTop || [A, B, C], SP, 'sprint') : null });
  // S: 19 rounds, A leads B by 70 and C by 82; A has 11 Grand Prix wins, B 6.
  const pat = { p2:[B,A,C], p3:[C,A,B], p4:[A,C,B], p5:[B,C,A], p6:[C,B,A] };
  const S = [...Array(11).fill('p4'), ...Array(5).fill('p2'), 'p3', 'p5', 'p6'].map((p, i) => round(i+1, pat[p]));
  // S3: A wins everything, B second: decided long before round 20.
  const S3 = Array.from({length:19}, (_, i) => round(i+1, [A, B]));
  // S4 (20-round calendar): A 10 ahead of B going into the final round.
  const S4 = Array.from({length:19}, (_, i) => round(i+1, i < 10 ? [A, B] : [B, A], [2,6,11,14].includes(i+1) ? [A, B] : [B, A]));
  // S6: A second every time (no wins), B wins 11 Grands Prix and scores nothing in the other 8: A 72 ahead, but B would
  // win countback, so a lead equal to the points left isn't enough.
  const rot = k => [...F.slice(k % F.length), ...F.slice(0, k % F.length)];
  const S6 = Array.from({length:19}, (_, i) => round(i+1, i < 11 ? [B, A, ...rot(i).slice(0, 10)] : [rot(i)[0], A, ...rot(i).slice(1, 10)]));
  const cal = base.calendar, cal20 = { ...cal, totalRounds: 20, sprintRounds: SPRINTS.filter(r => r <= 20) };
  const snap = (rounds, calendar = cal) => ({ ...base, rounds, calendar, complete: false });
  const J = JSON.stringify;

  // ---- Independent calculation (no site code), with the championship pages' rules: decided once every rival is more
  // points behind than are left, or exactly that many when countback is settled even if the rival wins every Grand
  // Prix left; next-race margins one point more than a tie; the earliest round counting a tie as possible. ----
  const idOf = (r, kind) => kind === 'teams' ? r.teamId : r.driverId;
  const maxAt = (r, kind, c) => (kind === 'teams' ? 43 : 25) + (c.sprintRounds.includes(r) ? (kind === 'teams' ? 15 : 8) : 0);
  const leftAfter = (k, kind, c) => { let s = 0; for(let r = k+1; r <= c.totalRounds; r++) s += maxAt(r, kind, c); return s; };
  const ranked = (rounds, upto, kind) => { const t = {}, fin = {};
    rounds.filter(r => r.round <= upto).forEach(r => { [...r.raceResults, ...(r.sprintResults||[])].forEach(q => { t[idOf(q, kind)] = (t[idOf(q, kind)]||0) + q.points; });
      r.raceResults.forEach(q => { const f = fin[idOf(q, kind)] = fin[idOf(q, kind)] || new Array(40).fill(0); f[q.position-1]++; }); });
    const cb = (a, b) => { for(let i = 0; i < 40; i++){ const d = fin[b][i] - fin[a][i]; if(d) return d; } return 0; };
    return { t, fin, order: Object.keys(t).sort((a, b) => t[b] - t[a] || cb(a, b)) }; };
  const safe = (R, a, x, k, kind, c) => { const d = R.t[a] - R.t[x], M = leftAfter(k, kind, c);
    if(d !== M) return d > M;
    if(M === 0) return true;
    const X = R.fin[x].slice(), g = c.totalRounds - k; X[0] += g; if(kind === 'teams') X[1] += g;
    for(let i = 0; i < 10; i++) if(R.fin[a][i] !== X[i]) return R.fin[a][i] > X[i];
    return false; };
  // The title after round k: {champion, clinched, tieWith} or {leader, contenders:[{id, tieOnly}]}.
  const status = (rounds, k, kind, c) => {
    for(let r = 1; r <= k; r++){ const R = ranked(rounds, r, kind), a = R.order[0];
      if(r >= c.totalRounds || R.order.slice(1).every(x => safe(R, a, x, r, kind, c))){
        const RK = ranked(rounds, k, kind); return { champion: a, clinched: r, tieWith: r >= c.totalRounds && RK.t[a] === RK.t[RK.order[1]] ? RK.order[1] : null }; } }
    const R = ranked(rounds, k, kind), a = R.order[0], M = leftAfter(k, kind, c);
    return { leader: a, contenders: R.order.slice(1).filter(x => !safe(R, a, x, k, kind, c)).map(x => ({ id: x, tieOnly: R.t[a] - R.t[x] === M })) }; };
  // Margins the leader needs over each rival at round k+1 (rivals who could matter), and the earliest round otherwise.
  const margins = (rounds, k, kind, c) => { const { t, order } = ranked(rounds, k, kind), P = leftAfter(k+1, kind, c), mx = maxAt(k+1, kind, c);
    return order.slice(1).map(x => ({ id: x, m: P - (t[order[0]] - t[x]) + 1 })).filter(o => o.m > -mx); };
  const earliest = (rounds, k, kind, c) => { const { t, order } = ranked(rounds, k, kind); let add = 0;
    for(let r = k+1; r <= c.totalRounds; r++){ add += maxAt(r, kind, c); if(order.slice(1).every(x => t[order[0]] + add - t[x] >= leftAfter(r, kind, c))) return r; } return c.totalRounds; };
  // The live line's expected text from status() (names: driver codes, short team names).
  const TEAM = { mercedes: 'Mercedes', mclaren: 'McLaren', ferrari: 'Ferrari', red_bull: 'Red Bull' };
  const nm = (kind, id) => kind === 'teams' ? (TEAM[id] || id) : CODE[id];
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length-1] : a[0];
  const lineFor = (st, k, kind, rounds) => { const n = id => nm(kind, id);
    if(st.champion) return st.clinched < k ? `🏆 ${n(st.champion)} is already champion.` : `🏆 With this result, ${n(st.champion)} is champion` + (st.tieWith ? `, level on points with ${n(st.tieWith)} and ahead on countback.` : '.');
    // Open: who can still win is shown by a line in the table (checked separately); the line names only draw-only rivals.
    const tie = st.contenders.filter(x => x.tieOnly).map(x => n(x.id));
    const everyone = st.contenders.length + 1 >= ranked(rounds, k, kind).order.length;
    return (everyone ? 'Title still open: everyone can still win.' : 'Title still open: everyone above the line can still win.') + (tie.length ? ` ${list(tie)} only by drawing level on points, which would go to countback.` : ''); };

  // ---- Page helpers ----
  const text = (pg, sel) => h.text(pg, sel);
  const boxText = (pg, kind) => text(pg, `#wiTitleRace .trMain[data-kind="${kind}"] .trText`);
  const gpOrder = pg => pg.$$eval('.wiList[data-session="gp"] > li', lis => lis.map(li => li.dataset.id || null));
  const champRows = (pg, table) => pg.$$eval(`#${table} tr.champ`, trs => trs.map(tr => tr.dataset.id + ':' + !!tr.querySelector('.champTag')));
  // Moves a driver to a place in the Grand Prix list with the arrow keys on their handle.
  const moveTo = async (pg, id, idx) => { const cur = (await gpOrder(pg)).indexOf(id); await pg.focus(`.wiList[data-session="gp"] li[data-id="${id}"] .wiGrip`);
    for(let i = 0; i < Math.abs(idx - cur); i++) await pg.keyboard.press(idx < cur ? 'ArrowUp' : 'ArrowDown'); };
  // The season with round T taken from the page's current Grand Prix order (no sprint at T unless given).
  const dragged = async (pg, rounds, T) => { const o = await gpOrder(pg), cut = o.indexOf(null), ids = o.filter(Boolean);
    return [...rounds.filter(r => r.round < T), { round: T, raceResults: ids.map((id, i) => ({ ...tmpl.find(r => r.driverId === id), position: i < cut ? i+1 : null, points: i < cut ? (GP[i] || 0) : 0 })),
      sprintResults: null }]; };
  const linkFor = order => 'http://site.test/whatif.html?season=2026&gp=' + [...order, ...ALL.filter(id => !order.includes(id)), '-'].join(',');
  // Places (0-based) for x and y so that x outscores y by exactly d (x ahead of y, x not first unless allowed), and an
  // order with them there (the rest from F).
  const placesFor = (d, minX = 0) => { for(let ix = minX; ix < 10; ix++) for(let iy = ix + 1; iy < 11; iy++) if(GP[ix] - (GP[iy] || 0) === d) return [ix, iy]; return null; };
  const orderWith = (x, ix, y, iy) => { const o = [], f = F.slice(); for(let i = 0; i <= iy; i++) o.push(i === ix ? x : i === iy ? y : f.shift()); return o; };

  // ---- S, slider on round 19: round 20 is being edited ----
  const w = await h.openPage('whatif', { snapshots: { 2026: snap(S) } }); await h.loaded(w);
  const hits = w.apiHits.length;
  t.check('what-if: round 20 is being edited', /Round 20/.test(await text(w, '#orderHeading')));
  const mD = margins(S, 19, 'drivers', cal), mT = margins(S, 19, 'teams', cal);
  const mB = mD.find(o => o.id === B).m, bPos = GP.findIndex(x => 25 - x >= mB) + 1;
  t.check(`independent margins: B ${mB}, C 0; McLaren > 0, Ferrari < 0`, J(mD.map(o => o.id)) === J([B, C]) && mD[1].m === 0 && J(mT.map(o => o.id)) === J(['mclaren', 'ferrari']) && mT[0].m > 0 && mT[1].m < 0, J([mD, mT]));
  const wantD = `${CODE[A]} clinches the title in round 20 by outscoring ${CODE[B]} by ${mB} or more and scoring at least as many points as ${CODE[C]}. For example, a win with ${CODE[B]} P${bPos} or lower.`;
  const wantT = `Mercedes clinches the title in round 20 by outscoring McLaren by ${mT[0].m} or more, unless Ferrari outscores Mercedes by ${1 - mT[1].m} or more.`;
  t.check('box: the drivers\' title in the championship pages\' wording', await boxText(w, 'drivers') === wantD, await boxText(w, 'drivers') + ' ≠ ' + wantD);
  t.check('box: the constructors\' title, points only', await boxText(w, 'teams') === wantT, await boxText(w, 'teams') + ' ≠ ' + wantT);
  t.check('box: labelled "Drivers’ title" / "Constructors’ title", no countback note, no "Every driver" line', J(await w.$$eval('#wiTitleRace .trLabel', l => l.map(x => x.textContent))) === J(['Drivers’ title', 'Constructors’ title'])
    && !(await w.$('#wiTitleRace .trNote')) && !/One point less|Every (driver|team)|after round/.test(await text(w, '#wiTitleRace')), await text(w, '#wiTitleRace'));
  t.check('box: bold names with flags, no What-If link', await w.$$eval('#wiTitleRace .trName', x => x.length) >= 6 && await w.$$eval('#wiTitleRace .trName img.flag', x => x.length) >= 4 && !(await w.$('#wiTitleRace a')));
  const box = await w.$eval('#wiTitleRace', el => { const r = el.getBoundingClientRect(), l = document.getElementById('orders').getBoundingClientRect(); return { above: r.bottom <= l.top, h: r.height, cls: el.className }; });
  t.check('box: the championship pages\' "Title race" box, above the lists, compact', box.above && box.cls === 'titleRace' && box.h < 190, J(box));
  t.check('box: "Drivers’ title" / "Constructors’ title" each on its own line, above its text', await w.$$eval('#wiTitleRace .trMain', ms => ms.every(m => {
    const l = m.querySelector('.trLabel').getBoundingClientRect(), x = m.querySelector('.trText').getClientRects()[0]; return l.bottom <= x.top + 1; })));
  // The same words as the championship pages for the same round (they come from the same helper).
  for(const [page, kind] of [['drivers', 'drivers'], ['constructors', 'teams']]){
    const c = await h.openPage(page, { snapshots: { 2026: snap(S) } }); await h.loaded(c);
    t.check(`box matches the ${page} page's title-race line after round 19`, await text(c, '#titleRace .trText') === await boxText(w, kind), await text(c, '#titleRace .trText'));
    await c.done();
  }

  // Live line and champion tag, keyboard drags.
  const live = async (label, kind = 'drivers') => {
    const rr = await dragged(w, S, 20), st = status(rr, 20, kind, cal), want = lineFor(st, 20, kind, rr);
    return [st, want]; };
  let [st, want] = await live();
  t.check(`standings order: "${want}"`, !st.champion && await text(w, '#clinchDrivers') === want && (await champRows(w, 'driverTable')).length === 0, await text(w, '#clinchDrivers'));
  await moveTo(w, B, bPos - 1);
  [st, want] = await live();
  t.check(`B moved to P${bPos} with the keyboard: A is champion (independent)`, (await gpOrder(w))[bPos - 1] === B && st.champion === A && st.clinched === 20, J(st));
  t.check(`…"🏆 With this result, ${CODE[A]} is champion."`, await text(w, '#clinchDrivers') === `🏆 With this result, ${CODE[A]} is champion.` && want === await text(w, '#clinchDrivers'), await text(w, '#clinchDrivers'));
  t.check('…the name is bold with its flag', await w.$eval('#clinchDrivers .trName', e => getComputedStyle(e).fontWeight >= 600 && !!e.querySelector('img.flag')).catch(() => false));
  t.check('…and the 🏆 Champion tag is on A\'s row only', J(await champRows(w, 'driverTable')) === J([A + ':true']), J(await champRows(w, 'driverTable')));
  t.check('champion tag reads "🏆 Champion" on desktop', (await w.$eval('tr.champ .champTag', el => el.innerText)).replace(/\s+/g, ' ').trim() === '🏆 Champion');
  if(SHOTS) for(const sel of ['#wiTitleRace', '#resultCard']) await w.locator(sel).screenshot({ path: path.join(SHOTS, `whatif-${sel.slice(1)}-1000-light.png`) });
  await w.keyboard.press('ArrowUp');
  [st, want] = await live();
  t.check('B one place up: open again, tag gone', !st.champion && await text(w, '#clinchDrivers') === want && /^Title still open/.test(want) && (await champRows(w, 'driverTable')).length === 0, await text(w, '#clinchDrivers'));
  // A P2, B P7: A exactly the points left ahead of B, and B can't win countback (A 11 wins, B 6 + 3 races left).
  await w.click('#useStandings');
  await moveTo(w, F[0], 0); await moveTo(w, B, 6);
  [st, want] = await live();
  t.check('A P2, B P7: level-at-best with countback already A\'s → champion (independent)', st.champion === A && await text(w, '#clinchDrivers') === `🏆 With this result, ${CODE[A]} is champion.`, J([st, await text(w, '#clinchDrivers')]));
  // Constructors: Mercedes 1-2 with McLaren's cars out of the points → constructors' champion while the drivers' title stays open.
  await w.click('#useStandings');
  await moveTo(w, F[0], 1); await moveTo(w, C, 15); await moveTo(w, F[1], 15);
  const stT = status(await dragged(w, S, 20), 20, 'teams', cal), stD = status(await dragged(w, S, 20), 20, 'drivers', cal);
  t.check('constructors: champion line and tag follow the dragged order (independent)', stT.champion === 'mercedes' && await text(w, '#clinchTeams') === '🏆 With this result, Mercedes is champion.'
    && J(await w.$$eval('#teamTable tr.champ', trs => trs.map(t => t.dataset.id))) === J(['mercedes']), J([stT, await text(w, '#clinchTeams')]));
  t.check('…while the drivers\' title stays open', !stD.champion && await text(w, '#clinchDrivers') === lineFor(stD, 20, 'drivers', await dragged(w, S, 20)) && (await champRows(w, 'driverTable')).length === 0, await text(w, '#clinchDrivers'));
  t.check('…the box above the lists doesn\'t change while dragging', await boxText(w, 'drivers') === wantD && await boxText(w, 'teams') === wantT);
  await w.click('#useStandings');
  t.check('Standings order button: both open again, no tags', /^Title still open/.test(await text(w, '#clinchDrivers')) && /^Title still open/.test(await text(w, '#clinchTeams')) && (await w.$$('tr.champ')).length === 0);
  // Slider to 12 → round 13: can't be decided yet.
  await h.setRound(w, 13);
  const R12 = ranked(S, 12, 'drivers'), e13 = earliest(S, 12, 'drivers', cal);
  t.check(`slider to 12: "…can't be decided before round ${e13} at the earliest."`, await boxText(w, 'drivers') === `${CODE[A]} leads ${CODE[R12.order[1]]} by ${R12.t[A] - R12.t[R12.order[1]]} points. The title can't be decided before round ${e13} at the earliest.`
    && !(await w.$('#wiTitleRace .trNote')), await boxText(w, 'drivers'));
  // Replaying a past sprint round: slider on 18 → round 19 happened (sprint weekend), starts from the actual result.
  await h.setRound(w, 19);
  const m18 = margins(S, 18, 'drivers', cal), st19 = status(S, 19, 'drivers', cal);
  t.check('replay round 19: sprint and Grand Prix lists, from the actual result', /Round 19/.test(await text(w, '#orderHeading')) && J(await w.$$eval('.wiList', u => u.map(x => x.dataset.session))) === J(['sprint', 'gp'])
    && !(await w.$eval('#useActual', b => b.hidden)) && J((await gpOrder(w)).slice(0, 3)) === J(pat.p6));
  t.check(`replay round 19: box from the standings after round 18 (${m18.length ? 'margins' : 'earliest'})`, (await boxText(w, 'drivers')).startsWith(`${CODE[A]} ${m18.every(o => o.m <= 33) ? 'clinches the title in round 19' : 'leads'}`)
    && (m18.every(o => o.m <= 33) || (await boxText(w, 'drivers')).endsWith(`before round ${earliest(S, 18, 'drivers', cal)} at the earliest.`)), await boxText(w, 'drivers'));
  t.check(`replay round 19: the live line is what actually happened ("${lineFor(st19, 19, 'drivers', S.filter(r => r.round <= 19))}")`, await text(w, '#clinchDrivers') === lineFor(st19, 19, 'drivers', S.filter(r => r.round <= 19)), await text(w, '#clinchDrivers'));
  t.check('what-if: drags, keys, buttons and slider never fetch', w.apiHits.length === hits, w.apiHits.slice(hits).join(' '));
  t.check('what-if: no page errors', w.errors.length === 0, w.errors.join('; '));

  // ---- S6: a lead equal to the points left with countback still open (opened from a link with A P4, B P10) ----
  await w.done();
  const w6 = await h.openPage('whatif', { snapshots: { 2026: snap(S6) } }); await h.loaded(w6);
  const R6 = ranked(S6, 19, 'drivers'), need6 = leftAfter(20, 'drivers', cal) - (R6.t[A] - R6.t[B]), p6 = placesFor(need6, 2);
  await w6.goto(linkFor(orderWith(A, p6[0], B, p6[1]))); await h.loaded(w6);
  let s6 = status(await dragged(w6, S6, 20), 20, 'drivers', cal);
  t.check(`S6, A P${p6[0] + 1} and B P${p6[1] + 1}: A exactly the points left ahead, B can only draw level (independent)`, (await gpOrder(w6))[p6[0]] === A && J(s6.contenders) === J([{ id: B, tieOnly: true }]), J([s6, p6, R6.t[A], R6.t[B]]));
  t.check(`…"Title still open: everyone above the line can still win. ${CODE[B]} only by drawing level on points…"`,
    await text(w6, '#clinchDrivers') === `Title still open: everyone above the line can still win. ${CODE[B]} only by drawing level on points, which would go to countback.` && (await champRows(w6, 'driverTable')).length === 0, await text(w6, '#clinchDrivers'));
  await w6.focus(`.wiList[data-session="gp"] li[data-id="${A}"] .wiGrip`); await w6.keyboard.press('ArrowUp');
  s6 = status(await dragged(w6, S6, 20), 20, 'drivers', cal);
  t.check('…A one place up: champion, tag appears', s6.champion === A && await text(w6, '#clinchDrivers') === `🏆 With this result, ${CODE[A]} is champion.` && J(await champRows(w6, 'driverTable')) === J([A + ':true']), await text(w6, '#clinchDrivers'));
  t.check('S6: no page errors', w6.errors.length === 0, w6.errors.join('; '));
  await w6.done();

  // ---- S4: the final round, level on points → countback decides ----
  const w4 = await h.openPage('whatif', { snapshots: { 2026: snap(S4, cal20) } }); await h.loaded(w4);
  const g4 = ranked(S4, 19, 'drivers').t[A] - ranked(S4, 19, 'drivers').t[B];
  t.check(`S4: round 20 is the final round, A may lose up to ${g4 - 1} to B`, /Round 20/.test(await text(w4, '#orderHeading'))
    && (await boxText(w4, 'drivers')).startsWith(`${CODE[A]} clinches the title in round 20, the final round, unless ${CODE[B]} outscores ${CODE[A]} by ${g4} or more.`), await boxText(w4, 'drivers'));
  // B outscores A by exactly the gap.
  const p4 = placesFor(g4);
  await w4.goto(linkFor(orderWith(B, p4[0], A, p4[1]))); await h.loaded(w4);
  const s4 = status(await dragged(w4, S4, 20), 20, 'drivers', cal20);
  t.check(`S4, B P${p4[0] + 1} and A P${p4[1] + 1}: level on points, the countback winner is champion (independent)`, s4.champion && s4.tieWith
    && await text(w4, '#clinchDrivers') === `🏆 With this result, ${CODE[s4.champion]} is champion, level on points with ${CODE[s4.tieWith]} and ahead on countback.`
    && J(await champRows(w4, 'driverTable')) === J([s4.champion + ':true']), J([s4, await text(w4, '#clinchDrivers')]));
  t.check('S4: no page errors', w4.errors.length === 0, w4.errors.join('; '));
  await w4.done();

  // ---- S3: already decided ----
  const wd = await h.openPage('whatif', { snapshots: { 2026: snap(S3) } }); await h.loaded(wd);
  const s3 = status(S3, 19, 'drivers', cal);
  t.check(`decided season: box "🏆 ${CODE[A]} is champion: clinched in round ${s3.clinched}, with ${23 - s3.clinched} rounds to spare."`, await boxText(wd, 'drivers') === `🏆 ${CODE[A]} is champion: clinched in round ${s3.clinched}, with ${23 - s3.clinched} rounds to spare.`, await boxText(wd, 'drivers'));
  t.check('decided season: "🏆 … is already champion.", tag shown', await text(wd, '#clinchDrivers') === `🏆 ${CODE[A]} is already champion.` && J(await champRows(wd, 'driverTable')) === J([A + ':true']), await text(wd, '#clinchDrivers'));
  await wd.done();

  // ---- Both themes, desktop and phone ----
  for(const [width, theme] of [[1000, 'light'], [1000, 'dark'], [390, 'light'], [390, 'dark']]){
    const m = await h.openPage('whatif', { snapshots: { 2026: snap(S) }, width, theme }); await h.loaded(m);
    await moveTo(m, B, bPos - 1);
    const tag = await m.$eval('tr.champ .champTag', el => { const r = el.getBoundingClientRect(), td = el.closest('td').getBoundingClientRect(); return { txt: el.innerText.trim(), inside: r.right <= td.right + 0.5 }; });
    t.check(`${width}px ${theme}: no sideways scroll, the box and lines wrap inside the card`, await m.evaluate(w => document.documentElement.scrollWidth <= w
      && ['wiTitleRace', 'clinchDrivers', 'clinchTeams'].every(id => { const el = document.getElementById(id); return el.scrollWidth <= el.clientWidth + 1; }), width));
    t.check(`${width}px ${theme}: champion tag ${width > 600 ? '"🏆 Champion"' : 'is just the trophy'}, fully visible`, tag.inside && tag.txt.replace(/\s+/g, ' ') === (width > 600 ? '🏆 Champion' : '🏆'), J(tag));
    t.check(`${width}px ${theme}: the box takes the theme's inset colour`, await m.$eval('#wiTitleRace', el => getComputedStyle(el).backgroundColor) === (theme === 'dark' ? 'rgb(15, 18, 22)' : 'rgb(241, 239, 232)'));
    await h.screenshot(m, `clinch-whatif-${width}-${theme}.png`);
    if(SHOTS) for(const sel of ['#wiTitleRace', '#resultCard']) await m.locator(sel).screenshot({ path: path.join(SHOTS, `whatif-${sel.slice(1)}-${width}-${theme}.png`) });
    t.check(`${width}px ${theme}: no page errors`, m.errors.length === 0, m.errors.join('; '));
    await m.done();
  }

  // ==== The "🏆 Title clinch" preset, links that start from it, and the full "can still win" list ====
  // Constructed seasons (tests/lib/clinch.js, with its own independent calculation): drivers' title only, constructors'
  // only, both, none, and a sprint weekend where the Grand Prix alone can't do it.
  const K = require('./lib/clinch');
  const kit = await K.seasonKit();
  const [kA, kB, kC, kA2] = kit.ALL; // d0_0 (Mercedes), d1_0 (Ferrari), d2_0 (McLaren), d0_1 (Mercedes)
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
  const SC = {
    drivers: mk(17, r => kit.round(r, [kA, kB])),
    teams: mk(17, r => kit.round(r, r % 3 === 0 ? [kA, kA2, kB] : r % 3 === 1 ? [kB, kA2, kA] : [kA2, kB, kA])),
    both: mk(17, r => kit.round(r, r % 3 === 0 ? [kA, kA2, kB] : [kA, kB])),
    none: mk(17, r => kit.round(r, [[kA, kB, kC], [kB, kC, kA], [kC, kA, kB]][r % 3])),
    sprint: mk(18, r => kit.round(r, [1, 3, 4, 5, 7].includes(r) ? [kC, kB, kA] : [kA, kB, kC])),
  };
  const lists = pg => pg.$$eval('.wiList', uls => Object.fromEntries(uls.map(u => [u.dataset.session, [...u.children].map(li => li.dataset.id || null)])));
  // The season with round T from the page's lists (Grand Prix and sprint), built here from the fixture's rows.
  const fromLists = (rounds, T, o) => { const sess = (ids, table, kind) => { const cut = ids.indexOf(null);
      return ids.filter(Boolean).map((id, i) => ({ ...kit.row(id), position: i < cut ? i + 1 : null, points: i < cut ? (table[i] || 0) : 0, session: kind })); };
    return [...rounds.filter(r => r.round < T), { round: T, raceResults: sess(o.gp, K.GP, 'race'), sprintResults: o.sprint ? sess(o.sprint, K.SP, 'sprint') : null }]; };
  const standingIds = (rounds, L) => K.ranked(rounds, L, 'drivers').order;
  for(const [name, rounds] of Object.entries(SC)){
    const L = rounds.length, T = L + 1;
    const can = { drivers: K.canClinchNext(rounds, L, 'drivers', kit.cal), teams: K.canClinchNext(rounds, L, 'teams', kit.cal) };
    const want = { none: [], drivers: ['drivers'], teams: ['teams'], both: ['drivers', 'teams'], sprint: ['drivers', 'teams'] }[name];
    t.check(`clinch preset, "${name}" season: the scenario (independent: who can clinch at round ${T})`, J(['drivers', 'teams'].filter(k => can[k].length)) === J(want), J(can));
    const pg = await h.openPage('whatif', { snapshots: { 2026: kit.snap(rounds) } }); await h.loaded(pg);
    const hits0 = pg.apiHits.length;
    const shown = await pg.$eval('#useClinch', b => !b.hidden);
    t.check(`"${name}": the "🏆 Title clinch" button ${want.length ? 'shows' : 'is hidden'}`, shown === !!want.length && (!shown || await text(pg, '#useClinch') === '🏆 Title clinch'));
    const std = await lists(pg);
    t.check(`"${name}": opened normally, it still starts from the standings order`, J(std.gp) === J([...standingIds(rounds, L), null]) && !new URL(pg.url()).searchParams.has('start'), pg.url());
    if(shown){
      await pg.click('#useClinch');
      const o = await lists(pg), after = fromLists(rounds, T, o);
      const st = { drivers: K.status(after, T, 'drivers', kit.cal), teams: K.status(after, T, 'teams', kit.cal) };
      t.check(`"${name}": the preset order clinches ${want.join(' and ')} at round ${T} (standings computed here)`, want.every(k => st[k].champion === can[k][0] && st[k].clinched === T), J(st));
      t.check(`"${name}": …and the page says so`, (await Promise.all(want.map(async k => /^🏆 With this result, .+ is champion\.$/.test(await text(pg, k === 'teams' ? '#clinchTeams' : '#clinchDrivers'))))).every(Boolean));
      // Close to the standings order: the clincher first, and everyone the clinch doesn't involve keeps their order.
      const rivals = new Set();
      want.forEach(k => { const R = K.ranked(rounds, L, k), c = can[k][0], P = K.leftAfter(T, k, kit.cal), mx = (k === 'teams' ? 43 : 25) + (kit.cal.sprintRounds.includes(T) ? (k === 'teams' ? 15 : 8) : 0);
        R.order.filter(x => x !== c && P - (R.t[c] - R.t[x]) + 1 > -mx).forEach(x => { if(k === 'drivers') rivals.add(x); else kit.tmpl.filter(r => r.teamId === x).forEach(r => rivals.add(r.driverId)); });
        if(k === 'drivers') rivals.add(c); else kit.tmpl.filter(r => r.teamId === c).forEach(r => rivals.add(r.driverId)); });
      const keep = ids => ids.filter(id => id && !rivals.has(id));
      t.check(`"${name}": everyone else keeps the standings order`, J(keep(o.gp)) === J(keep(standingIds(rounds, L))) && (want.includes('drivers') ? o.gp[0] === can.drivers[0] : kit.row(o.gp[0]).teamId === can.teams[0]), J(o.gp.slice(0, 12)));
      if(name === 'sprint'){
        const b = K.ranked(rounds, L, 'drivers'), need = K.leftAfter(T, 'drivers', kit.cal) - (b.t[kA] - b.t[kB]) + 1;
        t.check(`sprint weekend: ${kit.CODE[kA]} must outscore ${kit.CODE[kB]} by ${need} (> 25), so the sprint is set too`, need > 25 && o.sprint && J(o.sprint) !== J(std.sprint) && o.sprint[0] === kA, J([need, o.sprint && o.sprint.slice(0, 6)]));
      } else t.check(`"${name}": no sprint at round ${T}, one list`, !o.sprint);
      await pg.click('#useStandings');
      t.check(`"${name}": Standings order goes back`, J((await lists(pg)).gp) === J(std.gp));
    }
    t.check(`"${name}": the preset never fetches`, pg.apiHits.length === hits0, pg.apiHits.slice(hits0).join(' '));
    t.check(`"${name}": no page errors`, pg.errors.length === 0, pg.errors.join('; '));
    await pg.done();
  }

  // Links: the drivers' page "Try it in What-If →" opens What-If starting from the clinch order (start=clinch), and the
  // URL round-trips through Share; moving the slider drops it.
  {
    const rounds = SC.drivers, L = rounds.length, T = L + 1;
    const dp = await h.openPage('drivers', { snapshots: { 2026: kit.snap(rounds) } }); await h.loaded(dp);
    t.check('drivers page link: whatif.html?season=2026&start=clinch', await dp.$eval('#titleRace .trLink', a => a.getAttribute('href')).catch(() => null) === 'whatif.html?season=2026&start=clinch');
    await dp.click('#titleRace .trLink'); await h.loaded(dp); await dp.waitForTimeout(80);
    const o = await lists(dp), st = K.status(fromLists(rounds, T, o), T, 'drivers', kit.cal);
    t.check('…What-If starts from an order that clinches it (standings computed here)', st.champion === kA && st.clinched === T && /^🏆 With this result/.test(await text(dp, '#clinchDrivers')), J(st));
    t.check('…the URL keeps start=clinch and no order (it is the starting order)', /\/whatif\.html\?season=2026&start=clinch$/.test(dp.url()), dp.url());
    t.check('…the note says where it started', /^Starts from a finishing order with which \S+ clinches the drivers’ title\./.test(await text(dp, '#orderNote')), await text(dp, '#orderNote'));
    // Same order as the button gives when What-If is opened normally.
    const plain = await h.openPage('whatif', { snapshots: { 2026: kit.snap(rounds) } }); await h.loaded(plain);
    await plain.click('#useClinch');
    t.check('…the same order as the "🏆 Title clinch" button', J(await lists(plain)) === J(o));
    await plain.done();
    // Drag one place: the order goes into the URL beside start=clinch, and Share's link reopens it exactly.
    const third = o.gp[2];
    await dp.focus(`.wiList[data-session="gp"] li[data-id="${third}"] .wiGrip`); await dp.keyboard.press('ArrowDown'); await dp.waitForTimeout(80);
    const moved = await lists(dp), shared = await dp.evaluate(() => F1Share.url());
    t.check('drag: the order and start=clinch in the URL (and Share\'s link)', new URL(dp.url()).searchParams.get('start') === 'clinch' && new URL(dp.url()).searchParams.get('gp') === moved.gp.map(x => x || '-').join(',') && dp.url().endsWith(shared), shared);
    const again = await h.openPage('whatif', { snapshots: { 2026: kit.snap(rounds) } }); await again.goto('http://site.test' + shared); await h.loaded(again); await again.waitForTimeout(80);
    t.check('…opening that link gives the same order and URL', J(await lists(again)) === J(moved) && again.url().endsWith(shared), again.url());
    await again.click('#useClinch'); await again.waitForTimeout(80);
    t.check('…and the 🏆 button there goes back to the link\'s start: the order leaves the URL', J(await lists(again)) === J(o) && !new URL(again.url()).searchParams.has('gp') && new URL(again.url()).searchParams.get('start') === 'clinch', again.url());
    await again.done();
    // The slider moved back: a normal start again (standings order), start= gone; interactions never fetched.
    const hitsL = dp.apiHits.length;
    await h.setRound(dp, L); await dp.waitForTimeout(80);
    t.check('slider moved: back to the normal start, start=clinch leaves the URL', J((await lists(dp)).gp) === J([...standingIds(rounds, L - 1), null]) && !new URL(dp.url()).searchParams.has('start'), dp.url());
    t.check('links and slider: no fetches after the page load', dp.apiHits.length === hitsL);
    t.check('links: no page errors', dp.errors.length === 0, dp.errors.join('; '));
    await dp.done();
    // An old link where nobody can clinch any more: the normal start, and start= dropped.
    const stale = await h.openPage('whatif', { snapshots: { 2026: kit.snap(SC.none) } }); await stale.goto('http://site.test/whatif.html?season=2026&start=clinch'); await h.loaded(stale); await stale.waitForTimeout(80);
    t.check('start=clinch where no title can be won: normal start, start dropped', J((await lists(stale)).gp) === J([...standingIds(SC.none, 17), null]) && !new URL(stale.url()).searchParams.has('start'), stale.url());
    await stale.done();
  }

  // Who can still win: a line in the drivers' table under the last of them (the fake season after round 12, round 13 in
  // standings order: many can still win), everyone below it out; checked against the independent status().
  {
    const { api } = require('./lib/fixture');
    const fx = []; for(let r = 1; r <= 12; r++){ const g = api(`https://api.jolpi.ca/ergast/f1/2026/${r}/results.json`).body.MRData.RaceTable.Races[0], s = api(`https://api.jolpi.ca/ergast/f1/2026/${r}/sprint.json`).body.MRData.RaceTable.Races[0];
      const norm = (rows, kind) => rows.map(q => ({ ...kit.row(q.Driver.driverId), position: /^\d+$/.test(q.positionText) ? parseInt(q.positionText, 10) : null, points: +q.points, session: kind }));
      fx.push({ round: r, raceResults: norm(g.Results, 'race'), sprintResults: s ? norm(s.SprintResults, 'sprint') : null }); }
    // The fake season: everyone can still win, so no line, and the live line says so.
    { const fp = await h.openPage('whatif'); await h.loaded(fp);
      const st = K.status(fromLists(fx, 13, await lists(fp)), 13, 'drivers', kit.cal);
      t.check('everyone can still win (fake season, round 13): no line, "Title still open: everyone can still win."', st.contenders.length === 21
        && !(await fp.$('#driverTable tr.outLine')) && await text(fp, '#clinchDrivers') === 'Title still open: everyone can still win.', await text(fp, '#clinchDrivers'));
      await fp.done(); }
    for(const [width, theme] of [[1000, 'light'], [390, 'dark'], [390, 'light'], [1000, 'dark']]){
      const lp = await h.openPage('whatif', { width, theme, snapshots: { 2026: snap(S) } }); await h.loaded(lp);
      const st = status(await dragged(lp, S, 20), 20, 'drivers', cal);
      const inIds = [st.leader, ...st.contenders.map(c => c.id)];
      const tbl = await lp.$$eval('#driverTable tr', trs => trs.slice(1).map(tr => tr.classList.contains('outLine') ? '|' : tr.dataset.id));
      const cut = tbl.indexOf('|'), above = tbl.slice(0, cut), below = tbl.slice(cut + 1);
      if(width === 1000 && theme === 'light'){
        t.check(`line in the table: ${inIds.length} can still win (independent), the rest can't`, inIds.length > 1 && inIds.length < tbl.length - 1, J(inIds.map(id => CODE[id])));
        t.check('line in the table: exactly one line, everyone above can still win, everyone below is out', tbl.filter(x => x === '|').length === 1
          && J([...above].sort()) === J([...inIds].sort()) && below.every(id => !inIds.includes(id)) && below.length > 0, J({ above, inIds }));
        t.check('line in the table: "Can still win the title" above the dashed line, "Out of contention" below it', await lp.$eval('#driverTable tr.outLine', tr => {
          const i = tr.querySelector('.olIn'), o = tr.querySelector('.olOut'), ci = getComputedStyle(i);
          return /Can still win the title/.test(i.textContent) && /Out of contention/.test(o.textContent) && ci.borderBottomStyle === 'dashed'
            && i.getBoundingClientRect().bottom <= o.getBoundingClientRect().top + 1; }));
        t.check('line in the table: labelled, and the live line points to it (no list of names)', /Can still win the title/.test(await text(lp, '#driverTable tr.outLine'))
          && await text(lp, '#clinchDrivers') === 'Title still open: everyone above the line can still win.' && !(await lp.$('#clinchDrivers .trName')), await text(lp, '#clinchDrivers'));
      }
      const fit = await lp.evaluate(() => { const td = document.getElementById('driverTable').getBoundingClientRect(), l = document.querySelector('#driverTable tr.outLine').getBoundingClientRect();
        return { right: l.right, tableRight: td.right, scroll: document.documentElement.scrollWidth }; });
      t.check(`line in the table ${width}px ${theme}: fits, no sideways scroll`, fit.right <= fit.tableRight + 1 && fit.scroll <= width, J(fit));
      await h.screenshot(lp, `clinch-whatif-line-${width}-${theme}.png`);
      if(SHOTS) await lp.locator('#resultCard').screenshot({ path: path.join(SHOTS, `whatif-line-${width}-${theme}.png`) });
      await lp.done();
    }
  }

  // The preset applied, both themes, desktop and phone (the presets row wraps on phones).
  for(const [width, theme] of [[1000, 'light'], [1000, 'dark'], [390, 'light'], [390, 'dark']]){
    const m = await h.openPage('whatif', { snapshots: { 2026: kit.snap(SC.sprint) }, width, theme }); await h.loaded(m);
    await m.click('#useClinch');
    const fit = await m.evaluate(() => { const bar = document.getElementById('presetBar').getBoundingClientRect(), card = document.getElementById('orderCard').getBoundingClientRect();
      return { inside: [...document.querySelectorAll('#presetBar > *')].every(b => b.getBoundingClientRect().right <= card.right + 0.5), scroll: document.documentElement.scrollWidth, h: bar.height }; });
    t.check(`preset ${width}px ${theme}: the presets fit the card, no sideways scroll`, fit.inside && fit.scroll <= width, J(fit));
    await h.screenshot(m, `clinch-whatif-preset-${width}-${theme}.png`);
    if(SHOTS){ await m.locator('#orderCard').screenshot({ path: path.join(SHOTS, `whatif-preset-order-${width}-${theme}.png`) }); await m.locator('#resultCard').screenshot({ path: path.join(SHOTS, `whatif-preset-result-${width}-${theme}.png`) }); }
    t.check(`preset ${width}px ${theme}: no page errors`, m.errors.length === 0, m.errors.join('; '));
    await m.done();
  }
};
