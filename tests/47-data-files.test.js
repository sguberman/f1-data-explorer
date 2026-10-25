// #157 / #199: the committed season files (site/data/2014.json …). Built from Jolpica alone, and no season repeats a driver in
// a round (f1api.dev once did), every sprint round in the calendar that has been run has sprint results, and so on.
// Plain Node, no browser.
const fs = require('fs'), path = require('path');
module.exports = async (t, h) => {
  const dir = path.join(__dirname, '..', 'site', 'data'), bad = [], noSprint = [];
  const last = Math.max(...fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)));
  const dup = rows => { const seen = new Set(); return (rows || []).filter(x => seen.has(x.driverId) || !seen.add(x.driverId)).map(x => x.driverId); };
  for (let y = 2014; y <= last; y++) {
    const snap = JSON.parse(fs.readFileSync(path.join(dir, `${y}.json`), 'utf8'));
    for (const r of snap.rounds) {
      const d = [...dup(r.raceResults), ...dup(r.sprintResults)];
      if (d.length) bad.push(`${y} R${r.round}: ${d.join(',')}`);
    }
    if (y < 2021) continue; // the older files have no sprints
    for (const r of snap.rounds) if ((snap.calendar.sprintRounds || []).includes(r.round) !== !!r.sprintResults) noSprint.push(`${y} R${r.round}`);
    if (snap.patched) bad.push(`${y}: still carries the old f1api.dev patch marker`);
  }
  t.check('no season file from 2014 on repeats a driver in a round', bad.length === 0, bad.join('; '));
  t.check('2021 on: a round has sprint results exactly when the calendar lists it as a sprint', noSprint.length === 0, noSprint.join('; '));
  const r24 = JSON.parse(fs.readFileSync(path.join(dir, '2024.json'), 'utf8')).rounds[23].raceResults;
  t.check('2024 round 24: Pérez once, Lawson 17th, 20 drivers', r24.length === 20 && r24.filter(x => x.driverId === 'perez').length === 1 && (r24.find(x => x.driverId === 'lawson') || {}).position === 17, JSON.stringify(r24.map(x => [x.driverId, x.position])));
  const ids = new Set(JSON.parse(fs.readFileSync(path.join(dir, '2024.json'), 'utf8')).rounds.flatMap(r => r.raceResults.map(x => x.driverId)));
  t.check('2024: one id per driver (Zhou and Magnussen under Jolpica\'s ids, not f1api.dev\'s duplicates)', ids.has('zhou') && ids.has('kevin_magnussen') && !ids.has('guanyu') && !ids.has('magnussen'), [...ids].join(','));
};
