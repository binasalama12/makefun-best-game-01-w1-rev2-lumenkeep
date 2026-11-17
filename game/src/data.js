// LUMENKEEP — content tables: realms, the shadow bestiary, blessings, relics,
// bosses and difficulties. Every entry here is wired to a real effect or a real
// behaviour in game.js / world.js; nothing in this file is decoration-only.

export const REALMS = [
  { name: 'The Gilded Court', nights: 'Nights 1–3', bg: '#0d0a18', floorA: '#1c1830', floorB: '#241d3a', trim: '#c9a227', accent: '#ffd76a', beam: '#ffe9a3', mote: '#ffdf8a' },
  { name: 'The Verdigris Hollow', nights: 'Nights 4–6', bg: '#06120e', floorA: '#10231a', floorB: '#173325', trim: '#3f9e6b', accent: '#7dffb0', beam: '#c9ffd9', mote: '#8affc1' },
  { name: 'The Violet Abyss', nights: 'Nights 7–9', bg: '#0e0616', floorA: '#1d1030', floorB: '#281741', trim: '#8a5fc0', accent: '#c99aff', beam: '#ecd9ff', mote: '#d3a6ff' },
  { name: 'The Nightmare Court', nights: 'Night 10', bg: '#140609', floorA: '#2a0d14', floorB: '#38121c', trim: '#c03f5f', accent: '#ff8aa5', beam: '#ffd9de', mote: '#ff9db4' },
];

export function realmForNight(night) {
  if (night <= 3) return REALMS[0];
  if (night <= 6) return REALMS[1];
  if (night <= 9) return REALMS[2];
  return REALMS[3];
}

// Six shadow kinds, six genuinely different behaviours (see game.js stepEnemy).
export const BESTIARY = [
  { id: 'mite', name: 'Umbral Mite', line: 'Walks a straight line to the nearest lantern and gnaws it.', hp: 22, speed: 26, score: 100, embers: 1, radius: 11, color: '#8f86b8' },
  { id: 'moth', name: 'Lantern Moth', line: 'Hunts lit lanterns first, fluttering side to side as it comes.', hp: 30, speed: 34, score: 150, embers: 2, radius: 12, color: '#d8b4fe' },
  { id: 'prowler', name: 'Dusk Prowler', line: 'Very fast and fragile — darts in a zigzag at dark lanterns.', hp: 16, speed: 62, score: 175, embers: 2, radius: 11, color: '#7dd3fc' },
  { id: 'husk', name: 'Shielded Husk', line: 'Armoured shell: the beam only burns it from behind.', hp: 95, speed: 17, score: 300, embers: 4, radius: 15, color: '#a8a29e' },
  { id: 'splitter', name: 'Gloom Splitter', line: 'Divides into two mites the first time it is burned down.', hp: 40, speed: 30, score: 200, embers: 3, radius: 13, color: '#86efac' },
  { id: 'spitter', name: 'Gloomspitter', line: 'Stops at range and spits gloom that darkens a lantern.', hp: 36, speed: 24, score: 250, embers: 3, radius: 13, color: '#fda4af' },
];

export const BOSS_KINDS = {
  great1: { id: 'great1', name: 'VEXHAR, GREAT SHADOW OF DUSK', hp: 620, score: 4000, embers: 40, radius: 30, color: '#5eead4' },
  great2: { id: 'great2', name: 'MORGATH, GREAT SHADOW OF GLOOM', hp: 900, score: 5000, embers: 55, radius: 32, color: '#c084fc' },
  great3: { id: 'great3', name: 'SABLE, GREAT SHADOW OF MIDNIGHT', hp: 1050, score: 6000, embers: 70, radius: 32, color: '#fda4af' },
  moth: { id: 'moth', name: 'THE NIGHTMARE MOTH, MOTHER OF GLOOM', hp: 1500, score: 9000, embers: 120, radius: 40, color: '#f43f5e' },
};

// Which boss (or boss sequence) guards each boss night.
export function bossesForNight(night) {
  if (night === 4) return ['great1'];
  if (night === 7) return ['great2'];
  if (night === 10) return ['great3', 'moth'];
  return [];
}

