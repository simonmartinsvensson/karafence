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
- The `Phaser.Game` instance is exposed as `window.game` (a harmless debug aid
  that also lets headless smoke tests drive scenes / read game state).

## Responsive layout (mobile portrait + landscape)

The whole game is playable on Android Chrome in both orientations.

- `computeScreenLayout(vw, vh)` (`src/systems/grid.ts`) splits the live viewport
  into a top **HUD strip**, a bottom **control bar** (the one-thumb Pause /
  Speed / Fast Forward buttons), and the **board region** between them.
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
  control; the build/upgrade panels (`src/ui/*`) and both scenes size their
  buttons/rows to at least that and center on the viewport. The UpgradePanel is
  anchored just above the control bar so Activate stays within thumb reach.
- **Safe-area insets**: `index.html` mounts Phaser into an **inner wrapper**
  (`#game-inner`) while the outer `#game` carries `padding: env(safe-area-inset-*)`
  with `box-sizing: border-box`. Phaser measures the inner element
  (`getBoundingClientRect`, which is padding-inclusive on the outer), so the
  canvas sizes to the **safe area** — HUD/control-bar never sit under a camera
  cut-out or the Android gesture bar. The dark body background shows through the
  inset strips (matches the in-game background, so it reads as a frame).
- **Portrait hint**: a CSS-only `#rotate-hint` pill (in `index.html`) shows under
  `@media (orientation: portrait)` and self-fades; `pointer-events: none` so it
  never blocks taps and never needs JS.
- **High-DPI rendering** (`src/systems/hidpi.ts`, `installHiDPI` from `main.ts`):
  supersamples the canvas to `cssSize × devicePixelRatio` (capped 3×) so visuals
  are crisp on Retina/Android while the whole game stays authored in **CSS pixels**
  (no scene/layout changes). It sets the canvas backing + renderer (hence the
  postFX render targets) to physical size, and maps each camera's CSS world onto
  that buffer with a pure ×dpr (`origin (0,0)`, `zoom = dpr`, `scroll = 0` — origin-0
  so `scrollFactor: 0` UI lands right too), with `displayScale = dpr` so input
  inverts straight back to CSS-world coords. No-op at dpr 1. Verified headless at
  dpr 1/2/3 incl. exact tap→tile mapping.
- **Touch press feedback** (`src/systems/touch.ts`, `pressFeedback`): mobile has
  no hover, so interactive controls dip in scale (+ brighten their fill) on
  pointer-down and snap back on release — **event-driven, no tweens/timers**, so
  it still animates while the pause menu has paused all tweens. Wired into the
  shared `MenuScene.button` / `GameScene.pauseButton` helpers and BuildPanel
  cards, so most buttons get it for free.

## Scene flow

```
BootScene  →  MenuScene  ⇄  GameScene
```

- **BootScene** logs `"boot"` and starts `MenuScene`.
- **MenuScene** (`src/scenes/MenuScene.ts`) is the **mode-select** landing screen
  (see "Game modes"): a neon **KARAFENCE** wordmark and two large mode cards
  (**Endless** / **Story**, each with **Play / New Game** + **Resume** when a run
  is saved), an **Upgrades** modal (tabbed: global tree + per-tower **Towers** tab
  + the 2× unlock) to spend stars, a **Levels** grid (20 chapters, stars + lock)
  to replay any unlocked level, and a **Records** modal (lifetime stats + best
  endless wave). Reads the persisted meta fresh on each entry; `startMode()` /
  `playLevel()` persist the chosen mode and hand `{ mode, levelId, resume }` to
  the GameScene.
- **GameScene** (`src/scenes/GameScene.ts`) renders the lane grid + stage and
  orchestrates gameplay. It takes `{ mode, levelId, resume }` via `init()` (which
  also resets all per-run state, since Phaser reuses the scene instance), loads
  the map from `LEVEL_BY_ID`, applies meta modifiers, and on end-of-run returns
  to `MenuScene` (or, in story mode, advances to the next chapter via
  `scene.restart`). A **≡ Menu** button leaves mid-run (the run auto-saves).

