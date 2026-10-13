// issue #44: shared helpers in common.js.
module.exports = async (t, h) => {
  const p = await h.openPage('drivers'); await h.loaded(p);
  const r = await p.evaluate(() => ({
    hex: F1Common.withAlpha('#FF8000', .5),
    hsl: F1Common.withAlpha('hsl(120 55% 45%)', .35),
    known: F1Common.teamColor('ferrari'),
    unknown: F1Common.teamColor('mystery_gp'),
    unknownAgain: F1Common.teamColor('mystery_gp'),
    short: F1Common.shortTeamName('red_bull', 'Red Bull Racing'),
    shortFallback: F1Common.shortTeamName('mystery_gp', 'Mystery Grand Prix Team'),
    years: F1Common.YEARS,
    dropdown: [...document.querySelectorAll('.f1c-year option')].map(o => +o.value),
  }));
  t.check('withAlpha: hex -> rgba()', r.hex === 'rgba(255,128,0,0.5)', r.hex);
  t.check('withAlpha: hsl -> hsl(... / a)', r.hsl === 'hsl(120 55% 45% / 0.35)', r.hsl);
  t.check('teamColor: known team', r.known === '#DC0000', r.known);
  t.check('teamColor: unknown team gets a stable hsl()', /^hsl\(/.test(r.unknown) && r.unknown === r.unknownAgain, r.unknown);
  t.check('shortTeamName: known and fallback', r.short === 'Red Bull' && r.shortFallback === 'Mystery Grand Prix Team');
  t.check('season dropdown lists SEASON_META years, newest first', JSON.stringify(r.dropdown) === JSON.stringify(r.years) && r.years[0] === 2026, JSON.stringify(r.dropdown));
  // GitHub #16: the browser tab title names the selected season.
  t.check('tab title starts with the selected season', (await p.title()) === "2026 Drivers' Championship · F1 Data Explorer", await p.title());
  await p.selectOption('.f1c-year', '2025'); await h.loaded(p);
  t.check('tab title follows the season picker', (await p.title()).startsWith('2025 '), await p.title());
  await p.done();
  const idx = await h.openPage('index'); await idx.waitForTimeout(300);
  t.check('landing page tab title', (await idx.title()) === 'F1 Data Explorer', await idx.title());
  await idx.done();
};
