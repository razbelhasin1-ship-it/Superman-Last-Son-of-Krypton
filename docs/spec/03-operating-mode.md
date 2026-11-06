## 3. Operating mode

- **Step 0, before any game code.** Split this prompt into repo docs so it survives context compaction: `CLAUDE.md` (under 120 lines: priorities, budget table, commands, gate status, pointers to docs), `docs/spec/NN-<section>.md` (verbatim copies of each section), `PROGRESS.md` (gate checklist, updated at every commit), `DECISIONS.md` (one line per judgement call). After any compaction, re-read `CLAUDE.md` and `PROGRESS.md` first.
- **Decide, log, continue.** Ask the user only when (a) a required tool cannot be installed, (b) a decision changes the product, or (c) a gate still fails after three genuinely different attempts. Everything else goes into `DECISIONS.md`.
- **Vertical slice first.** The hero flying over a plain ground with a sky is built and polished before any city exists (gate 1).
- **Greybox, then juice.** Get the mechanic working with simple shapes, then add effects, sound and animation until it feels right. Every power ships complete: input, animation, VFX, audio, world interaction, tuning values. Placeholder stubs do not count as done.
- **Commit at every gate** with `gate N: <summary>`; tag the commit.
- **Parallelise after gate 1.** Define module contracts in `src/contracts.ts`, then hand independent modules to subagents, each owning one directory under `src/`: `hero/` (model, rig, cape, animation), `world/` (city generation, streaming, LOD), `powers/` (vision, breath, strength VFX), `life/` (crowds, traffic, incidents), `audio/`, `qa/`. The main agent integrates, runs `npm run typecheck && npm test && npm run qa` after each merge, and owns the flight controller and camera.
- **Keep the user informed** at each gate with two lines and the path of the best screenshot in `qa/shots/`.
