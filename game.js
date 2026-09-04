/* ============================================================
   DUCK HAVOC — ducks-vs-shotgun arcade
   No health, no ammo refills, no score — pure endless blasting
   ============================================================ */
(() => {
'use strict';

/* ------------------------- helpers ------------------------- */
const TAU = Math.PI * 2;
const rand  = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d >  Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* --------------------------- DOM --------------------------- */
const $ = id => document.getElementById(id);
const canvas = $('game');
if (!canvas) { console.error('canvas#game missing'); }
const ctx = canvas ? canvas.getContext('2d') : null;
const el = {
  hud: $('hud'),
  wave: $('hud-wave'),
  btnRestart: $('btn-restart'),
  btnMute: $('btn-mute'),
  joyBase: $('joy-base'),
  joyKnob: $('joy-knob'),
  btnFire: $('btn-fire'),
  ovStart: $('overlay-start'),
  ovOver: $('overlay-over'),
  ovPause: $('overlay-pause'),
  btnPlay: $('btn-play'),
  btnAgain: $('btn-again'),
  ovWave: $('ov-wave')
};

/* -------------------------- audio -------------------------- */
const SFX = {
  ctx: null, master: null, muted: false, noiseBuf: null,
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  noiseBufGet() {
    if (!this.noiseBuf && this.ctx) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.6 | 0, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  },
  tone(type, f0, f1, t, g, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), now + t);
      gn.gain.setValueAtTime(0.0001, now);
      gn.gain.exponentialRampToValueAtTime(g, now + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, now + t);
      o.connect(gn); gn.connect(this.master);
      o.start(now); o.stop(now + t + 0.05);
    } catch (e) {}
  },
  noise(t, g, freq, type = 'lowpass', delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      const buf = this.noiseBufGet();
      if (!buf) return;
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const gn = this.ctx.createGain();
      gn.gain.setValueAtTime(g, now);
      gn.gain.exponentialRampToValueAtTime(0.0001, now + t);
      src.connect(f); f.connect(gn); gn.connect(this.master);
      src.start(now); src.stop(now + t + 0.05);
    } catch (e) {}
  },
  shot()   { this.noise(0.28, 0.9, 900); this.noise(0.06, 0.5, 3200, 'highpass'); this.tone('sine', 120, 38, 0.22, 0.8); },
  pump()   { this.noise(0.05, 0.35, 1400, 'bandpass'); },
  quack(p = 1) { this.tone('sawtooth', 520 * p, 290 * p, 0.14, 0.2); this.tone('square', 1040 * p, 580 * p, 0.14, 0.05); },
  splat()  { this.noise(0.12, 0.4, 500); this.tone('triangle', 260, 70, 0.12, 0.25); },
  wave()   { this.tone('triangle', 392, 392, 0.1, 0.25); this.tone('triangle', 523, 523, 0.1, 0.25, 0.1); this.tone('triangle', 659, 659, 0.16, 0.25, 0.2); },
  yip()    { this.tone('square', 620, 900, 0.06, 0.1); this.tone('square', 900, 520, 0.08, 0.1, 0.06); },
  click()  { this.noise(0.03, 0.2, 2200, 'highpass'); }
};

/* --------------------- tuning constants -------------------- */
const PLAYER_SPEED = 350, JUMP_VY = -560, GRAVITY = 1500;
const FIRE_CD = 0.22; // faster, infinite ammo
const PELLET_COUNT = 7, PELLET_SPREAD = 0.17, PELLET_SPEED = 1500;
const FLAVOR = ['THE DUCKS ARE COMING!', 'ENDLESS QUACK!', 'HOLD THE LINE!', 'FEATHERS WILL FLY!', 'NO MERCY!', 'QUACK-O-CALYPSE!'];

/* ------------------------ palettes ------------------------- */
const PALETTES = [
  { sky: ['#6fc0f8', '#d6f0ff'], sun: { fx: 0.84, fy: 0.16, r: 40, c: '#fff6c9', glow: 'rgba(255,244,180,0.55)' },
    far: '#7fae6a', near: '#5f9350', ground: ['#63a84e', '#3f7a35'], grass: '#396b2e',
    cloud: 'rgba(255,255,255,0.85)', stars: 0, moon: false },
  { sky: ['#ff8e5e', '#ffd9a3'], sun: { fx: 0.62, fy: 0.5, r: 54, c: '#ffd27a', glow: 'rgba(255,150,80,0.5)' },
    far: '#9a6a78', near: '#7a5060', ground: ['#8a6a4a', '#5d4636'], grass: '#4e6b34',
    cloud: 'rgba(255,214,180,0.8)', stars: 0, moon: false },
  { sky: ['#3c3470', '#c96a8f'], sun: null,
    far: '#43406e', near: '#33305a', ground: ['#4a4a6e', '#32325a'], grass: '#2c2c52',
    cloud: 'rgba(210,190,230,0.35)', stars: 45, moon: true },
  { sky: ['#0d1430', '#2a3a68'], sun: null,
    far: '#1d2b45', near: '#152138', ground: ['#26402e', '#183021'], grass: '#152b1c',
    cloud: 'rgba(160,180,220,0.16)', stars: 90, moon: true }
];
let pal = PALETTES[0];

/* ---------------------- world / scenery -------------------- */
let W = 0, H = 0, DPR = 1, groundY = 0;
let hillsFar = [], hillsNear = [], grass = [], stars = [], clouds = [], stains = [];
let vignette = null;

