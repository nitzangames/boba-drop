# Boba Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a capsule-merging puzzle game (Boba Drop) using the Physics2D engine, deployed to the Play Nitzan Games platform.

**Architecture:** Single `game.js` ES module drives the game loop, state machine, rendering, input, and pools. Physics2D (copied into `physics2d/`) handles rigid body simulation and collision detection. All rendering is on a single HTML5 Canvas at 1080x1920 logical resolution. Pre-allocated pools for cups (64) and particles (96) avoid GC pressure.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML5 Canvas 2D, Physics2D engine (custom), no build tools.

**Spec:** `docs/superpowers/specs/2026-04-08-boba-drop-design.md`

**Reference GDD:** `/Users/nitzanwilnai/Programming/Claude/SuikaGame/docs/superpowers/specs/2026-04-08-boba-drop-js-canvas-design.md`

---

## File Structure

```
SuikaGame/
├── index.html              — Canvas element, CSS scaling, loads game.js
├── game.js                 — All game logic (~800-1000 lines)
├── meta.json               — Platform metadata
├── thumbnail.png           — Platform thumbnail (created manually later)
└── physics2d/              — Copied from Physics2D engine
    ├── index.js
    └── src/
        ├── math.js
        ├── shapes.js
        ├── body.js
        ├── world.js
        ├── collision.js
        ├── debug.js
        └── raycast.js
```

`game.js` is intentionally a single file. At ~800-1000 lines for a canvas game, splitting would add import overhead without meaningful organizational benefit.

---

### Task 1: Project Scaffold — Copy Physics2D, Create index.html and meta.json

**Files:**
- Create: `physics2d/` (copy from `/Users/nitzanwilnai/Programming/Claude/JSGames/Physics2D/`)
- Create: `index.html`
- Create: `meta.json`

- [ ] **Step 1: Copy Physics2D engine into the project**

```bash
cp -r /Users/nitzanwilnai/Programming/Claude/JSGames/Physics2D/index.js /Users/nitzanwilnai/Programming/Claude/JSGames/SuikaGame/physics2d/index.js
cp -r /Users/nitzanwilnai/Programming/Claude/JSGames/Physics2D/src /Users/nitzanwilnai/Programming/Claude/JSGames/SuikaGame/physics2d/src
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Boba Drop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: #2c2c2c;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script type="module" src="game.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create meta.json**

```json
{
  "slug": "boba-drop",
  "title": "Boba Drop",
  "description": "Drop and merge boba cups! Match same-tier cups to combine them into bigger, rarer drinks. How high can you score?",
  "tags": ["puzzle", "physics", "merge"],
  "author": "Nitzan",
  "thumbnail": "thumbnail.png"
}
```

- [ ] **Step 4: Create minimal game.js that imports Physics2D and draws background**

```js
import { World, Body, Capsule, Edge, Vec2 } from './physics2d/index.js';

// --- Constants ---
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SCALE = 154;        // pixels per world unit (~1080 / 7)
const X_OFFSET = 540;     // center of canvas
const Y_OFFSET = 100;     // top padding for HUD
const BG_COLOR = '#FAF5F0';

// --- Canvas Setup ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// --- Game Loop ---
let lastTime = 0;

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  // Clear and draw background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

- [ ] **Step 5: Verify — open index.html in browser**

