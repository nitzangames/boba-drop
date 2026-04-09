import { World, Body, Capsule, Edge, Vec2 } from './physics2d/index.js';

// --- Constants ---
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SCALE = 154;        // pixels per world unit (~1080 / 7)
const X_OFFSET = 540;     // center of canvas
const Y_OFFSET = 132;     // top padding for HUD
const BG_COLOR = '#FAF5F0';
const VERSION = '0.3.0';

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

// --- Gameplay Constants ---
const MAX_CUPS = 64;
const MAX_PARTICLES = 96;
const MAX_MERGES = 32;
const DROP_COOLDOWN = 0.5;
const GAME_OVER_TIME = 3.0;
const DROP_Y = 1.2;
const LEFT_BOUND = -2.30;
const RIGHT_BOUND = 2.30;
const WARNING_Y = 2.24;
const MERGE_POP_VY = -2.0;
const GRAVITY = 9.81;
const PHYSICS_DT = 1 / 120;
const CUP_RESTITUTION = 0.1;
const CUP_FRICTION = 0.4;

// Container points (Y-down, world units) — tapered cup: wide top, narrow bottom
// 10% wider (X*1.1), 10% shorter (Y scaled 0.9 around center 5.88)
const CONTAINER_POINTS = [
  // Left wall extends well above rim (invisible, keeps cups in)
  { x: -2.85, y: -2.0 },
  { x: -2.80, y: 0.0 },
  { x: -2.75, y: 1.74 },
  // Left rim, tapers inward going down
  { x: -2.70, y: 2.24 },
  { x: -2.59, y: 3.11 },
  { x: -2.46, y: 4.01 },
  { x: -2.34, y: 4.91 },
  { x: -2.22, y: 5.81 },
  { x: -2.10, y: 6.71 },
  { x: -1.98, y: 7.61 },
  { x: -1.89, y: 8.24 },
  // Bottom-left curve
  { x: -1.76, y: 8.69 },
  { x: -1.54, y: 9.00 },
  { x: -1.27, y: 9.23 },
  { x: -0.94, y: 9.39 },
  { x: -0.55, y: 9.48 },
  // Flat bottom
  { x:  0.00, y: 9.52 },
  // Bottom-right curve (mirror)
  { x:  0.55, y: 9.48 },
  { x:  0.94, y: 9.39 },
  { x:  1.27, y: 9.23 },
  { x:  1.54, y: 9.00 },
  { x:  1.76, y: 8.69 },
  // Right wall, tapers inward going down
  { x:  1.89, y: 8.24 },
  { x:  1.98, y: 7.61 },
  { x:  2.10, y: 6.71 },
  { x:  2.22, y: 5.81 },
  { x:  2.34, y: 4.91 },
  { x:  2.46, y: 4.01 },
  { x:  2.59, y: 3.11 },
  { x:  2.70, y: 2.24 },
  // Right wall extends well above rim (invisible, keeps cups in)
  { x:  2.75, y: 1.74 },
  { x:  2.80, y: 0.0 },
  { x:  2.85, y: -2.0 },
];

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

// --- Cup Pool ---
const MAX_PEARLS_PER_CUP = 7;
const cupPool = [];
for (let i = 0; i < MAX_CUPS; i++) {
  const body = new Body({
    shape: TIER_SHAPES[0],
    position: new Vec2(0, -100),
    mass: tierMass(0),
    restitution: CUP_RESTITUTION,
    friction: CUP_FRICTION,
  });
  // Pre-allocate pearl data for each cup
  const pearls = [];
  for (let p = 0; p < MAX_PEARLS_PER_CUP; p++) {
    pearls.push({ x: 0, y: 0, baseX: 0, baseY: 0 });
  }
  cupPool.push({
    body,
    tier: 0,
    active: false,
    merging: false,
    overflowTimer: 0,
    pearls,
    pearlCount: 0,
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
    body.angle = Math.PI / 2;
    body.previousAngle = Math.PI / 2;
    body.renderAngle = Math.PI / 2;
    body.isSleeping = false;
    body.sleepTimer = 0;
    body.userData = cup;

    // Initialize pearl positions for this tier
    const sprite = TIER_SPRITES[tier];
    const pearlR = Math.max(sprite.r * 0.12, 3);
    const pearlAreaTop = sprite.bottom - sprite.baseW * 2.8;
    const pearlAreaBot = sprite.bottom - sprite.baseW * 0.6;
    let seed = tier * 7919 + i * 1301; // unique seed per cup slot + tier
    function nextRand() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }
    cup.pearlCount = Math.max(3, Math.min(MAX_PEARLS_PER_CUP, Math.floor(sprite.r / 8)));
    for (let p = 0; p < cup.pearlCount; p++) {
      const px = (nextRand() - 0.5) * sprite.baseW * 1.2;
      const py = pearlAreaTop + nextRand() * (pearlAreaBot - pearlAreaTop) - sprite.cy;
      cup.pearls[p].baseX = px;
      cup.pearls[p].baseY = py;
      cup.pearls[p].x = px;
      cup.pearls[p].y = py;
    }

    world.addBody(body);
    return cup;
  }
  return null;
}

