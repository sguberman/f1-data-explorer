// Fake f1api.dev responses for the tests (issue #53): a deterministic 2026 season with 11 teams / 22 drivers,
// 12 of 23 rounds completed, sprints, a few DNFs, and one team id the site has no color for
// ("mystery_gp", to exercise the hashed hsl() fallback). Any other season returns 404.
const TEAMS = [['mercedes','Mercedes Formula 1 Team'],['ferrari','Scuderia Ferrari'],['mclaren','McLaren Formula 1 Team'],
  ['red_bull','Red Bull Racing'],['alpine','BWT Alpine F1 Team'],['haas','MoneyGram Haas F1 Team'],['williams','Williams Racing'],
  ['audi','Audi Revolut F1 Team'],['aston_martin','Aston Martin Aramco F1 Team'],['rb','Racing Bulls'],['mystery_gp','Mystery Grand Prix Team']];
const DRIVERS = TEAMS.flatMap(([teamId, teamName], i) => [0,1].map(k => ({
  driverId:`d${i}_${k}`, shortName:`D${String.fromCharCode(65+i)}${k}`, name:`Driver${i}`, surname:`Team${k}`, teamId, teamName })));
const COMPLETED = 12, TOTAL = 23, SPRINTS = [2,6,11,14,19,23];
const GP = [25,18,15,12,10,8,6,4,2,1], SP = [8,7,6,5,4,3,2,1];

// Deterministic finishing order, loosely biased by team strength.
function order(round, salt){
  return DRIVERS.map((d,i) => ({d, s: i + ((round*7919 + i*104729 + salt*31) % 13) - 6}))
    .sort((a,b) => a.s - b.s).map(x => x.d);
}
function results(round, sprint){
  return order(round, sprint ? 1 : 0).map((d,i) => {
    const dnf = !sprint && (round*3 + i) % 17 === 0;
    return { driver:{driverId:d.driverId, shortName:d.shortName, name:d.name, surname:d.surname},
      team:{teamId:d.teamId, teamName:d.teamName}, position: dnf ? null : String(i+1),
      points: dnf ? 0 : ((sprint ? SP : GP)[i] || 0), retired:null };
  });
}

// Returns {status, body} for an f1api.dev URL.
function api(url){
  const p = new URL(url).pathname.replace(/^\/api\//,'').split('/');
  if(+p[0] !== 2026) return {status:404, body:{}};
  if(p.length === 1) return {status:200, body:{races: Array.from({length:TOTAL}, (_,i) => ({round:i+1, raceName:`Round ${i+1} Grand Prix`,
    schedule:{sprintRace:{date: SPRINTS.includes(i+1) ? '2026-01-01' : null}}}))}};
  const r = +p[1];
  if(p[2] === 'sprint'){
    if(r > COMPLETED || !SPRINTS.includes(r)) return {status:404, body:{}};
    return {status:200, body:{races:{raceName:`Round ${r} Grand Prix`, sprintRaceResults:results(r, true)}}};
  }
  if(r > COMPLETED) return {status:200, body:{races:{raceName:`Round ${r} Grand Prix`, results:[]}}};
  return {status:200, body:{races:{raceName:`Round ${r} Grand Prix`, results:results(r, false)}}};
}

module.exports = { api, COMPLETED, TOTAL };
