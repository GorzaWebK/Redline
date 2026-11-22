# Redline

A time trial racing game for the browser. Pick a circuit, find the racing line, beat your ghost and take the gold.

**Play:** https://gorzawebk.github.io/Redline/

Plays on PC (keyboard or gamepad) and on phones and tablets (touch controls, best held sideways). Everything is made in code: the cars, circuits, scenery, textures, sky, sound effects and music. There are no image or audio files.

> "Redline" is a working title.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Accelerate (W, S, A, D, Space, C, R and V can be changed on the Controls screen) |
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
- **Race rivals:** Race five AI drivers from a staggered grid. Each has a personality and their own car:
  - **Kade Mercer** (racer, Redline GT): attacks and defends hard.
  - **Rosa Vance** (smooth, Pocket Rocket): rarely makes a mistake.
  - **Tomi Hale** (rookie, Redline GT): quick, but often brakes too late or runs wide.
  - **Ines Duarte** (defender, Apex V10): covers the inside when you're close behind.
  - **Ozzy Kwan** (wild, Thunderbolt): goes for every gap and makes mistakes.

  They pass on the inside of the next corner, move over to defend, bump into you and each other, and a faster car is held back in the corners so the AI level (Easy, Normal or Hard, in Settings) means the same whatever you drive. Following closely gives a **slipstream** (less drag). Rival mistakes flash up on screen.
  - **Starting grid:** before each race choose the back of the grid, a random grid, or **qualifying**: one lap on your own, and your time against the rivals' sets your grid slot (pole if you're fastest).
  - **Laps:** 1, 3 or 5.
  - **Weather:** the circuit's own, dry, rain, or **rain later**, where the rain arrives partway through: the sky greys over, the road gets wet and shiny, grip drops and the AI slows to suit.
  - **Time of day:** day, sunset or night (street lamps and headlights).
  - In the race: your position, the **live gap** in seconds to the cars just ahead and behind, and a flash when you gain or lose a place.
- **Championship:** One cup per setting. Six races against the same five rivals, scoring 10, 8, 6, 4, 2 and 1 points, with the standings shown between races. Finish the cup in the top three for a trophy. You can stop a cup and continue it later.
- **Daily challenge:** A new circuit every day (UTC), the same for everyone. The difficulty, setting and weather change from day to day, and like every circuit it's proven drivable by the autopilot first. It has its own online leaderboard (the first page of Leaderboards) and a streak for days in a row.
- **Weekly tournament:** One circuit a week (Monday to Sunday, UTC) that everyone drives in the **same car**, stock (no tuning), with its own leaderboard (the second page of Leaderboards). It rotates through Grand Prix, classic and figure-of-eight layouts. Medals pay drift points into your wallet once per week: bronze 1,500, silver 3,000, gold 6,000.
- **Community circuits** (Tracks → Community): draw your own circuit in the **track editor**, a top-down map where you place the points the road runs through (click the dotted line to add a point, drag to move, double-click or hold to remove; pan and zoom). It previews the smoothed road as you go and says what's wrong if it can't be built (corners too tight, parts too close together). Choose the name, setting, road width and how hilly it is. **Test drive** it any time. To **publish**, the autopilot first has to get round cleanly, which also sets its gold time. Published circuits appear for everyone under Newest and Most liked, each with its own leaderboard, and players can like them (once each). Editing a published circuit makes a new copy.
- **Online race:** race up to seven friends live. One player hosts a room (choosing the circuit and 1, 3 or 5 laps) and shares its five-letter code; the others join with it. The room shows everyone's name, car and paint, and the host starts the race when everyone's in. Each player drives their own car on their own computer and sends where it is 20 times a second, so the other cars move smoothly with name tags and positions, and the results table fills in as people finish. Cars don't collide online, so nobody's lag can knock you off. Afterwards everyone goes back to the room for another race. It's peer-to-peer like Foundry Arena (PeerJS's free matchmaking server, then direct connections between players); `?net=local` links tabs of the same browser instead, for testing.

