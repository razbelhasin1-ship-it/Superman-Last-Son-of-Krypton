## 13. Build order and gates

Work the gates in order. A gate is passed only when **every** check beneath it passes and the evidence is saved. Update `PROGRESS.md`, commit and tag `gate-N`.

| Gate | Build | Passes when |
|---|---|---|
| **0 Bootstrap** | Vite + TypeScript + Three scaffold; docs split (section 3); `tuning.ts` and debug panel; QA harness; Vitest. | `npm run dev`, `npm test` and `npm run qa -- --smoke` run clean and write one screenshot. |
| **1 Flight slice** | Greybox hero with working cape, full flight model (7.1 – 7.6), camera, sky and clouds, a ground plane with scale props, sonic boom, takeoff, leap and landing, speed FX. | All of 7.8 passes, with the scripted-flight critiques written. |
| **2 Hero and entry flow** | Final hero (section 6), main menu (5.1), Play sequence (5.2) and handoff (5.3) over a placeholder skyline. | The hero gallery list is empty (6.5); the 5.2 contact sheet matches the storyboard; the menu screenshots exist. |
| **3 Metropolis** | Layout, generator, streaming, LODs, water, four bridges, every landmark in 9.2, day/night cycle. | 9.4 passes: landmark audit, skyline shots, timing test; budgets in section 4 hold during a 5-minute scripted flight. |
| **4 Powers** | Every power in section 8 integrated with world physics. | 8.11 passes for every power. |
| **5 Life and incidents** | Crowds, traffic, ambient machines, weather (section 10); Incident Director and the 14 incidents (section 11); HUD (12.2). | Each incident can be started by a QA script, solved by at least two different powers, and produces its results card and headline. |
| **6 Polish** | Look targets (12.1), audio (12.3), performance pass. | A 10-second muted capture of each of these looks like a trailer shot: takeoff, supersonic city crossing, heat-vision rescue, freeze-breath harbour, night skyline. Heap grows < 15% over 5 minutes of flying. Zero console errors. |
| **7 Release** | README, CREDITS, settings completeness, production build, final QA sweep; stretch: the finale set piece. | `npm run build` produces a static `dist/` that runs from any static host; the README documents controls and QA commands. |

After gate 6, spend remaining effort on a **feel pass**: fly for ten minutes with fresh eyes (scripted and by inspection of recordings), write the five things that feel worst, and fix them. Repeat three times.
