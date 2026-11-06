// Dev probe: run a QA flight script and dump cape state (model space) at given times.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const name = process.argv[2] ?? 'takeoff-lift';
const times = (process.argv[3] ?? '2.2').split(',').map(Number);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5198, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=low&seed=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
await page.evaluate((n) => window.__game.runScript(n), name);
let tPrev = 0;
for (const t of times) {
  const info = await page.evaluate(([dt]) => {
    const g = window.__game._game;
    window.__game.advance(dt);
    const c = g.visual.cape;
    const cols = c.cols, rows = c.rows;
    const f = (a) => a.map((x) => +x.toFixed(2));
    const p = (r, col) => { const i = (r * cols + col) * 3; return f([c.pos[i], c.pos[i + 1], c.pos[i + 2]]); };
    const rs = (r, col) => { const i = (r * cols + col) * 3; return f([c.restShape[i], c.restShape[i + 1], c.restShape[i + 2]]); };
    const mid = Math.floor(cols / 2);
    const h = g.hero;
    return {
      speed: +h.speed.toFixed(1), lean: +(h.lean.x * 57.3).toFixed(1), fpitch: +(h.flightPitch * 57.3).toFixed(1),
      wind: f([c.wind.x, c.wind.y, c.wind.z]), acc: f([h.accel.x, h.accel.y, h.accel.z]),
      top: p(0, mid), q1: p(Math.floor(rows / 4), mid), mid: p(Math.floor(rows / 2), mid), bot: p(rows - 1, mid),
      restBot: rs(rows - 1, mid), restTop: rs(0, mid),
    };
  }, [t - tPrev]);
  tPrev = t;
  console.log(t.toFixed(2), JSON.stringify(info));
}
await browser.close(); await server.close();
