// LUMENKEEP — run state and simulation: nights, the dawn timer, shadow
// behaviour, beam burn, chains, the blessing draft, relics and scoring.
// Rendering lives in render.js; this file owns every rule the HUD reports.

import { BESTIARY, BLESSINGS, RELICS, DIFFICULTIES, TOTAL_NIGHTS, DRAFT_REROLL_COST, bossesForNight, BOSS_KINDS } from './data.js';
import { genRoom, traceBeam, cellCenterX, cellCenterY, COLS, ROWS, CELL } from './world.js';
import { makeRng, randInt, shuffle } from './rng.js';

const TYPE = Object.fromEntries(BESTIARY.map((b) => [b.id, b]));

export function createGame(seedBase) {
  return {
    screen: 'title',
    seedBase,
    difficulty: DIFFICULTIES[1],
    night: 1,
    room: null,
    beam: { segments: [], lit: new Set(), bossHits: [] },
    enemies: [],
    boss: null,
    bossQueue: [],
    bossRespawn: 0,
    lanterns: [], // per-lantern { integrity, dark }
    dawnMax: 90, dawnLeft: 90,
    hold: 0,
    spawnPlan: [], spawnTimer: 0, spawnInterval: 3,
    score: 0, embers: 40, chain: 0, chainTimer: 0, bestChain: 0,
    blessings: [], relics: [],
    draft: [], draftWasBoss: false,
    floaters: [], particles: [],
    banner: null,
    secondDawnUsed: false,
    bellTimer: 0,
    time: 0, shake: 0,
    stats: { burned: 0, bossesFelled: 0, drafts: 0, lanternsLost: 0, rotations: 0, playSeconds: 0, dawnBanked: 0, nightsCleared: 0 },
    endStats: null,
  };
}

// Derived modifiers from blessings + relics + difficulty. Every blessing and
// relic in data.js lands here as a concrete number the simulation reads.
export function mods(g) {
  const count = (id) => g.blessings.filter((b) => b === id).length;
  const has = (id) => g.blessings.includes(id);
  const relic = (id) => g.relics.includes(id);
  return {
    burnMul: Math.pow(1.35, count('haste')),
    chainWindow: has('scripture') ? 5 : 3,
    chainCap: has('scripture') ? 10 : 8,
    chainGrowth: has('gilded') ? 1.0 : 0.5,
    chainFloor: relic('dawnchain') ? 2 : 1,
    aegis: has('aegis'),
    prismHeart: has('prismheart'),
    emberMul: Math.pow(1.5, count('tithe')) * (relic('embercrown') ? 1.6 : 1),
    scoreMul: Math.pow(1.25, count('sigil')) * g.difficulty.scoreMul,
    speedMul: Math.pow(0.82, count('slowdusk')) * g.difficulty.speedMul,
    dawnDrain: has('sunwell') ? 0.85 : 1,
    bossMul: Math.pow(1.5, count('hearth')),
    burnRadius: 15 + (has('widelens') ? 8 : 0),
    splitMul: relic('sovereign') ? 1.5 : 1,
    lanternMax: 100 + (relic('ironwick') ? 50 : 0),
    spawnMul: relic('nightglass') ? 1.12 : 1,
    extraDawn: count('firstlight') * 20 + (relic('sunstone') ? 10 : 0),
  };
}

export function chainMult(g) {
  const m = mods(g);
  const raw = 1 + m.chainGrowth * Math.max(0, g.chain - 1);
  return Math.min(m.chainCap, Math.max(m.chainFloor, raw));
}

export function addScore(g, raw, x, y, label) {
  const m = mods(g);
  const pts = Math.round(raw * chainMult(g) * m.scoreMul);
  g.score += pts;
  if (x !== undefined) addFloater(g, x, y, '+' + pts.toLocaleString('en-US') + (label ? ' ' + label : ''), '#ffe9a3');
  return pts;
}

export function addFloater(g, x, y, text, color) {
  g.floaters.push({ x, y, text, color: color || '#fff', t: 0, ttl: 1.4 });
}

