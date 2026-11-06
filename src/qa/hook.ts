/**
 * `window.__game` — the QA hook used by headless captures and by humans in the console.
 * Everything is virtual-time: `advance(seconds)` steps the fixed 60 Hz simulation and renders once.
 */
import type { StatsSnapshot } from '../contracts.ts';

export interface TeleportTarget {
  x: number;
  y: number;
  z: number;
  yaw?: number;
  pitch?: number;
}

export interface QaApi {
  ready: Promise<void>;
  /** Resolves when the current view has fully streamed in. */
  whenStreamed(): Promise<void>;
  advance(seconds: number): void;
  renderFrame(): void;
  stats(): StatsSnapshot;
  setTime(hour: number): void;
  setWeather(name: string): void;
  setThrottle(tier: number): void;
  setHeroState(name: string): void;
  teleport(target: string | TeleportTarget): void;
  runScript(name: string): { duration: number; captureHz: number };
  scriptDone(): boolean;
  scriptNames(): string[];
  /** Arbitrary per-script annotations (speeds, tiers, events) for the critique log. */
  scriptLog(): string[];
  errors: string[];
  [k: string]: unknown;
}

declare global {
  interface Window {
    __game?: QaApi;
  }
}

export function installQaHook(api: QaApi): void {
  window.__game = api;
  const errors = api.errors;
  window.addEventListener('error', (e) => errors.push(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => errors.push(`unhandledrejection: ${String(e.reason)}`));
}
