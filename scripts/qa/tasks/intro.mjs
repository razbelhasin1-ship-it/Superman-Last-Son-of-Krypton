// QA: Play sequence frames at the storyboard times + side-by-side contact sheet (spec 5.2/5.3).
import path from 'node:path';
import fs from 'node:fs/promises';

const TIMES = [0, 2, 4, 5.5, 6.5, 7.5, 9, 11];
const HANDOFF = [11.8, 12.5, 12.8, 13.0, 13.4, 14.0, 15.0, 16.5];

export default async function intro({ root, browser, server, openGame, shot, opt }) {
  const size = { width: 1280, height: 720 };
  const page = await openGame('intro', size);
  const outDir = path.join(root, 'qa/intro');
  await fs.mkdir(outDir, { recursive: true });
  const files = [];
  let t = 0;
  for (const target of [...TIMES, ...HANDOFF]) {
    await page.evaluate((s) => window.__game.advance(s), target - t);
    t = target;
    const f = await shot(page, path.join(outDir, `t${target.toFixed(1).replace('.', '_')}.png`));
    files.push({ t: target, f });
  }
  await page.close();

  // Contact sheet: storyboard cell above our frame, for each of the 8 times.
  const base = server.resolvedUrls.local[0];
  const sheetPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await sheetPage.goto(`${base}scripts/qa/blank.html`);
  const ours = files.filter((x) => TIMES.includes(x.t)).map((x) => base + path.relative(root, x.f) + `?v=${Date.now()}`);
  const dataUrl = await sheetPage.evaluate(
    async ({ ours, sb, times }) => {
      const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u)); i.src = u; });
      const board = await load(sb);
      const imgs = await Promise.all(ours.map(load));
      const cw = board.naturalWidth / 4;
      const ch = board.naturalHeight / 2;
      const W = 400;
      const H = Math.round((W * ch) / cw);
      const c = document.createElement('canvas');
      c.width = 4 * (W + 6) + 6;
      c.height = 2 * (2 * H + 30) + 50;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff';
      g.font = 'bold 20px sans-serif';
      g.fillText('Play sequence — storyboard (top) vs. game (bottom)', 10, 30);
      times.forEach((t, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 6 + col * (W + 6);
        const y = 44 + row * (2 * H + 30);
        g.drawImage(board, col * cw, row * ch, cw, ch, x, y, W, H);
        const im = imgs[i];
        // centre-crop our 16:9 frame to the storyboard cell aspect
        const ar = cw / ch;
        let sw = im.naturalWidth;
        let sh = sw / ar;
        if (sh > im.naturalHeight) {
          sh = im.naturalHeight;
          sw = sh * ar;
        }
        g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y + H + 4, W, H);
        g.fillStyle = 'rgba(0,0,0,.6)';
        g.fillRect(x, y + H + 4, 58, 20);
        g.fillStyle = '#ffd34d';
        g.font = 'bold 14px monospace';
        g.fillText(`${t}s`, x + 6, y + H + 19);
      });
      return c.toDataURL('image/png');
    },
    { ours, sb: base + 'reference/play-sequence-storyboard.png', times: TIMES },
  );
  await sheetPage.close();
  const sheet = path.join(root, 'qa/sheets/intro-vs-storyboard.png');
  await fs.mkdir(path.dirname(sheet), { recursive: true });
  await fs.writeFile(sheet, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`intro → ${path.relative(root, sheet)}`);
  void opt;
  void shot;
}
