// Dev tool: side-by-side two images into qa/tmp/pair.png (node scripts/dev/pair.mjs a.png b.png)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [a, b, out = 'qa/tmp/pair.png'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const d = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const url = await page.evaluate(async ([A, B]) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const [ia, ib] = await Promise.all([load(A), load(B)]);
  const w = 640, h = Math.round(w * ia.height / ia.width);
  const c = document.createElement('canvas'); c.width = w * 2 + 6; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(ia, 0, 0, w, h); g.drawImage(ib, w + 6, 0, w, h);
  return c.toDataURL('image/png');
}, [d(a), d(b)]);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
