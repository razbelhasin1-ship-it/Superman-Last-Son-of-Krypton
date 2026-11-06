## 14. Verification loop (applies to every gate)

You cannot feel the game, so you **look at it**:

1. After any visual or camera change, run the relevant QA script, then `Read` the resulting screenshots. Look for: hero silhouette readability, wrong colours, clipping, z-fighting, shimmering, pop-in, camera snaps, UI overlap, empty or flat areas.
2. Write a one-line critique per image in `qa/critiques.md` (what is wrong, what you will change). Fix, recapture, and re-read, at least twice for hero shots, takeoff, supersonic, skyline and each landmark.
3. Build contact sheets (`qa/sheets/*.png`) to review sequences and reference comparisons side by side.
4. Keep deterministic golden screenshots (fixed seed, fixed time) and run perceptual diffs so regressions are caught; update goldens only for intentional changes.
5. Zero console errors or warnings in any QA run. Report `stats()` (draw calls, triangles, frame ms, chunks) alongside each performance claim.
6. When a gate fails three times with genuinely different approaches, stop and report to the user with the evidence.
