# Redline

A time trial racing game for the browser. Pick a circuit, find the racing line, beat your ghost and take the gold.

**Play:** https://gorzawebk.github.io/Redline/

Plays on PC (keyboard or gamepad) and on phones and tablets (touch controls, best held sideways). Everything is made in code: the cars, circuits, scenery, textures, sky, sound effects and music. There are no image or audio files.

> "Redline" is a working title.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake (hold when stopped to reverse) |
| Space | Handbrake: kick the back out to drift round tight corners |
| A D / ← → | Steer |
| C | Put the car back on the track (the clock keeps running) |
| R | Restart the race |
| V | Change camera (chase, far chase, hood, bumper) |
| L | Racing line guide on/off |
| G | Ghost: your best, world record, both or off |
| M | Mute |
| Esc | Pause |
| N / Enter | Next track (on the finish screen) |
| P | Watch the replay (on the finish screen) |

**Touch (phones and tablets):** ◀ ▶ on the left steer, or tilt the phone (Settings → Touch steering, with an invert option). GAS and BRAKE are on the right, and DRIFT is the handbrake. RESET puts the car back on the track, CAM changes the camera and II pauses. Settings can make the car accelerate by itself. Races go fullscreen in landscape where the browser allows it, and holding the phone upright pauses the race with a reminder to turn it sideways. Phones start on Low graphics with the mirror off; both can be changed in Settings.

**Gamepad:** left stick steers, right trigger (or A) accelerates, left trigger (or B) brakes, X is the handbrake. Start pauses, Y restarts, Back resets the car, RB changes camera.

## Features

### Modes
- **Time trial:** 3 laps against the clock, your ghost and the world record. Medals, splits and online leaderboards.
- **Race rivals:** Race five AI drivers (Kade Mercer, Rosa Vance, Tomi Hale, Ines Duarte and Ozzy Kwan) from a staggered grid, starting at the back. Each has their own pace and line. They move over to pass and bump into you and each other. Your position shows live, with name tags over each car, and the top three finishers get a podium. AI level: Easy, Normal or Hard (Settings).
- **Championship:** One cup per setting. Six races against the same five rivals, scoring 10, 8, 6, 4, 2 and 1 points, with the standings shown between races. Finish the cup in the top three for a trophy. You can stop a cup and continue it later.
- **Daily challenge:** A new circuit every day (UTC), the same for everyone. The difficulty, setting and weather change from day to day, and like every circuit it's proven drivable by the autopilot first. It has its own online leaderboard (the first page of Leaderboards) and a streak for days in a row.

### Circuits
- **24 circuits** in four settings of six: **Meadow** (green hills, day), **Canyon** (desert and red mesas), **Alpine** (snowy passes at golden hour) and **Night City** (street lights, glowing towers, headlights). Every race is 3 laps from a standing start, with a countdown on the start gantry's lights.
- **Rain** on four circuits (4, 11, 16 and 22): less grip, a grey sky, falling rain, spray off the tyres and a shiny wet road. Their gold times are set in the wet.
- **Difficulty:** Circuits get longer (0.8 km up to 1.9 km a lap), narrower, hillier and twistier, with tighter hairpins, as you go. All 24 are open from the start: race them in any order.

### Cars and driving
- **Four cars**, each with its own handling, body shape and engine sound:
  - **Redline GT:** the all-rounder.
  - **Pocket Rocket:** a light hatchback that brakes late and turns in like a go-kart.
  - **Thunderbolt:** a V8 muscle car built for long, smoky drifts. Unlocks with 8 medals.
  - **Apex V10:** a screaming hypercar, the fastest of the four. Unlocks with gold on 12 circuits.