Expected: A warm beige (#FAF5F0) canvas centered in the window, 9:16 aspect ratio with dark gray letterboxing. No errors in console.

- [ ] **Step 6: Commit**

```bash
git add index.html game.js meta.json physics2d/
git commit -m "feat: scaffold boba drop project with Physics2D engine"
```

---

### Task 2: Tier Data and Coordinate Helpers

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add tier data table and coordinate conversion functions**

Add after the constants section in `game.js`:

```js
// --- Tier Data ---
const TIERS = [
  { name: 'Milk Tea',       radius: 0.30, score: 10,  color: '#d4a574' },
  { name: 'Matcha',          radius: 0.36, score: 20,  color: '#7ec87e' },
  { name: 'Strawberry',      radius: 0.42, score: 30,  color: '#f48da6' },
  { name: 'Taro',            radius: 0.48, score: 40,  color: '#b49cd4' },
  { name: 'Thai Tea',        radius: 0.54, score: 50,  color: '#e8945a' },
  { name: 'Mango',           radius: 0.60, score: 60,  color: '#f0c850' },
  { name: 'Brown Sugar',     radius: 0.66, score: 80,  color: '#8b5e3c' },
  { name: 'Honeydew',        radius: 0.75, score: 100, color: '#a8d8a8' },
  { name: 'Ube',             radius: 0.84, score: 130, color: '#7b5ea7' },
  { name: 'Passion Fruit',   radius: 0.96, score: 170, color: '#d4607a' },
  { name: 'Lychee',          radius: 1.08, score: 250, color: '#f0e8e0' },
];
const TIER_COUNT = 11;
const MAX_DROP_TIER = 4;

// Pre-built capsule shapes (one per tier, reused by reference)
const TIER_SHAPES = TIERS.map(t => new Capsule(t.radius * 1.2, t.radius));

// Mass for a tier (area-proportional)
function tierMass(tier) {
  const r = TIERS[tier].radius;
  return r * r * 10;
}

// --- Coordinate Helpers ---
function worldToCanvasX(wx) {
  return wx * SCALE + X_OFFSET;
}

function worldToCanvasY(wy) {
  return wy * SCALE + Y_OFFSET;
}

function canvasToWorldX(cx) {
  return (cx - X_OFFSET) / SCALE;
}

function canvasToWorldY(cy) {
  return (cy - Y_OFFSET) / SCALE;
}
```

- [ ] **Step 2: Verify — open browser, check no console errors**

Expected: Same beige canvas as before, no errors. Tier data is defined but not yet rendered.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: add tier data table and coordinate helpers"
```

---

### Task 3: Physics World and Container

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add gameplay constants and container geometry**

Add after the coordinate helpers in `game.js`:

```js
// --- Gameplay Constants ---
const MAX_CUPS = 64;
const MAX_PARTICLES = 96;
const MAX_MERGES = 32;
const DROP_COOLDOWN = 0.5;
const GAME_OVER_TIME = 3.0;
const DROP_Y = 2.0;
const LEFT_BOUND = -2.5;
const RIGHT_BOUND = 2.5;
const WARNING_Y = 4.25;
const MERGE_POP_VY = -2.0;
const GRAVITY = 9.81;
const PHYSICS_DT = 1 / 120;
const CUP_RESTITUTION = 0.1;
const CUP_FRICTION = 0.4;

// Container points (Y-down, world units)
const CONTAINER_POINTS = [
  { x: -3.0, y: 0.0 },    // left rim
  { x: -3.5, y: 10.0 },   // left wall
  { x: -2.8, y: 11.2 },   // left bottom curve
  { x: -1.0, y: 11.8 },   // bottom left
  { x:  1.0, y: 11.8 },   // bottom right
  { x:  2.8, y: 11.2 },   // right bottom curve
  { x:  3.5, y: 10.0 },   // right wall
  { x:  3.0, y: 0.0 },    // right rim
];
```

- [ ] **Step 2: Create the physics world and add container edge bodies**

Add after the container points:

```js
// --- Physics World ---
const world = new World({
  gravity: new Vec2(0, GRAVITY),
  fixedDt: PHYSICS_DT,
});

// Create container walls (7 edge segments)
for (let i = 0; i < CONTAINER_POINTS.length - 1; i++) {
  const a = CONTAINER_POINTS[i];
  const b = CONTAINER_POINTS[i + 1];
  const edge = new Edge(new Vec2(a.x, a.y), new Vec2(b.x, b.y));
  world.addBody(new Body({
    shape: edge,
    position: new Vec2(0, 0),
    isStatic: true,
    friction: CUP_FRICTION,
    restitution: CUP_RESTITUTION,
  }));
}
```

- [ ] **Step 3: Draw the container in the render loop**

Replace the game loop section in `game.js`:

```js
// --- Rendering Helpers ---
function drawContainer() {
  ctx.beginPath();
  ctx.moveTo(worldToCanvasX(CONTAINER_POINTS[0].x), worldToCanvasY(CONTAINER_POINTS[0].y));
  for (let i = 1; i < CONTAINER_POINTS.length; i++) {
    ctx.lineTo(worldToCanvasX(CONTAINER_POINTS[i].x), worldToCanvasY(CONTAINER_POINTS[i].y));
  }
  ctx.strokeStyle = '#8b5e3c';
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

// --- Game Loop ---
let lastTime = 0;

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  // Clear and draw background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

- [ ] **Step 4: Verify — open browser**

Expected: Warm beige background with a brown bowl/container shape drawn. The bowl should be open at the top, with sloped walls and a flat bottom. No console errors.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: add physics world and container rendering"
```

---

### Task 4: Cup Pool and Capsule Rendering

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Create the cup pool with pre-allocated bodies**

Add after the container creation code:

```js
// --- Cup Pool ---
const cupPool = [];
for (let i = 0; i < MAX_CUPS; i++) {
  const body = new Body({
    shape: TIER_SHAPES[0],
    position: new Vec2(0, -100),  // off-screen
    mass: tierMass(0),
    restitution: CUP_RESTITUTION,
    friction: CUP_FRICTION,
  });
  cupPool.push({
    body,
    tier: 0,
    active: false,
    merging: false,
    overflowTimer: 0,
  });
}

function activateCup(tier, x, y, vx, vy) {
  for (let i = 0; i < MAX_CUPS; i++) {
    const cup = cupPool[i];
    if (cup.active) continue;

    cup.tier = tier;
    cup.active = true;
    cup.merging = false;
    cup.overflowTimer = 0;

    const body = cup.body;
    body.shape = TIER_SHAPES[tier];
    body.mass = tierMass(tier);
    body.inverseMass = 1 / body.mass;
    body.inertia = body.shape.computeInertia(body.mass);
    body.inverseInertia = body.inertia > 0 ? 1 / body.inertia : 0;
    body.position.set(x, y);
    body.previousPosition.set(x, y);
    body.renderPosition.set(x, y);
    body.velocity.set(vx, vy);
    body.angularVelocity = 0;
    body.angle = 0;
    body.previousAngle = 0;
    body.renderAngle = 0;
    body.isSleeping = false;
    body.sleepTimer = 0;
    body.userData = cup;

    world.addBody(body);
    return cup;
  }
  return null; // pool full
}

function deactivateCup(cup) {
  cup.active = false;
  cup.merging = false;
  world.removeBody(cup.body);
}
```

- [ ] **Step 2: Add the capsule drawing helper**

Add to the rendering helpers section:

```js
function drawCapsule(ctx, length, radius, color, textColor, label) {
  // Capsule is oriented along the local X axis (horizontal when angle=0)
  // But our cups are tall (oriented along Y), so we rotate 90 degrees in the draw call
  const halfLen = length / 2;
  const r = radius * SCALE;
  const hl = halfLen * SCALE;

  ctx.fillStyle = color;
  ctx.beginPath();
  // Left semicircle
  ctx.arc(-hl, 0, r, Math.PI * 0.5, Math.PI * 1.5);
  // Top edge
  ctx.lineTo(hl, -r);
  // Right semicircle
  ctx.arc(hl, 0, r, Math.PI * 1.5, Math.PI * 0.5);
  // Bottom edge
  ctx.lineTo(-hl, r);
  ctx.closePath();
  ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Label
  if (label) {
    const fontSize = Math.max(r * 0.55, 10);
    ctx.fillStyle = textColor || '#fff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
}

// Determine contrasting text color for a tier
function tierTextColor(tier) {
  // Light tiers get dark text, dark tiers get white text
  const dark = [4, 6, 8]; // Thai Tea, Brown Sugar, Ube
  return dark.includes(tier) ? '#fff' : '#333';
}
```

- [ ] **Step 3: Add cup rendering to the game loop**

Add a `drawCups()` function and call it after `drawContainer()`:

```js
function drawCups() {
  for (let i = 0; i < MAX_CUPS; i++) {
    const cup = cupPool[i];
    if (!cup.active) continue;

    const body = cup.body;
    const tier = TIERS[cup.tier];
    const cx = worldToCanvasX(body.renderPosition.x);
    const cy = worldToCanvasY(body.renderPosition.y);

    ctx.save();
    ctx.translate(cx, cy);
    // Physics2D capsule segment is along the body's angle direction.
    // Add PI/2 so capsules stand upright by default.
    ctx.rotate(body.renderAngle + Math.PI / 2);
    drawCapsule(ctx, tier.radius * 1.2, tier.radius, tier.color, tierTextColor(cup.tier), tier.name);
    ctx.restore();
  }
}
```

Update the game loop render section:

```js
  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();
  drawCups();
```

- [ ] **Step 4: Test by spawning a cup manually**

Temporarily add after the cup pool setup, before the game loop:

```js
// DEBUG: spawn a test cup
activateCup(0, 0, 3.0, 0, 0);
activateCup(3, -1.0, 3.0, 0, 0);
activateCup(6, 1.0, 3.0, 0, 0);
```

- [ ] **Step 5: Add physics stepping to the game loop**

Update the loop to step physics:

```js
function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  // Physics
  if (dt > 0) {
    world.step(dt);
  }

  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();
  drawCups();

  requestAnimationFrame(loop);
}
```

- [ ] **Step 6: Verify — open browser**

Expected: Three capsule-shaped cups (Milk Tea, Taro, Brown Sugar) fall under gravity, bounce off the container walls, and settle at the bottom of the bowl. They should rotate naturally and have their tier names drawn inside. No console errors.

- [ ] **Step 7: Remove test spawn code**

Delete the 3 `activateCup(...)` debug lines.

- [ ] **Step 8: Commit**

```bash
git add game.js
git commit -m "feat: add cup pool, capsule rendering, and physics stepping"
```

---

### Task 5: State Machine, Drop System, and Input

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add game state and drop state variables**

Add after the cup pool section:

```js
// --- Game State ---
const State = { MAIN_MENU: 0, IN_GAME: 1, PAUSED: 2, GAME_OVER: 3 };
let gameState = State.MAIN_MENU;
let score = 0;
let highScore = parseInt(localStorage.getItem('bobadrop_highscore')) || 0;
let currentDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
let nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
let dropCooldown = 0;
let dropperX = 0;
let gameTime = 0; // for animations (pulsing, etc.)

// Settings
let sfxEnabled = localStorage.getItem('bobadrop_setting_sfx') !== 'false';
let musicEnabled = localStorage.getItem('bobadrop_setting_music') !== 'false';

function resetGame() {
  // Deactivate all cups
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active) deactivateCup(cupPool[i]);
  }
  // Reset merge queue
  mergeCount = 0;
  // Reset particles
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePool[i].active = false;
  }
  score = 0;
  dropCooldown = 0;
  dropperX = 0;
  currentDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
  nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
}
```

Note: `mergeCount` and `particlePool` are referenced here but defined in later tasks. This function will work once those are in place. For now, comment out the merge/particle lines and uncomment them in the respective tasks.

Temporarily use:

```js
function resetGame() {
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active) deactivateCup(cupPool[i]);
  }
  score = 0;
  dropCooldown = 0;
  dropperX = 0;
  currentDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
  nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
}
```

- [ ] **Step 2: Add input handling**

Add after game state section:

```js
// --- Input ---
function screenToCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (canvas.width / rect.width);
}

