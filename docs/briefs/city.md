# Brief: METROPOLIS CORE — layout, terrain, water, roads, buildings, streaming, LOD (gate 3)

Owner directory: `src/world/` (except `TestGround.ts`; you may extend `collision.ts` compatibly), plus
`data/`, `scripts/qa/tasks/landmarks.mjs`, `scripts/qa/tasks/skyline.mjs`, `tests/world-*.test.ts`.
Spec: `docs/spec/09-metropolis.md` (all), `docs/spec/04-tech-stack.md`, 7.7 (streaming at speed),
12.1 (look), 10.3/10.4 (night lights only). Read `src/world/TestGround.ts`, `collision.ts`,
`radialGround.ts`, `src/render/atmosphere.ts`, `src/render/materials.ts` first.

## Contract
`export class City implements WorldLike` (see `src/contracts.ts`) in `src/world/City.ts`:
`new City(seed, opts: { detail: number })`, `group`, `collision` (a `BoxCollisionWorld` with a terrain
fn: land/water heights), `update(camPos, heroPos, heroVel, dt, time)` (streaming/LOD/water time),
`activeChunks()`, `landmarks`, `districts`, `districtAt(x, z)`, `setNight(n)`,
`whenStreamed(p, r)`, `spawn`. The main agent swaps `TestGround` for `City` in `Game.ts`.

## Deliverables
1. `data/districts.json`, `data/landmarks.json` generated from spec 9.2 (every row, slugs, tier,
   neighbourhood, (x, z), design intent, height, discovery radius, a suggested camera view).
2. Terrain + water masks from 9.1: land x −3,500…+3,400, z −4,200…+4,300; Hob's Bay east, river west
   (countryside beyond), the Narrows south, harbour inlet north-east, Stryker's Island (5,200, 1,800).
   Hazy distant countryside/ocean/mountain skyline cards out to 25 km. Gentle hills (Outlook Park).
   Ground shading in world space (roads, sidewalks, plazas, parks, beaches) — tessellated or
   camera-following like `radialGround.ts` (no giant triangles).
3. Road network: per-neighbourhood grid orientation + diagonal avenues + waterfront roads, lots,
   sidewalks, crossings, street furniture (instanced), trees, parks. Landmark footprints clear lots.
4. Buildings: district style tables (heights per 9.1 bands: Southside corporate 220–380, Centennial
   120–300, Uptown 80–200, Oak Town 10–35, slums 15–60; LexCorp 450 is a landmark). ONE uber facade
   shader on instanced meshes: base/shaft/crown, bays & floors as instance attributes, materials (glass
   curtain wall, brick, stone, concrete, metal), window grids with interior mapping in the near field,
   lit-window patterns at night (`setNight`), `fwidth` anti-aliasing so towers never shimmer, roof
   props (water tanks, HVAC, antennas, helipads, gardens), procedural signage text atlas.
   Buildings register OBB colliders (yaw) with `tag: 'chunk:<id>'` so they unload with their chunk;
   glass towers use `kind: 'glass'`.
5. Water: bay/river with Gerstner waves, depth tint, shoreline foam, piers. Tessellated/camera-following.
6. Streaming/LOD: 256 m chunks generated in Web Workers (module workers via
   `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`); L0 < 400 m full,
   L1 < 1,500 m simplified instances with the window shader, L2 < 6,000 m merged block impostors,
   L3 skyline cards beyond. Predict loads along the velocity vector with a 3 s horizon; coarser LOD at
   high speed; hide pop-in with haze. Pool buffers. Budgets: ≤ 2,500 calls, ≤ 8 M tris everywhere,
   including a 2 km-altitude skyline view. `whenStreamed` must resolve deterministically for QA.
7. **Landmark kit + registry** `src/world/landmarks/kit.ts` + `registry.ts`: a small authoring API that
   later landmark generators use (boxes, prisms, cylinders, domes, spheres, colonnades, setback towers,
   crowns, spires, signage text, lit glass, materials from the facade palette), batching into few draw
   calls and emitting colliders. Implement a FIRST batch yourself to prove the kit:
   Daily Planet (art-deco ≈ 210 m with a giant rotating illuminated globe), LexCorp Tower (450 m dark
   glass monolith with a crowning ring + lit signage on four faces), City Hall (domed Beaux-Arts),
   Centennial Park (meadows, pond, groves, bandstand). Every other landmark in 9.2 must at least have a
   placeholder massing with the right footprint/height and a name sign so the audit can pass; the
   main agent will hand detailed landmark generators to another module owner using your kit.
8. QA: `npm run qa -- --landmarks` (audit: every landmark exists in data + scene; photo tour into
   `qa/landmarks/<slug>.png`), `npm run qa -- --skyline` (2 km shots N/E/S/W at morning, noon, golden
   hour, night → `qa/skyline/`). Cross-city timing test (Racine → Stryker's Island per tier) as a vitest.
   Use `?world=city` to boot the city (add the route in your module; the main agent wires `Game.ts`:
   provide `createWorld(kind, seed, detail)` from `src/world/index.ts`).

Visual target: bright hopeful comic-book realism; vast layered skyline at 2 km; street canyons at
ground level; glass glints; it must feel enormous.
