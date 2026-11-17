// LUMENKEEP — canvas renderer: textured realm floors, the glow beam, the full
// HUD (WIN/LOSE lines, dual bars, threat queue, relic panel, combo, embers),
// and the title / draft / victory / defeat screens. Pure drawing: all rules
// live in game.js, all geometry constants in world.js.

import { BESTIARY, BLESSINGS, RELICS, DIFFICULTIES, TOTAL_NIGHTS, realmForNight } from './data.js';
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, CELL, COLS, ROWS, cellCenterX, cellCenterY, cellKey } from './world.js';
import { mods, chainMult, lanternLit } from './game.js';
import { makeRng } from './rng.js';

export const W = 1280, H = 720;

// Click targets shared with main.js (single source of truth for hit-testing).
export const UI = {
  diffBtns: DIFFICULTIES.map((d, i) => ({ x: 320 + i * 220, y: 520, w: 200, h: 56, id: d.id })),
  draftCards: [0, 1, 2].map((i) => ({ x: 150 + i * 340, y: 196, w: 300, h: 252 })),
  rerollBtn: { x: 520, y: 486, w: 240, h: 46 },
  againBtn: { x: 470, y: 636, w: 340, h: 52 },
};

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = '"Courier New", monospace';

function txt(ctx, s, x, y, size, color, align, bold, font) {
  ctx.fillStyle = color;
  ctx.font = (bold ? 'bold ' : '') + size + 'px ' + (font || FONT);
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function panel(ctx, x, y, w, h, title, accent) {
  ctx.fillStyle = 'rgba(10,8,22,0.82)';
  ctx.strokeStyle = accent || '#4a4370';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
  if (title) txt(ctx, title, x + 12, y + 22, 14, '#e8e2ff', 'left', true);
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = color;
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 1) { ctx.beginPath(); ctx.roundRect(x, y, fw, h, 4); ctx.fill(); }
  if (label) txt(ctx, label, x + 6, y + h - 4, 12, '#0b0918', 'left', true, MONO);
}

function wrap(ctx, s, x, y, maxW, size, color, lh) {
  ctx.font = size + 'px ' + FONT;
  const words = s.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { txt(ctx, line, x, yy, size, color); line = w; yy += lh; }
    else line = test;
  }
  if (line) txt(ctx, line, x, yy, size, color);
  return yy;
}

// ---------------------------------------------------------------------------
// Procedural floor texture per realm: grain, worn stone, faint rune rings and
// a vignette — pre-rendered once to an offscreen canvas, never a flat checker.
// ---------------------------------------------------------------------------
const floorCache = new Map();
function floorTexture(realm, night) {
  const key = realm.name;
  if (floorCache.has(key)) return floorCache.get(key);
  const c = document.createElement('canvas');
  c.width = BOARD_W; c.height = BOARD_H;
  const x = c.getContext('2d');
  const rng = makeRng(night * 331 + realm.name.length * 77 + 5);
  x.fillStyle = realm.floorA; x.fillRect(0, 0, BOARD_W, BOARD_H);
  for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
    x.fillStyle = (gx + gy) % 2 ? realm.floorB : realm.floorA;
    x.globalAlpha = 0.35 + rng() * 0.3;
    x.fillRect(gx * CELL + 1, gy * CELL + 1, CELL - 2, CELL - 2);
  }
  x.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) { // stone grain
    x.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    x.fillRect(rng() * BOARD_W, rng() * BOARD_H, 1.6, 1.6);
  }
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 26; i++) { // cracks
    x.beginPath();
    let px = rng() * BOARD_W, py = rng() * BOARD_H;
    x.moveTo(px, py);
    for (let j = 0; j < 4; j++) { px += (rng() - 0.5) * 44; py += (rng() - 0.5) * 44; x.lineTo(px, py); }
    x.stroke();
  }
  x.strokeStyle = realm.trim; x.globalAlpha = 0.13; x.lineWidth = 2;
  for (let i = 0; i < 3; i++) { // worn rune rings
    x.beginPath(); x.arc(rng() * BOARD_W, rng() * BOARD_H, 40 + rng() * 70, 0, Math.PI * 2); x.stroke();
  }
  x.globalAlpha = 1;
  const grad = x.createRadialGradient(BOARD_W / 2, BOARD_H / 2, BOARD_W * 0.32, BOARD_W / 2, BOARD_H / 2, BOARD_W * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  x.fillStyle = grad; x.fillRect(0, 0, BOARD_W, BOARD_H);
  floorCache.set(key, c);
  return c;
}

