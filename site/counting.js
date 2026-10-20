/* F1Counting (#141): how older seasons counted points, and the notes the pages show about it.
   Shared by tools/history-snapshot.mjs (which applies it to the back-filled season files) and the pages (notes).

   Before 1991 only a driver's best N results counted towards the championship (sometimes N from each half of the
   season), and in 1958–1978 only a team's best-placed car scored for the team in each race (1958–59: by finishing
   position alone, with no fastest-lap point). The rules below are not from a rule book: each one is the simplest rule
   that reproduces Jolpica's official final standings for every driver (and team) of the season, taken from
   site/data/eras.json (tests/42-history checks this, with the few known differences listed there).

   A rule is [[toRound, n], ...]: the best n results among the rounds up to toRound, then the best n of the next
   segment, and so on. Seasons not listed counted everything (or the rule never dropped anyone's points).

   What is stored in a season file once a rule is applied:
   - drivers: every result row has `awarded` (what was scored) and `points` (what it added to the championship:
     the rise in the driver's counting total that round, so a driver's running total never falls and ends on the
     official figure; 0 for a result that was dropped);
   - teams: every row has `teamPoints` (what it added to the team's total: the team's best-placed car carries the
     round's figure, the other car 0).
   Pages that total points read `points` for drivers and `teamPoints ?? points` for teams. */
