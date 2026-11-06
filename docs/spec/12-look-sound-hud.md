## 12. Look, sound and HUD

### 12.1 Visual targets

Bright, hopeful live-action comic-book realism: high-key daylight, rich primaries, clean sky, crisp glass reflections, warm sun and cool shade, and a hero who always pops off the background.

- **Sky:** physically based atmospheric scattering (precomputed LUT approach, with a Preetham-style fallback), a sun disc with bloom, stars and moon at night, aerial perspective that matches the fog.
- **Clouds:** a cumulus deck at 1,500 – 2,500 m rendered as lit volumetric puffs (half-res raymarch with temporal reprojection, or layered lit sprite clusters), plus high cirrus. They must look right from above, from below and from inside. Slow cloud shadows drift across the city.
- **Light and shadow:** directional sun with cascaded shadow maps out to ≈ 3 km and cached static-shadow layers for the city; image-based lighting from the live sky; AO via `n8ao`; cheap screen-space or analytic reflections on glass and water.
- **Hero readability:** a gentle camera-side fill light and a rim light keep the silhouette, emblem and cape colour blocks legible against sky, glass towers and night.
- **Post:** AgX or ACES tone mapping, bloom for emissives and heat vision, SMAA (with MSAA on the main buffer), depth of field in cinematics and photo mode, light grain and vignette, speed-driven chromatic aberration and radial blur, sun lens flare and glints, god rays when the sun sits behind clouds or towers. Grade: rich primaries, lifted shadows, warm highlights, cool shade.
- **Shader hygiene:** compile and warm every shader during the intro; no hitches during play. Analytic anti-aliasing (`fwidth`) on procedural window patterns so towers never shimmer at distance.
- **Quality scaler:** the Auto preset watches frame time and adjusts resolution scale, shadow resolution, cloud samples, crowd counts and LOD distances.

### 12.2 HUD (clean, fades when idle)

Speed (km/h and Mach) with the current throttle tier; altitude; a compass bar with landmark ticks and incident markers; solar-charge arc around the crosshair; an adaptive crosshair that changes with the active power; vision-mode overlays (X-ray tint, telescopic reticle, hearing waveforms); district-name banner on entry ("UPTOWN — LAFAYETTE") and a discovery popup for each landmark; small Hope and Collateral indicators; contextual control hints that retire once used; subtitles; a minimap or full map (M) with landmark names. A HUD-hide toggle supports photo mode.

### 12.3 Audio

A procedural Web Audio engine (no samples): buses for master, music, SFX, ambience and UI, with a limiter on the master. HRTF positional audio, distance filtering, manual Doppler on fast passes, and a synthesised-IR street reverb that opens up when the hero is between buildings. Unlock audio on the Play click.

- **Hero SFX:** wind from filtered noise mapped to speed, layered sonic boom (sub thump, crack, rumble tail), near-miss whooshes, cape flutter bursts, takeoff thump, hero-landing impact, punch and throw impacts, heat-vision hum and sizzle, ice hiss and crackle, gust roar, glass shatter.
- **World:** per-district ambience (traffic, crowd murmur and cheers, sirens, church bells in Saint Martin, harbour horns and gulls, factory clank in Hell's Gate, birdsong in Centennial Park), trains, helicopters, car alarms.
- **Music:** an **original** adaptive score generated in code, with a hopeful heroic motif of its own (do not echo any existing film theme). Layers fade with state: calm pads at hover, brass motif in flight, percussion and strings at speed, tension in incidents, a triumphant lift after a rescue.
