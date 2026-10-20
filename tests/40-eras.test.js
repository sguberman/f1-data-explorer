// #135: the Eras page — final championship positions since 1950 against the rule eras, from site/data/eras.json.
// A small fake file stands in for the real one. Covers the lineage map (teams that changed name or owner are one
// line), the era table, the page's model, the picker, link keys, the chart and exports.
const F1Eras = require('../site/eras.js');

// Fake eras.json: a few seasons chosen to hit the lineage map. Mercedes' lineage is Tyrrell (1999), BAR (2000),
// Honda (2006), Brawn (2009 title) and Mercedes (2010); Sauber's is Sauber, Alfa Romeo (2020), Sauber and Audi.
const D = { d1: { n: 'Alan Alpha', s: 'Alpha' }, d2: { n: 'Bob Beta', s: 'Beta' }, d3: { n: 'Carl Gamma', s: 'Gamma' } };
const T = { tyrrell: { n: 'Tyrrell' }, bar: { n: 'BAR' }, honda: { n: 'Honda' }, brawn: { n: 'Brawn' }, mercedes: { n: 'Mercedes' },
  red_bull: { n: 'Red Bull' }, sauber: { n: 'Sauber' }, alfa: { n: 'Alfa Romeo' }, mclaren: { n: 'McLaren' }, 'brabham-repco': { n: 'Brabham-Repco' }, obscure: { n: 'Obscure F1 Team' } };
const S = (round, d, t) => ({ round, d, t });
const FAKE = { v: 1, generatedAt: Date.UTC(2026, 9, 19), partial: 2026, drivers: D, teams: T, seasons: {
  1966: S(9, [['d2', 1, 42, 'brabham-repco'], ['d1', 2, 30, 'honda']], []),
  1999: S(16, [['d1', 6, 20, 'tyrrell']], [['tyrrell', 5, 7]]),
  2000: S(17, [['d1', 7, 15, 'bar']], [['bar', 6, 20]]),
  2005: S(19, [['d2', 9, 10, 'sauber']], [['sauber', 8, 20]]),
  2006: S(18, [['d1', 4, 60, 'honda']], [['honda', 4, 86]]),
  2009: S(17, [['d1', 1, 95, 'brawn'], ['d2', 2, 77, 'brawn'], ['d3', 3, 60, 'red_bull']], [['brawn', 1, 172], ['red_bull', 2, 153], ['obscure', 12, 1]]),
  2010: S(19, [['d3', 1, 255, 'red_bull'], ['d2', 3, 200, 'mclaren'], ['d1', 4, 100, 'mercedes']], [['red_bull', 1, 498], ['mercedes', 4, 214], ['mclaren', 2, 454]]),
  2012: S(20, [['d3', 1, 281, 'red_bull'], ['d1', 8, 80, 'mercedes']], [['red_bull', 1, 460], ['mercedes', 5, 142], ['sauber', 6, 126]]),
  2020: S(17, [['d2', 15, 4, 'alfa']], [['alfa', 8, 8]]),
  2024: S(24, [['d2', 12, 20, 'sauber']], [['sauber', 9, 4]]),
  2026: S(5, [['d3', 1, 100, 'red_bull'], ['d1', 2, 90, 'mercedes']], [['red_bull', 1, 190], ['mercedes', 2, 175]]),
} };

