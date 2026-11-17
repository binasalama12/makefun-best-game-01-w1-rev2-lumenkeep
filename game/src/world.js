// LUMENKEEP — the room: grid geometry, solution-first room generation and the
// beam tracer. Rooms are built by walking a real solution path from the sun
// socket (mirrors on the turns, prisms on the branches, lanterns at the ends),
// then scrambling the shard orientations — so every room is provably solvable.

import { makeRng, randInt } from './rng.js';
import { bossesForNight } from './data.js';

export const COLS = 11;
export const ROWS = 8;
export const CELL = 56;
export const BOARD_X = 292;
export const BOARD_Y = 148;
export const BOARD_W = COLS * CELL;
export const BOARD_H = ROWS * CELL;

// Directions: 0 east, 1 south, 2 west, 3 north.
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export function cellKey(x, y) { return x + ',' + y; }
export function cellCenterX(x) { return BOARD_X + x * CELL + CELL / 2; }
export function cellCenterY(y) { return BOARD_Y + y * CELL + CELL / 2; }
export function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

// Mirror reflection. A shard is either '/' (ori 0) or '\' (ori 1); rotating the
// shard flips between the two, which is a 90° turn of the mirror line.
export function reflect(dir, ori) {
  return ori === 0 ? 3 - dir : dir ^ 1;
}
export function mirrorOriForTurn(inDir, outDir) {
  if (3 - inDir === outDir) return 0;
  if ((inDir ^ 1) === outDir) return 1;
  return -1;
}

// ---------------------------------------------------------------------------
// Room generation (solution-first, then scrambled)
// ---------------------------------------------------------------------------

