# Boba Drop — Implementation Design

A capsule-merging puzzle game built with vanilla JS, HTML5 Canvas, and the Physics2D engine, targeting the Play Nitzan Games platform.

Based on the [original GDD](../../../../SuikaGame/docs/superpowers/specs/2026-04-08-boba-drop-js-canvas-design.md).

---

## 1. File Structure

```
SuikaGame/
├── index.html          — Canvas element, minimal CSS, loads game.js as ES module
├── game.js             — Game loop, state machine, rendering, input, UI, pools
├── meta.json           — Platform metadata (slug: "boba-drop")
├── thumbnail.png       — Platform thumbnail
└── physics2d/          — Copy of Physics2D engine
    ├── index.js
    └── src/
        ├── math.js
        ├── shapes.js
        ├── body.js
        ├── world.js
        ├── collision.js
        └── debug.js
```

No build tools, no bundler, no framework. ES module imports. Deploys to the platform as a self-contained directory.

---

## 2. Coordinate System

Physics2D operates in the GDD's world units with Y flipped to Y-down (canvas convention).

**Transform from GDD:** `physicsY = 7.0 - gddY`. X is unchanged.

| Concept | GDD (Y-up) | Physics (Y-down) |
|---------|-----------|-------------------|
| Container top rim | Y = 7.0 | Y = 0.0 |
| Drop position | Y = 5.0 | Y = 2.0 |
| Warning line | Y = 2.75 | Y = 4.25 |
| Container bottom | Y = -4.8 | Y = 11.8 |
| Gravity | (0, -9.81) | (0, 9.81) |
| Merge pop velocity | +2.0 (up) | -2.0 (up in Y-down) |
| Drop X bounds | [-2.5, 2.5] | [-2.5, 2.5] |

**Rendering transform (world units to canvas pixels):**
- `SCALE ≈ 154` (px per world unit, ≈ 1080 / 7)
- `canvasX = worldX * SCALE + 540` (center of canvas)
- `canvasY = worldY * SCALE + 100` (100px top offset for HUD — score, next preview)
- Canvas logical resolution: 1080x1920 (9:16 portrait)
- CSS scales to fit viewport preserving aspect ratio with letterboxing
- `devicePixelRatio` handled for crisp rendering

---

## 3. Physics Setup

**Engine:** Physics2D (ES module, copied into `physics2d/` directory).

