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
