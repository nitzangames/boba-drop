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

// --- Canvas Setup ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

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

  // Physics
  if (dt > 0) {
    world.step(dt);
  }

  // Render
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawContainer();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