function tryBuildRoom(rng, night) {
  const cells = new Map();
  const occupied = new Set();
  const sunRow = randInt(rng, 1, ROWS - 2);
  const sun = { x: -1, y: sunRow, dir: 0 };
  let cx = 0, cy = sunRow, dir = 0;
  occupied.add(cellKey(cx, cy));
  const pathCells = [{ x: cx, y: cy, dir }];
  const turns = night <= 2 ? 2 : 3;

  // Walk the main path: straight segments joined by mirror turns.
  for (let s = 0; s <= turns; s++) {
    const last = s === turns;
    const len = last ? randInt(rng, 2, 3) : randInt(rng, 2, 4);
    for (let i = 0; i < len; i++) {
      const nx = cx + DX[dir], ny = cy + DY[dir];
      if (!inBounds(nx, ny) || occupied.has(cellKey(nx, ny))) return null;
      cx = nx; cy = ny;
      occupied.add(cellKey(cx, cy));
      pathCells.push({ x: cx, y: cy, dir });
    }
    if (last) break;
    // Choose a perpendicular direction that leaves room to keep walking.
    const options = [ (dir + 1) % 4, (dir + 3) % 4 ].filter((nd) => {
      const tx = cx + DX[nd] * 2, ty = cy + DY[nd] * 2;
      return inBounds(tx, ty) && !occupied.has(cellKey(cx + DX[nd], cy + DY[nd])) && !occupied.has(cellKey(tx, ty));
    });
    if (!options.length) return null;
    const nd = options[Math.floor(rng() * options.length)];
    const ori = mirrorOriForTurn(dir, nd);
    if (ori < 0) return null;
    cells.set(cellKey(cx, cy), { kind: 'mirror', x: cx, y: cy, ori, solutionOri: ori });
    dir = nd;
    const here = pathCells[pathCells.length - 1];
    here.dir = dir;
  }

  // The main lantern crowns the end of the path.
  const lanterns = [];
  const mainLantern = { kind: 'lantern', x: cx, y: cy, id: 0 };
  cells.set(cellKey(cx, cy), mainLantern);
  lanterns.push(mainLantern);

  // Boss nights: a Great Shadow squats on the main path, two cells before the
  // main lantern, and the beam cannot pass until it has burned away.
  let bossCell = null;
  if (bossesForNight(night).length) {
    const back2 = pathCells[pathCells.length - 3];
    const back1 = pathCells[pathCells.length - 2];
    const cand = back2 && !cells.has(cellKey(back2.x, back2.y)) ? back2
      : back1 && !cells.has(cellKey(back1.x, back1.y)) ? back1 : null;
    if (!cand) return null;
    bossCell = { x: cand.x, y: cand.y };
  }

  // Branch lanterns: prisms on plain path cells split the beam sideways.
  const wantLanterns = night <= 2 ? 2 : night <= 6 ? 3 : 4;
  const plain = pathCells.filter((p) => !cells.has(cellKey(p.x, p.y)) && !(bossCell && p.x === bossCell.x && p.y === bossCell.y));
  let guard = 0;
  while (lanterns.length < wantLanterns && guard++ < 24 && plain.length) {
    const at = plain.splice(Math.floor(rng() * plain.length), 1)[0];
    const mainDir = at.dir;
    const branchDirs = [ (mainDir + 1) % 4, (mainDir + 3) % 4 ];
    let placed = false;
    for (const bd of branchDirs) {
      const len = randInt(rng, 2, 3);
      let bx = at.x, by = at.y, ok = true;
      const branchCells = [];
      for (let i = 0; i < len; i++) {
        bx += DX[bd]; by += DY[bd];
        if (!inBounds(bx, by) || occupied.has(cellKey(bx, by))) { ok = false; break; }
        branchCells.push({ x: bx, y: by });
      }
      if (!ok) continue;
      // Prism outputs (with rot 0) are "straight on" and "left of travel", so a
      // branch to the left is free; a branch to the right is served by facing
      // the prism along the branch and letting its left output continue the path.
      const rot = bd === (mainDir + 3) % 4 ? 0 : 1;
      cells.set(cellKey(at.x, at.y), { kind: 'prism', x: at.x, y: at.y, rot, solutionRot: rot });
      for (const bc of branchCells) occupied.add(cellKey(bc.x, bc.y));
      const end = branchCells[branchCells.length - 1];
      const lan = { kind: 'lantern', x: end.x, y: end.y, id: lanterns.length };
      cells.set(cellKey(end.x, end.y), lan);
      lanterns.push(lan);
      placed = true;
      break;
    }
    if (!placed) continue;
  }
  if (lanterns.length < 2) return null;

  // Walls creep in from night 5 — set dressing on cells the solution never uses.
  if (night >= 5) {
    let walls = randInt(rng, 2, 4);
    while (walls-- > 0) {
      const wx = randInt(rng, 0, COLS - 1), wy = randInt(rng, 0, ROWS - 1);
      if (occupied.has(cellKey(wx, wy)) || cells.has(cellKey(wx, wy))) continue;
      cells.set(cellKey(wx, wy), { kind: 'wall', x: wx, y: wy });
      occupied.add(cellKey(wx, wy));
    }
  }

  // Decoy shards: extra rotatable mirrors off the solution path.
  let decoys = night <= 2 ? 1 : 2;
  while (decoys-- > 0) {
    const dx = randInt(rng, 0, COLS - 1), dy = randInt(rng, 0, ROWS - 1);
    if (occupied.has(cellKey(dx, dy)) || cells.has(cellKey(dx, dy))) continue;
    cells.set(cellKey(dx, dy), { kind: 'mirror', x: dx, y: dy, ori: randInt(rng, 0, 1), decoy: true });
    occupied.add(cellKey(dx, dy));
  }

  return { cells, sun, lanterns, bossCell };
}

