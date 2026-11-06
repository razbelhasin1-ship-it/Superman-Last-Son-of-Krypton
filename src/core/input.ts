/**
 * Keyboard + mouse + gamepad input. Produces one InputFrame per fixed simulation step.
 * Look (mouse / right stick) is consumed per render frame by the camera rig for smoothness.
 * QA scripts inject a virtual frame instead of hardware input.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'overboost'
  | 'brake'
  | 'punch'
  | 'grab'
  | 'heat'
  | 'freeze'
  | 'breath'
  | 'xray'
  | 'telescope'
  | 'hearing'
  | 'scan'
  | 'focus'
  | 'map'
  | 'pause'
  | 'photo'
  | 'debug'
  | 'tierUp'
  | 'tierDown'
  | 'confirm'
  | 'wheel'
  | 'hudToggle';

export interface InputFrame {
  moveX: number;
  moveY: number;
  tierDelta: number;
  zoomDelta: number;
  held: Set<Action>;
  pressed: Set<Action>;
  released: Set<Action>;
  doubleTapped: Set<Action>;
  /** Seconds the action has been held continuously (0 if not held). */
  heldTime: Map<Action, number>;
  usingGamepad: boolean;
}

export function emptyFrame(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    tierDelta: 0,
    zoomDelta: 0,
    held: new Set(),
    pressed: new Set(),
    released: new Set(),
    doubleTapped: new Set(),
    heldTime: new Map(),
    usingGamepad: false,
  };
}

const KEYMAP: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  KeyC: 'crouch',
  ShiftLeft: 'overboost',
  ShiftRight: 'overboost',
  KeyR: 'brake',
  KeyE: 'grab',
  KeyF: 'freeze',
  KeyG: 'breath',
  KeyX: 'xray',
  KeyZ: 'telescope',
  KeyH: 'hearing',
  KeyV: 'scan',
  KeyQ: 'focus',
  KeyM: 'map',
  Escape: 'pause',
  KeyP: 'photo',
  F1: 'debug',
  Enter: 'confirm',
  KeyU: 'hudToggle',
};

/** Standard-mapping gamepad buttons → actions. */
const PADMAP: Partial<Record<number, Action>> = {
  0: 'jump',
  1: 'crouch',
  2: 'grab',
  3: 'brake',
  5: 'heat',
  6: 'overboost',
  7: 'punch',
  8: 'map',
  9: 'pause',
  11: 'wheel',
  12: 'tierUp',
  13: 'tierDown',
};

const DOUBLE_TAP = 0.28;

export class Input {
  private keysDown = new Set<Action>();
  private prevHeld = new Set<Action>();
  private lastPressTime = new Map<Action, number>();
  private pendingPressed = new Set<Action>();
  private pendingDouble = new Set<Action>();
  private heldSince = new Map<Action, number>();
  private wheelAccum = 0;
  private mouseDX = 0;
  private mouseDY = 0;
  private now = 0;
  private padConnected = false;
  private lastPadButtons: boolean[] = [];
  private padLookX = 0;
  private padLookY = 0;
  usingGamepad = false;
  pointerLocked = false;
  /** When set, hardware input is ignored and this frame is used (QA scripts, cinematics). */
  virtual: InputFrame | null = null;
  enabled = true;
  invertY = false;
  sensitivity = 1;
  /** Mouse wheel routes to zoom instead of throttle while true (telescopic vision). */
  wheelZooms = false;
  private zoomAccum = 0;

  private readonly target: HTMLElement | null;