function deactivateCup(cup) {
  cup.active = false;
  cup.merging = false;
  world.removeBody(cup.body);
}

// --- Merge Queue ---
const mergeQueue = [];
for (let i = 0; i < MAX_MERGES; i++) {
  mergeQueue.push({ cupA: null, cupB: null, midX: 0, midY: 0, newTier: 0 });
}
let mergeCount = 0;

// --- Collision Callback ---
world.onCollision = (a, b, contact) => {
  const cupA = a.userData;
  const cupB = b.userData;

  if (!cupA || !cupB) return;
  if (!cupA.active || !cupB.active) return;
  if (cupA.merging || cupB.merging) return;
  if (cupA.tier !== cupB.tier) return;

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

// Clamp X position to stay inside the tapered container at a given Y
function clampToContainer(x, y, radius) {
  // Find the container width at this Y by interpolating the wall points
  // Left wall: points CONTAINER_VIS_START to ~halfway, right wall: ~halfway to CONTAINER_VIS_END
  const pts = CONTAINER_POINTS;
  let leftX = -2.0, rightX = 2.0;

  // Search left wall (first half of visible points)
  for (let i = CONTAINER_VIS_START; i < pts.length / 2; i++) {
    if (pts[i].y <= y && pts[i + 1] && pts[i + 1].y >= y) {
      const t = (y - pts[i].y) / (pts[i + 1].y - pts[i].y);
      leftX = pts[i].x + t * (pts[i + 1].x - pts[i].x);
      break;
    }
  }
  // Search right wall (second half, reversed)
  for (let i = CONTAINER_VIS_END; i > pts.length / 2; i--) {
    if (pts[i].y <= y && pts[i - 1] && pts[i - 1].y >= y) {
      const t = (y - pts[i].y) / (pts[i - 1].y - pts[i].y);
      rightX = pts[i].x + t * (pts[i - 1].x - pts[i].x);
      break;
    }
  }

  return Math.max(leftX + radius, Math.min(rightX - radius, x));
}

function processMerges() {
  for (let i = 0; i < mergeCount; i++) {
    const m = mergeQueue[i];
    deactivateCup(m.cupA);
    deactivateCup(m.cupB);

    if (m.newTier < TIER_COUNT) {
      const newRadius = TIERS[m.newTier].radius;
      const clampedX = clampToContainer(m.midX, m.midY, newRadius);
      activateCup(m.newTier, clampedX, m.midY, 0, MERGE_POP_VY);
      score += TIERS[m.newTier].score;
      playMergeSound(m.newTier);
      vibrateMedium();
    } else {
      score += TIERS[TIER_COUNT - 1].score;
      playMergeSound(TIER_COUNT - 1);
      vibrateHeavy();
    }

    spawnParticles(m.midX, m.midY, TIERS[Math.min(m.newTier, TIER_COUNT - 1)].color);

    m.cupA = null;
    m.cupB = null;
  }
  mergeCount = 0;
}

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
    let p = null;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!particlePool[i].active) { p = particlePool[i]; break; }
    }
    if (!p) break;

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 2;
    p.x = worldX;
    p.y = worldY;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.startRadius = 0.06 + Math.random() * 0.04;
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

// --- Game State ---
const State = { MAIN_MENU: 0, IN_GAME: 1, PAUSED: 2, GAME_OVER: 3 };
let gameState = State.MAIN_MENU;
let score = 0;
let highScore = parseInt(localStorage.getItem('bobadrop_highscore')) || 0;
let currentDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
let nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
let dropCooldown = 0;
let dropperX = 0;
let dropperDir = 1;       // 1 = moving right, -1 = moving left
const DROPPER_SPEED = 3.0; // world units per second
let gameTime = 0;
let rawPointerX = -1;     // raw clientX from last pointer event, -1 = no input
let usePointerInput = true; // toggle: true = follow mouse, false = auto-move

let sfxEnabled = localStorage.getItem('bobadrop_setting_sfx') !== 'false';
let musicEnabled = localStorage.getItem('bobadrop_setting_music') !== 'false';
let hapticsEnabled = localStorage.getItem('bobadrop_setting_haptics') !== 'false';

// --- Haptics ---
function vibrateLight() {
  if (!hapticsEnabled || !navigator.vibrate) return;
  navigator.vibrate(10);
}

