// #186: F1Controls' opt-in `upcoming` option (only the Weekend Pace page turns it on): the slider also reaches the race weekend that is on,
// from 4 days before its Grand Prix, before the round has any results. The other pages' sliders never change.
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const slider = async (name, now) => {
    const p = await h.openPage(name, { openf1: {}, now }); await h.loaded(p);
    const r = await p.evaluate(() => ({ max: +document.querySelector('.f1c-round').max, value: +document.querySelector('.f1c-round').value, state: F1Controls.state.maxRound,
      label: document.querySelector('.f1c-roundlabel').textContent, status: document.querySelector('.f1c-status').textContent, stub: F1Controls.state.seasonRounds.filter(x => x.upcoming).map(x => [x.round, x.raceResults.length, x.country]) }));
    await p.done(); return r;
  };
  // the fake season has 12 rounds with results; round 13's Grand Prix is on 2026-08-30, so its weekend begins on 2026-08-26 (00:00 UTC)
  const before = await slider('pace', '2026-08-25T23:59:59Z'), begun = await slider('pace', '2026-08-26T00:00:00Z'), now = await slider('pace', fx.NOW);
  t.check('before the weekend begins the slider stops at the last round with results', before.max === 12 && before.value === 12 && before.stub.length === 0 && /^12 rounds loaded$/.test(before.status), JSON.stringify(before));
  t.check('four days before the Grand Prix the slider reaches that round, and opens on it', begun.max === 13 && begun.value === 13 && begun.state === 13, JSON.stringify(begun));
  t.check('the added round has no results, an upcoming flag and the circuit’s country; the label names it', JSON.stringify(now.stub) === '[[13,0,"Hungary"]]' && now.label === 'Round 13 of 13 — Round 13 Grand Prix', JSON.stringify(now));
  t.check('the status line says so', /^12 rounds loaded · race weekend of round 13$/.test(now.status), now.status);
  for(const name of ['drivers', 'constructors', 'position', 'whatif', 'simulator']){
    const o = await slider(name, fx.NOW);
    t.check(`${name}: the slider is unchanged (the option is off)`, o.max === 12 && o.stub.length === 0 && /^12 rounds loaded$/.test(o.status), JSON.stringify(o));
  }
};
