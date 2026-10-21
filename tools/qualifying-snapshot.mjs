// #158: writes site/data/grid/{year}.json for 2014 on: each round's qualifying (position and Q1/Q2/Q3 times) and starting
// grid. The season files (site/data/{year}.json) carry race results only. These come from Jolpica
// (https://api.jolpi.ca, the Ergast successor) for every year, so they read the same way throughout and use the season
// files' driver ids. Run by .github/workflows/snapshot.yml; nothing on the site reads them yet (the backtest does).
//
//   node tools/qualifying-snapshot.mjs            write seasons whose file is missing or not complete
//   node tools/qualifying-snapshot.mjs --all      write every season again
//   node tools/qualifying-snapshot.mjs 2019 2024  only these years
//
// File: {v:1, year, generatedAt, complete, source:'jolpica', rounds:[{round, raceName, qualifying:[{driverId, code,
// teamId, position, q1, q2, q3}], grid:{driverId: startingPosition}}]}. Times are milliseconds (null when the driver
// set none); grid 0 is a pit-lane start; a driver missing from `grid` didn't start. A finished season is never
// fetched twice, and a failed fetch never overwrites a good file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DATA = path.join(ROOT, 'site', 'data');
const OUT = path.join(SITE_DATA, 'grid');
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const FIRST_YEAR = 2014;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One request, a few polite retries (429 / 5xx / network).
async function getJSON(url, fetchImpl, wait){
  for(let attempt = 0; ; attempt++){
    let res = null;
    try{ res = await fetchImpl(url); }catch(e){ if(attempt >= 4) throw e; }
    if(res && res.ok) return (await res.json()).MRData;
    if(attempt >= 4) throw new Error(`${url}: HTTP ${res ? res.status : 'network error'}`);
    await wait(1000 * 2 ** attempt);
  }
}

// A season's races from one Jolpica table ('results', 'qualifying', or '' for the calendar), pages of 100 rows (a race
// can be split across two pages). Returns Map(round -> {race, rows}) where rows come from `key`.
async function seasonTable(year, table, key, fetchImpl, pause, wait){
  const byRound = new Map();
  for(let offset = 0, total = 1; offset < total;){
    const d = await getJSON(`${JOLPICA}/${year}${table ? '/' + table : ''}.json?limit=100&offset=${offset}`, fetchImpl, wait);
    total = +d.total;
    for(const race of d.RaceTable.Races){
      const round = +race.round, have = byRound.get(round);
      if(have) have.rows.push(...(race[key] || []));
      else byRound.set(round, { race, rows: [...(race[key] || [])] });
    }
    offset += +d.limit || 100;
    await pause();
  }
  return byRound;
}

// '1:30.031' -> 90031 (ms); anything else -> null.
export function lapMs(t){
  const m = /^(?:(\d+):)?(\d+)\.(\d{1,3})$/.exec(String(t || '').trim());
  return m ? (+(m[1] || 0)) * 60000 + (+m[2]) * 1000 + +m[3].padEnd(3, '0') : null;
}

// Builds one season's file. Throws if Jolpica couldn't be read completely.
// `canon` maps a Jolpica driver to the id the season file uses (f1api.dev and Jolpica spell a few differently, e.g.
// 'lindblad' / 'arvid_lindblad'); by default the Jolpica id.
export async function buildGrid(year, fetchImpl, { now = Date.now(), pause = async () => {}, wait = sleep, canon = d => d.driverId } = {}){
  const results = await seasonTable(year, 'results', 'Results', fetchImpl, pause, wait);
  const quali = await seasonTable(year, 'qualifying', 'QualifyingResults', fetchImpl, pause, wait);
  const calendar = await seasonTable(year, '', 'none', fetchImpl, pause, wait);
  if(!results.size) throw new Error(`${year}: no results`);
  const rounds = [...results.keys()].sort((a, b) => a - b).map(round => {
    const { race, rows } = results.get(round), q = quali.get(round);
    const grid = {};
    for(const x of rows){ const g = parseInt(x.grid, 10); if(Number.isFinite(g)) grid[canon(x.Driver)] = g; }
    return {
      round,
      raceName: race.raceName,
      qualifying: (q ? q.rows : []).map(x => ({
        driverId: canon(x.Driver), code: x.Driver.code || null, teamId: x.Constructor.constructorId,
        position: parseInt(x.position, 10), q1: lapMs(x.Q1), q2: lapMs(x.Q2), q3: lapMs(x.Q3),
      })),
      grid,
    };
  });
  return { v: 1, year, generatedAt: now, complete: rounds.length >= calendar.size, source: 'jolpica', rounds };
}

const sameData = (a, b) => a && b && JSON.stringify([a.rounds, a.complete]) === JSON.stringify([b.rounds, b.complete]);

async function main(){
  const args = process.argv.slice(2), all = args.includes('--all');
  const only = args.filter(a => /^\d{4}$/.test(a)).map(Number);
  const last = Math.max(...fs.readdirSync(SITE_DATA).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)));
  fs.mkdirSync(OUT, { recursive: true });
  let changed = 0;
  for(let year = FIRST_YEAR; year <= last; year++){
    if(only.length && !only.includes(year)) continue;
    const file = path.join(OUT, `${year}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if(!all && !only.length && old && old.complete){ console.log(`${year}: complete, skipped`); continue; }
    let snap;
    // the season file's id for each code, so the two files agree on who is who
    const season = JSON.parse(fs.readFileSync(path.join(SITE_DATA, `${year}.json`), 'utf8')), byCode = new Map();
    for(const r of season.rounds) for(const x of r.raceResults) if(x.code && !byCode.has(x.code)) byCode.set(x.code, x.driverId);
    try{ snap = await buildGrid(year, fetch, { pause: () => sleep(350), canon: d => byCode.get(d.code) || d.driverId }); }
    catch(e){ console.log(`::warning::${year}: ${e.message} — file left as it was`); continue; }
    if(sameData(old, snap)){ console.log(`${year}: unchanged`); continue; }
    fs.writeFileSync(file, JSON.stringify(snap));
    changed++;
    console.log(`${year}: written, ${snap.rounds.length} rounds${snap.complete ? '' : ' (season in progress)'}`);
  }
  console.log(`${changed} file(s) changed`);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
