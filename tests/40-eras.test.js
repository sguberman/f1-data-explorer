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
  t.check('O6: a team\'s season says which driver won the drivers\' title for it (Mercedes 2009 Alan Alpha, Red Bull 2010 and 2012 Carl Gamma); none in other seasons, and none in the partial year',
    merc.seasons[2009].champ === 'Alan Alpha' && !merc.seasons[2010].champ && tm('red_bull').seasons[2010].champ === 'Carl Gamma' && tm('red_bull').seasons[2012].champ === 'Carl Gamma' && !tm('red_bull').seasons[2026].champ
    && m.champions[2009].name === 'Alan Alpha' && m.champions[2009].team === 'mercedes' && !m.champions[2026], JSON.stringify(m.champions));
  t.check('a team\'s swatch colour is its latest one', merc.color === F1Eras.lineageOf('mercedes', 2026, T).color);
  t.check('the Sauber line runs 2005 – 2024 under Sauber, Alfa Romeo, Sauber', tm('audi').seasons[2005].name === 'Sauber' && tm('audi').seasons[2020].name === 'Alfa Romeo' && tm('audi').seasons[2024].name === 'Sauber');
  const two = F1Eras.build({ ...FAKE, seasons: { 2010: S(1, [['d1', 1, 1, 'brawn']], [['brawn', 3, 10], ['mercedes', 2, 12]]) }, partial: null });
  t.check('two entries of one lineage in a season: best position, points added', two.teams[0].seasons[2010].pos === 2 && two.teams[0].seasons[2010].pts === 22);

  // ---- the page ----
  const open = (opts = {}) => h.openPage('eras', { eras: FAKE, ...opts });
  const wait = async p => { await p.waitForSelector('#erasPicker input'); await p.waitForTimeout(200); };
  let p = await open(); await wait(p);
  // #149: on a phone, the PNG goes to the share sheet with the page's own address as the message text (no controls here)
  const pp = await open(); await wait(pp);
  await pp.evaluate(() => { window.__shared = []; const mm = window.matchMedia.bind(window);
    window.matchMedia = q => /coarse/.test(q) ? { matches: true, media: q, addEventListener(){} } : mm(q);
    navigator.canShare = () => true; navigator.share = async d => { window.__shared.push(d.text); }; });
  await pp.click('.exp-png'); await pp.waitForTimeout(400);
  const pngText = await pp.evaluate(() => [window.__shared, location.href]);
  t.check('phone: the PNG share carries the page address as its text', pngText[0].length === 1 && pngText[0][0] === pngText[1], JSON.stringify(pngText));
  await pp.done();
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
  t.check('O7: the page opens on the constructors plot: the select says so, the lines are teams (Red Bull 2 titles, Mercedes 1), the link has no view key',
    (await p.$eval('#viewSel', e => e.value)) === 'teams' && s.sets.join() === 'Red Bull,Mercedes' && s.url === '' && /Teams shown/.test(await h.text(p, '#pickerLabel')), JSON.stringify(s));
  t.check('O7: the constructors view comes first in the select', (await p.$$eval('#viewSel option', o => o.map(x => x.value))).join() === 'teams,drivers');
  // O6: stars on a team's line in the seasons one of its drivers won the drivers' title
  const marks = () => p.evaluate(() => chart.$champMarks.map(m => `${m.id}@${m.year}:${m.champ}`).sort());
  t.check('O6: stars at Mercedes 2009 (Brawn, Alan Alpha) and Red Bull 2010 and 2012 (Carl Gamma); nothing for the partial 2026 or for seasons without a constructors table',
    (await marks()).join() === 'mercedes@2009:Alan Alpha,red_bull@2010:Carl Gamma,red_bull@2012:Carl Gamma', (await marks()).join());
  const tipTxt = await p.evaluate(() => { const cb = chart.options.plugins.tooltip.callbacks, ds = chart.data.datasets.find(d => d.label === 'Mercedes'), i = ds.data.findIndex(q => Math.round(q.x) === 2009);
    return { champ: cb.afterLabel({ dataset: ds, raw: ds.data[i] }), none: cb.afterLabel({ dataset: ds, raw: ds.data[ds.data.findIndex(q => Math.round(q.x) === 2010)] }) }; });
  t.check('O6: the tooltip names the champion in a star season and says nothing in the others', tipTxt.champ === "★ Drivers' champion: Alan Alpha" && tipTxt.none === '', JSON.stringify(tipTxt));
  t.check('O6: the note explains the star', /★ marks a season in which one of the team's drivers won the drivers' title/.test(await h.text(p, '#erasNote')));
  const [tdl] = await Promise.all([p.waitForEvent('download'), p.click('#chartCard .exp-csv')]);
  const tcsv = (await require('fs').promises.readFile(await tdl.path(), 'utf8')).trim().split(/\r?\n/);
  t.check('O6: the constructors CSV has a drivers\' champion column per team (2009: Mercedes line, Alan Alpha)', /Red Bull drivers' champion/.test(tcsv[0]) && tcsv.some(l => l.startsWith('2009,V8 era,') && l.includes(',Brawn GP,Alan Alpha')) && /eras-teams/.test(tdl.suggestedFilename()), tcsv[0] + ' | ' + tcsv.find(l => l.startsWith('2009')));
  await p.selectOption('#viewSel', 'drivers'); s = await state();
  t.check('the drivers view has no stars (a title there is simply P1)', (await marks()).length === 0);
  t.check('default: the drivers with the most titles are picked (Gamma 2, Alpha and Beta 1 each) and charted', s.checked.join() === 'd3,d1,d2' && s.sets.join() === 'Carl Gamma,Alan Alpha,Bob Beta', JSON.stringify(s));
  t.check('the default preset is highlighted and the URL stays clean', s.active.includes('top3') && s.url === '?view=drivers', JSON.stringify(s));
  t.check('the picker lists every driver, with titles', s.rows === 3 && /2 titles/.test(await h.text(p, '#erasPicker .pickerRow')));
  const ds = await p.evaluate(() => { const d = chart.data.datasets.find(x => x.label === 'Alan Alpha');
    return { data: d.data, radius: d.pointRadius, colors: d.pointBackgroundColor, n: chart.data.datasets.length, type: chart.options.scales.x.type }; });
  const idx = y => ds.data.findIndex(q => Math.round(q.x) === y);
  const pos = y => { const q = ds.data[idx(y)]; return q ? q.y : undefined; };
  t.check('a driver has a position in the seasons they raced and none in the others', pos(2009) === 1 && pos(2010) === 4 && pos(2012) === 8 && pos(2005) === null);
  t.check('O1: each season is a flat segment (two points a little either side of the year, same position), on a linear year axis',
    ds.type === 'linear' && ds.data.length === 2 * 11 && ds.data[idx(2009)].y === ds.data[idx(2009) + 1].y && ds.data[idx(2009)].x < 2009 && ds.data[idx(2009) + 1].x > 2009 && ds.data[idx(2009) + 1].x < 2009.5, JSON.stringify(ds.data.slice(idx(2009), idx(2009) + 2)));
  t.check('no point markers: only the lines (title years are not marked either, #135 O4)', ds.radius === 0);
  t.check('the line changes colour with the team (Brawn 2009, Mercedes 2010)', ds.colors[idx(2009)] !== ds.colors[idx(2010)] && !!ds.colors[idx(2009)]);
  // the tooltip and hover line snap to the middle of a season's segment, not to its ends
  const snap = await p.evaluate(async () => {
    const r = document.getElementById('erasCanvas').getBoundingClientRect(), sc = chart.scales.x, a = chart.chartArea, out = [];
    for(const x of [2010 - 0.3, 2010 + 0.3, 2010 - 0.1]){
      const px = sc.getPixelForValue(x);
      chart.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + px, clientY: r.top + (a.top + a.bottom) / 2, bubbles: true }));
      await new Promise(f => setTimeout(f, 60));
      out.push({ caret: Math.round(chart.tooltip.caretX), want: Math.round(sc.getPixelForValue(2010)), title: chart.tooltip.title[0] });
    }
    return out;
  });
  t.check('tooltip snaps to the middle of the season whichever end (or middle) of the segment is hovered',
    snap.every(x => Math.abs(x.caret - x.want) <= 1 && /^2010/.test(x.title)), JSON.stringify(snap));
  t.check('the era bands are drawn (the plugin is on the chart)', await p.evaluate(() => chart.config.plugins.some(x => x.id === 'eraBands')));
  t.check('the era key lists all eras', await p.$$eval('#eraKey > div', d => d.length) === F1Eras.ERAS.length);
  t.check('the chart axis is P1 at the top', await p.evaluate(() => chart.options.scales.y.reverse === true));
  t.check('the note no longer mentions stars', !/★/.test(await h.text(p, '#erasNote')) && !/★/.test(await h.text(p, '.sub')));
  // #135 (O5): the axes fit the picks
  const axesOf = () => p.evaluate(() => { const sc = chart.options.scales; return { x0: Math.round(sc.x.min + 0.5), x1: Math.round(sc.x.max - 0.5), ymax: sc.y.max, ticks: chart.scales.y.ticks.map(k => k.value), sub: document.getElementById('chartSub').textContent }; });
  let ax = await axesOf();
  t.check('default picks (Gamma, Alpha, Beta): the whole span 1966–2026, worst finish P15 → axis to P15', ax.x0 === 1966 && ax.x1 === 2026 && ax.ymax === 15.5 && ax.ticks.join() === '1,5,10,15', JSON.stringify(ax));
  t.check('the legend names the picked drivers', /Carl Gamma/.test(await h.text(p, '#erasLegend')) && /Bob Beta/.test(await h.text(p, '#erasLegend')));

  // tooltip text for 2010
  const tip = await p.evaluate(() => { const tt = chart.options.plugins.tooltip.callbacks;
    const items = chart.data.datasets.map((d, di) => { const i = d.data.findIndex(q => Math.round(q.x) === 2010); return { dataset: d, dataIndex: i, datasetIndex: di, raw: d.data[i] }; }).filter(x => x.raw.y != null);
    return { title: tt.title(items), lines: items.map(x => tt.label(x)) }; });
  t.check('tooltip: season and era, then position, points and team', /^2010 · V8 era$/.test(tip.title) && tip.lines.some(l => /Carl Gamma: P1 · 255 pts · Red Bull/.test(l)), JSON.stringify(tip));
  t.check('tooltip: the partial season says after which round', await p.evaluate(() => chart.options.plugins.tooltip.callbacks.title([{ raw: { x: 2025.7, y: 1 } }])) === '2026 · Current era (after round 5)');

  const d1id = 'd1', d2id = 'd2', d3id = 'd3';
  // #135 C2: highlight a line
  const at2009 = who => p.evaluate(w => { const r = chart.canvas.getBoundingClientRect(), d = chart.data.datasets.find(x => x.label === w), k = d._e.seasons[2009];
    return { x: r.left + chart.scales.x.getPixelForValue(2009), y: r.top + chart.scales.y.getPixelForValue(k.pos) }; }, who);
  const lit = () => p.evaluate(() => ({ lit: typeof lit === 'function' ? lit() : null,
    widths: chart.data.datasets.map(d => [d.label, d.borderWidth]), orders: chart.data.datasets.map(d => [d.label, d.order]),
    fade: chart.data.datasets.map(d => [d.label, /rgba\(.*,\s*0\.15\)|\/ 0\.15/.test(d.segment.borderColor({ p1DataIndex: 20 }))]),
    legend: [...document.querySelectorAll('#erasLegend .lgItem')].map(b => [b.textContent, b.className.replace('lgItem', '').trim(), b.getAttribute('aria-pressed')]) }));
  let pt = await at2009('Alan Alpha'); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(80);
  let LL = await lit();
  t.check('#143: hovering a line lights nothing (the tooltip stays): all lines normal, no legend entry dimmed',
    LL.lit === null && LL.widths.every(w => w[1] === 2.4) && LL.fade.every(f => !f[1]) && LL.legend.every(l => l[1] === ''), JSON.stringify(LL));
  await p.mouse.move(pt.x, pt.y - 120); await p.waitForTimeout(80);  // up in empty space (above P1)
  LL = await lit();
  pt = await at2009('Bob Beta'); await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.up(); await p.mouse.move(pt.x + 60, pt.y - 100); await p.waitForTimeout(80);
  LL = await lit();
  t.check('clicking a line pins it: it stays lit after the pointer leaves it, and the link is untouched', LL.lit === d2id && LL.legend.find(l => l[0] === 'Bob Beta')[2] === 'true' && (await state()).url === '?view=drivers', JSON.stringify(LL));
  pt = await at2009('Carl Gamma'); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(80);
  t.check('while pinned, hovering another line changes nothing', (await lit()).lit === d2id);
  await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60);
  t.check('clicking another line moves the pin to it', (await lit()).lit === d3id);
  await p.click('#erasLegend .lgItem >> nth=1'); await p.waitForTimeout(60);
  LL = await lit();
  t.check('a legend entry pins its line (Alan is second in the list); clicking it again lets go', LL.lit === d1id && LL.legend[1][2] === 'true');
  await p.click('#erasLegend .lgItem >> nth=1'); await p.waitForTimeout(60);
  t.check('…again: all normal', (await lit()).lit === null);
  const empty = await p.evaluate(() => { const r = chart.canvas.getBoundingClientRect(), a = chart.chartArea; return { x: r.left + a.left + a.width / 2, y: r.top + a.bottom - 8 }; });
  await p.click('#erasLegend .lgItem >> nth=0'); await p.mouse.move(empty.x, empty.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60);
  t.check('clicking empty space lets go of a pin', (await lit()).lit === null);
  await p.click('#erasLegend .lgItem >> nth=0'); await p.keyboard.press('Escape'); await p.waitForTimeout(60);
  t.check('Escape lets go of a pin', (await lit()).lit === null);
  // a finger: a tap near a line pins it (wider reach than a mouse); no hover for touch
  pt = await at2009('Carl Gamma');
  await p.evaluate(({ x, y }) => { const c = chart.canvas; const ev = (type) => new PointerEvent(type, { clientX: x, clientY: y + 22, pointerType: 'touch', bubbles: true });
    c.dispatchEvent(ev('pointermove')); c.dispatchEvent(new PointerEvent('click', { clientX: x, clientY: y + 22, pointerType: 'touch', bubbles: true })); }, pt);
  await p.waitForTimeout(60);
  t.check('a tap 22px from a line (touch reach) pins it; the touch move alone lit nothing', (await lit()).lit === d3id);
  await p.keyboard.press('Escape');
  await p.click('#erasLegend .lgItem >> nth=0'); await p.waitForTimeout(40);
  const png = p.waitForEvent('download'); await p.click('#chartCard .exp-png'); await png;
  t.check('the PNG export is never faded: it lets go of a pin first', (await lit()).lit === null);
  await p.click('#presetRow [data-preset="none"]'); await p.click('#erasPicker input[data-id="d1"]');
  await p.click('#erasLegend .lgItem >> nth=0'); await p.click('#erasPicker input[data-id="d1"]');
  t.check('a pinned line that leaves the chart lets go with it', (await lit()).lit === null);

  // #135 O2 + C4: zoom to eras, era presets
  await p.click('#presetRow [data-preset="top3"]');
  const chips = () => p.evaluate(() => [...document.querySelectorAll('#eraChips .eraBtn')].map(b => [b.textContent.replace(/\d{4}–(\d{4}|now)$/, ''), b.className.replace('eraBtn', '').trim(), b.getAttribute('aria-pressed')]));
  const view2 = () => p.evaluate(() => { const sc = chart.options.scales; return { x0: Math.round(sc.x.min + 0.5), x1: Math.round(sc.x.max - 0.5), ymax: sc.y.max, sub: document.getElementById('chartSub').textContent,
    url: location.search, presets: [...document.querySelectorAll('#presetRow .pill')].map(b => b.textContent), checked: [...document.querySelectorAll('#erasPicker input:checked')].map(i => i.dataset.id),
    rows: [...document.querySelectorAll('#erasPicker .pickerRow')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    empty: document.getElementById('erasEmpty').style.display !== 'none' ? document.getElementById('erasEmpty').textContent : '' }; });
  let ch = await chips();
  t.check('era chips: All, then one per era; All is on', ch.length === 11 && ch[0][0] === 'All' && ch[0][2] === 'true' && ch.slice(1).every(c => c[2] === 'false'), JSON.stringify(ch));
  t.check('no era presets while the whole span shows', !(await view2()).presets.some(x => /Champions of|Top 5 of/.test(x)));
  await p.click('#eraChips .eraBtn[data-from="2006"]');
  let V = await view2();
  t.check('choosing the V8 era zooms to 2006–2013, fits the position axis to the seasons in view (worst P8 → P10), and goes in the link',
    V.x0 === 2006 && V.x1 === 2013 && V.ymax === 10.5 && /2006–2013/.test(V.sub) && V.url === '?view=drivers&era=2006', JSON.stringify(V));
  ch = await chips();
  t.check('…its chip is on and All is not', ch.find(c => c[0] === 'V8')[2] === 'true' && ch[0][2] === 'false');
  t.check('…and two presets for the era appear', V.presets.includes('Champions of this era') && V.presets.includes('Top 5 of this era'), V.presets.join());
  await p.click('#presetRow .pill:has-text("Champions of this era")');
  V = await view2();
  t.check('Champions of this era: who won a title in those seasons (Gamma 2010 and 2012, Alpha 2009), the zoom kept', V.checked.join() === 'd3,d1' && V.x0 === 2006 && V.x1 === 2013, JSON.stringify(V));
  t.check('the picker shows titles in the era (Gamma 2, Alpha 1), not overall', /Carl Gamma.*2 titles/.test(V.rows[0]) && /Alan Alpha.*1 title\b/.test(V.rows[1]), V.rows.join(' | '));
  await p.click('#presetRow .pill:has-text("Top 5 of this era")');
  V = await view2();
  t.check('Top 5 of this era: everyone who raced then, best first (only three did)', V.checked.join() === 'd3,d1,d2', JSON.stringify(V));
  await p.click('#eraChips .eraBtn[data-from="2014"]');
  V = await view2(); ch = await chips();
  t.check('two eras: the range runs from the first start to the last end (2006–2021), and the presets say "range"',
    V.x0 === 2006 && V.x1 === 2021 && V.url === '?view=drivers&era=2006,2014' && V.presets.includes('Champions of the range') && ch.find(c => c[0] === 'V8')[2] === 'true' && ch.find(c => c[0] === 'Turbo hybrid')[2] === 'true', JSON.stringify([V, ch]));
  await p.click('#eraChips .eraBtn[data-from="1989"]');
  await p.click('#eraChips .eraBtn[data-from="2006"]'); // untick V8: it now lies between V10 and turbo hybrid
  ch = await chips();
  t.check('…V8 between V10 and turbo hybrid, not chosen: dashed', /between/.test(ch.find(c => c[0] === 'V8')[1]) && ch.find(c => c[0] === 'V8')[2] === 'false', JSON.stringify(ch));
  await p.click('#eraChips .eraBtn[data-from="1989"]'); await p.click('#eraChips .eraBtn[data-from="2014"]');
  await p.click('#eraChips .eraBtn[data-from="1977"]');
  V = await view2();
  t.check('an era where none of the picks raced: says so, keeps the picks listed (marked not in these years)', /None of these drivers raced in these years/.test(V.empty) && V.rows.length === 3 && V.rows.every(r => /not in these years/.test(r)) && V.x0 === 1977 && V.x1 === 1982, JSON.stringify(V));
  await p.click('#eraChips .eraBtn[data-from=""]');
  V = await view2(); ch = await chips();
  t.check('All clears the zoom: whole span, no era in the link, the era presets go', V.x0 === 1966 && V.x1 === 2026 && !/era/.test(V.url) && !V.presets.some(x => /of this era/.test(x)) && ch[0][2] === 'true', JSON.stringify(V));
  // the picks the era presets set, with the zoom gone, are an ordinary set
  await p.click('#presetRow [data-preset="top3"]');
  V = await view2();
  t.check('the era is a separate choice from the picks: the default picks and a clean link are back', V.checked.join() === 'd3,d1,d2' && V.url === '?view=drivers', JSON.stringify(V));

  // picking
  await p.click('#presetRow [data-preset="none"]');
  s = await state();
  ax = await axesOf();
  t.check('nothing picked: the whole span and P20', ax.x0 === 1966 && ax.x1 === 2026 && ax.ymax === 20.5 && ax.ticks.join() === '1,5,10,15,20', JSON.stringify(ax));
  t.check('None clears the chart and puts an empty list in the link', s.sets.length === 0 && s.checked.length === 0 && s.url === '?view=drivers&d=' && s.active.join() === 'none' && /0 of 3 drivers/.test(s.summary), JSON.stringify(s));
  t.check('nothing picked says so', await p.$eval('#erasEmpty', e => e.style.display !== 'none'));
  await p.click('#erasPicker input[data-id="d2"]');
  s = await state();
  t.check('ticking a driver adds the line and keeps the link in step', s.checked.join() === 'd2' && s.sets.join() === 'Bob Beta' && s.url === '?view=drivers&d=d2', JSON.stringify(s));
  await p.click('#erasPicker input[data-id="d2"]'); await p.click('#erasPicker input[data-id="d3"]'); // Gamma only
  ax = await axesOf();
  t.check('one driver (Gamma, 2009–2026, worst P3): seasons from one year before the first to the last, axis P1–P5', ax.x0 === 2008 && ax.x1 === 2026 && ax.ymax === 5.5 && ax.ticks.join() === '1,2,3,4,5' && /2008–2026/.test(ax.sub), JSON.stringify(ax));
  await p.click('#presetRow [data-preset="champs"]');
  t.check('All champions picks everyone who won a title', (await state()).checked.join() === 'd3,d1,d2');
  await p.click('#presetRow [data-preset="now"]');
  s = await state();
  t.check('"Top 10 now" picks the latest season\'s drivers', s.checked.join() === 'd3,d1', JSON.stringify(s));
  await p.click('#presetRow [data-preset="top3"]');
  t.check('back on the default preset the link has no picks again', (await state()).url === '?view=drivers');

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
  t.check('constructors view: one line per team lineage, the constructors view needs no link key (it is the default, O7)', s.url === '' && s.sets.length >= 2 && s.sets.includes('Red Bull') && s.sets.includes('Mercedes'), JSON.stringify(s));
  t.check('the note says the constructors\' standings start in 1958 and that a team keeps its line', /start in 1958/.test(await h.text(p, '#erasNote')) && /one line/.test(await h.text(p, '#erasNote')));
  t.check('"Top 5 now" on the constructors view', /Top 5 now/.test(await h.text(p, '#presetRow')));
  // #144: a team's lineage is shown and its earlier names are searchable
  const mrow = () => p.evaluate(() => { const i = document.querySelector('#erasPicker input[data-id="mercedes"]'), r = i && i.closest('.pickerRow');
    return r ? { title: r.title, formerly: [...r.querySelectorAll('.erasFormer')].map(x => [x.textContent, x.className, getComputedStyle(x).display]), match: (r.querySelector('.erasMatch') || {}).textContent || null } : null; });
  const rowsNow = () => p.$$eval('#erasPicker .pickerRow', r => r.map(x => x.querySelector('.pickerCode').firstChild.textContent));
  let mr = await mrow();
  t.check('#144: the Mercedes row says "formerly Tyrrell, BAR, Honda, Brawn GP", with every name and its years in the row\'s tooltip',
    mr.formerly.length === 2 && mr.formerly[0][0] === 'formerly Tyrrell, BAR, Honda, Brawn GP' && mr.title === 'Tyrrell 1999, BAR 2000, Honda 2006, Brawn GP 2009, Mercedes 2010–', JSON.stringify(mr));
  t.check('#144: a team that never changed its name has no "formerly" line', await p.$$eval('#erasPicker .pickerRow', r => r.filter(x => /Red Bull/.test(x.textContent)).every(x => !x.querySelector('.erasFormer'))));
  t.check('#144: under the chart, each picked team with several names lists them with the years',
    /Mercedes: Tyrrell 1999 → BAR 2000 → Honda 2006 → Brawn GP 2009 → Mercedes 2010–/.test(await h.text(p, '#erasLineage')) && !/Red Bull:/.test(await h.text(p, '#erasLineage')), await h.text(p, '#erasLineage'));
  for(const [q, hint] of [['tyrrell', 'matches Tyrrell'], ['BRAWN', 'matches Brawn GP'], ['honda', 'matches Honda'], ['merc', null]]){
    await p.fill('#erasFilter', q); mr = await mrow();
    t.check(`#144: searching "${q}" finds the Mercedes line` + (hint ? ` and says "${hint}"` : ' by its own name, with no hint'), (await rowsNow()).join() === 'Mercedes' && mr.match === hint, JSON.stringify([await rowsNow(), mr && mr.match]));
  }
  await p.fill('#erasFilter', 'red bull');
  t.check('#144: a search on a current name shows no "matches" hint', (await p.$$eval('#erasPicker .erasMatch', e => e.length)) === 0 && (await rowsNow()).includes('Red Bull'));
  t.check('#144: the search ignores accents and case, on the name and the short name',
    await p.evaluate(() => norm('Sergio Pérez Ångström') === 'sergio perez angstrom' && matchOf({ name: 'Sergio Pérez', short: 'Pérez' }, 'perez') === '' && matchOf({ name: 'Sergio Pérez', short: 'Pérez' }, 'pérez'.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) === ''
      && matchOf({ name: 'Mercedes', short: 'Mercedes', aliases: new Set(['Tyrrell']) }, 'tyr') === 'Tyrrell' && matchOf({ name: 'A', short: 'A' }, 'zz') === null));
  await p.fill('#erasFilter', '');
  const vp = p.viewportSize(); await p.setViewportSize({ width: 390, height: 900 }); await p.waitForTimeout(250); mr = await mrow();
  t.check('#144: on a phone the Mercedes row shows its first two earlier names and "+2" (full list stays in the tooltip and under the chart)',
    mr.formerly.find(f => f[1].includes('short'))[2] === 'block' && mr.formerly.find(f => f[1].includes('full'))[2] === 'none' && mr.formerly.find(f => f[1].includes('short'))[0] === 'formerly Tyrrell, BAR +2', JSON.stringify(mr));
  await p.setViewportSize(vp); await p.waitForTimeout(250);
  t.check('#144: the lineage line is for constructors only (the drivers view has none)', await (async () => { await p.selectOption('#viewSel', 'drivers'); const n = await p.$$eval('#erasPicker .erasFormer', e => e.length) + (await h.text(p, '#erasLineage')).length; await p.selectOption('#viewSel', 'teams'); return n === 0; })());
  await p.selectOption('#viewSel', 'drivers'); await p.fill('#erasFilter', 'bob beta');
  t.check('#144: drivers are found by their full name', (await rowsNow()).join() === 'Bob Beta');
  await p.selectOption('#viewSel', 'teams');

  // #145: the Share button, in the chart card, the same as the other pages'
  await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { window.__copied = s; } }, configurable: true }); });
  t.check('#145: the chart card has a Share button like the other pages\' (icon and "Share")', await p.$eval('#chartCard .f1c-share', b => !!b.querySelector('svg') && b.querySelector('span').textContent === 'Share'));
  await p.click('#chartCard .f1c-share'); await p.waitForTimeout(120);
  const shared = await p.evaluate(() => window.__copied);
  t.check('#145: Share copies the full link to this view (the address bar\'s, with the picks)', shared === p.url() && shared.startsWith('http://site.test/eras.html'), shared);
  t.check('#145: Share says the link was copied, then goes back to "Share"', /Link copied/.test(await p.textContent('#chartCard .f1c-share')));
  await p.click('#erasPicker input[data-id="mercedes"]'); await p.click('#chartCard .f1c-share'); await p.waitForTimeout(120);
  { const l = await p.evaluate(() => window.__copied); t.check('#145: the link follows the picks (Mercedes unticked is gone from it)', l === p.url() && /[?&]t=/.test(l) && !l.split('t=')[1].split('&')[0].split(',').includes('mercedes'), l); }
  await p.click('#erasPicker input[data-id="mercedes"]');
  await p.click('#erasPicker input[data-id="mercedes"]');
  s = await state();
  t.check('unticking a team drops its line (the link then lists the rest)', !s.sets.includes('Mercedes') && /^\?t=/.test(s.url), JSON.stringify(s));
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
  p = await open(); await p.goto('http://site.test/eras.html?era=1999,2006,2014'); await wait(p);
  V = await view2();
  t.check('a link\'s eras are applied (an unknown start year is dropped): 2006–2021', V.x0 === 2006 && V.x1 === 2021 && V.url === '?era=2006,2014', JSON.stringify(V));
  await p.done();
  p = await open(); await p.goto('http://site.test/eras.html?view=drivers&d=d2'); await wait(p);
  t.check('a link\'s driver picks are applied', (await state()).sets.join() === 'Bob Beta');
  await p.done();

  // #135 O3 + C7: on a phone the chart scrolls sideways, with the position labels pinned and no sideways era labels
  const ph = await open({ width: 390 }); await ph.goto('http://site.test/eras.html?view=drivers'); await wait(ph);
  const sc = () => ph.evaluate(() => { const box = document.getElementById('erasScroll'), pin = document.getElementById('erasPinCanvas'), c = pin.getContext('2d');
    const px = c.getImageData(0, 0, pin.width, pin.height).data; let ink = 0; const bg = [px[0], px[1], px[2]];
    for(let i = 0; i < px.length; i += 4) if(px[i] !== bg[0] || px[i + 1] !== bg[1] || px[i + 2] !== bg[2]) ink++;
    return { page: document.documentElement.scrollWidth, box: box.clientWidth, content: box.scrollWidth, left: box.scrollLeft,
      pinLeft: Math.round(pin.getBoundingClientRect().left - box.getBoundingClientRect().left), pinOn: document.getElementById('erasPin').classList.contains('on'), pinW: pin.width, ink,
      hint: !document.getElementById('erasHint').hidden, labels: chart.$eraLabels, ticks: chart.scales.y.ticks.length }; });
  let q = await sc();
  t.check('phone: the chart is wider than the screen and scrolls inside its box (the page itself doesn\'t)', q.content > q.box * 2 && q.page <= 390, JSON.stringify(q));
  t.check('phone: it starts at the latest seasons (scrolled to the right end)', q.left + q.box >= q.content - 2, JSON.stringify(q));
  t.check('phone: a hint says to swipe', q.hint && /Swipe/.test(await h.text(ph, '#erasHint')));
  t.check('phone: the position labels are on a pinned strip (it has drawn ink)', q.pinOn && q.pinW > 0 && q.ink > 20, JSON.stringify({ pinOn: q.pinOn, pinW: q.pinW, ink: q.ink }));
  t.check('phone: no era label is turned sideways', q.labels.length >= 5 && q.labels.every(l => !l.rotated), JSON.stringify(q.labels));
  for(const x of [0, 300, 99999]){
    await ph.evaluate(v => { document.getElementById('erasScroll').scrollLeft = v; }, x); await ph.waitForTimeout(60);
    const r = await sc();
    t.check(`phone: the pinned labels stay at the left edge at scroll ${x}`, r.pinLeft === 0, JSON.stringify(r));
  }
  await h.screenshot(ph, 'eras-phone-scroll.png');
  await ph.click('#erasPicker input[data-id="d1"]'); await ph.click('#erasPicker input[data-id="d2"]'); // Gamma only: 2008–2026, narrow enough to fit
  q = await sc();
  t.check('phone: few seasons fit without scrolling (no hint, no pinned strip)', q.content <= q.box + 1 && !q.hint && !q.pinOn, JSON.stringify(q));
  await ph.click('#presetRow [data-preset="top3"]');
  q = await sc();
  t.check('phone: a new set of picks starts at the latest seasons again', q.content > q.box * 2 && q.left + q.box >= q.content - 2, JSON.stringify(q));
  await ph.setViewportSize({ width: 360, height: 1400 }); await ph.waitForTimeout(250);
  q = await sc();
  t.check('phone: turning to another width redraws to fit it', q.box < 360 && q.content > q.box * 2 && q.page <= 360, JSON.stringify(q));
  await ph.done();
  const dk = await open({ width: 1000 }); await wait(dk);
  const dq = await dk.evaluate(() => ({ box: document.getElementById('erasScroll').clientWidth, content: document.getElementById('erasScroll').scrollWidth, pin: document.getElementById('erasPin').classList.contains('on'),
    hint: !document.getElementById('erasHint').hidden, labels: chart.$eraLabels.length }));
  t.check('desktop: the chart fits its box, no pinned strip, no hint, era labels as before', dq.content <= dq.box + 1 && !dq.pin && !dq.hint && dq.labels >= 5, JSON.stringify(dq));
  await dk.done();

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

  // #135 C1 + C5: a smaller default, a hint for many lines, Clear, and what's picked listed first.
  // A second fake file with nine drivers: x1 wins 3 titles (2000–02), x2 and x3 two each, x4 and x5 one each.
  const champs = ['x1', 'x1', 'x1', 'x2', 'x2', 'x3', 'x3', 'x4', 'x5'], NAMES = { x1: 'Yan Yankee', x2: 'Xia Xray', x3: 'Walt Whiskey', x4: 'Victor Victor', x5: 'Uma Uniform', x6: 'Anna Alpha', x7: 'Bea Bravo', x8: 'Cal Charlie', x9: 'Dee Delta' };
  const D2 = {}, seasons2 = {};
  Object.entries(NAMES).forEach(([id, n]) => { D2[id] = { n, s: n.split(' ')[1] }; });
  champs.forEach((c, i) => { const rows = []; let pos = 2;
    Object.keys(NAMES).forEach(id => { if(id === 'x3' && i < 4) return; if(id === c) rows.push([id, 1, 100, 'ferrari']); else rows.push([id, pos++, 50 - pos, 'ferrari']); });
    seasons2[2000 + i] = { round: 16, d: rows, t: [] }; });
  const FAKE2 = { v: 1, generatedAt: 0, partial: null, drivers: D2, teams: { ferrari: { n: 'Ferrari' } }, seasons: seasons2 };
  const big = await h.openPage('eras', { eras: FAKE2 }); await big.goto('http://site.test/eras.html?view=drivers'); await big.waitForSelector('#erasPicker input'); await big.waitForTimeout(200);
  const bs = () => big.evaluate(() => ({ checked: [...document.querySelectorAll('#erasPicker input:checked')].map(i => i.dataset.id),
    order: [...document.querySelectorAll('#erasPicker input')].map(i => i.dataset.id), lines: chart.data.datasets.length,
    many: !document.getElementById('erasMany').hidden, manyText: document.getElementById('erasMany').textContent, url: location.search,
    presets: [...document.querySelectorAll('#presetRow .pill')].map(b => [b.dataset.preset, b.textContent, b.classList.contains('active')]) }));
  let B = await bs();
  t.check('C1: the default is the three drivers with the most titles (x1 3, then x2 and x3 with 2 each), no hint', B.checked.join() === 'x1,x2,x3' && B.lines === 3 && !B.many && B.url === '?view=drivers', JSON.stringify(B));
  t.check('C1: the default preset reads "Most titles (3)" and is lit', B.presets.some(x => x[0] === 'top3' && x[1] === 'Most titles (3)' && x[2]), JSON.stringify(B.presets));
  t.check('C5: the clear button is called Clear (not None)', B.presets.some(x => x[0] === 'none' && x[1] === 'Clear') && !B.presets.some(x => x[1] === 'None'));
  await big.click('#presetRow [data-preset="champs"]');
  B = await bs();
  t.check('five champions: five lines, still no hint (six is fine)', B.lines === 5 && !B.many, JSON.stringify(B.checked));
  await big.click('#erasPicker input[data-id="x6"]'); await big.click('#erasPicker input[data-id="x7"]');
  B = await bs();
  t.check('C1: more than six lines shows the hint to pick fewer', B.lines === 7 && B.many && /Pick fewer/.test(B.manyText), JSON.stringify(B));
  await big.click('#erasPicker input[data-id="x7"]');
  t.check('…and six lines take it away', !(await bs()).many);
  await big.click('#presetRow [data-preset="none"]');
  B = await bs();
  t.check('Clear picks nothing and says so, with no hint', B.checked.length === 0 && B.lines === 0 && !B.many && B.url === '?view=drivers&d=', JSON.stringify(B));
  await big.click('#presetRow [data-preset="top3"]');
  await big.selectOption('#sortSel', 'name');
  B = await bs();
  t.check('C5: with a name sort, the three picked come first (Whiskey, Xray, Yankee), then everyone else A to Z',
    B.order.slice(0, 3).join() === 'x3,x2,x1' && B.order.slice(3).join() === 'x6,x7,x8,x9,x5,x4', JSON.stringify(B.order));
  const before = B.order.join();
  await big.click('#erasPicker input[data-id="x8"]');
  B = await bs();
  t.check('ticking another row doesn\'t move it (the list never jumps under the pointer)', B.order.join() === before && B.checked.includes('x8'), JSON.stringify(B.order));
  await big.click('#erasPicker input[data-id="x1"]');
  t.check('…nor does unticking one', (await bs()).order.join() === before);
  await big.selectOption('#sortSel', 'titles'); await big.selectOption('#sortSel', 'name');
  B = await bs();
  t.check('…the next rebuild (changing the sort) lists what\'s picked now at the top: x8, x2, x3 by name (Charlie, Whiskey, Xray)', B.order.slice(0, 3).join() === 'x8,x3,x2', JSON.stringify(B.order));
  t.check('a divider marks where the picked rows end', await big.$$eval('#erasPicker .pickerRow.restFirst', r => r.length) === 1);
  await h.screenshot(big, 'eras-picked-first.png');
  await big.done();

  // loading failure
  p = await h.openPage('eras'); await p.waitForSelector('#erasRetry');
  t.check('a missing file shows a message with Retry (and no crash)', /Couldn’t load/.test(await h.text(p, '#erasStatus')) && p.errors.length === 0);
  await p.done();
};
