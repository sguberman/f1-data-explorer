// #141: back-fills site/data/{1950..2020}.json, one season file per year in the same shape the pages already
// read ({v:1, year, generatedAt, complete, calendar, rounds}), so every page can open the whole history.
// f1api.dev has nothing before 2021 (tools/snapshot.mjs writes 2021 on), so these come from Jolpica
// (https://api.jolpi.ca, the Ergast successor). Run by .github/workflows/snapshot.yml.
//
//   node tools/history-snapshot.mjs            write the seasons whose file is missing
//   node tools/history-snapshot.mjs --all      write every season again
//   node tools/history-snapshot.mjs 1988 1991  only these years
//
// #141 (counting): older seasons only counted a driver's best N results and, in 1958–78, a team's best-placed car; see
// site/counting.js. The files keep what was scored (`awarded`) and what counted (`points`, `teamPoints`).
//   node tools/history-snapshot.mjs --recount   re-apply the counting rules to the files already written (no fetching)
//
// Leaner than a recent season file: no sprints (none before 2021), no circuit times beyond what Jolpica has,
// and result rows carry only what the pages read. Points are Jolpica's, as awarded (shared drives are split
// between the drivers; "best N results count" is not applied). A finished season is never fetched twice, and
// a failed fetch never overwrites a good file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const F1Counting = createRequire(import.meta.url)('../site/counting.js'); // how older seasons counted points (best-N results, best car only)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'data');
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const FIRST_YEAR = 1950;
export const LAST_YEAR = 2020;

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

// Every race of a season ('results' or the calendar's plain season list), pages of 100 rows; a race can be
// split across two pages. Returns Jolpica's races merged by round.
async function seasonRaces(year, table, fetchImpl, pause, wait){
  const byRound = new Map();
  for(let offset = 0, total = 1; offset < total;){
    const d = await getJSON(`${JOLPICA}/${year}${table ? '/' + table : ''}.json?limit=100&offset=${offset}`, fetchImpl, wait);
    total = +d.total;
    for(const race of d.RaceTable.Races){
      const round = +race.round, have = byRound.get(round);
      if(have) have.Results.push(...(race.Results || []));
      else byRound.set(round, { ...race, Results: [...(race.Results || [])] });
    }
    offset += +d.limit || 100;
    await pause();
  }
  return byRound;
}

const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();

// Three-letter codes for drivers Jolpica gives none (before 2000s): the surname's first three letters; if
// another driver of the season has them, the first name's initial and the surname's first two; then a number.
function codeFor(driver, taken){
  if(/^[A-Z]{3}$/.test(driver.code || '') && !taken.has(driver.code)) return driver.code;
  const fam = ascii(driver.familyName).padEnd(3, 'X');
  for(const c of [fam.slice(0, 3), ascii(driver.givenName).slice(0, 1) + fam.slice(0, 2), fam.slice(0, 2) + '2', fam.slice(0, 2) + '3']){
    if(c.length === 3 && !taken.has(c)) return c;
  }
  return fam.slice(0, 3);
}

// One round's rows in the pages' shape. `codes` maps driverId -> code for the whole season, so a driver keeps
// one code in every round.
function rows(race, codes){
  return race.Results.map(x => {
    const pos = /^\d+$/.test(String(x.positionText)) ? parseInt(x.positionText, 10) : null;
    const num = parseInt(x.Driver.permanentNumber ?? x.number, 10);
    return {
      driverId: x.Driver.driverId,
      code: codes.get(x.Driver.driverId),
      name: `${x.Driver.givenName} ${x.Driver.familyName}`,
      teamId: x.Constructor.constructorId,
      teamName: x.Constructor.name,
      number: Number.isFinite(num) ? num : null,
      nationality: x.Driver.nationality || null,
      teamNationality: x.Constructor.nationality || null,
      position: pos,
      points: +x.points || 0,
      session: 'race',
    };
  });
}

