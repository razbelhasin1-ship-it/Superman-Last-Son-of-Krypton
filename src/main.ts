/**
 * Entry. The menu is plain DOM and loads first (tiny chunk), so it is interactive within ~1 s even
 * on a cold start; the engine (three.js, world, hero) is imported dynamically behind it.
 */
import { readParams } from './core/params.ts';
import { Menu } from './ui/Menu.ts';
import { loadSettings } from './ui/settings.ts';
import type { Game } from './game/Game.ts';

const params = readParams();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const settings = loadSettings();

let game: Game | null = null;
let pendingPlay = false;
const wantsMenu = !params.play && !params.intro && !params.hero && (!params.qa || params.menu);

const menu = wantsMenu
  ? new Menu(ui, settings, {
      onPlay: () => (game ? game.beginIntro() : (pendingPlay = true)),
      onSettingsChanged: () => game?.saveSettings(),
      onUiSound: (k) => {
        if (k === 'select') game?.audio.thump(0.08, 2.4);
      },
    })
  : null;
menu?.show();
if (!params.qa) {
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity .6s ease';
}

async function boot(): Promise<void> {
  const { Game } = await import('./game/Game.ts');
  game = new Game(canvas, ui, params, { settings, menu });
  await game.start();
  canvas.style.opacity = '1';
  if (pendingPlay) game.beginIntro();
}

// Let the menu paint first, then pull in and build the engine.
requestAnimationFrame(() => setTimeout(() => void boot(), 30));
