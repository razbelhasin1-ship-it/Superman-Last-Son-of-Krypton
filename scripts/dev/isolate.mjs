// Dev probe: at script time t, render with each top-level scene object hidden; report which removes the artefact.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = new URL('../..', import.meta.url).pathname;
const [script = 'supersonic-3000', t = '0.2'] = process.argv.slice(2);
const server = await createServer({ root, configFile: root + 'vite.config.ts', logLevel: 'warn', server: { port: 5199, strictPort: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(server.resolvedUrls.local[0] + '?qa&quality=low&world=test&play', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
await page.evaluate(() => window.__game.ready);
const names = await page.evaluate(([s, tt]) => {
  const api = window.__game; api.runScript(s);
  for (let k = 0; k < Math.round(+tt / 0.2); k++) api.advance(0.2);
  const g = api._game; const out = [];
  const walk = (o, d) => { if (d > 2) return; for (const c of o.children) { out.push(`${'  '.repeat(d)}${c.type} ${c.name || ''} vis=${c.visible} kids=${c.children.length}`); walk(c, d + 1); } };
  walk(g.render.scene, 0);
  return out;
}, [script, t]);
console.log(names.join('\n'));
await page.screenshot({ path: root + 'qa/tmp/iso-all.png', timeout: 120000 });
await page.evaluate(() => { const g = window.__game._game; g.render.setPreEffectEnabled('speed', false); window.__game.renderFrame(); g.render.setPreEffectEnabled('speed', true); });
await page.screenshot({ path: root + 'qa/tmp/iso-no-speedfx.png', timeout: 120000 });
await page.evaluate(() => { const g = window.__game._game; const fx = g.fx.speedFx; for (const k of ['uShock','uShock2']) fx.uniforms.get(k).value.w = 0; const o = fx.u('uShock'); window.__game.renderFrame(); });
await page.screenshot({ path: root + 'qa/tmp/iso-no-shock.png', timeout: 120000 });
const groups = ['TestGround'];
for (const nm of groups) {
  await page.evaluate((n) => { const g = window.__game._game; const o = g.render.scene.getObjectByName(n); if (o) o.visible = false; window.__game.renderFrame(); if (o) o.visible = true; }, nm);
  await page.screenshot({ path: root + `qa/tmp/iso-no-${nm}.png`, timeout: 120000 });
}
await browser.close(); await server.close();
