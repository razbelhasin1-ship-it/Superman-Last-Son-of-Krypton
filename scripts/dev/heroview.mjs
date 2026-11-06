// Dev probe: close views of the hero (behind / front / side) in a given state.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const state = process.argv[2] ?? 'hover';
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5196, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 400)); });
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=medium&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const shots = [];
for (const [name, ang] of [['back', 0], ['front', Math.PI], ['side', Math.PI / 2]]) {
  await page.evaluate(([st, a]) => {
    const g = window.__game._game;
    window.__game.teleport({ x: 0, y: 40, z: 0, yaw: 0, pitch: 0 });
    if (st !== 'hover') window.__game.setHeroState(st);
    g.loop.advance(1.2, false);
    g.visual.frame(1);
    const cam = g.render.camera;
    const hp = g.visual.root.position.clone();
    const d = 4.2;
    // yaw 0 = hero faces north (−Z); 'back' = camera south of hero.
    cam.position.set(hp.x + Math.sin(a) * -d * 0 + Math.sin(a) * d, hp.y + 0.4, hp.z + Math.cos(a) * d);
    cam.lookAt(hp.x, hp.y + 0.1, hp.z);
    cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    g.visual.frame(1);
    g.render.render(1 / 60);
  }, [state, ang]);
  const f = root + `qa/tmp/hero-${name}.png`;
  await page.screenshot({ path: f, clip: { x: 300, y: 0, width: 600, height: 500 } });
  shots.push(f);
}
await browser.close(); await server.close();
console.log(shots.join(' '));
