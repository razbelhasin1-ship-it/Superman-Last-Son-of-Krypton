## 5. Entry flow: menu, then the Play sequence

### 5.1 Main menu — one sitting, then leave it alone

Goal: **clean, smooth, good.** Build it as a DOM + CSS overlay on top of the live sky scene (the same sky and cloud deck as the Play sequence, so pressing Play flows straight into 5.2 with no cut).

- Title: an original typographic treatment of "SUPERMAN" with the subtitle "METROPOLIS". The small gold-on-red shield emblem appears once as a UI motif.
- Buttons: **PLAY**, **CONTROLS**, **SETTINGS**. Mouse, keyboard and gamepad navigable, with 300–400 ms eased transitions (fade, blur, slight slide) and a soft hover glow.
- Settings: graphics preset (Low/Medium/High/Ultra/Auto), resolution scale, FOV, mouse sensitivity, invert Y, master/music/SFX volume, comfort options (reduced camera shake, reduced motion blur, optional stable-horizon camera), subtitles on/off. Persist to `localStorage` inside try/catch.
- **Done when:** the menu is interactive within 3 s of page load, lays out correctly at 16:9, 16:10 and 21:9, and one screenshot at each ratio is saved to `qa/shots/menu-*.png`.

### 5.2 The Play sequence — match the target recording

The target is a screen recording you cannot play, so use the storyboard (`reference/play-sequence-storyboard.png`) together with this beat sheet. Take **camera, timing, light, pacing and the subtitle** from the recording. The faint channel watermark in the frames belongs to the source video and is not part of the design. The face in the frames is a reference for *framing and acting* only; the hero's face is an original design (section 6), not a likeness of any real person.

Format: no HUD, no loading bar. The intro **is** the loading screen: while it plays, stream the city chunks around the spawn point so control starts with zero hitching. A hold of Space / Enter / gamepad A for 0.6 s after the first 1.5 s skips to the handoff (5.3).

Starting camera: vertical FOV ≈ 20° (long-lens, cinematic compression), distance ≈ 13 m. End camera: same FOV, distance ≈ 2.0 m. Tune distance until the storyboard frames match: at 4.0 s the full body fills ≈ 70% of frame height; at 9.0 s head plus upper chest fills the frame with the emblem at bottom-centre.

| Time (s) | Camera | Hero | Sky and FX |
|---|---|---|---|
| 0.0 – 2.5 | Static wide shot. Hero dead-centre, ≈ 40% of frame height. | Hovering upright. Arms relaxed, fists loosely closed. Legs together, toes pointing down. Slow vertical bob (≈ ±3 cm at 0.4 Hz). Cape hangs straight down behind and swings in a slow pendulum, drifting toward frame-left around 1.75–2.5 s. | Bright daytime sky, pale blue shading to deeper blue at upper-right. Soft cumulus banks at lower-left and lower-right, wisps at upper-left. Soft sun haze from upper-left. Everything calm. |
| 2.5 – 6.0 | Smooth dolly-in, ease-in then ease-out (cubic-bezier .45, 0, .2, 1 across 2.5 → 8.5 s). Camera drifts upward so the face stays in the upper third. Full-body at 4.0 s, knees-up at 5.0 s, waist-up at 6.0 s. | Same hover pose. Cape drifts back and settles behind the shoulders, its upper edge visible as a red collar line at the shoulders from 6.0 s. | Clouds parallax gently. Depth of field starts to soften the background. |
| 6.0 – 7.3 | Chest-up, still pushing in. | **Eyes closed**, serene. One slow breath: chest rises and falls. | Background softens further. |
| 7.3 – 8.5 | Decelerating into a medium close-up: head and upper chest, emblem at bottom-centre. | Eyes open. Head turns a few degrees toward frame-right and tilts slightly. Gaze goes off-camera toward the horizon. | Background clouds fully out of focus. Warm key light from upper-left, cool sky fill. |
| 8.5 – 11.6 | Held. Only a faint handheld-style drift (< 1 cm). | Idle acting: breathing, micro head motion, one natural blink. | Same. |
| 9.0 → | — | Lips move with the line. | **Subtitle** fades in over 0.25 s at bottom-centre: *"Let's see what today brings."* Small white sans-serif, soft shadow, ≈ 2.2% of frame height. Stays on screen through the end of the sequence. |

Voice: there is no voice acting. Present the line as a subtitle with a soft exhale and a gentle wind bed under it. Offer an optional text-to-speech toggle in Settings, default off. Drive the jaw with a simple open/close envelope timed to the line.

### 5.3 Handoff to gameplay (designed here; the recording stops at 11.6 s)

1. **11.6 – 12.4** The line lands. A small confident smile; eyes lift to the horizon. Wind rises, the cape stirs.
2. **12.4 – 13.4** The hero pitches forward and dives out of the bottom of frame. The camera whips down and swings behind him. The cloud deck bursts around the lens (0.15 s white-out with mist streaks). **Metropolis is revealed below**: the full skyline, bay and bridges in one wide establishing shot, with the Daily Planet globe visible.
3. **13.4 – 15.0** Control fades in during the dive (spawn ≈ 1,800 m above Centennial). HUD fades in. The camera blends into the standard chase camera. A single hint appears: "Pull up — S / Space to level out."

**Done when:** a QA script captures frames at 0, 2, 4, 5.5, 6.5, 7.5, 9 and 11 s, builds a side-by-side contact sheet against the storyboard, and the two sheets match in framing, pose, light and subtitle timing. Review the sheet yourself; iterate until it does.