function buildScenery() {
  if (!ctx) return;
  const ridge = (amp, base) => {
    const pts = [];
    for (let x = -40; x <= W + 40; x += 42) pts.push({ x, y: base - rand(0, amp) });
    return pts;
  };
  hillsFar  = ridge(46, groundY - 52);
  hillsNear = ridge(26, groundY - 20);
  grass = [];
  for (let x = 6; x < W; x += rand(10, 22))
    grass.push({ x, h: rand(4, 11), lean: rand(-3, 3) });
  stars = [];
  for (let i = 0; i < 90; i++)
    stars.push({ x: Math.random() * W, y: Math.random() * Math.max(10, groundY) * 0.6, r: rand(0.7, 1.7), tw: rand(1, 3), ph: rand(0, TAU) });
  if (!clouds.length)
    for (let i = 0; i < 6; i++)
      clouds.push({ x: Math.random() * W, y: rand(H * 0.06, H * 0.38), s: rand(0.6, 1.35), v: rand(5, 15) });
  try {
    vignette = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    vignette.addColorStop(0, 'rgba(10,10,25,0)');
    vignette.addColorStop(1, 'rgba(10,10,25,0.34)');
  } catch (e) { vignette = null; }
}

function resize() {
  if (!canvas || !ctx) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  // fallback if clientWidth is 0 (mobile before layout)
  const cw = canvas.clientWidth || window.innerWidth || 800;
  const ch = canvas.clientHeight || window.innerHeight || 600;
  W = cw; H = ch;
  try {
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  } catch (e) {}
  groundY = H - Math.max(58, H * 0.09);
  buildScenery();
  player.x = clamp(player.x || W / 2, 30, W - 30);
  dog.x = W - 64;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

/* -------------------------- state -------------------------- */
const G = {
  state: 'start', // start | playing
  paused: false,
  time: 0, wave: 0,
  spawnQueue: [], spawnTimer: 0,
  kamiLeft: 0, kamiTimer: Infinity,
  interT: -1, ambT: 0.5,
  shake: 0, banner: null
};

const player = {
  x: 0, yOff: 0, vy: 0, grounded: true,
  facing: 1, aim: -Math.PI / 2,
  fireCd: 0, flashT: 0,
  walk: 0, moving: false
};
const dog = { x: 200, jumpT: 0 };

let ducks = [], pellets = [], eggs = [];
let parts = [], casings = [];

/* ------------------------- input --------------------------- */
const keys = { left: false, right: false, fire: false, jump: false };
const mouse = { active: false, x: 0, y: 0 };
let mouseFire = false;
const firePointers = new Set();
const joy = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0, jumpHeld: false };

const fireHeld = () => keys.fire || mouseFire || firePointers.size > 0;

