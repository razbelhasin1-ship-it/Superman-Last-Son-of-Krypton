# QA critiques

One line per reviewed image: what is wrong → what will change. Newest first within each gate.

## Gate 0
- `qa/shots/smoke.png` — Renders clean (sky LUT, aerial haze, grid, canyon, pillars, trees, cars; 36 calls, 0.70 M tris). Sky reads slightly grey/desaturated and sun light feels weak; ground grid lines too strong at 100 m → revisit exposure/grade and grid weights during gate-1 look pass.
- (pre-fix) `qa/shots/smoke.png` — fully black: atmosphere LUT had NaN rows for downward rays (viewer exactly at the surface) → stable sphere intersection, clamped density heights, NaN guard, 25 km minimum haze path. Regression test in `tests/atmosphere.test.ts`.

## Gate 1 (flight slice) — iteration log
- `flight-power-launch` v3 — **good**: 0.25–1.2 s charge reads (crouch, FOV dip), explosive 3,240 km/h launch with ground shock; a full charge now holds speed until it clears the deck, the shock front punches a visible ring ~0.35 s ahead, the hero stays readable through a short wet wipe and bursts into clear sky at 4.4 s before easing off.
- `flight-power-launch` v2.5 — 1.2 s whiteout inside the deck: the launch speed decayed right at the cloud base and the hole opened after the camera was already in the mist → full-charge launches hold speed through the deck, hole punched with a 0.35 s lead, thin mist residue in the hole, explicit burst at the top.
- `flight-ten-second` v3 — **good**: from 1,800 m the dive reads instantly, canyon entry at 5.6 s (DASH), Mach 1 at 7.2 s with shock ring + vapour pulse, low supersonic run through the towers with strong parallax; hint banner sat on the hero → hints moved to the upper third.
- `flight-supersonic-3000` v3 — **good**: stable centred hero, sea of cumulus below, streaks + clouds whipping past give real speed at Mach 3; new tier FOVs feel wide without fisheye.
- `flight-supersonic-200` v3 — **good**: towers flash past at Mach 3, horizon steady, no wedges/NaNs; hero small at FOV 102 but readable; hint overlapped him → moved.
- `flight-brake-mach2` v3 — **good**: Mach 2 → hover in ≈2 s with a vapour burst, flip upright with arms out, cape swings forward then settles.
- `flight-dive-landing` v3 — **good**: head-first dive, debris + crater + shockwave on impact, hero-landing pose in the crater; crater bowl shading still flat (polish gate 6).
- `flight-cloud-flythrough` v3 — **good**: approach, wet wipe with mist streaks, burst out at the top into clean sky; full-res frames show no sky banding (only visible in downscaled thumbnails).
- `flight-canyon-cruise` v3 — **good**: 120 m/s through the canyon, steady framing, strong parallax, hero always readable against the facades.
- `flight-takeoff-lift` v4 — **good**: anticipation crouch, dust ring, smooth 6 m/s rise, lean leads the acceleration and the cape trails along his back through the pull-out (side-view probe: free edge stays ≤ 0.2 m above the hips instead of flipping to 1.8 m).
- `flight-takeoff-lift` v3.5 — side-view probe (`scripts/dev/scriptside.mjs`, `capeprobe.mjs`) showed the real fault: levelling out of the climb is a ≈ −9 g turn and the cape's fictitious-acceleration term flipped it over his head for 0.4 s → inertia across the airflow now fades with speed (`cape.accelPerpFade`), along-flow inertia kept for brake flare / boost surge; regression test `tests/cape-inertia.test.ts`.
- `flight-ten-second` v3.1 — Mach-1 vapour burst was a world-static opaque donut the camera ploughed through 15 ms later → particles inherit 90 % of the hero's velocity, thinner and translucent; the frame now shows a thin refracting shock ring.
- `flight-takeoff-lift` v3 — dust ring on lift-off and climb read well, but at 2.0–2.4 s the hero stays upright at 140 km/h with the cape standing up like a board (lean lagged speed) → lean now anticipates the requested speed (`flight.leanLeadSpeed`).
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

## In-game UI (spec 12.2, 7.1, 7.5)
- `qa/shots/ui-hud.png` — **good**: compass bar with incident marker + distance, Hope/Collateral top-right, district banner readable over bright sky (soft backing), landmark discovery card left; nothing over the hero.
- `qa/shots/ui-pause.png` — **good**: frozen, blurred world; PAUSED menu + Daily Planet front page (original masthead + globe glyph), tone-aware headline, briefs, hope/collateral.
- `qa/shots/ui-map.png` — **good** (test ground): top-down satellite render, north up, hero arrow; landmark/district labels wait for the city.
- `qa/shots/ui-photo.png` — **good**: free camera, golden filter, depth of field on the hero, compact panel at the bottom.
- v1 — Esc that resumed was re-queued as a pause press (menu listener runs before input's) → stale presses cleared on resume + 0.3 s pause-key cooldown.

