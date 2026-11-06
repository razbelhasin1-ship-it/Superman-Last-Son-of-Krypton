## 9. Metropolis: a huge, immersive, hand-detailed city

Metropolis must feel **enormous**. Ground-level streets are canyons; from 2,000 m the city runs to the horizon in every direction; from 300 m you can still see people as moving dots, and with telescopic vision you can read their signs. Treat scale as a feature to *feel*: vertical drama, layered skyline, atmospheric haze, clouds around the towers, and traffic you can follow with your eyes.

### 9.1 Layout blueprint (canonical unless you log a better reason)

Axes: −Z = north, +X = east, origin = Centennial Park. Land spans ≈ x −3,500 … +3,400 and z −4,200 … +4,300 (≈ 7 × 8.5 km), with water on three sides: **Hob's Bay** to the east, a **river** to the west (countryside beyond), the **Narrows** to the south, and a **harbour inlet** to the north-east. Beyond the land: open ocean, farmland, forests and distant mountains rendered as hazy skyline cards out to 25 km. A small airfield on the south-west fringe supplies air traffic (optional).

Tallest building: LexCorp Tower, 450 m. Height bands: Southside corporate cluster 220 – 380 m; Centennial 120 – 300 m; Uptown 80 – 200 m; Oak Town 10 – 35 m; the slums 15 – 60 m.

**The four bridges are showpieces and incident stages:** Centennial Bridge (cable-stayed, ≈ 1.2 km, twin 220 m pylons); Countryside Bridge (steel arch, ≈ 900 m); Seagate Bridge (suspension with art-deco towers, ≈ 1.6 km); Metro-Narrows Bridge (heavy steel cantilever truss, two decks for road and rail, ≈ 1.1 km). An elevated rail line, "the Elevated", threads through all three tiers on viaducts.

### 9.2 Landmark roster

Every row below must exist in `data/landmarks.json` and in the world, with signage, a HUD discovery popup, and a **recognisable silhouette**. Positions are (x, z) in metres. Landmarks are hand-authored generator functions with richer detail than the generic city.

#### UPTOWN

| Neighbourhood | Landmark | (x, z) | Design intent |
|---|---|---|---|
| **Saint Martin** (old harbour town) | Saint Martin (the district) | (1,800, −3,200) | Narrow cobbled streets, gothic church with bells at its heart, warm brick. |
| | Centennial Bridge | (1,800, −4,300) | Cable-stayed, twin pylons, lit cables at night; heavy traffic. |
| | Ace o' Clubs | (1,300, −2,900) | Neon nightclub, giant glowing ace-of-clubs sign, queue outside. |
| | Metropolis Harbor | (3,000, −3,300) | Working port: container cranes, ships, piers, ferry terminal, lighthouse. |
| **Lafayette** (civic core) | Lafayette (the district) | (0, −3,200) | Wide boulevards, monuments, flags, formal plazas. |
| | City Hall | (0, −3,200) | Domed Beaux-Arts hall, clock tower, grand steps, plaza fountain. |
| | Metropolis Police Dept. (MPD) | (−450, −3,000) | Stone-and-brick precinct HQ, rooftop mast and helipad, patrol cars out front. |
| | Courthouse | (350, −3,000) | Columned neoclassical façade, scales-of-justice sculpture. |
| | Fire Dept. | (−700, −2,700) | Red-brick HQ, hose tower, engine bays; engines launch to fires. |
| | USA Defense HQ | (900, −3,800) | Angular fortress compound, radar domes, helipads, restricted airspace. |
| **Bakerline** (monuments and finance) | Bakerline (the district) | (−1,500, −2,800) | Stately stone streets, statues, banks and embassies. |
| | Hall of Justice | (−1,500, −3,000) | Vast neoclassical marble hall, colonnade, wide steps, heroic statues. |
| | Outlook Park | (−1,900, −2,400) | Hilltop park with lookout terrace, lake, winding paths, picnickers. |
| | Metropolis Bank | (−1,200, −2,500) | Granite temple of finance with a visible lead-lined vault (heist incident). |
| | International Affairs Center | (−1,700, −3,400) | Glass-and-steel complex, ring of flagpoles, motorcade traffic. |
| **Racine** (arena and gateway) | Racine (the district) | (−2,900, −2,800) | Working-class brick blocks, murals, local shops, gateway to the countryside. |
| | Countryside Bridge | (−3,500, −3,000) | Steel arch bridge to the western farmland. |
| | Shuster Arena | (−2,800, −2,700) | Large stadium with floodlight towers, packed crowds and roar on game days. |