function screenToCanvasY(clientY) {
  const rect = canvas.getBoundingClientRect();
  return (clientY - rect.top) * (canvas.height / rect.height);
}

function dropCup() {
  if (dropCooldown > 0) return;
  const cup = activateCup(currentDropTier, dropperX, DROP_Y, 0, 0);
  if (!cup) return;
  currentDropTier = nextDropTier;
  nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
  dropCooldown = DROP_COOLDOWN;
}

canvas.addEventListener('pointermove', (e) => {
  if (gameState !== State.IN_GAME) return;
  const cx = screenToCanvasX(e.clientX);
  const wx = canvasToWorldX(cx);
  dropperX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, wx));
});

canvas.addEventListener('pointerup', (e) => {
  if (gameState === State.IN_GAME) {
    dropCup();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  const cx = screenToCanvasX(e.clientX);
  const cy = screenToCanvasY(e.clientY);
  handleButtonClick(cx, cy);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (gameState === State.IN_GAME) gameState = State.PAUSED;
    else if (gameState === State.PAUSED) gameState = State.IN_GAME;
  }
});
```

- [ ] **Step 3: Add placeholder button handler (implemented fully in Task 8)**

```js
// --- Button Hit Testing ---
// Buttons are { x, y, w, h, action } in canvas pixel coords
let activeButtons = [];

