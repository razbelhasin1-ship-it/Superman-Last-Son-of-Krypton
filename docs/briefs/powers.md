# Brief: POWERS + PHYSICS (gate 4)

Owner directories: `src/powers/`, `src/physics/` (new), plus `scripts/qa/tasks/powers.mjs`,
`tests/powers-*.test.ts`, `qa/shots/power-*.png`. Spec: `docs/spec/08-powers.md` (all of it), 7.1
(bindings), 6.5 (stances), 11.2 (non-lethal, hope/collateral), 12.2 (HUD feedback).

## Contract
`src/powers/index.ts` exports `createPowers(host: PowersHost): PowersSystem` (types in
`src/contracts.ts`). The main agent calls `step(dt, worldDt, inputFrame)` every fixed step during play
and `frame(dt)` every rendered frame, and implements `setWorldTimeScale`, `addHope`, `addCollateral`.
Input actions already exist in `src/core/input.ts` (`heat` right mouse, `freeze` F, `breath` G,
`grab` E, `punch` left mouse, `xray` X, `telescope` Z, `hearing` H, `scan` V, `focus` Q, `overboost`
Shift for wide burst / inhale, `brake`+`heat` for the eyes-glow stare). Look at how `FxDirector`
(`src/fx/`) builds particles (`ParticleSystem`), screen shocks and ground FX — reuse them through
`host.fx` rather than duplicating. Hero hooks: `visual.registerPose(name, spec)`,
`visual.setActionPose(name, weight, mask)`, `visual.addPostPoseHook(fn)` (use it for two-bone IK on
grabs/catches), `visual.boneWorld('eye_L' | 'hand_R' | …, out)`. Camera: `rig.mode = 'firstPerson'`,
`rig.zoom` (telescopic 1×–40×). Speed-FX uniforms: `fx.speedFx.set('uHeat' | 'uDesat', v)`.

## Deliverables (each power COMPLETE: input, stance/animation, VFX, audio hook, world interaction, HUD
feedback, tuning numbers in your own `src/powers/tuning.ts`)
1. Physics (`src/physics/`): Rapier (`@dimforge/rapier3d-compat`, already a dependency) world for
   dynamic props — cars, buses, containers, crates, girders, boulders, debris — with a ground plane and
   fixed cuboids mirrored from the world's box colliders near the hero (stream them in/out by radius).
   `applyForce(origin, direction, strength, falloff)` (the shared impulse API from spec 8).
   A small prop spawner + a "standard targets" test yard on the gate-1 test ground (near x 300, z 200):
   parked cars, a bus, a glass wall, steel beams, a water edge (the lake), drones, a fire, a
   kryptonite shard, a lead-lined box.
2. Heat vision (precision beam, sweep, wide burst, overload after 2 s → one thick beam), eye glow
   lighting the face, impact heating orange→white, molten sparks, smoke, scorch decals, geometric
   cutting of beams/cars (pre-cut halves are fine), ignites flammables, one bounce off mirrored glass at
   shallow angles, safety rule: never harms civilians (dims and bends away from a person on the path).
3. Freeze breath (frost cone building over 1 s, ice sheets spreading on water — GPU mask is ideal,
   CPU-grown decals acceptable — freezing fires/vehicles/robots, frost on glass, slippery material),
   super breath (gust cone ramp 0→1 over 1.2 s, tap blast, Shift+G inhale→exhale scaled by charge,
   pushes props, topples/shoves pedestrians gently (stub interface), blows out fires, clears fog,
   bends trees, scatters birds), arctic gale (F+G).
4. Strength: grab (E, ≤ 8 m, IK grips, heavier objects cap speed: set `hero.speedCap`), throw with an
   arc preview + hit-stop + camera kick, three-hit punch combo, flying punch scaled by speed, Mach punch
   cone above 340 m/s, catch & hold of falling objects (auto-assist within 15 m), locomotive stop
   (stub a runaway train on rails in the yard), ground slam (power-dive + punch: 40 m shockwave).
   Care rule: objects slow and divert near people.
5. Invulnerability (bullet sparks/pings, explosions wash over), kryptonite (drain + desaturation +
   laboured breathing), lead (blocks X-ray/hearing).
6. Senses: X-ray (facades fade to outlines, interiors/people as luminous silhouettes, lead stays
   opaque — a screen-space or material-swap approach), telescopic (Z + wheel 1×–40×, reticle, LOD bias
   hint), scan/microscopic (V pulse revealing hidden items), super hearing (H: filter + 3D pings).
7. Super-speed focus (Q: world 0.15×, afterimages, desaturation, heartbeat, meter refilling over 6 s),
   solar charge (recharges above the cloud deck in sun; emblem glow via `visual.body?.setEmblemGlow`).
8. Rescue: carry (bridal/shoulder, cap CRUISE), catch (assisted, slow-mo beat), shield (hold E).
   Extras: thunderclap, flying tackle, grapple-and-throw, eyes-glow stare, hover-photo pose.
9. HUD feedback: register a small HUD layer of your own (DOM, `src/powers/hud.ts`) for meters
   (solar arc, focus), adaptive crosshair per power and vision overlays (X-ray tint, telescope reticle,
   hearing waveforms). Keep it subtle and consistent with `src/ui/Hud.ts`.
10. QA (8.11): `npm run qa -- --powers` stages a standard target per power, triggers it via a virtual
   pad, captures 3 frames (start, peak, aftermath) → `qa/shots/power-<name>-{1,2,3}.png` + a one-line
   critique each. Each must read as spectacular in a single still.

Integration: you may add ONE line to `src/game/Game.ts` constructor creating your system and one line
each in `step`/`frame` calling it, guarded by `this.state === 'play'` — or, preferably, leave Game
untouched and document the exact lines in your report. To run your QA before integration, create
`src/powers/sandbox.ts` routed by `?powers` (one route line in `src/main.ts` is allowed) that boots
the existing Game in play mode on the test ground and attaches your system.