// Fourteen blessings. Drafted 1-of-3 after every cleared night. `stack` marks
// the ones that may be taken repeatedly; effects are applied in game.js mods().
export const BLESSINGS = [
  { id: 'firstlight', name: 'First Light', stack: true, text: '+20 seconds of dawn on every night from now on.' },
  { id: 'haste', name: 'Kindled Haste', stack: true, text: 'The beam burns shadows 35% faster.' },
  { id: 'scripture', name: 'Chain Scripture', stack: false, text: 'Chain window +2s and the chain cap rises by ×2.' },
  { id: 'aegis', name: 'Lantern Aegis', stack: false, text: 'Lanterns take half damage and slowly rekindle.' },
  { id: 'prismheart', name: 'Prism Heart', stack: false, text: 'Prisms split the beam three ways instead of two.' },
  { id: 'tithe', name: 'Ember Tithe', stack: true, text: 'Burned shadows drop 50% more embers.' },
  { id: 'sigil', name: 'Score Sigil', stack: true, text: 'All score gains +25%.' },
  { id: 'slowdusk', name: 'Slow Dusk', stack: true, text: 'Shadows move 18% slower.' },
  { id: 'sunwell', name: 'Sunwell', stack: false, text: 'The dawn timer drains 15% slower.' },
  { id: 'seconddawn', name: 'Second Dawn', stack: false, text: 'Once per run, a snuffed lantern is rekindled instead of lost.' },
  { id: 'gilded', name: 'Gilded Chain', stack: false, text: 'Your chain multiplier grows twice as fast.' },
  { id: 'hearth', name: 'Hunter’s Hearth', stack: true, text: 'The beam deals 50% more damage to Great Shadows.' },
  { id: 'widelens', name: 'Wide Lens', stack: false, text: 'The beam’s burn radius widens by 8px.' },
  { id: 'cache', name: 'Ember Cache', stack: true, text: '+150 embers, right now.' },
];

// Ten relics. Earned from Great Shadow kills and rare draft slots; passives are
// applied in game.js mods() and listed live in the HUD relic panel.
export const RELICS = [
  { id: 'sunstone', name: 'Sunstone Idol', text: '+10 seconds of dawn on every night.' },
  { id: 'thornmirror', name: 'Thorn Mirror', text: 'Mirror shards sear shadows that wander adjacent.' },
  { id: 'embercrown', name: 'Ember Crown', text: 'Every burn drops +2 bonus embers.' },
  { id: 'palebell', name: 'Pale Bell', text: 'Every 20 seconds a chime freezes all shadows for 2s.' },
  { id: 'gloomward', name: 'Gloom Ward', text: 'Gloomspitter darkening lasts half as long.' },
  { id: 'dawnchain', name: 'Dawnchain', text: 'Your chain multiplier never falls below ×2.' },
  { id: 'mothbane', name: 'Mothbane Wick', text: 'Lantern Moths take double beam damage.' },
  { id: 'sovereign', name: 'Prism Sovereign', text: 'Split beams burn 50% harder.' },
  { id: 'ironwick', name: 'Iron Wick', text: 'Lantern integrity +50.' },
  { id: 'nightglass', name: 'Nightglass Eye', text: 'Shadows spawn 12% slower and arrive announced.' },
];

export const DIFFICULTIES = [
  { id: 'keeper', name: 'KEEPER', text: 'Longer dawns, gentler shadows. Score ×1.', timeMul: 1.3, speedMul: 0.85, hpMul: 0.85, scoreMul: 1 },
  { id: 'warden', name: 'WARDEN', text: 'The intended night. Score ×1.25.', timeMul: 1, speedMul: 1, hpMul: 1, scoreMul: 1.25 },
  { id: 'nightmare', name: 'NIGHTMARE', text: 'Short dawns, hungry shadows. Score ×1.6.', timeMul: 0.82, speedMul: 1.18, hpMul: 1.3, scoreMul: 1.6 },
];

export const TOTAL_NIGHTS = 10;
export const DRAFT_REROLL_COST = 60;
