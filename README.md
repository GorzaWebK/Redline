# Redline

A time trial racing game for the browser. Pick a circuit, find the racing line, beat your ghost and take the gold.

**Play:** https://gorzawebk.github.io/Redline/

PC only (keyboard or gamepad). Phones and tablets with only a touchscreen see a short "play on a PC" notice. Everything is made in code: the cars, circuits, scenery, textures, sky, sound effects and music. There are no image or audio files.

> "Redline" is a working title.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ / Space | Brake (hold when stopped to reverse) |
| A D / ← → | Steer |
| C | Put the car back on the track (the clock keeps running) |
| R | Restart the race |
| V | Change camera (chase, far chase, hood, bumper) |
| L | Racing line guide on/off |
| G | Ghost: your best, world record, both or off |
| M | Mute |
| Esc | Pause |
| N / Enter | Next track (on the finish screen) |

**Gamepad:** left stick steers, right trigger (or A) accelerates, left trigger (or B) brakes. Start pauses, Y restarts, Back resets the car, RB changes camera.

## Features

- **24 circuits** in four settings of six: **Meadow** (green hills, day), **Canyon** (desert and red mesas), **Alpine** (snowy passes at golden hour) and **Night City** (street lights, glowing towers, headlights). Every race is 3 laps from a standing start, with a countdown on the start gantry's lights.
- **Difficulty:** Circuits get longer (0.8 km up to 1.9 km a lap), narrower, hillier and twistier, with tighter hairpins, as you go. Each one unlocks when you finish the one before.
- **Grippy, precise handling:** The car is a proper physics model: grip that builds and then lets go, weight shifting forward under braking and back under power, drag, engine power and hills that slow you down or speed you up. Traction control and a light stability assist keep it controllable on a keyboard. Grass is slow and slippery, and the walls scrub off your speed.
- **Medals:** Every circuit has gold, silver and bronze times. Gold is the autopilot's own time, silver is 10% slower and bronze 25% slower. The HUD shows the next medal to aim for.
- **Racing line guide:** A line on the road shows the fastest way round. It's **green** where you can go flat out, **yellow** through corners and **red** where you should brake. Switch it off in Settings or with **L**.
- **Ghosts:** Your best run on each circuit is recorded, and next time you race a see-through cyan copy of it. Online you can also race the **world record holder's ghost** (gold). Choose your best, world record, both or off in Settings (or **G** while driving).
- **Splits:** At each third of a lap you see how far ahead (green) or behind (red) your best run you are.
- **Online leaderboards:** A top 10 for every circuit with your world rank, from **Leaderboards** on the main menu, where you also set your driver name. Your time is sent when you finish, and the finish screen shows your world rank.
- **Garage:** 12 paint colours. Three are free, and the rest unlock with medals (up to Gold Leaf for gold on every circuit).
- **Stats:** Races, laps, distance, time driving, top speed, wall hits and medals.
- **Cameras:** Chase, far chase, hood and bumper. The view widens with speed, and the camera shakes on wall hits (can be switched off).
- **Effects:** Tyre smoke and skid marks when you slide, sparks off the walls, dust off the grass.
- **Sound:** A synthesised engine that revs through six gears, tyre squeal, grass rumble, wind, wall hits and countdown beeps.
- **Music:** A generated soundtrack (A minor, 124 BPM). Calm in the menus. While racing, drums, a driving bass and an arpeggio come in as you speed up.
- **Minimap** with you (red) and your ghosts (cyan, gold), plus a **WRONG WAY** warning.
- **Watch the autopilot:** The link under the main menu lets the autopilot drive the next circuit, to see the racing line in action.
- **Settings:** Graphics quality (High, Medium, Low), camera, km/h or mph, field of view, racing line, ghost, camera shake, effects and music volume, mute and an FPS counter. All are saved.
- **Saving:** Best times, splits, best laps, ghosts, unlocks, paint, settings and stats are saved in the browser.

## How it's built

