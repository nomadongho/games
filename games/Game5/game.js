/**
 * Starwave
 *
 * Novel mechanic: Plant "star seeds" on a cosmic grid. Each seed sends waves
 * of starlight spreading outward one cell per step. When waves from two
 * different seeds try to occupy the same cell, they cancel each other,
 * creating a "dark zone". Goal: cover every target constellation cell with
 * starlight (without cancellation) using a limited number of seeds.
 *
 * Pure vanilla JS + HTML5 Canvas. No frameworks.
 */

"use strict";

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

const GRID = 6; // cells per side
const GROW_MS = 480; // ms between growth ticks

// Cell states
const S = { EMPTY: 0, TARGET: 1, SEED: 2, LIGHT: 3, DARK: 4 };

// Palette: each seed colour has main, glow, and fill variants
const PALETTE = [
  { main: "#00c9ff", glow: "rgba(0,201,255,0.55)", fill: "rgba(0,201,255,0.18)" },
  { main: "#ff6eb4", glow: "rgba(255,110,180,0.55)", fill: "rgba(255,110,180,0.18)" },
  { main: "#7cfc00", glow: "rgba(124,252,0,0.55)", fill: "rgba(124,252,0,0.18)" },
  { main: "#ffd700", glow: "rgba(255,215,0,0.55)", fill: "rgba(255,215,0,0.18)" },
];

// ─────────────────────────────────────────────
//  Stage definitions
// ─────────────────────────────────────────────
//
//  targets   – [row, col] cells that must be lit
//  seeds     – how many star seeds the player may place
//  maxSteps  – wave pulses allowed; limits how far growth can travel
//  hint      – guidance text
//
//  Design rule: with the OPTIMAL seed placement, all targets are reachable
//  in exactly maxSteps pulses. With naive/wrong placement they are not.
//
const STAGES = [
  {
    name: "First Star",
    targets: [[2, 2], [2, 3], [3, 2]],
    seeds: 1,
    maxSteps: 2,
    hint: "💡 Plant 1 seed near the flowers and its light will spread to illuminate the constellation!",
  },
  {
    name: "Two Starlights",
    targets: [[0, 0], [0, 1], [1, 0], [1, 1], [4, 4], [4, 5], [5, 4], [5, 5]],
    seeds: 2,
    maxSteps: 2,
    hint: "💡 Plant one seed in each of the two groups. Light goes dark where two waves meet!",
  },
  {
    name: "Cross Constellation",
    targets: [
      [0, 3], [1, 3], [2, 3], [3, 0], [3, 1], [3, 2],
      [3, 3], [3, 4], [3, 5], [4, 3], [5, 3],
    ],
    seeds: 1,
    maxSteps: 3,
    hint: "💡 To light up the entire cross with one seed… there's only one perfect spot!",
  },
  {
    name: "Corner Secrets",
    targets: [
      [0, 0], [1, 1], [4, 4], [5, 5],
      [0, 5], [1, 4], [4, 1], [5, 0],
    ],
    seeds: 2,
    maxSteps: 3,
    hint: "💡 Use 2 seeds to light up each diagonal group separately!",
  },
  {
    name: "Wave Pattern",
    targets: [
      [0, 1], [0, 3], [0, 5],
      [2, 0], [2, 2], [2, 4],
      [4, 1], [4, 3], [4, 5],
    ],
    seeds: 3,
    maxSteps: 2,
    hint: "💡 Use 3 seeds to light up all the wave cells. Make sure the lights don't overlap!",
  },
  {
    name: "Diamond",
    targets: [
      [0, 3],
      [1, 2], [1, 4],
      [2, 1], [2, 5],
      [3, 0], [3, 5],
      [4, 1], [4, 5],
      [5, 2], [5, 4],
    ],
    seeds: 3,
    maxSteps: 3,
    hint: "💡 Illuminate the diamond border with 3 seeds! Divide the light boundaries carefully.",
  },
  {
    name: "Heart of the Universe",
    targets: [
      [0, 2], [0, 3],
      [1, 1], [1, 4],
      [2, 0], [2, 5],
      [3, 0], [3, 5],
      [4, 1], [4, 4],
      [5, 2], [5, 3],
      [2, 2], [2, 3], [3, 2], [3, 3],
    ],
    seeds: 4,
    maxSteps: 3,
    hint: "💡 Final challenge! Fill the inner ring and border with 4 seeds — no gaps!",
  },
];