function handleButtonClick(cx, cy) {
  for (const btn of activeButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      btn.action();
      return;
    }
  }
}
```

- [ ] **Step 4: Add dropper rendering**

Add to rendering helpers:

```js
function drawDropper() {
  if (gameState !== State.IN_GAME) return;

  const cx = worldToCanvasX(dropperX);
  const cy = worldToCanvasY(DROP_Y);
  const tier = TIERS[currentDropTier];

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2); // upright
  drawCapsule(ctx, tier.radius * 1.2, tier.radius, tier.color, tierTextColor(currentDropTier), tier.name);
  ctx.restore();

  // Drop line (thin vertical dashed line from dropper down)
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + tier.radius * SCALE);
  ctx.lineTo(cx, worldToCanvasY(WARNING_Y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
```

- [ ] **Step 5: Update the game loop with state-aware logic**

Replace the game loop:

```js
// --- Game Loop ---
let lastTime = 0;

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;
  gameTime += dt;

  // Update
  if (gameState === State.IN_GAME && dt > 0) {
    dropCooldown -= dt;
    world.step(dt);
  }

  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();
  drawCups();
  drawDropper();

  requestAnimationFrame(loop);
}

// Start in main menu, but for testing, go straight to IN_GAME
gameState = State.IN_GAME;

requestAnimationFrame(loop);
```

- [ ] **Step 6: Verify — open browser**

Expected: A semi-transparent ghost cup follows the mouse horizontally (clamped to the container width). Clicking/releasing drops the cup, which falls and settles in the bowl. After 0.5s cooldown, another cup can be dropped. Each drop shows a random tier 0-4 cup. A dashed guide line shows where the cup will fall.

- [ ] **Step 7: Commit**

```bash
git add game.js
git commit -m "feat: add state machine, drop system, and input handling"
```

---

### Task 6: Merge System

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add merge queue**

Add after the cup pool section (before game state):

```js
// --- Merge Queue ---
const mergeQueue = [];
for (let i = 0; i < MAX_MERGES; i++) {
  mergeQueue.push({ cupA: null, cupB: null, midX: 0, midY: 0, newTier: 0 });
}
let mergeCount = 0;
```

- [ ] **Step 2: Set up the collision callback for merge detection**

Add after the merge queue:

```js
// --- Collision Callback ---
world.onCollision = (a, b, contact) => {
  const cupA = a.userData;
  const cupB = b.userData;

  // Both must be active cups (not container edges)
  if (!cupA || !cupB) return;
  if (!cupA.active || !cupB.active) return;
  if (cupA.merging || cupB.merging) return;
  if (cupA.tier !== cupB.tier) return;

  // Queue merge
  if (mergeCount >= MAX_MERGES) return;
  const entry = mergeQueue[mergeCount];
  entry.cupA = cupA;
  entry.cupB = cupB;
  entry.midX = (a.position.x + b.position.x) / 2;
  entry.midY = (a.position.y + b.position.y) / 2;
  entry.newTier = cupA.tier + 1;
  mergeCount++;

  cupA.merging = true;
  cupB.merging = true;
};
```

- [ ] **Step 3: Add merge processing function**

Add after the collision callback:

```js
function processMerges() {
  for (let i = 0; i < mergeCount; i++) {
    const m = mergeQueue[i];
    deactivateCup(m.cupA);
    deactivateCup(m.cupB);

    if (m.newTier < TIER_COUNT) {
      // Spawn merged cup
      activateCup(m.newTier, m.midX, m.midY, 0, MERGE_POP_VY);
      score += TIERS[m.newTier].score;
    } else {
      // Tier 10 + Tier 10: both vanish, score the collision
      score += TIERS[TIER_COUNT - 1].score;
    }

    // TODO: spawn particles here (Task 7)

    m.cupA = null;
    m.cupB = null;
  }
  mergeCount = 0;
}
```

- [ ] **Step 4: Integrate merge processing into the game loop**

Update the IN_GAME update block:

```js
  if (gameState === State.IN_GAME && dt > 0) {
    dropCooldown -= dt;
    world.step(dt);
    processMerges();
  }
```

- [ ] **Step 5: Verify — open browser**

Expected: Drop two cups of the same tier so they collide. When they touch, they merge into the next tier up with a small upward pop. Score increases (visible in console — `console.log(score)` temporarily if needed). Dropping many cups eventually shows chain merges.

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "feat: add merge system via collision callbacks"
```

---

### Task 7: Particle System

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Create the particle pool**

Add after the merge queue section:

```js
// --- Particle Pool ---
const PARTICLE_LIFETIME = 0.3;
const PARTICLES_PER_MERGE_MIN = 8;
const PARTICLES_PER_MERGE_MAX = 12;

const particlePool = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  particlePool.push({
    x: 0, y: 0,
    vx: 0, vy: 0,
    alpha: 0,
    radius: 0,
    startRadius: 0,
    color: '',
    life: 0,
    active: false,
  });
}

function spawnParticles(worldX, worldY, color) {
  const count = PARTICLES_PER_MERGE_MIN + Math.floor(Math.random() * (PARTICLES_PER_MERGE_MAX - PARTICLES_PER_MERGE_MIN + 1));
  for (let n = 0; n < count; n++) {
    // Find inactive slot
    let p = null;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!particlePool[i].active) { p = particlePool[i]; break; }
    }
    if (!p) break; // pool full

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 2; // 2-4 world units/s
    p.x = worldX;
    p.y = worldY;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.startRadius = 0.06 + Math.random() * 0.04; // 0.06-0.10 world units
    p.radius = p.startRadius;
    p.color = color;
    p.life = PARTICLE_LIFETIME;
    p.alpha = 1;
    p.active = true;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += GRAVITY * dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    const t = p.life / PARTICLE_LIFETIME;
    p.alpha = t;
    p.radius = p.startRadius * t;
  }
}
```

- [ ] **Step 2: Add particle rendering**

Add to rendering helpers:

```js
function drawParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    const cx = worldToCanvasX(p.x);
    const cy = worldToCanvasY(p.y);
    const r = p.radius * SCALE;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 3: Wire particles into merge processing**

In `processMerges()`, replace the `// TODO: spawn particles here (Task 7)` comment:

```js
    spawnParticles(m.midX, m.midY, TIERS[Math.min(m.newTier, TIER_COUNT - 1)].color);
```

- [ ] **Step 4: Wire particle update and rendering into game loop**

Update the game loop:

```js
  if (gameState === State.IN_GAME && dt > 0) {
    dropCooldown -= dt;
    world.step(dt);
    processMerges();
    updateParticles(dt);
  }

  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();
  drawCups();
  drawParticles();
  drawDropper();
```

- [ ] **Step 5: Update resetGame() to clear particles and merge queue**

Replace the temporary `resetGame()`:

```js
function resetGame() {
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active) deactivateCup(cupPool[i]);
  }
  mergeCount = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePool[i].active = false;
  }
  score = 0;
  dropCooldown = 0;
  dropperX = 0;
  currentDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
  nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
}
```

- [ ] **Step 6: Verify — open browser**

Expected: When cups merge, a burst of 8-12 small colored circles explodes from the merge point. Particles arc under gravity and fade out over ~0.3 seconds. Colors match the merged tier.

- [ ] **Step 7: Commit**

```bash
git add game.js
git commit -m "feat: add particle system for merge effects"
```

---

### Task 8: UI — Menus, HUD, Warning Line, Game Over

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add warning line rendering and overflow detection**

Add to rendering helpers:

```js
function drawWarningLine() {
  const cy = worldToCanvasY(WARNING_Y);
  const leftX = worldToCanvasX(-3.2);
  const rightX = worldToCanvasX(3.2);

  // Check if any cup is above warning line
  let anyOverflow = false;
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active && cupPool[i].overflowTimer > 0) {
      anyOverflow = true;
      break;
    }
  }

  const alpha = anyOverflow ? 0.5 + 0.5 * Math.abs(Math.sin(gameTime * 4)) : 0.2;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 77, 77, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([15, 10]);
  ctx.beginPath();
  ctx.moveTo(leftX, cy);
  ctx.lineTo(rightX, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
```

Add overflow timer update function:

```js
function updateOverflowTimers(dt) {
  for (let i = 0; i < MAX_CUPS; i++) {
    const cup = cupPool[i];
    if (!cup.active) continue;
    if (cup.body.renderPosition.y < WARNING_Y) {
      cup.overflowTimer += dt;
    } else {
      cup.overflowTimer = 0;
    }
  }
}

function checkGameOver() {
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active && cupPool[i].overflowTimer >= GAME_OVER_TIME) {
      return true;
    }
  }
  return false;
}

function getMaxOverflowTimer() {
  let max = 0;
  for (let i = 0; i < MAX_CUPS; i++) {
    if (cupPool[i].active && cupPool[i].overflowTimer > max) {
      max = cupPool[i].overflowTimer;
    }
  }
  return max;
}
```

- [ ] **Step 2: Add HUD rendering (score, high score, next preview, countdown)**

```js
function drawHUD() {
  // Score — upper left
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(score.toString(), 30, 20);

  // High score
  ctx.font = '32px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Best: ${highScore}`, 30, 90);

  // Next preview — upper right
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Next:', CANVAS_W - 100, 25);

  const nextTier = TIERS[nextDropTier];
  ctx.save();
  ctx.translate(CANVAS_W - 70, 80);
  ctx.rotate(Math.PI / 2);
  const previewScale = 0.6;
  ctx.scale(previewScale, previewScale);
  drawCapsule(ctx, nextTier.radius * 1.2, nextTier.radius, nextTier.color, tierTextColor(nextDropTier), '');
  ctx.restore();

  // Countdown warning
  const maxOverflow = getMaxOverflowTimer();
  if (maxOverflow > 0) {
    const remaining = Math.ceil(GAME_OVER_TIME - maxOverflow);
    const pulse = 1.0 + 0.15 * Math.sin(gameTime * 8);
    ctx.save();
    ctx.translate(CANVAS_W / 2, worldToCanvasY(WARNING_Y) - 60);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(remaining.toString(), 0, 0);
    ctx.restore();
  }

  // Pause button — upper right corner
  activeButtons = activeButtons.filter(b => b.id !== 'pause');
  const pauseBtn = { id: 'pause', x: CANVAS_W - 80, y: 130, w: 60, h: 60, action: () => { gameState = State.PAUSED; } };
  activeButtons.push(pauseBtn);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h);
  ctx.fillStyle = '#fff';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('||', pauseBtn.x + 30, pauseBtn.y + 30);
}
```

- [ ] **Step 3: Add menu screen rendering functions**

```js
function drawButton(label, x, y, w, h, action, id) {
  activeButtons.push({ id, x, y, w, h, action });
  // Background
  ctx.fillStyle = '#e6e6e6';
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = '#333';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawToggleButton(label, enabled, x, y, w, h, action, id) {
  activeButtons.push({ id, x, y, w, h, action });
  ctx.fillStyle = enabled ? '#4CAF50' : '#888';
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label}: ${enabled ? 'ON' : 'OFF'}`, x + w / 2, y + h / 2);
}

function drawMainMenu() {
  activeButtons = [];

  // Title
  ctx.fillStyle = '#8b5e3c';
  ctx.font = 'bold 100px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Boba Drop', CANVAS_W / 2, 400);

  // High score
  ctx.fillStyle = '#888';
  ctx.font = '36px sans-serif';
  ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, 500);

  // Play button
  drawButton('Play', CANVAS_W / 2 - 150, 650, 300, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'play');
}

function drawPauseScreen() {
  activeButtons = [];

  // Overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Paused', CANVAS_W / 2, 500);

  const btnX = CANVAS_W / 2 - 175;
  const btnW = 350;

  // SFX toggle
  drawToggleButton('SFX', sfxEnabled, btnX, 650, btnW, 70, () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('bobadrop_setting_sfx', sfxEnabled);
  }, 'sfx');

  // Music toggle
  drawToggleButton('Music', musicEnabled, btnX, 740, btnW, 70, () => {
    musicEnabled = !musicEnabled;
    localStorage.setItem('bobadrop_setting_music', musicEnabled);
  }, 'music');

  // Resume
  drawButton('Resume', btnX, 850, btnW, 70, () => {
    gameState = State.IN_GAME;
  }, 'resume');

  // Quit
  drawButton('Quit', btnX, 940, btnW, 70, () => {
    gameState = State.MAIN_MENU;
  }, 'quit');
}

function drawGameOverScreen() {
  activeButtons = [];

  // Overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Game Over', CANVAS_W / 2, 500);

  // Score
  ctx.font = '50px sans-serif';
  ctx.fillText(`Score: ${score}`, CANVAS_W / 2, 620);

  // Best
  ctx.font = '36px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, 690);

  // Play Again
  drawButton('Play Again', CANVAS_W / 2 - 175, 780, 350, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'playagain');
}
```

- [ ] **Step 4: Add evolution line at the bottom**

```js
function drawEvolutionLine() {
  const lineY = CANVAS_H - 80;
  const totalWidth = 900;
  const startX = (CANVAS_W - totalWidth) / 2;
  const spacing = totalWidth / (TIER_COUNT - 1);

  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(startX - 20, lineY - 40, totalWidth + 40, 80);

  for (let i = 0; i < TIER_COUNT; i++) {
    const tier = TIERS[i];
    const cx = startX + i * spacing;
    ctx.save();
    ctx.translate(cx, lineY);
    ctx.rotate(Math.PI / 2);
    const s = 0.35;
    ctx.scale(s, s);
    drawCapsule(ctx, tier.radius * 1.2, tier.radius, tier.color, '', '');
    ctx.restore();
  }
}
```

- [ ] **Step 5: Update the game loop with full state-aware rendering**

Replace the game loop with the complete version:

```js
// --- Game Loop ---
let lastTime = 0;

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;
  gameTime += dt;

  // Update
  if (gameState === State.IN_GAME && dt > 0) {
    dropCooldown -= dt;
    world.step(dt);
    processMerges();
    updateParticles(dt);
    updateOverflowTimers(dt);

    if (checkGameOver()) {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('bobadrop_highscore', highScore.toString());
      }
      gameState = State.GAME_OVER;
    }
  }

  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (gameState === State.MAIN_MENU) {
    drawContainer();
    drawEvolutionLine();
    drawMainMenu();
  } else if (gameState === State.IN_GAME) {
    drawContainer();
    drawWarningLine();
    drawCups();
    drawParticles();
    drawDropper();
    drawEvolutionLine();
    drawHUD();
  } else if (gameState === State.PAUSED) {
    drawContainer();
    drawWarningLine();
    drawCups();
    drawEvolutionLine();
    drawPauseScreen();
  } else if (gameState === State.GAME_OVER) {
    drawContainer();
    drawCups();
    drawEvolutionLine();
    drawGameOverScreen();
  }

  requestAnimationFrame(loop);
}

gameState = State.MAIN_MENU;
requestAnimationFrame(loop);
```

- [ ] **Step 6: Verify — open browser**

Expected:
- Main menu shows "Boba Drop" title, high score, Play button
- Clicking Play starts the game with dropper, score HUD, next preview, pause button
- Warning line appears as dashed red at the threshold
- When cups stack above the line, a countdown pulses. After 3 seconds → Game Over screen
- Game Over shows final score, best score, Play Again button
- Pause (Escape key or pause button) shows overlay with SFX/Music toggles, Resume, Quit
- Evolution line at bottom shows all 11 tier capsules
- All menu buttons respond to clicks

- [ ] **Step 7: Commit**

```bash
git add game.js
git commit -m "feat: add full UI - menus, HUD, warning line, game over"
```

---

### Task 9: Polish and Platform Integration

**Files:**
- Modify: `game.js`
- Modify: `index.html`

- [ ] **Step 1: Add touch-action CSS to prevent browser defaults**

In `index.html`, add to the canvas style:

```css
canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  touch-action: none;
}
```

- [ ] **Step 2: Add setPointerCapture for reliable drag tracking**

Update the pointermove listener in `game.js`:

```js
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const cx = screenToCanvasX(e.clientX);
  const cy = screenToCanvasY(e.clientY);

  if (gameState === State.IN_GAME) {
    const wx = canvasToWorldX(cx);
    dropperX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, wx));
  }

  handleButtonClick(cx, cy);
});
```

- [ ] **Step 3: Prevent drop on menu button clicks**

Update `pointerup` to only drop if the pointer wasn't on a button:

```js
let pointerUsedForButton = false;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const cx = screenToCanvasX(e.clientX);
  const cy = screenToCanvasY(e.clientY);

  pointerUsedForButton = false;

  if (gameState === State.IN_GAME) {
    const wx = canvasToWorldX(cx);
    dropperX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, wx));
  }

  // Check buttons
  for (const btn of activeButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      btn.action();
      pointerUsedForButton = true;
      return;
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (gameState === State.IN_GAME && !pointerUsedForButton) {
    dropCup();
  }
  pointerUsedForButton = false;
});
```

Remove the old separate `pointerdown` and `pointerup` listeners and the `handleButtonClick` function call.

- [ ] **Step 4: Add background color to HUD area for readability**

Add at the start of `drawHUD()`:

```js
  // HUD background strip
  ctx.fillStyle = 'rgba(139, 94, 60, 0.85)';
  ctx.fillRect(0, 0, CANVAS_W, 200);
```

- [ ] **Step 5: Verify — full playthrough**

Open browser and play a full game:
- [ ] Main menu displays correctly, Play button works
- [ ] Cups drop on pointer release, dropper follows pointer
- [ ] Same-tier cups merge with particle burst and score increase
- [ ] Cups stack, rotate, and settle naturally in the bowl
- [ ] Warning line pulses when cups are above it, countdown shows
- [ ] Game over triggers after 3s overflow, high score saves
- [ ] Play Again resets cleanly
- [ ] Pause/resume works (Escape key and button)
- [ ] Touch works on mobile (no scroll/zoom interference)
- [ ] No console errors

- [ ] **Step 6: Commit**

```bash
git add game.js index.html
git commit -m "feat: polish input handling and UI readability"
```

---

### Task 10: Final Cleanup and Git Init

**Files:**
- Modify: `game.js` (minor cleanup)
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
.superpowers/
.DS_Store
```

- [ ] **Step 2: Remove any remaining debug code**

Search `game.js` for `console.log`, `// DEBUG`, `// TODO` and remove them.

- [ ] **Step 3: Initialize git repo if not already done**

```bash
cd /Users/nitzanwilnai/Programming/Claude/JSGames/SuikaGame
git init
git add .
git commit -m "feat: boba drop - complete game implementation"
```

- [ ] **Step 4: Verify — one final clean playthrough**

Open `index.html` in browser. Play from main menu through game over. Confirm all features work, no console errors, game resets cleanly.

- [ ] **Step 5: Note for later**

Two items deferred for follow-up:
1. **Audio** — procedural Web Audio API sounds (see GDD Section 8)
2. **thumbnail.png** — needs to be created for platform deployment

Deploy to platform with:
```bash
cd /Users/nitzanwilnai/Programming/Claude/GamesPlatform
./scripts/deploy-game.sh /Users/nitzanwilnai/Programming/Claude/JSGames/SuikaGame
```