// Jolpica's `time` is 'HH:MM:SSZ' when known.
const timeOf = t => typeof t === 'string' && /^\d{2}:\d{2}:\d{2}Z?$/.test(t) ? (t.endsWith('Z') ? t : t + 'Z') : null;

// Builds one season's file. Throws if Jolpica couldn't be read completely.
export async function buildHistory(year, fetchImpl, { now = Date.now(), pause = async () => {}, wait = sleep } = {}){
  const races = await seasonRaces(year, 'results', fetchImpl, pause, wait);
  const calendarRaces = await seasonRaces(year, '', fetchImpl, pause, wait);
  if(!races.size) throw new Error(`${year}: no results`);
  const codes = new Map(), taken = new Set();
  for(const race of [...races.values()].sort((a, b) => a.round - b.round)){
    for(const x of race.Results){
      if(codes.has(x.Driver.driverId)) continue;
      const c = codeFor(x.Driver, taken); codes.set(x.Driver.driverId, c); taken.add(c);
    }
  }
  const calendar = { totalRounds: calendarRaces.size, sprintRounds: [], raceNames: {}, raceDates: {}, raceTimes: {}, countries: {}, cities: {} };
  for(const [round, r] of calendarRaces){
    calendar.raceNames[round] = r.raceName;
    if(/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) calendar.raceDates[round] = r.date;
    const t = timeOf(r.time); if(t) calendar.raceTimes[round] = t;
    const loc = r.Circuit && r.Circuit.Location;
    if(loc && loc.country) calendar.countries[round] = loc.country;
    if(loc && loc.locality) calendar.cities[round] = loc.locality;
  }
  const rounds = [...races.values()].sort((a, b) => a.round - b.round).map(race => ({
    round: +race.round,
    raceName: race.raceName,
    country: (race.Circuit && race.Circuit.Location && race.Circuit.Location.country) || null,
    raceResults: rows(race, codes),
    sprintResults: null,
  }));
  const counted = F1Counting.apply(year, rounds);
  return { v: 1, year, generatedAt: now, complete: rounds.length >= calendar.totalRounds, calendar, rounds: counted, source: 'jolpica' };
}

const sameData = (a, b) => a && b && JSON.stringify([a.calendar, a.rounds, a.complete]) === JSON.stringify([b.calendar, b.rounds, b.complete]);

async function main(){
  const args = process.argv.slice(2), all = args.includes('--all');
  const years = args.filter(a => /^\d{4}$/.test(a)).map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  if(args.includes('--recount')){
    for(let year = FIRST_YEAR; year <= LAST_YEAR; year++){
      const file = path.join(OUT, `${year}.json`); if(!fs.existsSync(file)) continue;
      const old = JSON.parse(fs.readFileSync(file, 'utf8')), rounds = F1Counting.apply(year, old.rounds);
      if(JSON.stringify(rounds) !== JSON.stringify(old.rounds)){ fs.writeFileSync(file, JSON.stringify({ ...old, rounds })); console.log(`${year}: recounted`); }
    }
    return;
  }
  let changed = 0;
  for(let year = FIRST_YEAR; year <= LAST_YEAR; year++){
    if(years.length && !years.includes(year)) continue;
    const file = path.join(OUT, `${year}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if(!all && !years.length && old && old.complete){ console.log(`${year}: complete, skipped`); continue; }
    let snap;
    try{ snap = await buildHistory(year, fetch, { pause: () => sleep(350) }); }
    catch(e){ console.log(`::warning::${year}: ${e.message} — file left as it was`); continue; }
    if(sameData(old, snap)){ console.log(`${year}: unchanged`); continue; }
    fs.writeFileSync(file, JSON.stringify(snap));
    changed++;
    console.log(`${year}: written, ${snap.rounds.length} of ${snap.calendar.totalRounds} rounds`);
  }
  console.log(`${changed} file(s) changed`);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