// ─────────────────────────────────────────────
//  Game state
// ─────────────────────────────────────────────

let stageIdx = 0;
let grid = [];          // [row][col] = { state, color, age }
let placedSeeds = 0;
let phase = "placing";  // "placing" | "growing" | "won" | "lost"
let growTimer = null;
let stepsLeft = 0;      // wave pulses remaining this stage
let completedStages = new Set();

// Canvas / sizing
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
let CELL = 60; // actual cell pixel size (updated in resize)
let GRID_OFFSET_X = 0; // pixel offset to center grid on canvas
let GRID_OFFSET_Y = 0;

// Particles
let particles = [];

// rAF handle
let rafId = null;

// ─────────────────────────────────────────────
//  Grid helpers
// ─────────────────────────────────────────────

function makeGrid() {
  const g = [];
  for (let r = 0; r < GRID; r++) {
    g[r] = [];
    for (let c = 0; c < GRID; c++) {
      g[r][c] = { state: S.EMPTY, color: -1, age: 0, alpha: 0 };
    }
  }
  return g;
}

function cloneGrid(g) {
  return g.map((row) =>
    row.map((cell) => ({ ...cell }))
  );
}

function neighbors(r, c) {
  const result = [];
  if (r > 0)        result.push([r - 1, c]);
  if (r < GRID - 1) result.push([r + 1, c]);
  if (c > 0)        result.push([r, c - 1]);
  if (c < GRID - 1) result.push([r, c + 1]);
  return result;
}

// ─────────────────────────────────────────────
//  Stage setup
// ─────────────────────────────────────────────

function loadStage(idx) {
  clearGrowTimer();
  particles = [];
  phase = "placing";
  stageIdx = idx;

  const stage = STAGES[idx];
  grid = makeGrid();
  placedSeeds = 0;
  stepsLeft = stage.maxSteps;

  // Mark target cells
  for (const [r, c] of stage.targets) {
    grid[r][c] = { state: S.TARGET, color: -1, age: 0, alpha: 1 };
  }

  updateUI();
  hideOverlay();
  document.getElementById("grow-btn").disabled = true;
}

// ─────────────────────────────────────────────
//  Growth algorithm
// ─────────────────────────────────────────────

function growthStep() {
  const next = cloneGrid(grid);

  // For each cell that wants to expand: record claims per empty/target neighbor
  // claims[r][c] = Set of colorIdx that want this cell
  const claims = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => new Set())
  );

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = grid[r][c];
      if (cell.state !== S.SEED && cell.state !== S.LIGHT) continue;

      for (const [nr, nc] of neighbors(r, c)) {
        const n = grid[nr][nc];
        if (n.state === S.EMPTY || n.state === S.TARGET) {
          claims[nr][nc].add(cell.color);
        }
      }
    }
  }

  // Apply claims
  let changed = false;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const set = claims[r][c];
      if (set.size === 0) continue;
      changed = true;
      const prevState = grid[r][c].state;

      if (set.size === 1) {
        const color = [...set][0];
        next[r][c] = { state: S.LIGHT, color, age: 0, alpha: 0 };
        // Spawn particles when covering a target
        if (prevState === S.TARGET) {
          spawnBloom(r, c, color);
        }
      } else {
        // Contested: dark zone
        next[r][c] = { state: S.DARK, color: -1, age: 0, alpha: 0 };
      }
    }
  }

  grid = next;
  return changed;
}

function checkWin() {
  for (const [r, c] of STAGES[stageIdx].targets) {
    if (grid[r][c].state !== S.SEED && grid[r][c].state !== S.LIGHT) {
      return false;
    }
  }
  return true;
}

