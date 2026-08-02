# Prakash vs. The Cloud — Phase 2 (Levels 1–6 + Environmental Cover)

A lightweight, responsive 2D HTML5 Canvas web game built with **Vanilla JavaScript (OOP)** and no dependencies.

## 🎮 How to Run

1. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
2. That's it — **no server, no build step, no npm install** required.

> Works directly from `file://`.

## 🕹️ Controls

| Action        | Input                                        |
| ------------- | -------------------------------------------- |
| Move cloud    | Mouse / Touch drag                           |
| Move cloud    | Left / Right Arrow keys (hold)               |
| Rain          | Hold Left Mouse Button / Touch / Spacebar    |
| Restart       | `R` key or the **Play Again** button         |

## 🎯 Objective

- **Prakash** (a stickman) walks automatically from **HOME** (left) to **OFFICE** (right).
- Move the **rain cloud** over him and **hold to rain**.
- Your rain is **limited** — the RAIN bar drains while you rain.

**WIN:** Soak Prakash to **WETNESS 100%** → *"Game Over — You Soaked Prakash!"*
**LOSE:** He reaches the **Office door** dry, **or** your **rain runs out** before he is fully soaked.

> When soaked (≥50%), Prakash **shivers and slows down 30%** — keep the pressure on!

## 🗺️ Level Progression

| Level | Speed | Rain | Trick |
| ----- | ----- | ---- | ----- |
| 1 · **The Commute** | Normal | Generous | None — learn to aim |
| 2 · **Risky Dash** | +22% | Normal | Prakash **occasionally dashes** (watch for the "!" warning) |
| 3 · **Umbrella Day** | +34% | Tight | Prakash raises a 2s **Umbrella shield** ☂️ that blocks rain |
| 4 · **The Park Walk** | +38% | Tight | **Trees** block your rain 🌳 — soak him *between* the trees |
| 5 · **The Bus Route** | +44% | Tight | He **pauses 2s** at bus stops 🚏, then **sprints** to the next one |
| 6 · **Rush Hour Traffic** | +50% | Scarce | **Cars** drive across the road 🚗 — Prakash hides behind their roofs! |

Beat all 6 levels to claim victory.

## 🧱 Architecture

Clean, modular Object-Oriented design in a single `game.js`:

| Class         | Responsibility                                              |
| ------------- | ----------------------------------------------------------- |
| `Input`       | Mouse / touch / keyboard state, coordinate mapping          |
| `Cloud`       | Fluffy cloud rendering, smooth cursor tracking              |
| `Raindrop`    | Pooled raindrop entity                                      |
| `Splash`      | Pooled splash particle entity                               |
| `RainSystem`  | Object-pooled particle emission, physics, collisions        |
| `Prakash`     | Stickman rendering, sine-driven walk cycle, wetness state, cover AI (dash/pause/follow) |
| `Tree`        | Static environmental cover with canopy that blocks rain      |
| `BusStop`     | Wide static cover with roof that blocks rain; Prakash pauses under it |
| `Car`         | Moving cover that drives across the road, blocking rain      |
| `Game`        | Game loop, world rendering, win/lose logic, HUD updates     |

### Key techniques

- `requestAnimationFrame` loop with **delta-time** clamping → consistent 60 FPS simulation.
- **Object pooling** for raindrops/splashes → zero GC churn.
- Frame-rate independent movement via exponential `lerp`.
- `devicePixelRatio` scaling → crisp rendering on high-DPI displays.
- Responsive layout: canvas scales with CSS while logical resolution stays `800×450`.

## ⚙️ Tuning

All gameplay constants live in the `CONFIG` object at the top of `game.js`:

```js
const CONFIG = {
  rainRate: 42,        // drops per second
  wetGainPerHit: 1.4,  // wetness % per direct hit (~2.5x buff)
  wetToWin: 100,       // soak fully to win
  dryRate: 0.35,       // wetness % lost per second after grace
  wetSlowAt: 50,       // wetness threshold where Prakash slows down
  wetSlowMult: 0.7,    // 30% slow-down when shivering
  // ... etc
};

// Per-level difficulty lives in the LEVELS array
const LEVELS = [
  { walkSpeed: 64, rainMax: 160, rainCost: 5,  dashInterval: Infinity, umbrellaInterval: Infinity },
  { walkSpeed: 78, rainMax: 150, rainCost: 6,  dashInterval: 4.5,      umbrellaInterval: Infinity },
  { walkSpeed: 86, rainMax: 140, rainCost: 7,  dashInterval: 3.5,      umbrellaInterval: 5.5 },
  { walkSpeed: 88, rainMax: 150, rainCost: 7,  coverMode: true, coverData: [{type:'tree',x:190},...] },
  { walkSpeed: 92, rainMax: 145, rainCost: 7,  coverMode: true, pauseAtCover: 2, ... },
  { walkSpeed: 96, rainMax: 140, rainCost: 8,  coverMode: true, coverData: [{type:'car',...},...] },
];
```

Tune `rainCost` / `rainMax` per level to control difficulty. Level 2+ dash
behaviour and Level 3 umbrella timing are configured in `LEVELS`.
Levels 4–6 use `coverMode: true` with `coverData` arrays for trees, bus stops, and cars.

## 🗺️ Roadmap (future phases)

- ☑️ Level progression (Levels 1–3: dashes + umbrella shield) — implemented
- ☑️ Balance patch (rain efficiency, wetness gain, expanded hitbox) — implemented
- ☑️ Environmental cover (Trees, Bus Stops, Cars) — implemented
- ☑️ Levels 4–6 (Park Walk, Bus Route, Rush Hour) — implemented
- ☑️ Level intro banners with title + description — implemented
- Boss cloud / angry lightning mechanics
- Multiple rain types (drizzle, storm) and power-ups
- Sound effects + WebAudio procedural rain ambience
