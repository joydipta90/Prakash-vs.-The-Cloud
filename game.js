/* ============================================================================
 *  Prakash vs. The Cloud  —  Phase 2 (Levels 1–6 + Environmental Cover)
 *  A lightweight 2D HTML5 Canvas game built with Vanilla JavaScript (OOP).
 *
 *  HOW TO RUN:  Simply open index.html in any modern browser. No server,
 *  no build step, no dependencies.
 *
 *  CONTROLS:
 *    - Move cloud   : Mouse / Touch drag   OR  Left/Right Arrow keys (hold)
 *    - Rain         : Hold Left Mouse Button / Touch / Spacebar
 *    - Restart      : R key  (or the button)
 *
 *  GAME RULE:
 *    WIN  -> Soak Prakash to WETNESS 100% in every level.
 *    LOSE -> Prakash reaches the Office door dry, OR your rain runs out.
 *
 *  LEVEL PROGRESSION:
 *    L1 The Commute    : normal walk, generous rain.
 *    L2 Risky Dash     : faster + occasional DASH (watch the "!").
 *    L3 Umbrella Day   : fastest + periodic 2s UMBRELLA shield.
 *    L4 The Park Walk  : TREES block your rain. He dashes between trees!
 *    L5 The Bus Route  : BUS STOPS give 2s pauses, then he sprints onward.
 *    L6 Rush Hour      : CARS drive across; Prakash hides behind their roofs!
 *
 *  ENVIRONMENTAL COVER:
 *    Trees / Bus Stops / Cars block rain. If a drop hits a cover's
 *    rain-block region it is destroyed — Prakash gains NO wetness.
 *
 *  ARCHITECTURE:
 *    Clean OOP: Input, Cloud, RainSystem (pooled drops + splashes),
 *    Tree, BusStop, Car (cover objects), Prakash (AI stickman),
 *    and Game (levels, loop, transitions, HUD).
 * ========================================================================== */
'use strict';

/* ---------------------------------------------------------------------------
 * Small math helpers
 * ------------------------------------------------------------------------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (min, max) => min + Math.random() * (max - min);

/* ---------------------------------------------------------------------------
 * Central configuration — shared across every level.
 * ------------------------------------------------------------------------- */
const CONFIG = {
  width: 800,
  height: 450,
  groundY: 400,
  cloudY: 78,
  cloudWidth: 150,
  cloudSpeed: 6,
  rainRate: 42,
  rainRegen: 0,
  dropGravity: 900,
  dropSpeedMin: 120,
  dropSpeedMax: 220,
  wetGainPerHit: 1.4,
  dryRate: 0.35,
  wetSlowAt: 50,
  wetSlowMult: 0.7,
  wetToWin: 100,
  walkFreq: 9,
  startX: 46,
  endX: 754,
};

/* ---------------------------------------------------------------------------
 * Per-level difficulty.
 *   dashInterval        : seconds between scripted dashes (Infinity = never)
 *   dashDuration        : dash length in seconds
 *   dashMult            : scripted dash speed multiplier
 *   umbrellaInterval    : seconds between umbrella shields (Infinity = never)
 *   umbrellaDuration    : umbrella shield duration in seconds
 *   coverMode           : level uses environmental cover (L4-6)
 *   coverDashMult       : speed multiplier when dashing to next cover
 *   pauseAtCover        : seconds Prakash pauses under a bus stop (L5)
 * ------------------------------------------------------------------------- */
const LEVELS = [
  { // Level 1 — The Commute
    title: 'The Commute',
    desc: 'A normal morning walk. Learn to aim!',
    walkSpeed: 64,
    rainMax: 160,
    rainCost: 5,
    dashInterval: Infinity, dashDuration: 0,   dashMult: 1,
    umbrellaInterval: Infinity, umbrellaDuration: 0,
  },
  { // Level 2 — Risky Dash
    title: 'Risky Dash',
    desc: 'Prakash sometimes dashes — watch for the "!"',
    walkSpeed: 78,
    rainMax: 150,
    rainCost: 6,
    dashInterval: 4.5, dashDuration: 1.2,      dashMult: 1.6,
    umbrellaInterval: Infinity, umbrellaDuration: 0,
  },
  { // Level 3 — Umbrella Day
    title: 'Umbrella Day',
    desc: 'He raises a 2s umbrella that blocks your rain!',
    walkSpeed: 86,
    rainMax: 140,
    rainCost: 7,
    dashInterval: 3.5, dashDuration: 1.4,      dashMult: 1.7,
    umbrellaInterval: 5.5, umbrellaDuration: 2.0,
  },
  { // Level 4 — The Park Walk
    title: 'The Park Walk',
    desc: 'Trees block your rain — soak him between the trees!',
    walkSpeed: 88,
    rainMax: 150,
    rainCost: 7,
    dashInterval: Infinity, dashDuration: 0,   dashMult: 1,
    umbrellaInterval: Infinity, umbrellaDuration: 0,
    coverMode: true,
    coverDashMult: 1.5,
    coverData: [
      { type: 'tree', x: 190 },
      { type: 'tree', x: 350 },
      { type: 'tree', x: 510 },
      { type: 'tree', x: 670 },
    ],
  },
  { // Level 5 — The Bus Route
    title: 'The Bus Route',
    desc: 'He pauses 2s at bus stops, then sprints between them!',
    walkSpeed: 92,
    rainMax: 145,
    rainCost: 7,
    dashInterval: Infinity, dashDuration: 0,   dashMult: 1,
    umbrellaInterval: Infinity, umbrellaDuration: 0,
    coverMode: true,
    coverDashMult: 1.5,
    pauseAtCover: 2,
    coverData: [
      { type: 'busstop', x: 260, w: 110 },
      { type: 'busstop', x: 560, w: 110 },
    ],
  },
  { // Level 6 — Rush Hour Traffic
    title: 'Rush Hour Traffic',
    desc: 'Cars drive across — Prakash hides behind their roofs!',
    walkSpeed: 96,
    rainMax: 140,
    rainCost: 8,
    dashInterval: Infinity, dashDuration: 0,   dashMult: 1,
    umbrellaInterval: Infinity, umbrellaDuration: 0,
    coverMode: true,
    coverDashMult: 1.5,
    coverData: [
      // Cars are dynamic — they spawn and drive. The data here defines
      // the car interval and speed. We'll generate cars in the Game class.
      { type: 'car', interval: 4.5, speed: 72, spawnX: -100 },
      { type: 'car', interval: 6.0, speed: 85, spawnX: -200 },
    ],
  },
];

