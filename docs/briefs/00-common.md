# Common rules for every module owner (read first)

You own ONE directory under `src/` (named in your brief). The main agent owns integration
(`src/game/Game.ts`), `src/contracts.ts`, `src/tuning.ts`, flight (`src/flight/`), camera
(`src/camera/`), `src/render/` and `src/fx/`. **Do not edit files outside your directory** except
the exact extra paths your brief allows (scripts, data, tests, public assets). If you need an
integration hook, export one function from your module and describe the call in your final report.

Read before coding: `CLAUDE.md`, `docs/spec/` sections named in your brief, `src/contracts.ts`.

## Engineering conventions (non-negotiable)
- TypeScript strict, **erasable syntax only** (no enums, no parameter properties, no namespaces);
  import local files with explicit `.ts` extensions (Node runs bake scripts natively).
- Units metres; Y up; −Z north; +X east; origin = Centennial Park.
- Seeded RNG only (`src/core/rng.ts`: `Rng`, `hash3i`, `fbm2`); never `Math.random()` in world/gameplay.
- Rendering: `WebGLRenderer` with **logarithmic depth buffer**. Every custom `ShaderMaterial` must
  include `#include <logdepthbuf_pars_vertex>` / `<logdepthbuf_vertex>` and the fragment pair, or it
  will depth-test incorrectly. Materials that should fade into the sky must set `fog: true` and include
  `#include <fog_pars_vertex>`, `<fog_vertex>` (needs a `mvPosition` variable), `<fog_pars_fragment>`,
  `<fog_fragment>`, and call `injectAtmo(uniforms)` from `src/render/atmosphere.ts`.
  To patch built-in materials use `patchMaterial(mat, key, fn)` from `src/render/materials.ts`.
- **Never draw giant triangles** (> a few hundred metres) with interpolated world positions: float32
  varying interpolation breaks (we hit this with a 90 km ground quad). Tessellate, or follow the camera.
- **Guard every division/`exp`/`pow`/`sqrt` in shaders** against negative or zero arguments: a single
  NaN UV in a post effect smears a flat "sheet" across the screen (we hit this in the speed FX).
- Budgets: ≤ 2,500 draw calls and ≤ 8 M visible triangles in any view (`__game.stats()`).
- No new runtime dependencies (allowed: three, postprocessing, n8ao, @dimforge/rapier3d-compat,
  lil-gui). Dev-only tooling must be justified in your report.
- Tests: `vitest` files under `tests/` named `<module>-*.test.ts`.
- QA: `scripts/qa/run.mjs` (headless Chromium + SwiftShader, virtual time). Add your own task as
  `scripts/qa/tasks/<name>.mjs` (default export receives `{ root, browser, server, openGame, shot,
  contactSheet, opt, flag, issues, ensureDir }`), run with `npm run qa -- --<name>`.
  Software GL is slow: prefer 960×540 or 1280×720 captures. Zero console errors/warnings allowed.
- **Look at your own screenshots** (Read the PNGs), write one-line critiques in your report, iterate.
- Do not commit or push; the main agent reviews, merges and commits.

## Definition of done
`npm run typecheck && npm test` pass; your QA task runs clean; your report lists: files created,
public API, integration call(s) for the main agent, screenshots (paths) with critiques, known issues.
