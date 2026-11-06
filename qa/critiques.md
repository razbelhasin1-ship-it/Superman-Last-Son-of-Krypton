# QA critiques

One line per reviewed image: what is wrong → what will change. Newest first within each gate.

## Gate 0
- `qa/shots/smoke.png` — Renders clean (sky LUT, aerial haze, grid, canyon, pillars, trees, cars; 36 calls, 0.70 M tris). Sky reads slightly grey/desaturated and sun light feels weak; ground grid lines too strong at 100 m → revisit exposure/grade and grid weights during gate-1 look pass.
- (pre-fix) `qa/shots/smoke.png` — fully black: atmosphere LUT had NaN rows for downward rays (viewer exactly at the surface) → stable sphere intersection, clamped density heights, NaN guard, 25 km minimum haze path. Regression test in `tests/atmosphere.test.ts`.
