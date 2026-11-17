// LUMENKEEP — entry point: canvas setup, the frame loop, mouse/keyboard input,
// and the deterministic ?shot= scenes used to render the hand-in screenshots.
// Scenes: ?shot=title | ?shot=cover | ?shot=meta | ?shot=end (with &seed=N).

import { createGame, startRun, startNight, rotateCell, pickDraft, rerollDraft, update, refreshBeam, mods, setBanner, addFloater, finishRun } from './game.js';
import { draw, UI, W, H } from './render.js';
import { DIFFICULTIES, BESTIARY, TOTAL_NIGHTS } from './data.js';
import { solveRoom, cellCenterX, cellCenterY } from './world.js';
import { hashSeed } from './rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 10) >>> 0;
const shot = params.get('shot');

const g = createGame(seed * 100003 + 7);
let mouse = { x: 0, y: 0 };

function toGame(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) };
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
function boardCell(p) {
  const gx = Math.floor((p.x - 292) / 56), gy = Math.floor((p.y - 148) / 56);
  return gx >= 0 && gx < 11 && gy >= 0 && gy < 8 ? { x: gx, y: gy } : null;
}

canvas.addEventListener('mousemove', (ev) => { mouse = toGame(ev); });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('mousedown', (ev) => {
  const p = toGame(ev);
  const dirSign = ev.button === 2 ? -1 : 1;
  if (g.screen === 'title') {
    for (const b of UI.diffBtns) {
      if (inRect(p, b)) { startRun(g, DIFFICULTIES.find((d) => d.id === b.id)); return; }
    }
  } else if (g.screen === 'play') {
    const cell = boardCell(p);
    if (cell) rotateCell(g, cell.x, cell.y, dirSign);
  } else if (g.screen === 'draft') {
    for (let i = 0; i < UI.draftCards.length; i++) {
      if (inRect(p, UI.draftCards[i])) { pickDraft(g, i); return; }
    }
    if (inRect(p, UI.rerollBtn)) rerollDraft(g);
  } else if (g.screen === 'victory' || g.screen === 'defeat') {
    if (inRect(p, UI.againBtn)) {
      if (g.screen === 'victory') { g.screen = 'title'; g.endStats = null; }
      else startNight(g, g.night); // retry the fallen night, build intact
    }
  }
});
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (g.screen === 'play' && (k === 'q' || k === 'e')) {
    const cell = boardCell(mouse);
    if (cell) rotateCell(g, cell.x, cell.y, k === 'e' ? 1 : -1);
  }
  if (g.screen === 'draft' && ['1', '2', '3'].includes(k)) pickDraft(g, Number(k) - 1);
});

// ---------------------------------------------------------------------------
// Deterministic screenshot scenes. Each builds a real mid-run state through
// the game's own systems (real room, real beam, real draft choices), then
// freezes the clock so the rendered frame is stable.
// ---------------------------------------------------------------------------

function stageEnemy(typeId, gx, gy, hpFrac) {
  const def = BESTIARY.find((b) => b.id === typeId);
  g.enemies.push({
    type: typeId, def, x: cellCenterX(gx), y: cellCenterY(gy),
    hp: def.hp * (hpFrac || 1), max: def.hp, t: 2.4, frozen: 0,
    spitTimer: 1.4, noSplit: false, faceX: -1, faceY: 0.2, flash: 0,
  });
}

