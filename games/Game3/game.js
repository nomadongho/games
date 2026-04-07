/* ================================================================
   ALIEN ASSAULT 2185
   Vanilla JS + Canvas 2D – no frameworks
   ================================================================

   CONTROLS
   Move     : ← → / A D
   Jump     : Space / ↑ / W   (double-jump available)
   Dash     : Shift            (short dash, recharges)
   Shoot    : X / Z / J
   Switch   : 1 Blaster  2 Spread  3 Plasma  4 Rocket

   STAGE MAP
   1 Ruined City  → 2 Underground → 3 Space Station
   → 4 ★ MID-BOSS (Titan Mech)
   → 5 Alien Hive → 6 Weapons Depot → 7 Mothership Deck
   → 8 ★ FINAL BOSS (Nexus Overlord)
================================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// CANVAS
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W = 800, H = 450;
canvas.width  = W;
canvas.height = H;

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const GRAV    = 0.5;
const GND     = H - 70;   // y of the ground surface
const JV      = -12;      // jump velocity
const DJV     = -10;      // double-jump velocity

// ─────────────────────────────────────────────────────────────
// STAGE CONFIG
// ─────────────────────────────────────────────────────────────
const STAGES = [
  { id:1, name:'RUINED CITY',      sky1:'#07091a', sky2:'#120a0a', gc:'#2a1a1a',
    types:['crawler','shooter'],                           rate:200, total:15, boss:null    },
  { id:2, name:'UNDERGROUND',      sky1:'#050510', sky2:'#090909', gc:'#191919',
    types:['crawler','shooter','flyer'],                   rate:165, total:20, boss:null    },
  { id:3, name:'SPACE STATION',    sky1:'#020214', sky2:'#0a0016', gc:'#1a0a28',
    types:['shooter','flyer','shielder'],                  rate:135, total:25, boss:null    },
  { id:4, name:'MID-BOSS ARENA',   sky1:'#1a0000', sky2:'#000000', gc:'#200a0a',
    types:[],                                              rate:0,   total:0,  boss:'titan' },
  { id:5, name:'ALIEN HIVE',       sky1:'#0a0900', sky2:'#000d00', gc:'#0a1a08',
    types:['crawler','shielder','exploder'],               rate:130, total:28, boss:null    },
  { id:6, name:'WEAPONS DEPOT',    sky1:'#0f000c', sky2:'#06000f', gc:'#160026',
    types:['shooter','shielder','heavy'],                  rate:110, total:30, boss:null    },
  { id:7, name:'MOTHERSHIP DECK',  sky1:'#000012', sky2:'#0a0a00', gc:'#0e0e1e',
    types:['flyer','heavy','elite'],                       rate:90,  total:35, boss:null    },
  { id:8, name:'NEXUS CORE',       sky1:'#120005', sky2:'#000000', gc:'#160016',
    types:[],                                              rate:0,   total:0,  boss:'nexus' },
];

// ─────────────────────────────────────────────────────────────
// WEAPON DEFINITIONS
// ─────────────────────────────────────────────────────────────
const WDEF = {
  blaster:{ name:'BLASTER', clr:'#44aaff', dmg:20, cd:10, spd:14, r:4, maxAmmo:Infinity, spread:0,    cnt:1, splash:0  },
  spread: { name:'SPREAD',  clr:'#ffee00', dmg:14, cd:16, spd:11, r:5, maxAmmo:60,       spread:0.25, cnt:3, splash:0  },
  plasma: { name:'PLASMA',  clr:'#ff44ff', dmg: 9, cd: 3, spd:16, r:3, maxAmmo:150,      spread:0,    cnt:1, splash:0  },
  rocket: { name:'ROCKET',  clr:'#ff6600', dmg:90, cd:65, spd: 7, r:8, maxAmmo:12,       spread:0,    cnt:1, splash:90 },
};

// ─────────────────────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────────────────────
// gState: 'menu' | 'playing' | 'transition' | 'gameover' | 'victory'
let gState     = 'menu';
let stageIdx   = 0;
let score      = 0;
let hiScore    = 0;
let stageKills = 0;
let frame      = 0;
let spawnTimer = 0;
let camX       = 0;
let shake      = 0;
let transTimer = 0;

let player    = null;
let enemies   = [];
let pBullets  = [];
let eBullets  = [];
let items     = [];
let particles = [];
let boss      = null;
let stars     = [];

// ─────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────
const keys = {}, jp = {};
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
window.addEventListener('keydown', e => {
  if (!keys[e.code]) jp[e.code] = true;
  keys[e.code] = true;
  const block = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  if (block.includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function clearJP() { for (const k in jp) delete jp[k]; }

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const rnd    = (a, b) => Math.random() * (b - a) + a;
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const clamp  = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const lerp   = (a, b, t) => a + (b - a) * t;

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ─────────────────────────────────────────────────────────────
// STARS
// ─────────────────────────────────────────────────────────────
function initStars() {
  stars = [];
  for (let i = 0; i < 180; i++) {
    stars.push({
      x:   rnd(0, 4000),
      y:   rnd(0, GND - 40),
      r:   rnd(0.5, 2.0),
      spd: rnd(0.05, 0.4),
      bri: rnd(0.4, 1.0),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, vx, vy, color, life, size = 3) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = this.maxLife = life;
    this.size = size;
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.08;
    this.vx *= 0.97;
    this.life--;
  }
  draw() {
    const a = this.life / this.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x - camX, this.y, this.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function spawnExplosion(x, y, color = '#ff6600', count = 16, speed = 4, size = 3) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rnd(0, 0.4);
    const s     = rnd(speed * 0.4, speed);
    particles.push(new Particle(x, y, Math.cos(angle) * s, Math.sin(angle) * s, color, rndInt(20, 45), size));
  }
  shake = Math.max(shake, 6);
}

function spawnHit(x, y, color) {
  for (let i = 0; i < 5; i++) {
    particles.push(new Particle(x, y, rnd(-3, 3), rnd(-3.5, 0), color, rndInt(8, 18), 2));
  }
}

// ─────────────────────────────────────────────────────────────
// BACKGROUND DRAWING
// ─────────────────────────────────────────────────────────────
function drawBackground() {
  const cfg = STAGES[stageIdx];

  // Sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, GND);
  g.addColorStop(0, cfg.sky1);
  g.addColorStop(1, cfg.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Stars / ambient dots
  for (const s of stars) {
    const sx = ((s.x - camX * s.spd) % (W * 2) + W * 2) % (W * 2);
    if (sx > W) continue;
    ctx.globalAlpha = s.bri * (0.6 + 0.4 * Math.sin(frame * 0.04 + s.x));
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Stage-specific structures
  drawBgStructures();

  // Ground
  ctx.fillStyle = cfg.gc;
  ctx.fillRect(0, GND, W, H - GND);

  // Ground glow edge
  ctx.strokeStyle = '#334455';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, GND);
  ctx.lineTo(W, GND);
  ctx.stroke();

  // Ground grid lines (scrolling)
  ctx.strokeStyle  = '#223344';
  ctx.lineWidth    = 1;
  ctx.globalAlpha  = 0.45;
  const gOff = ((camX * 0.5) % 80 + 80) % 80;
  for (let gx = -gOff; gx < W; gx += 80) {
    ctx.beginPath();
    ctx.moveTo(gx, GND);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBgStructures() {
  const oFar = camX * 0.15;
  const oMid = camX * 0.40;

  if (stageIdx === 0 || stageIdx === 4) {
    drawBuildings(oFar, '#111128', 0.28, 130, 70);
    drawBuildings(oMid, '#1c1c38', 0.55, 85,  45);
  } else if (stageIdx === 1) {
    drawCaveWalls(oFar, oMid);
  } else if (stageIdx === 2 || stageIdx === 6) {
    drawMechPanels(oFar);
  } else if (stageIdx === 3 || stageIdx === 7) {
    drawBossArena();
  } else if (stageIdx === 5) {
    drawBuildings(oFar, '#1a0030', 0.3, 90, 50);
    drawMechPanels(oMid * 0.5);
  }
}

function drawBuildings(off, color, alpha, maxH, minH) {
  ctx.globalAlpha = alpha;
  const seed = stageIdx * 100;
  for (let i = 0; i < 14; i++) {
    const bx  = ((i * 191 + seed) % 650 - (off % 650) + 650 * 5) % 650;
    const bw  = 32 + (i * 41 + seed) % 48;
    const bh  = minH + (i * 67 + seed) % (maxH - minH);
    ctx.fillStyle = color;
    ctx.fillRect(bx, GND - bh, bw, bh);
    // Windows
    ctx.fillStyle = '#334466';
    for (let wx = bx + 5; wx < bx + bw - 12; wx += 14) {
      for (let wy = GND - bh + 8; wy < GND - 12; wy += 18) {
        if ((wx * 3 + wy + Math.floor(frame / 60)) % 7 > 1)
          ctx.fillRect(wx, wy, 8, 9);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawCaveWalls(oFar, oMid) {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#223322';
  for (let i = 0; i < 10; i++) {
    const cx = ((i * 110 - oFar * 0.7) % 1100 + 1100) % 1100 - 55;
    const ch = 28 + (i * 53) % 55;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx + 22, ch); ctx.lineTo(cx - 22, ch); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 50, GND); ctx.lineTo(cx + 65, GND - ch); ctx.lineTo(cx + 35, GND); ctx.fill();
  }
  // Pipes
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#334444';
  for (let i = 0; i < 6; i++) {
    const px = ((i * 175 - oMid * 0.6) % 1050 + 1050) % 1050 - 50;
    ctx.fillRect(px, 15, 14, GND - 25);
  }
  ctx.globalAlpha = 1;
}

function drawMechPanels(off) {
  ctx.globalAlpha = 0.22;
  ctx.fillStyle   = '#1e3040';
  const GAP = 120;
  for (let i = 0; i < 8; i++) {
    const px = ((i * GAP - off * 0.7) % (GAP * 8) + GAP * 8) % (GAP * 8);
    ctx.fillRect(px, 18, GAP - 6, GND - 28);
    ctx.strokeStyle = '#336699';
    ctx.lineWidth   = 1;
    ctx.strokeRect(px, 18, GAP - 6, GND - 28);
  }
  ctx.globalAlpha = 1;
}

function drawBossArena() {
  const g = ctx.createRadialGradient(W / 2, GND / 2, 5, W / 2, GND / 2, 320);
  g.addColorStop(0, 'rgba(120,0,0,0.25)');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GND);
  // Warning floor stripes
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 14; i++) {
    const sx = ((i * 70 - camX * 0.3) % (70 * 14) + 70 * 14) % (70 * 14);
    ctx.fillStyle = i % 2 === 0 ? '#cc0000' : '#cccc00';
    ctx.fillRect(sx, GND, 70, 10);
  }
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────
// BULLET
// ─────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, vx, vy, dmg, r, color, fromPlayer, splash = 0) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = r;
    this.color = color;
    this.fromPlayer = fromPlayer;
    this.splash = splash;
    this.life   = 100;
    this.active = true;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0 || this.y > GND + 40 || this.y < -40) this.active = false;
    if (this.x < camX - 120 || this.x > camX + W + 120)      this.active = false;
  }
  draw() {
    const sx = this.x - camX;
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = this.r * 3;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(sx, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    // Trail
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(sx - this.vx * 2, this.y - this.vy * 2, this.r * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }
}

// ─────────────────────────────────────────────────────────────
// PLAYER
// ─────────────────────────────────────────────────────────────
class Player {
  constructor() {
    this.x    = 100;
    this.y    = GND - 48;
    this.w    = 28;
    this.h    = 48;
    this.vx   = 0;
    this.vy   = 0;
    this.onGround = false;
    this.jumps    = 0;
    this.hp   = 100;
    this.maxHp = 100;
    this.invincible = 0;
    this.weapon   = 'blaster';
    this.ammo = { spread: 0, plasma: 0, rocket: 0 };
    this.shootCd  = 0;
    this.facing   = 1;
    this.walkF    = 0;
    this.dead     = false;
    this.dashCd   = 0;
    this.dashing  = 0;
    this.shieldTime = 0;
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update() {
    if (this.dead) return;

    // ── Horizontal movement ──────────────────────────────────
    const left  = keys['ArrowLeft']  || keys['KeyA'];
    const right = keys['ArrowRight'] || keys['KeyD'];
    if (!this.dashing) {
      if (left)        { this.vx = -4; this.facing = -1; }
      else if (right)  { this.vx =  4; this.facing =  1; }
      else             { this.vx *= 0.8; }
    }

    // ── Dash (Shift) ─────────────────────────────────────────
    if ((jp['ShiftLeft'] || jp['ShiftRight']) && this.dashCd <= 0 && !this.dashing) {
      this.dashing = 14;
      this.vx      = this.facing * 14;
      this.dashCd  = 50;
      spawnHit(this.x + this.w / 2, this.y + this.h / 2, '#44aaff');
    }
    if (this.dashing > 0) { this.dashing--; if (!this.dashing) this.vx = 0; }
    if (this.dashCd  > 0) this.dashCd--;

    // ── Jump ─────────────────────────────────────────────────
    const jumpKey = jp['Space'] || jp['ArrowUp'] || jp['KeyW'];
    if (jumpKey && this.jumps < 2) {
      this.vy = this.jumps === 0 ? JV : DJV;
      this.jumps++;
      spawnHit(this.x + this.w / 2, this.y + this.h, '#44aaff');
    }

    // ── Physics ──────────────────────────────────────────────
    this.vy += GRAV;
    this.x  += this.vx;
    this.y  += this.vy;

    // ── Ground ───────────────────────────────────────────────
    this.onGround = false;
    if (this.y + this.h >= GND) {
      this.y   = GND - this.h;
      this.vy  = 0;
      this.onGround = true;
      this.jumps    = 0;
    }

    // ── World left bound ─────────────────────────────────────
    if (this.x < camX) this.x = camX;

    // ── Camera follow (only in non-boss stages) ───────────────
    const cfg = STAGES[stageIdx];
    if (!cfg.boss) {
      camX = Math.max(0, lerp(camX, this.x - W * 0.35, 0.08));
    }

    // ── Shoot ────────────────────────────────────────────────
    if (this.shootCd > 0) this.shootCd--;
    if ((keys['KeyX'] || keys['KeyZ'] || keys['KeyJ']) && this.shootCd <= 0) {
      this.fireBullet();
    }

    // ── Weapon switch ─────────────────────────────────────────
    if (jp['Digit1']) this.weapon = 'blaster';
    if (jp['Digit2'] && this.ammo.spread > 0) this.weapon = 'spread';
    if (jp['Digit3'] && this.ammo.plasma  > 0) this.weapon = 'plasma';
    if (jp['Digit4'] && this.ammo.rocket  > 0) this.weapon = 'rocket';

    // ── Timers ────────────────────────────────────────────────
    if (this.invincible  > 0) this.invincible--;
    if (this.shieldTime  > 0) this.shieldTime--;

    // ── Walk animation ────────────────────────────────────────
    if ((left || right) && this.onGround) this.walkF = (this.walkF + 0.3) % 4;
    else if (this.onGround) this.walkF = 0;
  }

  fireBullet() {
    const w = WDEF[this.weapon];
    if (this.weapon !== 'blaster') {
      if (this.ammo[this.weapon] <= 0) { this.weapon = 'blaster'; return; }
      this.ammo[this.weapon] = Math.max(0, this.ammo[this.weapon] - w.cnt);
    }
    const bx = this.x + (this.facing > 0 ? this.w + 4 : -4);
    const by = this.y + 20;
    for (let i = 0; i < w.cnt; i++) {
      const offset = w.cnt > 1 ? w.spread * (i - (w.cnt - 1) / 2) : 0;
      const vx = Math.cos(offset) * w.spd * this.facing;
      const vy = Math.sin(offset) * w.spd;
      pBullets.push(new Bullet(bx, by, vx, vy, w.dmg, w.r, w.clr, true, w.splash));
    }
    this.shootCd = w.cd;
  }

  takeDamage(dmg) {
    if (this.invincible > 0 || this.shieldTime > 0 || this.dashing > 0) return;
    this.hp -= dmg;
    this.invincible = 60;
    shake = Math.max(shake, 8);
    spawnHit(this.x + this.w / 2, this.y + this.h / 2, '#ff4444');
    if (this.hp <= 0) {
      this.hp   = 0;
      this.dead = true;
      spawnExplosion(this.x + this.w / 2, this.y + this.h / 2, '#44aaff', 24, 6, 4);
    }
  }

  collectWeapon(type, amount) {
    this.ammo[type] = Math.min(WDEF[type].maxAmmo, (this.ammo[type] || 0) + amount);
    this.weapon     = type;
  }

  draw() {
    if (this.dead) return;
    if (this.invincible > 0 && Math.floor(frame / 4) % 2 === 0) return;

    const sx = this.x - camX;
    const sy = this.y;
    const legSwing = Math.sin(this.walkF * Math.PI) * 6;
    const wclr = { blaster:'#44aaff', spread:'#ffee00', plasma:'#ff44ff', rocket:'#ff6600' }[this.weapon] || '#44aaff';

    ctx.save();
    ctx.translate(sx + this.w / 2, sy + this.h / 2);
    if (this.facing < 0) ctx.scale(-1, 1);

    // ── Boots ────────────────────────────────────────────────
    ctx.fillStyle = '#0d2a5a';
    ctx.fillRect(-13, 25 + legSwing, 11, 8);
    ctx.fillRect(  2, 25 - legSwing, 11, 8);
    // ── Legs ─────────────────────────────────────────────────
    ctx.fillStyle = '#1e4a9a';
    ctx.fillRect(-12,  8, 9, 20 + legSwing);
    ctx.fillRect(  3,  8, 9, 20 - legSwing);
    // ── Body ─────────────────────────────────────────────────
    ctx.fillStyle = '#2060cc';
    ctx.fillRect(-12, -12, 24, 22);
    // Armor panels
    ctx.fillStyle = '#3d80ee';
    ctx.fillRect(-10, -10, 20, 6);
    ctx.fillRect(-10,  -2, 20, 6);
    // ── Gun arm ──────────────────────────────────────────────
    ctx.fillStyle = '#1e4a9a';
    ctx.fillRect(10, -6, 8, 10);
    ctx.fillStyle = wclr;
    ctx.shadowColor = wclr; ctx.shadowBlur = 5;
    ctx.fillRect(14, -4, 18, 5);
    ctx.shadowBlur = 0;
    // ── Jetpack ──────────────────────────────────────────────
    ctx.fillStyle = this.dashCd <= 0 ? '#44ff88' : '#223355';
    ctx.fillRect(-18, -8, 6, 14);
    // ── Helmet ───────────────────────────────────────────────
    ctx.fillStyle = '#0e3088';
    ctx.fillRect(-10, -26, 20, 16);
    // Visor
    const visorClr = this.shieldTime > 0 ? '#44ff88' : '#00ddff';
    ctx.fillStyle = visorClr;
    ctx.shadowColor = visorClr; ctx.shadowBlur = 7;
    ctx.fillRect(-7, -24, 14, 8);
    ctx.shadowBlur = 0;
    // ── Shield bubble ────────────────────────────────────────
    if (this.shieldTime > 0) {
      ctx.strokeStyle = `rgba(68,255,136,${0.5 + 0.4 * Math.sin(frame * 0.2)})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawHUD() {
    // ── HP bar ───────────────────────────────────────────────
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(10, 10, 150, 16);
    const hpClr = this.hp > 50 ? '#22cc44' : this.hp > 25 ? '#ffaa00' : '#ff2222';
    ctx.fillStyle = hpClr;
    ctx.fillRect(10, 10, 150 * (this.hp / this.maxHp), 16);
    ctx.strokeStyle = '#334'; ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 150, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(`HP ${this.hp}/${this.maxHp}`, 14, 23);

    // ── Weapon bar ───────────────────────────────────────────
    const wd = WDEF[this.weapon];
    ctx.fillStyle = wd.clr; ctx.globalAlpha = 0.35;
    ctx.fillRect(10, 30, 150, 14);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = wd.clr; ctx.strokeRect(10, 30, 150, 14);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    const ammoTxt = this.weapon === 'blaster' ? '∞' : `${this.ammo[this.weapon]}`;
    ctx.fillText(`${wd.name}  [${ammoTxt}]`, 14, 41);

    // ── Weapon slots (1-4) ───────────────────────────────────
    let wx2 = 10;
    ['blaster', 'spread', 'plasma', 'rocket'].forEach((w, i) => {
      const owned = w === 'blaster' || this.ammo[w] > 0;
      ctx.fillStyle = owned ? (w === this.weapon ? WDEF[w].clr : '#222') : '#111';
      ctx.fillRect(wx2, 48, 36, 15);
      ctx.strokeStyle = w === this.weapon ? WDEF[w].clr : '#444';
      ctx.strokeRect(wx2, 48, 36, 15);
      ctx.fillStyle = owned ? '#fff' : '#444';
      ctx.font = '8px monospace';
      ctx.fillText(`${i + 1}:${w[0].toUpperCase()}`, wx2 + 3, 59);
      wx2 += 38;
    });

    // ── Dash indicator ────────────────────────────────────────
    ctx.fillStyle = this.dashCd <= 0 ? '#44ff88' : '#223';
    ctx.fillRect(10, 66, 38, 8);
    ctx.fillStyle = '#fff'; ctx.font = '7px monospace';
    ctx.fillText('DASH', 14, 73);

    // ── Score ────────────────────────────────────────────────
    ctx.fillStyle = '#ddeeff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE  ${score}`, W - 10, 22);
    ctx.fillStyle = '#556677';
    ctx.font = '11px monospace';
    ctx.fillText(`BEST   ${hiScore}`, W - 10, 37);
    ctx.textAlign = 'left';

    // ── Stage name ───────────────────────────────────────────
    ctx.fillStyle = '#aaccee';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(STAGES[stageIdx].name, W / 2, 18);
    ctx.textAlign = 'left';
  }
}

// ─────────────────────────────────────────────────────────────
// ENEMY
// ─────────────────────────────────────────────────────────────
const ENEMY_H = { crawler:25, shooter:44, flyer:22, shielder:48, exploder:30, heavy:55, elite:42 };

class Enemy {
  constructor(type, x, y) {
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.walkF = 0;
    this.invincible = 0;
    this.shootCd = rndInt(40, 120);
    this.active  = true;
    this.teleportCd = rndInt(150, 250);
    this.shieldHp   = 0;
    this._init(type);
  }

  _init(t) {
    switch (t) {
      case 'crawler':
        this.hp = this.maxHp = 40;  this.w = 40; this.h = 25;
        this.spd = rnd(0.8, 1.6);   this.dmg = 12; this.pts = 100; break;
      case 'shooter':
        this.hp = this.maxHp = 60;  this.w = 28; this.h = 44;
        this.spd = rnd(0.5, 1.0);   this.dmg = 18; this.pts = 150; break;
      case 'flyer':
        this.hp = this.maxHp = 50;  this.w = 40; this.h = 22;
        this.spd = rnd(1.0, 2.0);   this.dmg = 14; this.pts = 130;
        this.baseY = rnd(70, GND - 130); this.y = this.baseY; break;
      case 'shielder':
        this.hp = this.maxHp = 90;  this.shieldHp = 60;
        this.w = 34; this.h = 48;   this.spd = rnd(0.4, 0.8);
        this.dmg = 24; this.pts = 200; break;
      case 'exploder':
        this.hp = this.maxHp = 30;  this.w = 30; this.h = 30;
        this.spd = rnd(1.5, 2.8);   this.dmg = 40; this.pts = 80; break;
      case 'heavy':
        this.hp = this.maxHp = 200; this.w = 50; this.h = 55;
        this.spd = rnd(0.3, 0.6);   this.dmg = 28; this.pts = 300; break;
      case 'elite':
        this.hp = this.maxHp = 75;  this.w = 26; this.h = 42;
        this.spd = rnd(2.0, 3.2);   this.dmg = 20; this.pts = 250; break;
    }
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update() {
    if (!this.active) return;
    if (!player || player.dead) return;

    const ex  = this.x + this.w / 2;
    const ey  = this.y + this.h / 2;
    const px  = player.x + player.w / 2;
    const py  = player.y + player.h / 2;
    const dx  = px - ex;
    const dy  = py - ey;
    const dst = Math.hypot(dx, dy);

    switch (this.type) {
      case 'crawler':
        this.vx = dst < 220 ? (dx > 0 ? this.spd : -this.spd) : -this.spd;
        this.vy += GRAV;
        break;

      case 'shooter':
        this.vx = dst > 310 ? -this.spd : dst < 160 ? this.spd : 0;
        this.vy += GRAV;
        if (--this.shootCd <= 0 && dst < 420) {
          this.shootCd = rndInt(70, 130);
          const a = Math.atan2(dy, dx);
          eBullets.push(new Bullet(ex, ey, Math.cos(a)*5, Math.sin(a)*5, this.dmg, 5, '#ff4400', false));
        }
        break;

      case 'flyer':
        this.vx = dst > 380 ? -this.spd : dst < 140 ? this.spd * 0.4 : -this.spd * 0.25;
        this.y  = this.baseY + Math.sin(frame * 0.035 + this.x * 0.012) * 38;
        if (--this.shootCd <= 0 && dst < 400) {
          this.shootCd = rndInt(55, 105);
          eBullets.push(new Bullet(ex, ey + 10, 0, 4.5, this.dmg, 6, '#ff8800', false));
        }
        break;

      case 'shielder':
        this.vx = dx > 0 ? this.spd : -this.spd;
        this.vy += GRAV;
        break;

      case 'exploder':
        this.vx = dx > 0 ? this.spd : -this.spd;
        this.vy += GRAV;
        if (dst < 32) {
          spawnExplosion(ex, ey, '#ff6600', 22, 5, 4);
          player.takeDamage(this.dmg);
          this.hp = 0; this.active = false;
          score += this.pts;
        }
        break;

      case 'heavy':
        this.vx = dx > 0 ? this.spd : -this.spd;
        this.vy += GRAV;
        if (--this.shootCd <= 0 && dst < 460) {
          this.shootCd = rndInt(90, 150);
          for (let off = -0.3; off <= 0.31; off += 0.15) {
            const base = Math.atan2(dy, dx);
            eBullets.push(new Bullet(ex, ey, Math.cos(base + off)*5.5, Math.sin(base + off)*5.5, this.dmg * 0.65, 7, '#aa2200', false));
          }
        }
        break;

      case 'elite':
        this.vx = dx > 0 ? this.spd : -this.spd;
        this.vy += GRAV;
        if (--this.shootCd <= 0 && dst < 360) {
          this.shootCd = rndInt(45, 80);
          const a = Math.atan2(dy, dx);
          eBullets.push(new Bullet(ex, ey, Math.cos(a)*8, Math.sin(a)*8, this.dmg, 4, '#ff2200', false));
        }
        // Teleport
        if (--this.teleportCd <= 0 && dst < 320) {
          this.teleportCd = rndInt(140, 240);
          this.x = clamp(player.x + (Math.random() < 0.5 ? -220 : 220), camX + 20, camX + W - 60);
          this.y = GND - this.h;
          spawnExplosion(this.x + this.w / 2, this.y + this.h / 2, '#ff2200', 10, 3, 2);
        }
        break;
    }

    // Apply movement
    this.x += this.vx;
    this.y += (this.type !== 'flyer') ? this.vy : 0;

    // Ground collision (non-flyers)
    if (this.type !== 'flyer') {
      if (this.y + this.h >= GND) {
        this.y = GND - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }

    // Walk frame
    if (Math.abs(this.vx) > 0.1) this.walkF = (this.walkF + 0.2) % 4;

    // Despawn if far off screen left
    if (this.x + this.w < camX - 250) this.active = false;

    if (this.invincible > 0) this.invincible--;
  }

  takeDamage(dmg) {
    // Shielder frontal block
    if (this.type === 'shielder' && this.shieldHp > 0) {
      if (player && ((player.x <= this.x && this.vx <= 0) || (player.x >= this.x && this.vx >= 0))) {
        this.shieldHp -= dmg;
        spawnHit(this.x + this.w / 2, this.y + this.h / 2, '#4488ff');
        return;
      }
    }
    this.hp -= dmg;
    this.invincible = 5;
    spawnHit(this.x + this.w / 2, this.y + this.h / 2, '#ffaa44');
    if (this.hp <= 0) {
      this.hp     = 0;
      this.active = false;
      score      += this.pts;
      stageKills++;
      if (Math.random() < 0.22) spawnItem(this.x + this.w / 2, this.y + this.h / 2);
      spawnExplosion(this.x + this.w / 2, this.y + this.h / 2, '#ff8800', 12, 4, 3);
    }
  }

  draw() {
    if (!this.active) return;
    if (this.invincible > 0 && Math.floor(frame / 3) % 2 === 0) return;

    const sx = this.x - camX;
    const sy = this.y;

    ctx.save();
    switch (this.type) {
      case 'crawler':  this._drawCrawler(sx, sy);  break;
      case 'shooter':  this._drawShooter(sx, sy);  break;
      case 'flyer':    this._drawFlyer(sx, sy);    break;
      case 'shielder': this._drawShielder(sx, sy); break;
      case 'exploder': this._drawExploder(sx, sy); break;
      case 'heavy':    this._drawHeavy(sx, sy);    break;
      case 'elite':    this._drawElite(sx, sy);    break;
    }
    ctx.restore();

    // HP bar (only when damaged)
    if (this.hp < this.maxHp) {
      ctx.fillStyle = '#222';
      ctx.fillRect(sx, sy - 8, this.w, 4);
      ctx.fillStyle = '#ee3300';
      ctx.fillRect(sx, sy - 8, this.w * (this.hp / this.maxHp), 4);
    }
  }

  _drawCrawler(sx, sy) {
    const la = Math.sin(this.walkF * Math.PI) * 8;
    ctx.strokeStyle = '#33bb55'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const lx = sx + 6 + i * 11;
      ctx.beginPath(); ctx.moveTo(lx, sy + 14); ctx.lineTo(lx - 6, sy + 23 + (i%2===0?la:-la)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx + 2, sy + 14); ctx.lineTo(lx + 8, sy + 23 + (i%2===0?-la:la)); ctx.stroke();
    }
    ctx.fillStyle = '#1d6632';
    ctx.beginPath(); ctx.ellipse(sx + 20, sy + 12, 18, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff1111';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(sx + 12, sy + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 22, sy + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawShooter(sx, sy) {
    const d = this.vx >= 0 ? 1 : -1;
    ctx.save(); ctx.translate(sx + this.w/2, sy + this.h/2); if (d < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#3d1122'; ctx.fillRect(-10, 8, 8, 18); ctx.fillRect(2, 8, 8, 18);
    ctx.fillStyle = '#771d33'; ctx.fillRect(-11, -12, 22, 22);
    ctx.fillStyle = '#993344'; ctx.fillRect(-9, -10, 18, 8);
    ctx.fillStyle = '#551122'; ctx.fillRect(9, -4, 7, 10);
    ctx.fillStyle = '#ff6600'; ctx.fillRect(14, -2, 12, 4);
    ctx.fillStyle = '#441122'; ctx.fillRect(-9, -24, 18, 14);
    ctx.fillStyle = '#ff3300'; ctx.shadowColor = '#ff3300'; ctx.shadowBlur = 5;
    ctx.fillRect(-6, -20, 5, 4); ctx.fillRect(1, -20, 5, 4);
    ctx.shadowBlur = 0; ctx.restore();
  }

  _drawFlyer(sx, sy) {
    const h = Math.sin(frame * 0.05) * 3;
    ctx.fillStyle = '#4a1877';
    ctx.beginPath(); ctx.ellipse(sx + 20, sy + 11 + h, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a2a99';
    ctx.beginPath(); ctx.ellipse(sx + 20, sy + 8 + h, 12, 8, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ff88ff'; ctx.shadowColor = '#ff88ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(sx + 20, sy + 15 + h, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.arc(sx + 20, sy + 9 + h, 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawShielder(sx, sy) {
    const d = this.vx >= 0 ? 1 : -1;
    ctx.save(); ctx.translate(sx + this.w/2, sy + this.h/2); if (d < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#2a1540'; ctx.fillRect(-12, 10, 10, 22); ctx.fillRect(2, 10, 10, 22);
    ctx.fillStyle = '#4a2666'; ctx.fillRect(-13, -14, 26, 26);
    ctx.fillStyle = '#5e3377'; ctx.fillRect(-11, -12, 22, 10); ctx.fillRect(-11, 0, 22, 10);
    ctx.fillStyle = '#391150'; ctx.fillRect(-11, -28, 22, 16);
    ctx.fillStyle = '#ee00ee'; ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 5;
    ctx.fillRect(-7, -24, 5, 5); ctx.fillRect(2, -24, 5, 5); ctx.shadowBlur = 0;
    // Shield
    const sa = this.shieldHp > 0 ? 0.85 : 0.2;
    ctx.globalAlpha = sa; ctx.fillStyle = '#3366ff';
    ctx.fillRect(12, -24, 10, 48); ctx.strokeStyle = '#88aaff'; ctx.lineWidth = 2; ctx.strokeRect(12, -24, 10, 48);
    ctx.globalAlpha = 1; ctx.restore();
  }

  _drawExploder(sx, sy) {
    const p = 1 + Math.sin(frame * 0.22) * 0.18;
    ctx.fillStyle = '#dd3300'; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(sx + 15, sy + 15, 15 * p, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffff00'; ctx.font = 'bold 13px monospace';
    ctx.fillText('!', sx + 12, sy + 21);
    ctx.strokeStyle = '#ff5500'; ctx.lineWidth = 3;
    const la = Math.sin(this.walkF * Math.PI) * 6;
    ctx.beginPath(); ctx.moveTo(sx + 6, sy + 26); ctx.lineTo(sx + 1, sy + 31 + la); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 24, sy + 26); ctx.lineTo(sx + 29, sy + 31 - la); ctx.stroke();
  }

  _drawHeavy(sx, sy) {
    ctx.fillStyle = '#1c0e2e'; ctx.fillRect(sx + 2, sy + 10, 46, 45);
    ctx.fillStyle = '#3c2454'; ctx.fillRect(sx + 4, sy + 12, 42, 10); ctx.fillRect(sx + 4, sy + 24, 42, 10); ctx.fillRect(sx + 4, sy + 36, 42, 10);
    ctx.fillStyle = '#291240'; ctx.fillRect(sx + 10, sy, 30, 18);
    ctx.fillStyle = '#ff0000'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 7;
    ctx.fillRect(sx + 12, sy + 4, 26, 8); ctx.shadowBlur = 0;
    ctx.fillStyle = '#1c2a44'; ctx.fillRect(sx - 5, sy + 15, 10, 30);
    ctx.fillStyle = '#992200'; ctx.fillRect(sx - 10, sy + 22, 12, 10);
  }

  _drawElite(sx, sy) {
    const d = this.vx >= 0 ? 1 : -1;
    ctx.save(); ctx.translate(sx + this.w/2, sy + this.h/2); if (d < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#3d0000'; ctx.fillRect(-9, 8, 7, 16); ctx.fillRect(2, 8, 7, 16);
    ctx.fillStyle = '#770000'; ctx.fillRect(-10, -12, 20, 22);
    ctx.fillStyle = '#ff1100';
    ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(20, -18); ctx.lineTo(20, 2); ctx.fill();
    ctx.fillStyle = '#550000'; ctx.fillRect(-8, -24, 16, 14);
    ctx.fillStyle = '#ffaa00'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(-4, -19, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4,  -19, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff2200'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-9, 14); ctx.quadraticCurveTo(-18, 20, -14, 28); ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// BOSS: TITAN MECH  (mid-boss, stage 4)
// ─────────────────────────────────────────────────────────────
class TitanBoss {
  constructor() {
    this.x = camX + W + 300;
    this.y = GND - 150;
    this.w = 120;
    this.h = 150;
    this.hp = 1200;
    this.maxHp = 1200;
    this.phase = 1;
    this.vx = -1.5;
    this.vy = 0;
    this.active     = true;
    this.arrived    = false;
    this.shootCd    = 100;
    this.atkTimer   = 150;
    this.legF       = 0;
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update() {
    if (!this.active) return;

    // Slide in from right
    const dest = camX + W * 0.62;
    if (this.x > dest) {
      this.x -= 2.5;
    } else {
      this.arrived = true;
    }
    if (!this.arrived) return;

    // Phase 2 at 50%
    if (this.hp <= this.maxHp * 0.5 && this.phase === 1) {
      this.phase = 2;
      shake = 14;
      spawnExplosion(this.x + this.w/2, this.y + this.h/2, '#ff0000', 28, 8, 5);
    }

    // Gravity
    this.vy += GRAV * 0.5;
    this.y  += this.vy;
    if (this.y + this.h >= GND) { this.y = GND - this.h; this.vy = 0; }

    // Leg animation
    this.legF = (this.legF + 0.15) % (Math.PI * 2);

    // Attack timer
    if (--this.atkTimer <= 0) {
      this.atkTimer = rndInt(90, 180);
      const atk = this.phase === 1 ? rndInt(0, 1) : rndInt(0, 2);
      if (atk === 0) {
        // Rocket burst
        const count = this.phase === 2 ? 5 : 3;
        for (let i = 0; i < count; i++) {
          const a = -Math.PI * 0.5 + (i - (count-1)/2) * 0.35;
          eBullets.push(new Bullet(this.x + 20, this.y + 30,
            Math.cos(a) * 6, Math.sin(a) * 7,
            28, 9, '#ff6600', false, 45));
        }
      } else if (atk === 1) {
        // Stomp-jump
        this.vy = -14;
        shake = 8;
      } else if (atk === 2 && this.phase === 2) {
        // Spawn flyers
        for (let i = 0; i < 3; i++) {
          enemies.push(new Enemy('flyer', this.x + rnd(-80, 80) + camX, this.y + 20));
        }
      }
    }

    // Regular shots
    if (--this.shootCd <= 0 && player) {
      this.shootCd = this.phase === 2 ? 28 : 48;
      const dx = player.x + player.w/2 - (this.x + this.w/2);
      const dy = player.y + player.h/2 - (this.y + this.h/2);
      const a  = Math.atan2(dy, dx);
      eBullets.push(new Bullet(this.x + 60, this.y + 55,
        Math.cos(a) * 7, Math.sin(a) * 7, 22, 7, '#ff4400', false));
    }
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    spawnHit(this.x + this.w/2, this.y + this.h/2, '#ff8800');
    shake = Math.max(shake, 2);
    if (this.hp <= 0) {
      this.hp = 0; this.active = false;
      score += 5000;
      spawnExplosion(this.x + this.w/2, this.y + this.h/2, '#ff4400', 40, 10, 6);
      spawnExplosion(this.x + 20,  this.y + 40,  '#ffff00', 20, 7, 4);
      spawnExplosion(this.x + 100, this.y + 60,  '#ff8800', 20, 7, 4);
    }
  }

  draw() {
    if (!this.active) return;
    const sx = this.x - camX;
    const sy = this.y;
    const lo = Math.sin(this.legF) * 12;

    if (this.phase === 2) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18; }

    // Legs
    ctx.fillStyle = '#32323e';
    ctx.fillRect(sx + 15, sy + 112,  20, 40 + lo);
    ctx.fillRect(sx + 85, sy + 112,  20, 40 - lo);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(sx + 13, sy + 130 + lo, 24, 8);
    ctx.fillRect(sx + 83, sy + 130 - lo, 24, 8);

    // Body
    ctx.fillStyle = '#1e1e2a';
    ctx.fillRect(sx + 10, sy + 40, 100, 80);
    ctx.fillStyle = '#32324a';
    ctx.fillRect(sx + 12, sy + 42, 96, 20);
    ctx.fillRect(sx + 12, sy + 64, 96, 20);
    ctx.fillRect(sx + 12, sy + 86, 96, 20);
    ctx.strokeStyle = '#445566'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.strokeRect(sx + 14 + i * 19, sy + 44, 17, 16);
      ctx.strokeRect(sx + 14 + i * 19, sy + 66, 17, 16);
    }

    // Shoulder cannons
    ctx.fillStyle = '#141422';
    ctx.fillRect(sx - 18, sy + 42, 30, 20);
    ctx.fillRect(sx + 108, sy + 42, 30, 20);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(sx - 22, sy + 48, 8, 10);
    ctx.fillRect(sx + 134, sy + 48, 8, 10);

    // Head
    ctx.fillStyle = '#141422';
    ctx.fillRect(sx + 28, sy, 64, 46);
    const visorClr = this.phase === 2 ? '#ff0000' : '#ff5500';
    ctx.fillStyle  = visorClr;
    ctx.shadowColor = visorClr; ctx.shadowBlur = 10;
    ctx.fillRect(sx + 34, sy + 9, 52, 20);
    ctx.shadowBlur = 0;

    if (this.phase === 2) {
      ctx.strokeStyle = '#ff000088'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + 60, sy + 60, 55, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Boss HP bar
    _drawBossBar('TITAN MECH', this.phase === 2 ? '⚡ PHASE 2' : 'PHASE 1',
      this.hp, this.maxHp, '#ff5500');
  }
}

// ─────────────────────────────────────────────────────────────
// BOSS: NEXUS OVERLORD  (final boss, stage 8)
// ─────────────────────────────────────────────────────────────
class NexusBoss {
  constructor() {
    this.x    = camX + W + 200;
    this.y    = 30;
    this.w    = 200;
    this.h    = 160;
    this.hp   = 3000;
    this.maxHp = 3000;
    this.phase = 1;
    this.active   = true;
    this.arrived  = false;
    this.shootCd  = 55;
    this.atkTimer = 180;
    this.pulseF   = 0;
    this.laserOn  = false;
    this.laserAng = 0;
    this.laserTmr = 0;
    this.tentacles = Array.from({length: 4}, (_, i) => ({
      angle: i * Math.PI / 2,
      length: 85,
      active: false,
    }));
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update() {
    if (!this.active) return;

    // Slide in
    const dest = camX + W * 0.52;
    if (this.x > dest) { this.x -= 2.5; } else { this.arrived = true; }
    if (!this.arrived) return;

    // Phase transitions
    if (this.hp <= this.maxHp * 0.33 && this.phase < 3) {
      this.phase = 3;
      shake = 20;
      this.tentacles.forEach(t => t.active = true);
      spawnExplosion(this.x + this.w/2, this.y + this.h/2, '#aa00ff', 38, 10, 6);
    } else if (this.hp <= this.maxHp * 0.66 && this.phase < 2) {
      this.phase = 2;
      shake = 14;
      this.tentacles.slice(0, 2).forEach(t => t.active = true);
      spawnExplosion(this.x + this.w/2, this.y + this.h/2, '#8800aa', 28, 8, 5);
    }

    // Float
    this.y = 30 + Math.sin(frame * 0.016) * 38;
    this.pulseF++;

    // Tentacle swing & hit
    if (this.phase >= 2) {
      this.tentacles.forEach((t, i) => {
        if (!t.active) return;
        t.angle += Math.sin(frame * 0.05 + i * Math.PI * 0.5) * 0.025;
        if (player && frame % 18 === 0) {
          const tx = this.x + this.w/2 + Math.cos(t.angle) * t.length;
          const ty = this.y + this.h/2 + Math.sin(t.angle) * t.length;
          if (Math.hypot(player.x - tx, player.y - ty) < 32) player.takeDamage(12);
        }
      });
    }

    // Laser
    if (this.laserOn) {
      this.laserAng += 0.018 * (this.phase >= 3 ? 2 : 1);
      this.laserTmr--;
      if (this.laserTmr <= 0) this.laserOn = false;
      if (player) {
        const cx = this.x + this.w/2, cy = this.y + this.h/2;
        const dx = player.x - cx, dy = player.y - cy;
        const lx = Math.cos(this.laserAng), ly = Math.sin(this.laserAng);
        const proj = dx * lx + dy * ly;
        if (proj > 0 && Math.abs(dx * ly - dy * lx) < 16 && proj < 600) {
          player.takeDamage(1);
        }
      }
    }

    // Main attacks
    if (--this.atkTimer <= 0) {
      const maxA = Math.min(3, this.phase + 1);
      const atk  = rndInt(0, maxA - 1);
      this.atkTimer = Math.max(55, rndInt(85, 160) - (this.phase - 1) * 20);

      if (atk === 0) {
        this.laserOn  = true;
        this.laserTmr = 110;
        if (player) this.laserAng = Math.atan2(player.y - (this.y + this.h/2), player.x - (this.x + this.w/2));
      }
      if (atk === 1) {
        // Bomb rain
        for (let i = 0; i < 3 + this.phase; i++) {
          const bx = camX + rnd(60, W - 60);
          eBullets.push(new Bullet(this.x + rnd(0, this.w), this.y + this.h,
            rnd(-1, 1), 4 + rnd(0, 2), 18, 10, '#ff00ff', false, 50));
        }
      }
      if (atk === 2) {
        // Ring burst
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          eBullets.push(new Bullet(this.x + this.w/2, this.y + this.h/2,
            Math.cos(a) * 5.5, Math.sin(a) * 5.5, 18, 6, '#ff88ff', false));
        }
      }
      if (atk === 3 && this.phase >= 3) {
        for (let i = 0; i < 2; i++) {
          enemies.push(new Enemy('elite', camX + W + 50, GND - 42));
        }
      }
    }

    // Regular shots
    if (--this.shootCd <= 0 && player) {
      this.shootCd = this.phase >= 3 ? 18 : this.phase === 2 ? 28 : 42;
      const dx = player.x + player.w/2 - (this.x + this.w/2);
      const dy = player.y + player.h/2 - (this.y + this.h/2);
      const a  = Math.atan2(dy, dx);
      const n  = this.phase >= 2 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n-1)/2) * 0.18 : 0;
        eBullets.push(new Bullet(this.x + this.w/2, this.y + this.h/2,
          Math.cos(a + off) * 6, Math.sin(a + off) * 6, 18, 6, '#ff00ff', false));
      }
    }
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    spawnHit(this.x + this.w/2, this.y + this.h/2, '#ff88ff');
    shake = Math.max(shake, 2);
    if (this.hp <= 0) {
      this.hp = 0; this.active = false;
      score += 15000;
      for (let i = 0; i < 5; i++) {
        spawnExplosion(
          this.x + rnd(0, this.w), this.y + rnd(0, this.h),
          i % 2 === 0 ? '#ff00ff' : '#ffff00', 30, 8, 5
        );
      }
    }
  }

  draw() {
    if (!this.active) return;
    const sx = this.x - camX;
    const sy = this.y;
    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;
    const p  = 1 + Math.sin(this.pulseF * 0.10) * 0.05;

    ctx.save();
    if (this.phase === 3) { ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 28; }
    else if (this.phase === 2) { ctx.shadowColor = '#aa00ff'; ctx.shadowBlur = 14; }

    // Tentacles
    if (this.phase >= 2) {
      ctx.strokeStyle = '#550077'; ctx.lineWidth = 9;
      this.tentacles.forEach((t, i) => {
        if (!t.active) return;
        const tx = cx + Math.cos(t.angle) * t.length;
        const ty = cy + Math.sin(t.angle) * t.length;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(
          cx + Math.cos(t.angle + 0.6) * t.length * 0.55,
          cy + Math.sin(t.angle + 0.6) * t.length * 0.55,
          tx, ty
        );
        ctx.stroke();
        ctx.fillStyle = '#ee00ff';
        ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Outer ring glow
    for (let i = 0; i < this.phase; i++) {
      ctx.strokeStyle = `rgba(200,0,255,${0.2 + i * 0.15})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 38 + i * 16 + Math.sin(frame * 0.06 + i) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Main hull
    ctx.fillStyle = '#1a0028';
    ctx.beginPath(); ctx.ellipse(cx, cy, 92 * p, 72 * p, 0, 0, Math.PI * 2); ctx.fill();

    // Mid ring
    ctx.strokeStyle = '#5500aa'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, cy, 78 * p, 58 * p, 0, 0, Math.PI * 2); ctx.stroke();

    // Top dome
    ctx.fillStyle = '#280040';
    ctx.beginPath(); ctx.ellipse(cx, cy - 18, 50 * p, 38 * p, 0, 0, Math.PI); ctx.fill();

    // Core
    const cc = this.phase === 3 ? '#ff00ff' : this.phase === 2 ? '#cc00ee' : '#8800cc';
    ctx.fillStyle = cc; ctx.shadowColor = cc; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(cx, cy, 26 * p, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Laser beam
    if (this.laserOn) {
      ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 5;
      ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(this.laserAng) * 650, cy + Math.sin(this.laserAng) * 650);
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    ctx.restore();

    const pnames = ['', 'PHASE 1', '⚡ PHASE 2', '💀 PHASE 3'];
    _drawBossBar('NEXUS OVERLORD', pnames[this.phase], this.hp, this.maxHp, '#aa00ff');
  }
}

// ─────────────────────────────────────────────────────────────
// Boss HP bar helper
// ─────────────────────────────────────────────────────────────
function _drawBossBar(name, phase, hp, maxHp, color) {
  const bw = 260, bx = W / 2 - bw / 2;
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(bx, H - 32, bw, 18);
  ctx.fillStyle = color;     ctx.fillRect(bx, H - 32, bw * (hp / maxHp), 18);
  ctx.strokeStyle = '#445';  ctx.lineWidth = 1; ctx.strokeRect(bx, H - 32, bw, 18);
  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`${name}  ${phase}  HP ${hp}/${maxHp}`, W / 2, H - 18);
  ctx.textAlign = 'left';
}

// ─────────────────────────────────────────────────────────────
// ITEM
// ─────────────────────────────────────────────────────────────
class Item {
  constructor(x, y, type) {
    this.x    = x;
    this.y    = y;
    this.vy   = -4;
    this.type = type;
    this.active = true;
    this.life   = 320;
    this.bob    = rnd(0, Math.PI * 2);
  }

  get rect() { return { x: this.x - 13, y: this.y - 13, w: 26, h: 26 }; }

  update() {
    this.vy += 0.28;
    this.y  += this.vy;
    if (this.y > GND - 13) { this.y = GND - 13; this.vy = 0; }
    if (--this.life <= 0) this.active = false;
  }

  collect(p) {
    this.active = false;
    switch (this.type) {
      case 'health': p.hp = Math.min(p.maxHp, p.hp + 25);           spawnHit(this.x, this.y, '#44ff44'); break;
      case 'shield': p.shieldTime = 300;                             spawnHit(this.x, this.y, '#44ff88'); break;
      case 'spread': p.collectWeapon('spread', 45);                  spawnHit(this.x, this.y, '#ffee00'); break;
      case 'plasma': p.collectWeapon('plasma', 90);                  spawnHit(this.x, this.y, '#ff44ff'); break;
      case 'rocket': p.collectWeapon('rocket', 8);                   spawnHit(this.x, this.y, '#ff6600'); break;
      case 'ammo':
        if (p.weapon !== 'blaster')
          p.ammo[p.weapon] = Math.min(WDEF[p.weapon].maxAmmo, (p.ammo[p.weapon] || 0) + 30);
        spawnHit(this.x, this.y, '#aaaaff');
        break;
    }
  }

  draw() {
    if (this.life < 60 && Math.floor(frame / 5) % 2 === 0) return;
    const sx = this.x - camX;
    const sy = this.y + Math.sin(this.bob + frame * 0.09) * 5;
    const clrMap = { health:'#44ff44', shield:'#44ff88', spread:'#ffee00', plasma:'#ff44ff', rocket:'#ff6600', ammo:'#aaaaff' };
    const lblMap = { health:'+', shield:'S', spread:'W', plasma:'P', rocket:'R', ammo:'A' };
    const c = clrMap[this.type] || '#fff';
    ctx.shadowColor = c; ctx.shadowBlur = 8;
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = c; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(lblMap[this.type] || '?', sx, sy + 4);
    ctx.textAlign = 'left'; ctx.shadowBlur = 0;

    if (this.type === 'health') {
      ctx.fillStyle = c;
      ctx.fillRect(sx - 7, sy - 2, 14, 4);
      ctx.fillRect(sx - 2, sy - 7, 4, 14);
    }
  }
}

function spawnItem(x, y, type) {
  if (!type) {
    const r = Math.random();
    if      (r < 0.28) type = 'health';
    else if (r < 0.42) type = 'shield';
    else if (r < 0.57) type = 'spread';
    else if (r < 0.70) type = 'plasma';
    else if (r < 0.82) type = 'rocket';
    else               type = 'ammo';
  }
  items.push(new Item(x, y, type));
}

// ─────────────────────────────────────────────────────────────
// STAGE MANAGEMENT
// ─────────────────────────────────────────────────────────────
function startStage(idx) {
  stageIdx   = idx;
  stageKills = 0;
  enemies    = [];
  eBullets   = [];
  pBullets   = [];
  items      = [];
  particles  = [];
  boss       = null;
  spawnTimer = 0;

  const cfg = STAGES[idx];
  if (cfg.boss === 'titan') boss = new TitanBoss();
  if (cfg.boss === 'nexus') boss = new NexusBoss();

  gState     = 'transition';
  transTimer = 160;
}

function checkStageComplete() {
  const cfg = STAGES[stageIdx];
  if (cfg.boss) {
    // Boss stage clears when boss is dead
    if (boss && !boss.active) advanceStage();
  } else {
    // Normal stage clears when kill quota met
    if (stageKills >= cfg.total) advanceStage();
  }
}

function advanceStage() {
  if (stageIdx < STAGES.length - 1) {
    startStage(stageIdx + 1);
  } else {
    gState  = 'victory';
    hiScore = Math.max(hiScore, score);
  }
}

// ─────────────────────────────────────────────────────────────
// COLLISION DETECTION
// ─────────────────────────────────────────────────────────────
function checkCollisions() {
  // Player bullets ↔ enemies
  for (const b of pBullets) {
    if (!b.active) continue;
    for (const e of enemies) {
      if (!e.active) continue;
      if (rectOverlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, e.rect)) {
        if (b.splash > 0) {
          spawnExplosion(b.x, b.y, '#ff6600', 16, 5, 4);
          for (const e2 of enemies) {
            if (e2.active && Math.hypot(e2.x - b.x, e2.y - b.y) < b.splash) {
              e2.takeDamage(b.dmg * 0.55);
            }
          }
        }
        e.takeDamage(b.dmg);
        b.active = false;
        break;
      }
    }
    // Player bullets ↔ boss
    if (b.active && boss && boss.active) {
      if (rectOverlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, boss.rect)) {
        if (b.splash > 0) spawnExplosion(b.x, b.y, '#ff6600', 14, 4, 3);
        boss.takeDamage(b.dmg);
        spawnHit(b.x, b.y, WDEF[player ? player.weapon : 'blaster'].clr);
        b.active = false;
      }
    }
  }

  // Enemy bullets ↔ player
  for (const b of eBullets) {
    if (!b.active || !player) continue;
    if (rectOverlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, player.rect)) {
      if (b.splash > 0) spawnExplosion(b.x, b.y, '#ff4400', 12, 4, 3);
      player.takeDamage(b.dmg);
      b.active = false;
    }
  }

  // Enemy contact ↔ player
  for (const e of enemies) {
    if (!e.active || !player) continue;
    if (e.type === 'exploder') continue; // handles own collision
    if (rectOverlap(e.rect, player.rect)) {
      player.takeDamage(e.dmg * 0.08);
    }
  }

  // Items ↔ player
  for (const item of items) {
    if (!item.active || !player) continue;
    if (rectOverlap(item.rect, player.rect)) item.collect(player);
  }
}

// ─────────────────────────────────────────────────────────────
// SCREEN OVERLAYS
// ─────────────────────────────────────────────────────────────
function drawMenu() {
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);

  // Title glow
  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 28;
  ctx.fillStyle   = '#88ddff';
  ctx.font        = 'bold 52px monospace';
  ctx.textAlign   = 'center';
  ctx.fillText('ALIEN ASSAULT', W / 2, 100);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#6699bb';
  ctx.font      = '22px monospace';
  ctx.fillText('2185', W / 2, 132);

  ctx.fillStyle = '#445566';
  ctx.font      = '12px monospace';
  ctx.fillText('Earth is under invasion. You are humanity\'s last hope.', W / 2, 168);

  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 12;
  ctx.fillStyle   = '#44aaff';
  ctx.font        = 'bold 18px monospace';
  ctx.fillText(isTouchDevice ? 'TAP  SCREEN  TO  START' : 'PRESS  ENTER  TO  START', W / 2, 230);
  ctx.shadowBlur = 0;

  // Controls cheat-sheet
  const ctrls = isTouchDevice ? [
    ['MOVE',  '◀ ▶ buttons (bottom-left)'],
    ['JUMP',  '↑ button  (double-tap = double jump)'],
    ['DASH',  'DASH button'],
    ['FIRE',  'FIRE button (hold to auto-fire)'],
    ['WEAPON','1 2 3 4 buttons (top-right)'],
  ] : [
    ['MOVE',  '← → / A D'],
    ['JUMP',  'Space / ↑ / W   (double-jump OK)'],
    ['DASH',  'Shift'],
    ['SHOOT', 'X / Z / J'],
    ['WEAPON','1 Blaster  2 Spread  3 Plasma  4 Rocket'],
  ];
  ctx.fillStyle = '#334455';
  ctx.fillRect(W/2 - 210, 260, 420, 130);
  ctx.strokeStyle = '#223344'; ctx.strokeRect(W/2 - 210, 260, 420, 130);
  ctx.fillStyle = '#668899'; ctx.font = '11px monospace';
  ctrls.forEach(([lbl, val], i) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#44aaff';
    ctx.fillText(lbl, W/2 - 10, 280 + i * 21);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aaccdd';
    ctx.fillText(val, W/2 + 10, 280 + i * 21);
  });

  if (hiScore > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(`BEST SCORE: ${hiScore}`, W / 2, H - 16);
  }
  ctx.textAlign = 'left';
}

function drawTransition() {
  const t   = 1 - transTimer / 160;
  const cfg = STAGES[stageIdx];

  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.88, t * 3)})`;
  ctx.fillRect(0, 0, W, H);

  if (t > 0.25) {
    const a = Math.min(1, (t - 0.25) * 4);
    ctx.globalAlpha = a;

    const isBoss = !!cfg.boss;
    ctx.shadowColor = isBoss ? '#ff2200' : '#44aaff';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = isBoss ? '#ff6600' : '#88ddff';
    ctx.font        = `bold ${isBoss ? 36 : 28}px monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText(`STAGE ${cfg.id}`, W / 2, H / 2 - 20);
    ctx.font = `bold ${isBoss ? 28 : 22}px monospace`;
    ctx.fillStyle = isBoss ? '#ffaa44' : '#aaccee';
    ctx.fillText(cfg.name, W / 2, H / 2 + 16);
    ctx.shadowBlur = 0;

    if (isBoss) {
      ctx.fillStyle = '#ff4444';
      ctx.font      = '14px monospace';
      ctx.fillText('⚠  WARNING: BOSS APPROACHING  ⚠', W / 2, H / 2 + 50);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign   = 'left';
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 24;
  ctx.fillStyle   = '#ff4422';
  ctx.font        = 'bold 54px monospace';
  ctx.textAlign   = 'center';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#aaa'; ctx.font = '18px monospace';
  ctx.fillText(`SCORE: ${score}`, W / 2, H / 2 + 14);
  ctx.fillStyle = '#558'; ctx.font = '14px monospace';
  ctx.fillText(`STAGE ${stageIdx + 1} — ${STAGES[stageIdx].name}`, W / 2, H / 2 + 38);

  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 10;
  ctx.fillStyle   = '#44aaff'; ctx.font = 'bold 16px monospace';
  ctx.fillText(isTouchDevice ? 'TAP  SCREEN  TO  RETRY' : 'PRESS  ENTER  TO  RETRY', W / 2, H / 2 + 76);
  ctx.shadowBlur  = 0;
  ctx.textAlign   = 'left';
}

function drawVictory() {
  ctx.fillStyle = 'rgba(0,0,0,0.86)';
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 28;
  ctx.fillStyle   = '#ffffaa';
  ctx.font        = 'bold 46px monospace';
  ctx.textAlign   = 'center';
  ctx.fillText('EARTH SAVED!', W / 2, H / 2 - 50);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#88aacc'; ctx.font = '18px monospace';
  ctx.fillText('The Nexus Overlord is destroyed.', W / 2, H / 2 - 6);
  ctx.fillStyle = '#aaa';
  ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H / 2 + 26);

  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 10;
  ctx.fillStyle   = '#44aaff'; ctx.font = 'bold 16px monospace';
  ctx.fillText(isTouchDevice ? 'TAP  SCREEN  FOR  MENU' : 'PRESS  ENTER  FOR  MENU', W / 2, H / 2 + 72);
  ctx.shadowBlur  = 0;
  ctx.textAlign   = 'left';
}

// ─────────────────────────────────────────────────────────────
// INIT / RESET
// ─────────────────────────────────────────────────────────────
function init() {
  initStars();
  score  = 0;
  camX   = 0;
  player = new Player();
  startStage(0);
}

function resetGame() {
  hiScore = Math.max(hiScore, score);
  score   = 0;
  camX    = 0;
  player  = new Player();
  startStage(0);
}

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────
function gameLoop() {
  requestAnimationFrame(gameLoop);
  frame++;

  // ── Screen shake ─────────────────────────────────────────
  let ox = 0, oy = 0;
  if (shake > 0) {
    ox = rnd(-shake, shake);
    oy = rnd(-shake, shake);
    shake = Math.max(0, shake - 0.8);
  }
  ctx.save();
  if (ox || oy) ctx.translate(ox, oy);

  // ─── MENU ────────────────────────────────────────────────
  if (gState === 'menu') {
    // Background shimmer
    ctx.fillStyle = '#020508';
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const sx = ((s.x + frame * 0.2) % W + W) % W;
      ctx.globalAlpha = s.bri * 0.5;
      ctx.fillStyle   = '#fff';
      ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawMenu();

    if (jp['Enter'] || jp['Space']) {
      clearJP();
      init();
    }
    clearJP();
    ctx.restore();
    return;
  }

  // ─── GAME OVER ───────────────────────────────────────────
  if (gState === 'gameover') {
    ctx.fillStyle = '#020508'; ctx.fillRect(0, 0, W, H);
    drawGameOver();
    if (jp['Enter']) { clearJP(); resetGame(); }
    clearJP();
    ctx.restore();
    return;
  }

  // ─── VICTORY ─────────────────────────────────────────────
  if (gState === 'victory') {
    ctx.fillStyle = '#020508'; ctx.fillRect(0, 0, W, H);
    // Celebratory particles
    if (frame % 18 === 0) spawnExplosion(rnd(0, W) + camX, rnd(50, GND - 50), ['#ffff00','#44aaff','#ff44ff','#44ff88'][rndInt(0,3)], 12, 4, 3);
    particles.forEach(p => { p.update(); if (p.life > 0) p.draw(); });
    particles = particles.filter(p => p.life > 0);
    drawVictory();
    if (jp['Enter']) { gState = 'menu'; hiScore = Math.max(hiScore, score); }
    clearJP();
    ctx.restore();
    return;
  }

  // ─── TRANSITION ──────────────────────────────────────────
  if (gState === 'transition') {
    drawBackground();
    drawTransition();
    transTimer--;
    if (transTimer <= 0) gState = 'playing';
    clearJP();
    ctx.restore();
    return;
  }

  // ─── PLAYING ─────────────────────────────────────────────
  drawBackground();

  const cfg = STAGES[stageIdx];

  // Spawn enemies
  if (!cfg.boss && stageKills < cfg.total) {
    spawnTimer++;
    const spawnTotal = enemies.filter(e => e.active).length;
    if (spawnTimer >= cfg.rate && spawnTotal < 8) {
      spawnTimer = 0;
      // 5% chance to drop a bonus item on the field when an enemy wave spawns
      if (Math.random() < 0.05) {
        spawnItem(camX + rnd(W * 0.6, W * 0.9), GND - 30, pickItemType());
      }
      // Guard against spawning more than the stage total
      const remaining = cfg.total - stageKills - spawnTotal;
      if (remaining > 0) spawnEnemy();
    }
  }

  // Update
  player.update();
  enemies.forEach(e  => e.update());
  pBullets.forEach(b => b.update());
  eBullets.forEach(b => b.update());
  items.forEach(i    => i.update());
  particles.forEach(p => p.update());
  if (boss) boss.update();

  // Collisions
  checkCollisions();

  // Draw (back to front)
  items.forEach(i    => i.draw());
  enemies.forEach(e  => e.draw());
  pBullets.forEach(b => b.draw());
  eBullets.forEach(b => b.draw());
  if (boss) boss.draw();
  particles.forEach(p => p.draw());
  player.draw();

  // Prune dead objects
  enemies   = enemies.filter(e   => e.active);
  pBullets  = pBullets.filter(b  => b.active);
  eBullets  = eBullets.filter(b  => b.active);
  items     = items.filter(i     => i.active);
  particles = particles.filter(p => p.life > 0);

  // HUD
  player.drawHUD();

  // Kill counter (non-boss stages)
  if (!cfg.boss) {
    ctx.fillStyle   = '#556677';
    ctx.font        = '10px monospace';
    ctx.textAlign   = 'right';
    ctx.fillText(`KILLS ${stageKills}/${cfg.total}`, W - 10, H - 10);
    ctx.textAlign   = 'left';
  }

  // Check stage complete
  checkStageComplete();

  // Check game over
  if (player.dead) {
    hiScore = Math.max(hiScore, score);
    gState  = 'gameover';
  }

  clearJP();
  ctx.restore();
}

function pickItemType() {
  const r = Math.random();
  if (r < 0.3)  return 'health';
  if (r < 0.48) return 'shield';
  if (r < 0.62) return 'spread';
  if (r < 0.74) return 'plasma';
  if (r < 0.84) return 'rocket';
  return 'ammo';
}

function spawnEnemy() {
  const cfg  = STAGES[stageIdx];
  const type = cfg.types[rndInt(0, cfg.types.length - 1)];
  const spX  = camX + W + rnd(60, 220);
  const spY  = type === 'flyer' ? rnd(60, GND - 130) : GND - (ENEMY_H[type] || 40);
  enemies.push(new Enemy(type, spX, spY));
}

// ─────────────────────────────────────────────────────────────
// MOBILE TOUCH CONTROLS
// ─────────────────────────────────────────────────────────────
function setupMobileControls() {
  // Prevent browser scroll/zoom on the canvas while playing
  canvas.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });

  // Tap canvas to simulate Enter for menu / game-over / victory screens
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (gState !== 'playing' && gState !== 'transition') {
      jp['Enter'] = true;
      jp['Space']  = true;
    }
  }, { passive: false });

  // Bind a button that fires once per tap (uses jp – "just-pressed")
  function bindTap(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      jp[code] = true;
    }, { passive: false });
  }

  // Bind a button that stays active while held (uses keys)
  function bindHold(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const press   = e => { e.preventDefault(); e.stopPropagation(); keys[code] = true; };
    const release = () => { keys[code] = false; };
    el.addEventListener('touchstart',  press,   { passive: false });
    el.addEventListener('touchend',    release);
    el.addEventListener('touchcancel', release);
  }

  // Movement & shooting – held continuously
  bindHold('m-left',  'ArrowLeft');
  bindHold('m-right', 'ArrowRight');
  bindHold('m-fire',  'KeyX');

  // Jump & Dash – one shot per tap
  bindTap('m-jump', 'Space');
  bindTap('m-dash', 'ShiftLeft');

  // Weapon slots – one shot per tap
  bindTap('m-w1', 'Digit1');
  bindTap('m-w2', 'Digit2');
  bindTap('m-w3', 'Digit3');
  bindTap('m-w4', 'Digit4');
}

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────
initStars();
if (isTouchDevice) setupMobileControls();
gState = 'menu';
requestAnimationFrame(gameLoop);
