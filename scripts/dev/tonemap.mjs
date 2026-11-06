// Dev probe: same frame with AgX vs ACES Filmic tone mapping.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const query = process.argv[2] ?? 'qa&intro&quality=medium';
const at = Number(process.argv[3] ?? '0.1');
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5202, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?' + query, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
await page.evaluate((s) => window.__game.advance(s), at);
await page.screenshot({ path: root + 'qa/tmp/tm-agx.png', timeout: 180000 });
await page.evaluate(() => { const r = window.__game._render; r.toneMapping.mode = 6; window.__game.renderFrame(); });
await page.screenshot({ path: root + 'qa/tmp/tm-aces.png', timeout: 180000 });
await browser.close(); await server.close();
