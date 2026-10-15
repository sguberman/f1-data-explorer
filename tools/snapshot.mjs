// #13: writes one file per season, site/data/{year}.json, so the site can load a whole season in one
// request instead of ~2 per round from f1api.dev. Run by .github/workflows/snapshot.yml (GitHub's servers
// can reach f1api.dev). It runs the site's own site/data.js in Node, so the files hold exactly what the
// pages would have built from the live API.
//
//   node tools/snapshot.mjs            update the current season, and any season whose file is missing or
//                                      incomplete
//   node tools/snapshot.mjs --all      regenerate every season
//
// 2021–2023 are also patched from Jolpica (#59: sprints and "not classified", which f1api.dev lacks).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(SITE, 'data');
const FIRST_YEAR = 2021;

// Loads site/data.js into a sandbox with an in-memory localStorage and the given fetch.
export function loadF1Data(fetchImpl){
  const store = new Map();
  const localStorage = {
    get length(){ return store.size; }, key: i => [...store.keys()][i] ?? null,
    getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k), clear: () => store.clear(),
  };
  const ctx = vm.createContext({ fetch: fetchImpl, localStorage, console, setTimeout, clearTimeout, Date, URL, JSON, Math, Promise });
  const src = fs.readFileSync(path.join(SITE, 'data.js'), 'utf8') + '\n;globalThis.F1Data = F1Data;';
  vm.runInContext(src, ctx, { filename: 'data.js' });
  return ctx.F1Data;
}

// Builds one season's snapshot. Throws if the API couldn't be read completely, so a bad run never
// overwrites a good file.
export async function buildSnapshot(year, fetchImpl, now = Date.now()){
  const F1Data = loadF1Data(fetchImpl);
  const { rounds, failed } = await F1Data.loadSeason(year, { live: true });
  if(failed) throw new Error(`f1api.dev failed while loading ${year}`);
  const calendar = await F1Data.getCalendar(year);
  return { v: 1, year, generatedAt: now, complete: calendar.totalRounds > 0 && rounds.length >= calendar.totalRounds, calendar, rounds };
}

// #59: f1api.dev has no sprint results for 2021–2023, and numbers every driver in those seasons (no "not
// classified"). Those seasons are patched from Jolpica (https://api.jolpi.ca, the Ergast successor): its
// positionText says who was classified ("R", "D", "W"… mean not classified), and it has the sprints. Every
// driver and round has to match f1api.dev's, or the season is left as it was.
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const PATCH_YEARS = [2021, 2022, 2023];
export const PATCH_VERSION = 1;
const classifiedPosition = t => /^\d+$/.test(String(t)) ? parseInt(t, 10) : null;

// All of a season's race ('results') or sprint ('sprint') rows from Jolpica, by round. Pages of 100 rows;
// a race can be split across two pages.
async function jolpicaRounds(year, kind, fetchImpl, pause){
  const key = kind === 'sprint' ? 'SprintResults' : 'Results', byRound = new Map();
  for(let offset = 0, total = 1; offset < total;){
    const res = await fetchImpl(`${JOLPICA}/${year}/${kind}.json?limit=100&offset=${offset}`);
    if(!res.ok) throw new Error(`Jolpica ${year} ${kind}: HTTP ${res.status}`);
    const d = (await res.json()).MRData;
    total = +d.total;
    for(const race of d.RaceTable.Races){
      const round = +race.round, rows = byRound.get(round) || [];
      rows.push(...(race[key] || [])); byRound.set(round, rows);
    }
    offset += +d.limit || 100;
    if(pause) await pause();
  }
  return byRound;
}

