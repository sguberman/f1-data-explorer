// #89: the homepage shows the next Grand Prix (name, flag, local date and time, sprint tag, countdown) from the
// newest season's calendar, with a fixed clock. Fixture calendar (lib/fixture.js): round 18 on 2026-10-25 13:00Z
// (Singapore), round 19 on 2026-11-01 (sprint), round 22 date only (2026-11-29), round 23 the last (2026-12-06).
// #85: the location line (circuit city and country) and the title-clinch lines on constructed seasons (lib/clinch.js).
module.exports = async (t, h) => {
  const J = JSON.stringify;
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const snap = await buildSnapshot(2026, fakeFetch);

  const open = (now, opts={}) => h.openPage('index', { now, timezone:'UTC', locale:'en-US', snapshots:{ 2026: snap }, ...opts });
  const settle = p => p.waitForFunction(() => !document.getElementById('nextRace').hidden, null, {timeout:5000}).catch(() => {});
  const strip = p => p.evaluate(() => {
    const el = document.getElementById('nextRace'), q = s => { const e = el.querySelector(s); return e ? e.textContent.replace(/\s+/g,' ').trim() : null; };
    const flag = el.querySelector('.nr-name img.flag');
    return { hidden: el.hidden, kicker: q('.nr-kicker'), name: q('.nr-name'), tag: q('.nr-tag'), count: q('.nr-count'), when: q('.nr-when'),
      flag: flag ? flag.getAttribute('src') : null, link: (el.querySelector('a') || {}).href || null };
  });

  // The right next round, "in N days", a time, the circuit's flag, and no f1api.dev requests (the season file has it).
  let p = await open('2026-10-15T12:00:00Z'); await settle(p);
  let s = await strip(p);
  t.check('next race: round 18 on Oct 15', !s.hidden && /Next race · Round 18/i.test(s.kicker) && /Round 18 Grand Prix/.test(s.name), JSON.stringify(s));
  t.check('countdown: "in 10 days"', s.count === 'in 10 days', s.count);
  t.check('date and time in the visitor\'s time zone', s.when === 'Sun, Oct 25 · 1:00 PM UTC', s.when);
  t.check('the circuit country\'s flag', s.flag === 'flags/sg.svg', s.flag);
  t.check('no sprint tag on a normal weekend', s.tag === null);
  // #85: the season is loaded too (for the clinch line): the same season file, once, and f1api.dev only for the site's
  // once-a-day check of the round after the file (round 13 here). The calendar itself needs no request.
  await p.waitForTimeout(300);
  t.check('the season file\'s calendar is used: the file once, f1api.dev only for the daily check of round 13', p.snapshotHits.length === 1
    && p.apiHits.length <= 2 && p.apiHits.every(u => /\/api\/2026\/13\/(race|sprint\/race)$/.test(u)), p.apiHits.join(' '));
  // interactions never fetch: open and use the theme menu
  const hits = p.apiHits.length + p.snapshotHits.length;
  await p.click('.theme-trigger').catch(() => {}); await p.click('.theme-menu button:last-child').catch(() => {}); await p.waitForTimeout(150);
  t.check('using the theme menu fetches nothing', p.apiHits.length + p.snapshotHits.length === hits);
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Short race names: no "Formula 1", title sponsor or year, as f1api.dev's real names have.
  for(const [full, short] of [['Formula 1 Singapore Airlanes Singapore Grand Prix 2026', 'Singapore Grand Prix'],
    ['Formula 1 MSC Cruises Gran Premio de La Ciudad de México 2026', 'Gran Premio de La Ciudad de México'], ['Las Vegas Grand Prix', 'Las Vegas Grand Prix']]){
    const named = { ...snap, calendar: { ...snap.calendar, raceNames: { ...snap.calendar.raceNames, 18: full } } };
    p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: named } }); await settle(p); s = await strip(p);
    t.check(`short name: "${full}" → "${short}"`, s.name === short, s.name);
    await p.done();
  }

  // Countdown wording through the weekend.
  for(const [now, kicker, count, round] of [
    ['2026-10-22T12:00:00Z', 'Next race', 'in 3 days', 18],
    ['2026-10-23T08:00:00Z', 'This weekend', 'in 2 days', 18],
    ['2026-10-24T23:30:00Z', 'This weekend', 'Tomorrow', 18],
    ['2026-10-25T00:10:00Z', 'This weekend', 'Today', 18],
    ['2026-10-25T14:00:00Z', 'This weekend', 'Under way', 18],
    ['2026-10-25T17:30:00Z', 'Next race', 'in 7 days', 19], // the race is over: on to the next one
  ]){
    p = await open(now); await settle(p); s = await strip(p);
    t.check(`${now}: "${kicker} · Round ${round}", "${count}"`, s.kicker === `${kicker} · Round ${round}` && s.count === count, `${s.kicker} / ${s.count}`);
    await p.done();
  }

  // Sprint weekend tag.
  p = await open('2026-10-27T12:00:00Z'); await settle(p); s = await strip(p);
  t.check('sprint round gets a "Sprint weekend" tag', s.tag === 'Sprint weekend' && /Round 19/.test(s.kicker), JSON.stringify(s));
  await p.done();

  // A round with a date but no time: date only, counted by the local calendar day.
  p = await open('2026-11-25T20:00:00Z'); await settle(p); s = await strip(p);
  t.check('date-only round: date without a time, "in 4 days"', /Round 22/.test(s.kicker) && s.when === 'Sun, Nov 29' && s.count === 'in 4 days', JSON.stringify(s));
  await p.done();

  // Local time zone: round 1 starts 2026-03-08 05:00Z, which is Saturday evening in Los Angeles. On Thursday
  // Mar 5 that's "in 2 days" there, but "in 3 days" in UTC.
  p = await open('2026-03-05T12:00:00Z', { timezone:'America/Los_Angeles' }); await settle(p); s = await strip(p);
  t.check('time zone: Los Angeles sees Saturday 9 PM and "in 2 days"', s.when === 'Sat, Mar 7 · 9:00 PM PST' && s.count === 'in 2 days' && /Round 1$/.test(s.kicker), JSON.stringify(s));
  await p.done();
  p = await open('2026-03-05T12:00:00Z'); await settle(p); s = await strip(p);
  t.check('time zone: UTC sees Sunday 5 AM and "in 3 days"', s.when === 'Sun, Mar 8 · 5:00 AM UTC' && s.count === 'in 3 days', JSON.stringify(s));
  await p.done();

  // After the final round: "Season complete", linking to the final standings.
  p = await open('2026-12-07T12:00:00Z'); await settle(p); s = await strip(p);
  t.check('after the last race: "2026 season · Season complete"', !s.hidden && /2026 season/i.test(s.kicker) && s.name === 'Season complete' && s.count === null, JSON.stringify(s));
  t.check('…linking to the final standings', /drivers\.html$/.test(s.link || ''), s.link);
  await p.done();
  p = await open('2026-12-07T12:00:00Z', { width:390, theme:'dark' }); await settle(p);
  await h.screenshot(p, 'next-race-complete-390-dark.png');
  await p.done();

  // No season file: the calendar comes from f1api.dev, one request.
  p = await open('2026-10-15T12:00:00Z', { snapshots:{} }); await settle(p); s = await strip(p);
  t.check('no season file: calendar from f1api.dev in one request', !s.hidden && /Round 18/.test(s.kicker) && p.apiHits.filter(u => /\/api\/2026\?/.test(u)).length === 1, p.apiHits.join(' '));
  await p.done();

  // A season file made before #89 (no race dates): falls back to f1api.dev's calendar.
  const old = { ...snap, calendar: { totalRounds: snap.calendar.totalRounds, sprintRounds: snap.calendar.sprintRounds, raceNames: snap.calendar.raceNames } };
  p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: old } }); await settle(p); s = await strip(p);
  t.check('season file without dates: falls back to f1api.dev\'s calendar', !s.hidden && /Round 18/.test(s.kicker) && p.apiHits.filter(u => /\/api\/2026\?/.test(u)).length === 1, p.apiHits.join(' '));
  await p.done();

  // Failure: no file and f1api.dev down → nothing shown, cards in place, no errors.
  p = await open('2026-10-15T12:00:00Z', { snapshots:{}, fail: () => true }); await p.waitForTimeout(1200); s = await strip(p);
  t.check('calendar fails: nothing shown', s.hidden, JSON.stringify(s));
  t.check('calendar fails: the cards are still there', (await p.$$('a.card')).length === 5);
  t.check('calendar fails: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Both themes, desktop and phone: theme colours, fits, doesn't push the cards far down.
  for(const [width, theme] of [[1000,'light'], [1000,'dark'], [390,'light'], [390,'dark']]){
    p = await open('2026-10-27T12:00:00Z', { width, theme }); await settle(p);
    const r = await p.evaluate(() => {
      const el = document.getElementById('nextRace'), box = el.getBoundingClientRect(), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const probe = document.createElement('div'); probe.style.background = css('--panel'); document.body.appendChild(probe);
      const panel = getComputedStyle(probe).backgroundColor; probe.remove();
      const kids = [...el.children].map(c => c.getBoundingClientRect());
      return { bg: getComputedStyle(el).backgroundColor, panel, height: box.height, right: box.right,
        inside: kids.every(k => k.left >= box.left - 0.5 && k.right <= box.right + 0.5),
        cardTop: document.querySelector('a.card').getBoundingClientRect().top - box.top, scroll: document.documentElement.scrollWidth };
    });
    t.check(`${theme} ${width}px: strip uses the theme's panel colour`, r.bg === r.panel, `${r.bg} vs ${r.panel}`);
    t.check(`${theme} ${width}px: everything fits inside the strip, no horizontal scroll`, r.inside && r.right <= width && r.scroll <= width, JSON.stringify(r));
    t.check(`${theme} ${width}px: strip is compact (≤ ${width < 600 ? 120 : 92}px tall)`, r.height <= (width < 600 ? 120 : 92), `${r.height}px`);
    await h.screenshot(p, `next-race-${width}-${theme}.png`);
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }

  // ==== #85: the race's location, and who can clinch a title there ====
  // Location: the calendar's circuit city and country ("Marina Bay, Singapore"); the country alone without a city.
  for(const [now, round, where] of [['2026-10-15T12:00:00Z', 18, 'Marina Bay, Singapore'], ['2026-11-25T20:00:00Z', 22, 'United States'], ['2026-06-01T12:00:00Z', 8, 'Monaco']]){
    p = await open(now); await settle(p);
    t.check(`location, round ${round}: "${where}"`, await p.$eval('#nextRace .nr-loc', e => e.textContent).catch(() => null) === where && (await strip(p)).kicker.endsWith(`Round ${round}`));
    await p.done();
  }
  const noCities = { ...snap, calendar: { ...snap.calendar } }; delete noCities.calendar.cities;
  p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: noCities } }); await settle(p);
  t.check('location without city data (an older season file): the country alone', await p.$eval('#nextRace .nr-loc', e => e.textContent).catch(() => null) === 'Singapore');
  await p.done();

  // Clinch lines, on constructed seasons through round 17 (the next race is round 18 on Oct 25): checked against the
  // independent calculation in lib/clinch.js.
  const K = require('./lib/clinch');
  const kit = await K.seasonKit();
  const [kA, kB, kC, kA2] = kit.ALL;
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
  const SC = {
    drivers: mk(17, r => kit.round(r, [kA, kB])),
    teams: mk(17, r => kit.round(r, r % 3 === 0 ? [kA, kA2, kB] : r % 3 === 1 ? [kB, kA2, kA] : [kA2, kB, kA])),
    both: mk(17, r => kit.round(r, r % 3 === 0 ? [kA, kA2, kB] : [kA, kB])),
    none: mk(17, r => kit.round(r, [[kA, kB, kC], [kB, kC, kA], [kC, kA, kB]][r % 3])),
  };
  const clinchLines = pg => pg.$$eval('#nextRace .nr-line', ls => ls.map(l => ({ kind: l.dataset.kind, text: l.textContent.replace(/\s+/g, ' ').trim(),
    flags: l.querySelectorAll('.nr-who img.flag').length, bold: getComputedStyle(l.querySelector('.nr-who')).fontWeight, link: (l.querySelector('a') || {}).getAttribute ? l.querySelector('a').getAttribute('href') : null })));
  const waitClinch = pg => pg.waitForFunction(() => document.querySelector('#nextRace .nr-clinch'), null, { timeout: 4000 }).catch(() => {});
  const NAME = { d0_0: 'Driver0 Team0' }, TEAM = { mercedes: 'Mercedes' };
  for(const [name, rounds] of Object.entries(SC)){
    const can = { drivers: K.canClinchNext(rounds, 17, 'drivers', kit.cal), teams: K.canClinchNext(rounds, 17, 'teams', kit.cal) };
    const want = [];
    if(can.drivers.length) want.push({ kind: 'drivers', text: `🏆 ${can.drivers.map(id => NAME[id]).join(' or ')} can clinch the drivers’ title` });
    if(can.teams.length) want.push({ kind: 'teams', text: `🏆 ${can.teams.map(id => TEAM[id]).join(' or ')} can clinch the constructors’ title` });
    t.check(`homepage clinch, "${name}" season: the scenario (independent)`, J(want.map(w => w.kind)) === J({ drivers: ['drivers'], teams: ['teams'], both: ['drivers', 'teams'], none: [] }[name]), J(can));
    p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: kit.snap(rounds) } }); await settle(p);
    if(want.length) await waitClinch(p); else await p.waitForTimeout(600);
    const got = await clinchLines(p);
    const last = want.length - 1;
    t.check(`"${name}": ${want.length ? want.map(w => `"${w.text}"`).join(' + ') : 'no clinch line'}`, got.length === want.length
      && want.every((w, i) => got[i].kind === w.kind && got[i].text === w.text + (i === last ? ' Try it in What-If →' : '')), J(got));
    if(want.length){
      t.check(`"${name}": names in bold with a flag`, got.every(g => g.flags === 1 && +g.bold >= 600), J(got));
      t.check(`"${name}": one "Try it in What-If →" link, on the last line: whatif.html?season=2026&start=clinch`, got.every((g, i) => g.link === (i === last ? 'whatif.html?season=2026&start=clinch' : null)), J(got));
    }
    // Requests: the season file once (shared by the calendar and the season), and f1api.dev only for the site's
    // once-a-day check of the round after the file; nothing more when using the page.
    const okHits = p.apiHits.every(u => /\/api\/2026\/18\/(race|sprint\/race)$/.test(u));
    t.check(`"${name}": one season-file request, f1api.dev only for the daily check of round 18`, p.snapshotHits.length === 1 && okHits && p.apiHits.length <= 2, J([p.snapshotHits, p.apiHits]));
    const n0 = p.apiHits.length + p.snapshotHits.length;
    await p.click('.theme-trigger').catch(() => {}); await p.click('.theme-menu button:last-child').catch(() => {}); await p.mouse.move(5, 5); await p.waitForTimeout(150);
    t.check(`"${name}": interactions fetch nothing`, p.apiHits.length + p.snapshotHits.length === n0);
    t.check(`"${name}": no page errors`, p.errors.length === 0, p.errors.join('; '));
    if(name === 'both'){
      await p.click('#nextRace .nr-wi'); await p.waitForFunction(() => typeof F1Controls !== 'undefined' && F1Controls.state.year && !document.documentElement.classList.contains('f1-loading'), null, { timeout: 10000 }); await p.waitForTimeout(150);
      t.check('following the homepage link: What-If on round 18, starting from an order that clinches both titles', /Round 18/.test(await h.text(p, '#orderHeading'))
        && /^🏆 With this result, .+ is champion\.$/.test(await h.text(p, '#clinchDrivers')) && /^🏆 With this result, .+ is champion\.$/.test(await h.text(p, '#clinchTeams')) && /start=clinch/.test(p.url()), p.url());
    }
    await p.done();
  }
  // The next race isn't the round after the latest result (round 18's results not in yet, the card on round 19): no line.
  p = await open('2026-10-27T12:00:00Z', { snapshots:{ 2026: kit.snap(SC.both) } }); await settle(p); await p.waitForTimeout(600);
  t.check('next race two rounds after the latest result: no clinch line', /Round 19/.test((await strip(p)).kicker) && (await clinchLines(p)).length === 0);
  await p.done();
  // The season's newer-round check fails: the card shows without the clinch line, no errors.
  p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: kit.snap(SC.both) }, fail: u => /\/api\/2026\/18\//.test(u) }); await settle(p); await p.waitForTimeout(1500);
  t.check('season load fails: the card still shows, without a clinch line', !(await strip(p)).hidden && (await clinchLines(p)).length === 0 && /Round 18/.test((await strip(p)).kicker));
  t.check('season load fails: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
  // A slow check doesn't hold the card up: it shows first, the line follows.
  p = await open('2026-10-15T12:00:00Z', { snapshots:{ 2026: kit.snap(SC.both) }, delay: 1500 }); await settle(p);
  const early = await clinchLines(p), shownEarly = !(await strip(p)).hidden;
  await waitClinch(p);
  t.check('slow season load: the card shows straight away, the clinch lines follow', shownEarly && early.length === 0 && (await clinchLines(p)).length === 2, J(early));
  await p.done();

  // Both themes, desktop and phone, with both lines and the location.
  for(const [width, theme] of [[1000,'light'], [1000,'dark'], [390,'light'], [390,'dark']]){
    p = await open('2026-10-15T12:00:00Z', { width, theme, snapshots:{ 2026: kit.snap(SC.both) } }); await settle(p); await waitClinch(p);
    const r = await p.evaluate(() => { const el = document.getElementById('nextRace'), box = el.getBoundingClientRect();
      return { inside: [...el.querySelectorAll('.nr-line, .nr-loc, .nr-wi')].every(k => { const b = k.getBoundingClientRect(); return b.left >= box.left - 0.5 && b.right <= box.right + 0.5; }),
        scroll: document.documentElement.scrollWidth, height: box.height }; });
    t.check(`clinch lines ${theme} ${width}px: inside the card, no sideways scroll`, r.inside && r.scroll <= width, J(r));
    await h.screenshot(p, `next-race-clinch-${width}-${theme}.png`);
    t.check(`clinch lines ${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