function vibrateMedium() {
  if (!hapticsEnabled || !navigator.vibrate) return;
  navigator.vibrate(25);
}

function vibrateHeavy() {
  if (!hapticsEnabled || !navigator.vibrate) return;
  navigator.vibrate(50);
}

function vibratePattern(pattern) {
  if (!hapticsEnabled || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

// --- Audio ---
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playMergeSound(tier) {
  if (!sfxEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const freq = 300 + tier * 60;
  const dur = 0.25;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.45, t);
  master.gain.exponentialRampToValueAtTime(0.001, t + dur);
  master.connect(audioCtx.destination);

  // Main oscillator
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(master);
  osc.start(t);
  osc.stop(t + dur);

  // Harmonic (2x freq)
  const harmGain = audioCtx.createGain();
  harmGain.gain.setValueAtTime(0.3 * 0.45, t);
  harmGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  harmGain.connect(audioCtx.destination);
  const harm = audioCtx.createOscillator();
  harm.type = 'sine';
  harm.frequency.setValueAtTime(freq * 2, t);
  harm.connect(harmGain);
  harm.start(t);
  harm.stop(t + dur);

  // Pop attack (1.5x freq, very fast decay)
  const popGain = audioCtx.createGain();
  popGain.gain.setValueAtTime(0.45, t);
  popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  popGain.connect(audioCtx.destination);
  const pop = audioCtx.createOscillator();
  pop.type = 'sine';
  pop.frequency.setValueAtTime(freq * 1.5, t);
  pop.connect(popGain);
  pop.start(t);
  pop.stop(t + 0.05);
}

function playGameOverSound() {
  if (!sfxEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = 0.6;

  // Main descending sweep
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.6, t);
  master.gain.exponentialRampToValueAtTime(0.001, t + dur);
  master.connect(audioCtx.destination);
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, t);
  osc.frequency.linearRampToValueAtTime(100, t + dur);
  osc.connect(master);
  osc.start(t);
  osc.stop(t + dur);

  // Sub-octave layer
  const subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(0.4 * 0.6, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  subGain.connect(audioCtx.destination);
  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(250, t);
  sub.frequency.linearRampToValueAtTime(50, t + dur);
  sub.connect(subGain);
  sub.start(t);
  sub.stop(t + dur);
}

function playClickSound() {
  if (!sfxEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  gain.connect(audioCtx.destination);
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, t);
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 0.05);
}

function playWarningSound() {
  if (!sfxEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;

  // Two plops
  for (const offset of [0, 0.18]) {
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.12);
    gain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t + offset);
    osc.connect(gain);
    osc.start(t + offset);
    osc.stop(t + offset + 0.12);
  }
}

function playDropSound() {
  if (!sfxEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  gain.connect(audioCtx.destination);
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.linearRampToValueAtTime(400, t + 0.08);
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 0.08);
}

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

// --- Canvas Setup ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// --- Input ---
// Cache canvas rect to avoid layout thrashing on every pointermove
let canvasRect = canvas.getBoundingClientRect();
let canvasScaleX = canvas.width / canvasRect.width;
let canvasScaleY = canvas.height / canvasRect.height;
window.addEventListener('resize', () => {
  canvasRect = canvas.getBoundingClientRect();
  canvasScaleX = canvas.width / canvasRect.width;
  canvasScaleY = canvas.height / canvasRect.height;
});

function screenToCanvasX(clientX) {
  return (clientX - canvasRect.left) * canvasScaleX;
}

function screenToCanvasY(clientY) {
  return (clientY - canvasRect.top) * canvasScaleY;
}

function dropCup() {
  if (dropCooldown > 0) return;
  const cup = activateCup(currentDropTier, dropperX, DROP_Y, 0, 0);
  if (!cup) return;
  currentDropTier = nextDropTier;
  nextDropTier = Math.floor(Math.random() * (MAX_DROP_TIER + 1));
  dropCooldown = DROP_COOLDOWN;
}

// Button hit testing
let activeButtons = [];
let pointerUsedForButton = false;

function handleButtonClick(cx, cy) {
  for (const btn of activeButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      btn.action();
      return true;
    }
  }
  return false;
}

canvas.addEventListener('pointermove', (e) => {
  rawPointerX = e.clientX;
});

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  canvas.setPointerCapture(e.pointerId);
  const cx = screenToCanvasX(e.clientX);
  const cy = screenToCanvasY(e.clientY);

  pointerUsedForButton = false;

  if (gameState === State.IN_GAME) {
    rawPointerX = e.clientX;
  }

  if (handleButtonClick(cx, cy)) {
    playClickSound();
    vibrateLight();
    pointerUsedForButton = true;
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (gameState === State.IN_GAME && !pointerUsedForButton) {
    dropCup();
  }
  pointerUsedForButton = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (gameState === State.IN_GAME) gameState = State.PAUSED;
    else if (gameState === State.PAUSED) gameState = State.IN_GAME;
  }
});

