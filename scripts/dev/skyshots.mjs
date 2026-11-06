// Dev probe: sky/cloud look — cirrus, cumulus, cloud shadows (node scripts/dev/skyshots.mjs [prefix]).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const prefix = process.argv[2] ?? 'sky';
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5201, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 400)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&seed=1&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
const out = [];
const views = (process.argv[3] === 'cloudy')
  ? [
    ['shadow-a', 12.5, 9000, 900, 9000, 0.3, -0.75],
    ['shadow-b', 15.5, -9000, 400, 7000, 2.2, -0.45],
    ['shadow-c', 11, 7000, 60, -9000, 1.0, -0.12],
    ['shadow-d', 12.5, 9000, 1300, 9000, 0.3, -1.2],
  ]
  : [
    ['up', 12, 0, 20, 400, 0.5, 0.45],
    ['shadows', 12.5, 0, 700, 1200, 0.3, -0.75],
    ['above', 15, 0, 3200, 0, 0.8, -0.05],
    ['morning', 8.5, 0, 900, 600, 0, -0.55],
  ];
for (const [name, hour, x, y, z, yaw, pitch] of views) {
  await page.evaluate(([hour, x, y, z, yaw, pitch]) => {
    const q = window.__game;
    q.setTime(hour);
    q.teleport({ x, y, z, yaw, pitch });
    q.advance(0.6);
    q.renderFrame();
  }, [hour, x, y, z, yaw, pitch]);
  const f = root + `qa/tmp/${prefix}-${name}.png`;
  await page.screenshot({ path: f });
  out.push(f);
}
await browser.close(); await server.close();
console.log(out.join(' '));