## Game modes

Two modes, picked on the mode-select screen and persisted (`karafence:mode`);
`GameMode` lives in `src/data/modes.ts` (`MODES` also drives the menu cards).
Combat is **pure passive** in both modes — towers auto-attack; there are no
per-tower active abilities and no shop power-ups (see "Towers / combat").

- **Story** — a **60-level campaign** (`src/data/campaign.ts`). Level 1
  ("The Garage") is a guided tutorial; difficulty ramps to "World Finals". A
  fresh run opens a **planning phase** with a manual **▶ Start Wave 1** button
  (build first, no timer); resume goes straight in. Between waves, `GameScene`
  plays any `beatsAfterWave(levelId, n)` beats through the **DialogueOverlay**
  (`src/ui/DialogueOverlay.ts`) during the intermission (the countdown holds while
  a beat is on screen); the `waveAfter: 0` beat plays at chapter start (wave 1
  deferred until dismissed). Clearing the level scores stars, shows a **Chapter
  Complete** screen and `scene.restart`s into the next chapter — or, on the last,
  the final **victory** screen. Progress persists to `karafence:story:progress`
  (`{ levelId, completedChapters, wavesCleared }`); the menu's **Levels** grid
  unlocks chapters sequentially.
- **Endless** — survival on a standalone `'endless'` map with `ENDLESS_PROFILE`
  (`src/data/waves.ts`): waves never stop, ramping forever (count/hp/speed grow,
  rotating boss every 5 waves, tougher each cycle). No win / no stars; game over
  shows a **"YOU REACHED WAVE X"** screen (run kills / gold / combo, best wave)
  with **Try Again** + **Menu**, banking the best to `karafence:endless:best`.
- **Game speed**: a bottom-bar **1×/2×** toggle scales the manual `dt`,
  `time.timeScale` (spawn/freeze clock) and `tweens.timeScale` together. It is a
  **meta unlock** — the button only appears once `speed2x` is bought.
- **HUD**: the wave counter shows `ENDLESS · Wave X` (no cap) or
  `STORY · Wave X/N` so the active mode + progress are always legible.
- **Dialogue content** is 100% data in `src/data/story.ts` — `CHARACTERS` (ALEX,
  VY, MAX, THE JUDGE; name + portrait tint), `STORY_BEATS` keyed by level id,
  and `CHAPTER_ORDER` (derived from `CAMPAIGN`). The portrait is one grayscale
  `TX.portrait` bust tinted per character (visual-novel style).

## Campaign (src/data/campaign.ts)

The 60 story levels are generated from a single difficulty curve, not hand-painted:
`CAMPAIGN` is 60 `CampaignLevel` entries (`makeLevel(i)`) carrying lanes, enemy
speed, starting gold, palette, `starGoals` and a **`WaveProfile`**; `buildMap`
turns each into a `MapDefinition` via an ASCII layout template (`makeAscii`) +
`parseMap`. `ENDLESS_LEVEL` is the standalone endless map. Levels unlock
sequentially. `LevelId` is `string`; `LEVELS`/`LEVEL_BY_ID` (`levels.ts`),
`defaultMeta().stars`, `CHAPTER_ORDER` and `STORY_BEATS` keys all derive from the
campaign — add/edit entries in one place. Wave generation is unified under the
profile (`buildWaveDef`/`waveScaling` in `waves.ts`); `WaveManager` consumes a
profile (story = finite `waveCount`, endless = infinite).

## Map / lanes

Maps are **data-driven**. A level is authored as ASCII rows + a legend and
parsed into a `MapDefinition` by the shared `parseMap` (`src/data/parseMap.ts`):