function startGrowth() {
  if (phase !== "placing") return;
  phase = "growing";
  document.getElementById("grow-btn").disabled = true;

  growTimer = setInterval(() => {
    const changed = growthStep();
    stepsLeft--;
    updateStepsDisplay();

    if (checkWin()) {
      clearGrowTimer();
      phase = "won";
      completedStages.add(stageIdx);
      updateUI();
      spawnWinBurst();
      showOverlay(true);
    } else if (!changed || stepsLeft <= 0) {
      clearGrowTimer();
      phase = "lost";
      showOverlay(false);
    }
  }, GROW_MS);
}

function clearGrowTimer() {
  if (growTimer) { clearInterval(growTimer); growTimer = null; }
}

// ─────────────────────────────────────────────
//  Particles
// ─────────────────────────────────────────────

function spawnBloom(r, c, colorIdx) {
  const cx = GRID_OFFSET_X + (c + 0.5) * CELL;
  const cy = GRID_OFFSET_Y + (r + 0.5) * CELL;
  const col = PALETTE[colorIdx].main;
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, decay: 0.025 + Math.random() * 0.02,
      radius: 2 + Math.random() * 3,
      color: col,
    });
  }
}

function spawnWinBurst() {
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const colorIdx = Math.floor(Math.random() * PALETTE.length);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, decay: 0.012 + Math.random() * 0.015,
      radius: 2 + Math.random() * 4,
      color: PALETTE[colorIdx].main,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // slight gravity
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─────────────────────────────────────────────
//  Drawing
// ─────────────────────────────────────────────

const t = () => performance.now() / 1000;

function draw() {
  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = "#070714";
  ctx.fillRect(0, 0, W, H);

  // Star field (static look – based on canvas size)
  drawStarField();

  // Age cells (alpha fade-in)
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = grid[r][c];
      cell.age += 0.016;
      if (cell.state === S.LIGHT || cell.state === S.DARK) {
        cell.alpha = Math.min(1, cell.alpha + 0.09);
      }
    }
  }

  // Grid lines (only inside the grid area)
  ctx.strokeStyle = "rgba(100,140,255,0.09)";
  ctx.lineWidth = 1;
  const gx = GRID_OFFSET_X, gy = GRID_OFFSET_Y;
  const gw = CELL * GRID, gh = CELL * GRID;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(gx + i * CELL, gy); ctx.lineTo(gx + i * CELL, gy + gh); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx, gy + i * CELL); ctx.lineTo(gx + gw, gy + i * CELL); ctx.stroke();
  }

  // Cells
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      drawCell(r, c);
    }
  }

  // Particles
  updateParticles();
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  rafId = requestAnimationFrame(draw);
}

