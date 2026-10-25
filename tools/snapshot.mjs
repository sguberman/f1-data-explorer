// #13: writes one file per season, site/data/{year}.json, so the site can load a whole season in one
// request instead of ~2 per round from the API. Run by .github/workflows/snapshot.yml. #199: the only source is Jolpica
// (https://api.jolpi.ca/ergast/f1, the Ergast API's successor); the rows are normalized by the site's own site/data.js
// (run in Node), so the files hold exactly what the pages would have built from the live API.
//
//   node tools/snapshot.mjs            update the current season, and any season whose file is missing or
//                                      incomplete
//   node tools/snapshot.mjs --all      regenerate every season (2021 on; earlier ones are tools/history-snapshot.mjs)
//
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(SITE, 'data');
const FIRST_YEAR = 2021;
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';

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

// All of a season's race ('results') or sprint ('sprint') rows from Jolpica, as races by round. Pages of 100 rows;
// a race can be split across two pages.
async function jolpicaRaces(year, kind, fetchImpl, pause){
  const key = kind === 'sprint' ? 'SprintResults' : 'Results', byRound = new Map();
  for(let offset = 0, total = 1; offset < total;){
    const res = await fetchImpl(`${JOLPICA}/${year}/${kind}.json?limit=100&offset=${offset}`);
    if(!res.ok) throw new Error(`Jolpica ${year} ${kind}: HTTP ${res.status}`);
    const d = (await res.json()).MRData;
    total = +d.total;
    for(const race of d.RaceTable.Races){
      const round = +race.round, have = byRound.get(round);
      if(have) have[key].push(...(race[key] || [])); else byRound.set(round, { ...race, [key]: [...(race[key] || [])] });
    }
    offset += +d.limit || 100;
    if(pause) await pause();
  }
  return byRound;
}

// Builds one season's snapshot. Throws if the API couldn't be read completely, so a bad run never
// overwrites a good file.
export async function buildSnapshot(year, fetchImpl, now = Date.now(), pause = null){
  const E = loadF1Data(fetchImpl).ergast;
  const races = await jolpicaRaces(year, 'results', fetchImpl, pause);
  const sprints = await jolpicaRaces(year, 'sprint', fetchImpl, pause);
  const rounds = [...races.keys()].sort((a, b) => a - b).map(n => {
    const r = races.get(n), sp = sprints.get(n);
    return { round: n, raceName: r.raceName, country: E.circuitCountry(r), raceResults: E.normalizeResults(r.Results, 'race'),
      sprintResults: sp && sp.SprintResults.length ? E.normalizeResults(sp.SprintResults, 'sprint') : null };
  });
  const res = await fetchImpl(`${JOLPICA}/${year}.json?limit=30`);
  if(!res.ok) throw new Error(`Jolpica ${year} calendar: HTTP ${res.status}`);
  const calendar = E.calendarFrom((await res.json()).MRData.RaceTable.Races);
  const raced = new Set(rounds.map(r => r.round));
  const withSprints = rounds.filter(r => r.sprintResults).map(r => r.round);
  const calendarSprints = calendar.sprintRounds.filter(n => raced.has(n));
  if(withSprints.join() !== calendarSprints.join()) throw new Error(`sprints found in rounds ${withSprints.join(',') || 'none'}, but the calendar lists ${calendarSprints.join(',') || 'none'}`);
  return { v: 1, year, generatedAt: now, complete: calendar.totalRounds > 0 && rounds.length >= calendar.totalRounds, calendar, rounds };
}

const sameData = (a, b) => a && b && JSON.stringify([a.calendar, a.rounds]) === JSON.stringify([b.calendar, b.rounds]);

async function main(){
  const all = process.argv.includes('--all');
  const thisYear = new Date().getUTCFullYear();
  fs.mkdirSync(OUT, { recursive: true });
  let changed = 0;
  for(let year = FIRST_YEAR; year <= thisYear; year++){
    const file = path.join(OUT, `${year}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if(!all && old && old.complete && year < thisYear){ console.log(`${year}: complete, skipped`); continue; }
    let snap;
    try{ snap = await buildSnapshot(year, fetch, Date.now(), () => new Promise(r => setTimeout(r, 400))); }
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