window.addEventListener('pointerdown', e => {
  SFX.ensure();
  if (G.paused) { setPaused(false); return; }
  if (e.target && e.target.closest && e.target.closest('button')) return;
  if (e.pointerType === 'mouse') {
    mouse.active = true; mouse.x = e.clientX; mouse.y = e.clientY;
    if (G.state === 'playing') mouseFire = true;
  } else {
    if (document.body) document.body.classList.add('touch');
    if (G.state !== 'playing') return;
    if (e.clientX < W * 0.55 && e.clientY > H * 0.3 && !joy.active) {
      joy.active = true; joy.id = e.pointerId;
      joy.bx = e.clientX; joy.by = e.clientY; joy.dx = 0; joy.dy = 0;
      if (el.joyBase) {
        el.joyBase.style.left = joy.bx + 'px';
        el.joyBase.style.top = joy.by + 'px';
        el.joyBase.style.bottom = 'auto';
        el.joyBase.style.transform = 'translate(-50%, -50%)';
        el.joyBase.classList.add('active');
      }
    } else {
      firePointers.add(e.pointerId);
      if (el.btnFire) el.btnFire.classList.add('pressed');
    }
  }
});
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') {
    mouse.active = true; mouse.x = e.clientX; mouse.y = e.clientY;
    return;
  }
  if (joy.active && e.pointerId === joy.id) {
    let dx = (e.clientX - joy.bx) / 48, dy = (e.clientY - joy.by) / 48;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    joy.dx = dx; joy.dy = dy;
    if (el.joyKnob) el.joyKnob.style.transform = `translate(calc(-50% + ${dx * 42}px), calc(-50% + ${dy * 42}px))`;
  }
});
function releasePointer(e) {
  if (e.pointerType === 'mouse') { mouseFire = false; return; }
  if (joy.active && e.pointerId === joy.id) {
    joy.active = false; joy.id = null; joy.dx = 0; joy.dy = 0; joy.jumpHeld = false;
    if (el.joyBase) {
      el.joyBase.classList.remove('active');
      el.joyBase.style.left = ''; el.joyBase.style.top = '';
      el.joyBase.style.bottom = ''; el.joyBase.style.transform = '';
    }
    if (el.joyKnob) el.joyKnob.style.transform = 'translate(-50%, -50%)';
  }
  firePointers.delete(e.pointerId);
  if (!firePointers.size && el.btnFire) el.btnFire.classList.remove('pressed');
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
window.addEventListener('blur', () => {
  keys.left = keys.right = keys.fire = keys.jump = false;
  mouseFire = false; firePointers.clear();
  if (el.btnFire) el.btnFire.classList.remove('pressed');
});
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('gesturestart', e => e.preventDefault());

window.addEventListener('keydown', e => {
  SFX.ensure();
  if (G.paused) { setPaused(false); return; }
  const k = e.key.toLowerCase();
  if ((k === ' ' || k === 'enter') && G.state !== 'playing') { e.preventDefault(); startGame(); return; }
  if (k === 'arrowleft' || k === 'a') keys.left = true;
  if (k === 'arrowright' || k === 'd') keys.right = true;
  if (k === ' ' || k === 'arrowup' || k === 'w') {
    e.preventDefault();
    if (!e.repeat) keys.jump = true;
    keys.fire = true;
  }
  if (k === 'r' && !e.repeat) { SFX.click(); startGame(); }
  if (k === 'm' && !e.repeat) toggleMute();
  if (k === 'p' && !e.repeat && G.state === 'playing') setPaused(!G.paused);
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
  if (k === ' ' || k === 'arrowup' || k === 'w') keys.fire = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing' && !G.paused) setPaused(true);
});

/* ------------------------ spawning ------------------------- */
function spawnDuck(type) {
  if (ducks.length > 26) return;
  const sc = 1 + Math.max(0, G.wave - 1) * 0.08;
  const fromL = Math.random() < 0.5;
  let y, vx, r;
  if (type === 'bomber') {
    y = rand(46, Math.max(95, H * 0.16));
    vx = (fromL ? 1 : -1) * rand(55, 85) * sc;
    r = 30;
  } else {
    y = rand(64, Math.max(150, H * 0.42));
    const sp = type === 'golden' ? rand(150, 205) : rand(105, 175);
    vx = (fromL ? 1 : -1) * sp * sc;
    r = 24;
  }
  ducks.push({
    type, x: fromL ? -50 : W + 50, y, baseY: y, vx, vy: 0, r,
    dir: fromL ? 1 : -1, bobA: rand(10, 30), bobF: rand(1.2, 2.6), bobP: rand(0, TAU),
    flap: rand(0, TAU), flapF: rand(9, 13), t: 0, dropCd: rand(1.4, 2.4), state: 'fly'
  });
}

function spawnKami() {
  ducks.push({
    type: 'kami', x: rand(W * 0.15, W * 0.85), y: -40, baseY: 0,
    vx: 0, vy: 30, r: 22, dir: 1, bobA: 0, bobF: 0, bobP: 0,
    flap: 0, flapF: 16, t: 0, dropCd: 0, state: 'hover', hoverT: 0.85
  });
  SFX.quack(1.6);
}

function dropEgg(d) {
  eggs.push({
    x: d.x, y: d.y + 14, r: 7, rot: rand(0, TAU),
    vx: clamp((player.x - d.x) * 0.45, -140, 140), vy: 60
  });
  SFX.quack(0.75);
}

function startWave(n) {
  G.wave = n;
  pal = PALETTES[(n - 1) % PALETTES.length];
  const q = [];
  const nn = Math.min(4 + n * 2, 16);
  for (let i = 0; i < nn; i++) q.push(Math.random() < 0.08 ? 'golden' : 'normal');
  const nb = n >= 2 ? Math.min(1 + ((n - 2) >> 1), 4) : 0;
  for (let i = 0; i < nb; i++) q.push('bomber');
  for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
  G.spawnQueue = q;
  G.spawnTimer = 1.0;
  G.kamiLeft = n >= 3 ? Math.min(1 + n, 8) : 0;
  G.kamiTimer = n >= 3 ? rand(2.5, 4.5) : Infinity;
  G.interT = -1;
  G.banner = { text: 'WAVE ' + n, sub: FLAVOR[(n - 1) % FLAVOR.length], t: 0 };
  SFX.wave();
}

/* ------------------------ combat --------------------------- */
function shoulderPos() { return { x: player.x, y: groundY + player.yOff - 34 }; }
function muzzlePos() {
  const s = shoulderPos();
  return { x: s.x + Math.cos(player.aim) * 34, y: s.y + Math.sin(player.aim) * 34 };
}

function tryFire() {
  if (G.state !== 'playing' || player.fireCd > 0) return;
  player.fireCd = FIRE_CD;
  player.flashT = 0.09;
  SFX.shot(); buzz(15);
  G.shake = Math.max(G.shake, 6);

  const m = muzzlePos(), a = player.aim;
  for (let i = 0; i < PELLET_COUNT; i++) {
    const sa = a + rand(-PELLET_SPREAD, PELLET_SPREAD);
    const sp = rand(1250, PELLET_SPEED);
    pellets.push({ x: m.x, y: m.y, vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp,
                   life: clamp(H * 0.00058, 0.24, 0.55) });
  }
  for (let i = 0; i < 3; i++)
    parts.push({ kind: 'smoke', x: m.x, y: m.y, vx: Math.cos(a) * rand(30, 90) + rand(-20, 20),
                 vy: Math.sin(a) * rand(30, 90) - 20, t: 0, life: rand(0.4, 0.8), size: rand(3, 6), color: 'rgba(200,200,210,' });
  casings.push({
    x: player.x - player.facing * 6, y: groundY + player.yOff - 34,
    vx: -player.facing * rand(60, 150), vy: -rand(140, 240),
    rot: rand(0, TAU), vr: rand(-9, 9), t: 0
  });
}

function killDuck(d, x, y) {
  feathers(d, x, y);
  SFX.quack(d.type === 'golden' ? 1.45 : rand(0.8, 1.2));
  dog.jumpT = 0.55;
  if (Math.random() < 0.35) SFX.yip();
}

function explodeKami(d) {
  feathers(d, d.x, d.y);
  for (let i = 0; i < 8; i++)
    parts.push({ kind: 'spark', x: d.x, y: d.y, vx: rand(-180, 180), vy: rand(-220, 60),
                 t: 0, life: rand(0.2, 0.45), color: '#ff9f43' });
  G.shake = Math.max(G.shake, 6);
  SFX.splat();
}

/* ---------------------- particles etc ---------------------- */
function wingColor(t) {
  return t === 'golden' ? '#f1c85a' : t === 'bomber' ? '#6d7885' : t === 'kami' ? '#7d4444' : '#8a6238';
}
function feathers(d, x, y) {
  const col = wingColor(d.type);
  for (let i = 0; i < 12; i++)
    parts.push({ kind: 'feather', x: x + rand(-8, 8), y: y + rand(-8, 8),
                 vx: rand(-90, 90), vy: rand(-150, 10), rot: rand(0, TAU), vr: rand(-4, 4),
                 t: 0, life: rand(0.8, 1.6), size: rand(4, 7), color: col });
}
function addStain(x) { stains.push({ x, t: 0 }); }
function eggSplat(i) {
  const e = eggs[i];
  eggs.splice(i, 1);
  SFX.splat();
  for (let k = 0; k < 7; k++)
    parts.push({ kind: 'goo', x: e.x, y: e.y, vx: rand(-120, 120), vy: rand(-180, -30),
                 t: 0, life: rand(0.4, 0.8), size: rand(1.5, 3), color: '#f5eea8' });
  addStain(e.x);
}

/* ------------------------ game flow ------------------------ */
function startGame() {
  try {
    ducks = []; pellets = []; eggs = []; casings = []; stains = [];
    G.ambT = 1; G.shake = 0;
    player.x = W / 2 || 400; player.yOff = 0; player.vy = 0; player.grounded = true;
    player.fireCd = 0.2; player.aim = -Math.PI / 2; player.facing = 1;
    G.state = 'playing';
    G.paused = false;
    if (el.ovStart) el.ovStart.classList.add('hidden');
    if (el.ovOver) el.ovOver.classList.add('hidden');
    if (el.ovPause) el.ovPause.classList.add('hidden');
    if (el.hud) el.hud.classList.remove('hidden');
    startWave(1);
  } catch (err) {
    console.error('startGame error', err);
  }
}

function setPaused(v) {
  G.paused = v;
  if (el.ovPause) el.ovPause.classList.toggle('hidden', !v);
}

function toggleMute() {
  SFX.muted = !SFX.muted;
  if (el.btnMute) el.btnMute.textContent = SFX.muted ? '🔇' : '🔊';
  if (!SFX.muted) SFX.click();
}

/* ------------------------- update -------------------------- */
function update(dt) {
  G.time += dt;

  for (const c of clouds) { c.x += c.v * dt; if (c.x > W + 120) c.x = -120; }

  if (G.state === 'playing') updatePlayer(dt);
  else {
    G.ambT -= dt;
    if (G.ambT <= 0 && ducks.length < 4) {
      spawnDuck(Math.random() < 0.15 ? 'golden' : 'normal');
      G.ambT = rand(1.2, 2.6);
    }
  }

  if (G.state === 'playing') {
    if (G.spawnQueue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnDuck(G.spawnQueue.pop());
        G.spawnTimer = rand(0.6, 1.0) * Math.max(0.5, 1 - 0.045 * G.wave);
      }
    }
    if (G.kamiLeft > 0) {
      G.kamiTimer -= dt;
      if (G.kamiTimer <= 0) {
        spawnKami(); G.kamiLeft--;
        G.kamiTimer = rand(4, 7) - Math.min(G.wave * 0.2, 2.5);
      }
    }
    if (!G.spawnQueue.length && !ducks.length && !eggs.length) {
      if (G.interT < 0) {
        G.interT = 1.2;
        G.banner = { text: 'WAVE CLEAR!', sub: 'NEXT WAVE INCOMING', t: 0 };
        SFX.wave();
      } else {
        G.interT -= dt;
        if (G.interT <= 0) startWave(G.wave + 1);
      }
    }
  }

  updateDucks(dt);
  updateEggs(dt);
  updatePellets(dt);

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { parts.splice(i, 1); continue; }
    if (p.kind === 'feather') {
      p.vx += Math.sin(p.t * 9 + p.rot) * 55 * dt;
      p.vy += 65 * dt; p.vy = Math.min(p.vy, 90);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    } else if (p.kind === 'goo') {
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    } else if (p.kind === 'smoke' || p.kind === 'dust') {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96;
    } else {
      p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.t += dt; c.vy += 1200 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    if (c.y > groundY - 3) { c.y = groundY - 3; c.vy *= -0.4; c.vx *= 0.7; c.vr *= 0.6; }
    if (c.t > 1.3) casings.splice(i, 1);
  }
  for (let i = stains.length - 1; i >= 0; i--) {
    stains[i].t += dt;
    if (stains[i].t > 4) stains.splice(i, 1);
  }

  if (dog.jumpT > 0) dog.jumpT -= dt;
  G.shake = Math.max(0, G.shake - 32 * dt);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 1.9) G.banner = null; }

  syncHud();
}

