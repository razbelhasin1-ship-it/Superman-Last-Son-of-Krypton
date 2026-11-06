// QA: main menu at 16:9, 16:10 and 21:9 + time-to-interactive (spec 5.1).
import path from 'node:path';

export default async function menu({ root, browser, server, shot, issues }) {
  const sizes = [
    ['16x9', 1920, 1080],
    ['16x10', 1680, 1050],
    ['21x9', 2520, 1080],
  ];
  const base = server.resolvedUrls.local[0];
  for (const [name, w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('console', (msg) => {
      const t = msg.type();
      if ((t === 'error' || t === 'warning') && !/GPU stall|GroupMarkerNotSet/.test(msg.text())) issues.push(`[${t}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => issues.push(`[pageerror] ${err.message}`));
    const t0 = Date.now();
    await page.goto(`${base}?qa&menu&seed=1&quality=high`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.mm');
      const btn = document.querySelector('.mm button.mi');
      return el && !el.classList.contains('out') && btn;
    }, null, { timeout: 180000 });
    const tti = (Date.now() - t0) / 1000;
    // The engine loads behind the DOM menu (dynamic import); wait for the QA hook to appear.
    await page.waitForFunction(() => !!window.__game, null, { timeout: 180000 });
    await page.evaluate(() => window.__game.ready);
    await page.evaluate(() => window.__game.advance(0.5));
    // Let the 350 ms CSS entrance transition finish (real time), focus the first item.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await new Promise((r) => setTimeout(r, 900));
    const file = await shot(page, path.join(root, `qa/shots/menu-${name}.png`));
    console.log(`menu ${name}: interactive in ${tti.toFixed(2)} s → ${path.relative(root, file)}`);
    if (name === '16x9') {
      // Settings + controls panels.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 700));
      await shot(page, path.join(root, `qa/shots/menu-settings.png`));
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 600));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 700));
      await shot(page, path.join(root, `qa/shots/menu-controls.png`));
    }
    await page.close();
  }
}
