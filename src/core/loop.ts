/**
 * Fixed-step simulation loop with render interpolation.
 * The simulation always advances in exact 1/60 s steps, so results are identical regardless of
 * the display frame rate. QA drives `advance()` directly (virtual time) for deterministic captures.
 */
export class FixedLoop {
  readonly dt: number;
  accumulator = 0;
  simTime = 0;
  steps = 0;
  /** Upper bound of real time consumed per frame (prevents the spiral of death). */
  maxFrameTime = 0.1;

  private readonly stepFn: (dt: number) => void;
  private readonly renderFn: (alpha: number, frameDt: number) => void;

  constructor(stepFn: (dt: number) => void, renderFn: (alpha: number, frameDt: number) => void, hz = 60) {
    this.stepFn = stepFn;
    this.renderFn = renderFn;
    this.dt = 1 / hz;
  }

  /** Consume real elapsed time, run whole steps, then render with the leftover fraction. */
  frame(realDt: number): void {
    this.accumulator += Math.min(Math.max(realDt, 0), this.maxFrameTime);
    while (this.accumulator >= this.dt) {
      this.stepFn(this.dt);
      this.accumulator -= this.dt;
      this.simTime += this.dt;
      this.steps++;
    }
    this.renderFn(this.accumulator / this.dt, realDt);
  }

  /** Run exactly n steps (no rendering). */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) {
      this.stepFn(this.dt);
      this.simTime += this.dt;
      this.steps++;
    }
  }

  /** Virtual time: advance by `seconds` (rounded to whole steps), then render once. */
  advance(seconds: number, render = true): void {
    const n = Math.max(0, Math.round(seconds / this.dt));
    this.accumulator = 0;
    this.runSteps(n);
    if (render) this.renderFn(0, this.dt);
  }
}

/** Pure helper used by tests: feed a sequence of frame times, count steps taken. */
export function simulateFrames(frameTimes: readonly number[], hz: number, step: (dt: number) => void): number {
  let steps = 0;
  const loop = new FixedLoop(
    (dt) => {
      step(dt);
      steps++;
    },
    () => {},
    hz,
  );
  for (const t of frameTimes) loop.frame(t);
  return steps;
}