### Circuits
- **30 circuits** in five settings of six: **Meadow** (green hills, day), **Canyon** (desert and red mesas), **Alpine** (snowy passes at golden hour), **Night City** (street lights, glowing towers, headlights) and **Riviera** (sunny coast). Every race is 3 laps from a standing start, with a countdown on the start gantry's lights.
- **Riviera Grand Prix circuits (25-30):** built a different way from the rest, piece by piece like a real Grand Prix track: long straights into tight hairpins, chicanes, fast kinks and double hairpins. Two of them (Crossover and Bridgeworks) are **figures of eight**, where the track crosses itself on a bridge with a deck and pillars.
- **Rain** on four circuits (4, 11, 16 and 22): less grip, a grey sky, falling rain, spray off the tyres and a shiny wet road. Their gold times are set in the wet.
- **Difficulty:** Circuits get longer (0.8 km up to 1.9 km a lap), narrower, hillier and twistier, with tighter hairpins, as you go. All 30 are open from the start: race them in any order.

### Cars, tuning and driving
- **Four cars**, each with its own handling, body shape and engine sound:
  - **Redline GT:** the all-rounder.
  - **Pocket Rocket:** a light hatchback that brakes late and turns in like a go-kart.
  - **Thunderbolt:** a V8 muscle car built for long, smoky drifts. Unlocks with 8 medals.
  - **Apex V10:** a screaming hypercar, the fastest of the four. Unlocks with gold on 12 circuits.
- **Drift wallet and tuning shop:** Every drift point you score is banked in your wallet when a race ends (shown on the menu, finish screen and garage). Spend it in Garage → Tuning on kits for each car, which unlock a setting for good:
  - **Gearbox**: short gears pull harder out of slow corners but hit a rev limiter; long gears give a higher top speed.
  - **Grip balance**: a loose rear turns in sharply and drifts easily; a planted rear is stable but pushes wide.
  - **Brake bias**: rear bias helps the car rotate as you brake into a corner; front bias keeps it straight.

  A full set costs 90,000 points for the Redline GT (72,000 for the Pocket Rocket, 108,000 for the Thunderbolt, 135,000 for the Apex V10). Presets (Stock, Grip, Drift, Top speed) set every kit you own at once. Tuning changes the feel more than the lap time, so medals stay fair. (Older saves start with every drift point scored before the wallet existed.)
- **Grippy, precise handling:** The car is a proper physics model: grip that builds and then lets go, weight shifting forward under braking and back under power, drag, engine power and hills that slow you down or speed you up. Traction control and a light stability assist keep it controllable on a keyboard. Grass is slow and slippery, and the walls scrub off your speed.
- **Drifting:** Flick the **handbrake** (Space) going into a corner, then stay on the throttle and keep steering into the corner: the car holds the drift for you (more steering = a deeper drift, about 17-25 degrees). Centre the steering, countersteer or lift off and it straightens up and grips again. While sliding, the car's momentum swings round towards where the nose points, so a drift carries you through the corner. A tidy drift is about as quick as gripping; a wild one costs speed.
- **Drift score:** Points for every drift (more angle and more speed = more points), with a multiplier up to x5 for keeping a drift going and a chain that links drifts together. Running onto the grass banks the chain; hitting a wall loses it.
- **Braking:** ABS with cornering control, so braking into a corner slows you without throwing the car sideways. Hold the brake when stopped to reverse.
- **Launch control:** During the countdown, tap the throttle to hold the revs in the green zone on the rev bar. Get it right for a perfect start; too many revs is wheelspin and too few bogs the engine down.
- **Kerbs** rumble (sound, camera judder, gamepad vibration) and unsettle the car: less grip the further onto them you go (more in the wet) and a jolt from each stripe, stronger at speed.
- **Damage** (cosmetic): wall hits and contact bash the part that took the hit. Trim hangs off, the wing tilts, lights break and the paint gets scuffed. The rivals' cars get damaged too.

