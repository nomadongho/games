/**
 * QUANTUM CASCADE ⚛
 * An original mobile-friendly arcade game.
 *
 * Rules:
 *  – Colored quantum orbs appear on screen over time.
 *  – Adjacent same-color orbs form glowing "bonds".
 *  – Tap any orb in a bonded cluster to COLLAPSE it for points.
 *  – Score = clusterSize² × comboMultiplier
 *  – Special orbs: Pulse (links all same-color), Void (absorbs nearby),
 *    Prism (wildcard – joins any cluster).
 *  – Danger bar rises as orbs fill the screen. Game over when full.
 */

// ─── Canvas & resize ──────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

let W, H;
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => { resize(); });

// ─── Audio (Web Audio API) ────────────────────────────────────────────────────
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, dur, vol = 0.3) {
  try {
    const ac  = getAudioCtx();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start();
    osc.stop(ac.currentTime + dur);
  } catch(_) {}
}

function playCollapse(size) {
  const freq = 200 + size * 40;
  playTone(freq, 'sine', 0.18, 0.25);
  setTimeout(() => playTone(freq * 1.5, 'triangle', 0.12, 0.15), 60);
  if (size >= 5) setTimeout(() => playTone(freq * 2, 'sine', 0.22, 0.2), 130);
}

function playSpawn()   { playTone(300 + Math.random() * 200, 'sine', 0.06, 0.06); }
function playDanger()  { playTone(80,  'sawtooth', 0.3, 0.15); }
function playLevelUp() {
  [523, 659, 784, 1046].forEach((f, i) =>
    setTimeout(() => playTone(f, 'triangle', 0.18, 0.2), i * 80)
  );
}
function playGameOver() {
  [400, 300, 200, 100].forEach((f, i) =>
    setTimeout(() => playTone(f, 'sawtooth', 0.3, 0.2), i * 120)
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  { id: 0, hex: '#00ffcc', glow: '#00ffcc', name: 'Cyan'    },
  { id: 1, hex: '#ff0080', glow: '#ff0080', name: 'Pink'    },
  { id: 2, hex: '#ffcc00', glow: '#ffcc00', name: 'Gold'    },
  { id: 3, hex: '#7b61ff', glow: '#7b61ff', name: 'Violet'  },
  { id: 4, hex: '#00ff44', glow: '#00ff44', name: 'Green'   },
];

const ORB_RADIUS      = 18;
const BOND_DIST       = 95;   // max px between orb centers to form a bond
const MAX_FILL        = 0.90; // fraction of screen area triggering game over
const BASE_SPAWN_RATE = 2200; // ms between spawns at level 1
const SPAWN_ACCEL     = 110;  // ms reduction per level
const MIN_SPAWN_RATE  = 700;
const MAX_ORBS        = 90;

// ─── State ────────────────────────────────────────────────────────────────────
let orbs        = [];
let particles   = [];
let scorePopups = [];
let stars       = [];

let score       = 0;
let highScore   = parseInt(localStorage.getItem('qc_highscore') || '0', 10);
let level       = 1;
let combo       = 0;
let lastCollapse= 0;
let phase       = 'menu';   // 'menu' | 'playing' | 'gameover'
let spawnTimer  = 0;
let frameCount  = 0;
let dangerPulse = 0;

let nextOrbId   = 0;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const scoreDisplay   = document.getElementById('scoreDisplay');
const levelDisplay   = document.getElementById('levelDisplay');
const bestDisplay    = document.getElementById('bestDisplay');
const dangerFill     = document.getElementById('dangerFill');
const menuScreen     = document.getElementById('menuScreen');
const gameoverScreen = document.getElementById('gameoverScreen');
const finalScore     = document.getElementById('finalScore');
const menuBest       = document.getElementById('menuBest');
const gameoverBest   = document.getElementById('gameoverBest');
const newBestLabel   = document.getElementById('newBestLabel');
const comboToast     = document.getElementById('comboToast');
const levelFlash     = document.getElementById('levelFlash');

document.getElementById('startBtn').addEventListener('click',   startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('menuBtn').addEventListener('click',    showMenu);

// ─── Stars background ─────────────────────────────────────────────────────────
function initStars() {
  stars = [];
  const count = Math.floor((W * H) / 4000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random(),
      speed: Math.random() * 0.008 + 0.002,
    });
  }
}

