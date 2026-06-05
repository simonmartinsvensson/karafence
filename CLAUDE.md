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
- Logical resolution **480×270** (16:9, deliberately wide to fit a TD lane grid).
- `Phaser.Scale.FIT` + `Phaser.Scale.CENTER_BOTH` — scales to the viewport,
  letterboxed and centered.
- Dark background (`#0b0b12`).

## Scene flow

```
BootScene  →  GameScene  →  (future) MenuScene / GameOverScene
```

- **BootScene** logs `"boot"` and immediately starts `GameScene`. Asset
  preloading will live here later.
- **GameScene** (`src/scenes/GameScene.ts`) renders the lane grid + stage and
  orchestrates gameplay: waves, towers, the gold economy, the HUD, and tower
  placement input.

## Map / lanes

Maps are **data-driven**. A level is authored as ASCII rows + a legend and
parsed into a `MapDefinition`:

- `src/types/map.ts` — `TileType` (`stage` / `aisle` / `build`) and
  `MapDefinition` (grid, lane rows, spawn/stage columns).
- `src/data/level1.ts` — "The Open Mic": 16×11 grid, **5 aisles** running
  right→left toward the stage, separated by buildable rows so a tower between
  two aisles can cover both. Edit the ASCII to author a new map.

`GameScene` fits the whole map below a HUD strip and centers it; with
`Scale.FIT` this scales as a unit — fits to width on portrait phones, fills
cleanly centered on landscape desktop. Tile colors are flat placeholders:
stage (purple), aisle (carpet brown), buildable seats/floor (teal). The singer
is a placeholder rect + label in the stage zone, with a `damageSinger()` hook
for when enemies reach the stage.

## Enemies / waves

- `src/data/enemies.ts` — data-driven types: **Heckler** (standard), **Phone
  Scroller** (slow/tanky), **Drunk Uncle** (fast/fragile, `erratic` →
  random adjacent lane each step). Stats: hp, speed, armor, reward, damage.
- `src/data/waves.ts` — waves as spawn groups (`type` / `count` / `delay`) +
  `delayBeforeNext`.
- `src/systems/Enemy.ts` — waypoint movement right→left, HP bar, `takeDamage()`
  and `applySlow()` (slow tints the body blue and decays over time).
- `src/systems/WaveManager.ts` — round-robin lane spawns, drives movement,
  auto-advances waves; callbacks `onReachStage` / `onKill`.

## Towers / combat / economy

- `src/data/towers.ts` — data-driven types + `STARTING_GOLD`: **Lead Singer**
  (medium, single target), **Drummer** (short range, AoE splash pulse),
  **Keyboardist** (long range, slow firing, applies a slow debuff). Each has
  cost, range (tiles), damage, attack speed, and a default targeting strategy.
- `src/systems/Tower.ts` — picks a target per its targeting strategy
  (`first` / `last` / `strongest`, cycled by selecting the tower); single-target
  towers fire a homing `Projectile`, splash towers pulse damage to all in range.
  Range circle shows on hover/select.
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
