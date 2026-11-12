// #203: saved pit stop times from OpenF1 for the Pit Stops page. Each finished Race and Sprint is saved once (20 minutes after it ends, once OpenF1 is
// open again, as tools/pace-snapshot.mjs does for the Weekend Pace page) into one file per season. OpenF1 closes its API to everyone without an
// account while an F1 session is live, even for past sessions; the page reads these files and never asks OpenF1.
//
//   node tools/pit-snapshot.mjs            this year (and 2025 on the first run)
//   node tools/pit-snapshot.mjs --all      every year since 2025 (the first with box times)
//   node tools/pit-snapshot.mjs 2025       only these years
//
// site/data/pit/{year}.json = {v:1, year, generatedAt, sessions:[...]}: see F1Pit.compact(). A saved session is never fetched again. `stop_duration`
// (time in the box) is null for some stops and for every stop before 2025; the file keeps the nulls and the page says how many stops were timed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const P = require('../site/pit.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'data', 'pit');
const BASE = 'https://api.openf1.org/v1';
export const FIRST_YEAR = P.FIRST_YEAR;
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
    if(res.status === 404) return []; // OpenF1 answers "No results found" with a 404: a session with no pit stops (most Sprints)
    if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const rows = await res.json();
    if(!Array.isArray(rows)) throw new Error(`${url}: unexpected answer`);
    return rows;
  }
}

// One year: the sessions list, then each finished Race and Sprint that is not saved. Returns {year, written:[keys], failed:[keys], live, changed}.
export async function runYear(year, { fetchImpl = fetch, dir = OUT, now = Date.now(), wait = sleep, gap = 350 } = {}){
  const out = { year, written: [], failed: [], live: false, changed: false };
  const get = async url => { await wait(gap); return getRows(url, fetchImpl, wait); };
  let rows;
  try{ rows = await get('/sessions?year=' + year); }
  catch(e){ if(e instanceof LiveSession){ out.live = true; return out; } throw e; }
  const file = path.join(dir, `${year}.json`);
  let saved = null; try{ saved = JSON.parse(fs.readFileSync(file, 'utf8')); }catch(e){}
  const sessions = saved && saved.v === 1 ? saved.sessions.slice() : [];
  const have = new Set(sessions.map(s => s.key));
  const todo = rows.filter(r => P.KINDS.includes(r.session_name) && !r.is_cancelled && !have.has(r.session_key)).sort((a, b) => a.date_start < b.date_start ? -1 : 1);
  for(const r of todo){
    if(Date.parse(r.date_end) + SETTLE_MS > now) continue; // not over yet, or not settled
    try{
      const q = '?session_key=' + r.session_key, pit = await get('/pit' + q), drivers = await get('/drivers' + q);
      // no stops at all, soon after the end, is OpenF1 not having them yet: try again next time
      if(!pit.length && now - Date.parse(r.date_end) < 24 * 3600e3) continue;
      sessions.push(P.compact(pit, drivers, { key: r.session_key, meeting: r.meeting_key, name: r.session_name, start: r.date_start, location: r.location }));
      out.written.push(r.session_key);
    }catch(e){
      if(e instanceof LiveSession){ out.live = true; break; }
      out.failed.push(r.session_key); console.log(`::warning::${year} ${r.session_name} (${r.session_key}): ${e.message}`);
    }
  }
  if(out.written.length){ // whatever was saved before a closed API stays
    sessions.sort((a, b) => a.start < b.start ? -1 : 1);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ v: 1, year, generatedAt: now, sessions }));
    out.changed = true;
  }
  return out;
}

async function main(){
  const args = process.argv.slice(2), all = args.includes('--all');
  const only = args.filter(a => /^\d{4}$/.test(a)).map(Number), last = new Date().getUTCFullYear();
  const years = only.length ? only : all ? Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i) : Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).filter(y => y === last || !fs.existsSync(path.join(OUT, `${y}.json`)));
  for(const year of years){
    const r = await runYear(year);
    console.log(`${year}: ${r.live ? 'OpenF1 is closed (a live session): ' : ''}${r.written.length} session(s) saved${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
    if(r.live) break;
  }
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
