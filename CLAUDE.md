# KaraFence

## Theme

**KaraFence** is a tower defense game set at a karaoke night gone hostile.

- **The goal:** defend the **singer on stage** from waves of disruptive audience
  members walking up the aisles toward the stage.
- **Towers** are **singers and instruments** (e.g. backup vocalists, a drummer,
  a bassist) that you place along the aisles to fend off the crowd.
- **Enemies** are **bad-audience archetypes** marching up the lanes:
  - **Hecklers** — loud, throw insults that disrupt nearby towers.
  - **Phone-scrollers** — slow, oblivious, soak up damage.
  - **Drunk uncles** — erratic movement, hard to target.
  - **Stage-rushers** — fast; make a beeline for the stage.

If too many disruptors reach the stage, the show is over.

## Stack

- **[Vite](https://vitejs.dev/)** — dev server and bundler.
- **[Phaser 3](https://phaser.io/)** — game framework (rendering, scenes, input).
- **TypeScript** — strict mode, bundler module resolution.

## Folder structure

```
karafence/
├── index.html              # Mounts the game into #game
├── vite.config.ts          # base: '/karafence/' for GitHub Pages
├── src/
│   ├── main.ts             # Phaser.Game config + entry point
│   ├── scenes/             # Phaser scenes (BootScene, future game scenes)
│   ├── data/               # Static game data (wave defs, tower/enemy stats)
│   ├── systems/            # Game logic systems (waves, targeting, economy)
│   ├── ui/                 # HUD / UI components
│   └── types/              # Shared TypeScript types
├── public/
│   └── assets/             # Static assets copied as-is (sprites, audio)
└── .github/workflows/
    └── deploy.yml          # Build + deploy dist/ to GitHub Pages on push to main
```

## Rendering config

Defined in `src/main.ts`:

- `pixelArt: true` — crisp scaling for pixel-art assets.
- `Phaser.Scale.RESIZE` — the canvas always fills the `#game` element (the full
  viewport), so **1 game unit == 1 CSS pixel** and the scenes lay themselves out
  responsively per orientation rather than being letterboxed.
- `disableContextMenu: true` — no long-press menu on the canvas. `index.html`
  also sets `touch-action: none`, `user-scalable=no`, etc. and `main.ts`
  preventDefaults pinch/double-tap so native mobile gestures never fire.
- Dark background (`#0b0b12`).

## Responsive layout (mobile portrait + landscape)

The whole game is playable on Android Chrome in both orientations.

- `computeScreenLayout(vw, vh)` (`src/systems/grid.ts`) splits the live viewport
  into a top **HUD strip**, a bottom **control bar** (the one-thumb Menu / Shop /
  Fast Forward buttons), and the **board region** between them.
- **Board container**: the lane grid is built once at a fixed board-local tile
  size (`BOARD_TILE` in `config.ts`) into a `board` container with ordered
  z-`layers` (`BoardLayers`: tiles/range/enemies/towers/projectiles/fx). Every
  board object (tiles, towers, enemies, projectiles, FX) is added to a layer, so
  `fitBoard()` reflows the entire board on resize/rotation with a single
  scale+position transform — no per-object relayout, and layer order preserves
  the old depth stacking. Pointer taps are converted to board-local coords via
  `pointerToBoard()`.
- **Screen furniture** (HUD, control bar, boss bar, combo/status text, panels,
  end overlays) lives in scene root in viewport coordinates and reflows in
  `GameScene.relayout()` / `MenuScene.rebuild()` on every `resize` event.
- **Touch targets**: `TOUCH_MIN` (44px) is the floor for every interactive
  control; the build/upgrade/shop panels (`src/ui/*`) and both scenes size their
  buttons/rows to at least that and center on the viewport. The UpgradePanel is
  anchored just above the control bar so Activate stays within thumb reach.

## Scene flow

```
BootScene  →  MenuScene  ⇄  GameScene
```

- **BootScene** logs `"boot"` and starts `MenuScene`.
- **MenuScene** (`src/scenes/MenuScene.ts`) is the landing screen: a level-select
  card per level (name, 0-3 star rating, **Play / New Game** and **Resume** when a
  run is saved), a **Meta Upgrades** modal to spend earned stars, and a **Lifetime
  Stats** modal. Reads the persisted meta fresh on each entry.
- **GameScene** (`src/scenes/GameScene.ts`) renders the lane grid + stage and
  orchestrates gameplay. It takes `{ levelId, resume }` via `init()` (which also
  resets all per-run state, since Phaser reuses the scene instance), loads the
  map from `LEVEL_BY_ID`, applies meta modifiers, and on end-of-run returns to
  `MenuScene`. A **≡ Menu** button leaves mid-run (the run auto-saves).

## Map / lanes

Maps are **data-driven**. A level is authored as ASCII rows + a legend and
parsed into a `MapDefinition` by the shared `parseMap` (`src/data/parseMap.ts`):

- `src/types/map.ts` — `TileType` (`stage` / `aisle` / `build`) and
  `MapDefinition` (grid, lane rows, spawn/stage columns, plus `id`,
  `enemySpeedMultiplier`, `starGoals`, and per-tile `colors`).
- `src/data/level1.ts` — **"The Dive Bar"**: 16×11 grid, **5 aisles**, normal
  speed. `src/data/level2.ts` — **"The Grand Stage"**: 16×9 grid (bigger tiles =
  wider-looking lanes), **3 aisles**, `enemySpeedMultiplier: 1.35`, and a cooler
  flat palette. `src/data/levels.ts` is the registry (`LevelId`, `LEVELS`,
  `LEVEL_BY_ID`). Edit/add ASCII to author a map; tile colors come from the map's
  `colors` (default palette in `parseMap`).

`GameScene` builds the map into the board container at the fixed `BOARD_TILE`
size, then `fitBoard()` scales + centers that container into the board region
(see "Responsive layout"). The singer is a placeholder rect + label in the stage
zone, with a `damageSinger()` hook for when enemies reach the stage.

## Meta-progression / save-load

- **Stars** (`src/data/meta.ts`): finishing a level scores 0-3 stars — one each
  for losing ≤ `maxLivesLost`, spending ≤ `maxGoldSpent`, and reaching `minCombo`
  (thresholds live in the map's `starGoals`). The **best** rating per level is
  kept. Total stars earned across levels are a spendable currency; available =
  earned − spent.
- **Meta-upgrade tree** (`META_UPGRADES`): permanent, account-wide, bought with
  stars — *Opening Act Budget* (+5%/tier starting gold), *Group Discount*
  (−5%/tier tower cost), *Crowd Memory* (+0.5s/tier combo window). `metaModifiers`
  turns purchased tiers into the run modifiers `GameScene` applies (starting gold,
  `towerCost()`, `comboWindow`).
- **Lifetime stats**: total kills, waves survived, highest combo — incremented in
  `GameScene` and persisted at wave-clear / run-end.
- **Persistence** (`src/systems/storage.ts`, localStorage, hardened with
  try/catch): the **meta** slot (`karafence:meta`) holds stars/upgrades/lifetime;
  a separate **run** slot per level (`karafence:run:<id>`) holds an in-progress
  run (resume wave, gold, lives, scoring, and serialized towers via
  `TowerManager.serialize/restore` + `Tower.toSave/restore`). The run auto-saves
  on tower/economy changes and wave boundaries, and resumes by replaying the saved
  wave from its start; it's cleared on victory or game over.

## Enemies / waves / bosses

- `src/data/enemies.ts` — data-driven types. Standard: **Heckler**, **Phone
  Scroller** (tanky), **Drunk Uncle** (erratic), **Stage Rusher**
  (`bypassFirstTower` — immune to the first tower that hits it), **Critic**
  (`criticAura` + `reviewPenalty` — cuts the reward of enemies dying nearby),
  **Superfan** (`splitInto` — splits into 2 Hecklers on death), **VIP**
  (`deflectChance` + big reward). Bosses (flagged with `boss`): **Heckler King**
  (taunt freezes towers in radius), **Mic Grabber** (steals gold + resets combo
  at the stage), **DJ Who Wouldn't Stop** (`shield` + summons Hecklers),
  **Talent Show Judge** (multi-phase). `BOSS_CONFIG` tunes the abilities.
- `src/data/waves.ts` — 20 waves; bosses at 5/10/15/20 (`boss()` groups set
  `noScale`). `DIFFICULTY` / `scaledCount` scale count/hp/speed per wave.
- `src/systems/Enemy.ts` — waypoint movement, HP + shield bars, `takeDamage()`
  (handles deflect / first-tower bypass / shield), `applySlow()`, `rewind()`,
  and `isBoss` / `hpRatio` for the boss bar.
- `src/systems/WaveManager.ts` — round-robin spawns, `spawnAt()` (splits + boss
  summons), Superfan split on death; callbacks `onReachStage` / `onKill` /
  `onWaveCleared` / `onBossSpawn`.
- Boss abilities + the full-width **boss health bar** are driven by `GameScene`
  (`driveBoss`/`showBossBar`); `Tower.freeze()` + `TowerManager`
  `attackSpeedMultiplier` back the Heckler King taunt and Talent Judge phase 3.

## Towers / combat / economy

- `src/data/towers.ts` — data-driven types + `STARTING_GOLD`. Attackers:
  **Lead Singer** (medium, single target), **Drummer** (short range, AoE splash
  pulse), **Keyboardist** (long range, slow firing, applies a slow debuff),
  **Bass Player** (medium range, low-frequency "bass blast" that knocks every
  enemy in range back `knockbackTiles`). Support (`attacks: false`, no upgrade
  tree): **Backup Singer** (short range, `buffAttackSpeed` aura speeds up nearby
  attacking towers), **Hype Man** (wide range, `goldBoost` +50% gold and
  `comboBoost` faster combo for kills in range). Each has cost, range (tiles),
  damage, attack speed, a default targeting strategy, and an `ability` (see
  below).
- `src/systems/Tower.ts` — picks a target per its targeting strategy
  (`first` / `last` / `strongest`, cycled by selecting the tower); single-target
  towers fire a homing `Projectile`, splash towers pulse damage to all in range,
  Bass Players pulse a knockback (`Enemy.knockback`), support towers don't fire.
  Range circle shows on hover/select.

### Active abilities

Every tower has one cooldown-gated active ability (`TowerAbility` in
`towers.ts`), triggered from the **Activate** button in the upgrade panel:
Lead Singer **Power Note** (single-target nuke), Drummer **Drum Roll** (3s stun
AoE), Keyboardist **Chord Bomb** (10s slow field), Backup Singer **Choir Boost**
(10s 2x fire for all towers), Bass Player **Drop the Bass** (knock all enemies
back 5 tiles), Hype Man **Crowd Surf** (next 10 kills pay 3x gold). `Tower`
tracks the cooldown and draws it on the sprite (a shrinking dark wedge + a gold
"ready" ring). The effects live in `GameScene.activateAbility`; `TowerManager`
holds `abilitySpeedMultiplier` (Choir Boost), `applySupportBuffs` (Backup Singer
aura), and `hypeAt` (Hype Man gold/combo aura), and Chord Bomb fields are ticked
by `GameScene.tickSlowFields`.
- `src/systems/Projectile.ts` — homing dot; applies damage (+ any slow) on hit.
- `src/systems/TowerManager.ts` — placement validation (buildable + empty),
  the valid/invalid build overlay, selection UI, projectile updates.
- `src/ui/BuildPanel.ts` — modal tower picker (tap a buildable tile to open);
  shows costs and greys out unaffordable towers.
- **Economy:** start with `STARTING_GOLD`, earn `enemy.reward` on kill
  (`WaveManager` `onKill`), spend gold to place towers. Gold shows in the HUD.

## Upgrades / selling

- `UPGRADES` in `src/data/towers.ts` — per tower, two 3-tier paths (A = power,
  B = utility). Each `UpgradeTier` has a `label`, `cost`, stat deltas, and/or
  effect flags (`pierce`, `multiTarget`, `doubleFire`, `slowOnHit`, `stunOnHit`).
  Signature (tier-3) effects: Lead Singer A=piercing shot / B=crowd-control slow;
  Drummer A=drum-solo stun / B=double kick; Keyboardist A=freeze (full stop) /
  B=chord strike (3 targets).
- `Tower` recomputes effective `RuntimeStats` from base + purchased tiers, and
  tracks `totalSpent` for the sell refund. **BTD6 constraint** (`canUpgrade`):
  a path may pass tier 1 only if the other path is at tier ≤ 1 (so only one path
  fully maxes). Tier pips render on the tower (red = A on top, cyan = B below).
- `src/ui/UpgradePanel.ts` — opens on selecting a placed tower: both paths
  (pips + next label/cost), a targeting toggle, and **Sell** (`SELL_REFUND` =
  60% of `totalSpent`). Affordability is snapshotted when the panel is (re)built.
- `GameScene` wires `TowerManager.onSelectionChange` → open/close the panel, and
  owns the gold spend/refund on upgrade/sell.

## Combo, economy depth, pacing, shop

All orchestrated by `GameScene`:

- **Crowd Hype combo** — each kill within `COMBO_WINDOW` (2.5s) of the last
  raises the combo; kills pay `reward + reward·COMBO_BONUS·combo`. A "🔥 HYPE
  x{n}" meter shows; at x5+ a "THE CROWD GOES WILD!" screen flash fires. The
  combo resets if no kill lands within the window.
- **Interest** — on each wave clear, `+floor(gold / 10)` is banked (rewards
  saving), shown as a floating "+Ng interest".
- **Intermission** — `WaveManager` no longer auto-advances; on clear it calls
  `onWaveCleared`, and `GameScene` runs a `INTERMISSION_SECONDS` countdown with
  a Skip (Fast Forward) button. Building/upgrading/shopping stay enabled.
  `WaveManager.startNextWave()` begins the next wave (countdown end or Skip).
- **Shop** (`src/ui/ShopPanel.ts`, data in `src/data/powerups.ts`) — a
  persistent button opens the "KaraFence Cash" modal selling one-use power-ups:
  Security Guard (kill all on screen), Encore (`Enemy.rewind` all enemies 10s),
  Sound Check (`TowerManager.damageMultiplier = 2` for 15s). Effects apply on
  purchase.
- **Difficulty scaling** (`DIFFICULTY` / `scaledCount` in `src/data/waves.ts`) —
  each wave index raises enemy count, HP (`Enemy` `hpScale`), and speed
  (`speedScale`) by a small per-wave factor.

## NPM scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check (`tsc`) then build to `dist/`.
- `npm run preview` — preview the production build locally.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`npm ci && npm run build` and publishes `dist/` to GitHub Pages. The Vite
`base` is `/karafence/`, so the site serves from
`https://<user>.github.io/karafence/`.
