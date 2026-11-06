/** URL parameters controlling boot mode. */
export interface BootParams {
  seed: number;
  debug: boolean;
  qa: boolean;
  hero: boolean;
  /** Skip menu + intro and spawn straight into gameplay. */
  play: boolean;
  /** Which world to load: the gate-1 test ground or the full city. */
  world: 'test' | 'city';
  quality: 'low' | 'medium' | 'high' | 'ultra' | 'auto' | null;
  intro: boolean;
  menu: boolean;
}

export function readParams(search: string = typeof location !== 'undefined' ? location.search : ''): BootParams {
  const p = new URLSearchParams(search);
  const flag = (k: string) => p.has(k) && p.get(k) !== '0' && p.get(k) !== 'false';
  const q = p.get('quality');
  const quality = q === 'low' || q === 'medium' || q === 'high' || q === 'ultra' || q === 'auto' ? q : null;
  const w = p.get('world');
  return {
    seed: Number.parseInt(p.get('seed') ?? '1', 10) || 1,
    debug: flag('debug'),
    qa: flag('qa'),
    hero: flag('hero'),
    play: flag('play'),
    world: w === 'test' ? 'test' : w === 'city' ? 'city' : 'city',
    quality,
    intro: flag('intro'),
    menu: flag('menu'),
  };
}
