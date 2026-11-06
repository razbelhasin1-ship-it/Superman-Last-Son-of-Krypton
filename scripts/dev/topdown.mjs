// Dev probe: top-down view over the hero to check shadow direction.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5194, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=medium&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const info = await page.evaluate(() => {
  const g = window.__game._game;
  g.loop.advance(0.5);
  const cam = g.render.camera;
  const hp = g.visual.root.position.clone();
  cam.position.set(hp.x, hp.y + 25, hp.z + 0.01);
  cam.lookAt(hp.x, hp.y, hp.z);
  cam.fov = 50; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  g.render.render(1/60);
  return { hero: hp.toArray(), sunPos: g.render.sun.position.toArray(), sunTarget: g.render.sun.target.position.toArray(), sunDir: g.render.atmosphere.sunDir.toArray() };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: root + 'qa/tmp/topdown.png' });
await browser.close(); await server.close();