- **Grippy, precise handling:** The car is a proper physics model: grip that builds and then lets go, weight shifting forward under braking and back under power, drag, engine power and hills that slow you down or speed you up. Traction control and a light stability assist keep it controllable on a keyboard. Grass is slow and slippery, and the walls scrub off your speed.
- **Drifting:** Flick the **handbrake** (Space) going into a corner, then stay on the throttle and keep steering into the corner: the car holds the drift for you (more steering = a deeper drift, about 17-25 degrees). Centre the steering, countersteer or lift off and it straightens up and grips again. While sliding, the car's momentum swings round towards where the nose points, so a drift carries you through the corner. A tidy drift is about as quick as gripping; a wild one costs speed.
- **Drift score:** Points for every drift (more angle and more speed = more points), with a multiplier up to x5 for keeping a drift going and a chain that links drifts together. Running onto the grass banks the chain; hitting a wall loses it.
- **Braking:** ABS with cornering control, so braking into a corner slows you without throwing the car sideways. Hold the brake when stopped to reverse.
- **Launch control:** During the countdown, tap the throttle to hold the revs in the green zone on the rev bar. Get it right for a perfect start; too many revs is wheelspin and too few bogs the engine down.
- **Kerbs** rumble: a sound, a little camera judder and gamepad vibration (gamepads also vibrate on wall hits and bumps).

### Help on track
- **Racing line guide:** A line on the road shows the fastest way round. It's **green** where you can go flat out, **yellow** through corners and **red** where you should brake. Switch it off in Settings or with **L**.
- **Driving hints** on the first three circuits: a **BRAKE** prompt when you're coming into a corner too fast, and a tip to try a drift on the first tight corner (Settings to switch off).
- **Medals:** Every circuit has gold, silver and bronze times. Gold is the autopilot's own time, silver is 10% slower and bronze 25% slower. The HUD shows the next medal to aim for.
- **Ghosts:** Your best run on each circuit is recorded, and next time you race a see-through cyan copy of it. Online you can also race the **world record holder's ghost** (gold, with their name and time floating over it). Choose your best, world record, both or off in Settings (or **G** while driving).
- **Sector times:** Each lap has three sectors. The time at each one is coloured **purple** (your fastest ever), **green** (faster than on your best run) or **yellow** (slower). The finish screen shows your theoretical best lap: your best sectors added up.
- **Rear-view mirror** at the top of the screen in races (Settings: in races, always or off).
- **Minimap** with you, the rivals and your ghosts, plus a **WRONG WAY** warning.

### Replays and photos
- **Replays:** Watch your run from the finish screen (**P**), or the world record from the Leaderboards page, filmed by trackside TV cameras that cut and zoom as the car goes by. Space pauses, the arrows skip 5 seconds, 1/2/3 set the speed and C switches to a chase camera.
- **Photo mode:** From the pause menu: move a free camera around the car (drag, WASD, Q/E and the mouse wheel), then press Enter to save a picture.

### Progress
- **Achievements:** 25 to earn, with a pop-up when you get one. They cover finishing and medals, mastering each setting, clean races, rain, drifting, launches, race wins, cups, daily streaks, distance and top speed, collecting the cars and photo mode. Three unlock paints: Carbon, Neon and Chrome.
- **Garage:** Choose your car and one of 15 paints. Three paints are free; the rest unlock with medals and achievements (up to Gold Leaf for gold on every circuit).
- **Profile:** Stats (races, wins, cups, laps, distance, time, top speed, drift points, medals and the daily streak), the achievements list and your account code.
- **Online leaderboards:** A top 10 for every circuit and for each day's daily challenge, showing each driver's car, with your world rank. Your time is sent when you finish, and you set your driver name on the Leaderboards page.
- **Account codes:** Profile → Account code gives you a secret code like `ABCD-EFGH-JKLM-NPQR`. It saves your progress online a few seconds after anything changes: best times, medals, unlocks, trophies, achievements, stats, name, car and paint. Type it into Redline in another browser to carry on there. Playing on two computers is fine, because saves are merged (fastest times, every unlock and the highest stats). It works like a password.
- **Cameras:** Chase, far chase, hood and bumper. The view widens with speed, and the camera shakes on wall hits (can be switched off).
- **Sound and music:** A synthesised engine per car that revs through six gears, tyre squeal, kerb rumble, grass rumble, wind, wall hits and countdown beeps. The generated soundtrack (A minor, 124 BPM) is calm in the menus, and builds with drums, bass and an arpeggio as you speed up.
- **Watch the autopilot:** The link under the main menu lets the autopilot drive the next circuit.
- **Settings:** Graphics quality (High, Medium, Low), camera, km/h or mph, field of view, racing line, ghost, AI level, rear-view mirror, driving hints, gamepad vibration, camera shake, effects and music volume, mute and an FPS counter. All are saved.

