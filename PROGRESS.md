# PROGRESS

Gate checklist (spec 13). A gate passes only when every check passes and evidence is saved.

## Gate 0 — Bootstrap
- [x] Docs split: `CLAUDE.md`, `docs/spec/*`, `PROGRESS.md`, `DECISIONS.md`
- [x] Vite + TS (strict) + Three scaffold
- [x] `src/tuning.ts` + `?debug` lil-gui panel
- [x] QA harness (`npm run qa -- --smoke` writes `qa/shots/smoke.png`, zero console issues)
- [x] Vitest (`npm test`: 22 passing incl. flight integrator acceptance 7.8.1)
- [x] `npm run dev` serves cleanly
- **PASSED** — evidence `qa/shots/smoke.png`

## Gate 1 — Flight slice
- [ ] Greybox hero on the real rig + Verlet cape
- [ ] Flight model 7.1–7.4 (tiers, heading rate limit, bank, barrel roll, power-dive, brake, takeoffs, leap, landings)
- [ ] Camera 7.5 (spring arm, tier FOV/distance, FOV kick, collision)
- [ ] Speed sensation 7.6 (streaks, CA, vignette, motion blur, wind quads, near-miss, sonic boom, surface FX, clouds)
- [ ] Sky + cloud deck + ground plane with scale props
- [x] 7.8.1 vitest flight integrator tests (tiers ±15%, overshoot ≤3%, frame-rate identical, no tunnelling at 6,000 m/s)
- [ ] 7.8.2 scripted flights + critiques
- [ ] 7.8.3 10-second test

## Gate 2 — Hero & entry flow
- [ ] Final hero mesh (SDF bake), suit materials, emblem, belt, boots, face, hair
- [ ] Hero gallery `?hero` + mismatch list empty
- [ ] Main menu (5.1) + 3 aspect screenshots
- [ ] Play sequence (5.2) contact sheet matches storyboard
- [ ] Handoff (5.3)

## Gate 3 — Metropolis
- [ ] `data/landmarks.json`, `data/districts.json`
- [ ] Generator, streaming (workers), LOD L0–L3, water, 4 bridges, the Elevated
- [ ] Every landmark in 9.2 with silhouette + signage + discovery popup
- [ ] Day/night cycle
- [ ] `qa:landmarks`, skyline shots, timing test, budget during 5-min flight

## Gate 4 — Powers
- [ ] Heat vision · freeze breath · super breath · strength (grab/throw/punch/catch/locomotive/slam)
- [ ] Invulnerability + kryptonite/lead · X-ray · telescopic · scan · hearing · focus · solar charge
- [ ] Rescue actions · extras
- [ ] 8.11 captures for every power

## Gate 5 — Life & incidents
- [ ] Crowds (3 tiers), traffic, trains, ships, helicopters, birds, weather
- [ ] Incident Director + 14 incidents, results cards, headlines
- [ ] HUD 12.2

## Gate 6 — Polish
- [ ] Look targets 12.1 · audio 12.3 · perf pass · trailer captures · heap < 15% growth · zero console errors

## Gate 7 — Release
- [ ] README, CREDITS, settings completeness, `npm run build` static dist, final QA sweep
