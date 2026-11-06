// Dev tool: crop + upscale a region: node scripts/dev/crop.mjs in.png x y w h scale out.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const [inp, x, y, w, h, scale = '4', out = 'qa/tmp/crop.png'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const src = 'data:image/png;base64,' + fs.readFileSync(inp).toString('base64');
const url = await page.evaluate(async ([s, x, y, w, h, k]) => {
  const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(im, x, y, w, h, 0, 0, w * k, h * k);
  return c.toDataURL('image/png');
}, [src, +x, +y, +w, +h, +scale]);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