## How it's built

- Plain JavaScript + [Vite](https://vite.dev), [three.js](https://threejs.org) for 3D, the Web Audio API for sound, and Firebase for the online leaderboards.
- Circuits are generated from a seed and a difficulty (`src/track.js`). The same seed always gives the same circuit: a closed loop from a smoothed spline, with corners no tighter than the difficulty allows, no part close enough to another to share a wall, gentle hills, and the start on the straightest stretch. The racing line is worked out by repeatedly pulling each point of the line straighter within the road's width.
- The physics (`src/car.js`) and race rules (`src/race.js`) contain no drawing code. They run on a fixed 120 Hz timestep, so a run plays the same at any frame rate and can be tested in Node.
- The autopilot (`src/bot.js`) drives the racing line at the fastest speed the grip allows, braking in time for each corner. `scripts/find-seeds.mjs` picks a seed for each circuit that the autopilot drives cleanly (no wall hits, no grass) and records its 3-lap time as the gold medal time, in `src/track-seeds.js`. Rerun it (`npm run seeds`) after changing the generator, the car or the autopilot.
- The AI rivals (`src/rivals.js`) are the same autopilot with a little less grip and pace, each shifted off the racing line by its own amount. They move over when a car is in the way. Cars collide as two circles each, pushing apart and trading speed.
- Testing helpers: `?bot=1` lets the autopilot drive, `?track=N` opens circuit N (add `&mode=race` to race the AI), `?daily` opens today's daily challenge, and `?unlock=all` unlocks every car and paint for that visit.

| File | What it does |
| --- | --- |
| `src/main.js` | Game loop, camera, HUD, menus |
| `src/track.js` | Circuit generator, racing line, finding where a point is on the track |
| `src/car.js` | Car physics (grip, weight transfer, ABS, traction control, drift control, launch control) |
| `src/cars.js` | The four cars: physics, shape and engine sound |
| `src/rivals.js` | AI rivals, the grid and car-to-car collisions |
| `src/drift.js` | Drift scoring |
| `src/daily.js` | The daily challenge: today's circuit, streaks |
| `src/achievements.js` | The achievements |
| `src/account.js` | Account codes: packing and merging saves |
| `src/replay.js` | Replay TV cameras and the director that picks them |
| `src/hints.js` | Driving hints for the first circuits |
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
- Daily challenge boards are named `d20261119` (one per day) instead of `t<N>`.
- `redline/accounts/<code>`: `{ pid, save, at }`, an account code's save.
- `redline/members/<pid>/<uid>`: browsers that joined an account, so they can save times under it.

The security rules only let a signed-in driver write their own entry (or their account's, once that browser has joined it with the code) and only improve their time. They also refuse impossible times, unknown boards and cars, odd names and extra fields, and only accept a ghost that matches the saved time. **Paste the whole of `firebase/database.rules.full.json` into the Firebase console** (Realtime Database → Rules → Publish) to switch Redline's leaderboards on. It contains Foundry Arena's and Skyhook's rules too, unchanged.

## Development

```bash
npm install
npm run dev            # play at http://localhost:5173
npm test               # physics, race, rivals, drift, daily, account and achievement tests
npm run test:online    # leaderboard tests against local Firebase emulators (needs Java)
npm run build          # production build in dist/
```

`RULES_FILE=firebase/database.rules.full.json npm run test:online` tests the complete console file.

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. It runs the tests, builds and publishes `dist/`.