// ─── Orb types ────────────────────────────────────────────────────────────────
// type: 'normal' | 'pulse' | 'void' | 'prism'
function createOrb(forceType) {
  const margin = ORB_RADIUS + 10;
  let x, y, attempts = 0;
  do {
    x = margin + Math.random() * (W - margin * 2);
    y = margin + 60 + Math.random() * (H - margin * 2 - 80);
    attempts++;
  } while (attempts < 20 && orbs.some(o => dist(o.x, o.y, x, y) < ORB_RADIUS * 2.5));

  const roll = Math.random();
  let type = 'normal';
  if      (!forceType && roll < 0.06) type = 'pulse';
  else if (!forceType && roll < 0.11) type = 'void';
  else if (!forceType && roll < 0.16) type = 'prism';
  if (forceType) type = forceType;

  const colorId = type === 'prism' ? -1 : Math.floor(Math.random() * Math.min(COLORS.length, 2 + Math.floor(level / 2)));

  return {
    id:      nextOrbId++,
    x, y,
    type,
    colorId,
    r:       ORB_RADIUS,
    born:    Date.now(),
    opacity: 0,       // fade in
    pulse:   0,       // animation phase
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
  };
}

// ─── Cluster detection ────────────────────────────────────────────────────────
function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function getCluster(orb) {
  // BFS: find all connected same-color orbs
  const visited = new Set();
  const queue   = [orb];
  visited.add(orb.id);

  while (queue.length) {
    const cur = queue.shift();
    for (const o of orbs) {
      if (visited.has(o.id)) continue;
      if (dist(cur.x, cur.y, o.x, o.y) > BOND_DIST) continue;

      const compatible =
        (o.type === 'prism') ||
        (cur.type === 'prism') ||
        (o.colorId === cur.colorId) ||
        (o.type === 'pulse' && o.colorId === cur.colorId);

      if (compatible) {
        visited.add(o.id);
        queue.push(o);
      }
    }
  }
  return [...visited].map(id => orbs.find(o => o.id === id)).filter(Boolean);
}

// ─── Collapse ─────────────────────────────────────────────────────────────────
function collapseCluster(cluster) {
  const now   = Date.now();
  const sz    = cluster.length;
  if (sz < 1) return;

  // combo multiplier
  const timeSinceLast = now - lastCollapse;
  if (timeSinceLast < 2500) combo = Math.min(combo + 1, 10);
  else                       combo = 1;
  lastCollapse = now;

  const mult   = 1 + (combo - 1) * 0.5;
  const earned = Math.round(sz * sz * 10 * mult);
  score       += earned;
  if (score > highScore) highScore = score;

  updateHUD();

  // spawn score popup at centroid
  const cx = cluster.reduce((s, o) => s + o.x, 0) / sz;
  const cy = cluster.reduce((s, o) => s + o.y, 0) / sz;
  scorePopups.push({ x: cx, y: cy, text: `+${earned}`, life: 1, mult });

  // particles burst
  const baseColor = cluster[0].type === 'prism' ? '#ffffff'
                  : COLORS[cluster[0].colorId]?.hex || '#fff';
  spawnBurst(cx, cy, baseColor, sz);

  // remove orbs
  const ids = new Set(cluster.map(o => o.id));
  orbs = orbs.filter(o => !ids.has(o.id));

  // void special: suck nearby orbs too
  const voids = cluster.filter(o => o.type === 'void');
  if (voids.length) {
    const extra = orbs.filter(o => voids.some(v => dist(v.x, v.y, o.x, o.y) < BOND_DIST * 1.6));
    extra.forEach(o => spawnBurst(o.x, o.y, COLORS[o.colorId]?.hex || '#fff', 2));
    const extraIds = new Set(extra.map(o => o.id));
    orbs = orbs.filter(o => !extraIds.has(o.id));
    score += extra.length * 5;
    updateHUD();
  }

  // pulse special: also remove all same-color orbs within extended range
  const pulses = cluster.filter(o => o.type === 'pulse');
  if (pulses.length) {
    const targetColor = pulses[0].colorId;
    const pExtra = orbs.filter(o => o.colorId === targetColor);
    pExtra.forEach(o => spawnBurst(o.x, o.y, COLORS[o.colorId]?.hex || '#fff', 2));
    score += pExtra.length * 8;
    const pIds = new Set(pExtra.map(o => o.id));
    orbs = orbs.filter(o => !pIds.has(o.id));
    updateHUD();
  }

  playCollapse(sz);

  // show combo toast
  if (combo >= 3) {
    showComboToast(combo, mult);
  }

  // level up check
  const newLevel = 1 + Math.floor(score / 1000);
  if (newLevel > level) {
    level = newLevel;
    playLevelUp();
    flashLevel();
  }
}