- `src/types/map.ts` — `TileType` (`stage` / `aisle` / `build`) and
  `MapDefinition` (grid, lane rows, spawn/stage columns, plus `id`,
  `enemySpeedMultiplier`, `starGoals`, per-tile `colors`, and optional
  `startingGold` + `waveProfile`).
- Maps are **not** authored as individual files anymore — `src/data/campaign.ts`
  generates all 20 from the difficulty table via `makeAscii` + `parseMap` (see
  "Campaign"). `src/data/levels.ts` is the registry (`LevelId`, `LEVELS`,
  `LEVEL_BY_ID`), derived from `CAMPAIGN` + the endless map. Tile colors come from
  the map's `colors` (default palette in `parseMap`).

`GameScene` builds the map into the board container at the fixed `BOARD_TILE`
size, then `fitBoard()` scales + centers that container into the board region
(see "Responsive layout"). The singer is a placeholder rect + label in the stage
zone, with a `damageSinger()` hook for when enemies reach the stage.

## Meta-progression / save-load

**Two-currency Infinitode-style economy** (`src/data/meta.ts` + `towerMeta.ts`):
- **Fame** (`meta.fame`) — the **grind currency**, earned every run (win OR loss)
  and spent on depth. Earned from kills (combo-scaled), wave clears, endless
  milestones, the **encore crate** (`maybeDropCrate`), a best-combo flourish,
  daily quests, the login streak, and the first-win-of-day bonus; multiplied by
  the daily Setlist + the "Going Viral" research node. Banked via
  `GameScene.bankRunFans` → `addFame`. End screens show "+N Fame"; the menu shows
  the Fame balance + a goal tease (`drawFanMeter`/`nextUnlockTease`).
- **Stars** — the **unlock currency**, from 0-3 per-level campaign ratings
  (`starGoals`: ≤`maxLivesLost`, ≤`maxGoldSpent`, ≥`minCombo`; best kept; 60×3 =
  180 max) + a one-time `starGrant` (migrated legacy bonus stars). Spent **only on
  unlocks**: tower unlocks, per-tower branch + deep-tier gates, research deep-tier
  gates, `speed2x`. `starsAvailable = totalStarsEarned − starsSpent`.
- **Per-tower branch trees** (`towerMeta.ts`, `TOWER_META_TREE`): each tower has
  2-3 permanent **branches** (e.g. Belt/Stage Presence/Piercing Note) you level
  with Fame (escalating cost), some gated behind a Star unlock; maxing a branch
  grants a **capstone** flag (pierce/stun/slow/multiTarget). Effects aggregate in
  `towerBonusFor` → `TowerManager` → `Tower.baseStats` (capstones applied before
  run-tier upgrades, with max/min merges). **Respec** refunds a tower's Fame fully.
  Support towers' branches widen (range) + strengthen (`auraMult`) their aura.
- **Research tree** (`META_UPGRADES`, Fame-funded): ~8 nodes (Amplifier +all
  damage, Merch Table +gold, Opening Act Budget +start gold, Royalties +interest,
  Going Viral +Fame, Crowd Memory +combo window, Group Discount −tower cost, Stage
  Fright −enemy HP). Tiers cost Fame; deep tiers need a Star unlock. `metaModifiers`
  turns tiers into run modifiers `GameScene`/`WaveManager` apply.
- **Upgrades modal** (`MenuScene`) has three tabs — **Research** (Fame) /
  **Towers** (tap a tower → its branch sub-panel with Fame buys, star gates, and
  Respec) / **Unlocks** (Stars: tower + speed unlocks) — with a dual Fame+Stars
  header. **Save migration** (`storage.loadMeta`): the pre-Fame shape
  (`fans`/`fanStars`/`towerLevels`) converts to `fame` + `starGrant` once, never
  losing earned spend power (stars only increase across the migration).
- **Prestige / "Go Platinum"** (`meta.platinum`, `platinumMult`): once the
  campaign's final chapter is cleared (`MenuScene.campaignComplete`), a Go
  Platinum button resets campaign unlock progress (replay all 60) for a permanent
  **+15%/✦ Fame & gold** multiplier (folded into `metaModifiers`). Build (Fame,
  branches, research, stars, unlocks) is kept; the rank line shows a `✦N` badge.