function updatePlayer(dt) {
  let mv = 0;
  if (keys.left) mv -= 1;
  if (keys.right) mv += 1;
  if (joy.active && Math.abs(joy.dx) > 0.12) mv = clamp(joy.dx * 1.2, -1, 1);
  player.x = clamp(player.x + mv * PLAYER_SPEED * dt, 30, W - 30);
  if (Math.abs(mv) > 0.05) {
    player.moving = true;
    player.walk += dt * 9;
    if (Math.abs(mv) > 0.25) player.facing = mv > 0 ? 1 : -1;
  } else player.moving = false;

  let wantJump = false;
  if (keys.jump) wantJump = true;
  if (joy.active && joy.dy < -0.62 && !joy.jumpHeld) { wantJump = true; joy.jumpHeld = true; }
  if (joy.active && joy.dy > -0.4) joy.jumpHeld = false;
  keys.jump = false;
  if (wantJump && player.grounded) {
    player.vy = JUMP_VY; player.grounded = false;
    for (let i = 0; i < 5; i++)
      parts.push({ kind: 'dust', x: player.x + rand(-10, 10), y: groundY - 4,
                   vx: rand(-50, 50), vy: rand(-40, -5), t: 0, life: rand(0.25, 0.5), size: rand(2, 4), color: 'rgba(170,150,110,' });
  }
  if (!player.grounded) {
    player.vy += GRAVITY * dt;
    player.yOff += player.vy * dt;
    if (player.yOff >= 0) {
      player.yOff = 0; player.vy = 0; player.grounded = true;
      for (let i = 0; i < 4; i++)
        parts.push({ kind: 'dust', x: player.x + rand(-12, 12), y: groundY - 3,
                     vx: rand(-60, 60), vy: rand(-30, 0), t: 0, life: 0.35, size: rand(2, 4), color: 'rgba(170,150,110,' });
    }
  }

  const sh = shoulderPos();
  let desired = null;
  if (mouse.active) {
    desired = Math.atan2(mouse.y - sh.y, mouse.x - sh.x);
  } else {
    let bd = Infinity, tx = 0, ty = 0, found = false;
    for (const d of ducks) {
      if (d.y < sh.y - 10) {
        const s = dist2(player.x, sh.y, d.x, d.y);
        if (s < bd) { bd = s; tx = d.x; ty = d.y; found = true; }
      }
    }
    for (const e of eggs) {
      if (e.y < sh.y - 10) {
        const s = dist2(player.x, sh.y, e.x, e.y) * 0.55;
        if (s < bd) { bd = s; tx = e.x; ty = e.y; found = true; }
      }
    }
    if (found) desired = Math.atan2(ty - sh.y, tx - player.x);
  }
  if (desired === null) desired = -Math.PI / 2;
  desired = clamp(desired, -Math.PI, 0.04);
  player.aim = angleLerp(player.aim, desired, 1 - Math.pow(0.0004, dt));
  const c = Math.cos(player.aim);
  if (c > 0.3) player.facing = 1; else if (c < -0.3) player.facing = -1;

  if (fireHeld()) tryFire();
  player.fireCd = Math.max(0, player.fireCd - dt);
  player.flashT = Math.max(0, player.flashT - dt);
}