const F1Counting = (() => {
  const DRIVERS = {
    1950: [[7, 4]], 1951: [[8, 4]], 1952: [[8, 4]], 1953: [[9, 4]], 1954: [[9, 5]], 1955: [[7, 5]], 1956: [[8, 5]], 1957: [[8, 5]],
    1958: [[11, 6]], 1959: [[9, 5]], 1960: [[10, 6]], 1961: [[8, 5]], 1962: [[9, 5]], 1963: [[10, 6]], 1964: [[10, 6]], 1965: [[10, 6]], 1966: [[9, 5]],
    1977: [[7, 6], [17, 6]], 1979: [[7, 4], [15, 4]], 1980: [[7, 5], [14, 5]],
    1985: [[16, 11]], 1986: [[16, 11]], 1987: [[16, 11]], 1988: [[16, 11]], 1989: [[16, 11]], 1990: [[16, 11]],
  };
  // Constructors: bestCar = only the best-placed car scores for the team in a race (1958–78); scale = by finishing position
  // alone (1958–59: no fastest-lap point for teams); rule = best-N as above (null: every round counted).
  const SCALE_1950S = [8, 6, 4, 3, 2];
  const TEAMS = {
    1958: { bestCar: true, scale: SCALE_1950S, rule: [[11, 6]] }, 1959: { bestCar: true, scale: SCALE_1950S, rule: [[9, 5]] },
    1960: { bestCar: true, rule: [[10, 6]] }, 1961: { bestCar: true, rule: [[8, 5]] }, 1962: { bestCar: true, rule: [[9, 5]] },
    1963: { bestCar: true, rule: [[10, 6]] }, 1964: { bestCar: true, rule: [[10, 6]] }, 1965: { bestCar: true, rule: [[10, 6]] },
    1966: { bestCar: true, rule: [[9, 5]] }, 1967: { bestCar: true, rule: null }, 1968: { bestCar: true, rule: null },
    1969: { bestCar: true, rule: [[6, 5], [11, 5]] }, 1970: { bestCar: true, rule: null }, 1971: { bestCar: true, rule: null },
    1972: { bestCar: true, rule: null }, 1973: { bestCar: true, rule: [[7, 6], [15, 6]] }, 1974: { bestCar: true, rule: [[7, 6], [15, 6]] },
    1975: { bestCar: true, rule: [[8, 7], [14, 6]] }, 1976: { bestCar: true, rule: [[8, 7], [16, 7]] },
    1977: { bestCar: true, rule: [[7, 6], [17, 6]] }, 1978: { bestCar: true, rule: null },
  };
  // Points taken off a team's total from a given round (Racing Point's 15 points in 2020, the brake-duct ruling; applied
  // from the round the ruling came, the 70th Anniversary Grand Prix).
  const ADJUST = { 2020: { racing_point: { round: 5, points: -15 } } };

  const round6 = v => Math.round(v * 1e6) / 1e6;
  const topSum = (a, n) => a.slice().sort((x, y) => y - x).slice(0, n).reduce((s, v) => s + v, 0);
  // The rise in the counting total after each round, given what was scored in each (index 0 = first round).
  function increments(scored, rounds, rule){
    const total = k => { let s = 0, from = 0; for(const [to, n] of rule){ const upto = Math.min(to, k); if(upto > from) s += topSum(scored.slice(from, upto), n); from = to; } return s; };
    return scored.map((_, i) => round6(total(rounds[i]) - (i ? total(rounds[i - 1]) : 0)));
  }

  // Applies a season's rules to its rounds (as built from Jolpica: `points` = awarded). Returns new rounds; a season with
  // no rule comes back unchanged. Safe to run again on its own output (it reads `awarded` first).
  function apply(year, rounds){
    const dRule = DRIVERS[year], tRule = TEAMS[year], adj = ADJUST[year];
    if(!dRule && !tRule && !adj) return rounds;
    const nums = rounds.map(r => r.round);
    const out = rounds.map(r => ({ ...r, raceResults: r.raceResults.map(x => { const c = { ...x }; delete c.teamPoints; return c; }) })); // (teamPoints is derived afresh)
    const scoredOf = x => x.awarded !== undefined ? x.awarded : x.points;
    if(dRule){
      const w = {}; // driverId -> scored per round
      out.forEach((r, i) => r.raceResults.forEach(x => { (w[x.driverId] = w[x.driverId] || Array(out.length).fill(0))[i] += scoredOf(x); }));
      const inc = {}; for(const id in w) inc[id] = increments(w[id], nums, dRule);
      out.forEach((r, i) => { const done = new Set();
        r.raceResults.forEach(x => { x.awarded = scoredOf(x); x.points = done.has(x.driverId) ? 0 : inc[x.driverId][i]; done.add(x.driverId); }); });
    }
    if(dRule && !tRule && !adj && year >= 1958) out.forEach(r => r.raceResults.forEach(x => { x.teamPoints = x.awarded; })); // a team counted every car's points whatever the drivers dropped
    if(tRule || adj){
      const w = {}, best = out.map(() => ({})); // teamId -> scored per round; the round's best-placed row of each team
      out.forEach((r, i) => {
        const rows = {};
        r.raceResults.forEach((x, j) => {
          const v = tRule && tRule.scale ? (x.position >= 1 && x.position <= tRule.scale.length ? tRule.scale[x.position - 1] : 0) : scoredOf(x);
          (rows[x.teamId] = rows[x.teamId] || []).push([v, j]);
        });
        for(const id in rows){
          const bestRow = rows[id].reduce((a, b) => b[0] > a[0] ? b : a);
          best[i][id] = bestRow[1];
          (w[id] = w[id] || Array(out.length).fill(0))[i] = tRule && tRule.bestCar ? bestRow[0] : rows[id].reduce((s, v) => s + v[0], 0);
        }
      });
      const inc = {}; for(const id in w) inc[id] = tRule && tRule.rule ? increments(w[id], nums, tRule.rule) : w[id];
      out.forEach((r, i) => r.raceResults.forEach((x, j) => {
        const carries = tRule && tRule.bestCar ? best[i][x.teamId] === j : true; // all cars score for the team unless only the best does
        x.teamPoints = carries ? (tRule ? inc[x.teamId][i] : scoredOf(x)) : 0;
        const a = adj && adj[x.teamId];
        if(a && a.round === r.round && best[i][x.teamId] === j) x.teamPoints = round6(x.teamPoints + a.points);
      }));
    }
    return out;
  }

  const plural = n => n === 1 ? 'result' : 'results';
  const ruleText = rule => rule.length === 1 ? `best ${rule[0][1]} ${plural(rule[0][1])}`
    : rule.map(([to, n], i) => `best ${n} from ${i ? `rounds ${rule[i - 1][0] + 1}–${to}` : `the first ${to} rounds`}`).join(' and ');
  // A sentence for the championship pages about how this season counted points ('' when it counted everything).
  function note(year, kind){
    if(kind === 'teams'){
      const t = TEAMS[year], a = ADJUST[year], parts = [];
      if(t && t.bestCar) parts.push(`only a team's best-placed car scored for the team in each race${t.scale ? ' (by finishing position alone: no fastest-lap point for teams)' : ''}, so the other driver added 0`);
      if(t && t.rule) parts.push(`only the team's ${ruleText(t.rule)} counted`);
      if(a) Object.values(a).forEach(x => parts.push(`a ${-x.points}-point penalty is taken off from round ${x.round}`));
      return parts.length ? `In ${year}, ${parts.join('; ')}. The totals here are the points that counted.` : '';
    }
    const d = DRIVERS[year];
    return d ? `In ${year}, only a driver's ${ruleText(d)} counted. The totals here are the points that counted: a result that was dropped adds nothing (round results show what was scored).` : '';
  }
  // For What-If and the Simulator, which score a new result as awarded and drop nothing.
  function asAwardedNote(year){
    return DRIVERS[year] || TEAMS[year] ? `In ${year} not every result counted (${[note(year, 'drivers'), note(year, 'teams')].filter(Boolean).map(s => s.replace(/ The totals here.*$/, '').replace(/^In \d+, /, '')).join('; ')}). This page scores a new result as awarded and drops nothing.` : '';
  }
  return { DRIVERS, TEAMS, ADJUST, apply, note, asAwardedNote, increments };
})();
if(typeof module !== 'undefined') module.exports = F1Counting;