// ─── Particle effects ─────────────────────────────────────────────────────────
function spawnBurst(x, y, color, count) {
  const n = Math.min(count * 6 + 10, 40);
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1.5;
    particles.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      r:     Math.random() * 3 + 1,
      color,
      life:  1,
      decay: Math.random() * 0.03 + 0.02,
    });
  }
  // ring shockwave
  particles.push({ x, y, ring: true, r: 5, maxR: 60 + count * 8, life: 1, color, decay: 0.04 });
}

// ─── Combo toast ──────────────────────────────────────────────────────────────
let comboTimeout;
function showComboToast(c, mult) {
  clearTimeout(comboTimeout);
  comboToast.textContent = `COMBO ×${c}  (×${mult.toFixed(1)})`;
  comboToast.style.transition = 'none';
  comboToast.style.transform  = 'translate(-50%, -50%) scale(1.2)';
  comboToast.style.opacity    = '1';
  comboTimeout = setTimeout(() => {
    comboToast.style.transition = 'opacity 0.5s, transform 0.5s';
    comboToast.style.transform  = 'translate(-50%, -50%) scale(0.8)';
    comboToast.style.opacity    = '0';
  }, 900);
}

function flashLevel() {
  levelFlash.style.background = 'rgba(123,97,255,0.25)';
  levelFlash.style.transition = 'none';
  levelFlash.style.opacity    = '1';
  setTimeout(() => {
    levelFlash.style.transition = 'opacity 0.6s';
    levelFlash.style.opacity    = '0';
  }, 50);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD() {
  scoreDisplay.textContent = score.toLocaleString();
  levelDisplay.textContent = level;
  bestDisplay.textContent  = highScore.toLocaleString();

  const pct = Math.min(orbs.length / MAX_ORBS, 1) * 100;
  dangerFill.style.width = pct + '%';

  if (pct > 80) {
    dangerFill.style.background = 'linear-gradient(90deg, #ff4400, #ff0000)';
    if (frameCount % 60 === 0) playDanger();
  } else if (pct > 50) {
    dangerFill.style.background = 'linear-gradient(90deg, #ffcc00, #ff4400)';
  } else {
    dangerFill.style.background = 'linear-gradient(90deg, #00ffcc, #ff0080)';
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────
function handleTap(clientX, clientY) {
  if (phase !== 'playing') return;

  // find tapped orb (largest radius wins)
  let tapped = null;
  let bestD  = ORB_RADIUS + 14;
  for (const o of orbs) {
    const d = dist(o.x, o.y, clientX, clientY);
    if (d < bestD) { bestD = d; tapped = o; }
  }
  if (!tapped) return;

  const cluster = getCluster(tapped);
  if (cluster.length >= 1) collapseCluster(cluster);
}

canvas.addEventListener('click', e => {
  handleTap(e.clientX, e.clientY);
});
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handleTap(t.clientX, t.clientY);
}, { passive: false });

// ─── Game flow ────────────────────────────────────────────────────────────────
function startGame() {
  orbs        = [];
  particles   = [];
  scorePopups = [];
  score       = 0;
  level       = 1;
  combo       = 0;
  lastCollapse= 0;
  spawnTimer  = 0;
  frameCount  = 0;
  nextOrbId   = 0;
  phase       = 'playing';

  menuScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');

  updateHUD();
  initStars();

  // seed a few orbs immediately
  for (let i = 0; i < 5; i++) orbs.push(createOrb());
}

function showMenu() {
  phase = 'menu';
  menuBest.textContent = highScore.toLocaleString();
  gameoverScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  initStars();
}

function endGame() {
  phase = 'gameover';
  localStorage.setItem('qc_highscore', String(highScore));

  finalScore.textContent   = score.toLocaleString();
  gameoverBest.textContent = highScore.toLocaleString();
  newBestLabel.style.display = (score >= highScore && score > 0) ? 'block' : 'none';
  gameoverScreen.classList.remove('hidden');
  playGameOver();
}

// ─── Spawn logic ──────────────────────────────────────────────────────────────
function spawnRate() {
  return Math.max(MIN_SPAWN_RATE, BASE_SPAWN_RATE - (level - 1) * SPAWN_ACCEL);
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawStars() {
  for (const s of stars) {
    s.a += s.speed;
    const alpha = 0.3 + 0.5 * Math.abs(Math.sin(s.a));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBonds() {
  const drawn = new Set();
  for (let i = 0; i < orbs.length; i++) {
    const a = orbs[i];
    if (a.opacity < 0.5) continue;
    for (let j = i + 1; j < orbs.length; j++) {
      const b = orbs[j];
      if (b.opacity < 0.5) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > BOND_DIST) continue;

      const compatible =
        (a.type === 'prism' || b.type === 'prism') ||
        (a.colorId === b.colorId);
      if (!compatible) continue;

      const key = `${Math.min(a.id,b.id)}-${Math.max(a.id,b.id)}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const alpha = (1 - d / BOND_DIST) * 0.55 * Math.min(a.opacity, b.opacity);
      const color = a.type === 'prism' || b.type === 'prism'
        ? `rgba(255,255,255,${alpha})`
        : hexWithAlpha(COLORS[a.colorId]?.hex || '#fff', alpha);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5 + (1 - d / BOND_DIST) * 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -(frameCount * 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function hexWithAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawOrbs() {
  const t = Date.now();
  for (const o of orbs) {
    o.opacity = Math.min(1, o.opacity + 0.04);
    o.pulse   = (t - o.born) / 900;
    o.x      += o.vx;
    o.y      += o.vy;
    // soft bounce walls
    const m = o.r + 2;
    if (o.x < m || o.x > W - m) { o.vx *= -1; o.x = Math.max(m, Math.min(W-m, o.x)); }
    if (o.y < m + 55 || o.y > H - m - 10) { o.vy *= -1; o.y = Math.max(m+55, Math.min(H-m-10, o.y)); }

    ctx.save();
    ctx.globalAlpha = o.opacity;

    if (o.type === 'prism') {
      drawPrismOrb(o);
    } else if (o.type === 'void') {
      drawVoidOrb(o);
    } else if (o.type === 'pulse') {
      drawPulseOrb(o);
    } else {
      drawNormalOrb(o);
    }

    ctx.restore();
  }
}

function drawNormalOrb(o) {
  const col  = COLORS[o.colorId];
  const glow = col.glow;
  const hex  = col.hex;
  const pulseFactor = 0.12 * Math.sin(o.pulse * Math.PI * 2);
  const r    = o.r * (1 + pulseFactor);

  // outer glow
  const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.5);
  grad.addColorStop(0,   hexWithAlpha(glow, 0.35));
  grad.addColorStop(0.5, hexWithAlpha(glow, 0.12));
  grad.addColorStop(1,   hexWithAlpha(glow, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // core
  ctx.shadowColor = glow;
  ctx.shadowBlur  = 18;
  const core = ctx.createRadialGradient(o.x - r*0.25, o.y - r*0.25, 0, o.x, o.y, r);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, hex);
  core.addColorStop(1,   hexWithAlpha(hex, 0.7));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawVoidOrb(o) {
  const pulseFactor = 0.15 * Math.sin(o.pulse * Math.PI * 2);
  const r = o.r * (1 + pulseFactor);

  // sinister glow
  ctx.shadowColor = '#ff0080';
  ctx.shadowBlur  = 20;
  const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
  grad.addColorStop(0, 'rgba(20,0,30,1)');
  grad.addColorStop(0.6, 'rgba(40,0,60,1)');
  grad.addColorStop(1,   '#ff0080');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();

  // ring
  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  // hole icon
  ctx.fillStyle   = 'rgba(255,255,255,0.75)';
  ctx.font        = `${r}px serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline= 'middle';
  ctx.shadowBlur  = 0;
  ctx.fillText('🕳', o.x, o.y + 1);
}

function drawPulseOrb(o) {
  const col = COLORS[o.colorId];
  const pulseFactor = 0.2 * Math.abs(Math.sin(o.pulse * Math.PI * 3));
  const r = o.r * (1 + pulseFactor);

  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur  = 25;
  const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, col.hex);
  grad.addColorStop(1,   hexWithAlpha(col.hex, 0.5));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();

  // lightning bolt icon
  ctx.fillStyle    = 'rgba(0,0,0,0.8)';
  ctx.font         = `${r}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur   = 0;
  ctx.fillText('⚡', o.x, o.y + 1);
}

function drawPrismOrb(o) {
  const pulseFactor = 0.1 * Math.sin(o.pulse * Math.PI * 2);
  const r = o.r * (1 + pulseFactor);
  const hue = (frameCount * 2) % 360;

  ctx.shadowColor = `hsl(${hue},100%,65%)`;
  ctx.shadowBlur  = 22;

  const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
  grad.addColorStop(0,   '#ffffff');
  grad.addColorStop(0.3, `hsl(${hue},100%,65%)`);
  grad.addColorStop(0.6, `hsl(${(hue+120)%360},100%,55%)`);
  grad.addColorStop(1,   `hsl(${(hue+240)%360},100%,45%)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle    = 'rgba(0,0,0,0.7)';
  ctx.font         = `${r}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur   = 0;
  ctx.fillText('🌈', o.x, o.y + 1);
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    if (p.ring) {
      p.r = p.r + (p.maxR - p.r) * 0.12;
      ctx.save();
      ctx.globalAlpha = p.life * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.93;
      p.vy *= 0.93;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawScorePopups() {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i];
    p.life -= 0.025;
    if (p.life <= 0) { scorePopups.splice(i, 1); continue; }
    p.y -= 1.2;

    const a     = Math.min(1, p.life * 2);
    const scale = 1 + (1 - p.life) * 0.4;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle   = p.mult > 1.5 ? '#ffcc00' : '#ffffff';
    ctx.font        = `bold ${Math.round(16 + p.mult * 4)}px Segoe UI`;
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.shadowColor = p.mult > 1.5 ? '#ffcc00' : '#ffffff';
    ctx.shadowBlur  = 10;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

// ─── Main game loop ───────────────────────────────────────────────────────────
let lastTime = 0;
function gameLoop(ts) {
  requestAnimationFrame(gameLoop);
  const dt = ts - lastTime;
  lastTime = ts;
  frameCount++;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#030310';
  ctx.fillRect(0, 0, W, H);

  // Nebula clouds
  drawNebula();
  drawStars();

  if (phase === 'playing') {
    // Spawn
    spawnTimer += dt;
    if (orbs.length < MAX_ORBS && spawnTimer >= spawnRate()) {
      spawnTimer = 0;
      orbs.push(createOrb());
      if (Math.random() < 0.08) playSpawn();
    }

    // Check game over
    if (orbs.length >= MAX_ORBS) {
      endGame();
      return;
    }

    drawBonds();
    drawOrbs();
    drawParticles();
    drawScorePopups();
    drawDangerPulse();
    updateHUD();
  } else {
    // still show particles on menu / gameover
    drawBonds();
    drawOrbs();
    drawParticles();
  }
}

// Nebula background (cached occasionally)
let nebCache = null, nebLastFrame = -999;
function drawNebula() {
  if (frameCount - nebLastFrame > 120 || !nebCache) {
    const off = document.createElement('canvas');
    off.width  = W;
    off.height = H;
    const oc = off.getContext('2d');
    const clouds = [
      { x: W*0.2, y: H*0.3, r: W*0.5, c: 'rgba(30,0,80,0.18)'  },
      { x: W*0.8, y: H*0.7, r: W*0.45, c: 'rgba(0,50,70,0.15)' },
      { x: W*0.5, y: H*0.5, r: W*0.4, c: 'rgba(50,0,50,0.12)'   },
    ];
    for (const cl of clouds) {
      const g = oc.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
      g.addColorStop(0, cl.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      oc.fillStyle = g;
      oc.fillRect(0, 0, W, H);
    }
    nebCache = off;
    nebLastFrame = frameCount;
  }
  ctx.drawImage(nebCache, 0, 0);
}

let dangerAlpha = 0;
function drawDangerPulse() {
  const fillPct = orbs.length / MAX_ORBS;
  if (fillPct < 0.6) { dangerAlpha *= 0.9; return; }
  dangerPulse += 0.05;
  dangerAlpha = Math.min(0.45, fillPct - 0.6) * (0.5 + 0.5 * Math.sin(dangerPulse * 3));

  const grad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.85);
  grad.addColorStop(0, 'rgba(255,0,0,0)');
  grad.addColorStop(1, `rgba(255,0,0,${dangerAlpha.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initStars();
menuBest.textContent = highScore.toLocaleString();

// Populate menu with some idle orbs for visual flair
for (let i = 0; i < 12; i++) orbs.push(createOrb());

requestAnimationFrame(gameLoop);