function drawMotes(ctx, realm, t, area) {
  ctx.fillStyle = realm.mote;
  for (let i = 0; i < 42; i++) {
    const px = (i * 173.3 + Math.sin(t * 0.24 + i * 1.7) * 26 + t * (4 + (i % 5))) % area.w;
    const py = (i * 97.7 + Math.cos(t * 0.19 + i * 2.3) * 18) % area.h;
    ctx.globalAlpha = 0.10 + 0.10 * Math.sin(t * 1.4 + i * 2.1) ** 2;
    ctx.beginPath(); ctx.arc(area.x + px, area.y + Math.abs(py), 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Board pieces
// ---------------------------------------------------------------------------

function drawBoard(ctx, g, t) {
  const realm = realmForNight(g.night);
  ctx.drawImage(floorTexture(realm, g.night), BOARD_X, BOARD_Y);
  ctx.strokeStyle = realm.trim; ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, BOARD_W + 4, BOARD_H + 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(BOARD_X + i * CELL, BOARD_Y); ctx.lineTo(BOARD_X + i * CELL, BOARD_Y + BOARD_H); ctx.stroke(); }
  for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(BOARD_X, BOARD_Y + i * CELL); ctx.lineTo(BOARD_X + BOARD_W, BOARD_Y + i * CELL); ctx.stroke(); }

  // Sun socket on the west wall.
  const sy = cellCenterY(g.room.sun.y);
  const pulse = 1 + Math.sin(t * 3) * 0.08;
  const sg = ctx.createRadialGradient(BOARD_X - 14, sy, 2, BOARD_X - 14, sy, 34 * pulse);
  sg.addColorStop(0, '#fff7d6'); sg.addColorStop(0.4, realm.accent); sg.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(BOARD_X - 14, sy, 34 * pulse, 0, Math.PI * 2); ctx.fill();
  txt(ctx, 'DAWN', BOARD_X - 14, sy + 52, 10, realm.accent, 'center', true, MONO);

  for (const c of g.room.cells.values()) {
    const cx = cellCenterX(c.x), cy = cellCenterY(c.y);
    if (c.kind === 'wall') {
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.roundRect(cx - 24, cy - 24, 48, 48, 6); ctx.fill();
      ctx.strokeStyle = '#453d6b'; ctx.stroke();
      txt(ctx, '✦', cx, cy + 6, 16, '#5b518a', 'center');
    } else if (c.kind === 'mirror') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(160,200,255,0.16)';
      ctx.strokeStyle = '#bcd8ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(-17, -17, 34, 34, 5); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#eaf4ff'; ctx.lineWidth = 4;
      ctx.shadowColor = '#9fd0ff'; ctx.shadowBlur = 8;
      ctx.beginPath();
      if (c.ori === 0) { ctx.moveTo(cx - 13, cy + 13); ctx.lineTo(cx + 13, cy - 13); }
      else { ctx.moveTo(cx - 13, cy - 13); ctx.lineTo(cx + 13, cy + 13); }
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (c.kind === 'prism') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = 'rgba(216,180,254,0.20)';
      ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(17, 13); ctx.lineTo(-17, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(c.rot * Math.PI / 2);
      ctx.fillStyle = '#f3e8ff';
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(4.5, -2); ctx.lineTo(-4.5, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (c.kind === 'lantern') {
      const st = g.lanterns[c.id];
      const lit = lanternLit(g, c.id);
      ctx.fillStyle = '#191325';
      ctx.beginPath(); ctx.roundRect(cx - 15, cy - 18, 30, 36, 6); ctx.fill();
      ctx.strokeStyle = lit ? realm.accent : '#57506e'; ctx.lineWidth = 2; ctx.stroke();
      if (lit) {
        const lg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 44 + Math.sin(t * 5 + c.id) * 5);
        lg.addColorStop(0, 'rgba(255,240,190,0.95)');
        lg.addColorStop(0.35, 'rgba(255,205,90,0.55)');
        lg.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI * 2); ctx.fill();
        txt(ctx, '✦', cx, cy + 7, 19, '#fff3c4', 'center');
      } else {
        txt(ctx, '✧', cx, cy + 6, 15, '#6f6790', 'center');
      }
      if (st && st.dark > 0) { // gloom blob from a Gloomspitter
        ctx.fillStyle = 'rgba(88,28,135,0.55)';
        ctx.beginPath(); ctx.arc(cx, cy, 24 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.fill();
        txt(ctx, 'DARK', cx, cy - 26, 10, '#d8b4fe', 'center', true, MONO);
      }
      if (st) { // integrity ring
        ctx.strokeStyle = st.integrity > 45 ? 'rgba(125,255,176,0.8)' : 'rgba(255,110,110,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (st.integrity / mods(g).lanternMax)); ctx.stroke();
      }
    }
  }

  // The boss squats on its cell.
  if (g.boss && g.boss.hp > 0) {
    const b = g.boss;
    const bx = cellCenterX(b.cell.x), by = cellCenterY(b.cell.y);
    const pulse = 1 + Math.sin(t * 2.2) * 0.06;
    const bg = ctx.createRadialGradient(bx, by, 4, bx, by, b.def.radius * 2.1 * pulse);
    bg.addColorStop(0, 'rgba(20,8,24,0.97)');
    bg.addColorStop(0.62, 'rgba(24,10,34,0.92)');
    bg.addColorStop(1, 'rgba(80,20,60,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(bx, by, b.def.radius * 2.1 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#12081c';
    ctx.strokeStyle = b.def.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, b.def.radius * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    txt(ctx, b.kind === 'moth' ? '🦋' : '👁', bx, by + 12, b.def.radius, '#fff', 'center');
    txt(ctx, b.def.name, bx, by - b.def.radius - 14, 12, b.def.color, 'center', true, MONO);
    bar(ctx, bx - 52, by + b.def.radius + 8, 104, 9, b.hp / b.max, '#f43f5e', '');
  }
}

function drawBeam(ctx, g, t) {
  const realm = realmForNight(g.night);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1, 2]) {
    for (const seg of g.beam.segments) {
      ctx.beginPath();
      seg.pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
      if (pass === 0) { ctx.strokeStyle = 'rgba(255,190,70,0.16)'; ctx.lineWidth = 15; ctx.shadowBlur = 0; }
      if (pass === 1) { ctx.strokeStyle = realm.beam; ctx.lineWidth = 5.5; ctx.shadowColor = realm.accent; ctx.shadowBlur = 16; }
      if (pass === 2) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.shadowBlur = 0; }
      ctx.globalAlpha = pass === 1 ? 0.82 + Math.sin(t * 7) * 0.10 : 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawEnemies(ctx, g, t) {
  for (const e of g.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 14; }
    ctx.fillStyle = e.frozen > 0 ? '#a5f3fc' : e.def.color;
    ctx.strokeStyle = 'rgba(6,4,14,0.85)'; ctx.lineWidth = 2;
    const r = e.def.radius;
    if (e.type === 'moth') {
      const flap = Math.sin(t * 10 + e.t * 3) * 0.5;
      ctx.beginPath(); ctx.ellipse(-r * 0.9, -2, r * 0.85, r * 0.5, -0.6 + flap * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.9, -2, r * 0.85, r * 0.5, 0.6 - flap * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (e.type === 'prowler') {
      const a = Math.atan2(e.faceY, e.faceX);
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(r + 3, 0); ctx.lineTo(-r, -r * 0.7); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r, r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.type === 'husk') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const a = Math.atan2(e.faceY, e.faceX); // the shell faces its travel direction
      ctx.strokeStyle = '#e7e5e4'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r + 2, a - 1.1, a + 1.1); ctx.stroke();
      txt(ctx, '✕', 0, 5, 13, '#292524', 'center', true);
    } else if (e.type === 'splitter') {
      ctx.beginPath(); ctx.arc(-5, 0, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, 0, r * 0.78, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (e.type === 'spitter') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7e22ce';
      ctx.beginPath(); ctx.arc(0, 6, r * 0.5 + Math.sin(t * 5 + e.t) * 1.6, 0, Math.PI * 2); ctx.fill();
    } else { // mite
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b0918';
      ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.arc(4, -2, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (e.hp < e.max) bar(ctx, e.x - 14, e.y - e.def.radius - 11, 28, 4, e.hp / e.max, '#fda4af', '');
    if (e.type === 'husk') txt(ctx, 'SHELL', e.x, e.y + e.def.radius + 13, 8, '#d6d3d1', 'center', true, MONO);
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function drawHUD(ctx, g, t) {
  const realm = realmForNight(g.night);
  const m = mods(g);
  // Top strip.
  ctx.fillStyle = 'rgba(8,6,18,0.92)'; ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = realm.trim; ctx.fillRect(0, 58, W, 2);
  txt(ctx, '☀ LUMENKEEP', 14, 38, 24, realm.accent, 'left', true);
  txt(ctx, 'NIGHT ' + g.night + ' / ' + TOTAL_NIGHTS + ' — ' + realm.name.toUpperCase(), 300, 38, 17, '#e8e2ff', 'left', true, MONO);
  txt(ctx, 'SCORE ' + g.score.toLocaleString('en-US'), 838, 38, 19, '#ffe9a3', 'right', true, MONO);
  txt(ctx, 'CHAIN ×' + chainMult(g).toFixed(1).replace('.0', ''), 1010, 38, 17, g.chain > 1 ? '#7dffb0' : '#9a92bd', 'right', true, MONO);
  txt(ctx, '◆ ' + g.embers + ' EMBERS', 1266, 38, 17, '#ffd76a', 'right', true, MONO);

  // WIN / LOSE lines above the board.
  const litCount = g.room.lanterns.filter((_, i) => lanternLit(g, i)).length;
  const bossPart = g.boss && g.boss.hp > 0 ? ' + burn ' + g.boss.def.name.split(',')[0] : '';
  panel(ctx, BOARD_X, 68, BOARD_W, 34, null, '#3f9e6b');
  txt(ctx, 'WIN:  light all ' + g.room.lanterns.length + ' lanterns at once' + bossPart + '   (' + litCount + '/' + g.room.lanterns.length + ' lit' + (g.hold > 0 ? ' — HOLD ' + g.hold.toFixed(1) + 's' : '') + ')', BOARD_X + 12, 91, 15, '#7dffb0', 'left', true, MONO);
  const weakest = Math.round(Math.min(...g.lanterns.map((l) => l.integrity)) / m.lanternMax * 100);
  panel(ctx, BOARD_X, 106, BOARD_W, 34, null, '#c03f5f');
  txt(ctx, 'LOSE:  dawn ends (' + Math.ceil(g.dawnLeft) + 's left) or a lantern is snuffed (weakest ' + weakest + '%)', BOARD_X + 12, 129, 15, '#ff8aa5', 'left', true, MONO);

  // Left panel: dual bars, lanterns, relics, blessings.
  panel(ctx, 10, 68, 272, 300, 'THE DAWN', realm.trim);
  txt(ctx, 'DAWN — time to light every lantern', 22, 116, 12, '#c9c2e8');
  bar(ctx, 22, 124, 248, 16, g.dawnLeft / g.dawnMax, '#ffd76a', Math.ceil(g.dawnLeft) + 's');
  const shadowFrac = 1 - g.lanterns.reduce((a, l) => a + l.integrity, 0) / (m.lanternMax * g.lanterns.length);
  txt(ctx, 'SHADOW — lantern integrity lost', 22, 162, 12, '#c9c2e8');
  bar(ctx, 22, 170, 248, 16, shadowFrac, '#8a5fc0', Math.round(shadowFrac * 100) + '%');
  txt(ctx, 'LANTERNS LIT: ' + litCount + ' / ' + g.room.lanterns.length, 22, 214, 15, '#e8e2ff', 'left', true, MONO);
  g.room.lanterns.forEach((L, i) => {
    const x = 24 + i * 34, y = 240;
    ctx.fillStyle = lanternLit(g, i) ? realm.accent : '#3a3454';
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    txt(ctx, String(i + 1), x, y + 4, 11, '#14102a', 'center', true, MONO);
  });
  txt(ctx, 'SHADOWS BURNED: ' + g.stats.burned, 22, 282, 13, '#c9c2e8', 'left', false, MONO);
  txt(ctx, 'SHARDS ROTATED: ' + g.stats.rotations, 22, 304, 13, '#c9c2e8', 'left', false, MONO);
  txt(ctx, 'BEST CHAIN: ×' + (1 + m.chainGrowth * Math.max(0, g.bestChain - 1)).toFixed(1).replace('.0', ''), 22, 326, 13, '#c9c2e8', 'left', false, MONO);
  txt(ctx, 'DIFFICULTY: ' + g.difficulty.name, 22, 348, 13, '#c9c2e8', 'left', false, MONO);

  panel(ctx, 10, 376, 272, 150, 'RELICS CARRIED (' + g.relics.length + ')', realm.trim);
  if (!g.relics.length) wrap(ctx, 'None yet — fell a Great Shadow to claim one.', 22, 420, 248, 12, '#9a92bd', 16);
  g.relics.slice(0, 6).forEach((id, i) => {
    const r = RELICS.find((x) => x.id === id);
    txt(ctx, '◆ ' + (r ? r.name : id), 22, 420 + i * 17, 12.5, '#ffd76a', 'left', true);
  });
  if (g.relics.length > 6) txt(ctx, '+ ' + (g.relics.length - 6) + ' more…', 22, 420 + 6 * 17, 12, '#9a92bd');

  panel(ctx, 10, 534, 272, 176, 'BLESSINGS (' + g.blessings.length + ')', realm.trim);
  if (!g.blessings.length) wrap(ctx, 'None yet — clear a night to draft one of three.', 22, 578, 248, 12, '#9a92bd', 16);
  const counts = {};
  for (const b of g.blessings) counts[b] = (counts[b] || 0) + 1;
  Object.entries(counts).slice(0, 7).forEach(([id, n], i) => {
    const b = BLESSINGS.find((x) => x.id === id);
    txt(ctx, '✦ ' + (b ? b.name : id) + (n > 1 ? ' ×' + n : ''), 22, 578 + i * 17, 12.5, '#7dffb0');
  });

  // Right panel: threat queue + boss + controls.
  panel(ctx, 918, 68, 352, 252, 'INCOMING — THREAT QUEUE', '#c03f5f');
  const incoming = {};
  for (const id of g.spawnPlan) incoming[id] = (incoming[id] || 0) + 1;
  const active = {};
  for (const e of g.enemies) active[e.type] = (active[e.type] || 0) + 1;
  const rows = Object.keys({ ...incoming, ...active });
  if (!rows.length) txt(ctx, 'The dark holds its breath…', 930, 116, 13, '#9a92bd');
  rows.slice(0, 6).forEach((id, i) => {
    const def = BESTIARY.find((b) => b.id === id);
    const y = 116 + i * 30;
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(940, y - 4, 7, 0, Math.PI * 2); ctx.fill();
    txt(ctx, def.name, 956, y, 14, '#e8e2ff', 'left', true);
    txt(ctx, '×' + (incoming[id] || 0) + ' coming · ' + (active[id] || 0) + ' loose', 1260, y, 12.5, '#ff8aa5', 'right', false, MONO);
  });
  txt(ctx, 'They burn in the beam. Husks only from behind.', 930, 300, 12, '#9a92bd');

  panel(ctx, 918, 328, 352, 130, g.boss && g.boss.hp > 0 ? 'GREAT SHADOW' : 'THE DARK', '#c03f5f');
  if (g.boss && g.boss.hp > 0) {
    wrap(ctx, g.boss.def.name, 930, 380, 328, 14, '#ff8aa5', 18);
    bar(ctx, 930, 392, 328, 15, g.boss.hp / g.boss.max, '#f43f5e', Math.ceil(g.boss.hp) + ' / ' + g.boss.max + ' HP');
    txt(ctx, 'It blocks the beam. Burn it down — and mind the twisting shards.', 930, 434, 12, '#c9c2e8');
  } else if (g.bossQueue.length) {
    txt(ctx, 'Another Great Shadow gathers…', 930, 384, 14, '#ff8aa5', 'left', true);
  } else {
    txt(ctx, 'No Great Shadow on this night.', 930, 384, 13, '#9a92bd');
    txt(ctx, 'Bosses guard Nights 4, 7 and 10.', 930, 406, 12, '#9a92bd');
  }

  panel(ctx, 918, 466, 352, 244, 'CONTROLS', realm.trim);
  const controls = [
    'CLICK a mirror shard — flip it / or \\',
    'CLICK a prism — rotate its split',
    'Q / E — rotate the shard under the cursor',
    'Hold every lantern lit for 1.2s to win',
    'Shadows gnaw lanterns — burn them first',
    'After each night: draft 1 of 3 blessings',
    'Great Shadows drop relics. Embers reroll',
    'the draft (60) and bank as score ×5.',
  ];
  controls.forEach((s, i) => txt(ctx, s, 930, 512 + i * 22, 13, '#c9c2e8'));
}

function drawBanner(ctx, g) {
  if (!g.banner) return;
  const b = g.banner;
  const a = Math.min(1, (b.ttl - b.t) * 2, b.t * 4 + 0.2);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(8,6,18,0.78)';
  const w = Math.max(360, b.text.length * 17);
  ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, 316, w, b.sub ? 74 : 52, 10); ctx.fill();
  ctx.strokeStyle = '#ffd76a'; ctx.stroke();
  txt(ctx, b.text, W / 2, 352, 25, '#ffe9a3', 'center', true);
  if (b.sub) txt(ctx, b.sub, W / 2, 376, 13.5, '#e8e2ff', 'center');
  ctx.restore();
}

function drawFloatersParticles(ctx, g) {
  for (const p of g.particles) {
    ctx.globalAlpha = 1 - p.t / p.ttl;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of g.floaters) {
    ctx.globalAlpha = Math.min(1, (f.ttl - f.t) * 2);
    txt(ctx, f.text, f.x, f.y - f.t * 34, 15, f.color, 'center', true, MONO);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export function drawPlay(ctx, g, t) {
  const realm = realmForNight(g.night);
  ctx.fillStyle = realm.bg; ctx.fillRect(0, 0, W, H);
  drawMotes(ctx, realm, t, { x: 0, y: 0, w: W, h: H });
  if (g.room) {
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * g.shake, (Math.random() - 0.5) * 8 * g.shake);
    drawBoard(ctx, g, t);
    drawBeam(ctx, g, t);
    drawEnemies(ctx, g, t);
    ctx.restore();
    drawHUD(ctx, g, t);
  }
  drawFloatersParticles(ctx, g);
  drawBanner(ctx, g);
}

export function drawTitle(ctx, g, t) {
  const realm = realmForNight(10);
  ctx.fillStyle = '#07060e'; ctx.fillRect(0, 0, W, H);
  drawMotes(ctx, realm, t, { x: 0, y: 0, w: W, h: H });
  const tg = ctx.createRadialGradient(640, 150, 20, 640, 150, 420);
  tg.addColorStop(0, 'rgba(255,205,90,0.20)'); tg.addColorStop(1, 'rgba(255,205,90,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
  txt(ctx, '☀ LUMENKEEP ☀', W / 2, 108, 58, '#ffe9a3', 'center', true);
  txt(ctx, 'Bend dawn-light off mirror shards through 10 nights — draft 12 blessings, carry 8 relics,', W / 2, 142, 16.5, '#e8e2ff', 'center');
  txt(ctx, 'burn 3 Great Shadows and the Nightmare Moth', W / 2, 164, 16.5, '#e8e2ff', 'center');

  panel(ctx, 24, 188, 400, 300, 'HOW TO PLAY', '#c9a227');
  const how = [
    'A dawn-beam enters from the sun socket.',
    'CLICK mirror shards to flip them / ↔ \\ and',
    'CLICK prisms to rotate their split until the',
    'beam lights EVERY lantern at the same time.',
    '',
    'Shadow creatures hunt the lanterns and gnaw',
    'them dark — but they BURN inside the beam.',
    'Shielded Husks only burn from behind.',
    'Gloomspitters darken lanterns from range.',
    '',
    'Clear a night → draft 1 of 3 blessings.',
    'Fell a Great Shadow → claim a relic.',
    'WIN the run: light Night 10 and burn the',
    'Nightmare Moth. LOSE: dawn ends, or any',
    'lantern is snuffed out.',
  ];
  how.forEach((s, i) => txt(ctx, s, 38, 226 + i * 19, 13.5, '#d8d2f2'));

  panel(ctx, 856, 188, 400, 300, 'BESTIARY — KNOW YOUR SHADOWS', '#c03f5f');
  BESTIARY.forEach((b, i) => {
    const y = 224 + i * 43;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(880, y - 4, 8, 0, Math.PI * 2); ctx.fill();
    txt(ctx, b.name, 896, y, 14.5, '#ffe9a3', 'left', true);
    wrap(ctx, b.line, 896, y + 16, 348, 11.5, '#c9c2e8', 13);
  });

  panel(ctx, 448, 188, 384, 300, 'THE RUN', '#3f9e6b');
  const run = [
    '10 NIGHTS across 4 REALMS:',
    '· The Gilded Court (1–3)',
    '· The Verdigris Hollow (4–6) — boss: VEXHAR',
    '· The Violet Abyss (7–9) — boss: MORGATH',
    '· The Nightmare Court (10) — SABLE, then',
    '   THE NIGHTMARE MOTH herself',
    '',
    'Rooms are generated solution-first, then',
    'scrambled — every night CAN be lit.',
    'Bosses block the beam and twist your shards.',
    'Chain burns for combo multipliers; bank',
    'embers; chase the S-rank dawn.',
  ];
  run.forEach((s, i) => txt(ctx, s, 462, 226 + i * 19, 13.5, '#d8d2f2'));

  txt(ctx, 'CHOOSE YOUR WATCH', W / 2, 512, 15, '#9a92bd', 'center', true, MONO);
  UI.diffBtns.forEach((r, i) => {
    const d = DIFFICULTIES[i];
    ctx.fillStyle = i === 1 ? 'rgba(255,215,106,0.16)' : 'rgba(20,16,40,0.9)';
    ctx.strokeStyle = i === 1 ? '#ffd76a' : '#4a4370'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
    txt(ctx, d.name, r.x + r.w / 2, r.y + 25, 17, '#ffe9a3', 'center', true);
    txt(ctx, d.text.split('.')[0] + '.', r.x + r.w / 2, r.y + 45, 11, '#c9c2e8', 'center');
  });
  txt(ctx, '10 NIGHTS · 4 REALMS · 10 RELICS · 14 BLESSINGS · 6 SHADOW KINDS · 4 GREAT SHADOWS · 3 DIFFICULTIES', W / 2, 622, 15, '#ffd76a', 'center', true, MONO);
  txt(ctx, 'A beam-and-mirror dawn defence. Every room solvable. Every system real.', W / 2, 650, 13, '#9a92bd', 'center');
  txt(ctx, 'Click a difficulty to begin — Keeper is gentle, Nightmare is not.', W / 2, 676, 12.5, '#9a92bd', 'center');
}

export function drawDraft(ctx, g, t) {
  drawPlay(ctx, g, t);
  ctx.fillStyle = 'rgba(5,4,12,0.78)'; ctx.fillRect(0, 0, W, H);
  const realm = realmForNight(g.night + 1 > 10 ? 10 : g.night + 1);
  txt(ctx, '✦ DAWN DRAFT ✦', W / 2, 92, 40, '#ffe9a3', 'center', true);
  txt(ctx, 'Night ' + g.night + ' is lit. Score ' + g.score.toLocaleString('en-US') + ' · ◆ ' + g.embers + ' embers · Choose ONE before Night ' + (g.night + 1) + ' falls.', W / 2, 124, 16, '#e8e2ff', 'center');
  if (g.draftWasBoss) txt(ctx, 'A Great Shadow fell — one choice is a RELIC.', W / 2, 152, 14, '#ff8aa5', 'center', true, MONO);
  g.draft.forEach((choice, i) => {
    const r = UI.draftCards[i];
    const isRelic = choice.type === 'relic';
    const item = isRelic ? RELICS.find((x) => x.id === choice.id) : BLESSINGS.find((x) => x.id === choice.id);
    ctx.fillStyle = isRelic ? 'rgba(64,20,36,0.95)' : 'rgba(18,26,24,0.95)';
    ctx.strokeStyle = isRelic ? '#f43f5e' : '#3f9e6b'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.stroke();
    txt(ctx, isRelic ? '◆ RELIC ◆' : '✦ BLESSING ✦', r.x + r.w / 2, r.y + 36, 14, isRelic ? '#ff8aa5' : '#7dffb0', 'center', true, MONO);
    wrap(ctx, item.name, r.x + 22, r.y + 78, r.w - 44, 21, '#ffe9a3', 24);
    ctx.font = 'bold 21px ' + FONT;
    wrap(ctx, item.text, r.x + 22, r.y + 122, r.w - 44, 15.5, '#e8e2ff', 21);
    txt(ctx, 'Press ' + (i + 1) + ' or click', r.x + r.w / 2, r.y + r.h - 20, 12.5, '#9a92bd', 'center', false, MONO);
  });
  const rb = UI.rerollBtn;
  ctx.fillStyle = g.embers >= 60 ? 'rgba(255,215,106,0.14)' : 'rgba(30,26,50,0.9)';
  ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(rb.x, rb.y, rb.w, rb.h, 8); ctx.fill(); ctx.stroke();
  txt(ctx, 'REROLL — 60 ◆', rb.x + rb.w / 2, rb.y + 29, 15, '#ffd76a', 'center', true, MONO);
  // Current build recap.
  panel(ctx, 150, 552, 980, 118, 'YOUR KEEP SO FAR — ' + g.relics.length + ' RELICS · ' + g.blessings.length + ' BLESSINGS', realm.trim);
  const relicNames = g.relics.map((id) => RELICS.find((x) => x.id === id).name).join(' · ') || 'no relics yet';
  const blessNames = g.blessings.map((id) => BLESSINGS.find((x) => x.id === id).name).join(' · ') || 'no blessings yet';
  wrap(ctx, 'Relics: ' + relicNames, 166, 596, 948, 13.5, '#ffd76a', 17);
  wrap(ctx, 'Blessings: ' + blessNames, 166, 632, 948, 13.5, '#7dffb0', 17);
}

export function drawEnd(ctx, g, t) {
  const won = g.screen === 'victory';
  if (g.room) { drawPlay(ctx, g, t); }
  else { ctx.fillStyle = '#07060e'; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = won ? 'rgba(10,10,4,0.82)' : 'rgba(12,4,8,0.86)'; ctx.fillRect(0, 0, W, H);
  const es = g.endStats;
  if (!es) return;
  txt(ctx, won ? '☀ DAWN ETERNAL ☀' : '🌑 THE DARK PREVAILS 🌑', W / 2, 84, 42, won ? '#ffe9a3' : '#ff8aa5', 'center', true);
  if (!won && es.reason) txt(ctx, es.reason, W / 2, 114, 16, '#e8e2ff', 'center');
  // Letter rank medallion.
  ctx.save();
  ctx.translate(196, 268);
  ctx.rotate(Math.sin(t * 1.4) * 0.03);
  ctx.fillStyle = won ? 'rgba(255,215,106,0.14)' : 'rgba(244,63,94,0.12)';
  ctx.strokeStyle = won ? '#ffd76a' : '#f43f5e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 86, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  txt(ctx, es.rank, 0, 42, 96, won ? '#ffe9a3' : '#ff8aa5', 'center', true);
  ctx.restore();
  txt(ctx, 'RANK', 196, 386, 14, '#9a92bd', 'center', true, MONO);
  txt(ctx, 'FINAL SCORE', 196, 440, 14, '#9a92bd', 'center', true, MONO);
  txt(ctx, g.score.toLocaleString('en-US'), 196, 486, 40, '#ffe9a3', 'center', true, MONO);
  txt(ctx, g.difficulty.name + ' WATCH', 196, 518, 13, '#c9c2e8', 'center', false, MONO);
  // Stats table, two columns.
  panel(ctx, 330, 140, 800, 330, won ? 'THE LEDGER OF THE DAWN' : 'THE LEDGER OF THE FALL', '#c9a227');
  es.rows.forEach((row, i) => {
    const col = i % 2, rr = Math.floor(i / 2);
    const x = 356 + col * 396, y = 186 + rr * 46;
    txt(ctx, row[0], x, y, 14.5, '#9a92bd');
    txt(ctx, row[1], x + 372, y, 17, '#ffe9a3', 'right', true, MONO);
  });
  // Recap of the build.
  panel(ctx, 330, 486, 800, 118, 'RELICS & BLESSINGS CARRIED', '#3f9e6b');
  const relicNames = g.relics.map((id) => RELICS.find((x) => x.id === id).name).join(' · ') || 'none';
  const blessNames = g.blessings.map((id) => BLESSINGS.find((x) => x.id === id).name).join(' · ') || 'none';
  wrap(ctx, 'Relics: ' + relicNames, 346, 530, 768, 13.5, '#ffd76a', 17);
  wrap(ctx, 'Blessings: ' + blessNames, 346, 566, 768, 13.5, '#7dffb0', 17);
  const ab = UI.againBtn;
  ctx.fillStyle = 'rgba(255,215,106,0.15)';
  ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(ab.x, ab.y, ab.w, ab.h, 9); ctx.fill(); ctx.stroke();
  txt(ctx, won ? '☀ KEEP THE DAWN AGAIN ☀' : '↻ TRY THE NIGHT AGAIN ↻', ab.x + ab.w / 2, ab.y + 33, 17, '#ffe9a3', 'center', true);
}

export function draw(ctx, g, t) {
  if (g.screen === 'title') drawTitle(ctx, g, t);
  else if (g.screen === 'draft') drawDraft(ctx, g, t);
  else if (g.screen === 'victory' || g.screen === 'defeat') drawEnd(ctx, g, t);
  else drawPlay(ctx, g, t);
}