  constructor(target: HTMLElement | null) {
    this.target = target;
    if (typeof window === 'undefined' || !target) return;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keysDown.clear());
    target.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      this.usingGamepad = false;
    });
    target.addEventListener(
      'wheel',
      (e) => {
        if (!this.pointerLocked) return;
        e.preventDefault();
        const step = Math.sign(e.deltaY);
        if (this.wheelZooms) this.zoomAccum -= step;
        else this.wheelAccum -= step;
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target;
    });
    window.addEventListener('gamepadconnected', () => (this.padConnected = true));
  }

  requestPointerLock(): void {
    if (!this.target || this.pointerLocked) return;
    try {
      const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore: pointer lock not available */
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (a === 'debug' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && this.pointerLocked)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.usingGamepad = false;
    this.setAction(a, down);
  }

  private onMouse(e: MouseEvent, down: boolean): void {
    const a: Action | null = e.button === 0 ? 'punch' : e.button === 2 ? 'heat' : null;
    if (!a) return;
    if (down && !this.pointerLocked) return;
    this.setAction(a, down);
  }

  private setAction(a: Action, down: boolean): void {
    if (down) {
      if (!this.keysDown.has(a)) {
        this.keysDown.add(a);
        this.pendingPressed.add(a);
        const last = this.lastPressTime.get(a) ?? -10;
        if (this.now - last < DOUBLE_TAP) this.pendingDouble.add(a);
        this.lastPressTime.set(a, this.now);
        this.heldSince.set(a, this.now);
      }
    } else {
      this.keysDown.delete(a);
    }
  }

  /** Release every held action (menu open, focus lost). */
  releaseAll(): void {
    this.keysDown.clear();
  }

  /** Called once per render frame: returns look delta in radians (yaw right +, pitch up +). */
  consumeLook(frameDt: number, padYawRate: number, padPitchRate: number, mouseScale: number): { dx: number; dy: number } {
    if (this.virtual || !this.enabled) {
      this.mouseDX = this.mouseDY = 0;
      return { dx: 0, dy: 0 };
    }
    const s = mouseScale * this.sensitivity;
    let dx = this.mouseDX * s;
    let dy = -this.mouseDY * s;
    this.mouseDX = this.mouseDY = 0;
    dx += this.padLookX * padYawRate * frameDt * this.sensitivity;
    dy += this.padLookY * padPitchRate * frameDt * this.sensitivity;
    if (this.invertY) dy = -dy;
    return { dx, dy };
  }

  private pollGamepad(): { mx: number; my: number; buttons: boolean[] } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) pad = p;
    if (!pad) return null;
    this.padConnected = true;
    const dz = (v: number, d = 0.16) => {
      const a = Math.abs(v);
      if (a < d) return 0;
      const n = (a - d) / (1 - d);
      return Math.sign(v) * n * n;
    };
    const mx = dz(pad.axes[0] ?? 0);
    const my = -dz(pad.axes[1] ?? 0);
    this.padLookX = dz(pad.axes[2] ?? 0, 0.12);
    this.padLookY = -dz(pad.axes[3] ?? 0, 0.12);
    const buttons = pad.buttons.map((b) => b.pressed || b.value > 0.4);
    if (mx !== 0 || my !== 0 || this.padLookX !== 0 || this.padLookY !== 0 || buttons.some((b) => b)) {
      this.usingGamepad = true;
    }
    return { mx, my, buttons };
  }

  /** Build the input frame for one fixed step. */
  sample(dt: number, out: InputFrame): InputFrame {
    this.now += dt;
    if (this.virtual) {
      const v = this.virtual;
      out.moveX = v.moveX;
      out.moveY = v.moveY;
      out.tierDelta = v.tierDelta;
      out.zoomDelta = v.zoomDelta;
      copySet(v.held, out.held);
      copySet(v.pressed, out.pressed);
      copySet(v.released, out.released);
      copySet(v.doubleTapped, out.doubleTapped);
      out.heldTime.clear();
      for (const [k, t] of v.heldTime) out.heldTime.set(k, t);
      out.usingGamepad = false;
      // One-shot edges are consumed.
      v.pressed.clear();
      v.released.clear();
      v.doubleTapped.clear();
      v.tierDelta = 0;
      v.zoomDelta = 0;
      for (const k of v.held) v.heldTime.set(k, (v.heldTime.get(k) ?? 0) + dt);
      for (const k of [...v.heldTime.keys()]) if (!v.held.has(k)) v.heldTime.delete(k);
      return out;
    }

    const pad = this.padConnected ? this.pollGamepad() : null;
    if (pad) {
      pad.buttons.forEach((down, i) => {
        const a = PADMAP[i];
        if (!a) return;
        const was = this.lastPadButtons[i] ?? false;
        if (down !== was) this.setAction(a, down);
      });
      this.lastPadButtons = pad.buttons;
    }

    const held = this.enabled ? this.keysDown : new Set<Action>();
    let mx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    let my = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0);
    if (pad && this.enabled && (Math.abs(pad.mx) > 0 || Math.abs(pad.my) > 0)) {
      mx = pad.mx;
      my = pad.my;
    }
    out.moveX = mx;
    out.moveY = my;
    out.tierDelta = this.enabled ? this.wheelAccum : 0;
    out.zoomDelta = this.enabled ? this.zoomAccum : 0;
    this.wheelAccum = 0;
    this.zoomAccum = 0;
    if (this.enabled) {
      if (this.pendingPressed.has('tierUp')) out.tierDelta += 1;
      if (this.pendingPressed.has('tierDown')) out.tierDelta -= 1;
    }
    copySet(held, out.held);
    copySet(this.enabled ? this.pendingPressed : new Set<Action>(), out.pressed);
    copySet(this.enabled ? this.pendingDouble : new Set<Action>(), out.doubleTapped);
    out.released.clear();
    for (const a of this.prevHeld) if (!held.has(a)) out.released.add(a);
    out.heldTime.clear();
    for (const a of held) out.heldTime.set(a, this.now - (this.heldSince.get(a) ?? this.now));
    this.prevHeld = new Set(held);
    this.pendingPressed.clear();
    this.pendingDouble.clear();
    out.usingGamepad = this.usingGamepad;
    return out;
  }
}

function copySet<T>(src: Set<T>, dst: Set<T>): void {
  dst.clear();
  for (const v of src) dst.add(v);
}

/** Helper for scripts: a mutable virtual frame with convenience setters. */
export class VirtualPad {
  frame: InputFrame = emptyFrame();
  hold(...actions: Action[]): void {
    for (const a of actions) {
      if (!this.frame.held.has(a)) {
        this.frame.held.add(a);
        this.frame.pressed.add(a);
        this.frame.heldTime.set(a, 0);
      }
    }
  }
  release(...actions: Action[]): void {
    for (const a of actions) {
      if (this.frame.held.has(a)) {
        this.frame.held.delete(a);
        this.frame.released.add(a);
      }
    }
  }
  tap(a: Action): void {
    this.frame.pressed.add(a);
    this.frame.released.add(a);
  }
  doubleTap(a: Action): void {
    this.frame.pressed.add(a);
    this.frame.doubleTapped.add(a);
  }
  move(x: number, y: number): void {
    this.frame.moveX = x;
    this.frame.moveY = y;
  }
  tier(delta: number): void {
    this.frame.tierDelta += delta;
  }
  clear(): void {
    this.frame = emptyFrame();
  }
}
