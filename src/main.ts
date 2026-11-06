import { readParams } from './core/params.ts';
import { Game } from './game/Game.ts';

const params = readParams();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

const game = new Game(canvas, ui, params);
void game.start();