### Help on track
- **Racing line guide:** A line on the road shows the fastest way round. It's **green** where you can go flat out, **yellow** through corners and **red** where you should brake. Switch it off in Settings or with **L**.
- **Driving hints** on the first three circuits: a **BRAKE** prompt when you're coming into a corner too fast, and a tip to try a drift on the first tight corner (Settings to switch off).
- **Medals:** Every circuit has gold, silver and bronze times **for each car**. Gold is the autopilot's own time in that car, silver is 10% slower and bronze 25% slower, so the Apex V10 has to be much quicker for gold than the Pocket Rocket. The HUD and the track cards show the medals for the car you're driving; a circuit's medal (for unlocks and achievements) is the best you've won there in any car.
- **Ghosts:** drawn as the car they were driven in. Your best run on each circuit is recorded, and next time you race a see-through cyan copy of it. Online you can also race the **world record holder's ghost** (gold, with their name and time floating over it). Choose your best, world record, both or off in Settings (or **G** while driving).
- **Sector times:** Each lap has three sectors. The time at each one is coloured **purple** (your fastest ever), **green** (faster than on your best run) or **yellow** (slower). The finish screen shows your theoretical best lap: your best sectors added up.
- **Rear-view mirror** at the top of the screen in races (Settings: in races, always or off). Tyre smoke is light, thinner on phones, and never drawn in the mirror.
- **Colour-blind mode** (Settings): sector times get symbols (◆ ▲ ▼), and the racing line, gaps and flashes use blue and orange instead of green and red.
- **Minimap** with you, the rivals and your ghosts, plus a **WRONG WAY** warning.

### Replays and photos
- **Replays:** Watch your run from the finish screen (**P**), or the world record from the Leaderboards page, filmed by trackside TV cameras that cut and zoom as the car goes by. Space pauses, the arrows skip 5 seconds, 1/2/3 set the speed and C switches to a chase camera.
- **Photo mode:** From the pause menu: move a free camera around the car (drag, WASD, Q/E and the mouse wheel), then press Enter to save a picture.

### Progress
- **Achievements:** 26 to earn, with a pop-up when you get one. They cover finishing and medals, mastering each setting, clean races, rain, drifting, launches, race wins, cups, daily streaks, distance and top speed, collecting the cars and photo mode. Three unlock paints: Carbon, Neon and Chrome.
- **Garage:** Choose your car and one of 15 paints. Three paints are free; the rest unlock with medals and achievements (up to Gold Leaf for gold on 24 circuits).
- **Profile:** Stats (races, wins, cups, laps, distance, time, top speed, drift points, medals and the daily streak), the achievements list and your account code.
- **Online leaderboards:** A top 10 for every circuit and for each day's daily challenge, showing each driver's car, with your world rank. Filter by car (All cars, Redline GT, Pocket Rocket, Thunderbolt, Apex V10): each car has its own board, its own world record and record ghost. Your time is sent when you finish, and you set your driver name on the Leaderboards page.
- **Account codes:** Profile → Account code gives you a secret code like `ABCD-EFGH-JKLM-NPQR`. It saves your progress online a few seconds after anything changes: best times, medals, unlocks, trophies, achievements, stats, name, car and paint. Type it into Redline in another browser to carry on there. Playing on two computers is fine, because saves are merged (fastest times, every unlock and the highest stats). It works like a password.
- **Cameras:** Chase, far chase, hood and bumper. The view widens with speed, and the camera shakes on wall hits (can be switched off).
- **Sound and music:** A synthesised engine per car that revs through six gears, tyre squeal, kerb rumble, grass rumble, wind, rain, wall hits and countdown beeps. In races you hear the **rivals' engines** around you, panned left and right, louder when close, and pitched up as they come at you and down as they pass. The generated soundtrack has a **song per setting** (Green Flag, Heat Haze, Summit, Neon Mile, Coastline) and its own menu theme (Garage Lights). Each song builds with drums, bass and an arpeggio as you speed up.
- **Watch the autopilot:** The link under the main menu lets the autopilot drive the next circuit.
- **Settings:** Graphics quality (High, Medium, Low), **dynamic resolution** (draws fewer pixels when the frame rate drops, then comes back up), camera, km/h or mph, field of view, racing line, ghost, AI level, rear-view mirror, driving hints, gamepad vibration, camera shake, effects and music volume, mute an FPS counter and colour-blind mode. All are saved. Cars are drawn with as few parts as possible (about half the draw calls of before), so six cars run more smoothly on phones.

## How it's built

