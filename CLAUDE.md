# SUPERMAN — METROPOLIS (fan project) · agent guide

Single-player open-world Superman game in the browser. TypeScript (strict) + Vite + Three.js WebGL2.
Full spec: `docs/spec/00-intro.md` … `docs/spec/15-final-deliverable.md` (verbatim master prompt).
**After any context compaction: re-read this file and `PROGRESS.md` first.**

## Non-negotiables
- Power fantasy is the test for every decision: most powerful *and* kindest being on Earth. Never kills.
- Original assets only (procedural geometry/textures/audio/music). No ripped film assets, no film music.
  Hero face is an ORIGINAL design (no real-person likeness). Emblem traced from `reference/suit-symbol.jpg`.
- Work autonomously. Ask the user only if: a required tool can't be installed, a decision changes
  the product, or a gate fails after 3 genuinely different attempts. Log every judgement call in `DECISIONS.md`.
- Commit at every gate as `gate N: <summary>` and tag `gate-N`. Update `PROGRESS.md` at every commit.
- Develop on branch `ccr-63ab4827-kgju1k`; push with `git push -u origin ccr-63ab4827-kgju1k`.

## Effort budget (higher row wins conflicts)
| # | Area | Share |
|---|---|---|
| 1 | Flight & movement feel (spec 07) | 30% |
| 2 | Powers & juice (spec 08) | 20% |
| 3 | Visual quality: hero, cape, Play sequence, light, sky, VFX, post (spec 05.2, 06, 12) | 20% |
| 4 | Metropolis scale, landmarks, streaming (spec 09) | 15% |
| 5 | Living world: NPCs, traffic, incidents (spec 10, 11) | 8% |
| 6 | Audio (spec 12.3) | 4% |
| 7 | Main menu & UI (one sitting) | 3% |

## Commands
- `npm run dev` — Vite dev server (open `/`, `/?debug` for lil-gui tuning, `/?hero` gallery, `/?seed=N`)
- `npm run typecheck` · `npm test` (vitest) · `npm run build` (static `dist/`)
- `npm run qa -- --smoke` — headless Chromium smoke screenshot → `qa/shots/smoke.png`
- `npm run qa -- --script <name>` — scripted flight/power capture (see `scripts/qa/`)
- `npm run qa:landmarks` — landmark audit + photo tour → `qa/landmarks/`
- `npm run bake:hero` — regenerate the hero GLB (SDF → marching cubes → skinned GLB)
- After each merge: `npm run typecheck && npm test && npm run qa`

## Conventions
- Units metres; Y up; −Z north; +X east; origin = Centennial Park centre.
- Fixed 60 Hz simulation with render interpolation (`src/core/loop.ts`). QA drives virtual time.
- Every feel number lives in `src/tuning.ts`; it is mirrored in the `?debug` lil-gui panel.
- Seeded RNG only (`src/core/rng.ts`); never `Math.random()` in world/gameplay code.
- Renderer-specific code stays in `src/render/` (WebGPU swap later).
- QA hook `window.__game` (`src/qa/hook.ts`): teleport, setTime, setWeather, setThrottle,
  setHeroState, runScript, stats, ready, advance(seconds), render().
- Allowed deps: three, postprocessing, n8ao, @dimforge/rapier3d-compat, lil-gui, vitest, playwright.
  Anything else → `DECISIONS.md` with a reason.

## Source map
- `src/core/` loop, input, rng, events, math helpers
- `src/flight/` hero controller + flight integrator (main agent owns)
- `src/camera/` chase/cinematic/first-person cameras (main agent owns)
- `src/render/` renderer, post, sky, clouds, materials, shader chunks
- `src/hero/` rig, mesh, cape cloth, pose graph
- `src/fx/` speed FX, sonic boom, particles, decals
- `src/world/` ground, city generator, streaming, LOD, water, landmarks
- `src/powers/` vision, breath, strength, senses, focus
- `src/life/` crowds, traffic, incidents · `src/audio/` procedural audio
- `src/ui/` menu, settings, HUD, map · `src/intro/` Play sequence + handoff
- `src/qa/` in-game QA hook & scripts · `scripts/` node bake + QA runners · `tests/` vitest
- `src/contracts.ts` module interfaces shared with subagents

## Gate status (details in PROGRESS.md)
0 Bootstrap · 1 Flight slice · 2 Hero & entry · 3 Metropolis · 4 Powers · 5 Life & incidents · 6 Polish · 7 Release

## Verification loop (spec 14)
After any visual/camera change: run QA, `Read` the screenshots, write a one-line critique per image in
`qa/critiques.md`, fix, recapture. Contact sheets in `qa/sheets/`. Zero console errors in QA runs.
Report `stats()` with any performance claim. Software GL in CI container → counter budgets
(≤ 2,500 draw calls, ≤ 8 M triangles).