- **Achievements** (`src/data/achievements.ts`, pure): one-time goals computed
  from existing state (ratings, lifetime, branches, endless best, prestige) that
  pay Fame on claim (`meta.achievements[id]`). Shown in the Records modal's
  **Goals** tab with a single "Claim +N" button; the menu Records button shows a
  ● badge when something's claimable (`claimableCount`).
- **Offline Fame** (`meta.lastSeen`, `MenuScene.grantOffline`): time-away since
  the last menu visit grants capped Fame (rate scales with prestige), shown in a
  "welcome back" toast alongside the login streak.
- **Daily quests + streak** (`src/data/quests.ts`, pure): two date-seeded
  quests (`pickDailyQuests`) + a login streak, rolled on menu entry
  (`MenuScene.refreshDaily` → `rollDaily`, banking a streak fan bonus on a new
  day). Quests are evaluated against each run's `RunStats` in `bankRunFans` and
  pay out in fans. A **first-win-of-the-day** bonus (`FIRST_WIN_FANS`, guarded by
  `DailyState.firstWinClaimed`, reset by `rollDaily`) pays out the first won run
  each day. State persists in `meta.daily` (`DailyState`); shown in the Records
  modal. No new currency or screen — just more fan sources.
- **More fan-loop hooks** (all feed the one meter, all light-touch):
  - **Encore overdrive** (`triggerOverdrive`/`fanRain`, `OVERDRIVE_SECONDS`): a
    combo at x10+ (each x5) kicks off a few seconds of **doubled fan gain** + a
    fan-rain flourish — mastery made visible.
  - **Comeback bonus**: clearing a wave at ≤2 HP pays bonus fans ("Saved the
    show!").
  - **Scout in the crowd** (`maybeSpawnScout`, `Enemy.bonusFans`): a rare bonus
    VIP mid-wave worth a fat fan pop (reuses the VIP enemy + `WaveManager.spawnAt`;
    skipped on the tutorial).
  - **Tonight's Setlist** (`src/data/setlist.ts`, pure): a **date-seeded run
    modifier for Endless** — tweaks the `WaveProfile` (more bosses, faster/bigger
    crowd, …) for a matching **fan multiplier** (`runFanMult`, applied in
    `bankRunFans`). Shown on the endless card + a run-start venue-card line. A
    fresh daily reason to replay without a new mode.
  - **Performer rank** (`performerRank`/`PERFORMER_RANKS` in `meta.ts`): a career
    title derived purely from total stars (monotonic), shown under the wordmark +
    in Records.
  - **All-stars chase**: the menu tease + Levels grid show `N/60 ★`; unlocked
    levels missing stars get an **amber** border (green when 3-starred).
  - **Next-upgrade highlight** (`UpgradePanel.bestBuy`): the cheapest affordable
    upgrade gets a gold border + ⭐ to steer spending.
- **Lifetime stats**: total kills, waves survived, highest combo — incremented in
  `GameScene` and persisted at wave-clear / run-end.
- **Persistence** (`src/systems/storage.ts`, localStorage, hardened with
  try/catch): the **meta** slot (`karafence:meta`) holds
  stars/upgrades/lifetime/fans/fanStars/daily;
  a separate **run** slot per **mode+level** (`karafence:run:<mode>:<id>` — so an
  endless run and a story run on the same map don't collide) holds an in-progress
  run (resume wave, gold, lives, scoring, and serialized towers via
  `TowerManager.serialize/restore` + `Tower.toSave/restore`). Plus the mode slots:
  `karafence:mode` (last-selected), `karafence:endless:best` (best endless wave),
  `karafence:story:progress` (campaign chapter/waves). The run auto-saves
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
- `src/data/waves.ts` — wave generation from a `WaveProfile`: `buildWaveDef(index,
  profile)` builds the spawn groups (count grows with the wave, types rotate from
  the profile pool, a rotating boss every `bossEvery` waves) and `waveScaling`
  derives hp/speed/boss-hp. Each campaign level carries its own profile; endless
  uses `ENDLESS_PROFILE`.
- `src/systems/Enemy.ts` — waypoint movement, HP + shield bars, `takeDamage()`
  (handles deflect / first-tower bypass / shield), `applySlow()`, `knockback()`,
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
  damage, attack speed, and a default targeting strategy.
- **Pure passive combat**: there are **no per-tower active abilities and no shop
  power-ups** — strategy is placement + upgrades + the support auras. `Tower`
  picks a target per its targeting strategy (`first` / `last` / `strongest`,
  cycled by selecting the tower); single-target towers fire a homing `Projectile`,
  splash towers pulse damage to all in range, Bass Players pulse a passive
  knockback (`Enemy.knockback`), support towers don't fire. `applySupportBuffs`
  (Backup Singer aura) and `hypeAt` (Hype Man gold/combo aura) live in
  `TowerManager`. Range circle shows on hover/select. Boss tower-disables
  (Heckler King freeze, Talent Judge slow) are tuned mild since there's no active
  counter.
- `src/systems/Projectile.ts` — homing dot; applies damage (+ any slow) on hit.
- `src/systems/TowerManager.ts` — placement validation (buildable + empty),
  the valid/invalid build overlay (the selected tile gets a faint green fill, a
  tower-base shadow, and a tween-pulsed bright-green border; `GameScene`
  red-flashes a tapped non-buildable tile), selection UI, projectile updates.
- `src/ui/BuildPanel.ts` — modal tower picker (tap a buildable tile to open);
  each card shows the tower's generated sprite (~55% of card height) inside a
  per-type accent border (`ACCENT` map), its name and cost, and greys out /
  dims unaffordable towers.
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
  60% of `totalSpent`). No Activate row (combat is passive). Affordability
  refreshes **live**: `GameScene.syncOpenPanel` rebuilds the open build/upgrade
  panel (flicker-free, same frame) whenever gold changes, so an upgrade you
  couldn't afford on open becomes buyable the instant the kill gold lands.
- `GameScene` wires `TowerManager.onSelectionChange` → open/close the panel, and
  owns the gold spend/refund on upgrade/sell.

## Combo, economy depth, pacing

All orchestrated by `GameScene`:

- **Crowd Hype combo** — each kill within `COMBO_WINDOW` (2.5s) of the last
  raises the combo; kills pay `reward + reward·COMBO_BONUS·combo`. A "🔥 HYPE
  x{n}" meter shows; at x5+ a "THE CROWD GOES WILD!" screen flash fires. The
  combo resets if no kill lands within the window.
- **Interest** — on each wave clear, `+floor(gold / 10)` is banked (rewards
  saving), shown as a floating "+Ng interest".
- **Manual first wave** — a fresh run opens a planning phase (`showStartPrompt`)
  with a **▶ Start Wave 1** button; the wave begins on tap (`beginFirstWave`).
- **Intermission** — `WaveManager` doesn't auto-advance; on clear it calls
  `onWaveCleared`, and `GameScene` runs an `INTERMISSION_SECONDS` countdown with a
  Skip (Fast Forward) button (held while a story beat is on screen). Building /
  upgrading stay enabled. `WaveManager.startNextWave()` begins the next wave.
- **Difficulty scaling** — per the level's `WaveProfile` (`waveScaling` in
  `src/data/waves.ts`): each wave index raises enemy count, HP (`Enemy` `hpScale`)
  and speed (`speedScale`).

