# QA critiques

One line per reviewed image: what is wrong → what will change. Newest first within each gate.

## Gate 0
- `qa/shots/smoke.png` — Renders clean (sky LUT, aerial haze, grid, canyon, pillars, trees, cars; 36 calls, 0.70 M tris). Sky reads slightly grey/desaturated and sun light feels weak; ground grid lines too strong at 100 m → revisit exposure/grade and grid weights during gate-1 look pass.
- (pre-fix) `qa/shots/smoke.png` — fully black: atmosphere LUT had NaN rows for downward rays (viewer exactly at the surface) → stable sphere intersection, clamped density heights, NaN guard, 25 km minimum haze path. Regression test in `tests/atmosphere.test.ts`.

## Gate 1 (flight slice) — iteration log
- `flight-takeoff-lift` v1 — camera orbits below a prone hero when pitching up (reads as flying on his back) → arm height along camera-local up; look-ahead moved to aim.
- `flight-canyon-cruise` v1 — hero absent: look-ahead (12 m) pushed the arm pivot ahead of a 9 m arm, camera ended up in front of the hero → look-ahead now steers the aim only.
- `flight-supersonic-3000` v1 — camera inside the hero at 1,000 m/s (same look-ahead bug) → fixed.
- `ground` (smoke) — hero shadow drawn near the camera; ground flat grey at 640×360 → 90 km two-triangle ground quad broke float32 varying interpolation → camera-following radial ground mesh.
- `ao-on` — n8ao never switched to log depth (config proxy ignores depthBufferType) → passes rebuilt explicitly.
- `flight-takeoff-lift` v2 — cape slid off his back to one side after the body yawed → soft shape matching toward the draped pose, lower rotation inertia.
- `flight-power-launch` v2 — washed-out frames: render-time FX timers advanced 1/60 s per rendered frame under virtual time → FX now advance by simulation time; vertical launches no longer count as careless booms; full charge now punches a hole + ring through the cloud deck.
- `flight-supersonic-200` / `ten-second` v2 — flat coloured wedges after Mach 1 → supersonic-wake term produced NaN UVs (negative Gaussian width behind the hero; tail point projected from behind the camera) → guarded + view-space wake direction.
- `flight-ten-second` v2 — vapour cone visible permanently at DASH (340 m/s sits in the transonic band) → cone is now an event pulse on Mach crossings + faint pre-boom build-up.
- `flight-brake-mach2` v2 — script kept thrusting before the brake; constant decel felt sluggish from Mach 2+ → script coasts; brake decel gains a speed-proportional term (still ≈0.5 s from cruise, ≈1.4 s from Mach 1 per tests).
- `flight-dive-landing` v2 — dive reads correctly (head-first, cape over the back), crater + debris + shockwave work; debris chunks were oversized → shrunk; crater bowl reads flat (polish gate).
- `flight-cloud-flythrough` v2 — cumulus looks great on approach, whiteout inside works; climb too shallow to break out → steeper aim.