export function setBanner(g, text, sub, ttl) {
  g.banner = { text, sub: sub || '', t: 0, ttl: ttl || 2.4 };
}

export function burst(g, x, y, color, n, speed) {
  const rng = Math.random;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, s = (0.3 + rng() * 0.7) * (speed || 90);
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, t: 0, ttl: 0.5 + rng() * 0.6, color });
  }
}

// ---------------------------------------------------------------------------
// Run / night setup
// ---------------------------------------------------------------------------

export function startRun(g, difficulty) {
  g.difficulty = difficulty;
  g.score = 0; g.embers = 40; g.chain = 0; g.chainTimer = 0; g.bestChain = 0;
  g.blessings = []; g.relics = [];
  g.secondDawnUsed = false;
  g.stats = { burned: 0, bossesFelled: 0, drafts: 0, lanternsLost: 0, rotations: 0, playSeconds: 0, dawnBanked: 0, nightsCleared: 0 };
  startNight(g, 1);
}

export function startNight(g, night) {
  const m = mods(g);
  g.night = night;
  g.room = genRoom(g.seedBase * 1000 + night * 77 + 13, night);
  g.lanterns = g.room.lanterns.map(() => ({ integrity: m.lanternMax, dark: 0 }));
  g.enemies = [];
  g.dawnMax = Math.round((72 + night * 5) * g.difficulty.timeMul) + m.extraDawn;
  g.dawnLeft = g.dawnMax;
  g.hold = 0;
  g.chain = 0; g.chainTimer = 0;
  g.bellTimer = 0;
  // Spawn plan: the night's shadow budget, shown in the threat panel.
  const rng = makeRng(g.seedBase * 31 + night * 977);
  const pool = ['mite', 'mite', 'moth'];
  if (night >= 2) pool.push('prowler', 'moth');
  if (night >= 3) pool.push('husk');
  if (night >= 4) pool.push('splitter', 'prowler');
  if (night >= 5) pool.push('spitter');
  if (night >= 7) pool.push('husk', 'splitter', 'spitter');
  const total = 5 + night * 2;
  g.spawnPlan = [];
  for (let i = 0; i < total; i++) g.spawnPlan.push(pool[Math.floor(rng() * pool.length)]);
  g.spawnInterval = Math.max(1.5, 3.4 - night * 0.16) * m.spawnMul;
  g.spawnTimer = 1.2;
  // Boss setup.
  const kinds = bossesForNight(night);
  g.bossQueue = kinds.slice(1);
  g.boss = null; g.bossRespawn = 0;
  if (kinds.length && g.room.bossCell) {
    g.boss = makeBoss(kinds[0], g.room.bossCell);
    setBanner(g, 'A GREAT SHADOW STIRS', g.boss.def.name, 3);
  } else {
    setBanner(g, 'NIGHT ' + night, 'Light every lantern at once', 2.2);
  }
  g.screen = 'play';
  refreshBeam(g);
}

function makeBoss(kindId, cell) {
  const def = BOSS_KINDS[kindId];
  return { kind: kindId, def, hp: def.hp, max: def.hp, cell: { x: cell.x, y: cell.y }, stir: 5, t: 0 };
}

export function refreshBeam(g) {
  if (!g.room) return;
  g.beam = traceBeam(g.room.cells, g.room.sun, g.boss && g.boss.hp > 0 ? g.boss.cell : null, mods(g));
}

export function lanternLit(g, idx) {
  return g.beam.lit.has(idx) && g.lanterns[idx].dark <= 0 && g.lanterns[idx].integrity > 0;
}

export function allLit(g) {
  if (!g.room || !g.room.lanterns.length) return false;
  for (let i = 0; i < g.room.lanterns.length; i++) if (!lanternLit(g, i)) return false;
  if (g.boss && g.boss.hp > 0) return false;
  if (g.bossQueue.length || g.bossRespawn > 0) return false; // a Great Shadow is still coming
  return true;
}

// ---------------------------------------------------------------------------
// Player action
// ---------------------------------------------------------------------------