## Procedural art (generated textures)

All in-game sprites are **drawn in code at boot** — there are **no image asset
files**. `src/systems/textures.ts` is the single source of art:
`generateTextures(scene)` (called once from `BootScene.preload`) draws every
texture with `Phaser.GameObjects.Graphics` + `generateTexture(key, w, h)` and is
idempotent. Game logic only ever references the string **keys** (`TX.*` and the
`towerTextureKey` / `enemyTextureKey` helpers), so the placeholder art can be
swapped for real imported textures later by changing only what
`generateTextures` produces for a key — no scene/system changes.

- **Tiles** (`TX.tileStage/tileAisle/tileBuild`) and **enemies**
  (`enemyTextureKey`) are drawn in **grayscale** and tinted at use-time — tiles
  to the map's palette in `GameScene.drawMap`, enemies to their type color in
  `Enemy` (so the slow/deflect `setTint` flashes still work). Bosses add a
  separate pulsing **aura** circle (color per `BOSS_AURA`) behind the silhouette.
- **Baked tile accents** (`TX.aisleArrow/buildPlus/lanePill`) are drawn in their
  **real** colors (NOT tinted) and overlaid on tiles in `GameScene.drawMap`:
  aisles get faint gold left-chevrons + cream dividers and a lengthwise
  runner-depth gradient; buildable tiles are quiet (a faint inset frame + a dim
  green pip — the loud full green cue only appears on tap via
  `TowerManager.showBuildOverlay`). `drawMap` also lays a board-edge **vignette**.
  Lane numbers sit in `TX.lanePill` dark badges. The aisle/build palette
  (`DEFAULT_COLORS`) is saturated red-brown vs. dark slate-green.
