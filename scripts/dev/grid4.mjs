// Dev tool: 2x2 grid of images → qa/tmp/grid.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const files = process.argv.slice(2, 6); const out = process.argv[6] ?? 'qa/tmp/grid.png';
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
const srcs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
const url = await page.evaluate(async ([s, names]) => {
  const ims = await Promise.all(s.map((x) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = x; })));
  const w = 480, h = Math.round(w * ims[0].height / ims[0].width); const c = document.createElement('canvas'); c.width = w * 2 + 4; c.height = h * 2 + 4;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  ims.forEach((im, i) => { const x = (i % 2) * (w + 4), y = Math.floor(i / 2) * (h + 4); g.drawImage(im, x, y, w, h); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 200, 20); g.fillStyle = '#ffd34d'; g.font = 'bold 14px monospace'; g.fillText(names[i], x + 4, y + 15); });
  return c.toDataURL('image/png');
}, [srcs, files.map((f) => f.split('/').pop())]);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await browser.close();