export function rotateCell(g, x, y, dirSign) {
  if (!g.room) return false;
  const c = g.room.cells.get(x + ',' + y);
  if (!c) return false;
  if (c.kind === 'mirror') { c.ori ^= 1; }
  else if (c.kind === 'prism') { c.rot = (c.rot + (dirSign >= 0 ? 1 : 3)) % 4; }
  else return false;
  g.stats.rotations++;
  refreshBeam(g);
  return true;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

function rollDraft(g, wasBoss) {
  const rng = makeRng((g.seedBase * 7919 + g.night * 131 + g.stats.drafts * 17 + Math.floor(g.score)) >>> 0);
  const choices = [];
  if (wasBoss) {
    const unowned = RELICS.filter((r) => !g.relics.includes(r.id));
    if (unowned.length) choices.push({ type: 'relic', id: unowned[Math.floor(rng() * unowned.length)].id });
  }
  const pool = shuffle(rng, BLESSINGS.filter((b) => b.stack || !g.blessings.includes(b.id)));
  for (const b of pool) {
    if (choices.length >= 3) break;
    choices.push({ type: 'blessing', id: b.id });
  }
  return choices;
}

export function openDraft(g) {
  g.draftWasBoss = bossesForNight(g.night).length > 0;
  g.draft = rollDraft(g, g.draftWasBoss);
  g.screen = 'draft';
  setBanner(g, 'THE NIGHT IS LIT', 'Choose one blessing before the next dusk', 2.6);
}

export function rerollDraft(g) {
  if (g.embers < DRAFT_REROLL_COST) return false;
  g.embers -= DRAFT_REROLL_COST;
  g.draft = rollDraft(g, g.draftWasBoss);
  return true;
}

export function pickDraft(g, idx) {
  const choice = g.draft[idx];
  if (!choice) return;
  if (choice.type === 'relic') {
    g.relics.push(choice.id);
    const r = RELICS.find((x) => x.id === choice.id);
    setBanner(g, 'RELIC CLAIMED', r.name + ' — ' + r.text, 2.6);
  } else {
    g.blessings.push(choice.id);
    if (choice.id === 'cache') g.embers += 150;
    const b = BLESSINGS.find((x) => x.id === choice.id);
    setBanner(g, 'BLESSING TAKEN', b.name + ' — ' + b.text, 2.6);
  }
  g.stats.drafts++;
  g.draft = [];
  startNight(g, g.night + 1);
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

function spawnEnemy(g, typeId, x, y, noSplit) {
  const def = TYPE[typeId];
  const rng = Math.random;
  if (x === undefined) {
    const edge = rng();
    if (edge < 0.55) { x = cellCenterX(COLS - 1) + 40; y = cellCenterY(randInt(Math.random, 0, ROWS - 1)); }
    else if (edge < 0.8) { x = cellCenterX(randInt(Math.random, 3, COLS - 1)); y = cellCenterY(0) - 36; }
    else { x = cellCenterX(randInt(Math.random, 3, COLS - 1)); y = cellCenterY(ROWS - 1) + 36; }
  }
  g.enemies.push({
    type: typeId, def, x, y,
    hp: def.hp * g.difficulty.hpMul, max: def.hp * g.difficulty.hpMul,
    t: rng() * 10, frozen: 0, spitTimer: 1 + rng() * 1.5, noSplit: !!noSplit,
    faceX: -1, faceY: 0, flash: 0,
  });
}

function targetLantern(g, e) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.room.lanterns.length; i++) {
    const L = g.room.lanterns[i];
    if (g.lanterns[i].integrity <= 0) continue;
    const lx = cellCenterX(L.x), ly = cellCenterY(L.y);
    let d = (lx - e.x) ** 2 + (ly - e.y) ** 2;
    if (e.type === 'moth' && lanternLit(g, i)) d *= 0.25; // moths hunt lit lanterns
    if (e.type === 'prowler' && !lanternLit(g, i)) d *= 0.5; // prowlers hunt dark ones
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return { d: Math.hypot(px - cx, py - cy), dirX: dx, dirY: dy };
}

function killEnemy(g, e) {
  const m = mods(g);
  g.chain = g.chainTimer > 0 ? g.chain + 1 : 1;
  g.chainTimer = m.chainWindow;
  g.bestChain = Math.max(g.bestChain, g.chain);
  addScore(g, e.def.score, e.x, e.y - 14);
  const embers = Math.round(e.def.embers * m.emberMul);
  g.embers += embers;
  g.stats.burned++;
  burst(g, e.x, e.y, e.def.color, 16, 120);
  if (g.chain === 5 || g.chain === 8 || g.chain === 12) setBanner(g, 'CHAIN ×' + chainMult(g).toFixed(1).replace('.0', ''), g.chain + ' shadows burned in a row', 1.6);
  if (e.type === 'splitter' && !e.noSplit) {
    spawnEnemy(g, 'mite', e.x - 14, e.y, true);
    spawnEnemy(g, 'mite', e.x + 14, e.y, true);
    addFloater(g, e.x, e.y - 30, 'IT DIVIDES!', '#86efac');
  }
}

function snuffLantern(g, idx) {
  const m = mods(g);
  if (!g.secondDawnUsed && g.blessings.includes('seconddawn')) {
    g.secondDawnUsed = true;
    g.lanterns[idx].integrity = m.lanternMax * 0.6;
    setBanner(g, 'SECOND DAWN!', 'The snuffed lantern is rekindled', 2.4);
    return;
  }
  g.stats.lanternsLost++;
  finishRun(g, false, 'A lantern was snuffed out on Night ' + g.night + '.');
}

// ---------------------------------------------------------------------------
// End of run
// ---------------------------------------------------------------------------

export function finishRun(g, won, reason) {
  g.stats.nightsCleared = won ? TOTAL_NIGHTS : g.night - 1;
  if (won) g.score += g.embers * 5; // banked embers convert to score
  const s = g.stats;
  const rows = [
    ['Final score', g.score.toLocaleString('en-US')],
    ['Nights cleared', s.nightsCleared + ' / ' + TOTAL_NIGHTS],
    ['Shadows burned', String(s.burned)],
    ['Best chain', '×' + chainMultPeak(g)],
    ['Great Shadows felled', String(s.bossesFelled)],
    ['Lanterns lost', String(s.lanternsLost)],
    ['Blessings drafted', String(s.drafts)],
    ['Relics carried', String(g.relics.length)],
    ['Embers banked', String(g.embers)],
    ['Shards rotated', String(s.rotations)],
    ['Dawn banked (s)', String(Math.round(s.dawnBanked))],
    ['Time in the dark', Math.floor(s.playSeconds / 60) + 'm ' + Math.floor(s.playSeconds % 60) + 's'],
  ];
  let rank = 'C';
  if (won) rank = g.score >= 60000 ? 'S' : g.score >= 45000 ? 'A' : g.score >= 30000 ? 'B' : 'C';
  else rank = g.score >= 30000 ? 'B' : 'C';
  g.endStats = { won, reason: reason || '', rank, rows };
  g.screen = won ? 'victory' : 'defeat';
}

function chainMultPeak(g) {
  const m = mods(g);
  const raw = 1 + m.chainGrowth * Math.max(0, g.bestChain - 1);
  return Math.min(m.chainCap, Math.max(m.chainFloor, raw)).toFixed(1).replace('.0', '');
}

// ---------------------------------------------------------------------------
// Per-frame update (play screen only)
// ---------------------------------------------------------------------------

export function update(g, dt) {
  g.time += dt;
  // Floaters, particles and banners always age.
  for (const f of g.floaters) f.t += dt;
  g.floaters = g.floaters.filter((f) => f.t < f.ttl);
  for (const p of g.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
  g.particles = g.particles.filter((p) => p.t < p.ttl);
  if (g.banner) { g.banner.t += dt; if (g.banner.t > g.banner.ttl) g.banner = null; }
  if (g.screen !== 'play') return;

  const m = mods(g);
  g.stats.playSeconds += dt;
  refreshBeam(g);

  // Dawn drains.
  g.dawnLeft -= dt * m.dawnDrain;
  if (g.dawnLeft <= 0) {
    g.dawnLeft = 0;
    if (!allLit(g)) { finishRun(g, false, 'The dawn ran out on Night ' + g.night + '.'); return; }
  }

  // Chain decay.
  if (g.chainTimer > 0) { g.chainTimer -= dt; if (g.chainTimer <= 0) g.chain = 0; }

  // Pale Bell relic.
  if (g.relics.includes('palebell')) {
    g.bellTimer += dt;
    if (g.bellTimer >= 20) {
      g.bellTimer = 0;
      for (const e of g.enemies) e.frozen = 2;
      setBanner(g, 'THE PALE BELL TOLLS', 'All shadows freeze for 2 seconds', 1.8);
    }
  }

  // Spawning.
  if (g.spawnPlan.length && g.enemies.length < 14) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      g.spawnTimer = g.spawnInterval;
      spawnEnemy(g, g.spawnPlan.shift());
    }
  }

  // Boss: beam damage, shard-scramble stir, respawn of the next Great Shadow.
  if (g.bossRespawn > 0) {
    g.bossRespawn -= dt;
    if (g.bossRespawn <= 0 && g.bossQueue.length) {
      g.boss = makeBoss(g.bossQueue.shift(), g.room.bossCell);
      setBanner(g, 'THE FINAL SHADOW DESCENDS', g.boss.def.name, 3);
      refreshBeam(g);
    }
  }
  if (g.boss && g.boss.hp > 0) {
    const b = g.boss;
    b.t += dt;
    if (g.beam.bossHits.length) {
      b.hp -= 26 * m.burnMul * m.bossMul * dt;
      const bx = cellCenterX(b.cell.x), by = cellCenterY(b.cell.y);
      if (Math.random() < dt * 18) burst(g, bx + (Math.random() - 0.5) * 40, by + (Math.random() - 0.5) * 40, b.def.color, 2, 70);
      if (b.hp <= 0) {
        b.hp = 0;
        addScore(g, b.def.score, bx, by - 30, 'GREAT SHADOW FELLED');
        g.embers += Math.round(b.def.embers * m.emberMul);
        g.stats.bossesFelled++;
        burst(g, bx, by, '#ffffff', 46, 200);
        burst(g, bx, by, b.def.color, 40, 150);
        setBanner(g, 'GREAT SHADOW FELLED', b.def.name, 2.8);
        g.shake = 0.5;
        if (g.bossQueue.length) g.bossRespawn = 1.4;
        g.boss = null;
        refreshBeam(g);
      }
    }
    if (g.boss) {
      g.boss.stir -= dt;
      if (g.boss.stir <= 0) {
        g.boss.stir = 7;
        const shards = [...g.room.cells.values()].filter((c) => c.kind === 'mirror' && c.solutionOri !== undefined);
        if (shards.length) {
          const s = shards[Math.floor(Math.random() * shards.length)];
          s.ori ^= 1;
          refreshBeam(g);
          setBanner(g, 'THE SHADOW STIRS', 'A mirror shard twists in the dark!', 1.8);
          addFloater(g, cellCenterX(s.x), cellCenterY(s.y) - 20, 'TWISTED!', '#fda4af');
        }
      }
    }
  }

  // Enemies.
  const dead = [];
  for (const e of g.enemies) {
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.frozen > 0) { e.frozen -= dt; continue; }
    const ti = targetLantern(g, e);
    if (ti < 0) continue;
    const L = g.room.lanterns[ti];
    const lx = cellCenterX(L.x), ly = cellCenterY(L.y);
    const dx = lx - e.x, dy = ly - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    let vx = dx / dist, vy = dy / dist;
    if (e.type === 'moth') { const w = Math.sin(e.t * 6) * 0.55; const px = -vy, py = vx; vx += px * w; vy += py * w; }
    if (e.type === 'prowler') { const w = Math.sin(e.t * 9) * 0.8; const px = -vy, py = vx; vx += px * w; vy += py * w; }
    const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    e.faceX = vx; e.faceY = vy;
    const spitting = e.type === 'spitter' && dist < CELL * 2.6;
    if (dist > 24 && !spitting) {
      e.x += vx * e.def.speed * m.speedMul * dt;
      e.y += vy * e.def.speed * m.speedMul * dt;
    }
    if (spitting) {
      e.spitTimer -= dt;
      if (e.spitTimer <= 0) {
        e.spitTimer = 2.2;
        g.lanterns[ti].dark = g.relics.includes('gloomward') ? 2 : 4;
        addFloater(g, lx, ly - 26, 'DARKENED!', '#fda4af');
        refreshBeam(g);
      }
    }
    if (dist <= 30) {
      const drain = (m.aegis ? 7 : 14) * dt;
      g.lanterns[ti].integrity -= drain;
      if (g.lanterns[ti].integrity <= 0) { g.lanterns[ti].integrity = 0; snuffLantern(g, ti); if (g.screen !== 'play') return; }
    }
    // Beam burn.
    let dps = 0;
    for (const seg of g.beam.segments) {
      for (let i = 0; i + 1 < seg.pts.length; i++) {
        const [x1, y1] = seg.pts[i], [x2, y2] = seg.pts[i + 1];
        const r = distToSeg(e.x, e.y, x1, y1, x2, y2);
        if (r.d < m.burnRadius + e.def.radius) {
          if (e.type === 'husk') {
            const sl = Math.hypot(r.dirX, r.dirY) || 1;
            const dot = (r.dirX / sl) * e.faceX + (r.dirY / sl) * e.faceY;
            if (dot < 0.3) continue; // shell turns the beam: only back hits burn
          }
          dps += 30 * (seg.split ? m.splitMul : 1);
          break;
        }
      }
      if (dps > 0) break;
    }
    // Thorn Mirror relic aura.
    if (dps === 0 && g.relics.includes('thornmirror')) {
      for (const c of g.room.cells.values()) {
        if (c.kind !== 'mirror') continue;
        if (Math.abs(cellCenterX(c.x) - e.x) < CELL && Math.abs(cellCenterY(c.y) - e.y) < CELL) { dps += 6; break; }
      }
    }
    if (e.type === 'moth' && g.relics.includes('mothbane')) dps *= 2;
    if (dps > 0) {
      e.hp -= dps * m.burnMul * dt;
      e.flash = 0.08;
      if (Math.random() < dt * 10) burst(g, e.x, e.y, '#ffd76a', 1, 50);
      if (e.hp <= 0) dead.push(e);
    }
  }
  for (const e of dead) {
    g.enemies.splice(g.enemies.indexOf(e), 1);
    killEnemy(g, e);
  }

  // Lantern dark timers + aegis rekindle.
  for (const l of g.lanterns) {
    if (l.dark > 0) l.dark -= dt;
    if (m.aegis && l.integrity > 0 && l.integrity < m.lanternMax) l.integrity = Math.min(m.lanternMax, l.integrity + 2 * dt);
  }

  // Win hold: every lantern lit at once (and the boss burned away).
  if (allLit(g)) {
    g.hold += dt;
    if (g.hold >= 1.2) {
      const timeBonus = Math.round(g.dawnLeft * 15);
      const integ = Math.round(g.lanterns.reduce((a, l) => a + l.integrity, 0));
      g.score += Math.round((1200 + timeBonus + integ) * m.scoreMul);
      g.embers += 10 + g.night * 2;
      g.stats.dawnBanked += g.dawnLeft;
      g.stats.nightsCleared = g.night;
      setBanner(g, 'NIGHT ' + g.night + ' LIT', '+' + (1200 + timeBonus + integ).toLocaleString('en-US') + ' dawn bonus', 2.4);
      if (g.night >= TOTAL_NIGHTS) { finishRun(g, true, ''); return; }
      openDraft(g);
      return;
    }
  } else g.hold = 0;

  if (g.shake > 0) g.shake -= dt;
}
