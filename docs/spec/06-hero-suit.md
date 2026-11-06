## 6. The hero and the 2025 film suit

Build Superman wearing the **2025 film suit** exactly as shown in `reference/suit-full.jpg` and `reference/suit-symbol.jpg`. Compare your render to those images after every change (6.5).

### 6.1 Suit specification

| Part | Specification |
|---|---|
| Body suit | Deep cobalt blue, matte-satin fabric. Lit ≈ `#074091`, shade ≈ `#073378` (sampled from the reference; re-sample with a script and match under neutral light). Fine **micro-dimple / knurl fabric pattern** in the normal map, clearly visible in the close-up of the Play sequence. |
| Panel seams | Raised seam lines: shoulder yoke, bicep and forearm lines, two curved chest-to-belt seams flanking the sternum, side-torso rib lines, knee panels. Seams catch light with a faint sheen. |
| Neck | Rounded V-neck collar with a slim collar band. |
| Trunks | Red trunks worn over the blue leggings, sitting just below the belt. Deep crimson with a slight sheen. |
| Belt | Gold, segmented rectangular plates (≈ 5 across the front) separated by dark-red strap tabs. No pouch. Gold ≈ `#f9cb3f` lit, `#d4861e` in shade, `#f7eba3` highlights. |
| Boots | Red, mid-calf, slightly flared with a folded top cuff, matte. |
| Cape | Deep crimson (deep oxblood in shade, ≈ `#46111d` – `#612d36`), long (down past the knees to the ankles), heavy fabric that drapes and flows. A small red collar stand sits at the shoulders. |
| Emblem | Pentagon shield: flat top, angled shoulders, rounded point at the bottom, wider than tall. Thin gold border, red field (≈ `#980b05` – `#c5320b`). The **gold S** is two gold wedges, an upper one sweeping across the top-right and a lower one across the bottom-left, separated by a thick red diagonal band. The emblem sits slightly raised and carries the same micro-pattern as the suit. Build it from a traced vector path of the reference, then extrude it with a bevel. |

### 6.2 Body, face and hair

- Height 1.91 m, ≈ 7.5 heads tall, broad shoulders, strong V-taper, athletic and heroic. Silhouette must read as Superman from 300 m away: cape, shoulders, emblem colour block.
- Face: an **original** design, handsome and calm, with kind eyes. Dark hair with the iconic forehead curl. Do not model any real person's likeness.
- The Play sequence frames the face at ≈ 2 m, so it must hold up there: wrap-lighting skin shader with a subtle subsurface approximation, layered eyes (sclera, iris with depth, wet specular, tiny parallax), eyelids that blink, brows, lips, and a jaw that opens for the subtitle line. Hair as layered strand cards with anisotropic specular and spring-bone secondary motion.

### 6.3 Character pipeline (pick the first that works, log the choice)

1. If `blender` is on the PATH, script the character in Blender Python (metaball or skin-modifier base, subdivision, sculpted detail, armature, automatic weights, baked normal maps) and export GLB.
2. Otherwise generate the body from smooth signed-distance primitives (capsules, ellipsoids, muscle blobs) with a smooth-union, polygonise with marching cubes at ≥ 192³, relax and smooth-shade, project UVs, skin to the skeleton by smoothed bone-distance weights, and write GLB from a Node script.
3. A CC0 base mesh (for example a MakeHuman-style base) only as a last resort, listed in `CREDITS.md`.

Rig: ≈ 65 bones (spine ×4, neck, head, jaw, eyes, clavicles, arms, hands with fingers, legs, feet). Hands must pose convincingly as relaxed fists, flat blades and a forward-reaching fist.

### 6.4 The cape: the main visual language of speed

Simulate the cape as a **Verlet cloth**: ≈ 14 × 26 particles, pinned along the shoulders and upper back, with distance constraints, bend constraints, gravity (in hover and on the ground), wind from relative air velocity, drag, and collision against capsule proxies for torso, arms and thighs. Render double-sided PBR cloth with a sheen term and a fold normal map.

- Hover: gentle billow and sway.
- Cruise and above: streams straight back, with noise-driven flutter at 6–12 Hz that grows with speed.
- Speed changes: speed impulses travel down the cape as a wave (a visible *crack* when overboosting or crossing Mach 1).
- Brake: the cape flares forward past the legs, then snaps back and settles.
- Takeoff and landing: it lifts, then drops with weight.

### 6.5 Animation

Procedural pose graph on the rig with IK and spring dynamics. Poses and blends: ground idle, walk, run, super-sprint, crouch, charged-leap, hover-idle, glide, one-fist-forward cruise, both-fists-forward dash and supersonic, bank, brake-flare, takeoff variants, hero-landing, carry-person (bridal and shoulder), lift-heavy, punch combos, throw, catch, heat-vision stance, breath stances (freeze, gust), X-ray scan stance. Add layered micro-motion everywhere: breathing, weight shifts, head look-at, eye saccades. Blend between poses with critically damped springs, so nothing ever snaps.

**Hero gallery gate:** a `?hero` page shows a turntable (front, three-quarter, side, back) plus every pose, with the reference images beside it. Capture `qa/shots/hero-*.png`, compare against the references yourself, list mismatches (colour, proportion, seam placement, emblem shape, belt, boots, cape length) and fix them. Repeat until the list is empty.
