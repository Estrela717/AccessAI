/* Browser acceptance checks use only mocked location; no real permission or coordinates. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const puppeteer = require(process.env.PUPPETEER_PATH || path.join(process.env.APPDATA || '', 'npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer'));
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const url = process.env.NAVIGATION_URL || pathToFileURL(path.join(root, 'dist/navigate.html')).href;
const results = [];
const runtimeErrors = [];
const externalRequests = [];
const positions = { latitude: 31.7654321, longitude: 121.2345678, accuracy: 23 };
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, pipe: true,
    args: ['--disable-background-networking', '--no-first-run', '--disable-default-apps'] });
  let page;
  async function fresh(options = {}) {
    if (page) await page.close();
    page = await browser.newPage();
    page.setDefaultTimeout(6000);
    await page.setViewport({ width: options.width || 1440, height: 1100, deviceScaleFactor: 1 });
    page.on('pageerror', error => runtimeErrors.push({ url: page.url(), error: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push({ url: page.url(), error: message.text() });
    });
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(url).origin + '/')) {
        externalRequests.push(request.url());
        request.abort();
      } else request.continue();
    });
    await page.evaluateOnNewDocument(config => {
      window.__geoRequests = [];
      window.__storageWrites = [];
      localStorage.clear();
      sessionStorage.clear();
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        window.__storageWrites.push({ key: String(key), value: String(value) });
        return originalSetItem.call(this, key, value);
      };
      if (config.large) localStorage.setItem('accessai:settings', JSON.stringify({ large: true }));
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: config.noAPI ? undefined : {
          getCurrentPosition(success, error, options) {
            if (config.throwAPI) throw new Error('Injected location provider exception');
            window.__geoRequests.push({ success, error, options });
          },
          watchPosition() { throw new Error('Continuous real location is forbidden in QA'); },
          clearWatch() {}
        }
      });
      if (config.insecure) Object.defineProperty(window, 'isSecureContext', { value: false });
      if (config.fastWatchdog) {
        const originalTimeout = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 14000 ? 30 : delay, ...args);
      }
    }, options);
    await page.goto(options.index ? new URL('index.html', url).href : url + (options.query || '') + (options.demo ? '#demo' : ''), { waitUntil: 'load' });
    await page.waitForSelector(options.index ? '.welcome-card' : '.nav-shell');
  }
  const click = action => page.click(`[data-action="${action}"]`);
  const body = () => page.$eval('body', element => element.innerText);
  const routePoints = () => page.$eval('.network-route', element => element.getAttribute('points'));
  const routeText = () => page.$eval('.route-summary', element => element.innerText);
  async function clickPoint(x, y) {
    const point = await page.$eval('#network', (svg, coordinates) => {
      svg.scrollIntoView({ block: 'center' });
      const screen = new DOMPoint(...coordinates).matrixTransform(svg.getScreenCTM());
      return { x: screen.x, y: screen.y };
    }, [x, y]);
    await page.mouse.click(point.x, point.y);
  }
  async function success(index = 0, coords = positions) {
    await page.evaluate((i, location) => window.__geoRequests[i].success({ coords: location, timestamp: Date.now() }), index, coords);
  }
  async function failure(code, index = 0) {
    await page.evaluate((i, errorCode) => window.__geoRequests[i].error({ code: errorCode }), index, code);
  }
  async function assertNoRoute() {
    assert.equal(await page.$('.network-route'), null);
    assert.equal(await page.$('[data-action="guide"]'), null);
    assert.equal(await page.$('#network'), null);
  }
  async function check(name, fn) {
    try {
      const detail = await fn();
      results.push({ name, passed: true, ...(detail ? { detail } : {}) });
      console.log('PASS', name);
    } catch (error) {
      results.push({ name, passed: false, error: error.stack || error.message });
      console.error('FAIL', name, error.message);
      if (page) await page.screenshot({ path: path.join(artifacts, `navigation-failure-${results.length}.png`), fullPage: true }).catch(() => {});
    }
  }
  try {
    await check('Home links open current-position and explicitly fictional map modes', async () => {
      await fresh({ index: true });
      const links = await page.$$eval('a[href^="navigate.html"]', elements => elements.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })));
      assert.ok(links.some(link => link.href === 'navigate.html'));
      assert.ok(links.some(link => link.href === 'navigate.html#demo'));
      await page.click('a[href="navigate.html"]');
      await page.waitForSelector('.nav-shell');
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
      return links;
    });
    await check('Initial load never requests geolocation or grants permission', async () => {
      await fresh();
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
      assert.match(await body(), /点击.*使用当前位置/);
      await assertNoRoute();
    });
    await check('Successful mocked location reports coverage gap without synthetic route', async () => {
      await fresh();
      await click('locate');
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 1);
      assert.match(await body(), /正在获取位置/);
      await success();
      assert.match(await body(), /位置已获取 · 路线覆盖不足/);
      assert.match(await body(), /约 23 米/);
      await assertNoRoute();
      await page.click('.location-panel summary');
      assert.match(await body(), /31\.76543/);
      assert.match(await body(), /121\.23457/);
      const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, writes: window.__storageWrites }));
      assert.doesNotMatch(JSON.stringify(stored), /31\.76543|121\.23456|latitude|longitude|coords/);
      await click('clear-location');
      assert.doesNotMatch(await body(), /31\.76543|121\.23457|位置已获取/);
      return { source: 'injected geolocation mock', storage: stored };
    });
    for (const [code, expected] of [[1, /没有允许获取位置/], [2, /暂时无法确定位置/], [3, /定位超时/]]) {
      await check(`Geolocation error ${code} explains recovery without inventing a route`, async () => {
        await fresh();
        await click('locate');
        await failure(code);
        assert.match(await body(), expected);
        assert.ok(await page.$('[data-action="locate"]'));
        await assertNoRoute();
      });
    }
    await check('Missing geolocation API presents an actionable fallback', async () => {
      await fresh({ noAPI: true });
      await click('locate');
      assert.match(await body(), /没有提供定位接口/);
      await assertNoRoute();
    });
    await check('Insecure environment never invokes geolocation', async () => {
      await fresh({ insecure: true });
      await click('locate');
      assert.match(await body(), /不支持安全定位/);
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
    });
    await check('Synchronous location provider exception restores recovery controls', async () => {
      await fresh({ throwAPI: true });
      await click('locate');
      assert.doesNotMatch(await body(), /正在获取位置/);
      assert.match(await body(), /暂未确定位置/);
      assert.ok(await page.$('.planner-panel [data-action="locate"]'));
      await assertNoRoute();
    });
    await check('Independent watchdog handles a provider that never calls back', async () => {
      await fresh({ fastWatchdog: true });
      await click('locate');
      await page.waitForFunction(() => document.body.innerText.includes('定位等待超时'));
      await success();
      assert.match(await body(), /定位等待超时/);
      await assertNoRoute();
    });
    await check('Invalid coordinates are rejected without saving location', async () => {
      await fresh();
      await click('locate');
      await success(0, { latitude: 95, longitude: 10, accuracy: 1 });
      assert.match(await body(), /定位返回的信息不完整/);
      await assertNoRoute();
    });
    await check('Cancelled request and late callbacks cannot replace a fictional route', async () => {
      await fresh();
      await click('locate');
      await click('cancel-location');
      await click('demo');
      await clickPoint(175, 380);
      const before = await routePoints();
      await success();
      await failure(1);
      assert.equal(await routePoints(), before);
      assert.doesNotMatch(await body(), /位置已获取|没有允许获取位置|31\.76543/);
      assert.equal(await page.$('.location-panel'), null);
    });
    await check('Switching modes invalidates an outstanding location request', async () => {
      await fresh();
      await click('locate');
      await click('demo');
      await success();
      await failure(2);
      assert.ok(await page.$('#network'));
      assert.match(await body(), /请先选一个起点/);
      assert.doesNotMatch(await body(), /位置已获取|设备暂时无法/);
    });
    await check('Two edge midpoints produce different dynamic routes and preserve selected origins', async () => {
      await fresh({ demo: true });
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
      await clickPoint(175, 380);
      const first = await routePoints();
      const firstText = await routeText();
      const firstOrigin = await page.$eval('.network-origin circle', el => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]);
      // Native click events quantize screen pixels before SVG inverse transforms.
      assert.ok(Math.abs(firstOrigin[0] - 175) < 1 && Math.abs(firstOrigin[1] - 380) < 1, JSON.stringify(firstOrigin));
      await clickPoint(250, 240);
      const second = await routePoints();
      const secondText = await routeText();
      const secondOrigin = await page.$eval('.network-origin circle', el => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]);
      assert.ok(Math.abs(secondOrigin[0] - 250) < 1 && Math.abs(secondOrigin[1] - 240) < 1, JSON.stringify(secondOrigin));
      assert.notEqual(first, second);
      assert.match(secondText, /确认这个模拟起点/);
      return { first: { origin: firstOrigin, points: first, summary: firstText }, second: { origin: secondOrigin, points: second, summary: secondText } };
    });
    await check('Off-network selection refuses to invent a connecting route', async () => {
      await fresh({ demo: true });
      await clickPoint(40, 40);
      assert.match(await body(), /起点尚未接入路网/);
      assert.equal(await page.$('.network-route'), null);
      assert.equal(await page.$('[data-action="confirm-origin"]'), null);
    });
    await check('Unknown segment cannot be treated as accessible', async () => {
      await fresh({ demo: true });
      await clickPoint(630, 180);
      assert.match(await body(), /此路段通行信息不足/);
      assert.equal(await page.$('.network-route'), null);
    });
    await check('Width change recomputes route and requires renewed origin confirmation', async () => {
      await fresh({ demo: true });
      await clickPoint(250, 180);
      const before = await routePoints();
      assert.match(await routeText(), /260 米/);
      await click('confirm-origin');
      await page.select('#width', '100');
      const after = await routePoints();
      assert.notEqual(after, before);
      assert.match(await routeText(), /610 米/);
      assert.ok(await page.$('[data-action="confirm-origin"]'));
      assert.equal(await page.$('[data-action="guide"]'), null);
      return { before, after };
    });
    await check('Lift outage recomputes route around unavailable equipment', async () => {
      await fresh({ demo: true });
      await clickPoint(100, 380);
      const before = await routePoints();
      assert.match(await routeText(), /560 米/);
      await click('confirm-origin');
      await page.select('#scenario', 'liftClosed');
      const after = await routePoints();
      assert.notEqual(after, before);
      assert.match(await routeText(), /610 米/);
      assert.ok(await page.$('[data-action="confirm-origin"]'));
      assert.ok(await page.$('.network-edge.closed'));
      await page.select('#width', '100');
      assert.match(await routeText(), /890 米/);
      return { before, after };
    });
    await check('All destination choices replan and never retain old guidance', async () => {
      await fresh({ demo: true });
      await clickPoint(175, 380);
      const plans = {};
      for (const destination of ['mall', 'hospital', 'park']) {
        await page.select('#destination', destination);
        plans[destination] = await routePoints();
        assert.ok(await page.$('[data-action="confirm-origin"]'));
        await click('confirm-origin');
        await click('guide');
        assert.ok(await page.$('[data-action="next"]'));
      }
      assert.equal(new Set(Object.values(plans)).size, 3);
      return plans;
    });
    await check('Step navigation supports back, completion, and review', async () => {
      await fresh({ demo: true });
      await clickPoint(175, 380);
      await click('confirm-origin');
      const stepCount = await page.$$eval('.route-steps li', elements => elements.length);
      assert.ok(stepCount > 1);
      await click('guide');
      assert.equal(await page.$eval('[data-action="previous"]', element => element.disabled), true);
      await click('next');
      await click('previous');
      assert.match(await routeText(), new RegExp(`路段 1 / ${stepCount}`));
      for (let i = 0; i < stepCount; i++) await click('next');
      assert.match(await routeText(), /已到达演示终点/);
      assert.match(await routeText(), /没有使用真实定位跟踪行程/);
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
      await click('review');
      assert.ok(await page.$('[data-action="guide"]'));
      return { stepCount };
    });
    await check('Keyboard origin selector enables a route without pointer map input', async () => {
      await fresh({ demo: true });
      const origin = await page.$eval('#origin-node', select => select.options[1].value);
      await page.select('#origin-node', origin);
      assert.ok(await page.$('.network-route'));
      await click('confirm-origin');
      assert.ok(await page.$('[data-action="guide"]'));
    });
    await check('Replanning and keyboard step changes preserve control focus', async () => {
      await fresh({ demo: true });
      await clickPoint(175, 380);
      for (const [selector, value] of [['#destination', 'park'], ['#width', '100'], ['#scenario', 'liftClosed']]) {
        await page.focus(selector);
        await page.select(selector, value);
        assert.equal(await page.evaluate(() => document.activeElement.id), selector.slice(1));
      }
      await click('confirm-origin');
      await click('guide');
      await page.focus('[data-action="next"]');
      await page.keyboard.press('Space');
      assert.match(await routeText(), /路段 2/);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'next');
      await page.focus('[data-action="previous"]');
      await page.keyboard.press('Space');
      assert.match(await routeText(), /路段 1/);
    });
    await check('360, 390, 768, 1440 layouts and large text have no horizontal overflow', async () => {
      const layouts = [];
      for (const width of [360, 390, 768, 1440]) {
        for (const mode of ['current', 'demo', 'large-demo']) {
          await fresh({ width, demo: mode !== 'current', large: mode === 'large-demo' });
          if (mode !== 'current') { await clickPoint(175, 380); await click('confirm-origin'); }
          const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
          layouts.push({ width, mode, ...dimensions });
          assert.ok(dimensions.document <= width + 1 && dimensions.body <= width + 1, JSON.stringify(layouts.at(-1)));
        }
      }
      return layouts;
    });
    await check('Assistant plan link recomputes and requires explicit origin confirmation', async () => {
      await fresh({ demo: true, query: '?x=100&y=380&destinationId=mall&minWidth=100&scenario=liftClosed' });
      assert.match(await routeText(), /890 米/);
      assert.ok(await page.$('[data-action="confirm-origin"]'));
      assert.equal(await page.$('[data-action="guide"]'), null);
      assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
      await click('confirm-origin');
      await click('guide');
      assert.ok(await page.$('.nav-landmark'));
      assert.ok(await page.$('[data-action="speak-step"]'));
    });
    await check('Malformed or non-demo import cannot create an unintended route', async () => {
      for (const options of [
        {demo:true,query:'?x=&y=380&destinationId=mall&minWidth=100&scenario=normal'},
        {demo:true,query:'?x=100&x=200&y=380&destinationId=mall&minWidth=100&scenario=normal'},
        {demo:true,query:'?x=100&y=380&destinationId=mall&minWidth=70&scenario=normal'},
        {query:'?x=100&y=380&destinationId=mall&minWidth=100&scenario=normal'}
      ]) {
        await fresh(options);
        assert.equal(await page.$('.network-route'), null);
        assert.equal(await page.evaluate(() => window.__geoRequests.length), 0);
        assert.match(await body(), /链接.*(不完整|无效)/);
      }
    });
    await check('Mobile planner inputs precede map and retain the chosen origin', async () => {
      await fresh({demo:true,width:390});
      await page.select('#origin-node','west');
      assert.equal(await page.$eval('#origin-node',el=>el.value),'west');
      const rects=await page.evaluate(()=>({form:document.querySelector('.planner-panel').getBoundingClientRect().top,map:document.querySelector('.network-panel').getBoundingClientRect().top}));
      assert.ok(rects.form<rects.map);
    });
    await check('Guidance feedback saves locally without external submission', async () => {
      await fresh({demo:true,query:'?x=100&y=380&destinationId=mall&minWidth=80&scenario=normal'});
      await click('confirm-origin');await click('guide');
      await page.click('.nav-feedback summary');
      await page.type('#nav-feedback-note','地标需要进一步说明');
      await page.click('#nav-feedback-form button[type="submit"]');
      assert.match(await page.$eval('#feedback-status',el=>el.textContent),/已保存到本机/);
      const reports=await page.evaluate(()=>JSON.parse(localStorage.getItem('accessai:reports')));
      assert.equal(reports[0].note,'地标需要进一步说明');
      assert.match(reports[0].type,/动态规划/);
    });
    await check('Desktop and mobile visual artifacts generated', async () => {
      await fresh({ demo: true });
      await clickPoint(175, 380);
      await click('confirm-origin');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, 'navigation-desktop.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, 'navigation-mobile.png'), fullPage: true });
    });
    await check('No runtime errors or external data transmission', async () => {
      assert.deepEqual(runtimeErrors, []);
      assert.deepEqual(externalRequests, []);
    });
  } finally {
    await browser.close();
    const report = { checkedAt: new Date().toISOString(), url, browser: browserPath,
      geolocation: 'All location calls mocked before page scripts; no real device location accessed.',
      totals: { passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length },
      results, runtimeErrors, externalRequests };
    fs.writeFileSync(path.join(artifacts, 'navigation-browser-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.totals));
    if (report.totals.failed) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
