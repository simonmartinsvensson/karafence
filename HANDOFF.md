# KaraFence — Working Handoff / Context

> Working notes for resuming after a conversation `/clear`. Not part of the game.
> Safe to delete or gitignore. Last updated by Claude during the meta-depth + addictiveness work.

## TL;DR status

- **Live site:** https://simonmartinsvensson.github.io/karafence/ (GitHub Pages, deploys from `main` on push).
- **Repo:** `github.com/simonmartinsvensson/karafence`. Local: `/Users/simon.svensson/projects/karafence`.
- **`main` @ `0e74ba4`** — **deployed + verified live** (Pages action green; live JS hash matches local build). Now includes everything from `addictive-2` (**Prestige / Go Platinum**, **Achievements / Goals tab**, **Offline Fame**) **plus** the Android-feel pass: **haptics** (`src/systems/haptics.ts` + pause-menu 📳 Buzz toggle), **touch press feedback** (`src/systems/touch.ts`, wired into the shared button helpers + BuildPanel), **safe-area insets** (`index.html` `#game`→`#game-inner` wrapper + `env(safe-area-inset-*)`), and a CSS-only **portrait rotate hint**. On top of the earlier base: sprites, fan→**Fame** economy, branching tower trees, research tree, 60-level campaign, build/upgrade descriptions, enemy guide, New-Game confirm.
- **Merged-into-main branches (safe to delete):** `meta-depth`, `addictive-2`, `android-feel` — all now ancestors of `main @ 0e74ba4`. (Not deleted yet; awaiting OK.)
- **Open decision:** delete the three merged branches? Prioritize the level-curve playtest (P1)? Take on true hi-DPI crispness (see below)?

## Late-game improvements (2026-06-18+) — user asked for ALL of these; shipping in phases

Full slate (user: "all of them"): #1 repeating endless milestones, #2 roguelite wave boons, #3 elite/affix enemies, #4 endless mega-boss, #5 less-grindy prestige (NG+/skip), #6 second-tier "encore" capstones, #7 cosmetic tower skins, #8 endless score. Rolling out in verified phases.

- **Phase 1 (DONE, on `main`): #1 + #8.**
  - **#1 Repeating endless milestones:** `waves.ts` — replaced the fixed `[20,30,40,50]` array with `endlessMilestoneFame(wave)=round(wave*18)`, `endlessMilestonesUpTo(wave)`, `nextEndlessMilestone(claimed)`. Milestone every 10 waves **forever** (20→360 … 100→1800, linear, no runaway). `bankRunFans` iterates `endlessMilestonesUpTo(reached)`; menu card teases `nextEndlessMilestone`. Verified: pays 20..70 at wave 75.
  - **#8 Endless score:** `score = wave*1000 + kills*5 + combo*25`, banked best in `storage` (`karafence:endless:bestscore`), shown on the endless end screen ("⭐ Score N" + "Best: wave X · score Y"; dropped the Gold-earned line for room). Verified.
- **Phase 2 (DONE, on `main`): #2 Encore boons.** `src/data/boons.ts` (6 boons: Payday/Royalties/Encore-heal/Going-Viral/Amp-Up/Merch-Rush; `rollBoons(3)`). Shown centred during intermission (`GameScene.showBoons`/`boonCtx`/`pickBoon`/`clearBoons`), gated by new `boons` feature @15 (progression). All effects instant or **next-wave temp** (no per-frame state): combat boons use `TowerManager.damageBoost` (folded into the synergy mult in `applySynergies`) + `GameScene.boonGoldMult` (in kill-gold), both reset in `onWaveCleared`. Verified: gating, effects reach the tower, reset on wave clear.
- **Phase 3 (DONE, on `main`): #3 Elite/affix enemies.** `src/data/affixes.ts` — non-boss enemies in **endless** past wave 30 roll an affix (Swift +50% spd / Tough +90% hp / Shielded +70%hp shield / Frenzied +35%hp&+30%spd), chance climbs 8%→40% with the wave. Reuses Enemy's instance hp/speed/shield (no new mechanics); elites get a coloured ring + 1.5× reward. Wired in `WaveManager.spawnEnemy`; preview shows "⚡" deep. Verified: gated <30, scales in, shields apply, ring renders.
- **Phase 4 (DONE, on `main`): #4 Endless mega-boss.** `waves.ts` `MEGA_BOSS_EVERY=25`, `MEGA_BOSS_HP_MULT=3`. In `WaveManager.spawnEnemy`, endless boss waves where `wave%25===0` spawn the rotating boss as `mega` (Enemy `mega` flag): ×3 HP, ×1.5 body, gold aura, ×2 reward; boss bar shows "★ MEGA <name>" in gold (both `showBossBar` AND `updateBossBar` — the latter overwrites the label each frame, easy to miss). Verified.
- **Phase 5 (DONE, on `main`): #5 Prestige New Game+.** `MenuScene.prestigeSkip(platinum)=min(platinum*5, CHAPTER_ORDER.length-10)`. `doPrestige` now auto-completes the first `skip` chapters and resumes at chapter `skip+1` (instead of replaying all 60). Confirm dialog says "replay from chapter N". Stars kept; skipped chapters still replayable via Levels grid; features stay unlocked (high-water). Verified: 1st prestige → ch6, 2nd → ch11, caps at 50.
- **Phase 6 (DONE, on `main`): #6 Encore branch upgrades.** Once a branch is **maxed** and you've **prestiged** (platinum>0), its top node becomes a Fame-bought "encore" that **doubles that branch's effect** — a sink + power for maxed builds. `towerMeta.ts`: `meta.branchEncore` flag, `isBranchEncore`/`canBuyEncore`/`branchEncoreCost`(≈2.5× last level)/`buyBranchEncore`; `towerBonusFor` doubles the branch contribution; respec refunds + clears it. UI: the maxed top node glows with "✦🎤cost"; caption shows "✦×2" (works for capstone AND non-capstone branches). Verified: gated on platinum, doubles effect (1.5→2.0), no re-buy, respec clears.
- **Phase 7 (DONE, on `main`): #7 Cosmetic tower skins (recolor).** `src/data/skins.ts` (6 skins: Classic free + Platinum/Ice/Sunset/Toxic/Chrome, Fame-bought). Active skin = a tint on `Tower.body` via the `src/systems/skin.ts` `skin.tint` singleton (set in GameScene init from `meta.activeSkin`; per-tower glow keeps colour identity so towers stay readable). `meta.skinsOwned`/`activeSkin` + storage merge. New **Skins** tab in the Upgrades modal (`drawSkinRows`, colour swatches + Buy/Select/Active). Verified: 6 swatches, buy+select, tint reaches the tower body, default = no tint.

