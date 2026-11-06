// Dev A/B: hero readability fill/rim on vs off, backlit hover against the sky and in the canyon.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5200, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&seed=1&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
const out = [];
// yaw toward the sun (late afternoon sun in the west → yaw −π/2 looks west) = backlit hero.
for (const [name, hour, x, y, z, yaw, pitch] of [['backlit', 17.2, 0, 120, 300, -1.45, 0.05], ['canyon', 13, 0, 70, -1500, 0, -0.05]]) {
  for (const on of [0, 1]) {
    await page.evaluate(([hour, x, y, z, yaw, pitch, on]) => {
      const q = window.__game;
      q._game.heroLookScale = on ? 1 : 0;
      q.setTime(hour);
      q.teleport({ x, y, z, yaw, pitch });
      q.advance(0.6);
      q.renderFrame();
    }, [hour, x, y, z, yaw, pitch, on]);
    const f = root + `qa/tmp/herolook-${name}-${on ? 'on' : 'off'}.png`;
    await page.screenshot({ path: f });
    out.push(f);
  }
}
await browser.close(); await server.close();
console.log(out.join(' '));
