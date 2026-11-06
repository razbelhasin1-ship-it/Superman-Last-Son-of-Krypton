// Dev probe: run a script to time t, report cape bounds, render with speed FX on/off.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const [script = 'supersonic-200', t = '2.4'] = process.argv.slice(2);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5197, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=high&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const info = await page.evaluate(([s, tt]) => {
  const api = window.__game; const g = api._game;
  api.runScript(s); for (let k = 0; k < Math.round(+tt / 0.2); k++) api.advance(0.2);
  const cape = g.visual.cape; let maxR = 0, nan = 0;
  for (let i = 0; i < cape.pos.length; i += 3) { const x = cape.pos[i], y = cape.pos[i+1], z = cape.pos[i+2]; if (!Number.isFinite(x+y+z)) nan++; else maxR = Math.max(maxR, Math.hypot(x, y - 1, z)); }
  return { maxR, nan, speed: g.hero.speed, wind: cape.wind.toArray() };
}, [script, t]);
console.log(JSON.stringify(info));
await page.screenshot({ path: root + 'qa/tmp/fx-on.png', timeout: 180000 });
await page.evaluate(() => { const g = window.__game._game; g.render.setPreEffectEnabled('speed', false); window.__game.renderFrame(); });
await page.screenshot({ path: root + 'qa/tmp/fx-off.png', timeout: 180000 });
await browser.close(); await server.close();
