# Brief: AUDIO — procedural engine, adaptive original score, ambience (gate 6, built early)

Owner directory: `src/audio/` (plus `tests/audio-*.test.ts`, `scripts/qa/tasks/audio.mjs`).
Spec: `docs/spec/12-look-sound-hud.md` §12.3, `docs/spec/05-entry-flow.md` (intro: soft exhale, wind bed,
optional TTS), `docs/spec/10-city-life.md` (speech blips for barks), §8 audio lines for powers.

## What exists
`src/audio/AudioEngine.ts`: buses (master+limiter, music, sfx, amb, ui), pink-noise buffer, synthesised
street reverb IR, wind bed mapped to speed, boom/whoosh/thump/shatter/scrape/capeCrack one-shots.
The game calls: `unlock()`, `setFlight(speed, inCloud, streetiness)`, `boom(delay, strength)`,
`whoosh(intensity, pan, duration)`, `thump(strength, pitch)`, `shatter(strength)`, `scrape(s)`,
`capeCrack(s)`, `volumes`, `applyVolumes()`. **Keep these signatures working.**

## Deliverables
1. **Original adaptive score** generated in code (Web Audio synthesis: additive/FM brass, string pads,
   timpani/percussion, choir-ish pads): a hopeful heroic motif of its OWN (do not echo any existing
   film theme — avoid the famous rising-fifth Superman fanfare shapes). Layers by `MusicState`
   (`src/contracts.ts`): silent, menu, intro, hover (calm pads), flight (brass motif), speed (percussion +
   strings), incident (tension), triumph (lift after rescue). Smooth crossfades, tempo-synced sequencer
   with lookahead scheduling, deterministic (seeded), cheap on CPU. `setMusicState(s)`, `setIntensity(0..1)`.
2. **Ambience** per district (`setDistrict(slug)`): traffic hum, crowd murmur/cheers, sirens, church
   bells (Saint Martin), harbour horns + gulls, factory clank (Hell's Gate), birdsong (Centennial Park),
   stadium roar (Shuster Arena). Crossfaded beds + sparse one-shots. `setAmbienceLevel(altitude)`
   (fades with altitude).
3. **Positional audio**: `playAt(kind, position, opts)` with HRTF panning, distance filtering, manual
   Doppler for fast passes; `setListener(position, forward, up, velocity)`. Kinds: siren, car alarm,
   explosion, gunshot (bullet ping on the suit), helicopter, train, crowd cheer, dog bark, birds scatter.
4. Power sounds: heat-vision hum/crackle/sizzle (`heatVision(on, intensity)`), ice hiss/crackle
   (`freezeBreath`), gust roar with charge (`superBreath`), punch impacts, throw whoosh, catch thud,
   train screech (`locomotiveStop`), focus heartbeat pulse, x-ray/telescope/hearing UI tones, super
   hearing filter (`setHearing(on)` — filters the world to far-off voices with pings).
5. Intro: soft exhale + gentle wind bed (`introExhale()`), optional TTS (`speak(text)` via
   `speechSynthesis`, only when enabled), UI clicks/hover tones for the menu (`ui(kind)`).
6. Speech blips for NPC barks (`bark(text, pos)` → short syllabic synthesised blips).
7. Verification without ears: render offline (`OfflineAudioContext`) snippets of each state into
   analysis (RMS, peak, spectral centroid per layer) in vitest where possible, plus a QA task that runs
   the engine in Chromium and writes `qa/audio/*.wav` + a JSON level report. No clipping (limiter),
   no NaNs, CPU-light (count active nodes).