- **Neon-noir polish** uses one soft-radial **`TX.glow`** texture, tinted +
  ADD-blended: a colour rim-glow + ground shadow behind every tower (`Tower`),
  ground shadows under enemies (`Enemy`), projectile glow + impact flash
  (`Projectile`), neon death pops (`GameScene.deathBurst`), a boss-spawn camera
  flash, and the menu's stage-light pools / drifting motes / card glows
  (`MenuScene.drawMenuBackground`).
- **Towers** (`towerTextureKey`) are instrument/performer silhouettes on a
  gradient-shaded dark base with a neon colour border; `Tower.body` is a `Sprite`
  (the Heckler-King freeze tints it blue). **Projectiles** are spun textures
  (note / music-wave), with the drummer's drumsticks + bass pulse rings in `Tower`.
- **Story portrait** (`TX.portrait`) — a grayscale visual-novel bust tinted per
  character by the `DialogueOverlay`.
- **Stage**: a curtain backdrop, spotlight cone and singer figure
  (`TX.curtain/spotlight/singer`) composed in `GameScene.drawSinger`. The
  curtain is drawn ~30% narrower than the stage column and left-anchored (a dark
  backstage fill covers the freed strip) so it frames the board rather than
  dominating it; the singer + spotlight center on the narrower curtain.
- **HUD icons + gradient** (`TX.coin/mic/spotIcon/hpFill`) sit in an otherwise
  graphics-drawn HUD (the resizing bars/borders stay as reflowed rects).
- Resolution: textures are generated larger than their on-screen logic size
  (e.g. a 40px tile is drawn at 64px) so they stay crisp when the board scales
  up, sampled NEAREST under `pixelArt: true`.