// Returns the season with Jolpica's classification and sprints, or throws (nothing is changed) if the two
// sources don't agree on who raced. Points come from Jolpica; any that differ from f1api.dev are counted.
export async function patchFromJolpica(snap, fetchImpl, pause){
  const races = await jolpicaRounds(snap.year, 'results', fetchImpl, pause);
  const sprints = await jolpicaRounds(snap.year, 'sprint', fetchImpl, pause);
  const report = { nc: 0, sprints: 0, pointsChanged: 0 };
  const latest = new Map(); // driver -> their latest race entry, for a sprint-only driver's team and details
  const rounds = snap.rounds.map(r => {
    const rows = races.get(r.round);
    if(!rows) throw new Error(`round ${r.round}: no race result on Jolpica`);
    const byId = new Map(rows.map(x => [x.Driver.driverId, x]));
    if(byId.size !== r.raceResults.length) throw new Error(`round ${r.round}: ${r.raceResults.length} drivers on f1api.dev, ${byId.size} on Jolpica`);
    const raceResults = r.raceResults.map(q => {
      const x = byId.get(q.driverId);
      if(!x) throw new Error(`round ${r.round}: ${q.driverId} isn't in Jolpica's result`);
      const position = classifiedPosition(x.positionText), points = +x.points;
      if(position === null) report.nc++;
      if(points !== q.points) report.pointsChanged++;
      return { ...q, position, points };
    });
    raceResults.forEach(q => latest.set(q.driverId, q));
    let sprintResults = r.sprintResults;
    const srows = sprints.get(r.round);
    if(srows && srows.length){
      sprintResults = srows.map(x => {
        const base = raceResults.find(q => q.driverId === x.Driver.driverId) || latest.get(x.Driver.driverId);
        if(!base) throw new Error(`round ${r.round} sprint: ${x.Driver.driverId} hasn't raced yet this season`);
        return { ...base, position: classifiedPosition(x.positionText), points: +x.points, session: 'sprint' };
      });
      report.sprints++;
    }
    return { ...r, raceResults, sprintResults };
  });
  const withSprints = rounds.filter(r => r.sprintResults && r.sprintResults.length).map(r => r.round);
  const raced = new Set(rounds.map(r => r.round)); // (only rounds already run: a season in progress has later sprints still to come)
  const calendarSprints = [...(snap.calendar.sprintRounds || [])].filter(n => raced.has(n)).sort((a, b) => a - b);
  if(withSprints.join() !== calendarSprints.join()) throw new Error(`sprints found in rounds ${withSprints.join(',') || 'none'}, but the calendar lists ${calendarSprints.join(',') || 'none'}`);
  return { snap: { ...snap, rounds, patched: { source: 'jolpica', version: PATCH_VERSION, what: ['sprints', 'classification'] } }, report };
}

const sameData = (a, b) => a && b && JSON.stringify([a.calendar, a.rounds, a.patched]) === JSON.stringify([b.calendar, b.rounds, b.patched]);

async function main(){
  const all = process.argv.includes('--all');
  const thisYear = new Date().getUTCFullYear();
  fs.mkdirSync(OUT, { recursive: true });
  let changed = 0;
  for(let year = FIRST_YEAR; year <= thisYear; year++){
    const file = path.join(OUT, `${year}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const needsPatch = PATCH_YEARS.includes(year) && !(old && old.patched && old.patched.version === PATCH_VERSION);
    if(!all && old && old.complete && year < thisYear && !needsPatch){ console.log(`${year}: complete, skipped`); continue; }
    let snap;
    try{
      snap = await buildSnapshot(year, fetch);
      if(PATCH_YEARS.includes(year)){ // #59
        const out = await patchFromJolpica(snap, fetch, () => new Promise(r => setTimeout(r, 400)));
        snap = out.snap;
        console.log(`${year}: patched from Jolpica — ${out.report.sprints} sprints, ${out.report.nc} not classified, ${out.report.pointsChanged} points changed`);
      }
    }
    catch(e){ console.log(`::warning::${year}: ${e.message} — file left as it was`); continue; } // other seasons still get committed
    if(!snap.rounds.length){ console.log(`${year}: no results yet, skipped`); continue; }
    if(sameData(old, snap)){ console.log(`${year}: unchanged (${snap.rounds.length} rounds)`); continue; }
    fs.writeFileSync(file, JSON.stringify(snap));
    changed++;
    console.log(`${year}: written, ${snap.rounds.length} of ${snap.calendar.totalRounds} rounds${snap.complete ? ' (complete)' : ''}`);
  }
  console.log(`${changed} file(s) changed`);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
