// #13: writes one file per season, site/data/{year}.json, so the site can load a whole season in one
// request instead of ~2 per round from f1api.dev. Run by .github/workflows/snapshot.yml (GitHub's servers
// can reach f1api.dev). It runs the site's own site/data.js in Node, so the files hold exactly what the
// pages would have built from the live API.
//
//   node tools/snapshot.mjs            update the current season, and any season whose file is missing or
//                                      incomplete
//   node tools/snapshot.mjs --all      regenerate every season
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
    try{ snap = await buildSnapshot(year, fetch); }
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
