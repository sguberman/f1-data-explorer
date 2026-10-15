// #85: shared helpers for the title-clinch tests (homepage line, What-If preset): constructed seasons built from the
// fake fixture, and an independent calculation of the title (no site code), with the championship pages' rules:
// decided once every rival is more points behind than are left, or exactly that many when countback is settled even if
// the rival wins every Grand Prix left; next-race margins one point more than a tie. 2026 points (no fastest lap).
const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];

async function seasonKit(){
  const { buildSnapshot } = await import('../../tools/snapshot.mjs');
  const { api } = require('./fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const base = await buildSnapshot(2026, fakeFetch, Date.now() - 3*60*60*1000);
  const cal = base.calendar, SPRINTS = cal.sprintRounds;
  const tmpl = base.rounds[0].raceResults.slice().sort((a, b) => a.driverId < b.driverId ? -1 : 1);
  const FRONT = ['d0_0', 'd1_0', 'd2_0', 'd0_1', 'd2_1', 'd1_1'];
  const ALL = [...FRONT, ...tmpl.map(r => r.driverId).filter(id => !FRONT.includes(id))];
  const row = id => tmpl.find(r => r.driverId === id);
  const CODE = Object.fromEntries(tmpl.map(r => [r.driverId, r.code]));
  // A session from the top finishers' ids (everyone else follows in ALL's order).
  const session = (top, table, kind) => { const ids = [...top, ...ALL.filter(id => !top.includes(id))];
    return ids.map((id, i) => ({ ...row(id), position: i+1, points: table[i] || 0, session: kind })); };
  const round = (n, top, spTop) => ({ round: n, raceName: `Round ${n} Grand Prix`, country: base.rounds[0].country,
    raceResults: session(top, GP, 'race'), sprintResults: SPRINTS.includes(n) ? session(spTop || top, SP, 'sprint') : null });
  const snap = (rounds, calendar = cal) => ({ ...base, rounds, calendar, complete: false });
  return { base, cal, SPRINTS, tmpl, ALL, row, CODE, round, snap };
}

const idOf = (r, kind) => kind === 'teams' ? r.teamId : r.driverId;
const maxAt = (r, kind, c) => (kind === 'teams' ? 43 : 25) + (c.sprintRounds.includes(r) ? (kind === 'teams' ? 15 : 8) : 0);
const leftAfter = (k, kind, c) => { let s = 0; for(let r = k+1; r <= c.totalRounds; r++) s += maxAt(r, kind, c); return s; };
function ranked(rounds, upto, kind){
  const t = {}, fin = {};
  rounds.filter(r => r.round <= upto).forEach(r => {
    [...r.raceResults, ...(r.sprintResults||[])].forEach(q => { t[idOf(q, kind)] = (t[idOf(q, kind)]||0) + q.points; });
    r.raceResults.forEach(q => { const f = fin[idOf(q, kind)] = fin[idOf(q, kind)] || new Array(40).fill(0); if(q.position) f[q.position-1]++; }); });
  const cb = (a, b) => { for(let i = 0; i < 40; i++){ const d = (fin[b]||[])[i] - (fin[a]||[])[i]; if(d) return d; } return 0; };
  return { t, fin, order: Object.keys(t).sort((a, b) => t[b] - t[a] || cb(a, b)) };
}
function safe(R, a, x, k, kind, c){
  const d = R.t[a] - R.t[x], M = leftAfter(k, kind, c);
  if(d !== M) return d > M;
  if(M === 0) return true;
  const X = (R.fin[x] || new Array(40).fill(0)).slice(), g = c.totalRounds - k; X[0] += g; if(kind === 'teams') X[1] += g;
  for(let i = 0; i < 10; i++) if((R.fin[a]||[])[i] !== X[i]) return (R.fin[a]||[])[i] > X[i];
  return false;
}
// The title after round k: {champion, clinched} or {leader, contenders:[{id, tieOnly}]}.
function status(rounds, k, kind, c){
  for(let r = 1; r <= k; r++){ const R = ranked(rounds, r, kind), a = R.order[0];
    if(r >= c.totalRounds || R.order.slice(1).every(x => safe(R, a, x, r, kind, c))) return { champion: a, clinched: r }; }
  const R = ranked(rounds, k, kind), a = R.order[0], M = leftAfter(k, kind, c);
  return { leader: a, contenders: R.order.slice(1).filter(x => !safe(R, a, x, k, kind, c)).map(x => ({ id: x, tieOnly: R.t[a] - R.t[x] === M })) };
}
// Who can clinch at round k+1 (not decided by k): entries whose every rival's needed margin is within one weekend's maximum.
function canClinchNext(rounds, k, kind, c){
  const st = status(rounds, k, kind, c);
  if(st.champion) return [];
  const { t, order } = ranked(rounds, k, kind), P = leftAfter(k+1, kind, c), mx = maxAt(k+1, kind, c);
  return order.filter(id => t[id] + leftAfter(k, kind, c) >= t[order[0]])
    .filter(id => order.every(x => x === id || P - (t[id] - t[x]) + 1 <= mx));
}

module.exports = { GP, SP, seasonKit, leftAfter, ranked, status, canClinchNext };
