// Dev probe: god rays + lens flare (sun behind towers, through clouds, clear, above the deck).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const prefix = process.argv[2] ?? 'sun';
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5202, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 600)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&seed=1&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
const out = [];
// [name, hour, x, y, z, pitchOffset, yawOffset]
const views = [
  ['towers', 17.4, -280, 45, -1450, 0.05, 0.02],
  ['clouds', 16.0, 9000, 250, 9000, -0.05, 0.0],
  ['clear', 10.5, 0, 3, 80, -0.12, 0.25],
  ['above', 18.3, 0, 3400, 0, -0.03, 0.1],
];
for (const [name, hour, x, y, z, dp, dy] of views) {
  const info = await page.evaluate(([hour, x, y, z, dp, dy]) => {
    const q = window.__game;
    const g = q._game;
    q.setTime(hour);
    q.advance(0.05);
    const sd = g.sunDir;
    const yaw = Math.atan2(sd.x, -sd.z) + dy;
    const pitch = Math.asin(sd.y) + dp;
    q.teleport({ x, y, z, yaw, pitch });
    q.advance(0.8);
    q.renderFrame();
    const u = g.sunFx.uniforms;
    return { on: u.get('uSunOn').value.toFixed(2), vis: u.get('uSunVis').value.toFixed(2), sunY: sd.y.toFixed(3) };
  }, [hour, x, y, z, dp, dy]);
  const f = root + `qa/tmp/${prefix}-${name}.png`;
  await page.screenshot({ path: f });
  out.push(f);
  console.log(name, JSON.stringify(info));
}
await browser.close(); await server.close();
console.log(out.join(' '));
