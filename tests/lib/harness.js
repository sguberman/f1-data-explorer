// Shared test plumbing (issue #53). Pages are served from ../site at http://site.test/, f1api.dev is answered
// by the fixture, and Chart.js comes from node_modules — so tests run offline and deterministically.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { api } = require('./fixture');

const SITE = path.join(__dirname, '..', '..', 'site');
const ARTIFACTS = path.join(__dirname, '..', 'artifacts');
const CHART_JS = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml' };

let browser;
async function launch(){ browser = await chromium.launch(); }
async function close(){ if(browser) await browser.close(); }

// Opens a page in a fresh context. Options:
//   theme 'light'|'dark', width (px), fail(url) -> true to answer that f1api.dev request with HTTP 500,
//   delay (ms) before each f1api.dev response.
// The returned page has .errors (uncaught page errors), .apiHits (f1api.dev requests made) and .done().
async function openPage(name, {theme='light', width=1000, fail=()=>false, delay=0}={}){
  const ctx = await browser.newContext({ viewport:{width, height:1400} });
  await ctx.addInitScript(t => { try{ localStorage.setItem('f1-theme', t); }catch(e){} }, theme);
  const apiHits = [];
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if(url.startsWith('https://f1api.dev/')){
      apiHits.push(url);
      if(delay) await new Promise(r => setTimeout(r, delay));
      const headers = {'access-control-allow-origin':'*'};
      if(fail(url)) return route.fulfill({status:500, headers, body:'error'});
      const {status, body} = api(url);
      return route.fulfill({status, headers, contentType:'application/json', body:JSON.stringify(body)});
    }
    if(url.startsWith('https://cdnjs.cloudflare.com/') && url.includes('Chart.js'))
      return route.fulfill({status:200, contentType:'application/javascript', body:CHART_JS});
    if(url.startsWith('http://site.test/')){
      const file = path.join(SITE, new URL(url).pathname.slice(1) || 'index.html');
      if(!file.startsWith(SITE) || !fs.existsSync(file)) return route.fulfill({status:404, body:''});
      return route.fulfill({status:200, contentType:TYPES[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.errors = []; page.apiHits = apiHits;
  page.on('pageerror', e => page.errors.push(e.message));
  page.done = () => ctx.close();
  await page.goto(`http://site.test/${name}.html`);
  return page;
}

// Waits for the season to finish loading (controls.js removes .f1-loading from <html>).
async function loaded(page, timeout=10000){
  await page.waitForFunction(() => typeof F1Controls !== 'undefined' && F1Controls.state.year && !document.documentElement.classList.contains('f1-loading'), null, {timeout});
  await page.waitForTimeout(150);
}

// Moves the "as of round" slider the way a user would (fires the input event).
const setRound = (page, round) => page.evaluate(r => {
  const s = document.querySelector('.f1c-round'); s.value = r; s.dispatchEvent(new Event('input'));
}, round);

// Text of an element, or '(hidden)' / '(missing)'.
const text = (page, sel) => page.$eval(sel, e => e.hidden ? '(hidden)' : e.textContent.replace(/\s+/g,' ').trim()).catch(() => '(missing)');

async function screenshot(page, file){
  fs.mkdirSync(ARTIFACTS, {recursive:true});
  await page.screenshot({path: path.join(ARTIFACTS, file), fullPage:true});
}

module.exports = { launch, close, openPage, loaded, setRound, text, screenshot };
