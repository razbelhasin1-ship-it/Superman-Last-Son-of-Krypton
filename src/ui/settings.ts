/** Player settings (spec 5.1), persisted to localStorage inside try/catch. */
export interface Settings {
  graphics: 'low' | 'medium' | 'high' | 'ultra' | 'auto';
  resolutionScale: number;
  fovOffset: number;
  mouseSensitivity: number;
  invertY: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedShake: boolean;
  reducedMotionBlur: boolean;
  stableHorizon: boolean;
  subtitles: boolean;
  tts: boolean;
  autoCruise: boolean;
  safeBoom: boolean;
  hudVisible: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: 'auto',
  resolutionScale: 1,
  fovOffset: 0,
  mouseSensitivity: 1,
  invertY: false,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  reducedShake: false,
  reducedMotionBlur: false,
  stableHorizon: false,
  subtitles: true,
  tts: false,
  autoCruise: false,
  safeBoom: false,
  hudVisible: true,
};

const KEY = 'superman-metropolis.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode, blocked): settings stay in memory */
  }
}