module.exports = async (t, h) => {
  // ---- lineages ----
  const L = (id, y) => F1Eras.lineageOf(id, y, T);
  t.check('Tyrrell 1999 is in Mercedes\' lineage, named Tyrrell', L('tyrrell', 1999).id === 'mercedes' && L('tyrrell', 1999).name === 'Tyrrell');
  t.check('BAR, Honda (2006), Brawn and Mercedes are the same lineage',
    ['bar', 'honda', 'brawn', 'mercedes'].every((id, i) => L(id, [2000, 2006, 2009, 2010][i]).id === 'mercedes'));
  t.check('…each with its own name and colour then', L('brawn', 2009).name === 'Brawn GP' && L('mercedes', 2010).name === 'Mercedes'
    && new Set(['tyrrell', 'bar', 'honda', 'brawn', 'mercedes'].map(id => L(id, 2006).color)).size === 5);
  t.check('Honda in the 1960s is a lineage of its own', L('honda', 1966).id === 'honda_60s' && L('honda', 1966).id !== L('honda', 2006).id);
  t.check('Renault 1980 is the works team, Renault 2005 is Alpine\'s lineage', L('renault', 1980).id === 'renault_works' && L('renault', 2005).id === 'alpine');
  t.check('Sauber 2005 → Audi lineage; Alfa Romeo 1982 on its own, Alfa Romeo 2020 → Audi lineage',
    L('sauber', 2005).id === 'audi' && L('alfa', 1982).id === 'alfa_works' && L('alfa', 2020).id === 'audi' && L('alfa', 2020).name === 'Alfa Romeo');
  t.check('Sauber\'s colour changes with the era (2005, 2012, 2024 all differ from Alfa Romeo\'s)',
    new Set([L('sauber', 2005).color, L('sauber', 2012).color, L('sauber', 2024).color].filter((c, i, a) => a.indexOf(c) === i)).size >= 2 && L('alfa', 2020).color !== L('sauber', 2024).color);
  t.check('Jordan → Force India → Aston Martin and Minardi → Toro Rosso → RB are lineages',
    L('jordan', 1995).id === 'aston_martin' && L('force_india', 2012).id === 'aston_martin' && L('minardi', 1995).id === 'rb' && L('toro_rosso', 2010).id === 'rb');
  const own = L('obscure', 2009);
  t.check('an unknown team is its own lineage: cleaned name, stable colour', own.id === 'obscure' && own.name === 'Obscure' && own.color === L('obscure', 1999).color && /^hsl\(/.test(own.color), JSON.stringify(own));

  // ---- eras ----
  const E = F1Eras.ERAS;
  t.check('the eras follow each other from 1950 with no gap or overlap', E[0].from === 1950 && E.every((e, i) => i === 0 || e.from === E[i - 1].to + 1), JSON.stringify(E.map(e => [e.from, e.to])));
  t.check('the last era is open-ended', E[E.length - 1].to > 2100);
  const lab = y => F1Eras.eraOf(y).label;
  t.check('V10 (1995), V8 (2008), turbo hybrid (2018), ground effect (2023), current (2026)',
    lab(1995) === 'V10' && lab(2008) === 'V8' && lab(2018) === 'Turbo hybrid' && lab(2023) === 'Ground effect II' && lab(2026) === 'Current');
  t.check('every era has a label, a short label, a name and a note', E.every(e => e.label && e.short && e.name && e.note));

  // ---- model ----
  const m = F1Eras.build(FAKE);
  const dr = id => m.drivers.find(d => d.id === id), tm = id => m.teams.find(x => x.id === id);
  t.check('years are in order and the partial season is kept', m.years[0] === 1966 && m.years.at(-1) === 2026 && m.partial === 2026 && m.round === 5);
  t.check('titles count finished seasons only (a leader in the partial season has none yet)', dr('d3').titles === 3 - 1 && dr('d1').titles === 1 && dr('d2').titles === 1, m.drivers.map(d => d.id + d.titles).join());
  t.check('drivers sort by titles, then best finish', m.drivers[0].id === 'd3' && m.drivers.map(d => d.titles).join() === [...m.drivers.map(d => d.titles)].sort((a, b) => b - a).join());
  t.check('a driver\'s season carries the team name and colour of that season',
    dr('d1').seasons[2009].name === 'Brawn GP' && dr('d1').seasons[2010].name === 'Mercedes' && dr('d1').seasons[2009].color !== dr('d1').seasons[2010].color);
  const merc = tm('mercedes');
  t.check('one team line through renames: Tyrrell → BAR → Honda → Brawn → Mercedes', merc && [1999, 2000, 2006, 2009, 2010].every(y => merc.seasons[y]) && merc.titles === 1 && merc.name === 'Mercedes', merc && Object.keys(merc.seasons).join());
  t.check('…and its name each season', merc.seasons[2000].name === 'BAR' && merc.seasons[2009].name === 'Brawn GP');
  t.check('a team\'s swatch colour is its latest one', merc.color === F1Eras.lineageOf('mercedes', 2026, T).color);
  t.check('the Sauber line runs 2005 – 2024 under Sauber, Alfa Romeo, Sauber', tm('audi').seasons[2005].name === 'Sauber' && tm('audi').seasons[2020].name === 'Alfa Romeo' && tm('audi').seasons[2024].name === 'Sauber');
  const two = F1Eras.build({ ...FAKE, seasons: { 2010: S(1, [['d1', 1, 1, 'brawn']], [['brawn', 3, 10], ['mercedes', 2, 12]]) }, partial: null });
  t.check('two entries of one lineage in a season: best position, points added', two.teams[0].seasons[2010].pos === 2 && two.teams[0].seasons[2010].pts === 22);

  // ---- the page ----
  const open = (opts = {}) => h.openPage('eras', { eras: FAKE, ...opts });
  const wait = async p => { await p.waitForSelector('#erasPicker input'); await p.waitForTimeout(200); };
  let p = await open(); await wait(p);
  t.check('no page errors, and nothing fetched from f1api.dev', p.errors.length === 0 && p.apiHits.length === 0, p.errors.join('; ') + p.apiHits.join());
  t.check('the Pages menu names the page', await h.text(p, '#siteNav .nav-current') === 'Eras');
  t.check('status says how many seasons and that the last is partial', /11 seasons · 1966–2026 \(2026 so far\)/.test(await h.text(p, '#erasStatus')), await h.text(p, '#erasStatus'));
  const state = () => p.evaluate(() => ({
    checked: [...document.querySelectorAll('#erasPicker input:checked')].map(i => i.dataset.id),
    rows: document.querySelectorAll('#erasPicker .pickerRow').length,
    sets: chart.data.datasets.map(d => d.label),
    active: [...document.querySelectorAll('#presetRow .pill.active')].map(b => b.dataset.preset),
    url: location.search, summary: document.getElementById('pickerSummary').textContent,
  }));
  let s = await state();
  t.check('default: the drivers with the most titles are picked (Gamma 2, Alpha and Beta 1 each) and charted', s.checked.join() === 'd3,d1,d2' && s.sets.join() === 'Carl Gamma,Alan Alpha,Bob Beta', JSON.stringify(s));
  t.check('the default preset is highlighted and the URL stays clean', s.active.includes('top5') && s.url === '', JSON.stringify(s));
  t.check('the picker lists every driver, with titles', s.rows === 3 && /2 titles/.test(await h.text(p, '#erasPicker .pickerRow')));
  const ds = await p.evaluate(() => { const d = chart.data.datasets.find(x => x.label === 'Alan Alpha');
    return { data: d.data, years: chart.data.labels, style: d.pointStyle, radius: d.pointRadius, colors: d.pointBackgroundColor, n: chart.data.datasets.length }; });
  const at = y => ds.years.indexOf(String(y));
  t.check('a driver has a position in the seasons they raced and none in the others', ds.data[at(2009)] === 1 && ds.data[at(2010)] === 4 && ds.data[at(2012)] === 8 && ds.data[at(2005)] === null);
  t.check('no special marker for a title season (#135 O4): every point is the same circle', ds.style === 'circle' && ds.radius === 2.5);
  t.check('the line changes colour with the team (Brawn 2009, Mercedes 2010)', ds.colors[at(2009)] !== ds.colors[at(2010)] && !!ds.colors[at(2009)]);
  t.check('the era bands are drawn (the plugin is on the chart)', await p.evaluate(() => chart.config.plugins.some(x => x.id === 'eraBands')));
  t.check('the era key lists all eras', await p.$$eval('#eraKey > div', d => d.length) === F1Eras.ERAS.length);
  t.check('the chart axis is P1 at the top', await p.evaluate(() => chart.options.scales.y.reverse === true));
  t.check('the note no longer mentions stars', !/★/.test(await h.text(p, '#erasNote')) && !/★/.test(await h.text(p, '.sub')));
  // #135 (O5): the axes fit the picks
  const axesOf = () => p.evaluate(() => { const sc = chart.options.scales; return { x0: chart.data.labels[sc.x.min], x1: chart.data.labels[sc.x.max], ymax: sc.y.max, ticks: chart.scales.y.ticks.map(k => k.value), sub: document.getElementById('chartSub').textContent }; });
  let ax = await axesOf();
  t.check('default picks (Gamma, Alpha, Beta): the whole span 1966–2026, worst finish P15 → axis to P15', ax.x0 === '1966' && ax.x1 === '2026' && ax.ymax === 15.5 && ax.ticks.join() === '1,5,10,15', JSON.stringify(ax));
  t.check('the legend names the picked drivers', /Carl Gamma/.test(await h.text(p, '#erasLegend')) && /Bob Beta/.test(await h.text(p, '#erasLegend')));

  // tooltip text for 2010
  const tip = await p.evaluate(() => { const tt = chart.options.plugins.tooltip.callbacks, i = chart.data.labels.indexOf('2010');
    const items = chart.data.datasets.map((d, di) => ({ dataset: d, dataIndex: i, datasetIndex: di, raw: d.data[i] })).filter(x => x.raw != null);
    return { title: tt.title(items), lines: items.map(x => tt.label(x)) }; });
  t.check('tooltip: season and era, then position, points and team', /^2010 · V8 era$/.test(tip.title) && tip.lines.some(l => /Carl Gamma: P1 · 255 pts · Red Bull/.test(l)), JSON.stringify(tip));
  t.check('tooltip: the partial season says after which round', await p.evaluate(() => chart.options.plugins.tooltip.callbacks.title([{ dataIndex: chart.data.labels.indexOf('2026') }])) === '2026 · Current era (after round 5)');

  // picking
  await p.click('#presetRow [data-preset="none"]');
  s = await state();
  ax = await axesOf();
  t.check('nothing picked: the whole span and P20', ax.x0 === '1966' && ax.x1 === '2026' && ax.ymax === 20.5 && ax.ticks.join() === '1,5,10,15,20', JSON.stringify(ax));
  t.check('None clears the chart and puts an empty list in the link', s.sets.length === 0 && s.checked.length === 0 && s.url === '?d=' && s.active.join() === 'none' && /0 of 3 drivers/.test(s.summary), JSON.stringify(s));
  t.check('nothing picked says so', await p.$eval('#erasEmpty', e => e.style.display !== 'none'));
  await p.click('#erasPicker input[data-id="d2"]');
  s = await state();
  t.check('ticking a driver adds the line and keeps the link in step', s.checked.join() === 'd2' && s.sets.join() === 'Bob Beta' && s.url === '?d=d2', JSON.stringify(s));
  await p.click('#erasPicker input[data-id="d2"]'); await p.click('#erasPicker input[data-id="d3"]'); // Gamma only
  ax = await axesOf();
  t.check('one driver (Gamma, 2009–2026, worst P3): seasons from one before the first to the last, axis P1–P5', ax.x0 === '2006' && ax.x1 === '2026' && ax.ymax === 5.5 && ax.ticks.join() === '1,2,3,4,5' && /2006–2026/.test(ax.sub), JSON.stringify(ax));
  await p.click('#presetRow [data-preset="champs"]');
  t.check('All champions picks everyone who won a title', (await state()).checked.join() === 'd3,d1,d2');
  await p.click('#presetRow [data-preset="now"]');
  s = await state();
  t.check('"Top 10 now" picks the latest season\'s drivers', s.checked.join() === 'd3,d1', JSON.stringify(s));
  await p.click('#presetRow [data-preset="top5"]');
  t.check('back on the default preset the link is clean again', (await state()).url === '');

  // filter and sort
  await p.fill('#erasFilter', 'gam');
  t.check('the filter narrows the list', await p.$$eval('#erasPicker .pickerRow', r => r.length) === 1);
  await p.fill('#erasFilter', 'zzz');
  t.check('…and says when nothing matches', /No match/.test(await h.text(p, '#erasPicker')));
  await p.fill('#erasFilter', '');
  await p.selectOption('#sortSel', 'name');
  t.check('sort by name', (await p.$$eval('#erasPicker .pickerCode', r => r.map(x => x.textContent))).map(x => x.slice(0, 4)).join() === 'Alan,Bob ,Carl');
  await p.selectOption('#sortSel', 'first');
  t.check('sort by first season (Gamma, from 2009, last)', (await p.$$eval('#erasPicker .pickerCode', r => r[2].textContent)).startsWith('Carl'));
  await p.selectOption('#sortSel', 'titles');

  // constructors
  await p.selectOption('#viewSel', 'teams');
  s = await state();
  t.check('constructors view: one line per team lineage, link has view=teams', s.url === '?view=teams' && s.sets.length >= 2 && s.sets.includes('Red Bull') && s.sets.includes('Mercedes'), JSON.stringify(s));
  t.check('the note says the constructors\' standings start in 1958 and that a team keeps its line', /start in 1958/.test(await h.text(p, '#erasNote')) && /one line/.test(await h.text(p, '#erasNote')));
  t.check('"Top 5 now" on the constructors view', /Top 5 now/.test(await h.text(p, '#presetRow')));
  await p.click('#erasPicker input[data-id="mercedes"]');
  s = await state();
  t.check('unticking a team drops its line (the link then lists the rest)', !s.sets.includes('Mercedes') && /^\?view=teams&t=/.test(s.url), JSON.stringify(s));
  t.check('drivers\' picks are kept when switching back', await (async () => { await p.selectOption('#viewSel', 'drivers'); return (await state()).checked.join() === 'd3,d1,d2'; })());

  // export
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#chartCard .exp-csv')]);
  const csv = await require('fs').promises.readFile(await dl.path(), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  t.check('CSV: a row per season with position, points and team per pick', /^\uFEFF?Season,Era,Carl Gamma position,Carl Gamma points,Carl Gamma team/.test(lines[0]) && lines.length === 12
    && lines.some(l => l.startsWith('2009,V8 era,3,60,Red Bull,1,95,Brawn GP')), lines.filter(l => l.startsWith('2009')).join(' | ') + ' … ' + lines.length);
  t.check('CSV file name says drivers', /eras-drivers/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await h.screenshot(p, 'eras-light.png');
  await p.done();

  // a shared link
  p = await open({ }); await p.goto('http://site.test/eras.html?view=teams&t=red_bull,nope'); await wait(p);
  s = await state();
  t.check('a link\'s view and picks are applied (unknown ids dropped)', s.checked.join() === 'red_bull' && (await p.$eval('#viewSel', e => e.value)) === 'teams', JSON.stringify(s));
  await p.done();
  p = await open(); await p.goto('http://site.test/eras.html?d=d2'); await wait(p);
  t.check('a link\'s driver picks are applied', (await state()).sets.join() === 'Bob Beta');
  await p.done();

  // dark, phone
  for(const [theme, width] of [['dark', 1000], ['light', 390], ['dark', 390]]){
    const q = await open({ theme, width }); await wait(q);
    const r = await q.evaluate(() => ({ scroll: document.documentElement.scrollWidth, canvas: document.getElementById('erasCanvas').getBoundingClientRect().width }));
    t.check(`${theme} ${width}px: no horizontal scroll, chart fills the card, no errors`, r.scroll <= width && r.canvas > width * 0.7 && q.errors.length === 0, JSON.stringify(r) + q.errors.join());
    await h.screenshot(q, `eras-${theme}-${width}.png`);
    await q.done();
  }
  p = await open({ theme: 'dark' }); await wait(p);
  await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'light' } })); });
  await p.waitForTimeout(150);
  t.check('switching theme redraws without errors', p.errors.length === 0 && await p.evaluate(() => !!chart));
  await p.done();

  // loading failure
  p = await h.openPage('eras'); await p.waitForSelector('#erasRetry');
  t.check('a missing file shows a message with Retry (and no crash)', /Couldn’t load/.test(await h.text(p, '#erasStatus')) && p.errors.length === 0);
  await p.done();
};
