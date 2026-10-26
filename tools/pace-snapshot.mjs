// #186: saved copies of OpenF1 sessions for the Weekend Pace page. OpenF1 closes its API to everyone without an account, even for past
// sessions, while an F1 session is live, so a finished session is saved here once and the page reads the file (no API request, no
// limit, works through a live session). Run by .github/workflows/pace.yml every 20 minutes on race weekends: a session is saved
// 20 minutes after it ends, once OpenF1 is open again.
//
//   node tools/pace-snapshot.mjs            this year's finished sessions that are not saved yet, and the sessions list
//   node tools/pace-snapshot.mjs --all      every year since 2023
//   node tools/pace-snapshot.mjs 2025       only these years
//
// Files: site/data/pace/{year}.json = {v:1, year, generatedAt, sessions:[{meeting_key, session_key, session_name, date_start, date_end,
// location, country_name, year, is_cancelled}]} (the whole calendar, upcoming sessions too; rewritten only when it changes), and
// site/data/pace/{year}/{sessionKey}.json = F1OpenF1.compact(): laps, stints, drivers, the qualifying parts' start/finish messages and
// the classification as arrays (the field names are in the file). A saved session is never fetched again.
// #201: site/data/pace/{year}/{raceSessionKey}-grid.json = F1OpenF1.gridFile(): the Race's starting grid (/starting_grid) and drivers, saved
// once qualifying has ended and kept up to date (a late penalty) until the race starts, so What-If can offer the Starting grid before the
// race, when OpenF1 is closed and Jolpica has no grid yet. If OpenF1 says a live
// session has closed it, the run stops quietly and the next run tries again; nothing half-written is kept.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const O = require('../site/openf1.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'data', 'pace');
const BASE = 'https://api.openf1.org/v1';
export const FIRST_YEAR = 2023;
export const SETTLE_MS = 20 * 60e3; // a session is saved this long after it ends, when its data is complete

const sleep = ms => new Promise(r => setTimeout(r, ms));
export class LiveSession extends Error {}

// One request, a few polite retries on 429; the "live session in progress" 401 is a LiveSession.
async function getRows(url, fetchImpl, wait){
  for(let attempt = 0; ; attempt++){
    const res = await fetchImpl(BASE + url);
    if(res.status === 429 && attempt < 4){ await wait(1500 * (attempt + 1)); continue; }
    if(res.status === 401){
      let detail = ''; try{ detail = (await res.json()).detail || ''; }catch(e){}
      throw /Live F1 session/i.test(detail) ? new LiveSession(detail) : new Error(`${url}: HTTP 401`);
    }
    if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const rows = await res.json();
    if(!Array.isArray(rows)) throw new Error(`${url}: unexpected answer`);
    return rows;
  }
}

// One year: the sessions list, then each finished session that is not saved. Returns {year, written:[keys], failed:[keys], list:'written'|'unchanged', live}.
export async function runYear(year, { fetchImpl = fetch, dir = OUT, now = Date.now(), wait = sleep, gap = 350 } = {}){
  const out = { year, written: [], failed: [], grids: [], list: 'unchanged', live: false };
  const get = async url => { await wait(gap); return getRows(url, fetchImpl, wait); };
  let rows;
  try{ rows = await get('/sessions?year=' + year); }
  catch(e){ if(e instanceof LiveSession){ out.live = true; return out; } throw e; }
  fs.mkdirSync(path.join(dir, String(year)), { recursive: true });
  const sessions = rows.map(r => Object.fromEntries(O.SESSION_FIELDS.map(f => [f, r[f] === undefined ? null : r[f]]))).sort((a, b) => a.date_start < b.date_start ? -1 : 1);
  const listFile = path.join(dir, `${year}.json`);
  let old = null; try{ old = JSON.parse(fs.readFileSync(listFile, 'utf8')); }catch(e){}
  if(!old || JSON.stringify(old.sessions) !== JSON.stringify(sessions)){
    fs.writeFileSync(listFile, JSON.stringify({ v: 1, year, generatedAt: now, sessions }));
    out.list = 'written';
  }
  for(const s of sessions){
    const file = path.join(dir, String(year), `${s.session_key}.json`);
    if(!O.KINDS.has(s.session_name) || s.is_cancelled) continue;
    // a saved sprint or race without the safety car messages (saved before they were kept) is saved again
    if(fs.existsSync(file)){ let had = null; try{ had = JSON.parse(fs.readFileSync(file, 'utf8')); }catch(e){} if(!(had && /^(Sprint|Race)$/.test(s.session_name) && !(had.rc >= 2))) continue; }
    if(Date.parse(s.date_end) + SETTLE_MS > now) continue; // not over yet, or not settled
    try{
      const q = '?session_key=' + s.session_key, raw = {};
      raw.laps = await get('/laps' + q); raw.stints = await get('/stints' + q); raw.drivers = await get('/drivers' + q);
      raw.raceControl = O.hasRaceControl(s.session_name) ? await get('/race_control' + q) : [];
      raw.result = O.resultKind(s.session_name) ? await get('/session_result' + q) : [];
      // no laps at all, soon after the end, is OpenF1 not having them yet: try again next time
      if(!raw.laps.length && now - Date.parse(s.date_end) < 24 * 3600e3) continue;
      fs.writeFileSync(file, JSON.stringify(O.compact(raw, { key: s.session_key, year, name: s.session_name }, now)));
      out.written.push(s.session_key);
    }catch(e){
      if(e instanceof LiveSession){ out.live = true; return out; }
      out.failed.push(s.session_key); console.log(`::warning::${year} ${s.session_name} (${s.session_key}): ${e.message}`);
    }
  }
  // #201: the starting grid of a Race that has not started, once its weekend's qualifying is over; rewritten only when it changes
  for(const s of sessions){
    if(s.session_name !== 'Race' || s.is_cancelled || Date.parse(s.date_start) <= now) continue;
    const quali = sessions.find(x => x.meeting_key === s.meeting_key && x.session_name === 'Qualifying' && !x.is_cancelled);
    if(!quali || Date.parse(quali.date_end) > now) continue;
    const file = path.join(dir, String(year), `${s.session_key}-grid.json`);
    try{
      const q = '?session_key=' + s.session_key, grid = await get('/starting_grid' + q);
      if(!grid.some(r => r.position != null)) continue; // not published yet: keep what there is
      const next = O.gridFile(s.session_key, grid, await get('/drivers' + q), now);
      let had = null; try{ had = JSON.parse(fs.readFileSync(file, 'utf8')); }catch(e){}
      if(had && JSON.stringify([had.grid, had.drivers]) === JSON.stringify([next.grid, next.drivers])) continue;
      fs.writeFileSync(file, JSON.stringify(next));
      out.grids.push(s.session_key);
    }catch(e){
      if(e instanceof LiveSession){ out.live = true; return out; }
      out.failed.push(s.session_key); console.log(`::warning::${year} starting grid (${s.session_key}): ${e.message}`);
    }
  }
  return out;
}

async function main(){
  const args = process.argv.slice(2), all = args.includes('--all');
  const only = args.filter(a => /^\d{4}$/.test(a)).map(Number), last = new Date().getUTCFullYear();
  const years = only.length ? only : all ? Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i) : [last];
  for(const year of years){
    const r = await runYear(year);
    console.log(`${year}: ${r.live ? 'OpenF1 is closed (a live session): nothing saved this time' : `sessions list ${r.list}, ${r.written.length} session(s) saved${r.grids.length ? `, ${r.grids.length} starting grid(s)` : ''}${r.failed.length ? `, ${r.failed.length} failed` : ''}`}`);
    if(r.live) break;
  }
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
