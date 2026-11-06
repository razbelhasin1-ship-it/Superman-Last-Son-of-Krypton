## 8. Powers: everything Superman can do, the player can do

Each power ships **complete**: input, hero animation, VFX, audio, world interaction, HUD feedback, tuning values. Every power uses the shared systems: instanced particles, a distortion (refraction) pass, a bloom-friendly emissive palette, and a physics impulse API (`world.applyForce(origin, direction, strength, falloff)`).

### 8.1 Heat vision (hold right mouse)

- Eyes glow white-hot orange-red; the glow lights the face and chest. Two beams leave the eyes and converge at the crosshair target.
- **Precision beam:** thin, bright core with a shimmering volumetric glow and heat-haze refraction along its length. **Sweep:** drag the beam across surfaces. **Wide burst:** Shift + hold fans the beams into a cone for crowd-of-drones targets. **Overload:** after 2 s of holding, the beams merge into one thick beam with bloom and screen heat shimmer, draining solar charge.
- Impact: glowing spot that heats from orange to white, molten sparks, smoke, scorch decals, metal that glows then drips. Steel beams, cars, chains, locks, vault hinges and robot limbs cut along the beam path (cutting is geometric: slice meshes along the beam plane or swap in pre-cut halves).
- Ignites flammables (fuel, wood, billboards). Reflects off mirrored glass at shallow angles (one bounce).
- Safety rule: the beam never harms a civilian; it dims and bends away when a person is on the path.
- Audio: rising electrical hum, crackle, sizzle on impact.

### 8.2 Freeze breath (hold F)

- A cone of frost mist with ice crystals; intensity builds over 1 s. Face and chest show a cold glow.
- **Freezes** water into spreading ice sheets with a fractal crystal shader (the harbour can be bridged with ice), puts out fires, coats vehicles and robots in ice that shatters when punched, frosts glass with growing frost decals, and drops local temperature fog.
- Ice growth is a GPU-driven mask spreading from the impact point; frozen objects get a slippery physics material.
- Audio: icy hiss, crackle, glassy shatter.

### 8.3 Super breath (hold G)

- A strong gust cone with radial streak particles and refraction distortion; intensity ramps 0 → 1 over 1.2 s. A short tap is a quick blast. Holding Shift + G inhales first (suction ring flows inward for 0.4 – 1.5 s); releasing exhales a gust scaled by the charge, up to hurricane strength.
- Pushes cars, debris and light objects through physics impulses; gently shoves pedestrians off their feet (no injury). Blows out fires, clears smoke and fog, tears leaves and litter into streams, bends trees, spins turbines, builds waves on water, scatters flocks of birds, and parts low clouds.
- Combining freeze and super breath (hold F + G) makes an arctic gale: widest cone, strongest ice growth.
- Audio: rushing air with a low rumble that rises with charge.

### 8.4 Super strength

| Action | Behaviour |
|---|---|
| **Grab (E)** | Pick up the object under the crosshair within 8 m: cars, buses, shipping containers, boulders, girders, trucks. Heavier objects slow flight (a bus caps speed at DASH) and add hero strain animation and cape drag. Hands use IK to the object's grab points. |
| **Throw (hold and release left mouse)** | A trajectory arc preview while holding; release throws with a hit-stop and camera kick. Thrown objects use Rapier physics and break on impact (instanced debris). |
| **Punch (left mouse)** | Three-hit ground combo, flying punch (damage scales with speed), and a **Mach punch** above 340 m/s that emits a shockwave cone. Impacts apply hit-stop (≈ 60 ms), screen kick, a dust and spark burst, and a physics impulse. |
| **Catch and hold** | Falling vehicles, people, a collapsing bridge span, a toppling billboard: auto-assist grabs when the hero is near the falling object's path and holds the load for the duration of the incident. |
| **Locomotive stop** | Standing on the rails in front of a runaway train and pressing and holding E brings it to a stop: sparks, screeching, heels sliding, camera shake. This is the signature "more powerful than a locomotive" moment (incident type in section 11). |
| **Ground slam** | Power-dive with left mouse: a radial shockwave that tosses cars and shatters windows within 40 m. |

Everything the hero lifts, throws or breaks respects the *care rule*: civilians are never crushed. Objects slow and divert near people.

### 8.5 Invulnerability

- Bullets spark, flatten and ricochet off the suit with a metallic *ping* and tiny impact flashes; the suit never tears. Explosions and fire wash over the hero harmlessly with heat shimmer. Falls from any height do no damage.
- **Weaknesses** create tension: green **kryptonite** shards in LexCorp R&D and a few sealed vaults drain solar charge and slow flight inside a radius (green glow, sickly desaturation, laboured breathing animation). **Lead-lined** rooms block X-ray vision and hearing.

### 8.6 Senses

- **X-ray vision (toggle X):** facades fade to glowing outlines; interiors, structure, pipes and people appear as luminous silhouettes. Show hidden threats, trapped civilians, gas leaks and fires inside buildings. Lead-lined volumes stay opaque. Implement with a depth-based see-through pass and per-building interior data (simple floor plans with room volumes and NPC anchors) for landmarks and any building with an incident.
- **Telescopic vision (hold Z, wheel zooms 1× – 40×):** stabilised zoom with a lens reticle. Boost LOD bias so distant detail resolves (signs, faces, vehicles). Pins targets of interest.
- **Microscopic / scan (toggle V):** a close-inspection pulse that highlights hidden details on objects and reveals collectibles and clues.
- **Super hearing (hold H):** the soundscape filters to far-off voices. Cries for help, alarms, gunshots and sirens appear as 3D waveform pings on the compass and in the world, and an on-screen directional cone follows the camera. Primary tool for discovering incidents.

### 8.7 Super-speed focus (hold Q)

The world slows to 0.15×; the hero stays at full speed. Bullets hang in the air and can be plucked or redirected, falling debris can be repositioned, and people can be moved out of harm's way. Visuals: desaturated world, hero afterimages, rippling air, a heartbeat-like low pulse. Drains a focus meter that refills over 6 s.

### 8.8 Solar charge

Altitude above the cloud deck in direct sun recharges **solar charge**, which powers overboost, heat vision overload and focus. Show it as a subtle glow on the suit's emblem and a slim HUD arc. Night and kryptonite deplete it; the first night teaches the player to climb into the sun at sunrise.

### 8.9 Rescue actions

- **Carry:** E on a civilian lifts them into a bridal or shoulder carry; flight is capped at CRUISE and the hero shields them from wind with gentle animation. Drop them at an ambulance, a hospital pad or a safe zone.
- **Catch:** a person or vehicle falling within 15 m triggers an assisted catch with a slow-motion beat.
- **Shield:** hold E near a threatened civilian to block debris or gunfire with the cape and body.

### 8.10 Extras

Thunderclap (a wide sonic shockwave that stuns drones and shatters glass, short cooldown), flying tackle, aerial grapple-and-throw, cinematic eyes-glow stare (hold R + right mouse), and a hover-photo pose that NPCs react to.

### 8.11 Powers acceptance

For every power, a QA script stages a standard target, triggers the power, and captures 3 frames (start, peak, aftermath) plus a one-line critique. Each power must read as spectacular in a single still frame and register correctly in the HUD. Store results as `qa/shots/power-<name>-{1,2,3}.png`.