- **Real-sprite overrides** (`src/systems/spriteOverrides.ts`): replaces any
  procedural texture with a real PNG **without touching scenes/systems** (logic
  only references keys). `SPRITE_OVERRIDES` maps `key → 'assets/sprites/x.png'`;
  BootScene loads each into a temp key (`queueSpriteOverrides` in `preload`) then
  swaps it over the procedural one (`applySpriteOverrides` in `create`, via
  `renameTexture`). A missing/failed file silently keeps its procedural art, so
  it's safe to add/remove entries. **Ships with game-icons.net (CC BY 3.0)
  sprites** for all 11 enemy/boss silhouettes (white → tinted to type color at
  runtime, in `public/assets/sprites/`) + the coin/mic/note HUD icons; **towers
  stay procedural** (their `kf-tower-*` keys are full-color tiles with the
  base/border/glow baked in, so a flat icon wouldn't suit them). `OVERRIDABLE_KEYS`
  lists every key; `ART_CREDITS` drives the menu **Credits** modal (the required
  CC-BY attribution; the "ⓘ Credits" link shows only when it's non-empty). The
  source SVGs were recolored to white and had their background square stripped.

## Audio + visual polish

- **Audio engine** (`src/systems/audio.ts`) — a scene-independent singleton
  (`audio`) built entirely on the Web Audio API, so the game ships with **no
  audio asset files**. A look-ahead sequencer loops a procedural chiptune
  **track per context** — `menu` / `inWave` (upbeat) / `intermission` (calmer) /
  `boss` (intense) / `gameover` / `victory` — switched via `playMusic(name)`
  from the scenes (MenuScene → menu; GameScene → inWave, with intermission /
  boss / victory / gameover swaps at the matching moments). **SFX** (`sfx(name)`,
  throttled) are one-shot synthesized blips: `shoot`, `hit`, `death`,
  `reachStage`, `gold`, `comboTick` (pitch climbs with the combo), `bossEntrance`,
  `ability`, `waveClear`. Master **mute + volume** persist via
  `storage.ts` (`karafence:audio:v1`) and are exposed through the **pause menu**.
  Audio unlocks on the first user gesture (browser autoplay policy). **To swap in
  real tracks/samples**, replace `playMusic` / `sfx` bodies per the header
  comment in `audio.ts` — call sites and the master bus stay unchanged.
- **Haptics** (`src/systems/haptics.ts`, the `haptics` singleton) — the
  Vibration API for **Android Chrome** (a no-op on iOS/desktop). Feature-detected
  (`haptics.supported`) and user-toggleable (persisted via `storage.ts`
  `loadHaptics`/`saveHaptics`, default on); `haptics.play(name)` is unconditional
  at call sites (no-op when unsupported/disabled, with a 24ms coalesce so kill
  flurries never stutter). Named patterns fire at: button presses (`tap`, via
  `pressFeedback`), tower place/upgrade (`place`), invalid build (`error`), wave
  clear (`soft`), boss arrival (`heavy`), achievement claim (`success`), prestige
  & victory (`win`), game over (`lose`). The **pause menu** pairs a 📳 Buzz toggle
  beside the Sound toggle (only when `haptics.supported`).
- **Pause menu** — the bottom-bar **≡ Pause** button freezes the run
  (`time.paused` + `tweens.pauseAll`) and shows an overlay with a mute toggle, a
  volume stepper, **Resume**, and **Quit to menu**; it reflows on resize.
- **Visual polish** (mostly `GameScene`, plus `Tower` / `Enemy` / `BootScene`):
  camera **fade** transitions between scenes; **screen shake** on boss hits
  (scaled to damage); **death particle bursts** tinted to the enemy's color
  (`spark` texture generated in `BootScene`); the **Crowd Hype** meter pulses
  continuously at x5+; **smoothly animated** enemy hp/shield bars; and the stage
  **singer bounces** when a foe is silenced near the stage.
- **Bloom + motion pass** (`src/systems/fx.ts`): both scene cameras get a WebGL
  **bloom + vignette** postFX (`addNeonCameraFX`, no-ops under Canvas) so every
  additive glow bleeds like neon. Towers **idle-bob** and **pop** (scale + glow
  flash) on fire; enemies **waddle** as they walk; projectiles leave a fading
  **neon trail**; the menu has sweeping **spotlight beams** + breathing light
  pools; the in-game stage **spotlight sways**.

## NPM scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check (`tsc`) then build to `dist/`.
- `npm run preview` — preview the production build locally.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`npm ci && npm run build` and publishes `dist/` to GitHub Pages. The Vite
`base` is `/karafence/`, so the site serves from
`https://<user>.github.io/karafence/`.