function updateDucks(dt) {
  for (let i = ducks.length - 1; i >= 0; i--) {
    const d = ducks[i];
    d.t += dt; d.flap += d.flapF * dt;

    if (d.type === 'kami') {
      if (d.state === 'hover') {
        d.hoverT -= dt;
        d.y += Math.sin(d.t * 10) * 10 * dt;
        d.dir = player.x > d.x ? 1 : -1;
        if (d.hoverT <= 0) {
          d.state = 'dive';
          const tx = clamp(player.x, 40, W - 40);
          d.vx = clamp((tx - d.x) / 0.9, -280, 280);
          d.vy = rand(520, 640);
        }
      } else {
        d.vy = Math.min(d.vy + 320 * dt, 720);
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (Math.abs(d.vx) > 1) d.dir = d.vx > 0 ? 1 : -1;
        if (Math.random() < dt * 28)
          parts.push({ kind: 'smoke', x: d.x + rand(-4, 4), y: d.y - 14, vx: 0, vy: -30, t: 0, life: 0.35, size: rand(2, 4), color: 'rgba(255,110,80,' });
        if (d.y >= groundY - 12) {
          explodeKami(d); ducks.splice(i, 1);
          continue;
        }
      }
      continue;
    }

    d.x += d.vx * dt;
    d.y = d.baseY + Math.sin(d.t * d.bobF + d.bobP) * d.bobA;
    if (d.type === 'bomber') {
      d.dropCd -= dt;
      if (d.dropCd <= 0 && d.x > W * 0.1 && d.x < W * 0.9 && G.state === 'playing') {
        d.dropCd = rand(1.6, 2.4);
        dropEgg(d);
      }
    }
    if ((d.vx > 0 && d.x > W + 70) || (d.vx < 0 && d.x < -70)) ducks.splice(i, 1);
  }
}

function updateEggs(dt) {
  for (let i = eggs.length - 1; i >= 0; i--) {
    const e = eggs[i];
    e.vy += 950 * dt;
    e.x += e.vx * dt; e.y += e.vy * dt; e.rot += dt * 4;
    if (e.y >= groundY - 4) eggSplat(i);
  }
}

function updatePellets(dt) {
  for (let i = pellets.length - 1; i >= 0; i--) {
    const p = pellets[i];
    p.life -= dt;
    if (p.life <= 0) { pellets.splice(i, 1); continue; }
    let dead = false;
    const steps = 2;
    for (let s = 0; s < steps && !dead; s++) {
      p.x += p.vx * dt / steps;
      p.y += p.vy * dt / steps;
      for (let j = ducks.length - 1; j >= 0; j--) {
        const d = ducks[j];
        if (dist2(p.x, p.y, d.x, d.y) < (d.r + 4) * (d.r + 4)) {
          ducks.splice(j, 1);
          killDuck(d, d.x, d.y);
          dead = true; break;
        }
      }
      if (!dead) for (let j = eggs.length - 1; j >= 0; j--) {
        const e = eggs[j];
        if (dist2(p.x, p.y, e.x, e.y) < (e.r + 5) * (e.r + 5)) {
          eggSplat(j);
          dead = true; break;
        }
      }
    }
    if (dead) pellets.splice(i, 1);
  }
}

