// Dev probe: trace camera-hero distance through a script (no screenshots).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const [script = 'dive-landing', dur = '4.6'] = process.argv.slice(2);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5198, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=low&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const rows = await page.evaluate(([s, d]) => {
  const api = window.__game; const g = api._game; const out = [];
  api.runScript(s);
  for (let i = 0; i < Math.round(+d / 0.2); i++) {
    for (let k = 0; k < 12; k++) g.loop.runSteps(1);
    g.rig.frame(1);
    const c = g.render.camera.position; const h = g.hero.pos;
    out.push(`t=${((i + 1) * 0.2).toFixed(1)} mode=${g.hero.mode} spd=${g.hero.speed.toFixed(0)} dist=${c.distanceTo(h).toFixed(1)} camY-heroY=${(c.y - h.y).toFixed(1)} dive=${g.hero.diving} pitch=${g.rig.pitch.toFixed(2)}`);
  }
  return out;
}, [script, dur]);
console.log(rows.join('\n'));
await browser.close(); await server.close();
