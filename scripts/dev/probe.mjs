// Dev probe: boot the game headless and time each phase (node scripts/dev/probe.mjs "<query>" WxH)
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const query = process.argv[2] ?? 'qa&quality=low';
const [w, h] = (process.argv[3] ?? '640x360').split('x').map(Number);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5191, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const t0 = Date.now();
page.on('console', (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s console.${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?' + query, { waitUntil: 'load' });
console.log(`loaded ${(Date.now() - t0) / 1000}s`);
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 300000 });
console.log(`hook ${(Date.now() - t0) / 1000}s`);
await page.evaluate(() => window.__game.ready);
console.log(`ready ${(Date.now() - t0) / 1000}s`);
for (let i = 0; i < 3; i++) {
  const t1 = Date.now();
  await page.evaluate(() => window.__game.advance(1 / 60));
  console.log(`frame ${i}: ${(Date.now() - t1) / 1000}s`, JSON.stringify(await page.evaluate(() => window.__game.stats())));
}
await page.screenshot({ path: root + 'qa/tmp/probe.png' });
console.log(`shot ${(Date.now() - t0) / 1000}s`);
await browser.close();
await server.close();