- Plain JavaScript + [Vite](https://vite.dev), [three.js](https://threejs.org) for 3D, the Web Audio API for sound, and Firebase for the online leaderboards.
- Circuits are generated from a seed and a difficulty (`src/track.js`). The same seed always gives the same circuit: a closed loop from a smoothed spline, with corners no tighter than the difficulty allows, no part close enough to another to share a wall, gentle hills, and the start on the straightest stretch. The racing line is worked out by repeatedly pulling each point of the line straighter within the road's width.
- The physics (`src/car.js`) and race rules (`src/race.js`) contain no drawing code. They run on a fixed 120 Hz timestep, so a run plays the same at any frame rate and can be tested in Node.
- The autopilot (`src/bot.js`) drives the racing line at the fastest speed the grip allows, braking in time for each corner. `scripts/find-seeds.mjs` picks a seed for each circuit that the autopilot drives cleanly (no wall hits, no grass) and records its 3-lap time as the gold medal time, in `src/track-seeds.js`. Rerun it (`npm run seeds`) after changing the generator, the car or the autopilot.
- Testing helpers: `?bot=1` lets the autopilot drive, `?track=N` opens circuit N (if unlocked), and `?unlock=all` unlocks every circuit for that visit without saving.

| File | What it does |
| --- | --- |
| `src/main.js` | Game loop, camera, HUD, menus |
| `src/track.js` | Circuit generator, racing line, finding where a point is on the track |
| `src/car.js` | Car physics |
| `src/race.js` | Countdown, laps, sectors, finish, putting the car back on track |
| `src/bot.js` | The autopilot and its speed plan |
| `src/tracks.js` | The 24 circuits: names, themes, difficulty, medal times |
| `src/track-seeds.js` | Checked seeds and gold times (written by `scripts/find-seeds.mjs`) |
| `src/world.js` | Builds the 3D world: road, kerbs, walls, gantry, grandstand, terrain, scenery, sky, light |
| `src/themes.js` | The four settings (sky, light, ground, scenery) |
| `src/carModel.js` | The car model and paints |
| `src/effects.js` | Tyre smoke, skid marks, sparks |
| `src/ghost.js` | Recording, packing and playing back ghosts |
| `src/online.js` | Online leaderboards and world record ghosts (Firebase) |
| `src/online-config.js` | Firebase web config (null = online off) |
| `src/audio.js` | Synthesised engine and sound effects |
| `src/music.js` | Generated music that follows your speed |
| `src/input.js` | Keyboard and gamepad |
| `src/save.js` | Saving in the browser |
| `src/textures.js` | Textures drawn on a canvas |
| `firebase/database.rules.json` | Redline's security rules on their own |
| `firebase/database.rules.full.json` | Complete rules file for the Firebase console (Foundry Arena + Skyhook + Redline) |

## Online leaderboards

Redline uses the same Firebase project as Foundry Arena and Skyhook ("foundry-arena"), with its own `redline/` section:

- `redline/scores/t<N>/<uid>`: `{ name, time, lap, at }`, one best per driver per circuit.
- `redline/ghosts/t<N>/<uid>`: `{ time, data, at }`, the recording of that best.

The security rules only let a signed-in driver write their own entry and only improve their time. They also refuse impossible times, odd names and extra fields, and only accept a ghost that matches the saved time. **Paste the whole of `firebase/database.rules.full.json` into the Firebase console** (Realtime Database → Rules → Publish) to switch Redline's leaderboards on. It contains Foundry Arena's and Skyhook's rules too, unchanged.

## Development

```bash
npm install
npm run dev            # play at http://localhost:5173
npm test               # physics and race tests (every circuit driven by the autopilot)
npm run test:online    # leaderboard tests against local Firebase emulators (needs Java)
npm run build          # production build in dist/
```

`RULES_FILE=firebase/database.rules.full.json npm run test:online` tests the complete console file.

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. It runs the tests, builds and publishes `dist/`.