/* ------------------------- HUD sync ------------------------ */
function syncHud() {
  if (el.wave) el.wave.textContent = 'WAVE ' + Math.max(1, G.wave);
  if (el.ovWave) el.ovWave.textContent = G.wave;
}

/* --------------------- drawing helpers --------------------- */
function rr(x, y, w, h, r) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath(); ctx.fill();
}
function ell(x, y, rx, ry, color) {
  if (!ctx) return;
  if (color) ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
function circle(x, y, r, color) { ell(x, y, r, r, color); }
function line(x1, y1, x2, y2, color, w) {
  if (!ctx) return;
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/* -------------------------- render ------------------------- */
function render() {
  if (!ctx) return;
  try {
    const sx = (Math.random() * 2 - 1) * G.shake;
    const sy = (Math.random() * 2 - 1) * G.shake;
    ctx.save();
    ctx.translate(sx, sy);

    drawSky();
    drawGroundBack();
    drawStains();

    drawDog();
    if (G.state !== 'start') drawPlayer();
    for (const d of ducks) drawDuck(d);
    for (const e of eggs) drawEgg(e);
    for (const p of pellets) drawPellet(p);
    for (const c of casings) drawCasing(c);
    drawParts();
    drawBanner();

    ctx.restore();

    if (vignette) { ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H); }
    if (mouse.active && G.state === 'playing') drawCrosshair();
  } catch (err) {
    console.error('render error', err);
  }
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(-14, -14, W + 28, groundY + 16);

  if (pal.stars > 0) {
    for (let i = 0; i < pal.stars && i < stars.length; i++) {
      const s = stars[i];
      const a = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(G.time * s.tw + s.ph));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }
  if (pal.sun) {
    const x = pal.sun.fx * W, y = pal.sun.fy * H;
    const rg = ctx.createRadialGradient(x, y, pal.sun.r * 0.4, x, y, pal.sun.r * 2.6);
    rg.addColorStop(0, pal.sun.glow); rg.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = rg; ctx.fillRect(x - pal.sun.r * 3, y - pal.sun.r * 3, pal.sun.r * 6, pal.sun.r * 6);
    circle(x, y, pal.sun.r, pal.sun.c);
  }
  if (pal.moon) {
    const x = W * 0.78, y = H * 0.13;
    const rg = ctx.createRadialGradient(x, y, 10, x, y, 70);
    rg.addColorStop(0, 'rgba(240,240,220,0.35)'); rg.addColorStop(1, 'rgba(240,240,220,0)');
    ctx.fillStyle = rg; ctx.fillRect(x - 70, y - 70, 140, 140);
    circle(x, y, 24, '#f2efdc');
    circle(x - 7, y - 4, 5, 'rgba(190,190,170,0.8)');
    circle(x + 6, y + 7, 4, 'rgba(190,190,170,0.8)');
    circle(x + 9, y - 9, 3, 'rgba(190,190,170,0.8)');
  }
  for (const c of clouds) {
    ctx.fillStyle = pal.cloud;
    const s = c.s;
    ell(c.x, c.y, 34 * s, 13 * s);
    ell(c.x - 20 * s, c.y + 4 * s, 20 * s, 9 * s);
    ell(c.x + 22 * s, c.y + 3 * s, 22 * s, 10 * s);
    ell(c.x + 4 * s, c.y - 9 * s, 18 * s, 10 * s);
  }
}

function drawGroundBack() {
  ctx.fillStyle = pal.far;
  ctx.beginPath(); ctx.moveTo(-40, groundY + 2);
  for (const p of hillsFar) ctx.lineTo(p.x, p.y);
  ctx.lineTo(W + 40, groundY + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.near;
  ctx.beginPath(); ctx.moveTo(-40, groundY + 2);
  for (const p of hillsNear) ctx.lineTo(p.x, p.y);
  ctx.lineTo(W + 40, groundY + 2); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 34; x < W; x += 88) ctx.fillRect(x, groundY - 16, 5, 17);

  const g = ctx.createLinearGradient(0, groundY, 0, H);
  g.addColorStop(0, pal.ground[0]); g.addColorStop(1, pal.ground[1]);
  ctx.fillStyle = g; ctx.fillRect(-14, groundY, W + 28, H - groundY + 14);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(0, groundY, W, 2);
  ctx.strokeStyle = pal.grass; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const t of grass) {
    ctx.moveTo(t.x, groundY + 1);
    ctx.lineTo(t.x + t.lean, groundY - t.h);
  }
  ctx.stroke();
}