// --- Rendering Helpers ---
// Visible portion of container (skip invisible wall extensions)
const CONTAINER_VIS_START = 3;  // first visible point (left rim)
const CONTAINER_VIS_END = CONTAINER_POINTS.length - 4; // last visible point (right rim)

function drawContainer() {
  const pts = CONTAINER_POINTS;
  const vs = CONTAINER_VIS_START;
  const ve = CONTAINER_VIS_END;

  // Fill — subtle inner cup color
  ctx.beginPath();
  ctx.moveTo(worldToCanvasX(pts[vs].x), worldToCanvasY(pts[vs].y));
  for (let i = vs + 1; i <= ve; i++) {
    ctx.lineTo(worldToCanvasX(pts[i].x), worldToCanvasY(pts[i].y));
  }
  ctx.fillStyle = 'rgba(139, 94, 60, 0.06)';
  ctx.fill();

  // Main cup outline
  ctx.beginPath();
  ctx.moveTo(worldToCanvasX(pts[vs].x), worldToCanvasY(pts[vs].y));
  for (let i = vs + 1; i <= ve; i++) {
    ctx.lineTo(worldToCanvasX(pts[i].x), worldToCanvasY(pts[i].y));
  }
  ctx.strokeStyle = '#8b5e3c';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Left highlight (along left wall, ~6 points from visible start)
  ctx.beginPath();
  ctx.moveTo(worldToCanvasX(pts[vs].x) + 6, worldToCanvasY(pts[vs].y) + 10);
  for (let i = vs + 1; i <= vs + 6 && i <= ve; i++) {
    ctx.lineTo(worldToCanvasX(pts[i].x) + 6, worldToCanvasY(pts[i].y));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Right shadow (along right wall, ~6 points from visible end)
  ctx.beginPath();
  ctx.moveTo(worldToCanvasX(pts[ve].x) - 6, worldToCanvasY(pts[ve].y) + 10);
  for (let i = ve - 1; i >= ve - 6 && i >= vs; i--) {
    ctx.lineTo(worldToCanvasX(pts[i].x) - 6, worldToCanvasY(pts[i].y));
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

// Pre-render each tier's boba cup to an offscreen canvas for fast drawing
function renderBobaCupToCanvas(length, radius, color) {
  const r = radius * SCALE;
  const hl = (length / 2) * SCALE;
  const totalH = 2 * hl + 2 * r;
  const rimW = r;
  const baseW = r * 0.6;
  const lidH = r * 0.35;
  const strawH = totalH * 0.35;

  // Canvas size needs to fit the cup drawn upright plus straw
  const padW = 4;
  const padH = 4;
  const cw = Math.ceil(rimW * 2 + padW * 2);
  const ch = Math.ceil(totalH + strawH * 0.1 + padH * 2);
  const offscreen = document.createElement('canvas');
  offscreen.width = cw;
  offscreen.height = ch;
  const c = offscreen.getContext('2d');

  // Draw centered in offscreen canvas (upright, no rotation needed)
  const cx = cw / 2;
  const top = padH + strawH * 0.1;
  const bottom = top + totalH;
  const cupTop = top + lidH;
  const midY = (cupTop + bottom) / 2;

  // --- Cup body (tapered) ---
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(cx - rimW, cupTop);
  c.lineTo(cx - baseW, bottom - baseW);
  c.quadraticCurveTo(cx - baseW, bottom, cx, bottom);
  c.quadraticCurveTo(cx + baseW, bottom, cx + baseW, bottom - baseW);
  c.lineTo(cx + rimW, cupTop);
  c.closePath();
  c.fill();

  // --- Darkened bottom half (using clip) ---
  c.save();
  c.clip();
  c.fillStyle = 'rgba(0,0,0,0.07)';
  c.fillRect(0, midY, cw, bottom - midY);
  c.restore();

  // --- Cup outline ---
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx - rimW, cupTop);
  c.lineTo(cx - baseW, bottom - baseW);
  c.quadraticCurveTo(cx - baseW, bottom, cx, bottom);
  c.quadraticCurveTo(cx + baseW, bottom, cx + baseW, bottom - baseW);
  c.lineTo(cx + rimW, cupTop);
  c.stroke();

  // --- Left rim highlight ---
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(cx - rimW + 2, cupTop + 3);
  c.lineTo(cx - baseW + 2, bottom - baseW - 5);
  c.stroke();

  // --- Dome lid ---
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.ellipse(cx, cupTop, rimW, lidH * 0.6, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.15)';
  c.lineWidth = 1.5;
  c.stroke();

  // Dome top
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.beginPath();
  c.ellipse(cx, cupTop - lidH * 0.4, rimW * 0.8, lidH * 0.5, 0, Math.PI, Math.PI * 2);
  c.fill();

  // --- Straw ---
  const strawW = r * 0.12;
  c.fillStyle = '#4a9';
  c.beginPath();
  c.roundRect(cx - strawW, top - strawH * 0.1, strawW * 2, strawH, strawW);
  c.fill();
  c.strokeStyle = '#388';
  c.lineWidth = 1;
  c.stroke();

  // No boba pearls in sprite — drawn live each frame for active cups

  return {
    canvas: offscreen,
    cx: cw / 2,
    cy: (top + bottom) / 2,
    // Export geometry for live pearl drawing
    cupTop, bottom, baseW, rimW, r, totalH
  };
}

// Render a version with static pearls baked in (for dropper, evolution, next preview)
function renderBobaCupWithPearls(length, radius, color, tierIdx) {
  const base = renderBobaCupToCanvas(length, radius, color);
  const c = base.canvas.getContext('2d');
  const cx = base.cx;

  const pearlR = Math.max(base.r * 0.12, 3);
  const pearlCount = Math.max(3, Math.min(7, Math.floor(base.r / 8)));
  const pearlAreaTop = base.bottom - base.baseW * 2.8;
  const pearlAreaBot = base.bottom - base.baseW * 0.6;
  let seed = tierIdx * 7919 + 42;
  function nextRand() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }

  for (let i = 0; i < pearlCount; i++) {
    const px = cx + (nextRand() - 0.5) * base.baseW * 1.2;
    const py = pearlAreaTop + nextRand() * (pearlAreaBot - pearlAreaTop);

    c.fillStyle = '#3a2518';
    c.beginPath();
    c.arc(px, py, pearlR, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.arc(px - pearlR * 0.3, py - pearlR * 0.3, pearlR * 0.3, 0, Math.PI * 2);
    c.fill();
  }

  return base;
}

// Build sprite caches
const TIER_SPRITES = TIERS.map((t, i) => renderBobaCupToCanvas(t.radius * 1.2, t.radius, t.color));
const TIER_SPRITES_WITH_PEARLS = TIERS.map((t, i) => renderBobaCupWithPearls(t.radius * 1.2, t.radius, t.color, i));

// drawBobaCup: withPearls=false for active cups (pearls drawn live), true for static display
function drawBobaCup(ctx, length, radius, color, tierIndex, withPearls) {
  const sprites = withPearls ? TIER_SPRITES_WITH_PEARLS : TIER_SPRITES;
  if (tierIndex !== undefined && sprites[tierIndex]) {
    const sprite = sprites[tierIndex];
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(sprite.canvas, -sprite.cx, -sprite.cy);
    ctx.restore();
    return;
  }
  for (let i = 0; i < TIERS.length; i++) {
    if (Math.abs(TIERS[i].radius - radius) < 0.001) {
      const sprite = sprites[i];
      ctx.save();
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sprite.canvas, -sprite.cx, -sprite.cy);
      ctx.restore();
      return;
    }
  }
}


function updateCupPearls(dt) {
  for (let i = 0; i < MAX_CUPS; i++) {
    const cup = cupPool[i];
    if (!cup.active) continue;

    const body = cup.body;
    const sprite = TIER_SPRITES[cup.tier];
    const baseW = sprite.baseW;
    const rimW = sprite.rimW;

    // Pearl containment bounds (in upright cup-local coords, relative to sprite center)
    const pearlAreaTop = sprite.bottom - baseW * 2.8 - sprite.cy;
    const pearlAreaBot = sprite.bottom - baseW * 0.6 - sprite.cy;
    const pearlR = Math.max(sprite.r * 0.12, 3);

    // Gentle drift from velocity + constant slow random wander
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const av = body.angularVelocity;
    // Small nudge from physics (clamped so they can't escape)
    const nudgeX = Math.max(-3, Math.min(3, -vx * 0.15 + av * 2.0));
    const nudgeY = Math.max(-3, Math.min(3, -vy * 0.08));

    for (let p = 0; p < cup.pearlCount; p++) {
      const pearl = cup.pearls[p];

      // Slow random wander around base position using time-based sine
      const phase = gameTime * 0.8 + p * 2.1 + i * 1.7;
      const wanderX = Math.sin(phase) * baseW * 0.15;
      const wanderY = Math.cos(phase * 0.7 + p) * baseW * 0.1;

      // Target = base + wander + physics nudge
      const tx = pearl.baseX + wanderX + nudgeX;
      const ty = pearl.baseY + wanderY + nudgeY;

      // Smooth interpolation
      pearl.x += (tx - pearl.x) * 0.1;
      pearl.y += (ty - pearl.y) * 0.1;

      // Clamp to stay inside the cup
      // The cup tapers: at a given Y, the half-width is interpolated between rimW and baseW
      const yFrac = (pearl.y - pearlAreaTop) / (pearlAreaBot - pearlAreaTop);
      const halfW = (rimW + (baseW - rimW) * Math.max(0, Math.min(1, yFrac))) * 0.5;
      pearl.x = Math.max(-halfW + pearlR, Math.min(halfW - pearlR, pearl.x));
      pearl.y = Math.max(pearlAreaTop + pearlR, Math.min(pearlAreaBot - pearlR, pearl.y));
    }
  }
}

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
    ctx.rotate(body.renderAngle);

    // Draw cup sprite (no pearls)
    drawBobaCup(ctx, tier.radius * 1.2, tier.radius, tier.color, cup.tier);

    // Draw live pearls on top
    const sprite = TIER_SPRITES[cup.tier];
    const pearlR = Math.max(sprite.r * 0.12, 3);
    ctx.rotate(-Math.PI / 2); // match the sprite's upright coordinate system
    for (let p = 0; p < cup.pearlCount; p++) {
      const pearl = cup.pearls[p];
      ctx.fillStyle = '#3a2518';
      ctx.beginPath();
      ctx.arc(pearl.x, pearl.y, pearlR, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(pearl.x - pearlR * 0.3, pearl.y - pearlR * 0.3, pearlR * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawDropper() {
  if (gameState !== State.IN_GAME) return;

  const cx = worldToCanvasX(dropperX);
  const cy = worldToCanvasY(DROP_Y);
  const tier = TIERS[currentDropTier];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2);
  drawBobaCup(ctx, tier.radius * 1.2, tier.radius, tier.color, currentDropTier, true);
  ctx.restore();

  // Drop guide line
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

function drawWarningLine() {
  const cy = worldToCanvasY(WARNING_Y);
  const leftX = worldToCanvasX(-2.70);
  const rightX = worldToCanvasX(2.70);

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

function drawRoundedRect(x, y, w, h, r) {
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
}

function drawButton(label, x, y, w, h, action, id) {
  activeButtons.push({ id, x, y, w, h, action });
  // Warm cream button with brown border
  ctx.fillStyle = '#f5e6d3';
  drawRoundedRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = '#c4956a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#6b4226';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawToggleButton(label, enabled, x, y, w, h, action, id) {
  activeButtons.push({ id, x, y, w, h, action });
  ctx.fillStyle = enabled ? '#a8d8a8' : '#d8c8b8';
  drawRoundedRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = enabled ? '#6aaa6a' : '#b0a090';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = enabled ? '#2a5a2a' : '#8a7a6a';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label}: ${enabled ? 'ON' : 'OFF'}`, x + w / 2, y + h / 2);
}

function drawHUD() {
  // HUD background strip — warm brown with soft bottom edge
  ctx.fillStyle = 'rgba(107, 66, 38, 0.9)';
  ctx.fillRect(0, 0, CANVAS_W, 190);
  ctx.fillStyle = 'rgba(107, 66, 38, 0.4)';
  ctx.fillRect(0, 190, CANVAS_W, 10);

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(score.toString(), 30, 20);

  // High score
  ctx.font = '32px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Best: ${highScore}`, 30, 90);

  // Next preview — center of HUD
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Next', CANVAS_W / 2, 10);

  const nextTier = TIERS[nextDropTier];
  ctx.save();
  ctx.translate(CANVAS_W / 2, 120);
  ctx.rotate(Math.PI / 2);
  const previewScale = 0.4;
  ctx.scale(previewScale, previewScale);
  drawBobaCup(ctx, nextTier.radius * 1.2, nextTier.radius, nextTier.color, nextDropTier, true);
  ctx.restore();

  // Pause button — far right
  const pauseBtn = { id: 'pause', x: CANVAS_W - 90, y: 20, w: 60, h: 60, action: () => { gameState = State.PAUSED; } };
  activeButtons.push(pauseBtn);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  drawRoundedRect(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('||', pauseBtn.x + 30, pauseBtn.y + 30);

  // Countdown warning
  const maxOverflow = getMaxOverflowTimer();
  if (maxOverflow > 0) {
    const remaining = Math.ceil(GAME_OVER_TIME - maxOverflow);
    const pulse = 1.0 + 0.15 * Math.sin(gameTime * 8);
    ctx.save();
    ctx.translate(CANVAS_W / 2, worldToCanvasY(WARNING_Y) + 80);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(remaining.toString(), 0, 0);
    ctx.restore();
  }
}

function drawMainMenu() {
  activeButtons.length = 0;

  drawBackground();

  // All menu content centered vertically
  const cy = CANVAS_H / 3;

  // Decorative boba cups flanking the title
  ctx.save();
  ctx.translate(160, cy + 20);
  ctx.rotate(Math.PI / 2);
  ctx.scale(0.7, 0.7);
  drawBobaCup(ctx, TIERS[5].radius * 1.2, TIERS[5].radius, TIERS[5].color, 5, true);
  ctx.restore();

  ctx.save();
  ctx.translate(CANVAS_W - 160, cy - 20);
  ctx.rotate(Math.PI / 2);
  ctx.scale(0.6, 0.6);
  drawBobaCup(ctx, TIERS[2].radius * 1.2, TIERS[2].radius, TIERS[2].color, 2, true);
  ctx.restore();

  ctx.save();
  ctx.translate(CANVAS_W - 100, cy + 120);
  ctx.rotate(Math.PI / 2);
  ctx.scale(0.45, 0.45);
  drawBobaCup(ctx, TIERS[0].radius * 1.2, TIERS[0].radius, TIERS[0].color, 0, true);
  ctx.restore();

  // Title with warm shadow
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(107, 66, 38, 0.3)';
  ctx.font = 'bold 110px sans-serif';
  ctx.fillText('Boba Drop', CANVAS_W / 2 + 4, cy - 116);
  ctx.fillStyle = '#6b4226';
  ctx.fillText('Boba Drop', CANVAS_W / 2, cy - 120);

  // Subtitle
  ctx.fillStyle = '#c4956a';
  ctx.font = '32px sans-serif';
  ctx.fillText('drop \u2022 merge \u2022 sip', CANVAS_W / 2, cy - 20);

  // High score
  if (highScore > 0) {
    ctx.fillStyle = '#a08060';
    ctx.font = '34px sans-serif';
    ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, cy + 100);
  }

  drawButton('Play', CANVAS_W / 2 - 160, CANVAS_H / 2 - 40, 320, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'play');
}

function drawPauseScreen() {
  activeButtons.length = 0;

  // Warm semi-transparent overlay
  ctx.fillStyle = 'rgba(60, 35, 20, 0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel background
  const panelX = CANVAS_W / 2 - 220;
  const panelY = 420;
  const panelW = 440;
  const panelH = 600;
  ctx.fillStyle = 'rgba(250, 245, 240, 0.95)';
  drawRoundedRect(panelX, panelY, panelW, panelH, 30);
  ctx.fill();
  ctx.strokeStyle = '#c4956a';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#6b4226';
  ctx.font = 'bold 70px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Paused', CANVAS_W / 2, 490);

  const btnX = CANVAS_W / 2 - 160;
  const btnW = 320;

  drawToggleButton('SFX', sfxEnabled, btnX, 570, btnW, 65, () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('bobadrop_setting_sfx', sfxEnabled);
  }, 'sfx');

  drawToggleButton('Music', musicEnabled, btnX, 655, btnW, 65, () => {
    musicEnabled = !musicEnabled;
    localStorage.setItem('bobadrop_setting_music', musicEnabled);
  }, 'music');

  drawToggleButton('Haptics', hapticsEnabled, btnX, 740, btnW, 65, () => {
    hapticsEnabled = !hapticsEnabled;
    localStorage.setItem('bobadrop_setting_haptics', hapticsEnabled);
    if (hapticsEnabled) vibrateLight();
  }, 'haptics');

  drawButton('Resume', btnX, 840, btnW, 65, () => {
    gameState = State.IN_GAME;
  }, 'resume');

  drawButton('Quit', btnX, 925, btnW, 65, () => {
    gameState = State.MAIN_MENU;
  }, 'quit');
}

function drawGameOverScreen() {
  activeButtons.length = 0;

  // Warm overlay
  ctx.fillStyle = 'rgba(60, 35, 20, 0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  const panelX = CANVAS_W / 2 - 240;
  const panelY = 380;
  const panelW = 480;
  const panelH = 500;
  ctx.fillStyle = 'rgba(250, 245, 240, 0.95)';
  drawRoundedRect(panelX, panelY, panelW, panelH, 30);
  ctx.fill();
  ctx.strokeStyle = '#c4956a';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#6b4226';
  ctx.font = 'bold 80px sans-serif';
  ctx.fillText('Game Over', CANVAS_W / 2, 460);

  // Score with large emphasis
  ctx.fillStyle = '#8b5e3c';
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText(score.toString(), CANVAS_W / 2, 570);
  ctx.fillStyle = '#a08060';
  ctx.font = '30px sans-serif';
  ctx.fillText('SCORE', CANVAS_W / 2, 620);

  // Best score
  if (highScore > 0) {
    ctx.fillStyle = '#c4956a';
    ctx.font = '32px sans-serif';
    ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, 680);
  }

  drawButton('Play Again', CANVAS_W / 2 - 160, 740, 320, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'playagain');
}

function drawEvolutionLine() {
  const lineY = CANVAS_H - 120;
  const s = 0.35;
  const pad = 8; // base padding between cups

  // Calculate total width first so we can center it
  let totalWidth = 0;
  for (let i = 0; i < TIER_COUNT; i++) {
    totalWidth += TIERS[i].radius * SCALE * s * 2; // each cup's visual width
    if (i < TIER_COUNT - 1) totalWidth += TIERS[i].radius * SCALE * s * 0.5 + pad; // spacing proportional to radius
  }



  let cx = (CANVAS_W - totalWidth) / 2;
  for (let i = 0; i < TIER_COUNT; i++) {
    const tier = TIERS[i];
    const cupW = tier.radius * SCALE * s;
    cx += cupW; // move to center of this cup
    ctx.save();
    ctx.translate(cx, lineY);
    ctx.rotate(Math.PI / 2);
    ctx.scale(s, s);
    drawBobaCup(ctx, tier.radius * 1.2, tier.radius, tier.color, i, true);
    ctx.restore();
    cx += cupW; // move past this cup
    if (i < TIER_COUNT - 1) cx += tier.radius * SCALE * s * 0.5 + pad; // gap
  }
}

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


// --- Pre-rendered background ---
const bgCanvas = document.createElement('canvas');
bgCanvas.width = CANVAS_W;
bgCanvas.height = CANVAS_H;
const bgCtx = bgCanvas.getContext('2d');
// Warm base
bgCtx.fillStyle = '#e8d5c0';
bgCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
// Radial glow
const bgGrd = bgCtx.createRadialGradient(CANVAS_W / 2, 500, 50, CANVAS_W / 2, 500, 600);
bgGrd.addColorStop(0, 'rgba(255, 235, 210, 0.6)');
bgGrd.addColorStop(1, 'rgba(232, 213, 192, 0)');
bgCtx.fillStyle = bgGrd;
bgCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
// Dot pattern
bgCtx.fillStyle = 'rgba(139, 94, 60, 0.04)';
for (let y = 0; y < CANVAS_H; y += 40) {
  for (let x = (y % 80 === 0 ? 0 : 20); x < CANVAS_W; x += 40) {
    bgCtx.beginPath();
    bgCtx.arc(x, y, 6, 0, Math.PI * 2);
    bgCtx.fill();
  }
}

function drawBackground() {
  ctx.drawImage(bgCanvas, 0, 0);
}

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
    updateCupPearls(dt);
    updateOverflowTimers(dt);

    // Warning sound when overflow timer crosses 1s threshold
    const maxOT = getMaxOverflowTimer();
    if (maxOT > 0 && maxOT < GAME_OVER_TIME && Math.floor(maxOT) !== Math.floor(maxOT - dt) && maxOT > 0.5) {
      playWarningSound();
    }

    if (checkGameOver()) {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('bobadrop_highscore', highScore.toString());
      }
      playGameOverSound();
      vibratePattern([50, 100, 50, 100, 80]);
      gameState = State.GAME_OVER;
    }
  }

  // Update dropper position
  if (gameState === State.IN_GAME) {
    if (usePointerInput && rawPointerX >= 0) {
      // Convert raw pointer to world X once per frame, lerp toward it
      const cx = screenToCanvasX(rawPointerX);
      const targetX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, canvasToWorldX(cx)));
      dropperX += (targetX - dropperX) * 0.5;
    } else {
      // Auto-move back and forth
      dropperX += dropperDir * DROPPER_SPEED * dt;
      if (dropperX >= RIGHT_BOUND) { dropperX = RIGHT_BOUND; dropperDir = -1; }
      if (dropperX <= LEFT_BOUND) { dropperX = LEFT_BOUND; dropperDir = 1; }
    }
  }

  // Render
  drawBackground();

  if (gameState === State.MAIN_MENU) {
    drawContainer();
    drawEvolutionLine();
    drawMainMenu();
  } else if (gameState === State.IN_GAME) {
    activeButtons.length = 0;
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

  // Version
  ctx.fillStyle = 'rgba(100,70,40,0.5)';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('v' + VERSION, CANVAS_W - 15, CANVAS_H - 15);

  requestAnimationFrame(loop);
}

gameState = State.MAIN_MENU;
requestAnimationFrame(loop);
