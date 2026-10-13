// Test runner (issue #53): runs every tests/*.test.js in order and exits non-zero if any check fails.
// Usage: cd tests && npm install && npm test        (or: node run.js position projection  — by name)
// Each test file exports async (t, h) => {...}: call t.check(name, ok, detail) for each assertion;
// h is lib/harness.js. Screenshots go to tests/artifacts/ for a person to look at (not compared).
const fs = require('fs'), path = require('path');
const h = require('./lib/harness');

(async () => {
  const only = process.argv.slice(2);
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.includes(o)))).sort();
  let pass = 0, fail = 0;
  await h.launch();
  try{
    for(const file of files){
      console.log(`\n${file}`);
      const t = { check(name, ok, detail=''){ ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); } };
      try{ await require(path.join(__dirname, file))(t, h); }
      catch(e){ t.check('test file ran without throwing', false, e.stack); }
    }
  } finally { await h.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
