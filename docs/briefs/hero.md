# Brief: HERO — final model, suit, face, hair, gallery (gate 2)

Owner directory: `src/hero/` (plus `scripts/bake/`, `public/assets/hero*`, `src/hero/*.json`,
`scripts/qa/tasks/hero.mjs`, `tests/hero-*.test.ts`). Spec: `docs/spec/06-hero-suit.md` (all of it),
`docs/spec/05-entry-flow.md` (the Play sequence frames the face at ≈ 2 m — it must hold up).
References: `reference/suit-full.jpg`, `reference/suit-symbol.jpg`, `reference/play-sequence-storyboard.png`
(Read all three). The face in the storyboard is for framing only: the hero's face is an ORIGINAL
design (handsome, calm, kind eyes, dark hair with the forehead curl) — no real person's likeness.

## What exists
- `src/hero/skeleton.ts`: 65-bone rig, A-pose rest, identity rest rotations, model space
  (feet at origin, faces +Z, left = +X), height 1.91 m. Keep bone names/positions stable.
- `src/hero/pose.ts`, `poses.ts`: procedural pose specs → local quats, springs, blending.
- `src/hero/HeroVisual.ts`: builds `Bone`s, blends poses, runs the cape (`Cape.ts`), currently attaches a
  greybox (`GreyboxBody.ts`). Public API used by the game (keep it): `root`, `model`, `bones`, `cape`,
  `step(hero, dt)`, `frame(alpha)`, `snap(hero)`, `boneWorld(name, out)`, `setPoseOverride(name)`,
  `poseNames`, `lookYaw`, `lookPitch`, `jaw`, `breathRate`, `breathAmp`, `gravityOn`, `override`.

## Deliverables
1. **Emblem trace**: a script (Playwright canvas, no image libs) that traces `reference/suit-symbol.jpg`
   into vector paths — outer shield, inner red field, the two gold S wedges — saved as
   `src/hero/emblemPath.json` (normalised coordinates). Build the emblem as an extruded, bevelled mesh
   (gold border, red field, gold wedges, slightly raised, carries the suit micro-pattern).
2. **Body bake** (`npm run bake:hero` → `scripts/bake/hero.ts`, Node-native TS): SDF primitives with
   smooth union (heroic V-taper, pecs, abs, lats, deltoids, arms, glutes, quads, calves, hands and
   fingers matching the rig's finger bones), marching cubes ≥ 192³ (narrow band is fine), weld + Taubin
   smoothing, normals, region classification (suit blue / trunks red / boots red / skin), UVs, skin
   weights by smoothed bone-capsule distance (4 influences), GLB writer (write your own minimal GLB
   writer — no GLTFExporter in Node). Head baked separately at higher resolution (skull, brow, nose,
   cheekbones, lips, chin, jaw that opens on the `jaw` bone, ears, eye sockets), eyelids on `lid_*`
   bones. Output `public/assets/hero.glb` (+ head file if separate). Commit-size sane (< 6 MB total).
3. **Runtime body** `src/hero/HeroBody.ts`: load the GLB, bind to HeroVisual's existing `Bone`s by name,
   implement the `HeroBody` contract in `src/contracts.ts` (blink, eye glow, gaze, smile, emblem glow).
   Materials (procedural, no textures from disk except generated ones):
   - Suit: cobalt `#074091` lit / `#073378` shade under neutral light (re-sample the reference with a
     script and log the values), matte-satin, fine micro-dimple/knurl normal pattern visible at 2 m,
     raised panel seams (shoulder yoke, bicep/forearm lines, two curved chest-to-belt seams flanking the
     sternum, side rib lines, knee panels) with a faint sheen.
   - Rounded V-neck collar band. Red trunks over blue leggings just below the belt (crimson, slight sheen).
   - Belt: ≈ 5 gold rectangular plates across the front separated by dark-red strap tabs, no pouch;
     gold `#f9cb3f` lit, `#d4861e` shade, `#f7eba3` highlights.
   - Boots: red, mid-calf, slightly flared, folded top cuff, matte.
   - Skin: wrap lighting + subtle subsurface approximation. Eyes: sclera, iris with depth, wet
     specular, tiny parallax; blinking lids; brows; lips. Hair: layered strand cards with anisotropic
     specular, forehead curl, spring-bone-like secondary motion (driven from head motion).
   Replace the greybox in `HeroVisual` (keep greybox as fallback if the GLB fails to load). Keep the
   cape simulation; you may improve its look (collar stand, sheen, folds) without changing its API.
4. **Gallery** `?hero`: turntable (front, three-quarter, side, back) + every pose in `POSES`
   (+ add missing ones from spec 6.5 if you can: carry bridal/shoulder, lift-heavy, punch combo, throw,
   catch, heat-vision stance, breath stances, X-ray scan stance) with the reference images beside it.
   You may add `src/hero/gallery.ts` and have `main.ts` route `?hero` to it — that one-line routing
   change in `src/main.ts` is allowed. QA task `scripts/qa/tasks/hero.mjs` → `qa/shots/hero-*.png`.
5. Compare your renders with the references after every change; write the mismatch list
   (colour, proportion, seam placement, emblem shape, belt, boots, cape length) and fix until empty.
   Also produce `qa/shots/hero-face.png` at the Play-sequence framing (FOV 20°, ≈ 2 m, head + upper chest).

Silhouette must read as Superman from 300 m (cape, shoulders, emblem colour block). Performance: hero
≤ 120 k triangles total, ≤ 12 draw calls.
