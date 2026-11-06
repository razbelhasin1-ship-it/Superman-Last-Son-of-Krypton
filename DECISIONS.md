# DECISIONS

One line per judgement call (date · area · decision · reason).

- 2026-11-06 · process · The master prompt is treated as the approved written spec; no approval stops (user instruction).
- 2026-11-06 · references · `reference/` did not exist; created it from the three images attached to the task (emblem, full suit, storyboard).
- 2026-11-06 · hero pipeline · `blender` is not on PATH → spec option 2: SDF primitives + smooth union → marching cubes (≥192³) → skinned GLB from a Node bake script.
- 2026-11-06 · tooling · Pin `playwright@1.63.0` to match the pre-installed Chromium build in `/opt/pw-browsers` (no browser download possible/needed).
- 2026-11-06 · QA · Captures run in *virtual time*: the harness advances the fixed 60 Hz sim explicitly, so frame sequences are deterministic even under slow software GL.
- 2026-11-06 · QA · Image analysis (emblem tracing, colour sampling, contact sheets, perceptual diffs) runs inside headless Chromium canvases — no extra image libraries.
- 2026-11-06 · controls · Space on the ground: tap = hover-lift takeoff, hold = power-launch charge; while sprinting = run-up takeoff; while crouched (Ctrl/C held) tap = 12 m hop, hold = super-leap charge. Resolves the spec's overlapping Space bindings.
- 2026-11-06 · cape · Cloth is simulated in the hero's local frame with fictitious forces and a saturating relative-wind model, so it stays stable from 0 to 6,000 m/s.
- 2026-11-06 · clouds · Cumulus deck = layered lit sprite clusters (spec-allowed option) rather than raymarching: works from above/below/inside and stays affordable under software GL.
- 2026-11-06 · sky · Single-scattering atmosphere baked into an equirect LUT on sun change, sampled by sky dome + fog (aerial perspective); analytic Preetham-style fallback.
- 2026-11-06 · render · n8ao 2.0.1 half-res mode uses an MRT shim incompatible with three r187 (crash in setupRenderTarget) → AO always runs full-res.
- 2026-11-06 · git · Tag pushes are refused by the git proxy (only the session branch may be pushed); gate tags `gate-N` are created locally and gate commits are identifiable by their `gate N:` subject.
- 2026-11-06 · camera · Tier camera distances reduced ~35% from the spec's starting table (6/7.5/9/10.5/12/14/16 → 4.3/4.7/5.3/5.9/6.6/7.4/8.2 m) and the arm height is applied along the camera-local up axis: a prone hero seen end-on at 9 m read as a 3% speck; now his back and streaming cape read clearly.
- 2026-11-06 · fx · Render-time FX timers advance by simulation time since the last rendered frame (identical in play; correct under virtual-time QA).
- 2026-11-06 · flight · Vertical power launches may go supersonic at ground level but do not add collateral (shock cone points skyward); horizontal low-altitude supersonic flight still does.
