import { World, Body, Capsule, Edge, Vec2 } from './physics2d/index.js';

// --- Constants ---
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SCALE = 154;        // pixels per world unit (~1080 / 7)
const X_OFFSET = 540;     // center of canvas
const Y_OFFSET = 100;     // top padding for HUD
const BG_COLOR = '#FAF5F0';

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
  { x: -3.0, y: 0.0 },
  { x: -3.5, y: 10.0 },
  { x: -2.8, y: 11.2 },
  { x: -1.0, y: 11.8 },
  { x:  1.0, y: 11.8 },
  { x:  2.8, y: 11.2 },
  { x:  3.5, y: 10.0 },
  { x:  3.0, y: 0.0 },
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
const cupPool = [];
for (let i = 0; i < MAX_CUPS; i++) {
  const body = new Body({
    shape: TIER_SHAPES[0],
    position: new Vec2(0, -100),
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

function processMerges() {
  for (let i = 0; i < mergeCount; i++) {
    const m = mergeQueue[i];
    deactivateCup(m.cupA);
    deactivateCup(m.cupB);

    if (m.newTier < TIER_COUNT) {
      activateCup(m.newTier, m.midX, m.midY, 0, MERGE_POP_VY);
      score += TIERS[m.newTier].score;
    } else {
      score += TIERS[TIER_COUNT - 1].score;
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
let gameTime = 0;

let sfxEnabled = localStorage.getItem('bobadrop_setting_sfx') !== 'false';
let musicEnabled = localStorage.getItem('bobadrop_setting_music') !== 'false';

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
  if (gameState !== State.IN_GAME) return;
  const cx = screenToCanvasX(e.clientX);
  const wx = canvasToWorldX(cx);
  dropperX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, wx));
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const cx = screenToCanvasX(e.clientX);
  const cy = screenToCanvasY(e.clientY);

  pointerUsedForButton = false;

  if (gameState === State.IN_GAME) {
    const wx = canvasToWorldX(cx);
    dropperX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, wx));
  }

  if (handleButtonClick(cx, cy)) {
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

function drawCapsule(ctx, length, radius, color, textColor, label) {
  const halfLen = length / 2;
  const r = radius * SCALE;
  const hl = halfLen * SCALE;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-hl, 0, r, Math.PI * 0.5, Math.PI * 1.5);
  ctx.lineTo(hl, -r);
  ctx.arc(hl, 0, r, Math.PI * 1.5, Math.PI * 0.5);
  ctx.lineTo(-hl, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (label) {
    const fontSize = Math.max(r * 0.55, 10);
    ctx.fillStyle = textColor || '#fff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
}

function tierTextColor(tier) {
  const dark = [4, 6, 8];
  return dark.includes(tier) ? '#fff' : '#333';
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
    ctx.rotate(body.renderAngle + Math.PI / 2);
    drawCapsule(ctx, tier.radius * 1.2, tier.radius, tier.color, tierTextColor(cup.tier), tier.name);
    ctx.restore();
  }
}

function drawDropper() {
  if (gameState !== State.IN_GAME) return;

  const cx = worldToCanvasX(dropperX);
  const cy = worldToCanvasY(DROP_Y);
  const tier = TIERS[currentDropTier];

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2);
  drawCapsule(ctx, tier.radius * 1.2, tier.radius, tier.color, tierTextColor(currentDropTier), tier.name);
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
  const leftX = worldToCanvasX(-3.2);
  const rightX = worldToCanvasX(3.2);

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
  ctx.fillStyle = '#e6e6e6';
  drawRoundedRect(x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawToggleButton(label, enabled, x, y, w, h, action, id) {
  activeButtons.push({ id, x, y, w, h, action });
  ctx.fillStyle = enabled ? '#4CAF50' : '#888';
  drawRoundedRect(x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label}: ${enabled ? 'ON' : 'OFF'}`, x + w / 2, y + h / 2);
}

function drawHUD() {
  // HUD background strip
  ctx.fillStyle = 'rgba(139, 94, 60, 0.85)';
  ctx.fillRect(0, 0, CANVAS_W, 200);

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

  // Next preview
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

  // Pause button
  const pauseBtn = { id: 'pause', x: CANVAS_W - 80, y: 130, w: 60, h: 60, action: () => { gameState = State.PAUSED; } };
  activeButtons.push(pauseBtn);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  drawRoundedRect(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('||', pauseBtn.x + 30, pauseBtn.y + 30);
}

function drawMainMenu() {
  activeButtons = [];

  ctx.fillStyle = '#8b5e3c';
  ctx.font = 'bold 100px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Boba Drop', CANVAS_W / 2, 400);

  ctx.fillStyle = '#888';
  ctx.font = '36px sans-serif';
  ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, 500);

  drawButton('Play', CANVAS_W / 2 - 150, 650, 300, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'play');
}

function drawPauseScreen() {
  activeButtons = [];

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Paused', CANVAS_W / 2, 500);

  const btnX = CANVAS_W / 2 - 175;
  const btnW = 350;

  drawToggleButton('SFX', sfxEnabled, btnX, 650, btnW, 70, () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('bobadrop_setting_sfx', sfxEnabled);
  }, 'sfx');

  drawToggleButton('Music', musicEnabled, btnX, 740, btnW, 70, () => {
    musicEnabled = !musicEnabled;
    localStorage.setItem('bobadrop_setting_music', musicEnabled);
  }, 'music');

  drawButton('Resume', btnX, 850, btnW, 70, () => {
    gameState = State.IN_GAME;
  }, 'resume');

  drawButton('Quit', btnX, 940, btnW, 70, () => {
    gameState = State.MAIN_MENU;
  }, 'quit');
}

function drawGameOverScreen() {
  activeButtons = [];

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Game Over', CANVAS_W / 2, 500);

  ctx.font = '50px sans-serif';
  ctx.fillText(`Score: ${score}`, CANVAS_W / 2, 620);

  ctx.font = '36px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Best: ${highScore}`, CANVAS_W / 2, 690);

  drawButton('Play Again', CANVAS_W / 2 - 175, 780, 350, 80, () => {
    resetGame();
    gameState = State.IN_GAME;
  }, 'playagain');
}

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

  requestAnimationFrame(loop);
}

gameState = State.MAIN_MENU;
requestAnimationFrame(loop);