/* ============================================================================
 * Input — mouse / touch / keyboard state.
 * ========================================================================= */
class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = CONFIG.width / 2;
    this.mouseDown = false;
    this.left = false;
    this.right = false;
    this.space = false;

    canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
    canvas.addEventListener('mousedown', (e) => { e.preventDefault(); this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.mouseDown = true; this.onPointerMove(e);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault(); this.onPointerMove(e);
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault(); this.mouseDown = false;
    }, { passive: false });

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  onPointerMove(e) {
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = clamp((t.clientX - rect.left) * (CONFIG.width / rect.width), 0, CONFIG.width);
  }

  onKey(e, down) {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') e.preventDefault();
    if (e.code === 'ArrowLeft') this.left = down;
    if (e.code === 'ArrowRight') this.right = down;
    if (e.code === 'Space') this.space = down;
  }

  isRaining() { return this.mouseDown || this.space; }
}

/* ============================================================================
 * Cloud — the player's fluffy rain-maker at the top of the screen.
 * ========================================================================= */
class Cloud {
  constructor(game) {
    this.game = game;
    this.x = CONFIG.width / 2;
    this.y = CONFIG.cloudY;
    this.targetX = this.x;
    const w = CONFIG.cloudWidth;
    this.puffs = [
      { dx: -w * 0.34, dy: 8,  r: 24 },
      { dx: -w * 0.12, dy: -6, r: 32 },
      { dx:  w * 0.10, dy: -10, r: 30 },
      { dx:  w * 0.30, dy: 5,  r: 24 },
      { dx:  w * 0.02, dy: 12, r: 26 },
    ];
  }