**World config:**
- `gravity: new Vec2(0, 9.81)`
- `fixedDt: 1/120` (matching GDD's physics timestep)

**Container:** 7 static `Body` objects, each with an `Edge` shape connecting consecutive points:

| Point | World Coords (Y-down) |
|-------|-----------------------|
| 0 | (-3.0, 0.0) — left rim |
| 1 | (-3.5, 10.0) — left wall |
| 2 | (-2.8, 11.2) — left bottom curve |
| 3 | (-1.0, 11.8) — bottom left |
| 4 | (1.0, 11.8) — bottom right |
| 5 | (2.8, 11.2) — right bottom curve |
| 6 | (3.5, 10.0) — right wall |
| 7 | (3.0, 0.0) — right rim |

Open top (no segment between points 7 and 0).

**Physics constants (from GDD):**
- Restitution (bounciness): 0.1
- Friction: 0.4

---

## 4. Tier System

11 tiers, identical to the GDD:

| Tier | Name | Radius | Score | Color | Capsule Length | Capsule Radius |
|------|------|--------|-------|-------|----------------|----------------|
| 0 | Milk Tea | 0.30 | 10 | #d4a574 | 0.36 | 0.30 |
| 1 | Matcha | 0.36 | 20 | #7ec87e | 0.432 | 0.36 |
| 2 | Strawberry | 0.42 | 30 | #f48da6 | 0.504 | 0.42 |
| 3 | Taro | 0.48 | 40 | #b49cd4 | 0.576 | 0.48 |
| 4 | Thai Tea | 0.54 | 50 | #e8945a | 0.648 | 0.54 |
| 5 | Mango | 0.60 | 60 | #f0c850 | 0.720 | 0.60 |
| 6 | Brown Sugar | 0.66 | 80 | #8b5e3c | 0.792 | 0.66 |
| 7 | Honeydew | 0.75 | 100 | #a8d8a8 | 0.900 | 0.75 |
| 8 | Ube | 0.84 | 130 | #7b5ea7 | 1.008 | 0.84 |
| 9 | Passion Fruit | 0.96 | 170 | #d4607a | 1.152 | 0.96 |
| 10 | Lychee | 1.08 | 250 | #f0e8e0 | 1.296 | 1.08 |

**Capsule dimensions:** `Capsule(radius * 1.2, radius)` — derived from the GDD's height/width ratio of 1.6:1. Internal segment length = `radius * 2 * 1.6 - radius * 2 = radius * 1.2`.

**Mass:** `radius * radius * 10` (area-proportional, tunable constant).

**Pre-built shape table:** 11 `Capsule` instances created at init, one per tier, reused by reference when cups change tier.

---

## 5. Cup Pool

64 pre-allocated cup slots:

```
cupPool[64] = {
  body: Body,           // Physics2D body (pre-created, reused)
  tier: 0,              // Current tier (0-10)
  active: false,        // In play
  merging: false,       // Flagged for merge this frame
  overflowTimer: 0      // Seconds center has been above warning line
}
```

**Body.userData:** Points back to the cup slot, so collision callbacks can look up tier/active/merging state.

**Activation:** Set `active = true`, position the body, zero velocity/angular velocity, set tier, swap `body.shape` to the tier's pre-built Capsule, update `body.mass` and `body.inertia`, call `world.addBody(body)`.

**Deactivation:** Set `active = false`, `merging = false`, call `world.removeBody(body)`.

**Shape swap on merge:** When a cup's tier changes, replace `body.shape` with the new tier's pre-built Capsule instance and recalculate mass/inertia.

---

## 6. Merge System

**Detection via collision callback:**

```
world.onCollision = (a, b, contact) => {
  cupA = a.userData, cupB = b.userData
  if both are active cups with same tier and neither is merging:
    flag both as merging = true
    queue merge entry: {slotA, slotB, midpoint, newTier}
}
```

**Merge queue:** Pre-allocated array of 32 entries with an active count. Cleared each frame after processing.

**Processing (after world.step() returns):**

1. For each queued merge:
   - Deactivate both source cups (remove from world)
   - If tier < 10: activate a new cup at midpoint, tier + 1, velocity (0, -2.0)
   - If tier == 10: both deactivate, no new cup (Lychee pairs vanish)
   - Add new tier's score value to running score
   - Spawn 8-12 particles at merge point from particle pool
2. Reset merge queue count to 0

**Why queue:** Collision callbacks fire mid-physics-step. Modifying bodies during iteration would corrupt the solver. Merges are deferred until after `world.step()` completes.

---

## 7. Game Loop & State Machine

**States:** `MAIN_MENU`, `IN_GAME`, `PAUSED`, `GAME_OVER`

**Loop (requestAnimationFrame):**

```
loop(timestamp):
  dt = (timestamp - lastTime) / 1000
  dt = min(dt, 1/30)   // clamp to prevent physics explosion on tab refocus
  lastTime = timestamp

  if state == IN_GAME:
    dropCooldown -= dt
    world.step(dt)      // Physics2D handles fixed 1/120s substeps internally
    processMergeQueue()
    updateOverflowTimers(dt)
    if any overflowTimer >= 3.0:
      state = GAME_OVER
      update high score in localStorage if beaten

  render()              // all states rendered on same canvas
  requestAnimationFrame(loop)
```

**Drop system:**
- Dropper visible at Y=2.0, X clamped to [-2.5, 2.5]
- Drop on pointer release, if cooldown <= 0 and state is IN_GAME
- Spawn cup at (dropperX, 2.0) with zero velocity
- Reset cooldown to 0.5s
- Advance current tier to next; randomize next from tiers 0-4

**Overflow detection:**
- For each active cup: if `body.renderPosition.y < 4.25 * SCALE` (center above warning line in canvas space, or equivalently center Y < 4.25 in world space), increment `overflowTimer += dt`; else reset to 0
- If any timer >= 3.0s: game over

**Reset (Play / Play Again):**
- Deactivate all cups, clear merge queue
- Reset score, timers
- Randomize current and next drop tiers (0-4)
- Transition to IN_GAME

---

## 8. Rendering

**Draw order (back to front):**

1. **Background:** Solid fill `#FAF5F0` (warm beige)
2. **Container:** Stroked polyline through 8 points (world→canvas transform), rounded line joins, ~12px width (0.08 world units * SCALE), brown `#8b5e3c`
3. **Warning line:** Dashed horizontal line at warning Y (4.25 world). Red `#ff4d4d` at 20% opacity. Pulses to 100% when any cup's overflow timer > 0
4. **Cups:** For each active cup slot:
   - `ctx.save()`
   - Translate to `body.renderPosition` (converted to canvas pixels)
   - Rotate by `body.renderAngle`
   - Draw filled capsule (two semicircles + rect) in tier color
   - Draw tier name centered in contrasting text
   - `ctx.restore()`
5. **Merge particles:** For each active particle: filled circle at position, using alpha and radius
6. **Dropper:** Semi-transparent capsule at (dropperX, 2.0), showing current drop tier
7. **Evolution line:** 11 small capsules at bottom of screen showing tier progression
8. **UI overlay:**
   - Score: upper left, large white text
   - High score: below score, smaller white text
   - Next preview: upper right, small capsule of next tier
   - Countdown: center screen, pulsing scale `1.0 + 0.15 * sin(time * 8)`, shown when any overflow timer > 0
   - Menu screens: semi-transparent overlays with canvas-rendered buttons

**Capsule draw helper:** Shared function `drawCapsule(ctx, length, radius, color)` used for cups, dropper, preview, and evolution line. Draws two semicircles connected by a rectangle, filled with the given color.

---

## 9. Input

**Pointer Events on canvas (unified mouse/touch):**

- `pointermove` → Convert screen coords to world X, clamp to [-2.5, 2.5], update dropper X. Only when IN_GAME.
- `pointerup` → Trigger drop if IN_GAME and cooldown elapsed.
- `pointerdown` → Hit-test against active button rectangles for menus.

**Screen-to-world conversion:**
1. Pointer position relative to canvas element (accounting for CSS scaling)
2. Scale by `canvas.width / element.clientWidth`
3. `worldX = (canvasPixelX - 540) / SCALE`

**Button registry:** Pre-allocated array of `{x, y, w, h, action}` objects, updated when state changes. On `pointerdown`, iterate and check point-in-rect.

**Keyboard:** Escape toggles PAUSED ↔ IN_GAME.

---

## 10. Particle System

96 pre-allocated particle slots:

```
particlePool[96] = {
  x, y,              // World-space position
  vx, vy,            // Velocity (world units/s)
  alpha,             // Opacity (1.0 → 0.0)
  radius,            // Current draw radius
  startRadius,       // Initial radius (for shrink calc)
  color,             // Tier color string
  life,              // Remaining seconds
  active: false
}
```

**On merge spawn (8-12 particles):**
- Position: merge midpoint
- Velocity: random direction, magnitude 2-4 world units/s
- Lifetime: 0.3s
- Radius: ~0.08 world units
- Color: merged tier's color

**Update each frame (in render loop, not physics):**
- `x += vx * dt`, `y += vy * dt`, `vy += 9.81 * dt`
- `life -= dt`, `alpha = life / 0.3`, `radius = startRadius * (life / 0.3)`
- When `life <= 0`: `active = false`

**Allocation:** Linear scan for inactive slots. If pool full, skip gracefully (rare with 96 slots and 0.3s lifetime).

---

## 11. Menu Screens

All canvas-rendered with hit-testable button regions.

**Main Menu:**
- "Boba Drop" title (large, brown `#8b5e3c`)
- "Play" button (light gray `#e6e6e6`, black text)
- High score display
- Settings button

**In-Game HUD:**
- Score (upper left, white, large)
- High score (below, white, small)
- Next tier preview (upper right, small capsule)
- Pause button
- Warning line (pulses when overflow detected)
- Countdown (center, pulsing scale, shown when overflow timer active)

**Pause Screen:**
- Semi-transparent dark overlay
- "Paused" title
- SFX toggle, Music toggle buttons
- "Resume" button, "Quit" button (returns to main menu)

**Game Over Screen:**
- Dark overlay (50% alpha black)
- "Game Over" title (large, white)
- Final score, best score
- "Play Again" button

---

## 12. Persistence

**localStorage keys:**

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `bobadrop_highscore` | integer | 0 | Best score |
| `bobadrop_setting_sfx` | boolean | true | SFX on/off (for future audio) |
| `bobadrop_setting_music` | boolean | true | Music on/off (UI present, no-op) |

High score updated on game over if current score > stored value. Settings read on init, written on toggle.

No mid-game save. Game resets on page refresh.

---

## 13. Platform Integration

**meta.json:**
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

**Deployment:** `./scripts/deploy-game.sh games/boba-drop` from the GamesPlatform directory. The entire SuikaGame directory (including `physics2d/`) gets zipped and uploaded.

---

## 14. Balance Constants

All values from the GDD:

| Constant | Value |
|----------|-------|
| TierCount | 11 |
| MaxDropTier | 4 |
| MaxCups | 64 |
| MaxParticles | 96 |
| MaxMergeQueue | 32 |
| DropCooldown | 0.5s |
| GameOverTime | 3.0s |
| DropY | 2.0 (Y-down) |
| LeftBound | -2.5 |
| RightBound | 2.5 |
| WarningLineY | 4.25 (Y-down) |
| MergePopVelocity | -2.0 (upward in Y-down) |
| Gravity | 9.81 (downward) |
| PhysicsTimestep | 1/120s |
| Restitution | 0.1 |
| Friction | 0.4 |
| ParticleLifetime | 0.3s |
| ParticlesPerMerge | 8-12 |

---

## 15. Audio (Deferred)

Audio will be implemented as a follow-up pass after the game is fully playable. The GDD specifies procedural Web Audio API synthesis for:
- 11 merge sound variants (tier-dependent frequency)
- Game over descending sweep
- Button click
- Warning plops
- SFX/Music toggle support

The UI toggles for SFX and Music will be present from the start (persisted to localStorage) but will be no-ops until audio is implemented.

---

## 16. Out of Scope

- Mid-game save/restore
- Music track (matches Unity version — no music)
- Adaptive ortho size for non-9:16 aspect ratios (can be added later)
- Touch gesture support beyond basic pointer events
