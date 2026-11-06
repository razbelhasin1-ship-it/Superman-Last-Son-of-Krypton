// Dev probe: dusk → night look (sky, clouds, moonlight, exposure).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const prefix = process.argv[2] ?? 'night';
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5203, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 600)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&seed=1&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
const out = [];
const views = [
  ['1800', 18.0, 6000, 3400, 6000, -1.45, -0.05],
  ['1830', 18.45, 6000, 3400, 6000, -1.45, -0.05],
  ['1930', 19.5, 0, 1200, 300, 0, -0.5],
  ['2300', 23.0, 6000, 30, 6000, 3.0, 0.35],
];
for (const [name, hour, x, y, z, yaw, pitch] of views) {
  const info = await page.evaluate(([hour, x, y, z, yaw, pitch]) => {
    const q = window.__game;
    q.setTime(hour);
    q.teleport({ x, y, z, yaw, pitch });
    q.advance(0.6);
    q.renderFrame();
    const g = q._game;
    const r = window.__game._render;
    return { hour: g.hour, sunY: g.sunDir.y.toFixed(3), exp: r.renderer.toneMappingExposure.toFixed(2), sunI: r.sun.intensity.toFixed(3), env: !!r.scene.environment };
  }, [hour, x, y, z, yaw, pitch]);
  const f = root + `qa/tmp/${prefix}-${name}.png`;
  await page.screenshot({ path: f });
  out.push(f);
  console.log(name, JSON.stringify(info));
}
await browser.close(); await server.close();
console.log(out.join(' '));