function stageCover() {
  startRun(g, DIFFICULTIES[1]);
  startNight(g, TOTAL_NIGHTS);
  solveRoom(g.room);
  g.blessings = ['haste', 'sigil', 'aegis', 'gilded', 'tithe', 'prismheart'];
  g.relics = ['sunstone', 'embercrown', 'dawnchain', 'mothbane', 'sovereign', 'palebell'];
  const m = mods(g);
  g.lanterns = g.room.lanterns.map((_, i) => ({ integrity: Math.round(m.lanternMax * [1, 0.82, 0.93, 0.68][i % 4]), dark: 0 }));
  g.score = 48750; g.embers = 286;
  g.stats.burned = 87; g.stats.rotations = 121; g.stats.bossesFelled = 3; g.stats.drafts = 8;
  g.dawnLeft = Math.round(g.dawnMax * 0.62);
  if (g.boss) { g.boss.hp = Math.round(g.boss.max * 0.38); g.bossQueue = []; }
  g.spawnPlan = ['mite', 'moth', 'husk', 'spitter', 'prowler', 'splitter', 'mite', 'moth'];
  stageEnemy('mite', 8, 2, 0.6);
  stageEnemy('moth', 9, 5, 0.8);
  stageEnemy('prowler', 7, 6, 1);
  stageEnemy('husk', 9, 1, 0.9);
  stageEnemy('splitter', 6, 1, 0.7);
  stageEnemy('spitter', 10, 4, 1);
  stageEnemy('mite', 5, 6, 0.4);
  g.chain = 6; g.chainTimer = 99; g.bestChain = 9;
  refreshBeam(g);
  setBanner(g, 'CHAIN ×4', '6 shadows burned in a row — the Moth is breaking', 999);
  g.banner.t = 0.4;
  addFloater(g, cellCenterX(8), cellCenterY(2) - 18, '+338', '#ffe9a3');
  addFloater(g, cellCenterX(6), cellCenterY(1) - 18, '+450', '#ffe9a3');
  addFloater(g, cellCenterX(9), cellCenterY(5) - 18, '+525', '#7dffb0');
  addFloater(g, cellCenterX(5), cellCenterY(6) - 18, '+200', '#ffe9a3');
  for (const f of g.floaters) f.ttl = 999;
  for (let i = 0; i < 42; i++) {
    g.particles.push({
      x: 340 + ((i * 197) % 540), y: 190 + ((i * 131) % 360),
      vx: 0, vy: 0, t: (i % 7) * 0.06, ttl: 999, color: i % 3 ? '#ffd76a' : '#f43f5e',
    });
  }
}

function stageMeta() {
  startRun(g, DIFFICULTIES[1]);
  startNight(g, 7);
  g.score = 36500; g.embers = 240;
  g.blessings = ['haste', 'aegis', 'sigil', 'tithe', 'slowdusk'];
  g.relics = ['sunstone', 'thornmirror', 'embercrown'];
  g.stats.drafts = 6; g.stats.bossesFelled = 2; g.stats.burned = 64;
  g.boss = null; g.bossQueue = [];
  g.draftWasBoss = true;
  g.draft = [
    { type: 'relic', id: 'sovereign' },
    { type: 'blessing', id: 'prismheart' },
    { type: 'blessing', id: 'gilded' },
  ];
  g.screen = 'draft';
  refreshBeam(g);
}

function stageEnd() {
  startRun(g, DIFFICULTIES[1]);
  startNight(g, TOTAL_NIGHTS);
  solveRoom(g.room);
  g.blessings = ['haste', 'sigil', 'aegis', 'gilded', 'tithe', 'prismheart', 'sunwell'];
  g.relics = ['sunstone', 'embercrown', 'dawnchain', 'mothbane', 'sovereign', 'palebell'];
  g.embers = 315;
  g.bestChain = 9;
  g.stats = { burned: 132, bossesFelled: 4, drafts: 9, lanternsLost: 0, rotations: 148, playSeconds: 1087, dawnBanked: 212, nightsCleared: 10 };
  g.boss = null; g.bossQueue = [];
  g.score = 68420 - g.embers * 5; // finishRun banks embers ×5 into the score
  refreshBeam(g);
  finishRun(g, true, '');
}

if (shot === 'cover') stageCover();
else if (shot === 'meta') stageMeta();
else if (shot === 'end') stageEnd();
else if (shot === 'title') {
  g.screen = 'title';
}

// Frame loop. In shot mode the clock is frozen at a fixed instant so the
// rendered frame is deterministic; in play the clock runs live.
let last = performance.now();
let statusTick = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shot) {
    draw(ctx, g, 6.66);
  } else {
    update(g, dt);
    draw(ctx, g, now / 1000);
    statusTick += dt;
    if (statusTick > 1) {
      statusTick = 0;
      status.textContent = 'LUMENKEEP — night ' + g.night + ' of ' + TOTAL_NIGHTS + ', score ' + g.score + ', screen ' + g.screen;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