**🎉 ALL 8 late-game features shipped (#1–#8).** Slate complete.

## Themed chapters — visual variety every 10 levels (2026-06-25, on `main`)
User: "levels could change more visually — chapters, 1-10 these visuals, 11-20 these…". Before, only 2 palettes (one swap at L20). New `src/data/themes.ts`: `ChapterTheme` {name, tiles (Record<TileType>), bg, vignette, backstage} × 6 bands, `themeForChapterIndex(i)=floor(i/10)` clamped. Arc matches the story: Dive Bars (red-brown) → Neon Lounge (purple) → Grand Theater (teal) → Concert Hall (green) → The Arena (orange) → World Stage (gold); aisle stays most-saturated in every theme for lane readability. Wiring: campaign `makeLevel` sets `colors: themeForChapterIndex(i).tiles` (removed old DEFAULT/COOL binary + COOL_PALETTE); ENDLESS uses CHAPTER_THEMES[1] (neon). GameScene stores `this.theme` (computed from CHAPTER_ORDER.indexOf(levelId), endless→band 1), applies it to camera `setBackgroundColor`, `drawBoardVignette` (per-chapter edge tint) and the `drawSinger` backstage fill. Curtain stays the red velvet constant (its texture is real-colored, would muddy on tint). Verified: 6 distinct aisle colors, consistent within bands, switch at boundaries; screenshots confirm each chapter is a clearly different venue; no errors.

## Maze Night — new "Maze TD" endless mode (2026-06-25, **branch `maze-night`, PR pending, NOT on `main`**)
User idea: a mazing mode where you build to control enemy pathing. Shipped in 3 verified phases (branch off `main`, independent of PR #1). The lane campaign is untouched — maze is a self-contained variant behind `pathMode: 'maze'`.
- **Phase 1 — core (`c67a37f`):** `src/systems/maze.ts` `MazeField` = a flow field (one BFS from the stage goal over walkable cells; `next(c,r)` = each cell's step toward the stage; `recompute()` on every place/sell — in-flight enemies re-route for free by re-querying each cell; `pathClearWith()` enforces the no-seal rule: every spawn tile + live foe must still reach the stage, also forbids building on an occupied tile). `Enemy` gained a free grid `row` + optional field (pickNextTarget branches to flow-field stepping; knockback/splits row-aware). `WaveManager` threads field+startRow. New `'maze'` GameMode + `MAZE_LEVEL` (open 13-row floor; stage cols 0-1; cols 2-14 buildable+walkable; col 15 = walkable-not-buildable spawn strip so spawns never wall in) via parseMap `pathMode`; registered in levels. `GameScene` builds the field for maze maps, recomputes on place/sell/restore, rejects sealing placements (flash + "Can't block the crowd in!").
- **Phase 2 — menu/mode/persistence (`a00e512`):** MAZE NIGHT mode card (🧩); `maze` feature unlocks at **chapter 18**; `drawModeCards` now lays out N cards in both orientations (was hard-coded to 2 in landscape); separate best-wave ladder `karafence:maze:best` (`load/saveMazeBest`); maze is "endless-like" via a shared `GameScene.isEndless` flag (infinite waves, survived end screen, anti-farm Fame cap, everything-unlocked); HUD reads "MAZE · Wave N". Resume works via the existing per-mode run slot.
- **Phase 3 — path preview + balance (`0dcc78e`):** `drawMazeFlow` paints a bright cyan chevron on every walkable cell showing the crowd's route (theme-independent color so it reads on every palette; redrawn on recompute, in the board range layer). `MAZE_PROFILE` (waves.ts) = gentler ramp than endless (crowd enters across the whole 13-row front, so fewer/slower foes early to allow walling a funnel; keeps deep-wave compounding); opening gold 320.
- **Verified headless (all phases):** BFS routes around walls (detour 26 vs straight 14), no-seal rejects last gap / allows open cells, live scene routes enemies around a wall + through the gap; card hidden when locked / 3 cards when unlocked, best-wave persists; flow overlay renders+reroutes (screenshots), boss pathfinds the maze; **maxed account builds a legal funnel → wave 12 at full HP, 137 kills**. Build green, no console errors. **Possible follow-ups:** hover-preview "this seals the maze" before tapping; a few seed obstacle pillars; maze-specific enemy flavor; Records line for maze best.

## Levels venue bands + L48-60 playtest balance (2026-06-25, **PR #1 open, NOT yet on `main`**)
Branch `levels-band-headers` (commits `8042c65`/`e50cca6`/`1e081f6`), pushed; **PR #1** against `main` (https://github.com/simonmartinsvensson/karafence/pull/1) — user chose PR-review over direct push this time, so it is **not deployed yet** (merge the PR to trigger Pages). Two independent pieces:
- **Levels grid venue band headers** (`MenuScene.openLevelSelect`): each 10-level band now has a compact "CH N · VENUE" header strip tinted to that chapter's `themeForChapterIndex` accent, and the cells under it are tinted toward the same venue color (`mix()` helper) — the grid reads as six venue zones matching the chapter cards. Label strips fold into the fit-to-height math (`bandLabelH` clamp 12-16, `bandsExtra`); cells held ≥52px so the per-cell star rows stay legible on portrait; border still encodes unlock/star state. New imports: `themeForChapterIndex`, `TileType`. Verified headless portrait + short-landscape, screenshots confirm 6 labeled color-coded bands, no errors. (Landscape still overflows — pre-existing: 60 cells × 28px floor exceeds ~412px landscape height regardless; portrait is the supported view per the rotate hint.)
- **L48-60 winnability — SETTLED via real-engine headless playtest** (maxed account, densely-covered board ~88-96 towers, 4× speed; harness `/tmp/kf_harness.mjs` Pass A + `/tmp/kf_passb.mjs` Pass B). **Pass A (infinite gold): ALL of L48-60 win at full HP, incl. the L60 finale boss — no mechanical difficulty wall.** The prior P1 fear is disproven. The binding constraint is the *opening* economy: lanes widen to 6-7 late while `startingGold` falls to its 210 floor, so wide boards can't seed every lane before kill-gold compounds (Pass B loses ~wave 2-3 on most levels, but that's partly bot-can't-react — where it survived the opening it self-funded to a full clear). **Fix applied** (`campaign.ts` `makeLevel`): lane-aware opening `+ Math.max(0, lanes-5)*25` → 7-lane maps 210→260 (now > 6-lane, fixing the lanes-up-gold-down asymmetry), 6-lane +25, ≤5-lane unchanged. Difficulty knobs (speedCap/hp/bossEvery) left alone. Values verified per level (L41=270, L48/60=260). **The P1 "Level ~40-60 winnability" item below is now RESOLVED** — mechanically winnable confirmed; remaining tuning is economy-only and gentle.

## Chapter title cards (2026-06-25, on `main` @ `0e8a870`, deployed + verified green)
The themed-chapters follow-up. Each 10-level band shifts venue look but nothing announced it. New `GameScene.showChapterCard(venueIndex)` shows a "CHAPTER N · <venue name>" card (theme-accent tint via `theme.tiles[Aisle]`, level name underneath, Back.out scale-in → ~2.8s → fade) on the **first level of each band** (story, `CHAPTER_ORDER.indexOf(levelId) % 10 === 0` → L1/11/21/31/41/51); other levels keep the plain `showVenueCard` (level name only). Endless (index −1) unaffected. Picked in the init flow right after `ambientNotes()`. Verified headless across all six bands (correct chapter # + venue name) + negative case (L5 = no chapter card, venue card present), screenshot confirms render over the themed board with no dialogue overlap, no console errors. Card co-displays fine with the L*1 intro dialogue beat (card upper-third, dialogue bottom).

## Living dialogue: typewriter + portrait animation + voices (2026-06-25, on `main`)
Polish on the story system so every beat (all 60 levels) feels alive. `DialogueOverlay`: (1) **typewriter reveal** — body text reveals a growing substring; to avoid reflow it pre-wraps once via `body.getWrappedText(...)` into `fullText`, then types over that fixed string (partial lines only shrink, never re-wrap). Driven by a `scene.time` event (TYPE_STEP 2 chars / TYPE_DELAY 18ms). Tap is now `onTap()`: mid-type → `finishTyping()` (skip to full); when done → `advance()`. Hint shows "tap to skip" vs "tap ▶". `revealed` flag skips re-typing on relayout. (2) **Portrait entrance** — fresh beats slide the portrait up + fade/pop (Back.out, 260ms). (3) **Per-character voice** — new soft `'talk'` SFX in audio.ts (`opts.freq`, vol 0.05) blips every ~4 chars on printable glyphs; pitch per character via `VOICE` map (judge 220 deep … riva 640 bright). All timers cleaned in `render()`/`close()`. Verified headless: starts mid-type, grows, tap-skips to full, tap advances, last-beat dismiss closes+fires onComplete, screenshot confirms partial text + animated portrait + skip hint, no errors.

## Per-character portrait art (2026-06-24, on `main`)
Follow-up to the full-campaign story: the whole cast shared one tinted `TX.portrait` bust. Now each has a bespoke grayscale 96×112 bust (still tinted by `CHARACTERS[c].color`) in `textures.ts` `generatePortraitTextures` — shared `portraitBase()` (shoulders/neck/head) + per-character features: alex (side ponytail + neck headphones), vy (flat cap + on-ear headphones + glasses), max (spiky hair + popped collar), judge (slicked side-part + shades + high collar), riva (big hair + top bun + hoop earrings), dex (visor + boom headset mic + open collar), phantom (dark hood + eye-mask band + dramatic cape collar + halo). New exported `portraitKey(character)` returns `kf-portrait-<c>` for the 7 cast members else the generic `TX.portrait` fallback (unknown speakers still work). `DialogueOverlay` uses `portraitKey(beat.character)` (dropped now-unused TX import). Verified: all 7 textures generated, key mapping + fallback correct, screenshots confirm distinct silhouettes, no errors.

## Full-campaign story (2026-06-24, on `main`)
User: "the story should continue throughout the 60 levels and keep you engaged/immersed." Root cause: `STORY_BEATS` had beats only at L1,2,3,5,7,9,10,15,59,60 — L16-58 (the whole back two-thirds) had ZERO narrative. Pure-content fix in `src/data/story.ts` (system already supports beats at any level/wave; `DialogueOverlay` handles any character). Added a continuous arc: garage → World Finals. Expanded `CHARACTERS` with **riva** (gold, reigning champ), **dex** (green, promoter), **phantom** (violet). Beats now at all 60 levels (back-half 16-58 = 43/43). In-story heads-ups for the new enemies (crowd surfers ~14/15, roadies ~23, pyros ~31). Set-piece milestones got dramatic multi-beat scenes incl. mid-wave beats (L30 boss-rush gauntlet @0+@4, L40 survival @0+@11, L50 sudden-death @0+@13). **Reveal:** the Judge is the long-lost "Encore Phantom" who froze at the Finals; L60 plays Judge intro@0, Judge→Phantom reveal@27 (FINALE_WAVES-1), and an alex/vy/judge redemption closing@28. Preserved all tutorial/tower-teaching beats (align with TOWER_STORY_UNLOCK). Verified: 60/60 levels, all characters valid, mid-wave beats within waveCount, reveal+closing fire, renders with new cast, no errors. Tutorial beats unchanged.

## Back-half variety overhaul (2026-06-23, COMPLETE — all 3 phases on `main`)
User: "after level 20 every level repeats itself — make the last two-thirds interesting, something NEW should happen." Root cause: `makeLevel(i)` only inflates scalars (lanes/speed/hp/count) on the SAME straight-rectangle map; all 7 enemies + 4 bosses seen by level 11. User picked 3 directions (NOT per-level modifiers): **new enemies + finale boss**, **set-piece milestone levels (30/40/50/60)**, **map obstacles & layouts**. Shipping in phases.
- **Phase 1 — Map obstacles (DONE, on `main`):** new `TileType.Obstacle` (speaker-stack prop): not buildable (`canPlace` already gates on `Build`), not on the path (only stamped into build rows, so enemy routes unchanged). `campaign.ts` `makeLayout(i,lanes,tutorial)` stamps 4 cycling patterns (scattered pillars / twin chokepoint columns / central checker / center stack) for i>=20; edges (col 2 + far col) kept clear so no lane is wall-off-able. `CampaignLevel.layoutRows` precomputed; `buildMap` uses it. Rendered via `GameScene.drawObstacleProp` (inline graphics amp cabinet) reusing `TX.tileBuild` tinted dark (palette `Obstacle` added to DEFAULT_COLORS + COOL_PALETTE). Verified: 16/14/28/20 obstacles L21-24, path-clean, edges clear, can't build on prop.
- **Phase 2 — New enemies (DONE, on `main`):** 3 archetypes drip into the back half via `poolForLevel` (crowdSurfer L15 / roadie L23 / pyro L31) + added to ENDLESS_PROFILE pool. **crowdSurfer**: generalised bypass — `EnemyType.bypassCount`, Enemy now tracks a `Set<string> bypassedTowerIds` + `bypassLimit` (stageRusher=1 via bypassFirstTower, crowdSurfer=2). **roadie**: `healAura` {radius,shield,interval,max}; **pyro**: `disablesTowers` {radius,duration,interval}. Both driven by new `GameScene.driveEnemyAbilities(dt)` (per-enemy `Enemy.abilityTimer`), pyro reuses `towers.freezeTowersInRadius`, roadie calls new `Enemy.grantShield` (tops up shield, no bar — communicated via `shieldPop` ring + "🛡 ROADIE!" float). New procedural silhouettes in textures.ts; Enemy Guide auto-lists them (rowH min clamp 30→26 to fit 14 rows). Verified: bypass-2, ally shielded 0→40, pyro path clean, textures present, guide renders.
- **Phase 3a — Set-piece levels (DONE, on `main`):** `SpecialKind`='bossRush'|'survival'|'suddenDeath'|'finale' on `MapDefinition`/`CampaignLevel` (plumbed via parseMap+buildMap); `SPECIAL_BY_INDEX` {29:bossRush,39:survival,49:suddenDeath,59:finale}; `SPECIAL_INFO` name/blurb exported for the UI. **L30 bossRush**: profile override bossEvery=1, waveCount 8, low trash. **L40 survival**: new `GameScene.waveActive` flag (true on beginFirstWave/startNextWave, false on onWaveCleared) gates new placement in `onMapClick` (planning still open). **L50 suddenDeath**: new per-run `GameScene.singerMaxHp` (=3 here; SINGER_MAX_HP const stays the default) — replaced all singer-HP refs (HUD text/ratio, livesLost, heal cap) with `this.singerMaxHp`; comeback bonus now requires `singerMaxHp>5` so it doesn't auto-trigger. Run start shows `showSpecialBanner` + a ⚠ start-prompt label. Verified headless: all 4 specials assigned, bossEvery=1, singer 3/3, survival lock toggles with the wave.
- **Phase 3b — Finale boss (DONE, on `main`):** **The Encore Phantom** — new 5th boss (`encorePhantom` BossKind+EnemyType, shield 400, hp 1500). `BOSS_CONFIG.encorePhantom` {screechRadius/Duration, abilityInterval 4, summon crowdSurfer×2, enrageHp 0.4, enrageCadence 0.6}. `driveBoss` case alternates a tower-silencing screech (`freezeTowersInRadius`) and crowd-surfer summons each tick; enrages (tighter cadence) below 40% HP. Added `BOSS_AURA.encorePhantom` (violet), 96px caped silhouette in textures.ts, `phantomToggle` field (reset in init/clearBoss/onBossSpawn). NEW `WaveProfile.finalBoss?: BossKind`: `buildWaveDef` makes the LAST wave a solo showdown with it; L60 sets `finalBoss='encorePhantom'`. Verified: solo final wave, absent earlier, boss bar activates, screech/summon (+2) work, enrage triggers, texture present, no errors. **Known limitation:** Enemy Guide now lists 15 foes; row clamp lowered to 22 — on very short landscape it can still overflow (needs scroll/2-col someday; fine in portrait).

## Bug-fix pass (2026-06-22, on `main`)
Audited combat / economy / waves+save via 3 parallel readers. Most flagged economy "exploits" were FALSE (vetted against code): quest/first-win Fame is daily-bounded (`q.done`/`firstWinClaimed` persist, reset only by `rollDaily`), setlist mult is clamped *inside* the endless cap (`round(runFans*runFanMult)` then clamp), milestones are one-time (`meta.endlessMilestones`), interest `0.1+0.02*tier` can't go negative. Two real fixes shipped:
- **Enemy.flash() stuck tint** (`Enemy.ts`): a deflect/bypass blip on a *slowed* enemy never restored the slow-blue (old code only reset when `slowRemaining<=0`), stranding it on the flash color for the rest of the slow. Now restores `0x74c0fc` if still slowed else baseColor, + a `this.dead` guard.
- **`panelGold` not reset in `init()`** (`GameScene.ts`): latent cross-run state leak (Phaser reuses the instance); now reset to -1 so the open-panel resync fires on the first frame. Harmless before, but correct now.

## Endless deep-wave difficulty wall (2026-06-19, on `main`)
Endless past ~100 was a stay-awake grind, not a challenge (linear hp ×12.9 @100 — builds outscaled it). Added **compounding** hp growth to `WaveProfile` (`hpCompoundPerWave`/`hpCompoundFrom`, both optional → campaign profiles omit them, stay linear). `waveScaling` multiplies BOTH `hpScale` and `bossHpScale` by `(1+rate)^max(0,index-from)`. ENDLESS_PROFILE: rate 0.02 from wave 40, speedCap 2.5→2.8. Result: ~linear to 50, then bends — hp ×8.2@50, ×41@100 (was 12.9), ×163@150; bosses ×12.4@100 (×3 more if mega). Tune `hpCompoundPerWave` if it walls too early/late. Verified headless; campaign curve untouched.

## Endless Fame cap (anti-farm, 2026-06-19, on `main`)
Endless never ends, so a single marathon run banked unbounded per-kill/per-wave Fame → leapfrogged the campaign's pacing (unlock everything early). Fix in `GameScene.bankRunFans`: the grindy per-run haul (`runFans × setlist`) is capped for endless at `ENDLESS_FAME_BASE_CAP(200) + chaptersCleared()*ENDLESS_FAME_CAP_PER_CHAPTER(40)` — clear chapters to raise it. One-time milestones + quest/first-win bonuses pay on TOP of the cap; story is uncapped; below-cap runs untouched. End screen shows "🎤 Endless Fame capped — clear story chapters to raise it" (`endFameCapped`). Verified: cap 400@ch5 / 2600@ch60, below-cap untouched, story uncapped.

## Deep-endless perf + faster speed (2026-06-18, on `main`)

User report: lag past endless wave ~100 on phone; 2× too slow late.
- **Adaptive FX** (`src/systems/perf.ts` `perf.lowFx`): set in `GameScene.update` from live enemy count (on >55, off <35, hysteresis). When on, the fill-rate-hungry cosmetics are skipped — **projectile trails** (`Projectile.dropTrail`), **enemy ground shadows** (`Enemy` ctor), **death bursts** (`GameScene.deathBurst`). Pure eye-candy; gameplay unaffected. Reset per run. (Root cause: ~146 enemies/wave at wave 100, ×13 HP → hundreds of additive-blended sprites × 3-DPR fill.)
- **Speed tiers 1→2→3→4** (`cycleSpeed`), still gated by the existing `speed2x` unlock. Verified: cycle + timeScale + labels + lowFx threshold, zero errors.
- **Further levers if still heavy** (not done): lower the hi-DPI watchdog floor (`hidpi.ts` MIN_ADAPTIVE_DPR 2→1.5) under sustained low FPS; hide enemy HP bars at full HP; soften endless `countPerWave`/cap concurrent (balance change).

## Bug-fix + QoL pass (2026-06-17, on `main`)

Bugs:
- **P1 — prestige re-gated every feature (FIXED).** Unlocks derived from the live `completedChapters.length`, which prestige resets to 0 → Upgrades/Endless/Records/etc. vanished after Go Platinum despite the data being kept. Fix: feature unlocks now derive from a **monotonic high-water mark** (`storage.loadUnlockHighWater`/`saveUnlockHighWater`, key `karafence:maxchapters:v1`); `progression.chaptersCleared()` = `max(live, highWater)`. Bumped on menu entry (`checkUnlocks`) and set to 60 in `doPrestige`. Verified: after prestige (0 chapters, +1 platinum) all features stay visible.
- **P2 — branch skill-tree overflowed the footer on short/landscape (FIXED).** `drawBranchPanel` gap floor 30→20, node radius now clamps down, capstone caption reserved space + moved up. Verified at 740×360 — full 5-node column + capstone fits above Respec/Back.
- **P3 — `bankRunFans` idempotency guard** keyed off `endFanGain > 0` (broke if a run banked 0). Now an explicit `banked` flag (reset in init).

QoL:
- **Sell confirm** — selling an *invested* tower (any upgrade tier) now needs a 2nd "TAP AGAIN TO SELL" tap (+ error buzz); fresh towers sell instantly. (`UpgradePanel`, armed-state reset when the tower changes.)
- **Singer HP shows `N/30`** in the HUD (was a bare number).
- **Targeting labels** — `first/last/strongest` → `Lead foe / Rear foe / Toughest`.
- **Unaffordable tower tap** in the build picker now shakes + error-buzzes (was a dead tap).

QoL batch 2 (DONE, on `main`):
- **Main-menu settings** — a ⚙ button (top-right of the menu) opens a Sound / Volume / Buzz(haptics) modal (`MenuScene.openSettingsPanel`), so audio/haptics are settable up front, not just in the in-run pause menu. Verified renders + toggles reflect state.
- **Next-wave preview + boss warning** — the intermission shows "Coming up: <enemy types>" or "⚠ BOSS NEXT: <boss>" (`GameScene.nextWavePreview` via `buildWaveDef` on the stored `waveProfile`; preview line in the intermission UI). Verified normal + boss waves.

QoL batch 3 (DONE, on `main`): build-card **range/dps stats**; new-player **"👇 Tap to start"** nudge on the Story card (`text()` helper now returns the Text for tweening).

**Prestige depth sink (DONE, on `main`)** — per-platinum **perk pick** (user's choice of the 3 options). `PLATINUM_PERKS` in `meta.ts` (startGold +20%, damage +8%, combo +0.5s, cheaper −5%); each Go Platinum opens `MenuScene.openPrestigePerkPanel` to pick one; picks **stack** in `meta.platinumPerks` and fold into `metaModifiers`. Verified: effects apply (+8% dmg→1.08, +20% gold→1.2), stack count shown (×N), persist, prestige commits. **Minor follow-up:** owned perks are only shown in the pick panel — could add a summary line to Records/menu later.

- **Owned perks now shown in Records** (`drawStats`): a "✦ Perks: gold×1 · dmg×2 …" line when `platinum>0`. Verified.

### Balance — L40–60 (re-checked 2026-06-17)
- **Deterministic curve, post-tuning (reliable):** monotonic, NO cliffs/regressions in L40–60. Max enemy speed **4.28** (capped from 4.84), lives floor **6**, gold floor **210**. Only cliffs are expected structural transitions (L1→L2 tutorial→real ×8.5, L3→L4 first boss ×3.4, L16→L17 boss-cadence ×2.3). peak incoming HP grows 60 (L1) → ~78.9k (L60).
- **Auto-play attempt (unreliable, as the handoff predicted):** a headless bot with maxed account + naive spread placement leaks and loses ~wave 2 — but that measures the BOT's poor coverage (7–13 towers thinly across 6–7 lanes), not the level. Towers are confirmed maxed + firing (sample dmg 18.9, slow HP drain at 1×). **No fair win/lose verdict possible from a simple bot** — the curve above is the trustworthy signal; a true verdict needs human play. (Could add a debug god-mode/level-skip to make manual testing faster if wanted.)

## Skill-tree upgrade UI (Infinitode-style) — in progress (2026-06-16)

User wants the upgrade tiers visualized as a branching node tree (like Infinitode). Agreed: apply one node-tree visual to **all three** surfaces, shipped in phases so each can be eyeballed.
- **Phase A — per-tower branch panel (DONE, on `main`).** `MenuScene.drawBranchPanel` rewritten: tower root node → one node column per branch, connector-line `Graphics`, per-node state via `drawBranchNode` (owned=filled accent / next=glow+cost / gate=amber ★N / locked / future; capstone=gold diamond + captioned effect). Tap the actionable node to buy/unlock (reuses `buyBranchLevel`/`unlockBranch(Deep)`). Adapts portrait+landscape. Verified visually + a functional node-tap purchase; zero errors. `drawBranchNode`/`branchAxisShort` helpers added; dead `branchEffectLabel` removed.
- **Phase B — Research tab (DONE, on `main`).** `drawResearchRows` redrawn as horizontal node-ladders (name+effect left, tier-node chain right, next glows with cost / deep-tier ★ gate). Fame-buy node always "next" (buy fn guards). Verified.
- **Phase C — in-run UpgradePanel (DONE, on `main`).** `pathRow`→`drawFork`: tower root node forks into A·Power / B·Utility columns of MAX_TIER nodes with connector lines; next tier glows, cost note coloured by affordability, effect captioned, locked path (BTD6) dimmed. Verified visually + functional node-tap upgrade at dpr 3.
- **Shared primitive:** extracted `src/ui/treeNode.ts` `makeTreeNode(scene,x,y,r,opts)` (owned/next/gate/locked/future + capstone diamond, glow, cost label, ≥44px hit + pressFeedback). `MenuScene.drawBranchNode` now delegates to it; UpgradePanel uses it directly. One node language across all three upgrade surfaces.

## Progressive disclosure — Phase 1 (2026-06-16, on `main`)

Design principle (user): start simple, **unlock systems gradually** via campaign progress so there's depth without bloat. New module `src/data/progression.ts` (`FEATURE_UNLOCK` keyed to chapters cleared; `isFeatureUnlocked`; `featuresUnlockedBetween`; derived, no save migration). Phase-1 gates (verified headless at cleared 0/1/3/5/6 + minified fresh-player boot, zero errors):
- A **brand-new player** sees only the Story card + Levels.
- **@1** Fame meter + rank/stars header + Upgrades button + Research tab (and offline-Fame/login-streak grants); **@3** branch (Towers) tab; **@5** Endless card; **@6** Records button. Prestige still via `campaignComplete()`.
- Crossing a threshold → "🔓 New: …" reveal toast (`MenuScene.checkUnlocks`, `storage.loadSeenChapters`/`saveSeenChapters`; first visit silent). End-of-run Fame lines gate on `fame`, goal-ready line on `records`.
- Menu bottom-row + upgrade-modal tabs lay out dynamically from what's unlocked.
- **Note:** an existing *mid-campaign* save may see a feature re-gate until it hits the threshold (a fully-progressed save is unaffected).

**Phase 2 — Endless milestone rewards (DONE, on `main`).** `ENDLESS_MILESTONES` in `waves.ts` (wave 20→150, 30→300, 40→600, 50→1200 Fame). One-time payout in `GameScene.bankRunFans` (endless only; fixed Fame added after the multipliers, like quests); tracked in new persisted `meta.endlessMilestones: number[]` (defaulted in `defaultMeta` + merged in `loadMeta`). Surfaced as "🏅 Wave N reached — +X Fame!" on the end screen (within the `fame` gate — always unlocked in endless since it needs ≥5 chapters) + a haptic, and the Endless card teases the next unclaimed milestone. Verified headless: correct award at wave 35 ([20,30], +450), no double-pay, incremental at 41, card tease, zero errors.

**Phase 3 — synergies + dailies gating + quick wins (DONE, on `main`).**
- **Tower synergies** (`synergies @12`): "backing band" — each attacking tower gains +15% dmg per orthogonally-adjacent attacker (cap 3, +45%). `TowerManager.applySynergies` (live each frame) → `Tower.setSynergyDamage` → folded into `dealHit`. Gated via `TowerManager.synergiesEnabled` (set by GameScene from `isFeatureUnlocked('synergies')`); one-time in-run explainer (`maybeShowSynergyHint` + `storage` seen-flag).
- **`dailies @8` gating**: `refreshDaily`, the quest/first-win payout (`bankRunFans`), the setlist run-modifier + endless-card line, and the Records daily section all gate on it.
- **Quick wins**: story-card relabel after campaign complete ("↺ Replay (no ✦)", muted, steering to Go Platinum); **adaptive-DPR watchdog** in `hidpi.ts` (samples `game.loop.actualFps`, steps cap 3→2 after sustained low FPS, floored at 2, one-way).
- Verified headless: synergy ×1.15 for adjacent attackers (gated off at cleared 11), Records daily section hidden at 7 / shown at 8, reveal toasts for dailies@8 + synergies@12, story relabel at 60, DPR floor stays ≥2, zero errors.

**Deferred (needs a design choice): prestige depth sink (#3)** — once branches/research are maxed the platinum multiplier has little to buy. Options to pick from: prestige-gated higher research/branch tiers, a per-platinum permanent perk choice, or cosmetic-only sinks. Surface options to the user before building.

## Polish batch (2026-06-16, on `main`)

Shipped + headless-verified (boot, dpr2, short-landscape; zero errors):
- **Milestone juice** — new SFX `reward`/`levelUp`/`fanfare` (`audio.ts`); claim→`reward`, branch-max→`levelUp`, prestige→`fanfare`+camera flash, rank-up→`fanfare`+toast; generic meta buys→`gold` via `commitMeta(sound)`. Rank-up tracked via `storage.loadSeenRank`/`saveSeenRank`, checked in `MenuScene.create`. (Backlog #2/#6.)
- **Goal-ready surfacing** — `GameScene.fanSummaryLines` adds "🏆 N goals ready — claim in Records!" via `claimableCount`. (Backlog #2 / P3.)
- **In-run buffs readout** — pause menu shows ✦ Platinum / +%dmg / Setlist ×fans from `runMods`+`meta`. (Backlog #4 / P3.)
- **Goals-tab overflow fixed (P2)** — `achRowH` floor 20→14 + font scales with row; 12 goals fit on a 300px-tall landscape (verified). 

Remaining backlog (unbuilt): prestige depth sink (#3), weekly challenge (#5), cosmetic tower skins (#7), roguelite wave boons (#8), tower synergies (#9), endless milestone rewards (#10). The story-card vs prestige redundancy (P2) is still open.

## Visual/UX — Android (this session)

- **Shipped (verified headless @ dpr 3, 412×915 ↔ 915×412, zero console/page errors):** haptics, press feedback, safe-area, portrait hint. See CLAUDE.md "Responsive layout" + "Audio + visual polish" for the details.
- **NOT done — true high-DPI crispness (deferred, needs a decision).** Verified empirically: on a dpr-3 device the canvas backing store is **412px wide for a 412 CSS-px canvas** (1×, browser-upscaled). Phaser 3.90 `RESIZE` mode hard-sets `canvas.width = CSS px` (`ScaleManager.updateScale`) and derives the WebGL viewport **and** projection from it (`WebGLRenderer.resize`); both scene cameras also run a **bloom+vignette postFX** whose render targets size from renderer dims. The whole codebase is authored "1 unit = 1 CSS px" (layout, `TOUCH_MIN`, `BOARD_TILE`, camera shake). So true hi-DPI needs either a global coordinate-space refactor or fighting the postFX pipeline — a real, risky change, not a flag. The canvas is `image-rendering: pixelated`, so today it's **crisp-blocky, not blurry** (fine for pixel-art sprites; smooth text/gradients lose some softness). **If we take it on:** the cleanest path is supersampling — backing store at `css·dpr`, renderer at `css·dpr`, and a single global root scale of `dpr` (or render-to-texture downsample), then re-verify input mapping + shake + postFX RT sizing on a real device.

## How to build / verify / deploy

```bash
cd /Users/simon.svensson/projects/karafence
npm run build                       # tsc + vite; must be green
npx vite preview --port 4173        # serves http://localhost:4173/karafence/
# Headless (Playwright): window.game is exposed; chromium via pw.chromium ?? pw.default?.chromium
PLAYWRIGHT_PATH=/Users/simon.svensson/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js node <script>.mjs
# Deploy: merge feature branch to main + push; gh run watch the "Deploy to GitHub Pages" action.
# Network/tools (curl, gh, rsvg-convert) need dangerouslyDisableSandbox:true in Bash.
```
- Bump `LAST_PATCH` in `src/scenes/MenuScene.ts` each patch (shown bottom-left of menu).
- Commit footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Architecture pointers (the systems that changed most)

- **Economy** — two currencies (`src/data/meta.ts`):
  - **Fame** (`meta.fame`): grind currency, earned every run via `GameScene.bankRunFans` → `addFame`. Spent on research tiers + tower branch levels.
  - **Stars** (`totalStarsEarned` = ratings + `starGrant`): unlock currency only (tower unlocks, branch/deep gates, research deep gates, speed2x). `starsSpent`/`starsAvailable`.
  - `metaModifiers(meta)` returns run modifiers (startingGold, towerCost, combo, allDamage, gold, interest, fameGain, enemyHp) × `platinumMult`.
- **Per-tower branch trees** — `src/data/towerMeta.ts` (`TOWER_META_TREE`, `towerBonusFor`, `buyBranchLevel`, `respecTower`, capstones). Applied via `TowerManager` callback → `Tower.baseStats` (capstones merged max/min before run tiers).
- **Research tree** — `META_UPGRADES` in `meta.ts` (8 Fame-funded nodes, star-gated deep tiers).
- **Prestige** — `meta.platinum`, `platinumMult`; UI in `MenuScene` (`campaignComplete`, `requestPrestige`, `doPrestige`).
- **Achievements** — `src/data/achievements.ts` (computed from existing stats); UI in `MenuScene` Records "Goals" tab (`drawAchievements`, claim-all).
- **Offline Fame** — `meta.lastSeen`, `MenuScene.grantOffline`, welcome toast (`welcomeLines`/`showWelcomeToast`).
- **Save migration** — `storage.loadMeta`: pre-Fame saves (`fans`/`fanStars`/`towerLevels`) convert once to `fame` + `starGrant`; new fields (`platinum`/`achievements`/`lastSeen`) default-merged. Invariant: stars only INCREASE across migration (no loss). Detection: `typeof saved.fame !== 'number'`.
- **Campaign** — `src/data/campaign.ts` `makeLevel(i)`, `CAMPAIGN` length **60**; `nameFor(i)` (40 puns + procedural fallback; 58→"The Grand Stage", 59→"The Final Countdown"). Finale story beats moved to `level59`/`level60` in `src/data/story.ts` (closing beats fire at `FINALE_WAVES`).

## Verified (headless) this session

- Save migration: legacy save → Fame=fans+towerLevels×150, starGrant=fanStars, no double-migrate, no loss.
- Branch + capstone + research reach combat (base 9 dmg → 16.2 with branch A5 + Amplifier 5; pierce 3 capstone; +0.5 range).
- 60 chapters present; level grid fits.
- Offline Fame (3h → +75), achievement claim (+exact Fame, marked claimed), prestige (✦1, campaign reset, Fame+build kept).
- Full story+endless play with attacker + both support towers: **zero console/page errors**.

---

## BUG FINDINGS (prioritized)

### P1 — verify before trusting
- **[BALANCE] Level ~40–60 winnability — PROBED (deterministic curve), not yet play-tested.** Ran a headless probe (dev-server dynamic-import of the real `campaign`/`waves`/`enemies`/`towers`/`meta`/`towerMeta` modules; computed maxed-meta multipliers + per-wave incoming effective HP for all 60 levels). Findings:
  - **No plateau; steepens to the end.** Peak incoming wave HP grows 53 (L1) → ~69,400 (L60); enemy speed 0.62× → **4.84×**; `maxLivesLost` 12 → **5**; maxed starting gold 622 → **269**. The four hardest knobs (HP↑, speed↑, lives↓, gold↓) all tighten together at the top, and `lanes` go 3→7 / build-tiles 56→112 — so late levels ask you to cover the *widest* board with the *least* starting money and *least* error margin. This compounding is the main winnability risk; the curve never eases off.
  - **Lumpy / sawtooth finales.** Per-level *final-wave* difficulty swings 2–3× between adjacent levels because (a) whether the last wave lands on a boss depends on `waveCount % bossEvery` alignment, and (b) `buildWaveDef`'s rotating type pick (`(index+i) % pool.length`) can drop a tanky type (Phone Scroller 120hp, etc.) into the final wave. E.g. L29 final ≈1.5k vs L30 ≈9.3k; L47 ≈13k vs L48 ≈38k. Difficulty isn't smooth from level to level — a polish smell.
  - **Cliffs at boss-cadence transitions** (`bossEvery` 5→4 at i≥12, 4→3 at i≥30): peak HP jumps e.g. ×2.35 at L16→L17.
  - **Speed is the scariest single knob:** `enemySpeedMultiplier`(≤2.2) × per-wave `speedScale`(≤2.6) → ~4.8× at L60. With `maxLivesLost`=5, a single leak streak ends the run.
  - **Caveat — winnable/unwinnable not settled.** A crude single-target DPS-vs-pressure margin went <1 from ~L17 up, **but that metric ignores run-tier upgrades (pierce/double-fire/multi-target), the Backup Singer attack-speed aura, Drummer/Bass AoE, and the full lane-traversal kill window** — all large in real play — so it is a floor, not proof of unwinnability. **Next step to settle it: an actual play-through of L48–60 with a maxed account** (auto-play is unreliable for this).
  - **Suggested tuning levers if it plays too hard:** lower the speed ceilings (`enemySpeedMultiplier` cap 2.2→~1.8, `speedCap` 2.6→~2.2); smooth the boss sawtooth (e.g. force the final wave to a boss only every other level, or scale `bossHpPerCycle` down late); ease the economy squeeze (raise the `startingGold` floor or steepen `cheaperTowers`/`startingGold` research late); raise the `maxLivesLost` floor (5→~7). Knobs all in `campaign.ts` `makeLevel` + `waves.ts`.
  - **APPLIED (conservative first pass, 2026-06-15, on `main`):** `speedCap` 2.6→**2.3**, `enemySpeedMultiplier` cap 2.2→**2.0** (L60 final speed ~4.84→~4.28), `maxLivesLost` floor 4→**6** (late = 6, was 5), `startingGold` floor 180→**210**. Gentle on purpose — the DPS metric underestimates player power, so we softened only the scariest top-end knobs without risking trivialising it. **Still wants a real L48–60 play-through**, and the boss/type-rotation **sawtooth is untouched** (structural — see levers above).

### DONE this session — true High-DPI crispness (shipped)
Implemented `src/systems/hidpi.ts` (`installHiDPI`, wired in `main.ts`): supersamples to `cssSize × devicePixelRatio` (cap 3×) while keeping all layout in CSS px. Backing store + renderer (→ postFX RTs) go physical; each camera maps CSS world → buffer with `origin (0,0)`, `zoom = dpr`, `scroll = 0`; `displayScale = dpr` keeps input exact. No-op at dpr 1. **Verified headless at dpr 1/2/3** (canvas/renderer/displayScale/camera all correct; tap→tile mapping exact at far-from-origin tiles; clean through a portrait↔landscape rotation; production-build boot clean). The earlier "deferred / too risky" note is now obsolete. If a low-end device struggles, lower `MAX_DPR` in `hidpi.ts`.

### P2 — real but minor
- **Goals tab can overflow on very short landscape screens.** In `MenuScene.openRecordsPanel`, `achRowH = Math.max(20, Math.min(26, floor(maxBody/12)))` — the `max(20)` floor ignores the fit, so with 12 achievements on a short (≈≤380px tall) viewport the rows overrun the panel/footer. Fix: drop the floor (allow smaller), or paginate/scroll the list. Low impact (Records is usually viewed tall/portrait).
- **Story card vs Prestige redundancy.** After campaign completion, the Story card's "▶ Play" still routes to `requestNewGame('story')` which *wipes* completed chapters for no reward, while "✦ GO PLATINUM" wipes them *and* grants the multiplier. A player could New-Game by habit and skip the prestige reward (recoverable next completion). Improvement: when `campaignComplete()`, relabel the story New Game or steer toward Platinum.

### P3 — cosmetic / edge
- **No "goal ready" surfacing outside Records.** Newly-earned achievements only show via the menu Records ● badge; no end-screen/toast pop when one becomes claimable. (See improvements.)
- **Player can't see active multipliers in-run** (platinum ✦, research %s). Purely informational.
- **Offline Fame on quick menu↔game bounce** grants a tiny trickle (minutes in-game → ~1–2 Fame on return). Harmless; `grantOffline` already ignores <0.05h.

### Checked, NOT bugs
- Capstone + run-tier pierce/slow/stun use max/min merges → never regress. ✔
- Support towers ignore damage/capstones (don't fire); only range + `auraMult` apply. ✔
- Migration windfall (old global upgrades reinterpreted as free Fame tiers; refunded tower-level stars) is in the safe direction (more resources, never less). ✔
- Prestige keeps `meta.stars` (ratings) so the all-stars total persists; re-clearing grants no new stars (best kept) — by design. ✔
- No leftover refs to removed symbols (`bankFans`/`FAN_PER_STAR`/`towerLevels`/`towerUpgradeCost`) in active code; no TODO/FIXME; no `as any`. ✔

---

## IMPROVEMENT IDEAS (not yet built; ordered by value)

1. **Playtest/auto-balance pass on the 60-level curve** (P1 above) — the biggest open risk after this much content was added.
2. **Achievement-ready toast** — pop "🏆 Goal ready: <name>" on the end screen / menu when a run newly satisfies one, so players notice without opening Records.
3. **Prestige depth sink** — once branches/research are maxed, the platinum multiplier has little to buy. Consider prestige-gated higher research/branch tiers, or a small per-platinum permanent perk choice, so prestige keeps mattering.
4. **In-run "buffs" readout** — a small HUD line or pause-menu panel showing active multipliers (✦, Amplifier, Setlist) so investment feels visible.
5. **Weekly challenge** — a bigger sibling of Tonight's Setlist (fixed weekly modifier + chunky reward); reuses `setlist.ts` + quests.
6. **Juice/audio** — sfx + flourish on branch-max, rank-up, prestige, and achievement claim. Maxing a branch should feel like an event.
7. **Cosmetic tower skins** bought with Fame — a power-neutral Fame sink/collectible for late game.
8. **Roguelite wave boons** — between waves, occasionally pick 1 of 3 temporary buffs (reuses intermission). Adds run-to-run variety.
9. **Tower synergies** — adjacency bonuses (e.g. Lead Singer next to Backup Singer). Deeper placement; more combat work.
10. **Endless milestone rewards** — one-time Fame/unlock payouts for first reaching wave 20/30/40 (beyond the best-wave chase).

## Outstanding decisions for the user

- [ ] Deploy `addictive-2` (prestige/achievements/offline) to `main`?
- [ ] Delete merged branches `meta-depth` (already in main) and, after deploy, `addictive-2`?
- [ ] Prioritize the level-curve playtest (P1) next?