// Simple deterministic star field based on hash of (i)
function drawStarField() {
  // Precomputed positions cached on first call
  if (!drawStarField._stars) {
    drawStarField._stars = [];
    // Use LCG to generate positions
    let s = 12345;
    for (let i = 0; i < 80; i++) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const x = ((s >>> 0) % 1000) / 1000;
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const y = ((s >>> 0) % 1000) / 1000;
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const r = 0.4 + (((s >>> 0) % 100) / 100) * 1.2;
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const phase = ((s >>> 0) % 1000) / 1000;
      drawStarField._stars.push({ x, y, r, phase });
    }
  }
  const now = t();
  const W = canvas.width, H = canvas.height;
  for (const star of drawStarField._stars) {
    const alpha = 0.3 + 0.4 * Math.sin(now * 0.8 + star.phase * Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x * W, star.y * H, star.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCell(r, c) {
  const cell = grid[r][c];
  const x = GRID_OFFSET_X + c * CELL;
  const y = GRID_OFFSET_Y + r * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const now = t();

  switch (cell.state) {
    case S.TARGET: {
      const pulse = 0.6 + 0.4 * Math.sin(now * 2.4 + r * 0.7 + c * 0.5);
      ctx.save();
      ctx.shadowBlur = 18 * pulse;
      ctx.shadowColor = "rgba(255,255,200,0.9)";
      // Outer ring
      ctx.strokeStyle = `rgba(255,255,180,${0.5 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      // Star symbol
      drawStar(cx, cy, 5, CELL * 0.22, CELL * 0.10, `rgba(255,255,160,${0.8 + 0.2 * pulse})`);
      ctx.restore();
      break;
    }

    case S.SEED: {
      const pal = PALETTE[cell.color];
      const pulse = 0.7 + 0.3 * Math.sin(now * 3 + cell.color);
      ctx.save();
      ctx.shadowBlur = 22 * pulse;
      ctx.shadowColor = pal.glow;
      // Core circle
      ctx.fillStyle = pal.main;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // Inner bright dot
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.10, 0, Math.PI * 2);
      ctx.fill();
      // Ripple ring
      const rRad = CELL * (0.32 + 0.14 * Math.sin(now * 3 + cell.color));
      ctx.globalAlpha = 0.5 * (1 - (rRad - CELL * 0.28) / (CELL * 0.14));
      ctx.strokeStyle = pal.main;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rRad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case S.LIGHT: {
      const pal = PALETTE[cell.color];
      ctx.save();
      ctx.globalAlpha = cell.alpha;
      ctx.shadowBlur = 12;
      ctx.shadowColor = pal.glow;
      // Fill
      ctx.fillStyle = pal.fill;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      // Border
      ctx.strokeStyle = pal.main;
      ctx.lineWidth = 1;
      ctx.globalAlpha = cell.alpha * 0.55;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      // Small star
      ctx.globalAlpha = cell.alpha * 0.7;
      ctx.shadowBlur = 8;
      drawStar(cx, cy, 4, CELL * 0.14, CELL * 0.06, pal.main);
      ctx.restore();
      break;
    }

    case S.DARK: {
      ctx.save();
      ctx.globalAlpha = cell.alpha * 0.7;
      ctx.fillStyle = "rgba(40,0,20,0.6)";
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      // X mark
      ctx.strokeStyle = "rgba(200,60,60,0.6)";
      ctx.lineWidth = 1.5;
      const d = CELL * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
      ctx.restore();
      break;
    }

    default:
      break;
  }
}

// Draw a star polygon
function drawStar(cx, cy, points, outerR, innerR, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
}

// ─────────────────────────────────────────────
//  UI helpers
// ─────────────────────────────────────────────

function updateStepsDisplay() {
  const el = document.getElementById("steps-value");
  if (!el) return;
  el.textContent = stepsLeft;
  el.className = stepsLeft <= 1 ? "low" : "";
}

function updateUI() {
  const stage = STAGES[stageIdx];
  document.getElementById("stage-label").textContent =
    `STAGE ${stageIdx + 1} / ${STAGES.length}`;
  document.getElementById("stage-name").textContent = stage.name;
  document.getElementById("hint-bar").textContent = stage.hint;
  updateStepsDisplay();

  // Seeds counter dots
  const counter = document.getElementById("seeds-counter");
  counter.innerHTML = "";
  for (let i = 0; i < stage.seeds; i++) {
    const dot = document.createElement("span");
    dot.className = "seed-dot" + (i < placedSeeds ? " used" : "");
    if (i < placedSeeds) {
      dot.style.background = PALETTE[i % PALETTE.length].main;
      dot.style.borderColor = PALETTE[i % PALETTE.length].main;
      dot.style.boxShadow = `0 0 8px ${PALETTE[i % PALETTE.length].glow}`;
    }
    counter.appendChild(dot);
  }

  // Stage progress dots
  const dotsEl = document.getElementById("stage-dots");
  dotsEl.innerHTML = "";
  for (let i = 0; i < STAGES.length; i++) {
    const d = document.createElement("span");
    d.className =
      "sdot" +
      (completedStages.has(i) ? " done" : "") +
      (i === stageIdx && !completedStages.has(i) ? " current" : "");
    dotsEl.appendChild(d);
  }
}

function showOverlay(won) {
  const overlay = document.getElementById("overlay");
  const title = document.getElementById("overlay-title");
  const sub = document.getElementById("overlay-sub");
  const btn = document.getElementById("overlay-btn");

  if (won) {
    overlay.className = "visible win";
    title.textContent = "🌟 Success!";
    if (stageIdx < STAGES.length - 1) {
      sub.textContent = `All constellations illuminated!\nMoving to the next stage.`;
      btn.textContent = "Next Stage ›";
    } else {
      sub.textContent = "You've filled the entire universe with light!\nAmazing! 🎉";
      btn.textContent = "Play Again";
    }
  } else {
    overlay.className = "visible lose";
    title.textContent = "💀 Failed";
    sub.textContent = "Not all constellations were lit.\nMove your seeds and try again!";
    btn.textContent = "Try Again ↺";
  }
}

function hideOverlay() {
  document.getElementById("overlay").className = "";
}

// ─────────────────────────────────────────────
//  Canvas resize
// ─────────────────────────────────────────────

function resize() {
  const wrap = document.getElementById("canvas-wrap");
  const wrapW = wrap.clientWidth  || 360;
  const wrapH = wrap.clientHeight || 360;

  // Canvas fills the whole wrapper; grid is drawn centered inside it
  canvas.width  = wrapW;
  canvas.height = wrapH;

  // Cell size fits the largest square that can sit inside the wrapper
  const squareSide = Math.min(wrapW, wrapH, 420);
  CELL = Math.floor(squareSide / GRID);

  // Center the GRID_SIZE × GRID_SIZE grid inside the canvas
  GRID_OFFSET_X = Math.floor((wrapW - CELL * GRID) / 2);
  GRID_OFFSET_Y = Math.floor((wrapH - CELL * GRID) / 2);

  drawStarField._stars = null;
}

// ─────────────────────────────────────────────
//  Input handling
// ─────────────────────────────────────────────

function canvasToCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const x = (clientX - rect.left) * sx - GRID_OFFSET_X;
  const y = (clientY - rect.top) * sy - GRID_OFFSET_Y;
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (r >= 0 && r < GRID && c >= 0 && c < GRID) return [r, c];
  return null;
}

// Returns the lowest color index not currently used by any placed seed on the grid
function nextAvailableColor() {
  const used = new Set();
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c].state === S.SEED) used.add(grid[r][c].color);
    }
  }
  for (let i = 0; i < PALETTE.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0; // fallback (shouldn't happen with ≤4 seeds)
}

function handleTap(clientX, clientY) {
  if (phase !== "placing") return;
  const pos = canvasToCell(clientX, clientY);
  if (!pos) return;
  const [r, c] = pos;
  const cell = grid[r][c];

  if (cell.state === S.SEED) {
    // Remove seed (undo) — restore the cell to its original state
    const isTarget = STAGES[stageIdx].targets.some(([tr, tc]) => tr === r && tc === c);
    grid[r][c] = isTarget
      ? { state: S.TARGET, color: -1, age: 0, alpha: 1 }
      : { state: S.EMPTY, color: -1, age: 0, alpha: 0 };
    placedSeeds--;
    document.getElementById("grow-btn").disabled = (placedSeeds === 0);
    updateUI();
    return;
  }

  if (cell.state !== S.EMPTY && cell.state !== S.TARGET) return;
  if (placedSeeds >= STAGES[stageIdx].seeds) return;

  // Place seed using the lowest available color so assignment is deterministic
  const colorIdx = nextAvailableColor();
  grid[r][c] = { state: S.SEED, color: colorIdx, age: 0, alpha: 1 };
  placedSeeds++;
  document.getElementById("grow-btn").disabled = false;
  updateUI();
}

canvas.addEventListener("click", (e) => handleTap(e.clientX, e.clientY));
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handleTap(t.clientX, t.clientY);
}, { passive: false });

document.getElementById("grow-btn").addEventListener("click", () => {
  if (phase === "placing" && placedSeeds > 0) startGrowth();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  loadStage(stageIdx);
});

document.getElementById("overlay-btn").addEventListener("click", () => {
  if (phase === "won") {
    if (stageIdx < STAGES.length - 1) {
      loadStage(stageIdx + 1);
    } else {
      // Restart from beginning
      completedStages.clear();
      loadStage(0);
    }
  } else {
    loadStage(stageIdx);
  }
});

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────

function init() {
  resize();
  loadStage(0);
  draw();
}

window.addEventListener("resize", () => {
  resize();
  // Reset star cache
  drawStarField._stars = null;
});

init();
