[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/binasalama12/makefun-best-game-01-w1-rev2-lumenkeep/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/binasalama12/makefun-best-game-01-w1-rev2-lumenkeep/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# LUMENKEEP

**LUMENKEEP: bend dawn-light off mirror shards through 10 nights — draft 12 blessings, carry 8 relics, burn 3 Great Shadows and the Nightmare Moth**

A dawn-beam enters a dark room from a sun socket. You rotate **mirror shards** and **prism crystals** to bend and split the beam until **every lantern in the room is lit at the same time** — while shadow creatures pour in to gnaw the lanterns dark. They burn inside the beam. You are racing the dawn itself.

## The run

- **10 nights across 4 realms** — The Gilded Court (1–3), The Verdigris Hollow (4–6), The Violet Abyss (7–9), The Nightmare Court (10) — each with its own palette, procedurally textured stone floor (grain, cracks, worn rune rings, vignette) and drifting motes.
- **Bosses on Nights 4, 7 and 10.** VEXHAR, Great Shadow of Dusk; MORGATH, Great Shadow of Gloom; and on Night 10, SABLE, Great Shadow of Midnight — followed by the final boss, **THE NIGHTMARE MOTH, MOTHER OF GLOOM**. A Great Shadow squats on the beam path and blocks it: burn it down to let the light through, and beware — every few seconds it **twists one of your mirror shards** out of alignment.
- **Rooms are generated solution-first, then scrambled.** The generator walks a real solution (mirrors on the turns, prisms on the branches, lanterns at the ends) and then flips the shards — so every room is provably solvable, never a dead board.
- **3 difficulties** — Keeper, Warden, Nightmare — scaling dawn length, shadow speed and toughness, and the score multiplier.

## Bestiary — 6 shadow kinds, 6 behaviours

| Shadow | Behaviour |
|---|---|
| Umbral Mite | Walks a straight line to the nearest lantern and gnaws it. |
| Lantern Moth | Hunts *lit* lanterns first, fluttering side to side as it comes. |
| Dusk Prowler | Very fast and fragile — darts in a zigzag at dark lanterns. |
| Shielded Husk | Armoured shell: the beam only burns it **from behind**. |
| Gloom Splitter | Divides into two mites the first time it is burned down. |
| Gloomspitter | Stops at range and spits gloom that **darkens** a lantern, beam or no beam. |

## Systems

- **Blessing draft.** After every cleared night you choose **1 of 3 blessings** from a pool of **14 named blessings** with real effects: First Light (+20s dawn), Kindled Haste (+35% burn), Prism Heart (prisms split three ways), Lantern Aegis (lanterns toughen and rekindle), Second Dawn (a snuffed lantern is rekindled once per run), Gilded Chain (combo grows twice as fast), Ember Cache (+150 embers), and more. Drafts can be **rerolled for 60 embers**.
- **Relics.** **10 named relics** with real passives — Sunstone Idol, Thorn Mirror, Ember Crown, Pale Bell, Gloom Ward, Dawnchain, Mothbane Wick, Prism Sovereign, Iron Wick, Nightglass Eye — earned from Great Shadow kills and rare draft slots after boss nights. Your active relics and blessings are listed live in the HUD side panels.
- **HUD during action.** Explicit **WIN** and **LOSE** lines, lantern count and per-lantern pips, **dawn / shadow dual bars**, score, **chain/combo multiplier**, **embers** currency, an **incoming/threat panel** (shadow types with incoming and loose counts), a Great Shadow panel with boss HP, relic and blessing panels, and a controls strip.
- **Juice.** Floating score numbers, event banners (`CHAIN ×4`, `GREAT SHADOW FELLED`, `THE SHADOW STIRS`), burn particles, a glow-layered beam, boss death bursts and screen shake.
- **Scoring.** Kills feed a chain multiplier (up to ×8, ×10 with Chain Scripture); night clears pay a dawn-time and lantern-integrity bonus; Great Shadows pay 4,000–9,000; leftover embers bank at ×5 on victory. A full winning run scores **five figures** and earns a letter rank — **S / A / B / C** — on a victory screen with a 12-line run ledger and a full relic/blessing recap.

## Controls

- **Click a mirror shard** — flip it between `/` and `\`.
- **Click a prism** — rotate its split (right-click rotates the other way).
- **Q / E** — rotate the shard under the cursor.
- **1 / 2 / 3** — pick a draft card. Click works everywhere too.
- Hold **every lantern lit for 1.2 seconds** to clear the night. Lose the run if the dawn timer ends or any lantern is snuffed out.

## Screens

1. `screenshots/1-cover.jpg` — the Night 10 final boss fight at peak density: beam web lit, the Nightmare Moth on screen, six shadow kinds loose, full HUD with WIN/LOSE lines, relic panel, threat queue, combo banner and floating score numbers.
2. `screenshots/2-meta.jpg` — the blessing draft after the Night 7 boss: three real choices (one a relic) over the live board, with the current relic/blessing build recap.
3. `screenshots/3-title.jpg` — the information-dense title screen: how-to-play, the full bestiary, the run structure and three difficulties.
4. `screenshots/4-end.jpg` — the victory screen: S rank, a 12-statistic ledger, relic/blessing recap and the final score.

## Layout

- `game/` — the game itself: plain static files, vanilla canvas 2D ES modules, no libraries, no build step, no network calls. Deterministic seeded RNG throughout.
  - `game/src/rng.js` — seeded RNG helpers.
  - `game/src/data.js` — realms, bestiary, blessings, relics, bosses, difficulties.
  - `game/src/world.js` — grid, solution-first room generation, beam tracing.
  - `game/src/game.js` — run state and simulation: enemies, bosses, draft, scoring.
  - `game/src/render.js` — all drawing: HUD, screens, textured floors, juice.
  - `game/src/main.js` — entry point, input, deterministic `?shot=` scenes.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library at the scorer's caps.
- `serve.ts` — a tiny local static server for `game/` (`node serve.ts`, then http://localhost:8080).
- `vendor/makefun-game.ts` — the make.fun dossier library, vendored unchanged.
- `shots.json` — the screenshot scenes (`?shot=` queries) used to render `screenshots/`.
- `.makefun/owner.json` — the entrant wallet for this entry.

## Running locally

```sh
node serve.ts                      # play at http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build + verify the dossier
```

## License

MIT — see `LICENSE`.
