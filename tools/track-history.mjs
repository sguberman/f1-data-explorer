// #169: site/data/tracks.json, how each driver has done at each circuit in earlier seasons (2014 on), for the Simulator's and
// What-If's track history. Built from the season files (site/data/{year}.json) and the qualifying files' circuit ids
// (site/data/grid/{year}.json); no network.
//
//   node tools/track-history.mjs
//
// File: {v:1, generatedAt, firstYear, circuits:{circuitId: {driverId: [[year, delta], ...]}}}. delta = the driver's classified
// finish at that circuit minus their average classified finish over that whole season (negative = better there than their
// season), to two decimals. A driver with no classified finish at a circuit that year has no entry. The pages use only the
// entries of seasons before the one they show.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'site', 'data');
export const FIRST_YEAR = 2014;

const isFinish = r => Number.isFinite(r.position) && r.position >= 1;
const round2 = x => Math.round(x * 100) / 100;

// seasonOf(year) = the season file, gridOf(year) = the qualifying file (or null); years = the seasons to include.
export function buildTrackHistory(years, seasonOf, gridOf) {
  const circuits = {};
  for (const year of years) {
    const season = seasonOf(year), grid = gridOf(year);
    if (!season || !grid) continue;
    const circuitOf = Object.fromEntries(grid.rounds.map(g => [g.round, g.circuitId]));
    const finishes = {}; // driver -> [{round, pos}]
    for (const r of season.rounds) {
      const seen = new Set();
      for (const x of r.raceResults || []) {
        if (seen.has(x.driverId)) continue; // a driver starts a race once (the 2024 file lists Pérez twice, #157)
        seen.add(x.driverId);
        if (isFinish(x)) (finishes[x.driverId] = finishes[x.driverId] || []).push({ round: r.round, pos: x.position });
      }
    }
    for (const [id, list] of Object.entries(finishes)) {
      const mean = list.reduce((s, f) => s + f.pos, 0) / list.length;
      for (const f of list) {
        const c = circuitOf[f.round];
        if (!c) continue;
        ((circuits[c] = circuits[c] || {})[id] = circuits[c][id] || []).push([year, round2(f.pos - mean)]);
      }
    }
  }
  const sorted = {};
  for (const c of Object.keys(circuits).sort()) { sorted[c] = {}; for (const id of Object.keys(circuits[c]).sort()) sorted[c][id] = circuits[c][id]; }
  return { v: 1, generatedAt: 0, firstYear: FIRST_YEAR, circuits: sorted };
}

function readJSON(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }

async function main() {
  const last = Math.max(...fs.readdirSync(DATA).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)));
  const years = []; for (let y = FIRST_YEAR; y <= last; y++) years.push(y);
  const out = buildTrackHistory(years, y => readJSON(path.join(DATA, `${y}.json`)), y => readJSON(path.join(DATA, 'grid', `${y}.json`)));
  const file = path.join(DATA, 'tracks.json'), old = readJSON(file);
  if (old && JSON.stringify({ ...old, generatedAt: 0 }) === JSON.stringify(out)) { console.log('tracks: unchanged'); return; }
  fs.writeFileSync(file, JSON.stringify({ ...out, generatedAt: Date.now() }));
  console.log(`tracks: written, ${Object.keys(out.circuits).length} circuits`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
