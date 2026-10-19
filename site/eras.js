/* F1Eras (#135): the data side of the Eras page. Turns site/data/eras.json (final standings per season, written
   by tools/eras-snapshot.mjs) into per-driver and per-team-lineage series, and holds the two hand-kept tables:

   - ERAS: the rule eras shaded behind the chart.
   - LINEAGES: teams come and go and change names. Each lineage is one team's story, a list of members
     ({ids, from, to, name, color}): a Jolpica constructor id (optionally only for some years) with the name
     and colour it had then. "Mercedes" is Tyrrell → BAR → Honda → Brawn → Mercedes. A team id in no lineage is
     its own lineage, named as in the data and coloured by a stable hash.
   Colours are F1's own team colours, darkened where they'd vanish on white (theme.js lightens the dark ones). */
const F1Eras = (() => {
  // Rule eras: first and last season (inclusive), a short label for the chart and a plain-language note.
  const ERAS = [
    { from: 1950, to: 1960, label: 'Front engine', short: 'FE', name: 'Front-engined cars', note: 'Front-engined cars; the first world championship seasons' },
    { from: 1961, to: 1965, label: '1.5 L', short: '1.5L', name: '1.5-litre formula', note: 'Rear-engined cars with 1.5-litre engines' },
    { from: 1966, to: 1976, label: '3 L, wings', short: '3L', name: '3-litre and wings', note: '3-litre engines, the Cosworth V8, wings and slick tyres' },
    { from: 1977, to: 1982, label: 'Ground effect I', short: 'GE I', name: 'First ground effect', note: 'Ground-effect cars (Lotus 78 onwards), until they were banned after 1982' },
    { from: 1983, to: 1988, label: 'Turbo', short: 'Turbo', name: 'Turbo era', note: 'Flat-bottomed cars; turbo engines of 1,000 hp and more until they were banned after 1988' },
    { from: 1989, to: 2005, label: 'V10', short: 'V10', name: 'V10 era', note: 'Naturally aspirated engines; the V10 became the standard' },
    { from: 2006, to: 2013, label: 'V8', short: 'V8', name: 'V8 era', note: '2.4-litre V8 engines, with KERS from 2009' },
    { from: 2014, to: 2021, label: 'Turbo hybrid', short: 'Hybrid', name: 'Turbo-hybrid era', note: '1.6-litre V6 turbo hybrid power units' },
    { from: 2022, to: 2025, label: 'Ground effect II', short: 'GE II', name: 'Ground effect returns', note: 'Ground-effect cars again, with 18-inch wheels and a cost cap' },
    { from: 2026, to: 9999, label: 'Current', short: 'Now', name: 'Current era', note: 'Lighter cars with active aero and a 50/50 electric and combustion power unit' },
  ];
  const eraOf = year => ERAS.find(e => year >= e.from && year <= e.to);

  const M = (ids, name, color, from, to) => ({ ids: [].concat(ids), name, color, from: from || 0, to: to || 9999 });
  const LINEAGES = [
    { id: 'ferrari', name: 'Ferrari', members: [M('ferrari', 'Ferrari', '#DC0000')] },
    { id: 'mclaren', name: 'McLaren', members: [M(['mclaren', 'mclaren-ford', 'mclaren-seren', 'mclaren-brm'], 'McLaren', '#FF8000')] },
    { id: 'williams', name: 'Williams', members: [M('williams', 'Williams', '#00A3E0')] },
    { id: 'lotus', name: 'Lotus', members: [M(['team_lotus', 'lotus-climax', 'lotus-brm', 'lotus-ford'], 'Team Lotus', '#1F6B3A')] },
    { id: 'cooper', name: 'Cooper', members: [M(['cooper', 'cooper-climax', 'cooper-maserati', 'cooper-castellotti', 'cooper-brm'], 'Cooper', '#5B7F3A')] },
    { id: 'brabham', name: 'Brabham', members: [M(['brabham', 'brabham-climax', 'brabham-brm', 'brabham-repco', 'brabham-ford', 'brabham-alfa_romeo'], 'Brabham', '#4B6FB5')] },
    { id: 'brm', name: 'BRM', members: [M('brm', 'BRM', '#7B1E3A')] },
    { id: 'matra', name: 'Matra', members: [M(['matra', 'matra-ford'], 'Matra', '#2A6FDB')] },
    { id: 'march', name: 'March', members: [M(['march', 'march-ford'], 'March', '#E8590C')] },
    { id: 'shadow', name: 'Shadow', members: [M(['shadow', 'shadow-ford'], 'Shadow', '#4A4A4A')] },
    { id: 'eagle', name: 'Eagle', members: [M(['eagle-climax', 'eagle-weslake'], 'Eagle', '#B8860B')] },
    { id: 'alfa_works', name: 'Alfa Romeo (1980s)', members: [M('alfa', 'Alfa Romeo', '#9B111E', 0, 1990)] },
    { id: 'renault_works', name: 'Renault (1970s–80s)', members: [M('renault', 'Renault', '#C9A100', 0, 1990)] },
    { id: 'honda_60s', name: 'Honda (1960s)', members: [M('honda', 'Honda', '#C0392B', 0, 1970)] },
    { id: 'ligier', name: 'Ligier', members: [M('ligier', 'Ligier', '#1565C0'), M('prost', 'Prost', '#1E4FA1')] },
    { id: 'arrows', name: 'Arrows', members: [M('arrows', 'Arrows', '#FF7F00'), M('footwork', 'Footwork', '#E8590C')] },
    // Mercedes: Tyrrell → BAR → Honda → Brawn → Mercedes
    { id: 'mercedes', name: 'Mercedes', members: [
      M('tyrrell', 'Tyrrell', '#1E4FA1'), M('bar', 'BAR', '#8C8F94'), M('honda', 'Honda', '#C0392B', 2000),
      M('brawn', 'Brawn GP', '#9BB600'), M('mercedes', 'Mercedes', '#00A79D')] },
    // Enstone: Toleman → Benetton → Renault → Lotus → Renault → Alpine
    { id: 'alpine', name: 'Alpine', members: [
      M('toleman', 'Toleman', '#1B4F9C'), M('benetton', 'Benetton', '#3FA535'), M('renault', 'Renault', '#C9A100', 1990),
      M('lotus_f1', 'Lotus F1', '#8A6D0B'), M('alpine', 'Alpine', '#FF1493')] },
    // Silverstone: Jordan → Midland → Spyker → Force India → Racing Point → Aston Martin
    { id: 'aston_martin', name: 'Aston Martin', members: [
      M('jordan', 'Jordan', '#D4A900'), M(['mf1'], 'Midland', '#B03A2E'), M(['spyker_mf1', 'spyker'], 'Spyker', '#E8652B'),
      M('force_india', 'Force India', '#E5559F'), M('racing_point', 'Racing Point', '#E070B0'), M('aston_martin', 'Aston Martin', '#229971')] },
    // Faenza: Minardi → Toro Rosso → AlphaTauri → RB
    { id: 'rb', name: 'Racing Bulls', members: [
      M('minardi', 'Minardi', '#3C3C3C'), M('toro_rosso', 'Toro Rosso', '#2D3E8F'), M('alphatauri', 'AlphaTauri', '#4E7C9B'), M('rb', 'RB', '#2B4EE6')] },
    // Hinwil: Sauber → BMW Sauber → Sauber → Alfa Romeo → Sauber → Audi
    { id: 'audi', name: 'Audi', members: [
      M('sauber', 'Sauber', '#6B7A8F', 0, 2005), M('bmw_sauber', 'BMW Sauber', '#3D6FB6'), M('sauber', 'Sauber', '#6B7A8F', 2010, 2018),
      M('alfa', 'Alfa Romeo', '#C92D4B', 2019), M('sauber', 'Sauber', '#399E39', 2024), M('audi', 'Audi', '#E8534D')] },
    // Milton Keynes: Stewart → Jaguar → Red Bull
    { id: 'red_bull', name: 'Red Bull', members: [M('stewart', 'Stewart', '#B0B3B8'), M('jaguar', 'Jaguar', '#2E8B57'), M('red_bull', 'Red Bull', '#1B2A6B')] },
    { id: 'caterham', name: 'Caterham', members: [M('lotus_racing', 'Lotus', '#00694B'), M('caterham', 'Caterham', '#00694B')] },
    { id: 'manor', name: 'Manor', members: [M('virgin', 'Virgin', '#C8102E'), M('marussia', 'Marussia', '#B22234'), M('manor', 'Manor', '#8B1A1A')] },
    { id: 'haas', name: 'Haas', members: [M('haas', 'Haas', '#1A1A1A')] },
    { id: 'cadillac', name: 'Cadillac', members: [M('cadillac', 'Cadillac', '#B8860B')] },
  ];
  // When ranges overlap the later member wins (rules are checked last to first).
  const INDEX = new Map(); // constructor id -> [{lineage, member}]
  LINEAGES.forEach(l => l.members.forEach(m => m.ids.forEach(id => {
    if(!INDEX.has(id)) INDEX.set(id, []); INDEX.get(id).push({ lineage: l, member: m });
  })));

  const hashColor = id => { let h = 0; for(const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 42%)`; };
  const cleanName = n => String(n || '').replace(/ F1 Team$/, '');

  // The lineage a constructor id belongs to in a season, with the name and colour it had then.
  function lineageOf(teamId, year, teams){
    const hits = INDEX.get(teamId) || [];
    for(let i = hits.length - 1; i >= 0; i--){
      const { lineage, member } = hits[i];
      if(year >= member.from && year <= member.to) return { id: lineage.id, lineageName: lineage.name, name: member.name, color: member.color };
    }
    const own = teams && teams[teamId] ? cleanName(teams[teamId].n) : teamId;
    return { id: teamId, lineageName: own, name: own, color: hashColor(teamId) };
  }

  // Builds the page's model from the season file. Everything is by season; seasons[year] = {pos, pts, name,
  // color, lineage} per driver or lineage. `titles` and `best` only count finished seasons.
  function build(data){
    const years = Object.keys(data.seasons).map(Number).sort((a, b) => a - b);
    const partial = data.partial || null;
    const drivers = new Map(), teams = new Map();
    const touch = (map, id, name, short) => { let e = map.get(id); if(!e) map.set(id, e = { id, name, short, seasons: {}, titles: 0, best: 99, first: 9999, last: 0, main: null, tally: {} }); return e; };
    for(const y of years){
      const s = data.seasons[y];
      for(const [id, pos, pts, teamId] of s.d){
        const dr = data.drivers[id] || { n: id, s: id };
        const e = touch(drivers, id, dr.n, dr.s), L = teamId ? lineageOf(teamId, y, data.teams) : { id: null, name: '', color: hashColor(id) };
        e.seasons[y] = { pos, pts, name: L.name, color: L.color, lineage: L.id };
      }
      for(const [id, pos, pts] of s.t){
        const L = lineageOf(id, y, data.teams), e = touch(teams, L.id, L.lineageName, L.lineageName), cur = e.seasons[y];
        if(!cur) e.seasons[y] = { pos, pts, name: L.name, color: L.color, lineage: L.id };
        else { cur.pts += pts; if(pos < cur.pos){ cur.pos = pos; cur.name = L.name; cur.color = L.color; } } // two entries of one lineage in a year
      }
    }
    for(const map of [drivers, teams]) for(const e of map.values()){
      const ys = Object.keys(e.seasons).map(Number);
      e.first = Math.min(...ys); e.last = Math.max(...ys); e.count = ys.length;
      ys.forEach(y => {
        const s = e.seasons[y]; e.tally[s.color] = (e.tally[s.color] || 0) + 1;
        if(y === partial) return;
        if(s.pos === 1) e.titles++;
        if(s.pos < e.best) e.best = s.pos;
      });
      if(e.best === 99) e.best = Math.min(...ys.map(y => e.seasons[y].pos));
      // The colour of a legend swatch: a driver's most-used team colour, a team's colour in its latest season.
      e.color = map === teams ? e.seasons[e.last].color : Object.entries(e.tally).sort((a, b) => b[1] - a[1])[0][0];
      e.span = e.first === e.last ? String(e.first) : `${e.first}–${e.last}`;
    }
    const rank = (a, b) => (b.titles - a.titles) || (a.best - b.best) || (b.count - a.count) || a.name.localeCompare(b.name);
    return { years, partial, round: partial ? data.seasons[partial].round : null, firstTeamYear: 1958,
      drivers: [...drivers.values()].sort(rank), teams: [...teams.values()].sort(rank),
      generatedAt: data.generatedAt };
  }

  return { ERAS, eraOf, LINEAGES, lineageOf, build, hashColor };
})();
if(typeof module !== 'undefined') module.exports = F1Eras;
