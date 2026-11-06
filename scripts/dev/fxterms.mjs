// Dev probe: zero individual SpeedFx uniforms at script time t and capture each.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const [script = 'supersonic-3000', t = '0.2'] = process.argv.slice(2);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5201, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=low&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const vals = await page.evaluate(([s, tt]) => {
  const api = window.__game; api.runScript(s);
  for (let k = 0; k < Math.round(+tt / 0.2); k++) api.advance(0.2);
  const fx = api._game.fx.speedFx; const o = {};
  for (const [k, u] of fx.uniforms) { const v = u.value; o[k] = typeof v === 'number' ? +v.toFixed(4) : v && v.toArray ? v.toArray().map((x) => +(+x).toFixed(3)).slice(0, 4) : String(v); }
  return o;
}, [script, t]);
console.log(JSON.stringify(vals));
for (const term of ['uBlur', 'uStreak', 'uMist', 'uWake']) {
  await page.evaluate((k) => { const g = window.__game._game; const fx = g.fx.speedFx; const u = fx.uniforms.get(k); const old = u.value; u.value = 0; g.render.render(1/60); u.value = old; }, term);
  await page.screenshot({ path: root + `qa/tmp/term-no-${term}.png`, timeout: 120000 });
}
await browser.close(); await server.close();
