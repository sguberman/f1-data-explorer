// #84: constructors page "Driver contributions": one bar per picked team, split into a segment per driver, as of
// the slider's round (Grand Prix + sprints). Totals are checked against an independent sum of the results.
const fs = require('fs');
module.exports = async (t, h) => {
  // Independent expectation: points per team and per driver within each team, through round n.
  const expected = (p, n) => p.evaluate(n => {
    const out = {};
    F1Controls.state.seasonRounds.forEach(r => { if(r.round > n) return;
      r.raceResults.concat(r.sprintResults || []).forEach(x => {
        const tm = out[x.teamId] = out[x.teamId] || { name: x.teamName, total: 0, drivers: {} };
        tm.total += x.points; tm.drivers[x.driverId] = (tm.drivers[x.driverId] || 0) + x.points; }); });
    return out;
  }, n);
  const bars = p => p.$$eval('#contrib .ctRow', rows => rows.map(r => ({ team: r.dataset.team, total: r.querySelector('.ctTotal').textContent,
    segs: [...r.querySelectorAll('.ctSeg')].map(s => ({ id: s.dataset.id, pts: +s.dataset.pts, label: s.textContent, clipped: s.scrollWidth > s.clientWidth, code: s.dataset.code, w: s.getBoundingClientRect().width, bg: getComputedStyle(s).backgroundColor + getComputedStyle(s).backgroundImage })) })));
  const matches = (got, want) => got.length > 0 && got.every(b => {
    const w = want[b.team]; if(!w) return false;
    const scored = Object.entries(w.drivers).filter(([, v]) => v > 0);
    return b.total === String(Math.round(w.total)) && b.segs.length === scored.length
      && b.segs.every(s => w.drivers[s.id] === s.pts) && Math.abs(b.segs.reduce((a, s) => a + s.pts, 0) - w.total) < 1e-9;
  });
  const pickerPts = p => p.$$eval('#teamPicker input:checked', cbs => Object.fromEntries(cbs.map(cb => [cb.dataset.id, cb.closest('.pickerRow').querySelector('.pickerPts').textContent])));

  let p = await h.openPage('constructors', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;
  t.check('the card sits between the points chart and the projected points', await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')], i = cards.indexOf(document.getElementById('contribCard'));
    return i > 0 && cards[i - 1].contains(document.getElementById('c')) && cards[i + 1].contains(document.getElementById('projChart')); }));
  let got = await bars(p), want = await expected(p, 12);
  const sel = await p.evaluate(() => selectedTeamIds.slice());
  t.check('one bar per picked team (top 5 by default)', got.length === 5 && JSON.stringify(got.map(b => b.team).sort()) === JSON.stringify(sel.slice().sort()), got.map(b => b.team).join());
  t.check('…in standings order (most points first)', got.every((b, i) => i === 0 || want[got[i - 1].team].total >= want[b.team].total));
  t.check('each segment is a driver\'s points for that team; segments add up to the team total', matches(got, want), JSON.stringify(got[0]));
  const pp = await pickerPts(p);
  t.check('…which is the team\'s championship points (as in the picker)', got.every(b => pp[b.team] === b.total), JSON.stringify(pp));
  t.check('segment widths are in proportion to points (shared scale across teams)', (() => {
    const per = got.flatMap(b => b.segs.map(s => s.w / s.pts)); return per.every(r => Math.abs(r - per[0]) / per[0] < 0.03); })(), JSON.stringify(got.map(b => b.segs.map(s => Math.round(s.w)))));
  t.check('segments are labelled with the driver code and points where they fit', got.every(b => b.segs.every(s => s.label === `${s.code} ${Math.round(s.pts)}` || s.label === s.code || s.label === ''))
    && got.flatMap(b => b.segs).filter(s => s.label.includes(' ')).length >= 5, JSON.stringify(got.map(b => b.segs.map(s => s.label))));
  t.check('…and never cut off (shorter label, or none, in a narrow segment)', got.every(b => b.segs.every(s => !s.clipped)), JSON.stringify(got.map(b => b.segs.map(s => s.label))));
  t.check('teammates are told apart (top scorer solid, teammate a lighter shade)', got.every(b => b.segs.length < 2 || b.segs[0].bg !== b.segs[1].bg) && got.every(b => b.segs.every((s, i) => i === 0 || s.pts <= b.segs[i - 1].pts)));

  // Tooltip: name, points and share of the team.
  const seg0 = got[0].segs[0];
  await p.click(`#contrib .ctRow[data-team="${got[0].team}"] .ctSeg`);
  const tip = await p.$eval('#contrib .ctTip', e => e.hidden ? '(hidden)' : e.textContent).catch(() => '(missing)');
  const name0 = await p.evaluate(id => F1Controls.state.seasonRounds[0].raceResults.find(r => r.driverId === id).name, seg0.id);
  const share = Math.round(seg0.pts / want[got[0].team].total * 100);
  t.check('tapping a segment shows the driver, points and share of the team', tip.includes(name0) && tip.includes(`${Math.round(seg0.pts)} pts`) && tip.includes(`${share}% of the team's ${Math.round(want[got[0].team].total)}`), tip);
  await h.screenshot(p, 'contrib-tip-light.png');
  await p.mouse.click(5, 5);
  t.check('…and tapping elsewhere hides it', await p.$eval('#contrib .ctTip', e => e.hidden));

  // Slider.
  await h.setRound(p, 5); await p.waitForTimeout(60);
  got = await bars(p); want = await expected(p, 5);
  t.check('moving the slider shows the points as of that round', matches(got, want) && await p.$eval('#contribSub', e => e.textContent.includes('after round 5')), JSON.stringify(got.map(b => b.total)));
  t.check('…still the same picked teams', JSON.stringify(got.map(b => b.team).sort()) === JSON.stringify(sel.slice().sort()));

  // Picker.
  await p.click(`#teamPicker input[data-id="${sel[0]}"]`); await p.waitForTimeout(60);
  got = await bars(p);
  t.check('unpicking a team removes its bar', got.length === 4 && !got.some(b => b.team === sel[0]));
  await p.click('#presetRow [data-preset="all"]'); await p.waitForTimeout(60);
  got = await bars(p);
  t.check('All shows every team, still matching the totals', got.length === 11 && matches(got, want), String(got.length));
  t.check('…small segments get a shorter label or none, never a cut-off one', got.every(b => b.segs.every(s => !s.clipped)) && got.flatMap(b => b.segs).some(s => s.label !== `${s.code} ${Math.round(s.pts)}`), JSON.stringify(got.map(b => b.segs.map(s => s.label))));
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(60);
  t.check('None says no teams are selected', (await h.text(p, '#contrib')) === 'No teams selected.');
  await p.click('#presetRow [data-preset="all"]'); await h.setRound(p, 12); await p.waitForTimeout(60);

  // Export.
  const grab = async sel => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) }; };
  let f = await grab('#contribCard .exp-csv');
  const rows = f.data.toString('utf8').replace(/^﻿/, '').trim().split(/\r\n/).map(r => r.split(','));
  want = await expected(p, 12);
  const csvSum = {}; rows.slice(1).forEach(r => { csvSum[r[0]] = (csvSum[r[0]] || 0) + +r[3]; });
  const teamTotals = await p.evaluate(w => Object.fromEntries(Object.entries(w).map(([id, v]) => [F1Common.shortTeamName(id, v.name), v.total])), want);
  t.check('CSV: a row per driver per team, named by season, chart and round', f.name === 'f1-2026-constructors-contributions-r12.csv'
    && rows[0].join() === 'Team,Driver,Code,Points,Share of team (%),Team points' && rows.length === 1 + 22, f.name + ' ' + rows.length);
  t.check('CSV: drivers\' points add up to each team\'s total', Object.keys(teamTotals).every(k => Math.abs(csvSum[k] - teamTotals[k]) < 1e-9), JSON.stringify(csvSum));
  f = await grab('#contribCard .exp-png');
  fs.mkdirSync(require('path').join(__dirname, 'artifacts'), { recursive: true });
  fs.writeFileSync(require('path').join(__dirname, 'artifacts', 'contrib-export.png'), f.data); // for a person to look at
  const png = { ok: f.data.readUInt32BE(0) === 0x89504e47, h: f.data.readUInt32BE(20) };
  t.check('PNG: downloads, tall enough for a row per team', png.ok && f.name === 'f1-2026-constructors-contributions-r12.png' && png.h >= 11 * 30, JSON.stringify(png));

  // Theme: colours follow it (Red Bull's navy is lightened in dark).
  const rbBg = () => p.$eval('#contrib .ctRow[data-team="red_bull"] .ctSeg', s => getComputedStyle(s).backgroundColor);
  const before = await rbBg();
  await p.evaluate(() => { document.querySelector('.theme-trigger').click(); document.querySelector('.theme-menu button[data-pref="dark"]').click(); }); await p.waitForTimeout(80);
  const after = await rbBg();
  t.check('switching theme redraws the colours', before === 'rgb(27, 42, 107)' && after === 'rgb(106, 134, 240)', before + ' → ' + after);
  t.check('…and keeps the totals', matches(await bars(p), want));
  t.check('nothing on the card ever fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // A driver who scored for two teams (and a replacement): constructed data through the page's own function.
  p = await h.openPage('constructors'); await h.loaded(p);
  const two = await p.evaluate(() => {
    const row = (driverId, teamId, points, code) => ({ driverId, code, name: driverId.toUpperCase(), teamId, teamName: teamId, points, position: 1, session: 'race' });
    const rounds = [
      { round: 1, raceResults: [row('a', 'red', 25, 'AAA'), row('b', 'red', 18, 'BBB'), row('c', 'blue', 15, 'CCC'), row('x', 'blue', 12, 'XXX')], sprintResults: [row('a', 'red', 8, 'AAA'), row('x', 'blue', 7, 'XXX')] },
      { round: 2, raceResults: [row('b', 'blue', 25, 'BBB'), row('a', 'red', 18, 'AAA'), row('r', 'red', 15, 'RRR'), row('c', 'blue', 0, 'CCC')], sprintResults: null },
      { round: 3, raceResults: [row('a', 'red', 25, 'AAA')], sprintResults: null },
    ];
    return contributions(rounds, 2, ['blue', 'red', 'nobody']).map(t => [t.teamId, t.total, t.drivers.map(d => d.code + ':' + d.points).join(' ')].join('|'));
  });
  t.check('a driver who moved team gets a segment for each team, with only the points scored there', JSON.stringify(two) === JSON.stringify(['blue|59|BBB:25 XXX:19 CCC:15', 'red|84|AAA:51 BBB:18 RRR:15']), JSON.stringify(two));
  // Season switch: an unavailable season empties the card without errors.
  await p.selectOption('.f1c-year', '2025'); await p.waitForTimeout(400);
  t.check('switching to a season with no data empties the card', (await p.$$('#contrib .ctRow')).length === 0, String((await p.$$('#contrib .ctRow')).length));
  t.check('season switch: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Rendering in both themes, desktop and phone; the phone fits without horizontal scroll.
  for(const theme of ['light', 'dark']) for(const width of [1000, 390]){
    p = await h.openPage('constructors', { theme, width }); await h.loaded(p);
    await p.click('#presetRow [data-preset="all"]'); await p.waitForTimeout(60);
    const fit = await p.evaluate(() => { const card = document.getElementById('contribCard').getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth, over: [...document.querySelectorAll('#contrib .ctRow, #contrib .ctTotal')].filter(e => e.getBoundingClientRect().right > card.right - 8).length,
        labels: [...document.querySelectorAll('#contrib .ctSeg')].filter(s => s.textContent.includes(' ')).length }; });
    t.check(`${theme} ${width}px: bars fit the card, no horizontal scroll`, fit.scroll <= width && fit.over === 0, JSON.stringify(fit));
    t.check(`${theme} ${width}px: segments still carry labels`, fit.labels >= 5, JSON.stringify(fit));
    await p.$eval('#contribCard', e => e.scrollIntoView());
    fs.mkdirSync(require('path').join(__dirname, 'artifacts'), { recursive: true });
    await p.screenshot({ fullPage: true, path: require('path').join(__dirname, 'artifacts', `contrib-${width}-${theme}.png`), clip: await p.$eval('#contribCard', e => { const b = e.getBoundingClientRect(); return { x: 0, y: b.top + scrollY - 8, width: innerWidth, height: b.height + 16 }; }) });
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
