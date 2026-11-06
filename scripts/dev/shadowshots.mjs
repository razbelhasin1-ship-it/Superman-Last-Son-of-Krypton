// Dev probe: sun shadows at several altitudes over the test-ground tower field (late-afternoon sun).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const hour = Number(process.argv[2] ?? 16.8);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5199, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&seed=1&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
const out = [];
for (const [alt, pitch, z] of [[40, -0.25, 200], [300, -0.5, -300], [900, -0.8, 0], [1800, -0.9, 400]]) {
  const st = await page.evaluate(([alt, pitch, z, hour]) => {
    const q = window.__game;
    q.setTime(hour);
    q.teleport({ x: 0, y: alt, z, yaw: 0, pitch });
    q.advance(0.5);
    q.renderFrame();
    return q.stats();
  }, [alt, pitch, z, hour]);
  const f = root + `qa/tmp/shadow-${alt}.png`;
  await page.screenshot({ path: f });
  out.push(f);
  console.log(alt, JSON.stringify(st));
}
await browser.close(); await server.close();
console.log(out.join(' '));
