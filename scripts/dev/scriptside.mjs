// Dev probe: run a QA flight script to time t, then render the hero from the side and from behind.
// node scripts/dev/scriptside.mjs <script> <t1,t2,...>  → qa/tmp/side-<t>.png
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const name = process.argv[2] ?? 'takeoff-lift';
const times = (process.argv[3] ?? '2.2').split(',').map(Number);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5197, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=medium&seed=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__game.ready);
await page.evaluate((n) => window.__game.runScript(n), name);
let tPrev = 0;
const out = [];
for (const t of times) {
  const info = await page.evaluate(([dt]) => {
    const g = window.__game._game;
    window.__game.advance(dt);
    const h = g.hero;
    const cam = g.render.camera;
    const hp = g.visual.root.position.clone();
    // Side view: perpendicular to the horizontal velocity, slightly above.
    const vx = h.vel.x, vz = h.vel.z; const hl = Math.hypot(vx, vz) || 1;
    const sx = -vz / hl, sz = vx / hl;
    g.rig.mode = 'cinematic';
    g.rig.cine.pos.set(hp.x + sx * 7, hp.y + 0.6, hp.z + sz * 7);
    g.rig.cine.target.copy(hp);
    g.rig.cine.fov = 40;
    g.rig.initialized = false;
    g.rig.step(1 / 60, h);
    g.rig.frame(1);
    g.visual.frame(1);
    g.render.render(1 / 60);
    const r = { speed: h.speed, lean: h.lean.x * 57.3, pitch: h.flightPitch * 57.3, intent: h.intentSpeed, y: h.pos.y };
    g.rig.mode = 'chase';
    g.rig.initialized = false;
    return r;
  }, [t - tPrev]);
  tPrev = t;
  const f = root + `qa/tmp/side-${t.toFixed(1)}.png`;
  await page.screenshot({ path: f });
  out.push(f);
  console.log(t.toFixed(1), JSON.stringify(info));
}
await browser.close(); await server.close();
console.log(out.join(' '));
