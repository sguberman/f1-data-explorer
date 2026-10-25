// Fake Jolpica (Ergast-style) responses for the tests (issue #53, #199): a deterministic 2026 season with 11 teams / 22 drivers,
// 12 of 23 rounds completed, sprints, a few unclassified results (positionText R, D or N), and one team id the site has no color for
// ("mystery_gp", to exercise the hashed hsl() fallback). Any other season returns 404.
// #18: drivers have numbers and nationalities, teams nationalities and circuits countries, written both as
// country names and demonyms (the site accepts either), plus one unknown name ("Atlantis") with no flag.
const TEAMS = [['mercedes','Mercedes Formula 1 Team'],['ferrari','Scuderia Ferrari'],['mclaren','McLaren Formula 1 Team'],
  ['red_bull','Red Bull Racing'],['alpine','BWT Alpine F1 Team'],['haas','MoneyGram Haas F1 Team'],['williams','Williams Racing'],
  ['audi','Audi Revolut F1 Team'],['aston_martin','Aston Martin Aramco F1 Team'],['rb','Racing Bulls'],['mystery_gp','Mystery Grand Prix Team']];
const TEAM_NAT = ['Germany','Italian','Great Britain','Austria','French','United States','British','Germany','Great Britain','Italy','Atlantis'];
const DRIVER_NAT = ['British','Italy','Monaco','Great Britain','British','Australian','Netherlands','France','French','Argentina','France',
  'British','Thailand','Spanish','German','Brazil','Spain','Canada','New Zealand','British','Finnish','Atlantis'];
const DRIVER_NUM = [63,12,16,44,1,81,3,6,10,43,31,87,23,55,27,5,14,18,30,41,77,11];
const CIRCUITS = ['Australia','China','Japan','Bahrain','Saudi Arabia','USA','Canada','Monaco','Spain','Austria','United Kingdom','Belgium',
  'Hungary','Netherlands','Italy','Spain','Azerbaijan','Singapore','United States','Mexico','Brazil','United States','Qatar'];
// #85: the calendar's circuit cities (Jolpica's Location.locality), for the homepage's location line. Round 22 has none
// (country only), and round 8's city is its country's name (Monaco).
const CITIES = ['Melbourne','Shanghai','Suzuka','Sakhir','Jeddah','Miami','Montréal','Monaco','Barcelona','Spielberg','Silverstone',
  'Spa-Francorchamps','Budapest','Zandvoort','Monza','Madrid','Baku','Marina Bay','Austin','Mexico City','São Paulo',null,'Lusail'];
const DRIVERS = TEAMS.flatMap(([teamId, teamName], i) => [0,1].map(k => ({
  driverId:`d${i}_${k}`, shortName:`D${String.fromCharCode(65+i)}${k}`, name:`Driver${i}`, surname:`Team${k}`, teamId, teamName,
  number:DRIVER_NUM[2*i+k], nationality:DRIVER_NAT[2*i+k], teamNationality:TEAM_NAT[i] })));
const COMPLETED = 12, TOTAL = 23, SPRINTS = [2,6,11,14,17,19,23];
// #89: each round's Grand Prix date and start time (UTC), as Jolpica's calendar gives them.
// Round 22 has no time (date only), and round 21 is a Saturday night race.
const RACE_DATES = ['03-08','03-15','03-29','04-12','04-26','05-10','05-24','06-07','06-21','07-05','07-19','08-02','08-30','09-06',
  '09-20','10-04','10-11','10-25','11-01','11-08','11-21','11-29','12-06'].map(d => `2026-${d}`);
const RACE_TIMES = RACE_DATES.map((d, i) => i+1 === 22 ? null : i+1 === 21 ? '06:00:00Z' : i < 3 ? '05:00:00Z' : '13:00:00Z');
const dayBefore = d => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];

// Deterministic finishing order, loosely biased by team strength.
function order(round, salt){
  return DRIVERS.map((d,i) => ({d, s: i + ((round*7919 + i*104729 + salt*31) % 13) - 6}))
    .sort((a,b) => a.s - b.s).map(x => x.d);
}
function results(round, sprint){
  return order(round, sprint ? 1 : 0).map((d,i) => {
    const dnf = !sprint && (round*3 + i) % 17 === 0;
    return { number:String(d.number), position:String(i+1), positionText: dnf ? ['R','D','N'][round % 3] : String(i+1),
      points:String(dnf ? 0 : ((sprint ? SP : GP)[i] || 0)),
      Driver:{driverId:d.driverId, permanentNumber:String(d.number), code:d.shortName, givenName:d.name, familyName:d.surname, nationality:d.nationality},
      Constructor:{constructorId:d.teamId, name:d.teamName, nationality:d.teamNationality}, status: dnf ? 'Retired' : 'Finished' };
  });
}
// A race as Jolpica lists it; `rows` are its Results (or SprintResults when `sprint`).
const race = (r, rows, sprint) => { const o = { season:'2026', round:String(r), raceName:`Round ${r} Grand Prix`,
  Circuit:{circuitId:`c${r}`, Location:{...(CITIES[r-1] ? {locality:CITIES[r-1]} : {}), country:CIRCUITS[r-1]}}, date:RACE_DATES[r-1], ...(RACE_TIMES[r-1] ? {time:RACE_TIMES[r-1]} : {})};
  if(rows) o[sprint ? 'SprintResults' : 'Results'] = rows; return o; };
const mr = (races, total, limit, offset) => ({status:200, body:{MRData:{series:'f1', limit:String(limit), offset:String(offset), total:String(total), RaceTable:{season:'2026', Races:races}}}});

// Returns {status, body} for a Jolpica URL (https://api.jolpi.ca/ergast/f1/...): the calendar (/2026.json), one round's
// results (/2026/12/results.json, /2026/12/sprint.json: no races when it has no sprint or isn't run yet) and the whole
// season's results or sprints in pages (/2026/results.json?limit=100&offset=0). Any other season is a 404.
function api(url){
  const u = new URL(url), p = u.pathname.replace(/^\/ergast\/f1\//,'').replace(/\.json$/,'').split('/');
  if(+p[0] !== 2026) return {status:404, body:{}};
  if(p.length === 1) return mr(Array.from({length:TOTAL}, (_,i) => ({...race(i+1), ...(SPRINTS.includes(i+1) ? {Sprint:{date:dayBefore(RACE_DATES[i]), time:'09:00:00Z'}} : {})})), TOTAL, 30, 0);
  const sprint = p[p.length-1] === 'sprint', done = Array.from({length:COMPLETED}, (_,i) => i+1).filter(r => !sprint || SPRINTS.includes(r));
  if(p.length === 3){ // one round
    const r = +p[1];
    return mr(done.includes(r) ? [race(r, results(r, sprint), sprint)] : [], done.includes(r) ? 1 : 0, 30, 0);
  }
  // the whole season, 100 rows a page, so a race can split across two pages
  const limit = +u.searchParams.get('limit') || 30, offset = +u.searchParams.get('offset') || 0, rows = [];
  done.forEach(r => results(r, sprint).forEach(row => rows.push({r, row})));
  const races = [];
  rows.slice(offset, offset + limit).forEach(({r, row}) => { let x = races.find(q => q.round === String(r)); if(!x) races.push(x = race(r, [], sprint)); x[sprint ? 'SprintResults' : 'Results'].push(row); });
  return mr(races, rows.length, limit, offset);
}

module.exports = { api, COMPLETED, TOTAL, SPRINTS, RACE_DATES, RACE_TIMES, DRIVER_NAT, DRIVER_NUM, TEAM_NAT, CIRCUITS, CITIES };
