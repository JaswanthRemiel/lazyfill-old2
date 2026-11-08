// Regenerates docs/screenshots from the real extension.
//   npm run build && npx vite build --config vite.dev.config.ts && node scripts/screenshots.mjs
// It loads dist/ into a headless Chromium browser with a fictional profile, opens the demo form from web/public,
// and captures the panel before and after Autofill, then the dashboard screens from the dev harness.
// Set BROWSER to use something other than Brave or Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = join(root, 'docs', 'screenshots');
const browser = process.env.BROWSER ?? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);
if (!browser) throw new Error('No Chromium browser found. Set BROWSER=/path/to/browser.');
if (!existsSync(join(dist, 'manifest.json'))) throw new Error('Build first: npm run build');
mkdirSync(out, { recursive: true });

// small static servers: web/public for the demo page, dist-dev for the dashboard and dialog screens
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mjs': 'text/javascript' };
const serve = async (dir, index) => {
  const server = http.createServer((req, res) => {
    const file = join(dir, req.url === '/' ? index : req.url.split('?')[0]);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};
const demo = await serve(join(root, 'web/public'), 'demo.html');
const demoUrl = `${demo.base}/demo.html`;
const devDir = join(root, 'dist-dev');
const dev = existsSync(devDir) ? await serve(devDir, 'index.html') : null;
if (!dev) console.warn('dist-dev is missing: skipping the dashboard screens. Run: npx vite build --config vite.dev.config.ts');

const port = 9400 + Math.floor(Math.random() * 400);
const profileDir = join(tmpdir(), `lazyfill-assets-${process.pid}`);
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--load-extension=${dist}`, `--disable-extensions-except=${dist}`,
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = async () => (await fetch(`http://127.0.0.1:${port}/json`)).json();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, call, close: () => ws.close() };
}

const now = new Date().toISOString();
const profile = {
  id: 'demo', name: 'Front End Developer', createdAt: now, updatedAt: now,
  data: {
    personalInfo: { firstName: 'Ada', middleName: '', lastName: 'Lovelace', preferredName: '', email: 'ada@example.com', phoneCountryCode: '+44', phoneNumber: '7700900123', pronouns: '', currentAddress: '', city: 'London', state: 'England', zipCode: '', country: 'United Kingdom' },
    links: { linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace', githubUrl: 'https://github.com/ada', portfolioUrl: '', websiteUrl: 'https://ada.dev', twitterUrl: '' },
    workExperience: [{ jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, UK', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' }],
    education: [{ schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false }],
    skills: ['TypeScript', 'React', 'Node.js'],
    preferences: { currentCompany: 'Analytical Engines', currentTitle: 'Staff Engineer', yearsOfExperience: '8', workAuthorization: '', requiresSponsorship: '', willingToRelocate: '', desiredSalary: '', noticePeriod: '', availableStartDate: '' },
    demographics: { genderIdentity: '', race: '', sexualOrientation: '', veteranStatus: '', disabilityStatus: '' },
    answerBank: [], resume: null,
  },
};

try {
  let list = [];
  for (let i = 0; i < 60; i++) {
    try { list = await targets(); if (list.some((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://')) && list.some((t) => t.type === 'page')) break; } catch { /* starting */ }
    await sleep(500);
  }
  const sw = connect(list.find((t) => t.type === 'service_worker').webSocketDebuggerUrl);
  await sw.ready;
  const seed = { lf_session: { uid: 'demo', email: 'ada@example.com', idToken: 'x', refreshToken: 'x', expiresAt: Date.now() + 1e10 }, lf_profile_cache: [profile], lf_active_profile_id: 'demo' };
  await sw.call('Runtime.evaluate', { expression: `chrome.storage.local.set(${JSON.stringify(seed)})`, awaitPromise: true });
  sw.close();

  const page = list.find((t) => t.type === 'page');
  const p = connect(page.webSocketDebuggerUrl);
  await p.ready;
  await p.call('Page.enable');
  await p.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await p.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await p.call('Page.navigate', { url: demoUrl });
  await p.call('Page.bringToFront'); // pages in the background are ignored by the extension
  await sleep(5000);
  const shot = async (name) => {
    const r = await p.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, name), Buffer.from(r.result.data, 'base64'));
    console.log('wrote', join('docs/screenshots', name));
  };
  await shot('1-detects-the-application.png');

  // press Autofill: bottom of the 360x467 panel that sits 20px from the top right
  const x = 1280 - 20 - 180, y = 20 + 467 - 16 - 24;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(2300);
  await shot('2-autofills-in-one-click.png');

  if (dev) {
    for (const [name, path] of [
      ['3-tracks-every-application.png', '/dev/dashboard.html#/applications'],
      ['4-review-before-anything-is-added.png', '/dev/review.html'],
      ['5-drafts-answers-with-ai.png', '/dev/generate.html'],
    ]) {
      await p.call('Page.navigate', { url: dev.base + path });
      await sleep(2200);
      await shot(name);
    }
  }

  p.close();
} finally {
  const exited = new Promise((r) => child.once('exit', r));
  child.kill();
  await Promise.race([exited, sleep(3000)]);
  demo.server.close();
  dev?.server.close();
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
}
