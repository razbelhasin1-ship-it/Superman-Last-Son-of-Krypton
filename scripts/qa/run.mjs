#!/usr/bin/env node
/**
 * Headless QA runner.
 *   npm run qa -- --smoke                 one screenshot → qa/shots/smoke.png
 *   npm run qa -- --flights [a,b,…]       scripted flights at 5 Hz → qa/flights/<name>/, sheets → qa/sheets/
 *   npm run qa -- --script <name>         one scripted sequence
 *   npm run qa -- --shot <name> --query "…" --at <seconds>   arbitrary capture
 *   npm run qa -- --menu | --intro | --hero | --landmarks | --skyline | --powers | --trace-emblem
 * Options: --size 1280x720 --quality high --seed 1
 * Exits non-zero on any console error/warning or page error.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const quality = opt('quality', 'high');
const seed = opt('seed', '1');

/** Console noise from the headless/software-GL environment itself (not from the game). */
const ENV_NOISE = [/GPU stall due to ReadPixels/i, /GroupMarkerNotSet/i, /Automatic fallback to software WebGL/i];

let server;
let browser;
const issues = [];

async function ensureDir(d) {
  await fs.mkdir(d, { recursive: true });
}

async function openGame(query, size = { width: W, height: H }) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    const t = msg.type();
    if (t !== 'error' && t !== 'warning') return;
    const text = msg.text();
    if (ENV_NOISE.some((r) => r.test(text))) return;
    issues.push(`[${t}] ${text}`);
  });
  page.on('pageerror', (err) => issues.push(`[pageerror] ${err.message}`));
  const base = server.resolvedUrls.local[0];
  const q = `qa&seed=${seed}&quality=${quality}${query ? '&' + query : ''}`;
  await page.goto(`${base}?${q}`, { waitUntil: 'load', timeout: 180000 });
  // Fail fast on boot errors instead of waiting for the full timeout.
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(() => window.__game !== undefined)) break;
    const fatal = issues.find((i) => i.startsWith('[pageerror]') || /Uncaught|TypeError|ReferenceError/.test(i));
    if (fatal) throw new Error(`boot failed: ${fatal}`);
    if (Date.now() - t0 > 180000) throw new Error('boot timeout');
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.evaluate(() => {
    window.__gameReadyFlag = false;
    window.__game.ready.then(() => (window.__gameReadyFlag = true));
  });
  for (;;) {
    if (await page.evaluate(() => window.__gameReadyFlag === true)) break;
    const fatal = issues.find((i) => i.startsWith('[pageerror]') || /Uncaught|TypeError|ReferenceError/.test(i));
    if (fatal) throw new Error(`start failed: ${fatal}`);
    if (Date.now() - t0 > 240000) throw new Error('ready timeout');
    await new Promise((r) => setTimeout(r, 250));
  }
  return page;
}

async function shot(page, file) {
  await ensureDir(path.dirname(file));
  await page.screenshot({ path: file, timeout: 180000 });
  return file;
}

