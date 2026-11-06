## 10. A city full of life

The city should feel inhabited even when nothing is happening. Detail is the feeling of *someone lives here*.

### 10.1 People

Three crowd tiers share one agent simulation (struct-of-arrays, stepped in a worker, only for active chunks):

| Tier | Range | Count | Representation |
|---|---|---|---|
| Near | < 60 m | ≤ 600 | Fully skinned and animated, IK foot planting, reactions, speech barks |
| Mid | 60 – 300 m | ≤ 6,000 | GPU-instanced vertex-animated walkers |
| Far | > 300 m | ≤ 40,000 | Impostor dots and flow streams, so the player sees living crowds from altitude |

- **Variety:** 40+ procedural body, outfit and colour combinations, plus uniforms (police, firefighters, paramedics, construction workers, students, business suits, tourists, chefs, sports fans).
- **Behaviours:** sidewalk walking on a navigation graph, crossing at lights, chatting groups, benches, jogging in parks, vendors and street performers, kids in the Elementary School playground, students on the Queensland quad, the Ace o' Clubs queue, Shuster Arena crowds on game days, office workers in lit windows.
- **Reactions to Superman:** heads turn and point as he flies overhead, kids run along the street, people wave and cheer, phones come up with camera flashes, pigeons scatter, dogs bark. Reaction radius scales with proximity and speed. Sonic booms make people flinch; incidents make them run, then applaud after a rescue. Speech barks ("It's Superman!", "Thank you!") appear as short subtitles with soft synthesised voice blips.

### 10.2 Traffic and ambient machines

Lane-following cars (instanced) with car-following behaviour, working traffic lights, taxis, buses, trucks, emergency vehicles that respond to incidents with sirens, **the Elevated** trains on their viaducts, ferries and container ships in the harbour, sailboats in Hob's Bay, planes and news helicopters (they follow the player at a distance), and bird flocks.

### 10.3 Texture of the world

Steam from manholes, wind-blown newspapers and leaves, flapping flags, awnings, window blinds, neon signs, billboards with fictional ads, street signs carrying the real district names, digital screens with **news tickers that report the player's own deeds** ("SUPERMAN HALTS RUNAWAY TRAIN ON THE ELEVATED"). The pause menu shows a **Daily Planet front page** whose headlines and counts come from the player's session.

### 10.4 Time and weather

Day/night cycle starting at 10:30 (default 24 real minutes per day, adjustable), with golden hour, night lights, and clear / scattered cloud / overcast / rain / thunderstorm / fog. Rain wets the roads (reflections, ripples), thunderstorms add lightning and booming thunder. Superman flying through rain and storm clouds is a showcase moment: droplets on the camera lens streak away at speed.
