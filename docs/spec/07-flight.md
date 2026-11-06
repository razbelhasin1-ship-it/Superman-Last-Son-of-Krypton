## 7. Flight and movement: the heart of the game

If one thing in this project must feel **tight**, effortless and thrilling, it is this. Prototype it first (gate 1) and keep returning to it.

### 7.1 Controls

| Action | Keyboard + mouse | Gamepad |
|---|---|---|
| Look / steer | Mouse | Right stick |
| Move, thrust forward / back | W / S | Left stick Y |
| Strafe, bank | A / D | Left stick X |
| Jump · charge super-leap · take off · ascend | Space (tap / hold) | A |
| Descend · crouch · power-dive (double-tap) | Ctrl or C | B |
| Throttle tier up / down | Mouse wheel | D-pad up / down |
| Overboost (+1 tier while held) | Shift | Left trigger |
| Hover-brake (graceful stop) | R | Y |
| Punch / strike; hold and release to throw | Left mouse | Right trigger |
| Grab / carry / interact | E | X |
| Heat vision (hold) | Right mouse | Right bumper |
| Freeze breath (hold) | F | Power wheel, then hold left bumper |
| Super breath (hold) | G | Power wheel, then hold left bumper |
| X-ray vision (toggle) | X | Power wheel |
| Telescopic vision (hold, wheel zooms) | Z | Power wheel |
| Super hearing (hold) | H | Power wheel |
| Scan / microscopic vision (toggle) | V | Power wheel |
| Super-speed focus: slows the world (hold) | Q | Power wheel |
| Map · pause · photo mode · debug | M · Esc · P · F1 | View · Menu · — · — |

The gamepad **power wheel** opens on right-stick click and slows time to 0.2×. Show the complete mapping on the Controls screen. Provide a flight-assist toggle ("auto-cruise": hold the current throttle tier without holding W).

### 7.2 Speed tiers

Throttle tier is chosen with the wheel; W thrusts toward that tier, Shift adds one tier temporarily. Every number below is a **starting value** in `tuning.ts`; tune by feel.

| Tier | Speed (m/s) | Meaning | Reached from previous in | FOV | Camera distance |
|---|---|---|---|---|---|
| 0 HOVER | 0 – 6 | Upright, floaty | — | 62° | 6 m |
| 1 GLIDE | 6 – 40 | Graceful lean | 0.5 s | 66° | 7.5 m |
| 2 CRUISE | 40 – 120 | Default W (≈ 430 km/h): street-canyon flying | 0.8 s | 72° | 9 m |
| 3 DASH | 120 – 340 | Exhilarating, still controllable | 1.0 s | 82° | 10.5 m |
| 4 SUPERSONIC | 340 – 1,000 | Mach 1–3, vapour cone and boom | 1.5 s | 98° | 12 m |
| 5 BULLET | 1,000 – 2,400 | **Faster than a speeding bullet** | 2.0 s | 110° | 14 m |
| 6 BURST | up to 6,000 for ≤ 2.5 s, 8 s cooldown | Crosses the whole city in ≈ 2 s; tunnel-vision streaks | 0.6 s | 120° | 16 m |

HUD shows speed in km/h and Mach. Use exponential easing for every speed change, `v += (vTarget − v) · (1 − e^(−k·dt))`, with `k` set per tier from the table. Linear acceleration feels dead.

### 7.3 Control model and body orientation

- **Camera-relative flight.** The mouse steers the camera freely; W thrusts along the camera's forward vector. The hero's heading follows the camera with a **rate limit that falls with speed**: ≈ 220°/s at hover, 90°/s at cruise, 45°/s at Mach 1, 20°/s at bullet. This gives long, elegant arcs and keeps fast flight controllable.
- **Body pitch by speed:** upright below 6 m/s, leaning forward 0° → 60° through glide, fully prone from cruise. Cruise pose: one fist forward, the other arm along the body. Dash and above: both fists forward, legs together, toes pointed.
- **Bank:** roll = clamp(k · turnRate · speedFactor, ±75°) through a damped spring, with the legs lagging the torso slightly. The camera rolls by only ≈ 35% of the hero's roll. A comfort setting offers a stable-horizon camera.
- **Barrel roll** on a double-tap of A or D. **Power-dive** on a double-tap of Ctrl: steep descent that converts altitude to speed.
- **Brake (S or R):** from cruise to hover in ≈ 0.5 s, from Mach 1 in ≈ 1.5 s. Flare pose, cape flares forward, camera pulls in, a shock ring at supersonic speeds, dust at low altitude.

### 7.4 Takeoff, leap and landing

