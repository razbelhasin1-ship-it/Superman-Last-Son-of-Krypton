/**
 * Every feel number in the game. Mirrored live in the `?debug` lil-gui panel, grouped by system.
 * Values are *starting values* — tune by feel while flying.
 */

export interface TierDef {
  name: string;
  /** Target speed (m/s) when thrusting at this tier (top of the tier's band). */
  speed: number;
  /** Exponential easing rate (1/s) used when accelerating toward this tier. */
  k: number;
  fov: number;
  dist: number;
  /** Seconds to reach this tier from the previous one (spec table; used by tests). */
  reachTime: number;
}

export const T = {
  tiers: [
    { name: 'HOVER', speed: 6, k: 9.0, fov: 62, dist: 6, reachTime: 0 },
    { name: 'GLIDE', speed: 40, k: 7.5, fov: 66, dist: 7.5, reachTime: 0.5 },
    { name: 'CRUISE', speed: 120, k: 4.39, fov: 72, dist: 9, reachTime: 0.8 },
    { name: 'DASH', speed: 340, k: 3.48, fov: 82, dist: 10.5, reachTime: 1.0 },
    { name: 'SUPERSONIC', speed: 1000, k: 2.33, fov: 98, dist: 12, reachTime: 1.5 },
    { name: 'BULLET', speed: 2400, k: 1.69, fov: 110, dist: 14, reachTime: 2.0 },
    { name: 'BURST', speed: 6000, k: 5.67, fov: 120, dist: 16, reachTime: 0.6 },
  ] as TierDef[],

  flight: {
    defaultTier: 2,
    /** "Reached" threshold used by the tier timing tests: within this fraction of the target. */
    reachFraction: 0.98,
    /** Deceleration rate when throttle is released (no brake) — a long graceful glide to hover. */
    coastK: 1.1,
    /** Deceleration rate when a lower tier is selected while thrusting. */
    tierDownK: 2.2,
    /** Brake: decel = min(brakeAccel + brakeAccelPerSpeed·v, brakeK·v) — ≈0.5 s from cruise, ≈1.5 s from Mach 1. */
    brakeAccel: 235,
    brakeAccelPerSpeed: 0.02,
    brakeK: 16,
    /** Heading turn-rate limit (deg/s) by speed (m/s): long elegant arcs at speed. */
    turnSpeeds: [0, 6, 40, 120, 343, 1000, 2400, 6000],
    turnRates: [400, 220, 150, 90, 45, 30, 20, 12],
    /** Strafe weight in the desired direction at low / high speed (A/D steer gently at speed). */
    strafeWeightLow: 1.0,
    strafeWeightHigh: 0.32,
    verticalWeightHigh: 0.55,
    /** Bank (roll) = clamp(bankGain · yawRate · speedFactor, ±bankMax) through a spring. */
    bankGain: 0.9,
    bankMaxDeg: 75,
    bankOmega: 7,
    /** Body pitch: lean 0→leanMax through glide, fully prone from proneStart→proneFull. */
    leanMaxDeg: 60,
    leanStart: 6,
    leanEnd: 40,
    proneStart: 34,
    proneFull: 62,
    bodyOmega: 9,
    /** Hover vertical bob (visual only). */
    bobAmp: 0.03,
    bobHz: 0.4,
    /** Burst (tier 6) limits. */
    burstMax: 2.5,
    burstCooldown: 8,
    /** Barrel roll. */
    rollDuration: 0.5,
    rollDodgeSpeed: 22,
    /** Power-dive: steep descent converting altitude to speed. */
    diveAccel: 70,
    diveMaxSpeed: 900,
    divePitchDeg: -68,
    /** Collision sphere radius around the hero (m). */
    radius: 0.55,
    /** Below this incidence angle (deg) a contact slides instead of stopping. */
    glancingDeg: 35,
    glassShatterSpeed: 80,
    /** Ground skim: minimum altitude above ground while flying fast and level. */
    skimHeight: 1.6,
    softLandSpeed: 9,
    /** Auto-cruise flight assist (hold tier without W). */
    autoCruise: false,
    /** Transonic band for the vapour cone (m/s). */
    transonicLo: 300,
    transonicHi: 395,
  },

  ground: {
    walkSpeed: 2.2,
    runSpeed: 7,
    sprintSpeed: 48,
    accelK: 10,
    sprintAccelK: 3,
    turnK: 12,
    gravity: 22,
    crouchSpeed: 1.6,
  },

  takeoff: {
    anticipation: 0.15,
    liftSpeed: 6,
    /** Space held longer than this on the ground starts a power-launch charge. */
    holdThreshold: 0.25,
    chargeMax: 1.2,
    launchSpeedMin: 220,
    launchSpeedMax: 900,
    launchHoldMin: 0.5,
    launchHoldMax: 1.6,
    launchDecayK: 0.9,
    chargeFovDrop: 8,
  },

  leap: {
    hopHeight: 12,
    minApex: 30,
    maxApex: 250,
    chargeMax: 1.5,
    gravity: 22,
    /** Horizontal distance as a multiple of apex height for charged leaps. */
    distanceRatio: 1.1,
    apexWindow: 0.6,
    glideGravity: 5,
    glideForward: 26,
  },

  landing: {
    heroSpeed: 40,
    craterSpeed: 150,
    craterMin: 6,
    craterMax: 14,
    heroRecover: 0.85,
    softRecover: 0.3,
  },

  camera: {
    heightOffset: 1.2,
    shoulder: 0.6,
    posLag: 0.12,
    rotLag: 0.08,
    lookAhead: 0.15,
    lookAheadMax: 12,
    fovKick: 6,
    fovKickDecay: 0.4,
    rollFactor: 0.35,
    /** Acceleration pushes the camera back briefly (seconds² scale), clamped. */
    accelLag: 0.0045,
    accelLagMax: 6,
    accelLagOmega: 5,
    pitchMinDeg: -85,
    pitchMaxDeg: 85,
    collisionRadius: 0.35,
    pushInK: 30,
    pullOutK: 3,
    mouseSensitivity: 0.0022,
    padYawRate: 3.2,
    padPitchRate: 2.2,
    shakeDecay: 1.6,
    shakeFreq: 18,
    shakeMaxDeg: 2.2,
    shakeMaxPos: 0.35,
    near: 0.1,
    far: 60000,
  },

  cape: {
    cols: 14,
    rows: 26,
    length: 1.52,
    topWidth: 0.44,
    bottomWidth: 1.12,
    iterations: 10,
    damping: 0.985,
    gravity: 9.81,
    bendStiffness: 0.22,
    shearStiffness: 0.6,
    /** Effective relative wind saturates here (m/s) so the sim is stable at 6,000 m/s. */
    windSat: 55,
    windNormalCoef: 0.06,
    windTangentCoef: 0.012,
    flutterFreqMin: 6,
    flutterFreqMax: 12,
    flutterAmp: 22,
    /** Fraction of body rotation the cloth resists (lag on turns). */
    rotationInertia: 0.65,
    accelInertia: 0.5,
    accelMax: 70,
    waveSpeed: 9,
    waveStrength: 1.0,
    collisionMargin: 0.035,
  },

  fx: {
    streakStart: 150,
    streakFull: 1400,
    caMax: 0.012,
    vignetteBase: 0.28,
    vignetteSpeed: 0.38,
    motionBlurSamples: 10,
    motionBlurStrength: 0.65,
    windQuads: 1100,
    nearMissDist: 6,
    nearMissMinSpeed: 60,
    boomHitstopFrames: 2,
    boomAudioDelay: 0.12,
    surfaceFxHeight: 15,
    cloudBase: 1500,
    cloudTop: 2500,
  },

  sky: {
    hour: 10.5,
    dayMinutes: 24,
    timeFlows: true,
    sunIntensity: 3.2,
    fogDensity: 0.000055,
    fogFalloff: 0.00042,
  },
};

export type Tuning = typeof T;

export function tierSpeed(i: number): number {
  const t = T.tiers[Math.max(0, Math.min(T.tiers.length - 1, i))];
  return t ? t.speed : 0;
}