- Plain JavaScript + [Vite](https://vite.dev), [three.js](https://threejs.org) for 3D, the Web Audio API for sound, and Firebase for the online leaderboards.
- Circuits are generated from a seed and a difficulty (`src/track.js`). The same seed always gives the same circuit: a closed loop from a smoothed spline, with corners no tighter than the difficulty allows, no part close enough to another to share a wall, gentle hills, and the start on the straightest stretch. The racing line is worked out by repeatedly pulling each point of the line straighter within the road's width. The Riviera circuits are laid out piece by piece instead (a straight, then a hairpin, chicane, kink or corner, and so on), with the last two straights solved so the loop closes exactly; a figure of eight is a lemniscate whose crossing is lifted onto a bridge.
- The physics (`src/car.js`) and race rules (`src/race.js`) contain no drawing code. They run on a fixed 120 Hz timestep, so a run plays the same at any frame rate and can be tested in Node.
- The autopilot (`src/bot.js`) drives the racing line at the fastest speed the grip allows, braking in time for each corner. `scripts/find-seeds.mjs` picks a seed for each circuit that the autopilot drives cleanly (no wall hits, no grass) and records its 3-lap time as the gold medal time, in `src/track-seeds.js`. Rerun it (`npm run seeds`) after changing the generator, the car or the autopilot.
- The AI rivals (`src/rivals.js`) are the same autopilot with a little less grip and pace, each shifted off the racing line by its own amount, with a personality: how often they make a (seeded) mistake, how hard they attack and how much they defend. A rival in a faster car than yours has its cornering speed scaled down so lap times stay balanced. Cars collide as two circles each, pushing apart and trading speed. A stuck rival is put back on the road.
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
| `src/weekly.js` | The weekly tournament: this week's circuit and car, prizes |
| `src/tuning.js` | Tuning kits, prices and presets, and the tuned car physics |
| `src/community.js` | Community circuits: building, checking and sharing editor layouts |
| `src/editor.js` | The track editor (top-down map) |
| `src/netrace.js` | Online races: rooms, passing cars' positions and finishes between players |
| `src/transport.js` | Peer-to-peer connections (PeerJS, or tabs of one browser for testing) |
| `src/achievements.js` | The achievements |
| `src/account.js` | Account codes: packing and merging saves |
| `src/replay.js` | Replay TV cameras and the director that picks them |
| `src/hints.js` | Driving hints for the first circuits |
| `src/race.js` | Countdown, laps, sectors, finish, putting the car back on track |
| `src/bot.js` | The autopilot and its speed plan |
| `src/tracks.js` | The 30 circuits: names, themes, styles, difficulty, medal times per car |
| `src/track-seeds.js` | Checked seeds and gold times (written by `scripts/find-seeds.mjs`) |
| `src/world.js` | Builds the 3D world: road, kerbs, walls, gantry, grandstand, terrain, scenery, sky, light |
| `src/themes.js` | The five settings (sky, light, ground, scenery) |
| `src/carModel.js` | The car model and paints |
| `src/effects.js` | Tyre smoke, skid marks, sparks |
| `src/ghost.js` | Recording, packing and playing back ghosts |
| `src/online.js` | Online leaderboards and world record ghosts (Firebase) |
| `src/online-config.js` | Firebase web config (null = online off) |
| `src/audio.js` | Synthesised engine and sound effects |
| `src/music.js` | Generated music that follows your speed |
| `src/input.js` | Keyboard (with your own keys), gamepad, touch and tilt |
| `src/save.js` | Saving in the browser |
| `src/textures.js` | Textures drawn on a canvas |
| `firebase/database.rules.json` | Redline's security rules on their own |
| `firebase/database.rules.full.json` | Complete rules file for the Firebase console (Foundry Arena + Skyhook + Redline) |

## Online leaderboards

Redline uses the same Firebase project as Foundry Arena and Skyhook ("foundry-arena"), with its own `redline/` section:

- `redline/scores/t<N>/<uid>`: `{ name, time, lap, car, at }`, one best per driver per circuit (1-30).
- `redline/ghosts/t<N>/<uid>`: `{ time, data, at }`, the recording of that best.
- Daily challenge boards are named `d20261119` (one per day) instead of `t<N>`.
- Weekly tournament boards are `w202647` (year and week), community circuits `u<id>`.
- Every board also has one board per car: `t5_hyper` is the Apex V10's board on circuit 5 (the security rules check the car matches).
- `redline/community/<id>`: `{ name, author, pts, theme, width, hills, gold, uid, at, likes }`, a shared circuit. Only its author can publish or remove it.
- `redline/votes/<id>/<uid>`: one like per player; the rules only let `likes` go up by one in the same write as a new vote.
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