| Move | Behaviour |
|---|---|
| Hover-lift takeoff | Tap Space on the ground: 0.15 s anticipation crouch, then a smooth rise to ≈ 6 m/s. Dust ring, cape lifts. |
| Power launch | Hold Space to charge (0.25 – 1.2 s; camera dips, FOV narrows). Release: explosive launch at 200+ m/s, ground shockwave ring, cracked pavement decal, debris puff, camera whips up. A full charge punches a visible ring through the cloud deck. |
| Run-up takeoff | Press Space while sprinting: the body pitches into flight with no stop. |
| **Super-leap** ("leap tall buildings") | Tap = 12 m hop. Hold up to 1.5 s: apex 30 → 250 m on a graceful parabola. Press Space at the apex to transition into flight, or glide down. |
| Soft landing | Hover down, feet settle, cape drops with weight. |
| **Hero landing** | Impact speed above 40 m/s: three-point landing pose, radial shockwave, ground cracks, dust ring, camera shake, car alarms and window rattle nearby. Above 150 m/s: a 6 – 14 m crater with debris. |

### 7.5 Camera

- Third-person spring-arm with a 0.6 m shoulder offset (swappable) and 1.2 m height offset. Position lag ≈ 0.12 s, rotation lag ≈ 0.08 s, critically damped. Look-ahead = velocity × 0.15 s.
- FOV and distance follow the tier table, with a **+6° FOV kick** on every tier change that decays over 0.4 s.
- Camera collision: sphere-cast against building colliders; push in smoothly, never cut through geometry, never hold the hero occluded for more than 0.3 s.
- First-person view for vision powers. Photo mode (P) with free camera, depth of field and HUD hide.

### 7.6 Speed sensation

Build these as layers; each ramps with speed through smoothsteps:

- **Screen-space:** radial streak shader (from ≈ 150 m/s up), chromatic aberration at the frame edges, tightening vignette, camera motion blur (8 – 12 samples), 600 – 1,500 camera-space wind-streak quads.
- **Near-miss:** a spatial query detects buildings, cars, birds and poles passing within 6 m at speed. Trigger a whoosh with Doppler, a streak flick and a small camera nudge.
- **Sonic boom (Mach 1):** a Prandtl–Glauert vapour cone around the hero for ≈ 0.5 s through the transonic band, then an expanding shock-ring torus with refraction, a 2-frame hit-stop, and a layered boom (sub thump, crack, rumble tail) delayed ≈ 120 ms.
- **Surface interaction:** below 15 m over water, a V-shaped spray wake and mist; over ground, dust, swirling leaves and litter; passing pedestrians' clothes and hair flutter via a shader wind term.
- **Clouds:** flying through a cloud layer (≈ 1,500 – 2,500 m) produces mist streaks and a soft wipe, and a cinematic *burst* when breaking out of the top.
- **Supersonic wake:** a refractive air-ripple trail behind the hero.

### 7.7 World interaction at speed

- **Glancing contact** (< 35° incidence) slides with sparks and a camera scrape. **Frontal contact** with a glass curtain wall above 80 m/s shatters the pane in a spray of instanced shards with chimes. Solid structures do not collapse from flight contact; collapses belong to scripted incidents (section 11).
- **Sonic booms are felt.** Going supersonic below 300 m over the dense city cracks nearby window panes, sets off car alarms, scatters birds, and makes pedestrians flinch. It raises the *collateral* meter slightly and triggers a one-time tip ("Gain altitude before going supersonic"). A "Safe boom" setting disables the consequences.
- **Streaming at speed:** predict chunk loads along the velocity vector with a 3 s horizon, bias LODs coarser at high speed, and hide pop-in with atmospheric haze.

### 7.8 Flight acceptance (all must pass)

1. Unit tests (`vitest`) on the flight integrator: every tier reached within ±15% of its table time, no overshoot above 3%, identical results across frame rates (fixed step), and no tunnelling through a 1 m thick collider at 6,000 m/s (swept tests).
2. Scripted flights (`runScript`) record frame sequences at 5 Hz for: hover-lift takeoff, power launch, cruise through street canyons, supersonic crossing at 3,000 m altitude, supersonic at 200 m altitude, brake from Mach 2, power-dive and hero landing, fly-through of the cloud layer. Review each sequence yourself and write a one-line critique of camera stability, readability and sense of speed. Iterate until each critique reads "good".
3. **The 10-second test:** from control handoff, a player reaches the skyline, passes between two towers at DASH tier, and crosses Mach 1 within 10 seconds, with no hitch, snap or confusion.
