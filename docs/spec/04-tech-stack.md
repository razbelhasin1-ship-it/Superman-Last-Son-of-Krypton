## 4. Tech stack and architecture

- **Browser game.** TypeScript (strict), Vite, Three.js (latest stable from npm), `WebGLRenderer` on WebGL2. Keep all renderer-specific code inside `src/render/` so WebGPU can replace it later.
- **Allowed dependencies:** `postprocessing` (pmndrs), `n8ao`, `@dimforge/rapier3d-compat`, `lil-gui`, `vitest`, `playwright`. Any other runtime dependency goes into `DECISIONS.md` with a reason.
- **Procedural assets.** Geometry, textures, audio and music are generated in code (build-time bake scripts are fine). Third-party assets are allowed only if CC0, and are listed in `CREDITS.md`. This is a non-commercial fan project: original assets only, no ripped film assets, no copyrighted film music, an original typographic game title. The chest emblem is built faithfully from `reference/suit-symbol.jpg`.
- **Units and axes.** 1 unit = 1 metre. Y up, −Z = north, +X = east. Origin = centre of Centennial Park.
- **Simulation.** Fixed 60 Hz step with render interpolation. Every feel number lives in `src/tuning.ts` and appears in a live panel at `?debug` (lil-gui), grouped by system, so values can be tuned while flying.
- **Determinism.** Seeded RNG (`?seed=`). The same seed produces the same city, so screenshots are comparable across runs.
- **QA hook.** Expose `window.__game` with: `teleport(landmarkSlug | {x,y,z,yaw,pitch})`, `setTime(hour)`, `setWeather(name)`, `setThrottle(tier)`, `setHeroState(name)`, `runScript(name)`, `stats()` (draw calls, triangles, frame ms, active chunks), and a `ready` promise that resolves once the current view has fully streamed in.
- **Performance targets.** 60 fps at 1080p on a mid-range laptop GPU at *High*; at most 2,500 draw calls and 8 M visible triangles; Low/Medium/High/Ultra presets plus an adaptive resolution scaler. Measure with `stats()` and a real-GPU headed run (`channel: 'chrome'`, GPU flags on) when available; fall back to counter budgets when the machine only offers software GL.