#### MIDTOWN

| Neighbourhood | Landmark | (x, z) | Design intent |
|---|---|---|---|
| **Oak Town** (leafy residential) | Oak Town (the district) | (−1,700, −100) | Tree-lined brownstones, stoops, small shops, kids on bikes. |
| | 344 Clinton St. (Clark Kent's home) | (−1,700, 300) | Modest brownstone apartment building, address plaque, reachable rooftop for takeoffs. |
| | Metropolis General Hospital | (−1,200, −500) | Large hospital, helipad, ambulance bay, rooftop red cross. |
| | Solar Tower | (−2,000, −300) | Slender 260 m tower clad in photovoltaic panels with a mirror-array crown, glowing at sunrise. |
| **Centennial** (cultural heart) | Centennial (the district) | (0, 0) | Dense cultural core around the park, bright and busy. |
| | Centennial Park | (0, 0) | Huge central park: meadows, pond, tree groves, bandstand, joggers, picnics. |
| | Odysseus Mall | (600, 300) | Multi-storey shopping mall with glass atrium and rooftop parking. |
| | Centennial Grand Theater | (−400, −300) | Ornate theatre with a glowing marquee and red-carpet crowd. |
| | STAR Labs | (−500, 500) | White-and-blue research campus, domed atrium, satellite dish array. |
| | Metropolis Museum of Modern Art (MoMA) | (400, −500) | Sculptural cantilevered gallery, abstract geometry, public sculpture plaza. |
| | Daily Planet Building | (150, −450) | Art-deco tower (≈ 210 m) topped by a giant, slowly rotating, illuminated globe. |
| | Grand Centennial Hotel | (350, −150) | Luxury hotel, grand entrance canopy, rooftop pool, doormen and taxis. |
| | Metropolis Central Library | (−250, 250) | Stately library with broad steps, stone lions, arched reading-room windows. |
| **Queensland** (campus district) | Queensland (the district) | (−1,300, 1,000) | Collegiate quads, cafés, students everywhere, bike racks. |
| | Metropolis University | (−1,400, 1,000) | Collegiate-gothic campus, clock tower, quad. |
| | Performing Arts Academy | (−900, 1,100) | Curved modern building with a rooftop amphitheatre. |
| | Jules Verne Museum | (−1,100, 1,300) | Retro-futuristic museum with a giant nautilus-and-airship exhibit. |
| | Elementary School | (−1,700, 700) | Small brick school, playground, school buses, crossing guard. |
| **Hob's Bay** (waterfront) | Hob's Bay (the district) | (2,300, 100) | Boardwalks, marinas, seafood restaurants, sailboats. |
| | Seagate Bridge | (3,300, 200) | Art-deco suspension bridge across the bay. |
| | 1938 Sullivan Place (Lois Lane's home) | (2,300, 400) | Handsome townhouse with a brass address plaque and a small terrace. |
| | Galaxy Communications | (2,000, −200) | Broadcast complex with a tall lit antenna tower and satellite dishes. |

#### DOWNTOWN

| Neighbourhood | Landmark | (x, z) | Design intent |
|---|---|---|---|
| **Southside** ("Suicide Slums") | Southside (the district) | (0, 2,900) | Gritty, dense tenements, fire escapes, laundry lines, graffiti, rusty water tanks, tight alleys; the corporate towers rise like a wall at its northern edge. |
| | LexCorp Tower | (0, 2,000) | Tallest tower (450 m), dark glass monolith with a crowning ring, lit signage on four faces. |
| | LexCorp Plaza | (0, 2,150) | Sunken granite plaza at the tower's base, security gates, sculpture. |
| | Queen Industries | (500, 2,100) | Sleek green-tinted tower, faceted crown. |
| | Founders Industries | (−500, 2,100) | Heavy stone-and-steel corporate headquarters, step-back profile. |
| | KORD | (900, 2,400) | Angular black-glass tower with a red band and rooftop dish. |
| | Wayne Enterprise | (−900, 2,400) | Dark gothic-modern tower with gargoyle-like crown details. |
| | LordTech | (300, 2,600) | Silver spiral-twist tower with a blue-lit crown. |
| | Goldstar Incorporated | (−300, 2,600) | Gold-glass tower with a stepped star-topped crown. |
| **Hell's Gate** (industrial) | Hell's Gate (the district) | (1,900, 3,500) | Smokestacks, rail yards, tank farms, steam, orange sodium light. |
| | Metro-Narrows Bridge | (2,000, 4,300) | Cantilever truss bridge, road deck plus rail deck. |
| | LexCorp R&D | (1,300, 3,300) | Fortified lab compound, lead-lined chambers, green glow (kryptonite, section 8.5). |
| | Stagg Ind. | (1,800, 3,000) | Factory with smokestacks, conveyors, loading docks. |
| | Kane Aerospace | (2,500, 3,500) | Hangars, runway, a rocket on a gantry. |
| | Ivo Labs | (1,000, 3,800) | Strange biotech-and-robotics lab under a geodesic dome. |
| | Steelworks | (2,200, 3,900) | Blast furnaces, glowing molten steel, cranes, heat haze. |

#### ISLAND

| Neighbourhood | Landmark | (x, z) | Design intent |
|---|---|---|---|
| **Stryker's Island** (offshore, ≈ 1.8 km into the bay) | Stryker's Island | (5,200, 1,800) | Rocky island with a ferry dock, searchlights and sea-spray. |
| | Stryker Penitentiary | (5,200, 1,800) | Fortress prison, watchtowers, perimeter walls, searchlight sweeps (prison-break incident). |

### 9.3 City generation

- **Data first.** Generate `data/landmarks.json` and `data/districts.json` from section 9.2. Everything else in the city is procedural, driven by district style tables (building height, density, materials, signage, street width, tree density, crowd density).
- **Roads and lots.** Each neighbourhood gets its own street grid orientation plus diagonal avenues and waterfront roads. Subdivide lots, assign building types, place sidewalks, crossings, traffic lights, street furniture, trees and parks. Landmarks clear and replace lots.
- **Buildings.** One uber facade shader on instanced meshes: base / shaft / crown sections, bays and floors as instance attributes, materials (glass curtain wall, brick, stone, concrete, metal), window grids with **interior mapping** in the near field, lit-window patterns at night, roof props (water tanks, HVAC, antennas, helipads, gardens), signage from a procedural text atlas.
- **Water.** Bay and river with Gerstner waves, depth-tinted colour, shoreline foam, boat wakes, piers, ships, ferries.
- **Streaming and LOD.** 256 m chunks generated in Web Workers. L0 (< 400 m) full detail; L1 (< 1,500 m) simplified instances with the window shader; L2 (< 6,000 m) merged block impostors; L3 skyline cards beyond. **Landmarks never disappear:** always at least L1, L0 within 1.5 km, so the player can navigate by silhouette. Pool and reuse buffers; keep within the budgets in section 4.
- **Scale cues:** tall silhouettes layered in depth with atmospheric haze, cloud banks around the supertall towers, long straight avenues, traffic flows, and sun glints on glass.

### 9.4 World acceptance

1. `npm run qa:landmarks` asserts every landmark in section 9.2 exists in the data and the scene, then flies a scripted tour that photographs each from an approach angle into `qa/landmarks/<slug>.png`. Review each: silhouette, signage and detail must identify it.
2. Four skyline shots from 2 km at north, east, south and west; each at morning, noon, golden hour and night, saved to `qa/skyline/`. Each must read as a vast, layered metropolis.
3. A cross-city timing test reports the time to fly from Racine to Stryker's Island at each tier. Cruise should take about a minute; Bullet about four seconds.