function drawPlayer() {
  const feet = groundY + player.yOff;
  const f = player.facing;
  ctx.save();
  ctx.translate(player.x, feet);

  ell(0, 1, 15, 4, 'rgba(0,0,0,0.25)');

  const lp = player.moving ? Math.sin(player.walk * 2.2) * 5 : 0;
  line(-5, -16, -5 + lp, -3, '#4a3524', 6);
  line(5, -16, 5 - lp, -3, '#4a3524', 6);
  ctx.fillStyle = '#2b2118';
  rr(-9 + lp, -5, 10, 6, 2); rr(-1 - lp, -5, 10, 6, 2);

  const bob = player.moving ? Math.abs(Math.sin(player.walk * 2.2)) * 1.5 : 0;
  const by = -bob;

  ctx.fillStyle = '#8a5a2e'; rr(-11, by - 40, 22, 26, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(-11, by - 40, 22, 8, 6);
  ctx.fillStyle = '#3d2b18'; ctx.fillRect(-11, by - 19, 22, 4);
  ctx.fillStyle = '#c8452e';
  for (let i = 0; i < 4; i++) ctx.fillRect(-8 + i * 5, by - 19, 3, 4);

  circle(1, by - 48, 8.5, '#e8b98a');
  ctx.fillStyle = '#c8452e';
  ctx.beginPath(); ctx.arc(1, by - 50, 9, Math.PI, 0); ctx.closePath(); ctx.fill();
  rr(f > 0 ? 3 : -14, by - 52, 12, 4, 2);
  circle(f * 4 + 1, by - 47, 1.3, '#33241a');

  ctx.translate(0, by - 34);
  ctx.rotate(player.aim);
  if (Math.cos(player.aim) < 0) ctx.scale(1, -1);
  ctx.fillStyle = '#5d3d1e'; rr(-13, -3, 15, 8, 2);
  ctx.fillStyle = '#333a42'; rr(0, -3, 33, 6, 2);
  ctx.fillStyle = '#22272e'; ctx.fillRect(4, -3, 29, 1.4); ctx.fillRect(4, 1.6, 29, 1.4);
  ctx.fillStyle = '#6b4a26'; rr(9, 3, 11, 5, 2);
  circle(13, 4.5, 3.6, '#e8b98a');
  circle(-4, 2, 3.6, '#e8b98a');

  if (player.flashT > 0) {
    const a = player.flashT / 0.09;
    ctx.save(); ctx.translate(35, 0);
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = g; circle(0, 0, 26);
    ctx.fillStyle = 'rgba(255,225,130,0.95)';
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(3, -3); ctx.lineTo(16, 0); ctx.lineTo(3, 3);
    ctx.lineTo(0, 16); ctx.lineTo(-3, 3); ctx.lineTo(-13, 0); ctx.lineTo(-3, -3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawDuck(d) {
  const dir = d.type === 'kami' ? d.dir : (d.vx >= 0 ? 1 : -1);
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(dir, 1);

  let body = '#7a5230', head = '#2f8f46', wing = '#8a6238', beak = '#f4a825', ring = true;
  if (d.type === 'golden') { body = '#e8b83a'; head = '#f6d365'; wing = '#f1c85a'; beak = '#e07b2a'; ring = false; }
  if (d.type === 'bomber') { body = '#5a6470'; head = '#3e4650'; wing = '#6d7885'; beak = '#d99a2b'; ring = false; }
  if (d.type === 'kami')   { body = '#6e3b3b'; head = '#8f2f2f'; wing = '#7d4444'; beak = '#e0b02a'; ring = false; }

  const flap = Math.sin(d.flap);

  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(-15, -11); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill();

  if (d.type === 'bomber') {
    ell(2, 17, 6, 8, '#23272c');
    ctx.fillStyle = '#3a4048';
    ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(-4, 13); ctx.lineTo(2, 15); ctx.closePath(); ctx.fill();
    line(2, 9, 3, 3, '#8a6238', 1.6);
    circle(3.4, 2.2, 1.6 + Math.sin(G.time * 20) * 0.5, '#ffb703');
  }

  ctx.save();
  ctx.translate(-2, -6);
  ctx.rotate(flap * 0.75 - 0.25);
  ell(0, -9, 15, 7, wing);
  ctx.restore();

  ell(0, 0, 20, 13, body);
  ell(-2, 5, 12, 6, 'rgba(255,255,255,0.12)');

  line(10, -4, 16, -13, body, 9);
  circle(17, -16, 9, head);
  if (ring) { ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(12.5, -8.5, 5.5, 4.5, -0.4, 0, TAU); ctx.stroke(); }

  ctx.fillStyle = beak;
  ctx.beginPath(); ctx.moveTo(24, -19); ctx.lineTo(34, -15.5); ctx.lineTo(24, -12.5); ctx.closePath(); ctx.fill();

  if (d.type === 'kami') {
    ctx.save(); ctx.shadowColor = '#ff2b2b'; ctx.shadowBlur = 8;
    circle(20, -18, 2.4, '#ff4040');
    ctx.restore();
    line(16, -22, 23, -20.5, '#3a0d0d', 2);
  } else {
    circle(20, -18, 2.6, '#fff');
    circle(20.8, -18, 1.4, '#1c1c1c');
  }

  if (d.type === 'bomber') {
    ctx.fillStyle = '#68707c';
    ctx.beginPath(); ctx.arc(17, -18, 9.5, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
  }
  if (d.type === 'golden') {
    ctx.fillStyle = 'rgba(255,255,220,0.9)';
    const tw = Math.sin(G.time * 9);
    ctx.fillRect(-26, -14 * tw - 4, 2.4, 2.4);
    ctx.fillRect(14, 16 * tw + 2, 2, 2);
  }
  ctx.restore();

  if (d.type === 'kami' && d.state === 'hover') {
    const pulse = 1 + Math.sin(G.time * 14) * 0.15;
    ctx.save();
    ctx.translate(d.x, d.y - 48);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, 8); ctx.lineTo(-11, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 13px Rubik, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('!', 0, 6);
    ctx.restore();
  }
}

function drawEgg(e) {
  ctx.save();
  ctx.translate(e.x, e.y); ctx.rotate(e.rot * 0.5);
  ell(0, 0, 6.5, 8.5, '#f7f3e8');
  ell(-2, -3, 2, 3, 'rgba(255,255,255,0.75)');
  ctx.restore();
}

function drawPellet(p) {
  const a = clamp(p.life / 0.2, 0, 1);
  ctx.strokeStyle = `rgba(255,214,110,${0.5 + a * 0.5})`;
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x - p.vx * 0.014, p.y - p.vy * 0.014);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function drawCasing(c) {
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.rot);
  ctx.globalAlpha = clamp(1.3 - c.t, 0, 1);
  ctx.fillStyle = '#e8c15a'; ctx.fillRect(-3, -1.6, 6, 3.2);
  ctx.fillStyle = '#b0432e'; ctx.fillRect(-3, -1.6, 1.8, 3.2);
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    const k = 1 - p.t / p.life;
    if (p.kind === 'feather') {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ell(0, 0, p.size, p.size * 0.42, p.color);
      line(0, -p.size * 0.8, 0, p.size * 0.8, 'rgba(0,0,0,0.25)', 1);
      ctx.restore();
    } else if (p.kind === 'goo') {
      ctx.globalAlpha = k;
      circle(p.x, p.y, p.size, p.color);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'smoke' || p.kind === 'dust') {
      ctx.globalAlpha = k * 0.5;
      circle(p.x, p.y, p.size + (1 - k) * 6, p.color + (0.5 * k) + ')');
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = k;
      circle(p.x, p.y, 2, p.color);
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

function drawStains() {
  for (const s of stains) {
    const k = 1 - s.t / 4;
    ell(s.x, groundY + 3, 13, 4, `rgba(240,228,150,${0.4 * k})`);
  }
}

function drawDog() {
  const dx = dog.x;
  let dy = 0;
  if (dog.jumpT > 0) {
    const t = 1 - dog.jumpT / 0.55;
    dy = -Math.sin(Math.PI * clamp(t, 0, 1)) * 34;
  }
  ctx.save();
  ctx.translate(dx, groundY + dy);
  ell(0, 1, 13, 3.5, 'rgba(0,0,0,0.2)');
  const wag = Math.sin(G.time * 7) * 0.35 + 0.6;
  line(-11, -12, -11 - Math.cos(wag) * 9, -12 - Math.sin(wag) * 10, '#f4f1e8', 4);
  ell(0, -11, 12, 8.5, '#f4f1e8');
  ell(-2, -14, 8, 5, '#8a6238');
  line(-4, -4, -5, 1, '#f4f1e8', 3.5);
  line(4, -4, 5, 1, '#f4f1e8', 3.5);
  circle(8, -20, 7, '#f4f1e8');
  ell(4, -25, 4, 6.5, '#8a6238');
  ctx.save(); ctx.rotate(0.25); ell(5, -26, 3.5, 6, '#8a6238'); ctx.restore();
  circle(13.5, -20.5, 1.6, '#26201a');
  circle(10.5, -22, 1.2, '#26201a');
  ctx.restore();
}

function drawBanner() {
  if (!G.banner) return;
  const b = G.banner;
  const k = b.t < 0.15 ? b.t / 0.15 : b.t > 1.45 ? Math.max(0, 1 - (b.t - 1.45) / 0.45) : 1;
  const pop = 1 + (b.t < 0.18 ? (0.18 - b.t) * 2 : 0);
  ctx.save();
  ctx.translate(W / 2, H * 0.34);
  ctx.scale(pop, pop);
  ctx.globalAlpha = k;
  ctx.textAlign = 'center';
  ctx.font = '900 46px Rubik, sans-serif';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(20,14,4,0.85)';
  ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = '#ffb703';
  ctx.fillText(b.text, 0, 0);
  if (b.sub) {
    ctx.font = '700 16px Rubik, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(b.sub, 0, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(b.sub, 0, 30);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  const x = mouse.x, y = mouse.y;
  ctx.strokeStyle = 'rgba(255,209,102,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.stroke();
  line(x - 16, y, x - 6, y, 'rgba(255,209,102,0.95)', 2);
  line(x + 6, y, x + 16, y, 'rgba(255,209,102,0.95)', 2);
  line(x, y - 16, x, y - 6, 'rgba(255,209,102,0.95)', 2);
  line(x, y + 6, x, y + 16, 'rgba(255,209,102,0.95)', 2);
  circle(x, y, 1.6, '#ffd166');
}

/* -------------------------- loop --------------------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try {
    if (!G.paused) update(dt);
    render();
  } catch (e) {
    console.error('frame error', e);
  }
  requestAnimationFrame(frame);
}

/* -------------------------- wiring ------------------------- */
if (el.btnPlay) el.btnPlay.addEventListener('click', () => { SFX.ensure(); SFX.click(); startGame(); });
if (el.btnAgain) el.btnAgain.addEventListener('click', () => { SFX.ensure(); SFX.click(); startGame(); });
if (el.btnRestart) el.btnRestart.addEventListener('click', () => { SFX.ensure(); SFX.click(); startGame(); });
if (el.btnMute) el.btnMute.addEventListener('click', () => { SFX.ensure(); toggleMute(); });

/* -------------------------- init --------------------------- */
resize();
// double resize after a tick to catch mobile dvh
setTimeout(resize, 100);
setTimeout(resize, 500);
requestAnimationFrame(frame);
console.log('Duck Havoc init', {W, H, groundY});

})();
