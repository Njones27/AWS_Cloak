// End to end check. Loads the unpacked extension in Chromium and serves a mock console page
// at a real AWS console URL so the content script runs. Run with: node tests/e2e.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-console.html'), 'utf8');
const URL = 'https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:';

let failures = 0;
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failures++;
}

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awscloak-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');

  await context.route('https://*.console.aws.amazon.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: MOCK }));

  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForTimeout(500);

  const attr = (sel) => page.$eval(sel, (el) => el.getAttribute('data-awscloak'));
  const blurOf = (sel) => page.$eval(sel, (el) => getComputedStyle(el).filter);

  check('instance ID cell is blurred', (await attr('#id1')) === 'auto');
  check('instance ID link is blurred', (await page.$eval('#id2 a', (el) => el.getAttribute('data-awscloak'))) === 'auto');
  check('IP address is blurred', (await attr('#ip1')) === 'auto');
  check('instance name stays visible', (await attr('#name1')) === null);
  check('state stays visible', (await attr('#state1')) === null);
  check('heading stays visible', (await attr('#heading')) === null);
  check('access portal URL is blurred', (await attr('#portalUrl')) === 'auto');
  check('label next to URL stays visible', (await attr('#portal')) === null);
  check('blur filter is applied', (await blurOf('#id1')).includes('blur'));
  check('account menu in nav is blurred', (await blurOf('[data-testid="awsc-nav-account-menu-button"]')).includes('blur'));
  check('long paragraph is not blurred as a whole', (await attr('#para')) === null);
  check('ARN inside paragraph is highlighted', await page.evaluate(() => {
    const h = CSS.highlights.get('awscloak');
    if (!h) return false;
    for (const r of h) if (r.toString().startsWith('arn:aws:iam::123456789012')) return true;
    return false;
  }));
  check('input holding an ARN is blurred', (await attr('#searchInput')) === 'input');
  check('plain input stays visible', (await attr('#plainInput')) === null);
  check('tab title is masked', (await page.title()) === '•••• | EC2 | us-east-1');

  // Content added later, the way the console renders, must be blurred before it paints.
  const dynamicBlurredSync = await page.evaluate(() => new Promise((resolve) => {
    const el = document.createElement('span');
    el.id = 'late';
    el.textContent = 'vol-0123456789abcdef0';
    document.getElementById('dynamic').appendChild(el);
    requestAnimationFrame(() => resolve(el.getAttribute('data-awscloak')));
  }));
  check('dynamically added ID is blurred before the next frame', dynamicBlurredSync === 'auto');

  await page.evaluate(() => { document.getElementById('name1').firstChild.nodeValue = 'sg-0a1b2c3d4e'; });
  await page.waitForTimeout(50);
  check('text that changes into an ID gets blurred', (await attr('#name1')) === 'auto');
  await page.evaluate(() => { document.getElementById('name1').firstChild.nodeValue = 'web-server'; });
  await page.waitForTimeout(50);
  check('text that changes back is unblurred', (await attr('#name1')) === null);

  // Toggle off and on through storage, the same path the popup and shortcut use.
  await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await page.waitForTimeout(200);
  check('toggle off removes blur', (await blurOf('#id1')) === 'none');
  check('toggle off removes nav blur', (await blurOf('[data-testid="awsc-nav-account-menu-button"]')) === 'none');
  check('toggle off restores title', (await page.title()) === 'i-0abc123def4567890 | EC2 | us-east-1');
  check('toggle off removes highlight', await page.evaluate(() => !CSS.highlights.has('awscloak')));
  await worker.evaluate(() => chrome.storage.local.set({ enabled: true }));
  await page.waitForTimeout(200);
  check('toggle on brings blur back', (await blurOf('#id1')).includes('blur'));
  check('toggle on masks title again', (await page.title()).startsWith('•'));

  // Strict mode.
  await page.evaluate(() => { document.getElementById('dynamic').insertAdjacentHTML('beforeend', '<span id="strictTok">build42</span>'); });
  await page.waitForTimeout(50);
  check('standard mode leaves build42 visible', (await attr('#strictTok')) === null);
  await worker.evaluate(() => chrome.storage.local.set({ strict: true }));
  await page.waitForTimeout(200);
  check('strict mode blurs build42', (await attr('#strictTok')) === 'auto');
  await worker.evaluate(() => chrome.storage.local.set({ strict: false }));
  await page.waitForTimeout(200);

  // Picker.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'startPicker' });
  });
  await page.waitForTimeout(200);
  check('picker banner shows', !!(await page.$('.awscloak-banner')));
  const box = await page.$eval('#sidebar', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + 5, y: r.y + r.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(100);
  check('hover outline appears', await page.$eval('.awscloak-hover', (el) => el.style.display === 'block'));
  await page.screenshot({ path: path.join(__dirname, 'picker.png') }).catch(() => {});
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
  check('clicked item is blurred', (await blurOf('#sidebar')).includes('blur'));
  const stored = await worker.evaluate(() => chrome.storage.local.get('picks'));
  check('pick is saved for this page', (stored.picks.pages['console.aws.amazon.com/ec2'] || []).length === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Esc closes picker', !(await page.$('.awscloak-banner')));

  // Picks survive a reload and apply in another region.
  await page.goto(URL.replace('us-east-1.console', 'eu-west-2.console'));
  await page.waitForTimeout(500);
  check('pick is remembered after reload in another region', (await blurOf('#sidebar')).includes('blur'));
  await page.screenshot({ path: path.join(__dirname, 'blurred.png') }).catch(() => {});

  // Clearing.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'clearPicksHere' });
  });
  await page.waitForTimeout(200);
  check('clear picks unblurs the item', (await blurOf('#sidebar')) === 'none');

  await context.close();
  if (failures) {
    console.log(failures + ' checks failed');
    process.exit(1);
  }
  console.log('All end to end checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
