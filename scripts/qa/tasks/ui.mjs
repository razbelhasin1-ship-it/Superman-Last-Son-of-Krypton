// QA: in-game UI (spec 12.2 + 7.1/7.5): HUD banner/discovery/compass/meters, pause + Daily Planet, map, photo mode.
import path from 'node:path';

export default async function ui({ root, openGame, shot, contactSheet }) {
  const page = await openGame('world=test&play', { width: 1280, height: 720 });
  const out = (n) => path.join(root, `qa/shots/ui-${n}.png`);
  const files = [];
  // Fly a little so the HUD has numbers, then fire the HUD events.
  await page.evaluate(() => {
    const q = window.__game;
    q.teleport({ x: 0, y: 160, z: 600, yaw: 0, pitch: -0.08 });
    q.setHeroState('cruise');
    q.advance(1.0);
    const g = q._game;
    g.hud.setCompassMarker({ id: 'inc:test', x: 900, z: -2400, kind: 'incident', label: 'Bus on the bridge' });
    g.addHope(3, 'qa');
    g.hud.banner('MIDTOWN — CENTENNIAL', 'Park district');
    g.hud.discovery('Daily Planet', 'Art-deco tower crowned by the bronze globe; the city’s newspaper of record.', 3, 40);
    q.advance(0.6);
    q.renderFrame();
  });
  await new Promise((r) => setTimeout(r, 1100)); // CSS transitions run in real time
  files.push(await shot(page, out('hud')));
  // Hand the keyboard back to the real input (the virtual pad ignores keys).
  await page.evaluate(() => {
    const g = window.__game._game;
    g.input.virtual = null;
  });
  // Pause (Esc) with the Daily Planet front page.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__game.advance(0.1);
    window.__game.renderFrame();
  });
  await new Promise((r) => setTimeout(r, 700));
  files.push(await shot(page, out('pause')));
  // Map from the pause menu.
  await page.evaluate(() => {
    document.querySelector('.mm .panel:not(.hidden) button[data-act="map"]').click();
  });
  await new Promise((r) => setTimeout(r, 500));
  files.push(await shot(page, out('map')));
  await page.keyboard.press('KeyM'); // close → back to pause
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.press('Escape'); // resume (guard elapsed)
  await page.evaluate(() => {
    window.__game.advance(0.4);
    window.__game.renderFrame();
  });
  await new Promise((r) => setTimeout(r, 900)); // menu fade-out (real time)
  // Photo mode: move the camera round to the hero's front three-quarter, golden filter.
  await page.keyboard.press('KeyP');
  await page.evaluate(() => {
    const q = window.__game;
    q.advance(0.1);
    const g = q._game;
    const h = g.visual.root.position;
    // Hero flies north (−Z): stand ahead of him, a little to the side and below, looking back.
    g.photo.pos.set(h.x + 2.6, h.y - 0.5, h.z - 4.2);
    const d = h.clone().sub(g.photo.pos).normalize();
    g.photo.yaw = Math.atan2(d.x, -d.z);
    g.photo.pitch = Math.asin(d.y);
    g.photoPanel.sync({ filter: 'golden', aperture: 0.7, fov: 38 });
    g.photoPanel.values.filter = 'golden';
    g.grade.applyFilter('golden');
    g.photo.fov = 38;
    g.photo.aperture = 0.7;
    q.advance(0.2);
    q.renderFrame();
  });
  await new Promise((r) => setTimeout(r, 600));
  files.push(await shot(page, out('photo')));
  await page.keyboard.press('KeyP');
  await page.evaluate(() => {
    window.__game.advance(0.6);
    window.__game.renderFrame();
  });
  await new Promise((r) => setTimeout(r, 800)); // HUD fade-in (real time)
  files.push(await shot(page, out('after-photo')));
  const st = await page.evaluate(() => window.__game._game.state);
  console.log(`ui: state after photo exit = ${st}`);
  await contactSheet(files, ['HUD events', 'pause + Daily Planet', 'map', 'photo mode', 'back to play'], path.join(root, 'qa/sheets/ui.png'), { cols: 3, thumbW: 560, title: 'in-game UI' });
  console.log('ui →', files.map((f) => path.relative(root, f)).join(' '));
  await page.close();
}