/** Compose images into a labelled contact sheet using a same-origin canvas page. */
async function contactSheet(files, labels, outFile, { cols = 4, thumbW = 480, title = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}scripts/qa/blank.html`);
  const urls = files.map((f) => base + path.relative(root, f).split(path.sep).join('/') + `?t=${Date.now()}`);
  const dataUrl = await page.evaluate(
    async ({ urls, labels, cols, thumbW, title }) => {
      const imgs = await Promise.all(
        urls.map(
          (u) =>
            new Promise((res, rej) => {
              const im = new Image();
              im.onload = () => res(im);
              im.onerror = () => rej(new Error('load ' + u));
              im.src = u;
            }),
        ),
      );
      const ar = imgs[0].naturalHeight / imgs[0].naturalWidth;
      const thumbH = Math.round(thumbW * ar);
      const rows = Math.ceil(imgs.length / cols);
      const head = title ? 40 : 0;
      const c = document.createElement('canvas');
      c.width = cols * thumbW + (cols + 1) * 6;
      c.height = rows * (thumbH + 6) + 6 + head;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      if (title) {
        g.fillStyle = '#fff';
        g.font = 'bold 22px sans-serif';
        g.fillText(title, 10, 28);
      }
      imgs.forEach((im, i) => {
        const x = 6 + (i % cols) * (thumbW + 6);
        const y = head + 6 + Math.floor(i / cols) * (thumbH + 6);
        g.drawImage(im, x, y, thumbW, thumbH);
        const label = labels[i] || '';
        if (label) {
          g.font = 'bold 16px monospace';
          const w = g.measureText(label).width;
          g.fillStyle = 'rgba(0,0,0,0.6)';
          g.fillRect(x, y, w + 10, 22);
          g.fillStyle = '#ffd34d';
          g.fillText(label, x + 5, y + 16);
        }
      });
      return c.toDataURL('image/png');
    },
    { urls, labels, cols, thumbW, title },
  );
  await page.close();
  await ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return outFile;
}

async function runSmoke() {
  const page = await openGame('');
  await page.evaluate(() => window.__game.advance(0.25));
  const file = await shot(page, path.join(root, 'qa/shots/smoke.png'));
  const stats = await page.evaluate(() => window.__game.stats());
  console.log('smoke →', path.relative(root, file), JSON.stringify(stats));
  await page.close();
}

async function runFlightScript(page, name, outDir, size) {
  const info = await page.evaluate((n) => window.__game.runScript(n), name);
  const dt = 1 / info.captureHz;
  const files = [];
  const labels = [];
  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);
  const n = Math.round(info.duration * info.captureHz);
  await page.evaluate(() => window.__game.advance(0));
  for (let i = 0; i <= n; i++) {
    const f = path.join(outDir, `frame-${String(i).padStart(3, '0')}.png`);
    await shot(page, f);
    files.push(f);
    const st = await page.evaluate(() => window.__game.stats());
    labels.push(`${(i * dt).toFixed(1)}s ${Math.round(st.heroSpeed * 3.6)}km/h T${st.tier} ${Math.round(st.heroAlt)}m`);
    if (i < n) await page.evaluate((s) => window.__game.advance(s), dt);
  }
  const log = await page.evaluate(() => window.__game.scriptLog());
  await fs.writeFile(path.join(outDir, 'log.txt'), log.join('\n') + '\n');
  const sheet = await contactSheet(files, labels, path.join(root, `qa/sheets/flight-${name}.png`), {
    cols: 6,
    thumbW: Math.min(320, size.width / 3),
    title: `flight: ${name}`,
  });
  console.log(`flight ${name}: ${files.length} frames → ${path.relative(root, sheet)}`);
  return { files, sheet, log };
}

async function runFlights(names) {
  const size = { width: 960, height: 540 };
  const page = await openGame('world=test&play', size);
  const all = await page.evaluate(() => window.__game.scriptNames());
  const list = names && names.length ? names : all;
  for (const name of list) {
    if (!all.includes(name)) {
      console.error(`unknown script ${name}; known: ${all.join(', ')}`);
      continue;
    }
    await runFlightScript(page, name, path.join(root, 'qa/flights', name), size);
  }
  await page.close();
}

async function runShot() {
  const name = opt('shot', 'shot');
  const query = opt('query', '');
  const at = Number(opt('at', '0.25'));
  const page = await openGame(query);
  const script = opt('run', '');
  if (script) await page.evaluate((n) => window.__game.runScript(n), script);
  await page.evaluate((s) => window.__game.advance(s), at);
  const file = await shot(page, path.join(root, `qa/shots/${name}.png`));
  const stats = await page.evaluate(() => window.__game.stats());
  console.log(`${name} →`, path.relative(root, file), JSON.stringify(stats));
  await page.close();
}

async function main() {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'warn',
    // No HMR / file watching: editing sources during a long capture must not reload the page.
    server: { host: '127.0.0.1', port: 5190, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  try {
    let did = false;
    if (flag('smoke') || argv.length === 0) {
      await runSmoke();
      did = true;
    }
    if (flag('flights')) {
      const v = opt('flights', '');
      await runFlights(v ? v.split(',') : []);
      did = true;
    }
    if (flag('script')) {
      await runFlights([opt('script', '')]);
      did = true;
    }
    if (flag('shot')) {
      await runShot();
      did = true;
    }
    for (const mod of ['menu', 'intro', 'ui', 'hero', 'landmarks', 'skyline', 'powers', 'trace-emblem', 'golden', 'incidents', 'trailer', 'perf']) {
      if (flag(mod)) {
        const m = await import(`./tasks/${mod}.mjs`);
        await m.default({ root, browser, server, openGame, shot, contactSheet, opt, flag, issues, runFlightScript, ensureDir });
        // handoff frames → sheet
        if (mod === 'intro') {
          const hf = [11.8, 12.5, 12.8, 13.0, 13.4, 14.0, 15.0, 16.5].map((t) => path.join(root, `qa/intro/t${t.toFixed(1).replace('.', '_')}.png`));
          await contactSheet(hf, ['11.8s', '12.5s', '12.8s', '13.0s', '13.4s', '14.0s', '15.0s', '16.5s'], path.join(root, 'qa/sheets/intro-handoff.png'), { cols: 4, thumbW: 400, title: 'handoff (5.3)' });
        }
        did = true;
      }
    }
    if (!did) console.log('nothing to do; see header of scripts/qa/run.mjs');
  } finally {
    await browser.close();
    await server.close();
  }
  if (issues.length) {
    console.error(`\n✗ ${issues.length} console issue(s):`);
    for (const i of [...new Set(issues)].slice(0, 40)) console.error('  ' + i);
    process.exit(1);
  }
  console.log('✓ zero console errors/warnings');
}

main().catch(async (e) => {
  console.error(e);
  try {
    await browser?.close();
    await server?.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
