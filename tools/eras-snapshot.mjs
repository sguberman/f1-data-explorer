// #135: builds site/data/eras.json, the final championship standings of every season since 1950 for the
// Eras page, so the page reads one small file and never calls an API. Run by .github/workflows/snapshot.yml.
// Source: Jolpica (https://api.jolpi.ca, the Ergast successor), the one API with the whole history; f1api.dev
// only has recent seasons. Driver standings go back to 1950, constructor standings to 1958 (404 before).
//
//   node tools/eras-snapshot.mjs            fetch missing seasons and refresh the current one
//   node tools/eras-snapshot.mjs --all      fetch every season again
//
// File: {v:1, generatedAt, partial, drivers:{id:{n,s}}, teams:{id:{n}}, seasons:{year:{round, d:[[driverId,
// position, points, teamId]], t:[[teamId, position, points]]}}}. Only classified standings rows are kept
// (Jolpica's position "-" = not ranked). A finished season is never fetched twice; a failed fetch never
// overwrites a good file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'site', 'data', 'eras.json');
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const FIRST_YEAR = 1950;
export const FIRST_TEAM_YEAR = 1958;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One standings request, a few polite retries (429 / 5xx / network), null for a 404 (no such standings).
async function getJSON(url, fetchImpl, wait){
  for(let attempt = 0; ; attempt++){
    let res = null;
    try{ res = await fetchImpl(url); }catch(e){ if(attempt >= 4) throw e; }
    if(res && res.ok) return (await res.json()).MRData;
    if(res && res.status === 404) return null;
    if(attempt >= 4) throw new Error(`${url}: HTTP ${res ? res.status : 'network error'}`);
    await wait(1000 * 2 ** attempt);
  }
}

// One season's standings. `table` is 'driverstandings' or 'constructorstandings'; returns {round, rows} or null.
async function standings(year, table, fetchImpl, pause, wait){
  const d = await getJSON(`${JOLPICA}/${year}/${table}.json?limit=100`, fetchImpl, wait);
  await pause();
  const list = d && d.StandingsTable.StandingsLists[0];
  if(!list) return null;
  return { round: +list.round, rows: list[table === 'driverstandings' ? 'DriverStandings' : 'ConstructorStandings'] };
}

// Builds {round, d, t} for one season and adds any new names to `names`. Throws if Jolpica fails.
export async function buildSeason(year, names, fetchImpl, pause = async () => {}, wait = sleep){
  const ds = await standings(year, 'driverstandings', fetchImpl, pause, wait);
  if(!ds) throw new Error(`${year}: no driver standings`);
  const d = [];
  for(const r of ds.rows){
    if(!/^\d+$/.test(r.positionText || r.position)) continue; // not ranked
    const id = r.Driver.driverId, team = r.Constructors && r.Constructors[0];
    names.drivers[id] = { n: `${r.Driver.givenName} ${r.Driver.familyName}`, s: r.Driver.familyName };
    if(team) names.teams[team.constructorId] = names.teams[team.constructorId] || { n: team.name };
    d.push([id, +r.position, +r.points, team ? team.constructorId : null]);
  }
  const t = [];
  if(year >= FIRST_TEAM_YEAR){
    const cs = await standings(year, 'constructorstandings', fetchImpl, pause, wait);
    if(cs) for(const r of cs.rows){
      if(!/^\d+$/.test(r.positionText || r.position)) continue;
      names.teams[r.Constructor.constructorId] = { n: r.Constructor.name };
      t.push([r.Constructor.constructorId, +r.position, +r.points]);
    }
  }
  return { round: ds.round, d, t };
}

// Fills `file` (an old eras.json object or null) up to `thisYear`. Seasons already in the file that are
// finished are kept as they are, unless `all`. Returns the new file object; throws on a failed fetch.
export async function buildEras(old, thisYear, fetchImpl, { all = false, now = Date.now(), pause, wait, inProgress = true, log = () => {} } = {}){
  const names = { drivers: { ...(old && old.drivers) }, teams: { ...(old && old.teams) } };
  const seasons = { ...(old && !all ? old.seasons : {}) };
  for(let year = FIRST_YEAR; year <= thisYear; year++){
    // a season is final once it's done: the current one, and the one that was still in progress last time, are fetched again
    if(seasons[year] && year !== thisYear && year !== (old && old.partial)) continue;
    const s = await buildSeason(year, names, fetchImpl, pause, wait);
    seasons[year] = s;
    log(`${year}: ${s.d.length} drivers, ${s.t.length} teams, through round ${s.round}`);
  }
  const partial = inProgress && seasons[thisYear] ? thisYear : null; // the current season is only standings so far
  return { v: 1, generatedAt: now, partial, drivers: names.drivers, teams: names.teams, seasons };
}

const sameData = (a, b) => a && b && JSON.stringify([a.partial, a.drivers, a.teams, a.seasons]) === JSON.stringify([b.partial, b.drivers, b.teams, b.seasons]);

async function main(){
  const all = process.argv.includes('--all');
  const thisYear = new Date().getUTCFullYear();
  const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
  // The current season is complete once its season file (site/data/{year}.json) says so.
  let inProgress = true;
  try{ inProgress = !JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', `${thisYear}.json`), 'utf8')).complete; }catch(e){}
  let eras;
  try{ eras = await buildEras(old, thisYear, fetch, { all, inProgress, pause: () => sleep(350), log: console.log }); }
  catch(e){ console.log(`::warning::eras: ${e.message} — file left as it was`); return; }
  if(sameData(old, eras)){ console.log('eras: unchanged'); return; }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(eras));
  console.log(`eras: written, ${Object.keys(eras.seasons).length} seasons`);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