  update(dt) {
    const input = this.game.input;
    if (input.left || input.right) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.targetX = clamp(this.targetX + dir * 320 * dt, 50, CONFIG.width - 50);
    } else {
      this.targetX = input.mouseX;
    }
    this.x = lerp(this.x, this.targetX, 1 - Math.exp(-CONFIG.cloudSpeed * dt));
  }

  draw(ctx) {
    const cfg = CONFIG;
    const t = this.game.time;
    ctx.save();
    ctx.shadowColor = 'rgba(210,225,255,0.28)';
    ctx.shadowBlur = 22;
    const halo = ctx.createRadialGradient(this.x, this.y, 4, this.x, this.y, cfg.cloudWidth * 0.6);
    halo.addColorStop(0, 'rgba(255,255,255,0.22)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.x, this.y, cfg.cloudWidth * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    for (const p of this.puffs) {
      const bob = Math.sin(t * 1.2 + p.dx) * 1.5;
      ctx.beginPath();
      ctx.arc(this.x + p.dx, this.y + p.dy + bob, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(150,170,205,0.40)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 22, cfg.cloudWidth * 0.42, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ============================================================================
 * RainSystem — object-pooled raindrops + splash particles.
 * ========================================================================= */
class Raindrop {
  constructor() { this.active = false; this.x = 0; this.y = 0; this.vy = 0; }
}
class Splash {
  constructor() {
    this.active = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.life = 0; this.maxLife = 0.35;
  }
}

class RainSystem {
  constructor(game) {
    this.game = game;
    this.emitAcc = 0;
    this.drops = [];
    this.splashes = [];
    for (let i = 0; i < 320; i++) this.drops.push(new Raindrop());
    for (let i = 0; i < 70; i++) this.splashes.push(new Splash());
  }

  emit(dt, x, y) {
    const cfg = CONFIG;
    const level = this.game.levelConfig;
    if (this.game.rain <= 0) { this.emitAcc = 0; return; }
    this.emitAcc += cfg.rainRate * dt;
    const costPerDrop = level.rainCost / cfg.rainRate;
    const spread = cfg.cloudWidth * 0.34;
    let safety = 0;
    while (this.emitAcc >= 1 && safety++ < 60) {
      if (this.game.rain <= 0) { this.emitAcc = 0; break; }
      this.emitAcc -= 1;
      const drop = this.drops.find((d) => !d.active);
      if (!drop) break;
      drop.active = true;
      drop.x = x + rand(-spread, spread);
      drop.y = y;
      drop.vy = rand(cfg.dropSpeedMin, cfg.dropSpeedMax);
      this.game.rain = Math.max(0, this.game.rain - costPerDrop);
    }
  }

  update(dt) {
    const cfg = CONFIG;
    const prakash = this.game.prakash;
    const hb = prakash.hitbox();
    const covers = this.game.activeCovers;

    for (const drop of this.drops) {
      if (!drop.active) continue;
      drop.vy += cfg.dropGravity * dt;
      drop.y += drop.vy * dt;

      // 1. Check collisions with environmental cover (blocks rain!)
      let blocked = false;
      for (const cover of covers) {
        if (cover && typeof cover.rainBlock === 'function' && cover.rainBlock(drop.x, drop.y)) {
          this.spawnSplash(drop.x, drop.y - 4, 1);
          drop.active = false;
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // 2. Collision with Prakash (or his umbrella shield).
      if (drop.y >= hb.top && drop.y <= hb.bottom && drop.x >= hb.left && drop.x <= hb.right) {
        if (prakash.isShielded()) {
          this.spawnSplash(drop.x, drop.y - 6, 1);
          drop.active = false;
          continue;
        }
        this.spawnSplash(drop.x, drop.y, 2);
        drop.active = false;
        prakash.wetness = clamp(prakash.wetness + cfg.wetGainPerHit, 0, 100);
        prakash.lastHitTime = this.game.time;
        continue;
      }

      // 3. Collision with the ground.
      if (drop.y >= cfg.groundY) {
        this.spawnSplash(drop.x, cfg.groundY, 1);
        drop.active = false;
      }
    }

    for (const s of this.splashes) {
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) { s.active = false; continue; }
      s.vy += 500 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  spawnSplash(x, y, count) {
    for (let i = 0; i < count; i++) {
      const s = this.splashes.find((p) => !p.active);
      if (!s) return;
      s.active = true; s.x = x; s.y = y;
      s.vx = rand(-42, 42); s.vy = rand(-72, -22);
      s.life = 0; s.maxLife = rand(0.25, 0.45);
    }
  }

  draw(ctx) {
    ctx.lineCap = 'round';
    for (const drop of this.drops) {
      if (!drop.active) continue;
      const len = Math.min(14, drop.vy * 0.06);
      ctx.strokeStyle = 'rgba(150,210,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y - len);
      ctx.lineTo(drop.x, drop.y);
      ctx.stroke();
    }
    for (const s of this.splashes) {
      if (!s.active) continue;
      const t = 1 - s.life / s.maxLife;
      ctx.globalAlpha = clamp(t * 0.9, 0, 1);
      ctx.fillStyle = 'rgba(170,225,255,0.9)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2 * t + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================================================================
 * Environmental Cover — Trees, Bus Stops, and Cars.
 * Each has a rainBlock(x, y) method that returns true if the drop hits the
 * rain-blocking region.
 * ========================================================================= */
class Tree {
  constructor(x) {
    this.x = x;
    this.trunkW = 8;
    this.trunkH = 28;
    this.canopyR = 26;
    // Full cover rectangle (canopy-span at top down to ground).
    this.coverLeft = x - 22;
    this.coverRight = x + 22;
    this.coverTop = CONFIG.groundY - 72;
    this.coverBottom = CONFIG.groundY - 8;
  }

  /** Returns true if a drop at (dx, dy) is blocked by this tree's canopy. */
  rainBlock(dx, dy) {
    return dx >= this.coverLeft && dx <= this.coverRight &&
           dy >= this.coverTop && dy <= this.coverBottom;
  }

  /** The horizontal span Prakash is "under" (safe zone). */
  safeSpan() {
    return { left: this.x - 18, right: this.x + 18 };
  }

  draw(ctx) {
    const g = CONFIG.groundY;
    // Trunk
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(this.x - this.trunkW / 2, g - this.trunkH, this.trunkW, this.trunkH);
    // Canopy (dark green circles)
    ctx.fillStyle = '#1a4a28';
    ctx.beginPath();
    ctx.arc(this.x, g - this.trunkH - 6, this.canopyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f5a32';
    ctx.beginPath();
    ctx.arc(this.x - 10, g - this.trunkH - 16, this.canopyR * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + 10, g - this.trunkH - 16, this.canopyR * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

class BusStop {
  constructor(x, w) {
    this.x = x;
    this.w = w || 110;
    this.roofH = 10;
    this.poleH = 32;
    // Roof blocks rain.
    this.coverLeft = x - w / 2;
    this.coverRight = x + w / 2;
    this.coverTop = CONFIG.groundY - this.poleH - this.roofH;
    this.coverBottom = CONFIG.groundY - this.poleH;
  }

  rainBlock(dx, dy) {
    return dx >= this.coverLeft && dx <= this.coverRight &&
           dy >= this.coverTop && dy <= this.coverBottom;
  }

  safeSpan() {
    return { left: this.x - this.w / 2 + 4, right: this.x + this.w / 2 - 4 };
  }

  draw(ctx) {
    const g = CONFIG.groundY;
    const h = this.poleH;
    const w = this.w;
    // Poles
    ctx.fillStyle = '#4a6b8a';
    ctx.fillRect(this.x - w / 2 + 4, g - h, 4, h);
    ctx.fillRect(this.x + w / 2 - 8, g - h, 4, h);
    // Roof
    ctx.fillStyle = '#2f477a';
    ctx.fillRect(this.x - w / 2, g - h - this.roofH, w, this.roofH);
    // Sign
    ctx.fillStyle = '#ffd28f';
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUS', this.x, g - h - 4);
  }
}

class Car {
  constructor(x, speed) {
    this.x = x;
    this.speed = speed || 72;
    this.w = 90;
    this.h = 28;
    this.coverLeft = 0;
    this.coverRight = 0;
    this.coverTop = 0;
    this.coverBottom = 0;
    this.updateCover();
    this.active = true;
  }

  updateCover() {
    // Roof blocks rain.
    this.coverLeft = this.x - 20;
    this.coverRight = this.x + 20;
    this.coverTop = CONFIG.groundY - this.h - 8;
    this.coverBottom = CONFIG.groundY - this.h + 4;
  }

  rainBlock(dx, dy) {
    this.updateCover();
    return dx >= this.coverLeft && dx <= this.coverRight &&
           dy >= this.coverTop && dy <= this.coverBottom;
  }

  safeSpan() {
    this.updateCover();
    return { left: this.x - 26, right: this.x + 26 };
  }

  update(dt) {
    this.x += this.speed * dt;
    this.updateCover();
    // Respawn when off-screen right.
    if (this.x > CONFIG.width + 120) {
      this.x = -120;
      this.speed = 65 + Math.random() * 40; // vary speed each lap
    }
  }

  draw(ctx) {
    const g = CONFIG.groundY;
    const w = this.w;
    const h = this.h;
    const bodyY = g - h;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, g - 1, w / 2 + 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(this.x - w / 2, bodyY, w, h);
    // Cabin
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(this.x - w / 4, bodyY - 8, w / 2, 18);
    // Windows
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(this.x - w / 4 + 4, bodyY - 6, 14, 12);
    ctx.fillRect(this.x + 4, bodyY - 6, 14, 12);
    // Wheels
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(this.x - w / 4, g - 4, 6, 0, Math.PI * 2);
    ctx.arc(this.x + w / 4, g - 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ============================================================================
 * Prakash — the stickman. Walks HOME -> OFFICE; AI reacts to wetness and cover.
 * Behaviours: walk, slow-when-wet, umbrella, dash, cover-safe, car-hiding.
 * ========================================================================= */
class Prakash {
  constructor(game) {
    this.game = game;
    this.levelConfig = game.levelConfig;
    this.x = CONFIG.startX;
    this.wetness = 0;
    this.phase = 0;
    this.reachedOffice = false;
    this.lastHitTime = -10;

    // Dash AI (Levels 2-3)
    this.dashTimer = this.levelConfig.dashInterval;
    this.dashActive = false;
    this.dashLeft = 0;

    // Umbrella shield (Level 3)
    this.umbrellaTimer = this.levelConfig.umbrellaInterval;
    this.umbrellaActive = false;
    this.umbrellaLeft = 0;

    // Cover-based AI (Levels 4-6)
    this.coverTargetIndex = 0;           // which cover we're aiming for
    this.coverDashActive = false;        // dashing between covers
    this.coverDashLeft = 0;
    this.pauseTimer = 0;                 // bus-stop pause countdown
    this.isPaused = false;
    this.followCar = null;               // the car we're chasing (L6)
  }

  hitbox() {
    return {
      left: this.x - 18,
      right: this.x + 18,
      top: CONFIG.groundY - 82,
      bottom: CONFIG.groundY - 2,
    };
  }

  isShielded() { return this.umbrellaActive; }

  /** Return true if Prakash is under any cover object (safe from rain). */
  isUnderCover() {
    const covers = this.game.activeCovers;
    for (const cover of covers) {
      if (!cover || !cover.safeSpan) continue;
      const span = cover.safeSpan();
      if (this.x >= span.left && this.x <= span.right) return true;
    }
    return false;
  }

  update(dt) {
    const cfg = this.levelConfig;
    const covers = this.game.activeCovers;

    // --- Scripted dash AI (Levels 2-3) ---
    if (cfg.dashInterval < Infinity) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && !this.dashActive) {
        this.dashActive = true;
        this.dashLeft = cfg.dashDuration;
      }
      if (this.dashActive) {
        this.dashLeft -= dt;
        if (this.dashLeft <= 0) {
          this.dashActive = false;
          this.dashTimer = cfg.dashInterval + rand(-0.8, 0.8);
        }
      }
    }

    // --- Umbrella shield AI (Level 3) ---
    if (cfg.umbrellaInterval < Infinity) {
      this.umbrellaTimer -= dt;
      if (this.umbrellaTimer <= 0 && !this.umbrellaActive) {
        this.umbrellaActive = true;
        this.umbrellaLeft = cfg.umbrellaDuration;
      }
      if (this.umbrellaActive) {
        this.umbrellaLeft -= dt;
        if (this.umbrellaLeft <= 0) {
          this.umbrellaActive = false;
          this.umbrellaTimer = cfg.umbrellaInterval;
        }
      }
    }

    // --- Cover-based AI (Levels 4-6) ---
    if (cfg.coverMode) {
      // Find the nearest cover ahead of us.
      const nextCover = this.findNextCover(covers);

      if (nextCover && this.isAtCover(nextCover)) {
        // We're AT a cover. Safe from rain. Possibly pause (L5) before dashing onward.
        if (cfg.pauseAtCover > 0) {
          this.isPaused = true;
          this.pauseTimer += dt;
          if (this.pauseTimer >= cfg.pauseAtCover) {
            this.isPaused = false;
            this.pauseTimer = 0;
            this.coverDashActive = true;
            this.coverDashLeft = 1.2; // sprint duration
          }
        } else {
          // No pause, just dash to the next cover (L4).
          this.coverDashActive = true;
          this.coverDashLeft = 0.8;
        }
      }

      if (this.coverDashActive) {
        this.coverDashLeft -= dt;
        if (this.coverDashLeft <= 0) {
          this.coverDashActive = false;
        }
      }

      // Car-following (Level 6): find the nearest car ahead.
      if (covers.some(c => c instanceof Car)) {
        this.followCar = this.findNearestCar(covers);
      }
    }

    // --- Movement ---
    if (this.x < CONFIG.endX) {
      let speed = cfg.walkSpeed;

      if (this.wetness > CONFIG.wetSlowAt) speed *= CONFIG.wetSlowMult; // shivers
      if (this.dashActive) speed *= cfg.dashMult;                       // scripted dash
      if (cfg.coverMode) {
        // Cover dash (sprint to next cover)
        if (this.coverDashActive) speed *= cfg.coverDashMult;
        // Car-following: match car speed to stay "behind" it
        if (this.followCar) {
          const car = this.followCar;
          // Walk slightly behind the car's center
          const targetX = car.x - 20;
          if (this.x < targetX - 5) {
            speed = Math.max(speed, car.speed * 0.85);
          } else if (this.x > targetX + 5) {
            speed = Math.min(speed, car.speed * 0.5);
          }
        }
        // Bus-stop pause
        if (this.isPaused) speed = 0;
      }

      // If under cover, optionally slow down (he's safe, taking his time)
      if (this.isUnderCover() && !this.coverDashActive && !this.isPaused) {
        speed *= 0.6;
      }

      this.x = Math.min(CONFIG.endX, this.x + speed * dt);
      this.phase += CONFIG.walkFreq * dt * (speed / cfg.walkSpeed);
    } else {
      this.reachedOffice = true;
    }

    // --- Drying ---
    if (this.game.time - this.lastHitTime > 0.6) {
      this.wetness = Math.max(0, this.wetness - CONFIG.dryRate * dt);
    }
  }

  /** Find the next cover object ahead of the current position. */
  findNextCover(covers) {
    let best = null;
    let bestDist = Infinity;
    for (const cover of covers) {
      if (!cover || !cover.safeSpan) continue;
      const span = cover.safeSpan();
      const cx = (span.left + span.right) / 2;
      if (cx > this.x + 10 && cx - this.x < bestDist) {
        bestDist = cx - this.x;
        best = cover;
      }
    }
    return best;
  }

  /** Check if Prakash is at/near a cover object. */
  isAtCover(cover) {
    if (!cover || !cover.safeSpan) return false;
    const span = cover.safeSpan();
    return this.x >= span.left && this.x <= span.right;
  }

  /** Find the nearest car (for Level 6). */
  findNearestCar(covers) {
    let best = null;
    let bestDist = Infinity;
    for (const cover of covers) {
      if (!(cover instanceof Car)) continue;
      const dist = Math.abs(cover.x - this.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = cover;
      }
    }
    return best;
  }

  /** Render the stickman. */
  draw(ctx) {
    const groundY = CONFIG.groundY;
    const wet = clamp(this.wetness / 100, 0, 1);
    const shaking = this.wetness > CONFIG.wetSlowAt;
    const walk = Math.sin(this.phase);
    const bob = Math.abs(Math.cos(this.phase)) * 2;
    const lean = Math.sin(this.phase) * 1.5;
    const hipX = this.x + lean * 0.4;
    const hipY = groundY - 24 - bob;
    const shoulderX = this.x + lean;
    const shoulderY = hipY - 26;
    const headX = this.x + lean;
    const headY = shoulderY - 20;

    const strokeColor = wet > 0.04
      ? `rgba(${80 + wet * 50}, ${170 + wet * 40}, 255, 1)`
      : '#e6edff';

    ctx.save();
    if (shaking) ctx.translate(rand(-1.6, 1.6), rand(-1.2, 1.2));

    const facingLeft = this.game.state === 'win';
    ctx.save();
    if (facingLeft) { ctx.translate(this.x * 2, 0); ctx.scale(-1, 1); }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x, groundY - 1, 16, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(this.x - 11 * walk, groundY);
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(this.x + 11 * walk, groundY);
    ctx.stroke();

    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + 2);
    ctx.lineTo(shoulderX - 13 * walk - 3, shoulderY + 24);
    ctx.moveTo(shoulderX, shoulderY + 2);
    ctx.lineTo(shoulderX + 13 * walk + 3, shoulderY + 24);
    ctx.stroke();

    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(hipX, hipY);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(headX, headY, 11, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(headX + 3, headY - 2, 1.4, 0, Math.PI * 2);
    ctx.arc(headX + 6, headY - 2, 1.4, 0, Math.PI * 2);
    ctx.fill();

    if (this.wetness > 15) {
      ctx.strokeStyle = `rgba(120,200,255,${0.5 + wet * 0.5})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const t = this.game.time * 2 + i * 1.7;
        const dx = headX - 13 + i * 5;
        const sy = shoulderY + 6 + Math.abs(Math.sin(t)) * 16;
        const len = 2 + Math.abs(Math.sin(t)) * 2;
        ctx.beginPath();
        ctx.moveTo(dx, sy);
        ctx.lineTo(dx, sy + len);
        ctx.stroke();
      }
    }

    if (this.umbrellaActive) this.drawUmbrella(ctx, headX, headY);

    if (this.levelConfig.dashInterval < Infinity && this.dashTimer < 0.6 && !this.dashActive) {
      ctx.fillStyle = '#ffd28f';
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', headX, headY - 26);
    }

    // Cover dash indicator
    if (this.coverDashActive) {
      ctx.fillStyle = '#ffd28f';
      ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('>>', headX, headY - 26);
    }

    // Bus-stop pause indicator
    if (this.isPaused) {
      ctx.fillStyle = '#4fc3f7';
      ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⏸', headX, headY - 26);
    }

    ctx.restore(); // mirror

    if (this.wetness > 20) this.drawWetIcons(ctx, headX, headY);

    if (this.dashActive) {
      ctx.strokeStyle = 'rgba(200,220,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const sx = this.x - 22 - i * 9;
        const sy = hipY - 6 + i * 8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 7, sy);
        ctx.stroke();
      }
    }

    ctx.restore(); // shake

    if (this.game.state === 'win' || this.game.state === 'levelComplete') {
      this.drawBag(ctx);
    }
  }

  drawUmbrella(ctx, hx, hy) {
    ctx.save();
    ctx.strokeStyle = '#4a6b8a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 4);
    ctx.lineTo(hx, hy + 26);
    ctx.stroke();
    ctx.fillStyle = '#3b6ea5';
    ctx.beginPath();
    ctx.arc(hx, hy - 4, 26, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy - 12);
    ctx.lineTo(hx, hy - 4);
    ctx.moveTo(hx, hy - 4);
    ctx.lineTo(hx + 18, hy - 12);
    ctx.stroke();
    ctx.restore();
  }

  drawWetIcons(ctx, hx, hy) {
    const t = this.game.time;
    ctx.fillStyle = 'rgba(120,200,255,0.9)';
    for (let i = 0; i < 3; i++) {
      const dx = hx - 13 + i * 13 + Math.sin(t * 3 + i) * 2;
      const dy = hy - 26 - i * 2 + Math.sin(t * 5 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(dx, dy + 6);
      ctx.quadraticCurveTo(dx - 3.5, dy + 1, dx, dy - 3.5);
      ctx.quadraticCurveTo(dx + 3.5, dy + 1, dx, dy + 6);
      ctx.fill();
    }
  }

  drawBag(ctx) {
    const g = CONFIG.groundY;
    ctx.save();
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(this.x - 26, g - 16, 18, 12);
    ctx.strokeStyle = '#5d3a17';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x - 26, g - 16, 18, 12);
    ctx.beginPath();
    ctx.moveTo(this.x - 26, g - 16);
    ctx.lineTo(this.x - 17, g - 22);
    ctx.lineTo(this.x - 8, g - 16);
    ctx.stroke();
    ctx.restore();
  }
}

/* ============================================================================
 * Game — owns levels, the world, the game loop, and win/lose logic.
 * ========================================================================= */
class Game {
  constructor(canvas) {
    this.canvas = canvas;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CONFIG.width * dpr;
    canvas.height = CONFIG.height * dpr;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = true;

    this.input = new Input(canvas);
    this.cloud = new Cloud(this);

    this.level = 1;
    this.levelConfig = LEVELS[0];
    this.rain = this.levelConfig.rainMax;
    this.state = 'playing';          // 'playing' | 'levelComplete' | 'win' | 'lose' | 'intro'
    this.levelIntroTimer = 0;

    this.time = 0;
    this.lastTime = performance.now();
    this.running = true;

    this.rainSystem = new RainSystem(this);
    this.prakash = new Prakash(this);

    // Cover system (Levels 4-6)
    this.coverObjects = [];
    this.cars = [];

    this.stars = this.makeStars(90);
    this.buildings = this.makeCity();

    this.hudRain = document.getElementById('rainMeter');
    this.hudWet = document.getElementById('wetMeter');
    this.hudRainWrap = document.getElementById('rainWrap');
    this.hudStatus = document.getElementById('hudStatus');
    this.hudLevel = document.getElementById('levelLabel');
    this.hudPower = document.getElementById('powerLabel');
    this.overlay = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('overlayTitle');
    this.overlayMsg = document.getElementById('overlayMsg');
    this.restartBtn = document.getElementById('restartBtn');

    this.restartBtn.addEventListener('click', () => {
      this.restartBtn.blur();
      this.handleRestart();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this.handleRestart();
    });
  }

  /** Build cover objects from the current level config. */
  buildCover() {
    this.coverObjects = [];
    this.cars = [];
    const cfg = this.levelConfig;
    if (!cfg.coverMode) return;

    for (const data of cfg.coverData) {
      if (data.type === 'tree') {
        this.coverObjects.push(new Tree(data.x));
      } else if (data.type === 'busstop') {
        this.coverObjects.push(new BusStop(data.x, data.w));
      } else if (data.type === 'car') {
        const car = new Car(data.spawnX || -100, data.speed);
        this.cars.push(car);
        this.coverObjects.push(car);
      }
    }
  }

  /** Returns the list of active cover objects (for rain collision checks). */
  get activeCovers() {
    return this.coverObjects;
  }

  makeStars(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ x: rand(0, CONFIG.width), y: rand(0, CONFIG.groundY - 90), r: rand(0.6, 1.8), phase: rand(0, Math.PI * 2) });
    }
    return arr;
  }

  makeCity() {
    const list = [];
    let x = -10;
    while (x < CONFIG.width + 20) {
      const w = 42 + Math.random() * 42;
      const h = 46 + Math.random() * 52;
      list.push({ x, w, h });
      x += w + 6;
    }
    return list;
  }

  applyLevel() {
    this.levelConfig = LEVELS[this.level - 1];
    this.rain = this.levelConfig.rainMax;
    this.prakash = new Prakash(this);
    this.rainSystem = new RainSystem(this);
    this.cloud.x = CONFIG.width / 2;
    this.cloud.targetX = this.cloud.x;
    this.buildCover();
    this.overlay.hidden = true;
    this.state = 'intro';
    this.levelIntroTimer = 0;
  }

  reset() { this.level = 1; this.applyLevel(); }
  nextLevel() { this.level = Math.min(LEVELS.length, this.level + 1); this.applyLevel(); }

  handleRestart() {
    if (this.state === 'levelComplete') this.nextLevel();
    else this.reset();
  }

  completeLevel() {
    if (this.level < LEVELS.length) {
      this.state = 'levelComplete';
      this.showOverlay('levelComplete');
    } else {
      this.state = 'win';
      this.showOverlay('win');
    }
  }

  lose(reason) { this.state = 'lose'; this.showOverlay('lose', reason); }

  showOverlay(type, reason) {
    this.overlay.hidden = false;
    const btn = this.restartBtn;
    if (type === 'levelComplete') {
      this.overlayTitle.textContent = `💧 LEVEL ${this.level} SOAKED!`;
      this.overlayMsg.textContent =
        `Prakash is drenched! Next up: Level ${this.level + 1} — ${this.levelConfig.title}`;
      btn.textContent = 'Next Level → (R)';
    } else if (type === 'win') {
      this.overlayTitle.textContent = '💦 GAME OVER — YOU SOAKED PRAKASH!';
      this.overlayMsg.textContent =
        'Soaked to the bone, he drops his bag and trudges back home. Prakash never made it to the Office!';
      btn.textContent = 'Play Again (R)';
    } else {
      this.overlayTitle.textContent = reason === 'rain'
        ? '🪫 OUT OF RAIN!'
        : '🏢 PRAKASH MADE IT TO WORK DRY';
      this.overlayMsg.textContent = reason === 'rain'
        ? 'Your rain ran out while Prakash was still dry — he made it to work. Try again!'
        : 'He reached the Office door before you could soak him. Try again!';
      btn.textContent = 'Play Again (R)';
    }
  }

  update(dt) {
    this.time += dt;

    if (this.state === 'intro') {
      this.levelIntroTimer += dt;
      if (this.levelIntroTimer > 2.0) this.state = 'playing';
      return;
    }

    if (this.state !== 'playing') return;

    this.cloud.update(dt);

    // Update cars (Level 6)
    for (const car of this.cars) {
      if (car.update) car.update(dt);
    }

    if (this.input.isRaining() && this.rain > 0) {
      this.rainSystem.emit(dt, this.cloud.x, this.cloud.y + 18);
    }

    if (CONFIG.rainRegen > 0) {
      this.rain = Math.min(this.levelConfig.rainMax, this.rain + CONFIG.rainRegen * dt);
    }

    this.prakash.update(dt);
    this.rainSystem.update(dt);

    if (this.prakash.wetness >= CONFIG.wetToWin) { this.completeLevel(); return; }
    if (this.prakash.reachedOffice) { this.lose('office'); return; }
    if (this.rain <= 0) { this.lose('rain'); }
  }

  /* ======================== RENDERING ======================== */

  draw() {
    const ctx = this.ctx;
    this.drawSky(ctx);
    this.drawCity(ctx);
    this.drawGround(ctx);
    this.drawHome(ctx);
    this.drawOffice(ctx);

    // Draw cover objects (behind Prakash, above the ground).
    for (const cover of this.coverObjects) {
      if (cover.draw) cover.draw(ctx);
    }

    this.prakash.draw(ctx);
    this.cloud.draw(ctx);
    this.rainSystem.draw(ctx);

    // Level intro overlay (brief banner).
    if (this.state === 'intro') {
      this.drawLevelIntro(ctx);
    }
  }

  drawLevelIntro(ctx) {
    const cfg = this.levelConfig;
    const progress = Math.min(this.levelIntroTimer / 2.0, 1);
    const alpha = progress < 0.15 ? progress / 0.15 : (progress > 0.85 ? (1 - progress) / 0.15 : 1);
    ctx.save();
    ctx.globalAlpha = clamp(alpha * 0.95, 0, 1);
    ctx.fillStyle = 'rgba(6,9,19,0.85)';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4fc3f7';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Level ${this.level}`, CONFIG.width / 2, CONFIG.height / 2 - 24);
    ctx.fillStyle = '#e3ecff';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(cfg.title, CONFIG.width / 2, CONFIG.height / 2 + 20);
    ctx.fillStyle = '#9fc3ff';
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(cfg.desc, CONFIG.width / 2, CONFIG.height / 2 + 60);
    ctx.restore();
  }

  drawSky(ctx) {
    const cfg = CONFIG;
    const sky = ctx.createLinearGradient(0, 0, 0, cfg.height);
    sky.addColorStop(0, '#0a0f22');
    sky.addColorStop(0.55, '#131b38');
    sky.addColorStop(1, '#1b2a4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cfg.width, cfg.height);

    ctx.save();
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.4 + s.phase));
      ctx.globalAlpha = tw * 0.9;
      ctx.fillStyle = '#cfe2ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = 'rgba(220,235,255,0.8)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.arc(688, 70, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10,15,34,0.85)';
    ctx.beginPath();
    ctx.arc(699, 62, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCity(ctx) {
    const cfg = CONFIG;
    ctx.save();
    for (const b of this.buildings) {
      const base = cfg.groundY;
      ctx.fillStyle = 'rgba(8,12,26,0.92)';
      ctx.fillRect(b.x, base - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(255,214,130,0.13)';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          const wx = b.x + 7 + col * (b.w * 0.45);
          const wy = base - b.h + 8 + row * 13;
          ctx.fillRect(wx, wy, Math.min(9, b.w * 0.24), 6);
        }
      }
    }
    ctx.restore();
  }

  drawGround(ctx) {
    const cfg = CONFIG;
    const g = ctx.createLinearGradient(0, cfg.groundY, 0, cfg.height);
    g.addColorStop(0, '#101a30');
    g.addColorStop(1, '#070c18');
    ctx.fillStyle = g;
    ctx.fillRect(0, cfg.groundY, cfg.width, cfg.height - cfg.groundY);
    ctx.strokeStyle = 'rgba(120,160,220,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cfg.groundY);
    ctx.lineTo(cfg.width, cfg.groundY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,160,220,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < cfg.width; x += 80) {
      ctx.moveTo(x, cfg.groundY + 6);
      ctx.lineTo(x, cfg.groundY + 10);
    }
    ctx.stroke();
  }

  drawHome(ctx) {
    const x = 30;
    const base = CONFIG.groundY;
    const w = 44;
    const h = 42;
    ctx.save();
    ctx.fillStyle = '#24365c';
    ctx.fillRect(x - w / 2, base - h, w, h);
    ctx.fillStyle = '#2f477a';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 6, base - h);
    ctx.lineTo(x, base - h - 22);
    ctx.lineTo(x + w / 2 + 6, base - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd28f';
    ctx.fillRect(x - 5, base - 14, 10, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOME', x, base - h - 30);
    ctx.restore();
  }

  drawOffice(ctx) {
    const x = CONFIG.endX;
    const base = CONFIG.groundY;
    const w = 54;
    const h = 78;
    ctx.save();
    ctx.fillStyle = '#1d2c4f';
    ctx.fillRect(x - w / 2, base - h, w, h);
    ctx.strokeStyle = '#1d2c4f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, base - h);
    ctx.lineTo(x, base - h - 14);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,130,0.5)';
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillRect(x - w / 2 + 8 + col * 20, base - h + 10 + row * 16, 12, 9);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFICE', x, base - h - 20);
    ctx.restore();
  }

  updateHUD() {
    this.hudRain.style.width = this.rain + '%';
    this.hudWet.style.width = this.prakash.wetness + '%';
    this.hudRainWrap.classList.toggle('low', this.rain < 20);
    this.hudLevel.textContent = `LV ${this.level}/${LEVELS.length}`;

    if (this.state === 'playing') {
      this.hudStatus.textContent = 'GO!';
      this.hudStatus.style.color = '#9fc3ff';
    } else if (this.state === 'levelComplete') {
      this.hudStatus.textContent = 'LEVEL UP!';
      this.hudStatus.style.color = '#ffd28f';
    } else if (this.state === 'win') {
      this.hudStatus.textContent = 'SOAKED!';
      this.hudStatus.style.color = '#7cfc98';
    } else {
      this.hudStatus.textContent = 'DRY!';
      this.hudStatus.style.color = '#ff7a7a';
    }

    const p = this.prakash;
    if (p.umbrellaActive) {
      this.hudPower.textContent = '☂️ SHIELD';
      this.hudPower.classList.add('power-active');
    } else if (p.dashActive || p.coverDashActive) {
      this.hudPower.textContent = '⚡ DASH';
      this.hudPower.classList.add('power-active');
    } else if (p.isPaused) {
      this.hudPower.textContent = '⏸ PAUSED';
      this.hudPower.classList.add('power-active');
    } else {
      this.hudPower.textContent = '';
      this.hudPower.classList.remove('power-active');
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    this.updateHUD();
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  game.start();
  window.__game = game;
});
