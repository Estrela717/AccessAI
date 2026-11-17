/* Optional browser QA: PUPPETEER_PATH, BROWSER_PATH and DEMO_URL may be overridden. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const puppeteerPath = process.env.PUPPETEER_PATH || path.join(process.env.APPDATA || '', 'npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer');
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const puppeteer = require(puppeteerPath);
const results = [];
const errors = [];
const artifacts = path.join(root, 'artifacts');
const functionalOnly = process.env.QA_FUNCTIONAL_ONLY === '1';
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, pipe: true,
    args: ['--disable-background-networking', '--no-first-run', '--disable-default-apps'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(6000);
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    let url = process.env.DEMO_URL || 'http://127.0.0.1:4173';
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 });
      assert.ok(!response || response.ok(), 'preview response must be successful');
      console.log('Preview service reachable:', url);
    } catch (error) {
      if (process.env.DEMO_URL) throw error;
      url = pathToFileURL(path.join(root, 'dist/index.html')).href;
      console.log('HTTP preview unavailable; checking supported offline file mode:', url, '(' + error.message + ')');
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 });
      errors.length = 0;
    }
    const click = async (action, extra = '') => {
      const selector = `[data-action="${action}"]${extra}`;
      const handles = await page.$$(selector);
      for (const handle of handles) {
        const box = await handle.boundingBox();
        if (box && box.width && box.height) { await handle.click(); return; }
      }
      throw new Error('No visible control: ' + selector);
    };
    const body = () => page.$eval('body', el => el.innerText);
    const fresh = async (clear = true) => {
      await page.goto(url, { waitUntil: 'networkidle0' });
      if (clear) {
        await page.evaluate(() => { localStorage.clear(); });
        await page.reload({ waitUntil: 'networkidle0' });
      }
      await page.waitForSelector('.welcome-card');
    };
    const scenario = async name => {
      await click('scenarios');
      await click('scenario', `[data-scenario="${name}"]`);
    };
    const route = async (id = 'A', position) => {
      await click('open-route', `[data-route="${id}"]`);
      if (position) await page.select('#position', position);
    };
    const check = async (name, fn) => {
      try { await fn(); results.push({ name, passed: true }); console.log('PASS', name); }
      catch (error) {
        results.push({ name, passed: false, error: error.message }); console.error('FAIL', name, error.message);
        await page.screenshot({ path: path.join(artifacts, 'failure-' + results.length + '.png'), fullPage: true }).catch(() => {});
      }
    };
    const noOverflow = async label => {
      const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(Math.max(sizes.document, sizes.body) <= sizes.viewport + 1, label + ': ' + JSON.stringify(sizes));
    };

    await check('A route completes all six steps', async () => {
      await fresh(); await route(); await click('start');
      assert.match(await body(), /沿站台找到 E1/);
      for (let step = 0; step < 6; step++) await click('next');
      assert.ok(await page.$('.arrived')); assert.match(await body(), /已抵达/);
      assert.match(await body(), /南入口/);
    });
    await check('E2 outage reroutes from hall via E3 without replaying E1', async () => {
      await fresh(); await route(); await click('start'); await click('next'); await click('next');
      assert.match(await body(), /已确认位置：B1/);
      await scenario('e2');
      assert.equal(await page.$eval('[data-action="next"]', el => el.disabled), true);
      await click('reroute'); assert.match(await page.$eval('#dialog', el => el.innerText), /E3/);
      await click('confirm-reroute');
      assert.match(await page.$eval('.guide-body h2', el => el.textContent), /E3/);
      assert.match(await page.$eval('.progress-meta', el => el.innerText), /0 \/ 4/);
      for (let step = 0; step < 4; step++) await click('next');
      assert.match(await body(), /东入口/); assert.ok(await page.$('.arrived'));
    });
    await check('E1 outage blocks platform departures and explains assistance', async () => {
      await fresh(); await route(); await scenario('e1');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      await click('select-route', '[data-route="B"]');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      assert.match(await body(), /两条.*路线都受影响/);
      await click('assist'); assert.match(await page.$eval('#dialog', el => el.innerText), /不会呼叫工作人员/);
      await page.keyboard.press('Escape'); assert.equal(await page.$eval('#dialog', el => el.open), false);
    });
    await check('E1 outage does not block a confirmed hall departure', async () => {
      await fresh(); await route('A', 'hall'); await scenario('e1');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), false);
      await click('start'); assert.match(await page.$eval('.guide-body h2', el => el.textContent), /E2/);
      assert.equal(await page.$eval('[data-action="next"]', el => el.disabled), false);
    });
    await check('A-exit street position cannot jump to the C-exit route', async () => {
      await fresh(); await route('A', 'streetA');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), false);
      await click('select-route', '[data-route="B"]');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      await click('select-route', '[data-route="A"]'); await scenario('e2');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), false);
      await click('start'); assert.match(await page.$eval('.guide-body h2', el => el.textContent), /广场平坦通道/);
    });
    for (const [id, name, asset] of [['H', '云桥社区医院', 'hospital.svg'], ['P', '云桥公园', 'park.svg']]) {
      await check(`${id} route completes all six steps to ${name}`, async () => {
        await fresh(); await route(id); await click('start');
        for (let step = 0; step < 6; step++) await click('next');
        assert.equal(await page.$eval('.arrived h1', el => el.textContent), `已抵达${name}`);
        assert.ok((await page.$eval('.arrived img', el => el.getAttribute('src'))).endsWith(asset));
        if (id === 'H') assert.match(await body(), /服务台确认/);
      });
    }
    await check('E3 outage blocks the hospital route before the street, with no wrong-destination alternative', async () => {
      await fresh(); await route('H', 'hall'); await scenario('e3');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      assert.match(await body(), /没有通往医院的已核验备用路径/);
      assert.equal(await page.$$eval('[data-action="select-route"]', els => els.length), 1);
      await page.select('#position', 'streetC');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), false);
      await click('start'); assert.match(await page.$eval('.guide-body h2', el => el.textContent), /社区医院/);
      await click('next'); await click('next'); assert.match(await body(), /已抵达云桥社区医院/);
    });
    await check('South entrance closure offers B from the hall but never jumps across street exits', async () => {
      await fresh(); await route('A', 'hall'); await click('start'); await scenario('southClosed');
      assert.equal(await page.$eval('[data-action="next"]', el => el.disabled), true);
      await click('reroute'); await click('confirm-reroute');
      assert.match(await page.$eval('.guide-body h2', el => el.textContent), /E3/);
      assert.match(await page.$eval('.progress-meta', el => el.innerText), /B 路线/);
      await fresh(); await route('A', 'streetA'); await scenario('southClosed');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      assert.match(await body(), /不能直接改道/);
      await click('select-route', '[data-route="B"]');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
    });
    await check('Ponding blocks only the park route', async () => {
      await fresh(); await route('P', 'streetA'); await scenario('rain');
      assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), true);
      assert.match(await body(), /公园通道模拟积水/);
      assert.equal(await page.$$eval('[data-action="select-route"]', els => els.length), 1);
      for (const id of ['A', 'H']) {
        await click('nav', '[data-view="home"]'); await route(id, 'hall');
        assert.equal(await page.$eval('[data-action="start"]', el => el.disabled), false);
      }
    });
    await check('A park approach already confirmed complete is not blocked retroactively by ponding', async () => {
      await fresh(); await route('P'); await click('start');
      for (let step = 0; step < 5; step++) await click('next');
      assert.match(await page.$eval('.progress-meta', el => el.innerText), /5 \/ 6/);
      assert.match(await page.$eval('.guide-body h2', el => el.textContent), /入口进入公园/);
      await scenario('rain');
      assert.equal(await page.$eval('[data-action="next"]', el => el.disabled), false);
      await click('next'); assert.match(await body(), /已抵达云桥公园/);
    });
    await check('Facility cards and details reflect the new E3 and south-entrance outages', async () => {
      for (const [name, id] of [['e3', 'E3'], ['southClosed', 'south']]) {
        await fresh(); await scenario(name); await click('nav', '[data-view="facilities"]');
        const cardText = await page.$eval(`.place-card[data-id="${id}"]`, el => el.innerText);
        assert.doesNotMatch(cardText, /样例可用/); assert.match(cardText, /停运|停用|关闭|不可用/);
        await click('facility', `[data-id="${id}"]`);
        assert.doesNotMatch(await page.$eval('#dialog', el => el.innerText), /样例可用/);
      }
    });
    await check('Saved route persists after refresh and can be removed', async () => {
      await fresh(); await route(); await click('save');
      await page.reload({ waitUntil: 'networkidle0' }); await click('nav', '[data-view="saved"]');
      assert.equal(await page.$$eval('.saved-list section', els => els.length), 1);
      await click('save', '[data-route="A"]');
      assert.match(await body(), /还没有收藏路线/);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('accessai:saved'))), []);
    });
    await check('Hospital and park routes can both be saved and reopened after refresh', async () => {
      await fresh(); await route('H'); await click('save');
      await click('nav', '[data-view="home"]'); await route('P'); await click('save');
      await page.reload({ waitUntil: 'networkidle0' }); await click('nav', '[data-view="saved"]');
      assert.equal(await page.$$eval('.saved-list section', els => els.length), 2);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('accessai:saved')).sort()), ['H', 'P']);
      await click('open-route', '[data-route="H"]'); assert.match(await page.$eval('main h1', el => el.textContent), /社区医院/);
      await click('nav', '[data-view="saved"]'); await click('open-route', '[data-route="P"]');
      assert.match(await page.$eval('main h1', el => el.textContent), /云桥公园/);
    });
    await check('Feedback is escaped, persists, stays unverified and can be deleted', async () => {
      await fresh(); await click('nav', '[data-view="reports"]'); await click('report');
      const payload = '<img src=x onerror="window.__qaInjected=true"> & " 测试';
      await page.type('#note', payload); await page.click('#report-form button[type="submit"]');
      assert.equal(await page.$eval('.feedback-card p', el => el.textContent), payload);
      assert.equal(await page.$$eval('.feedback-card p img', els => els.length), 0);
      assert.equal(await page.evaluate(() => window.__qaInjected), undefined);
      assert.match(await page.$eval('.feedback-card', el => el.innerText), /待核实/);
      await page.reload({ waitUntil: 'networkidle0' }); await click('nav', '[data-view="reports"]');
      assert.equal(await page.$eval('.feedback-card p', el => el.textContent), payload);
      await click('delete-report'); await click('confirm-delete');
      assert.equal(await page.$$eval('.feedback-card', els => els.length), 0);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('accessai:reports'))), []);
    });
    await check('Unknown search has a clear empty state', async () => {
      await fresh(); await page.type('#search', '不存在的地点QA'); await page.click('#search-form button');
      assert.match(await page.$eval('.result-summary', el => el.innerText), /暂未找到/);
    });
    await check('Search distinguishes hospital/park demo routes from Central/Laojie real stations', async () => {
      for (const [query, selector, expected] of [
        ['医院', '[data-action="open-route"][data-route="H"]', /社区医院/],
        ['公园', '[data-action="open-route"][data-route="P"]', /云桥公园/],
        ['中环', '[data-action="station"][data-id="hk-central"]', /中环站/],
        ['老街', '[data-action="station"][data-id="sz-laojie"]', /老街站/]
      ]) {
        await fresh(); await page.type('#search', query); await page.click('#search-form button');
        assert.ok(await page.$('.result-summary ' + selector));
        await page.click('.result-summary ' + selector);
        assert.match(await page.$eval('main h1', el => el.textContent), expected);
      }
    });
    await check('Real station directory filters six official records by city', async () => {
      await fresh(); await scenario('e1'); await click('nav', '[data-view="real"]');
      assert.equal(await page.$$eval('.real-grid .real-card', els => els.length), 6);
      assert.match(await body(), /检索日期：2026-11-17/);
      assert.equal(await page.$$eval('[data-action="scenarios"]', els => els.length), 0);
      assert.doesNotMatch(await page.$eval('main', el => el.innerText), /模拟停运|模拟状态/);
      await click('city', '[data-city="深圳"]');
      assert.equal(await page.$$eval('.real-grid .real-card', els => els.length), 4);
      assert.deepEqual(await page.$$eval('.real-city', els => [...new Set(els.map(el => el.textContent))]), ['深圳']);
      await click('city', '[data-city="香港"]');
      assert.equal(await page.$$eval('.real-grid .real-card', els => els.length), 2);
      assert.deepEqual(await page.$$eval('.real-city', els => [...new Set(els.map(el => el.textContent))]), ['香港']);
      await click('city', '[data-city="all"]'); assert.equal(await page.$$eval('.real-grid .real-card', els => els.length), 6);
    });
    await check('All six real-station details show official links, provenance and unknown live state without navigation', async () => {
      await fresh(); await click('nav', '[data-view="real"]');
      const ids = ['sz-laojie', 'sz-grand-theater', 'sz-science-museum', 'sz-luohu', 'hk-central', 'hk-hong-kong'];
      for (const id of ids) {
        await click('station', `[data-id="${id}"]`);
        const main = await page.$eval('main', el => el.innerText);
        assert.match(main, /检索日期[\s\S]*2026-11-17/);
        assert.match(main, /读取方式/); assert.match(main, /实时状态[\s\S]*未接入/);
        assert.match(main, /原文更新时间[\s\S]*原文未明确标注/);
        assert.equal(await page.$$eval('[data-action="start"], [data-action="scenarios"], .map-card', els => els.length), 0);
        const link = await page.$eval('.station-detail a[href]', el => ({ href: el.href, target: el.target, rel: el.rel }));
        const official = new URL(link.href);
        assert.equal(official.protocol, 'https:');
        assert.ok(['www.szmc.net', 'www.mtr.com.hk'].includes(official.hostname));
        assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/);
        await click('nav', '[data-view="real"]');
      }
    });
    await check('Large-text setting works and survives reload', async () => {
      await fresh(); await click('settings'); await page.click('#large-toggle');
      assert.equal(await page.$eval('body', el => el.classList.contains('large-text')), true);
      await click('close'); await page.reload({ waitUntil: 'networkidle0' });
      assert.equal(await page.$eval('body', el => el.classList.contains('large-text')), true);
    });
    if (!functionalOnly) for (const width of [360, 390, 768, 1024, 1440]) {
      await check(`No horizontal overflow at ${width}px, including large text and major screens`, async () => {
        await page.setViewport({ width, height: width > 1000 ? 1100 : 844, deviceScaleFactor: 1 });
        await fresh(); await noOverflow('home');
        await route(); await noOverflow('detail');
        await click('start'); await noOverflow('guide');
        if (width <= 760) {
          const guideControls = await page.evaluate(() => {
            const next = document.querySelector('[data-action="next"]');
            next.scrollIntoView({ block: 'center', behavior: 'instant' });
            const rect = next.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { navigationHidden: getComputedStyle(document.querySelector('.bottom-nav')).display === 'none', nextButtonUnobstructed: next.contains(hit) };
          });
          assert.equal(guideControls.navigationHidden, true);
          assert.equal(guideControls.nextButtonUnobstructed, true);
        }
        await click('leave'); await click('confirm-leave');
        await click('nav', '[data-view="facilities"]'); await noOverflow('facilities');
        await click('nav', '[data-view="saved"]'); await noOverflow('saved');
        await click('nav', '[data-view="reports"]'); await noOverflow('reports');
        await click('nav', '[data-view="real"]'); await noOverflow('real directory');
        await click('station', '[data-id="sz-grand-theater"]'); await noOverflow('real station');
        await click('nav', '[data-view="home"]'); await click('settings'); await page.click('#large-toggle'); await click('close');
        await noOverflow('large home'); await route(); await noOverflow('large detail');
        await click('start'); await noOverflow('large guide');
        await click('leave'); await click('confirm-leave');
        await click('nav', '[data-view="real"]'); await noOverflow('large real directory');
        await click('station', '[data-id="sz-grand-theater"]'); await noOverflow('large real station');
      });
    }
    if (!functionalOnly) await check('All scene images load and desktop/mobile screenshots can be captured', async () => {
      await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 }); await fresh();
      await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))));
      assert.deepEqual(await page.$$eval('img', images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src)), []);
      await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true });
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
      await page.screenshot({ path: path.join(artifacts, 'desktop-preview.png'), fullPage: false });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
      await route(); await click('start');
      await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))));
      await page.screenshot({ path: path.join(artifacts, 'guide-mobile.png'), fullPage: true });
      await click('leave'); await click('confirm-leave');
      await click('nav', '[data-view="real"]'); await click('station', '[data-id="hk-central"]');
      await page.screenshot({ path: path.join(artifacts, 'real-station.png'), fullPage: true });
    });
    if (!functionalOnly) await check('No browser page errors or console errors', async () => { assert.deepEqual(errors, []); });
    const summary = { mode: functionalOnly ? 'functional-only' : 'complete', url, browser: await browser.version(), results, errors, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length };
    fs.writeFileSync(path.join(artifacts, functionalOnly ? 'functional-check.json' : 'browser-check.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, url }));
    if (summary.failed) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