export function genRoom(seed, night) {
  const rng = makeRng(seed);
  let room = null;
  for (let attempt = 0; attempt < 80 && !room; attempt++) room = tryBuildRoom(rng, night);
  if (!room) { // Extremely defensive fallback: a straight corridor room.
    const cells = new Map();
    const sun = { x: -1, y: 3, dir: 0 };
    cells.set(cellKey(10, 3), { kind: 'lantern', x: 10, y: 3, id: 0 });
    cells.set(cellKey(5, 3), { kind: 'prism', x: 5, y: 3, rot: 0, solutionRot: 0 });
    cells.set(cellKey(5, 1), { kind: 'lantern', x: 5, y: 1, id: 1 });
    room = { cells, sun, lanterns: [cells.get(cellKey(10, 3)), cells.get(cellKey(5, 1))], bossCell: null };
  }
  // Scramble: flip most mirrors and spin most prisms away from the solution.
  const srng = makeRng(seed ^ 0x9e3779b9);
  for (const c of room.cells.values()) {
    if (c.kind === 'mirror' && !c.decoy && srng() < 0.8) c.ori = c.solutionOri ^ 1;
    if (c.kind === 'prism' && srng() < 0.85) c.rot = (c.solutionRot + randInt(srng, 1, 3)) % 4;
  }
  // Never hand over a room that starts already solved.
  const trace = traceBeam(room.cells, room.sun, null, {});
  if (trace.lit.size >= room.lanterns.length) {
    for (const c of room.cells.values()) {
      if (c.kind === 'mirror' && !c.decoy) { c.ori ^= 1; break; }
    }
  }
  return room;
}

// Restore the exact solution orientation of every shard (used by shot scenes
// and by nothing in live play — the player earns the dawn by hand).
export function solveRoom(room) {
  for (const c of room.cells.values()) {
    if (c.kind === 'mirror' && c.solutionOri !== undefined) c.ori = c.solutionOri;
    if (c.kind === 'prism' && c.solutionRot !== undefined) c.rot = c.solutionRot;
  }
}

// ---------------------------------------------------------------------------
// Beam tracing
// ---------------------------------------------------------------------------
// Returns { segments, lit, bossHits } where segments are pixel-space polylines
// {pts:[[x,y],...], split:boolean}, lit is a Set of lantern ids the beam
// currently reaches, and bossHits lists {dir} for each ray that struck the boss.
export function traceBeam(cells, sun, bossCell, mods) {
  const segments = [];
  const lit = new Set();
  const bossHits = [];
  const startX = BOARD_X - 6;
  const startY = cellCenterY(sun.y);
  const queue = [{ x: sun.x + 1, y: sun.y, dir: sun.dir, px: startX, py: startY, split: false }];
  let rays = 0;
  while (queue.length && rays < 28) {
    const ray = queue.shift();
    rays++;
    let { x, y, dir } = ray;
    const pts = [[ray.px, ray.py]];
    let steps = 0;
    let alive = true;
    while (alive && steps++ < 220) {
      if (!inBounds(x, y)) break;
      pts.push([cellCenterX(x), cellCenterY(y)]);
      if (bossCell && bossCell.x === x && bossCell.y === y) {
        bossHits.push({ dir });
        break;
      }
      const c = cells.get(cellKey(x, y));
      if (!c) {
        x += DX[dir]; y += DY[dir];
        continue;
      }
      if (c.kind === 'lantern') { lit.add(c.id); break; }
      if (c.kind === 'wall') break;
      if (c.kind === 'mirror') {
        dir = reflect(dir, c.ori);
        x += DX[dir]; y += DY[dir];
        continue;
      }
      if (c.kind === 'prism') {
        const outs = [(dir + c.rot) % 4, (dir + c.rot + 3) % 4];
        if (mods.prismHeart) outs.push((dir + c.rot + 1) % 4);
        for (const od of outs) {
          queue.push({ x: x + DX[od], y: y + DY[od], dir: od, px: cellCenterX(x), py: cellCenterY(y), split: true });
        }
        break;
      }
      x += DX[dir]; y += DY[dir];
    }
    // Extend the final point half a cell past the last centre so the beam
    // visually reaches walls, lanterns and the board edge.
    if (pts.length > 1) {
      const [lx, ly] = pts[pts.length - 1];
      pts.push([lx + DX[dir] * CELL * 0.55, ly + DY[dir] * CELL * 0.55]);
    }
    segments.push({ pts, split: ray.split });
  }
  return { segments, lit, bossHits };
}
