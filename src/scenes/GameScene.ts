import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { LEVEL_BY_ID, type LevelId } from '../data/levels';
import { type MapDefinition } from '../types/map';
import {
  computeGridLayout,
  computeScreenLayout,
  fitTransform,
  tileToWorld,
  type GridLayout,
  type ScreenLayout,
  type BoardLayers,
} from '../systems/grid';
import { WaveManager } from '../systems/WaveManager';
import type { Enemy } from '../systems/Enemy';
import { TowerManager } from '../systems/TowerManager';
import type { Tower } from '../systems/Tower';
import { BuildPanel } from '../ui/BuildPanel';
import { UpgradePanel } from '../ui/UpgradePanel';
import {
  STARTING_GOLD,
  TOWER_TYPES,
  type TowerTypeKey,
  type UpgradePathKey,
} from '../data/towers';
import { BOSS_CONFIG, ENEMY_TYPES, type EnemyType } from '../data/enemies';
import { ENDLESS_PROFILE, endlessMilestonesUpTo, buildWaveDef, type WaveProfile } from '../data/waves';
import {
  metaModifiers,
  defaultMeta,
  addFame,
  towerBonusFor,
  isTowerAvailable,
  isUnlocked,
  type MetaProgress,
} from '../data/meta';
import { questById, FIRST_WIN_FANS, dateKey, type RunStats } from '../data/quests';
import { pickSetlist } from '../data/setlist';
import type { GameMode } from '../data/modes';
import { beatsAfterWave, nextChapter, CHAPTER_ORDER } from '../data/story';
import {
  loadMeta,
  saveMeta,
  loadRun,
  saveRun,
  clearRun,
  saveEndlessBest,
  saveEndlessBestScore,
  loadEndlessBest,
  loadStoryProgress,
  saveStoryProgress,
  loadSeenSynergyHint,
  saveSeenSynergyHint,
} from '../systems/storage';
import { claimableCount } from '../data/achievements';
import { isFeatureUnlocked } from '../data/progression';
import { rollBoons, type Boon, type BoonCtx } from '../data/boons';
import { AFFIX_MIN_WAVE } from '../data/affixes';
import { perf } from '../systems/perf';
import { audio } from '../systems/audio';
import { haptics } from '../systems/haptics';
import { pressFeedback } from '../systems/touch';
import { addNeonCameraFX } from '../systems/fx';
import { DialogueOverlay } from '../ui/DialogueOverlay';
import { TX, enemyTextureKey } from '../systems/textures';
import { TileType } from '../types/map';

/** A venue-signage control-bar button: neon glow + framed rect + label. */
interface BarButton {
  glow: Phaser.GameObjects.Rectangle;
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

/** Map each tile type to its generated (grayscale, tinted at use) texture key. */
const TILE_TEXTURE: Record<TileType, string> = {
  [TileType.Stage]: TX.tileStage,
  [TileType.Aisle]: TX.tileAisle,
  [TileType.Build]: TX.tileBuild,
};

const SINGER_MAX_HP = 30;
const COMBO_WINDOW = 2.5; // seconds between kills to keep the combo alive
const COMBO_BONUS = 0.15; // gold bonus per combo step
const OVERDRIVE_SECONDS = 4; // duration of the x2-fans Encore overdrive window
const INTERMISSION_SECONDS = 12;

// Screen-furniture depths (scene root). The board container sits below these.
const DEPTH_BOARD = 1;
const DEPTH_HUD = 100;
const DEPTH_BAR = 110;
const DEPTH_BOSSBAR = 135;
const DEPTH_OVERLAY = 200;

/**
 * GameScene renders the lane grid + stage and runs the whole game loop: waves,
 * towers, the gold/combo/interest economy, intermissions, and the shop.
 *
 * Layout model (Scale.RESIZE): the lane grid is built once at a fixed
 * board-local tile size into the `board` container (split into ordered
 * `layers`); `fitBoard()` scales + positions that container to fill the board
 * region between a top HUD strip and a bottom control bar. All HUD / control /
 * overlay chrome is screen-space and reflows in `relayout()` on every resize,
 * so the game is fully playable in portrait and landscape.
 */
export class GameScene extends Phaser.Scene {
  private mode: GameMode = 'story';
  private levelId: LevelId = 'level1';
  private resume = false;
  private map!: MapDefinition;
  private layout!: GridLayout;
  private screen!: ScreenLayout;
  private waves!: WaveManager;
  private towers!: TowerManager;
  private buildPanel!: BuildPanel;
  private upgradePanel!: UpgradePanel;
  /** Gold the currently-open build/upgrade panel was built with, so it can be
   * rebuilt live when gold changes (affordability updates without reopening). */
  private panelGold = -1;
  private dialogue!: DialogueOverlay; // story-mode between-wave dialogue

  // Board container + its ordered z-layers (see grid.ts BoardLayers).
  private board!: Phaser.GameObjects.Container;
  private layers!: BoardLayers;

  // Meta-progression (persisted): loaded fresh each run; modifiers applied below.
  private meta!: MetaProgress;
  private towerCostMult = 1; // Group Discount meta-upgrade
  private comboWindow = COMBO_WINDOW; // extended by Crowd Memory meta-upgrade

  private singerHp = SINGER_MAX_HP;
  private gold = STARTING_GOLD;
  private buildTarget: { col: number; row: number } | null = null;
  private gameOver = false;
  private paused = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  /** Which pause view is showing: the menu, or the enemy guide. */
  private pauseView: 'menu' | 'bestiary' = 'menu';

  // Singer (stage performer) — kept so it can bounce when nearby foes fall.
  private singer?: Phaser.GameObjects.Container;
  private singerFigure?: Phaser.GameObjects.Image; // the figure (flashes on hit)
  private singerTween?: Phaser.Tweens.Tween;

  // Combo "Crowd Hype" meter pulse at high multipliers.
  private comboPulse?: Phaser.Tweens.Tween;

  // Boss hp last frame, so we can shake the camera in proportion to hits taken.
  private bossPrevHp = 0;

  // Run scoring (for stars) + resume bookkeeping.
  private goldSpent = 0;
  private highestCombo = 0;
  private resumeWaveIndex = 0;
  // This-run tallies (endless "you survived" screen).
  private runKills = 0;
  private goldEarned = 0;
  // Fans earned this run (kills×combo, waves, milestones, crate); banked at run
  // end (win OR loss) into the meta fan meter → bonus stars. See data/meta.ts.
  private runFans = 0;
  private endlessFanMilestone = 0; // last endless wave that paid a fan milestone
  private endlessBestAtStart = 0; // best endless wave when this run began (chase)
  private overdriveTimer = 0; // seconds left of the Encore overdrive (x2 fans)
  private runFanMult = 1; // Tonight's Setlist fan multiplier (endless only)
  private runMods = metaModifiers(defaultMeta()); // research modifiers for this run
  private setlistName = ''; // active setlist name (endless), '' = none

  // Crowd Hype combo.
  private combo = 0;
  private comboTimer = 0;

  // Intermission between waves.
  private intermissionActive = false;
  private intermissionRemaining = 0;
  private intermissionUi?: Phaser.GameObjects.Container;
  private waveProfile!: WaveProfile; // active profile (for the next-wave preview)

  // Pre-wave planning prompt (manual "Start Wave 1" on a fresh run).
  private startPrompt?: Phaser.GameObjects.Container;
  // Game speed (1 or 2). Scales movement (dt), the spawn/freeze clock and tweens.
  private gameSpeed = 1;

  // Active boss + its ability state.
  private activeBoss: Enemy | null = null;
  private bossAbilityTimer = 0;
  private bossPhase2 = false;
  private bossPhase3 = false;
  private bossBar?: Phaser.GameObjects.Container;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  private bossBarLabel?: Phaser.GameObjects.Text;

  // HUD strip (screen-space).
  private hudBg!: Phaser.GameObjects.Rectangle;
  private hudBorder!: Phaser.GameObjects.Rectangle; // neon bottom edge
  private titleText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private waveIcon!: Phaser.GameObjects.Image; // spotlight motif
  private hpText!: Phaser.GameObjects.Text;
  private hpIcon!: Phaser.GameObjects.Image; // mic
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Image; // red→pink energy gradient
  private hpBarW = 0;
  private goldText!: Phaser.GameObjects.Text;
  private goldIcon!: Phaser.GameObjects.Image; // coin
  private comboText!: Phaser.GameObjects.Text;
  private eqBars: Phaser.GameObjects.Rectangle[] = []; // crowd-energy EQ meter
  private statusText!: Phaser.GameObjects.Text;

  // Bottom control bar (screen-space).
  private barBg!: Phaser.GameObjects.Rectangle;
  private menuBtn!: BarButton;
  private speedBtn?: BarButton; // 1×/2× game speed toggle (meta-unlocked)

  // Terminal-state overlay (victory / game over / chapter), re-rendered on resize.
  private endState: 'none' | 'victory' | 'gameover' | 'chapter' = 'none';
  private endStars = 0;
  private endGained = 0;
  private endBestWave = 0; // endless: best wave after this run
  private endNewRecord = false; // endless: did this run set a new best?
  private endScore = 0; // endless: this run's score
  private endBestScore = 0; // endless: best score after this run
  private nextChapterId: LevelId | null = null; // story: chapter to advance to
  // Fame payout for the just-ended run (shown on the end screen).
  private endFanGain = 0;
  private banked = false; // run rewards banked this run (idempotency guard)
  private boonGoldMult = 1; // "Merch Rush" boon — extra kill gold for one wave
  private boonUi: Phaser.GameObjects.GameObject[] = []; // between-wave boon choices
  private endQuestNames: string[] = [];
  private endFirstWin = false; // first won run of the day (bonus paid)
  private endMilestoneLines: string[] = []; // endless wave milestones hit this run
  private endOverlay: Phaser.GameObjects.GameObject[] = [];

  private resizeHandler = () => this.relayout();

  constructor() {
    super('GameScene');
  }

  private get sw(): number {
    return this.scale.width;
  }
  private get sh(): number {
    return this.scale.height;
  }

  /**
   * Phaser reuses the scene instance across `scene.start`, so every run must
   * reset all mutable state here (field initializers only run once).
   */
  init(data: { mode?: GameMode; levelId?: LevelId; resume?: boolean }): void {
    this.mode = data.mode ?? 'story';
    this.levelId = data.levelId ?? 'level1';
    // Guard against a stale/corrupt level id (e.g. an old save) so an unknown
    // level falls back to the first chapter instead of crashing on an undefined map.
    if (!LEVEL_BY_ID[this.levelId]) this.levelId = 'level1';
    this.resume = data.resume ?? false;
    this.map = LEVEL_BY_ID[this.levelId];

    this.singerHp = SINGER_MAX_HP;
    this.gold = STARTING_GOLD;
    this.runKills = 0;
    this.goldEarned = 0;
    this.runFans = 0;
    this.endlessFanMilestone = 0;
    this.overdriveTimer = 0;
    this.runFanMult = 1;
    this.setlistName = '';
    this.buildTarget = null;
    this.gameOver = false;
    this.paused = false;
    this.pauseUi = [];
    this.singer = undefined;
    this.singerFigure = undefined;
    this.singerTween = undefined;
    this.comboPulse = undefined;
    this.eqBars = [];
    this.bossPrevHp = 0;
    this.goldSpent = 0;
    this.highestCombo = 0;
    this.resumeWaveIndex = 0;

    this.combo = 0;
    this.comboTimer = 0;

    this.intermissionActive = false;
    this.intermissionRemaining = 0;
    this.intermissionUi = undefined;
    this.startPrompt = undefined;
    this.gameSpeed = 1;
    perf.lowFx = false;
    this.boonGoldMult = 1;
    this.boonUi = [];

    this.activeBoss = null;
    this.bossAbilityTimer = 0;
    this.bossPhase2 = false;
    this.bossPhase3 = false;
    this.bossBar = undefined;
    this.bossBarFill = undefined;
    this.bossBarLabel = undefined;

    this.endState = 'none';
    this.endBestWave = 0;
    this.endNewRecord = false;
    this.endScore = 0;
    this.endBestScore = 0;
    this.nextChapterId = null;
    this.endFanGain = 0;
    this.banked = false;
    this.endQuestNames = [];
    this.endFirstWin = false;
    this.endMilestoneLines = [];
    this.endOverlay = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.cameras.main.fadeIn(350, 11, 11, 18);
    addNeonCameraFX(this.cameras.main);
    // Reset speed scaling (the scene instance + its clock are reused across runs).
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.screen = computeScreenLayout(this.sw, this.sh);

    // Load meta-progression and apply its permanent modifiers to this run.
    this.meta = loadMeta();
    this.endlessBestAtStart = this.mode === 'endless' ? loadEndlessBest() : 0;
    const mods = metaModifiers(this.meta);
    this.runMods = mods;
    this.gold = Math.round((this.map.startingGold ?? STARTING_GOLD) * mods.startingGoldMult);
    this.towerCostMult = mods.towerCostMult;
    this.comboWindow = COMBO_WINDOW + mods.comboWindowBonus;

    // Board-local layout (fixed tile size, origin 0,0) + the board container.
    this.layout = computeGridLayout(this.map);
    this.createBoard();

    this.drawHud();
    this.drawControlBar();
    this.drawMap(this.layout);

    // Endless: apply today's "Tonight's Setlist" twist to the wave profile and
    // its fan reward multiplier (a fresh daily reason to replay the same map).
    let profile = this.map.waveProfile ?? ENDLESS_PROFILE;
    if (this.mode === 'endless' && isFeatureUnlocked('dailies')) {
      const setlist = pickSetlist(dateKey(new Date()));
      profile = setlist.tweak(profile);
      this.runFanMult = setlist.fanMult;
      this.setlistName = setlist.fanMult > 1 ? setlist.name : '';
    }
    this.waveProfile = profile; // kept for the next-wave intermission preview

    this.waves = new WaveManager(
      this,
      this.map,
      this.layout,
      {
        onReachStage: (enemy) => this.onEnemyReachStage(enemy),
        onKill: (enemy) => this.onEnemyKilled(enemy),
        onWaveCleared: () => this.onWaveCleared(),
        onBossSpawn: (enemy) => this.onBossSpawn(enemy),
      },
      this.layers.enemies,
      profile,
      this.mode === 'endless',
      mods.enemyHpMult,
    );

    this.towers = new TowerManager(
      this,
      this.map,
      this.layout,
      this.waves.enemies,
      this.layers,
      // Fold the global "Amplifier" research into every tower's damage bonus.
      (key) => {
        const b = towerBonusFor(this.meta, key);
        return { ...b, damageMult: b.damageMult * mods.allDamageMult };
      },
    );
    this.towers.synergiesEnabled = isFeatureUnlocked('synergies');
    this.towers.onSelectionChange = (tower) => this.onTowerSelection(tower);
    this.buildPanel = new BuildPanel(this);
    this.upgradePanel = new UpgradePanel(this);
    this.dialogue = new DialogueOverlay(this);
    this.setupInput();

    this.relayout(); // size board + chrome to the current viewport
    this.scale.on('resize', this.resizeHandler);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeHandler));

    const saved = this.resume ? loadRun(this.mode, this.levelId) : null;
    if (saved) {
      // Resume: restore economy + towers, replay the saved wave from its start.
      this.gold = saved.gold;
      this.singerHp = saved.singerHp;
      this.goldSpent = saved.goldSpent;
      this.highestCombo = saved.highestCombo;
      this.resumeWaveIndex = saved.resumeWaveIndex;
      this.towers.restore(saved.towers);
      this.waves.startAtWave(saved.resumeWaveIndex);
    } else {
      this.resumeWaveIndex = 0;
      this.saveRunState();
      // Fresh run: build/plan first, then start wave 1 manually. Story chapters
      // play their `waveAfter: 0` intro beat before the planning prompt appears.
      const intro = this.mode === 'story' ? beatsAfterWave(this.levelId, 0) : [];
      if (intro.length > 0) {
        this.dialogue.show(intro, () => this.showStartPrompt());
      } else {
        this.showStartPrompt();
      }
    }
    this.refreshHud();
    this.ambientNotes();
    this.showVenueCard();
    this.maybeShowSynergyHint();
    audio.playMusic('inWave');
  }

  /** Faint musical notes drifting up across the venue — subtle atmosphere. */
  private ambientNotes(): void {
    this.add
      .particles(0, 0, TX.projNote, {
        x: { min: 0, max: this.sw },
        y: this.sh + 16,
        lifespan: 7000,
        frequency: 1100,
        speedY: { min: -34, max: -16 },
        speedX: { min: -10, max: 10 },
        scale: { min: 0.4, max: 0.85 },
        rotate: { min: -25, max: 25 },
        alpha: { start: 0.16, end: 0 },
        blendMode: 'ADD',
      })
      .setDepth(DEPTH_BOARD + 1);
  }

  /** A brief centered "now playing: {venue}" title card that fades on entry. */
  private showVenueCard(): void {
    const name = this.setlistName
      ? `🎤 ${this.map.name}\n🎵 Tonight: ${this.setlistName} · ${this.runFanMult}× fans`
      : `🎤 ${this.map.name}`;
    const card = this.add
      .text(this.sw / 2, this.sh * 0.32, name, {
        fontFamily: 'monospace',
        fontSize: `${Math.round(Phaser.Math.Clamp(this.sw / 22, 18, 34))}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 30)
      .setAlpha(0);
    card.setShadow(0, 0, '#e84393', 16, true, true);
    this.tweens.add({ targets: card, alpha: 1, duration: 320, yoyo: true, hold: 1400, onComplete: () => card.destroy() });
  }

  /** One-time teach for the adjacency synergy, the first run after it unlocks. */
  private maybeShowSynergyHint(): void {
    if (!this.towers.synergiesEnabled || loadSeenSynergyHint()) return;
    saveSeenSynergyHint(true);
    const hint = this.add
      .text(
        this.sw / 2,
        this.sh * 0.46,
        '🎶 New: Band Synergy!\nLine performers up side-by-side for +damage',
        {
          fontFamily: 'monospace',
          fontSize: `${Math.round(Phaser.Math.Clamp(this.sw / 32, 12, 17))}px`,
          color: '#ffd166',
          align: 'center',
          backgroundColor: '#1b1320dd',
          padding: { x: 12, y: 8 },
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 30)
      .setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 1, duration: 320, yoyo: true, hold: 2600, onComplete: () => hint.destroy() });
  }

  // --- Board container + layers -------------------------------------------

  private createBoard(): void {
    const mk = () => this.add.container(0, 0);
    this.layers = {
      tiles: mk(),
      range: mk(),
      enemies: mk(),
      towers: mk(),
      projectiles: mk(),
      fx: mk(),
    };
    this.board = this.add
      .container(0, 0, [
        this.layers.tiles,
        this.layers.range,
        this.layers.enemies,
        this.layers.towers,
        this.layers.projectiles,
        this.layers.fx,
      ])
      .setDepth(DEPTH_BOARD);
  }

  /** Scale + position the board container to fill the board region. */
  private fitBoard(): void {
    const t = fitTransform(this.layout.mapW, this.layout.mapH, this.screen.board);
    this.board.setScale(t.scale).setPosition(t.x, t.y);
  }

  // --- Responsive relayout -------------------------------------------------

  /** Recompute the screen layout and reflow every screen-space element. */
  private relayout(): void {
    this.screen = computeScreenLayout(this.sw, this.sh);
    this.fitBoard();
    this.positionHud();
    this.positionControlBar();
    this.positionBossBar();
    this.positionIntermission();
    this.positionStartPrompt();

    // Transient panels re-anchor cleanly by closing; reopen the upgrade panel
    // for the still-selected tower so its Activate button stays reachable.
    this.buildPanel.close();
    if (this.buildTarget) this.closeBuild();
    const sel = this.towers?.selectedTower ?? null;
    if (sel) this.openUpgradePanel(sel);

    if (this.endState !== 'none') this.renderEndScreen();
    if (this.paused) this.renderPause();
    this.dialogue?.relayout();
  }

  /** Effective placement cost after the Group Discount meta-upgrade. */
  private towerCost(type: TowerTypeKey): number {
    return Math.round(TOWER_TYPES[type].cost * this.towerCostMult);
  }

  /** Persist the current run so the player can close and resume later. */
  private saveRunState(): void {
    if (this.gameOver) return;
    saveRun({
      mode: this.mode,
      levelId: this.levelId,
      resumeWaveIndex: this.resumeWaveIndex,
      gold: this.gold,
      singerHp: this.singerHp,
      goldSpent: this.goldSpent,
      highestCombo: this.highestCombo,
      towers: this.towers.serialize(),
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.paused) return;
    // Movement + tick functions scale by gameSpeed; the spawn/freeze clock and
    // tweens are scaled separately via time/tweens.timeScale in cycleSpeed().
    const dt = (delta / 1000) * this.gameSpeed;
    // Adaptive FX: drop cosmetic overdraw once the board gets crowded (deep
    // endless), with hysteresis so it doesn't flicker on/off each frame.
    const alive = this.waves.enemies.size;
    if (!perf.lowFx && alive > 55) perf.lowFx = true;
    else if (perf.lowFx && alive < 35) perf.lowFx = false;
    this.waves.update(dt);
    this.towers.update(dt);
    this.tickCombo(dt);
    if (this.overdriveTimer > 0) this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);
    this.tickIntermission(dt);
    this.driveBoss(dt);
    this.refreshHud();
    this.syncOpenPanel();
  }

  // --- Input / placement ---------------------------------------------------

  private setupInput(): void {
    // A board-sized zone (bottom of the board) catches taps on empty tiles.
    // Tower bodies sit in a higher layer so taps on a tower hit the tower.
    const zone = this.add
      .zone(0, 0, this.layout.mapW, this.layout.mapH)
      .setOrigin(0, 0)
      .setInteractive();
    this.layers.tiles.add(zone);
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onMapClick(pointer));
  }

  /** Convert a pointer to board-local coordinates (the board is scaled). */
  private pointerToBoard(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return {
      x: (pointer.worldX - this.board.x) / this.board.scaleX,
      y: (pointer.worldY - this.board.y) / this.board.scaleY,
    };
  }

  private onMapClick(pointer: Phaser.Input.Pointer): void {
    if (this.gameOver || this.buildPanel.isOpen) return;
    const { x, y } = this.pointerToBoard(pointer);
    const { tileSize } = this.layout;
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);

    // A bare map click clears any selection; on a buildable tile, open the
    // tower picker for that tile. (Clicks on a tower are handled by the tower.)
    this.towers.deselect();
    if (this.towers.canPlace(col, row)) {
      this.buildTarget = { col, row };
      this.towers.showBuildOverlay(col, row);
      this.openBuildPanel();
    } else if (
      col >= 0 &&
      row >= 0 &&
      col < this.map.cols &&
      row < this.map.rows &&
      this.map.tiles[row][col] !== TileType.Stage
    ) {
      // Tapping a non-buildable spot (e.g. an aisle): a quick red flash so the
      // "can't build here" feedback is unmistakable.
      this.flashInvalidTile(col, row);
    }
  }

  /** (Re)build the tower-picker modal for the current `buildTarget` + gold. */
  private openBuildPanel(): void {
    this.buildPanel.open(
      this.gold,
      (type) => this.placeTower(type),
      () => this.closeBuild(),
      (type) => this.towerCost(type),
      (type) => isTowerAvailable(this.meta, this.reachedLevel(), type),
    );
    this.panelGold = this.gold;
  }

  /** 1-based campaign level reached (endless = everything unlocked). */
  private reachedLevel(): number {
    return this.mode === 'endless' ? 99 : CHAPTER_ORDER.indexOf(this.levelId) + 1;
  }

  /** Brief red flash on a tile the player can't build on. */
  private flashInvalidTile(col: number, row: number): void {
    haptics.play('error');
    const { x, y } = tileToWorld(this.layout, col, row);
    const ts = this.layout.tileSize;
    const flash = this.add
      .rectangle(x, y, ts - 1, ts - 1, 0xff4d4d, 0.45)
      .setStrokeStyle(2, 0xff6b6b, 0.9);
    this.layers.fx.add(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private placeTower(type: TowerTypeKey): void {
    const target = this.buildTarget;
    const cost = this.towerCost(type);
    if (target && this.gold >= cost && this.towers.canPlace(target.col, target.row)) {
      this.gold -= cost;
      this.goldSpent += cost;
      this.towers.placeTower(type, target.col, target.row, cost);
      haptics.play('place');
      const { x, y } = tileToWorld(this.layout, target.col, target.row);
      this.fxBurst(x, y, TOWER_TYPES[type].color);
      this.refreshHud();
      this.saveRunState();
    }
    this.closeBuild();
  }

  /** A short expanding glow ring + spark burst (tower placed / upgraded). */
  private fxBurst(x: number, y: number, color: number): void {
    const ts = this.layout.tileSize;
    const ring = this.add
      .image(x, y, TX.glow)
      .setDisplaySize(ts * 0.6, ts * 0.6)
      .setTint(color)
      .setAlpha(0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.layers.fx.add(ring);
    this.tweens.add({
      targets: ring,
      scale: ring.scale * 2.6,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
    const em = this.add.particles(x, y, 'spark', {
      lifespan: 360,
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      blendMode: 'ADD',
      emitting: false,
    });
    this.layers.fx.add(em);
    em.explode(9);
    this.time.delayedCall(420, () => em.destroy());
  }

  private closeBuild(): void {
    this.buildPanel.close();
    this.towers.hideBuildOverlay();
    this.buildTarget = null;
  }

  private quitToMenu(): void {
    if (!this.gameOver) this.saveRunState();
    // Clear any pause so the clock/tweens resume cleanly for the next run.
    this.time.paused = false;
    this.tweens.resumeAll();
    this.paused = false;
    this.fadeToScene('MenuScene');
  }

  /** Fade the camera out, then switch scenes (the target fades itself in). */
  private fadeToScene(key: string): void {
    this.cameras.main.fadeOut(280, 11, 11, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key));
  }

  // --- Pause menu (with audio controls) ------------------------------------

  /**
   * Freeze the run (clock + tweens) and show an overlay with Resume, the
   * mute/volume controls, and Quit to menu. Input still flows, so the overlay
   * buttons stay live while everything else is held.
   */
  private openPauseMenu(): void {
    if (this.gameOver || this.paused) return;
    this.paused = true;
    this.pauseView = 'menu';
    this.towers.deselect();
    this.closeBuild();
    this.time.paused = true;
    this.tweens.pauseAll();
    this.renderPause();
  }

  /** Draw whichever pause view is active (menu or enemy guide). */
  private renderPause(): void {
    if (this.pauseView === 'bestiary') this.renderBestiary();
    else this.renderPauseMenu();
  }

  private closePauseMenu(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseView = 'menu';
    this.time.paused = false;
    this.tweens.resumeAll();
    this.pauseUi.forEach((o) => o.destroy());
    this.pauseUi = [];
  }

  /** (Re)draw the pause overlay centered on the current viewport. */
  private renderPauseMenu(): void {
    this.pauseUi.forEach((o) => o.destroy());
    this.pauseUi = [];
    if (!this.paused) return;
    const cx = this.sw / 2;
    const cy = this.sh / 2;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.pauseUi.push(o);
      return o;
    };

    track(
      this.add
        .rectangle(cx, cy, this.sw, this.sh, 0x000000, 0.66)
        .setDepth(DEPTH_OVERLAY)
        .setInteractive(),
    );
    track(
      this.add
        .text(cx, cy - 120, '⏸ PAUSED', {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#e84393',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_OVERLAY + 1),
    );

    // Active-buffs readout — make the meta investment powering this run visible.
    const buffs: string[] = [];
    const plat = this.meta.platinum ?? 0;
    if (plat > 0) buffs.push(`✦${plat} Platinum`);
    const dmgPct = Math.round((this.runMods.allDamageMult - 1) * 100);
    if (dmgPct > 0) buffs.push(`+${dmgPct}% dmg`);
    if (this.runFanMult > 1) buffs.push(`🎵 ${this.runFanMult}× fans`);
    if (buffs.length > 0) {
      track(
        this.add
          .text(cx, cy - 90, buffs.join('   ·   '), {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffd166',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
    }

    const w = Math.max(200, Math.min(300, this.sw * 0.7));

    // Sound toggle — paired with a Haptics toggle on the same row where the
    // device supports vibration (Android), else full-width.
    if (haptics.supported) {
      const half = (w - 10) / 2;
      this.pauseButton(cx - half / 2 - 5, cy - 54, half, audio.muted ? '🔇 Sound' : '🔊 Sound',
        audio.muted ? 0xff6b6b : 0x51cf66, () => {
          audio.toggleMuted();
          this.renderPauseMenu();
        });
      this.pauseButton(cx + half / 2 + 5, cy - 54, half,
        haptics.isEnabled() ? '📳 Buzz' : '📴 Buzz',
        haptics.isEnabled() ? 0x51cf66 : 0xff6b6b, () => {
          haptics.toggle();
          haptics.play('tap'); // a sample buzz so the toggle is self-demonstrating
          this.renderPauseMenu();
        });
    } else {
      this.pauseButton(cx, cy - 54, w, audio.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
        audio.muted ? 0xff6b6b : 0x51cf66, () => {
          audio.toggleMuted();
          this.renderPauseMenu();
        });
    }

    // Volume stepper: − [ ====  ] +
    const volPct = Math.round(audio.volume * 100);
    track(
      this.add
        .text(cx, cy - 8, `Volume  ${volPct}%`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cfd3dc',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_OVERLAY + 1),
    );
    const stepW = TOUCH_MIN;
    const barW = w - stepW * 2 - 16;
    this.pauseButton(cx - barW / 2 - stepW / 2 - 4, cy + 22, stepW, '−', 0xffd166, () => {
      audio.setVolume(audio.volume - 0.1);
      this.renderPauseMenu();
    });
    this.pauseButton(cx + barW / 2 + stepW / 2 + 4, cy + 22, stepW, '+', 0xffd166, () => {
      audio.setVolume(audio.volume + 0.1);
      this.renderPauseMenu();
    });
    // Volume fill bar.
    track(
      this.add
        .rectangle(cx, cy + 22, barW, 10, 0x232336)
        .setStrokeStyle(1, 0x555566, 0.9)
        .setDepth(DEPTH_OVERLAY + 1),
    );
    track(
      this.add
        .rectangle(cx - barW / 2, cy + 22, barW * audio.volume, 10, 0xffd166)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH_OVERLAY + 2),
    );

    // Resume + Enemy Guide + Quit.
    this.pauseButton(cx, cy + 66, w, '▶ Resume', 0x51cf66, () => this.closePauseMenu());
    this.pauseButton(cx, cy + 66 + TOUCH_MIN + 10, w, '📖 Enemy Guide', 0x4dabf7, () => {
      this.pauseView = 'bestiary';
      this.renderPause();
    });
    this.pauseButton(cx, cy + 66 + (TOUCH_MIN + 10) * 2, w, '≡ Quit to menu', 0x9aa0b0, () => {
      this.closePauseMenu();
      this.quitToMenu();
    });
  }

  /**
   * The Enemy Guide: a scrollable-free list of every foe — its tinted sprite,
   * name and a one-line "what it does" blurb — so players can learn the cast
   * without leaving the run. Sized to fit the viewport (rows shrink on short
   * screens). Reuses the paused overlay; "Back" returns to the pause menu.
   */
  private renderBestiary(): void {
    this.pauseUi.forEach((o) => o.destroy());
    this.pauseUi = [];
    if (!this.paused) return;
    const cx = this.sw / 2;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.pauseUi.push(o);
      return o;
    };
    track(
      this.add
        .rectangle(cx, this.sh / 2, this.sw, this.sh, 0x000000, 0.82)
        .setDepth(DEPTH_OVERLAY)
        .setInteractive(),
    );

    const list = Object.values(ENEMY_TYPES) as EnemyType[];
    const w = Math.min(this.sw - 16, 400);
    const left = cx - w / 2;
    const top = 16;
    const headerH = 34;
    const footerH = TOUCH_MIN + 16;
    // Fit all rows between header + footer, clamped to a comfortable range.
    const avail = this.sh - top - headerH - footerH;
    const rowH = Phaser.Math.Clamp(Math.floor(avail / list.length), 30, 46);

    track(
      this.add
        .text(cx, top + headerH / 2, '📖 ENEMY GUIDE', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#4dd2ff',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_OVERLAY + 1),
    );

    let y = top + headerH;
    for (const e of list) {
      const rowCy = y + rowH / 2;
      track(
        this.add
          .rectangle(cx, rowCy, w, rowH - 4, e.boss ? 0x2a1622 : 0x1b1b26, 0.96)
          .setStrokeStyle(1, e.color, e.boss ? 0.9 : 0.55)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      const icon = Math.min(rowH - 12, 30);
      track(
        this.add
          .image(left + 8 + icon / 2, rowCy, enemyTextureKey(e.key))
          .setDisplaySize(icon, icon)
          .setTint(e.color)
          .setDepth(DEPTH_OVERLAY + 2),
      );
      const textX = left + 16 + icon;
      track(
        this.add
          .text(textX, rowCy - 9, e.name, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: e.boss ? '#ff8fb1' : '#ffffff',
            fontStyle: e.boss ? 'bold' : 'normal',
          })
          .setOrigin(0, 0.5)
          .setDepth(DEPTH_OVERLAY + 2),
      );
      track(
        this.add
          .text(textX, rowCy + 8, e.blurb, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#9aa0b0',
            wordWrap: { width: w - icon - 28 },
          })
          .setOrigin(0, 0.5)
          .setDepth(DEPTH_OVERLAY + 2),
      );
      y += rowH;
    }

    const bw = Math.max(160, Math.min(280, this.sw * 0.6));
    this.pauseButton(cx, this.sh - footerH / 2 - 6, bw, '← Back', 0x9aa0b0, () => {
      this.pauseView = 'menu';
      this.renderPause();
    });
  }

  /** A tap-friendly button tracked as part of the pause overlay. */
  private pauseButton(
    x: number,
    y: number,
    w: number,
    label: string,
    color: number,
    onClick: () => void,
  ): void {
    const rect = this.add
      .rectangle(x, y, w, TOUCH_MIN, 0x232336, 0.98)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(DEPTH_OVERLAY + 1)
      .setInteractive({ useHandCursor: true });
    rect.on(
      'pointerdown',
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        onClick();
      },
    );
    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 2);
    pressFeedback(rect, [rect, text], { rect, base: 0x232336, active: 0x33334d });
    this.pauseUi.push(rect, text);
  }

  // --- Tower selection / upgrades / selling --------------------------------

  private onTowerSelection(tower: Tower | null): void {
    if (tower && !this.gameOver) {
      this.openUpgradePanel(tower);
    } else {
      this.upgradePanel.close();
    }
  }

  private openUpgradePanel(tower: Tower): void {
    this.upgradePanel.open(tower, this.gold, {
      onUpgrade: (path) => this.upgradeTower(tower, path),
      onSell: () => this.sellTower(tower),
      onCycleTarget: () => {
        tower.cycleTargeting();
        this.openUpgradePanel(tower); // rebuild to show new strategy
      },
    });
    this.panelGold = this.gold;
  }

  /**
   * Keep an open build/upgrade panel's affordability in sync with live gold:
   * rebuild it (flicker-free, same frame) whenever gold changes, so a tower you
   * couldn't afford on open becomes buyable the instant the kill gold lands —
   * no need to close and reopen.
   */
  private syncOpenPanel(): void {
    if (this.gold === this.panelGold) return;
    const sel = this.towers.selectedTower;
    if (this.upgradePanel.isOpen && sel) this.openUpgradePanel(sel);
    else if (this.buildPanel.isOpen) this.openBuildPanel();
    else this.panelGold = this.gold; // nothing open — just resync the marker
  }

  private upgradeTower(tower: Tower, path: UpgradePathKey): void {
    const next = tower.nextTier(path);
    if (!next || !tower.canUpgrade(path) || this.gold < next.cost) return;
    const spent = tower.applyUpgrade(path);
    this.gold -= spent;
    this.goldSpent += spent;
    haptics.play('place');
    this.fxBurst(tower.x, tower.y, tower.type.projectileColor);
    this.refreshHud();
    this.saveRunState();
    this.openUpgradePanel(tower); // rebuild with new tier / gold
  }

  private sellTower(tower: Tower): void {
    haptics.play('tap');
    this.gold += tower.sellValue;
    this.towers.removeTower(tower); // deselects -> closes the upgrade panel
    this.refreshHud();
    this.saveRunState();
  }

  // --- Map rendering (into the board's tiles layer) ------------------------

  private drawMap(layout: GridLayout): void {
    const { tileSize, mapW, mapH, offsetX, offsetY } = layout;

    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const type = this.map.tiles[r][c];
        const { x, y } = tileToWorld(layout, c, r);
        // Drawn tile texture (grayscale) tinted to this map's palette color.
        const tile = this.add
          .image(x, y, TILE_TEXTURE[type])
          .setDisplaySize(tileSize, tileSize)
          .setTint(this.map.colors[type]);
        this.layers.tiles.add(tile);

        // Baked (untinted) readability accent on top: a gold left-chevron +
        // cream lane dividers on aisles, a green "+" tower-base cue on builds.
        const accentKey =
          type === TileType.Aisle
            ? TX.aisleArrow
            : type === TileType.Build
              ? TX.buildPlus
              : null;
        if (accentKey) {
          const accent = this.add
            .image(x, y, accentKey)
            .setDisplaySize(tileSize, tileSize);
          this.layers.tiles.add(accent);
        }
      }
    }

    const border = this.add
      .rectangle(offsetX + mapW / 2, offsetY + mapH / 2, mapW, mapH)
      .setStrokeStyle(2, 0xffffff, 0.12);
    this.layers.tiles.add(border);

    this.drawBoardVignette(layout);
    this.drawLaneMarkers(layout);
    this.drawSinger(layout);
  }

  /** Neon-noir mood: darken the board edges so the lit lanes pop in the middle. */
  private drawBoardVignette(layout: GridLayout): void {
    const { mapW, mapH, offsetX, offsetY } = layout;
    const g = this.add.graphics({ x: offsetX, y: offsetY });
    const vY = mapH * 0.16;
    const vX = mapW * 0.08;
    // Top / bottom.
    g.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0.55, 0.55, 0, 0);
    g.fillRect(0, 0, mapW, vY);
    g.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0, 0, 0.55, 0.55);
    g.fillRect(0, mapH - vY, mapW, vY);
    // Left / right.
    g.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0.45, 0, 0.45, 0);
    g.fillRect(0, 0, vX, mapH);
    g.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0, 0.45, 0, 0.45);
    g.fillRect(mapW - vX, 0, vX, mapH);
    this.layers.tiles.add(g);
  }

  /**
   * Subtle orientation aids: a small dark pill badge with a white number on the
   * right edge of each aisle tile (a low-contrast gold label was hard to read).
   */
  private drawLaneMarkers(layout: GridLayout): void {
    const { tileSize, mapW, offsetX, offsetY } = layout;
    const pillW = tileSize * 0.5;
    const pillH = tileSize * 0.36;
    this.map.laneRows.forEach((row, i) => {
      const y = offsetY + row * tileSize + tileSize / 2;
      const x = offsetX + mapW - pillW * 0.62; // hug the right edge of the tile
      const pill = this.add
        .image(x, y, TX.lanePill)
        .setDisplaySize(pillW, pillH);
      this.layers.tiles.add(pill);
      const label = this.add
        .text(x, y, `${i + 1}`, {
          fontFamily: 'monospace',
          fontSize: `${Math.max(8, Math.round(tileSize * 0.34))}px`,
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.layers.tiles.add(label);
    });
  }

  /**
   * Placeholder singer in the stage zone on the left. Built as a container so
   * it can bounce/react (see `reactSinger`) when nearby foes are silenced.
   */
  private drawSinger(layout: GridLayout): void {
    const { tileSize, mapH, offsetX, offsetY } = layout;
    const stageW = tileSize * (this.map.stageCol + 1);
    const cx = offsetX + stageW / 2;
    const cy = offsetY + mapH / 2;

    // The curtain is drawn ~30% narrower than the stage column and anchored to
    // the left edge, so it reads as a slim frame rather than dominating the
    // board — freeing the right of the stage column toward the play grid.
    const curtainW = stageW * 0.7;
    const curtainX = -stageW / 2 + curtainW / 2; // left-anchored within the zone

    // Dark "backstage" fill behind everything so the freed strip (and the bare
    // stage tiles under it) read as a clean shadowed frame edge, not leftover
    // footlights peeking past the curtain.
    const backstage = this.add
      .rectangle(0, 0, stageW, mapH, 0x140a1e, 1)
      .setOrigin(0.5);
    // Theatre-curtain backdrop, left-anchored and narrower.
    const curtain = this.add
      .image(curtainX, 0, TX.curtain)
      .setDisplaySize(curtainW, mapH);
    // Soft shadow gradient at the curtain's right edge → depth into the board.
    const edge = this.add
      .rectangle(curtainX + curtainW / 2, 0, tileSize * 0.3, mapH, 0x000000, 0.35)
      .setOrigin(0, 0.5);
    // Singer figure, sized to the narrower curtain (natural aspect, not stretched).
    const fw = Math.min(curtainW * 0.92, tileSize * 1.05);
    const fh = fw * 2; // texture is 48x96
    const figure = this.add
      .image(curtainX, mapH * 0.06, TX.singer)
      .setDisplaySize(fw, fh);
    // Warm spotlight cone above the figure (additive glow) that gently sways +
    // breathes, so the stage feels live rather than a static backdrop.
    const spot = this.add
      .image(curtainX, -fh * 0.2, TX.spotlight)
      .setOrigin(0.5, 0.1)
      .setDisplaySize(curtainW * 1.5, fh * 1.6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: spot,
      angle: { from: -5, to: 5 },
      alpha: { from: 0.8, to: 1 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.singerFigure = figure;
    this.singer = this.add.container(cx, cy, [backstage, curtain, edge, spot, figure]);
    this.layers.tiles.add(this.singer);
  }

  /**
   * The singer cheers (a quick squash-and-stretch bounce) when a foe is
   * silenced near the stage.
   */
  private reactSinger(enemyX: number): void {
    if (!this.singer) return;
    const ts = this.layout.tileSize;
    const stageRight = this.layout.offsetX + ts * (this.map.stageCol + 1);
    if (enemyX > stageRight + ts * 3.5) return; // only nearby kills
    this.singerTween?.stop();
    this.singer.setScale(1);
    this.singerTween = this.tweens.add({
      targets: this.singer,
      scaleY: 1.2,
      scaleX: 0.92,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** A short particle burst tinted to the enemy's color, on its death. */
  private deathBurst(x: number, y: number, color: number): void {
    // Under heavy load, skip the burst entirely — at deep endless waves dozens
    // of these per second are the worst fill-rate offender.
    if (perf.lowFx) return;
    const emitter = this.add.particles(x, y, 'spark', {
      lifespan: 480,
      speed: { min: 30, max: 130 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      blendMode: 'ADD',
      emitting: false,
    });
    this.layers.fx.add(emitter);
    emitter.explode(12);
    this.time.delayedCall(520, () => emitter.destroy());

    // A quick neon glow pop at the kill, in the enemy's color.
    const pop = this.add
      .image(x, y, TX.glow)
      .setDisplaySize(this.layout.tileSize * 0.7, this.layout.tileSize * 0.7)
      .setTint(color)
      .setAlpha(0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.layers.fx.add(pop);
    this.tweens.add({
      targets: pop,
      scale: pop.scale * 2.2,
      alpha: 0,
      duration: 260,
      onComplete: () => pop.destroy(),
    });
  }

  // --- HUD (screen-space top strip) ----------------------------------------

  private drawHud(): void {
    this.hudBg = this.add
      .rectangle(0, 0, 10, 10, 0x14141c, 0.92)
      .setOrigin(0, 0)
      .setDepth(DEPTH_HUD);
    // Neon underline along the bottom edge of the HUD strip.
    this.hudBorder = this.add
      .rectangle(0, 0, 10, 2, 0xe84393, 0.9)
      .setOrigin(0, 1)
      .setDepth(DEPTH_HUD + 1);
    this.titleText = this.add
      .text(0, 0, 'KaraFence', { fontFamily: 'monospace', color: '#e84393' })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.goldIcon = this.add.image(0, 0, TX.coin).setDepth(DEPTH_HUD + 1);
    this.goldText = this.add
      .text(0, 0, `${this.gold}`, { fontFamily: 'monospace', color: '#ffd166' })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.waveIcon = this.add.image(0, 0, TX.spotIcon).setDepth(DEPTH_HUD + 1);
    this.waveText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#dddddd' })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH_HUD + 1);
    // Singer "performance energy" bar (mic + red→pink gradient fill).
    this.hpIcon = this.add.image(0, 0, TX.mic).setDepth(DEPTH_HUD + 1);
    this.hpBarBg = this.add
      .rectangle(0, 0, 10, 10, 0x2a1622, 0.95)
      .setStrokeStyle(1, 0xff8fb1, 0.8)
      .setDepth(DEPTH_HUD + 1);
    this.hpBarFill = this.add.image(0, 0, TX.hpFill).setOrigin(0, 0.5).setDepth(DEPTH_HUD + 2);
    this.hpText = this.add
      .text(0, 0, `${this.singerHp}/${SINGER_MAX_HP}`, {
        fontFamily: 'monospace',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD + 3);
    this.comboText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#ffd43b' })
      .setOrigin(0.5)
      .setDepth(DEPTH_BOSSBAR)
      .setVisible(false);
    // Crowd-energy EQ meter (5 bars) shown alongside the combo readout.
    this.eqBars = [];
    for (let i = 0; i < 5; i++) {
      this.eqBars.push(
        this.add
          .rectangle(0, 0, 3, 4, 0x51cf66, 1)
          .setOrigin(0.5, 1)
          .setDepth(DEPTH_BOSSBAR)
          .setVisible(false),
      );
    }
    this.statusText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#69db7c' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_BOSSBAR)
      .setVisible(false);
  }

  private positionHud(): void {
    const { vw, hudH, portrait } = this.screen;
    this.hudBg.setPosition(0, 0).setSize(vw, hudH);
    this.hudBorder.setPosition(0, hudH).setSize(vw, 2);
    const cy = hudH / 2;
    const font = Math.round(Phaser.Math.Clamp(hudH * 0.32, 12, 18));
    const iconSz = Math.round(Phaser.Math.Clamp(hudH * 0.4, 14, 22));
    const small = `${font}px`;
    // On narrow portrait screens the title would crowd the readouts.
    const showTitle = !portrait || vw >= 460;
    this.titleText.setVisible(showTitle).setFontSize(font).setPosition(8, cy);
    // Gold: coin icon + number.
    const goldX = showTitle ? Math.min(vw * 0.34, 130) : 8;
    this.goldIcon.setDisplaySize(iconSz, iconSz).setPosition(goldX + iconSz / 2, cy);
    this.goldText.setFontSize(font).setPosition(goldX + iconSz + 4, cy);

    // Singer energy bar on the right: mic + gradient fill + overlaid number.
    this.hpBarW = Math.round(Phaser.Math.Clamp(vw * 0.16, 48, 84));
    const barH = Math.round(Phaser.Math.Clamp(hudH * 0.36, 10, 16));
    const barCx = vw - 8 - this.hpBarW / 2;
    const barLeft = vw - 8 - this.hpBarW;
    this.hpBarBg.setSize(this.hpBarW, barH).setPosition(barCx, cy);
    this.hpBarFill.setPosition(barLeft + 1, cy).setDisplaySize(this.hpBarW - 2, barH - 4);
    this.hpIcon.setDisplaySize(iconSz, iconSz).setPosition(barLeft - iconSz / 2 - 4, cy);
    this.hpText.setFontSize(`${Math.round(font * 0.82)}px`).setPosition(barCx, cy);

    // The wave/foes readout (longest string) sits between gold and the energy
    // bar, with a small spotlight icon at its left.
    const waveFont = Math.round(font * (vw < 460 ? 0.72 : 0.85));
    const waveX = Math.min(vw * 0.6, barLeft - iconSz - 60);
    this.waveIcon.setDisplaySize(iconSz, iconSz);
    this.waveText.setFontSize(`${waveFont}px`).setPosition(waveX, cy);

    this.comboText
      .setFontSize(`${Math.round(font * 1.3)}px`)
      .setPosition(vw / 2, hudH + Math.round(font * 1.4));
    this.statusText.setFontSize(small).setPosition(vw / 2, hudH + 4);
    this.refreshHud();
    this.positionEq();
  }

  private refreshHud(): void {
    this.goldText.setText(`${this.gold}`);
    const wave = this.waves.currentWaveNumber;
    const foes = this.waves.enemiesRemaining;
    // Make the mode legible: endless counts up with no cap; story shows /20.
    this.waveText.setText(
      this.mode === 'endless'
        ? `ENDLESS · Wave ${wave} · Foes ${foes}`
        : `STORY · Wave ${wave}/${this.waves.totalWaves} · Foes ${foes}`,
    );
    // Anchor the spotlight icon just left of the (variable-width) wave readout.
    this.waveIcon.setPosition(
      this.waveText.x - this.waveText.width / 2 - this.waveIcon.displayWidth / 2 - 4,
      this.waveText.y,
    );
    this.hpText.setText(`${this.singerHp}/${SINGER_MAX_HP}`);
    const ratio = Math.max(0, this.singerHp / SINGER_MAX_HP);
    this.hpBarFill.displayWidth = Math.max(0, this.hpBarW - 2) * ratio;
  }

  /** Lay out + size the crowd-energy EQ bars beside the combo readout. */
  private positionEq(): void {
    if (!this.eqBars.length) return;
    const show = this.combo > 0 && this.comboText.visible;
    if (!show) {
      this.eqBars.forEach((b) => b.setVisible(false));
      return;
    }
    const maxH = this.comboText.height * 0.8;
    const level = Math.min(1, this.combo / 8);
    const pattern = [0.5, 0.85, 1, 0.7, 0.55];
    const bw = 3;
    const gap = 2;
    const baseY = this.comboText.y + this.comboText.height * 0.35;
    // Stack the bars to the left of the combo text.
    let x = this.comboText.x - this.comboText.width / 2 - 8;
    for (let i = this.eqBars.length - 1; i >= 0; i--) {
      const bar = this.eqBars[i];
      const h = Math.max(3, maxH * (0.25 + 0.75 * level) * pattern[i]);
      bar
        .setVisible(true)
        .setSize(bw, h)
        .setPosition(x, baseY)
        .setFillStyle(level > 0.6 ? 0xffd43b : 0x51cf66, 1);
      x -= bw + gap;
    }
  }

  // --- Bottom control bar (screen-space) -----------------------------------

  private drawControlBar(): void {
    this.barBg = this.add
      .rectangle(0, 0, 10, 10, 0x14141c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2a2a3a, 1)
      .setDepth(DEPTH_BAR);
    this.menuBtn = this.barButton('≡ Pause', 0x9aa0b0, '#cfd3dc', () => this.openPauseMenu());
    // The 2× speed toggle is a meta unlock (bought with stars on the menu).
    if (isUnlocked(this.meta, 'speed2x')) {
      this.speedBtn = this.barButton('▶ 1×', 0x4dd2ff, '#bdecff', () => this.cycleSpeed());
    }
  }

  /** Toggle 1×/2× game speed — scales movement, the spawn clock and tweens. */
  private cycleSpeed(): void {
    // 1× → 2× → 3× → 4× → 1×. Higher tiers make grinding deep endless bearable.
    const tiers = [1, 2, 3, 4];
    this.gameSpeed = tiers[(tiers.indexOf(this.gameSpeed) + 1) % tiers.length];
    this.time.timeScale = this.gameSpeed;
    this.tweens.timeScale = this.gameSpeed;
    this.speedBtn?.text.setText(this.gameSpeed === 1 ? '▶ 1×' : `▶▶ ${this.gameSpeed}×`);
  }

  /** A venue-signage bar button (neon glow + framed rect + label). */
  private barButton(
    label: string,
    stroke: number,
    color: string,
    onClick: () => void,
  ): BarButton {
    const glow = this.add
      .rectangle(0, 0, TOUCH_MIN, TOUCH_MIN, stroke, 0.22)
      .setDepth(DEPTH_BAR);
    const rect = this.add
      .rectangle(0, 0, TOUCH_MIN, TOUCH_MIN, 0x1b1b27, 0.98)
      .setStrokeStyle(2.5, stroke, 1)
      .setDepth(DEPTH_BAR + 1)
      .setInteractive({ useHandCursor: true });
    rect.on(
      'pointerdown',
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        onClick();
      },
    );
    const text = this.add
      .text(0, 0, label, { fontFamily: 'monospace', color })
      .setOrigin(0.5)
      .setDepth(DEPTH_BAR + 2);
    return { glow, rect, text };
  }

  private positionControlBar(): void {
    const { vw, vh, barH } = this.screen;
    const top = vh - barH;
    this.barBg.setPosition(0, top).setSize(vw, barH);
    const cy = top + barH / 2;
    const font = Math.round(Phaser.Math.Clamp(barH * 0.26, 13, 18));
    const btnH = Math.max(TOUCH_MIN, barH - 16);
    const btnW = Math.max(TOUCH_MIN, Math.min(160, vw * 0.34));
    const margin = Math.max(10, vw * 0.03);

    const place = (btn: BarButton, cx: number) => {
      btn.glow.setSize(btnW + 8, btnH + 8).setPosition(cx, cy);
      btn.rect.setSize(btnW, btnH).setPosition(cx, cy);
      btn.text.setFontSize(font).setPosition(cx, cy);
    };
    place(this.menuBtn, margin + btnW / 2);
    if (this.speedBtn) place(this.speedBtn, vw - margin - btnW / 2);
  }

  // --- Pre-wave planning prompt --------------------------------------------

  /**
   * Fresh-run planning phase: let the player build before wave 1, then start it
   * manually. Mirrors the intermission Fast-Forward control's position (just
   * above the bottom bar, one-thumb reach).
   */
  private showStartPrompt(): void {
    this.startPrompt?.destroy(true);
    const label = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#ffffff' })
      .setOrigin(0.5, 1);
    const btn = this.add
      .rectangle(0, 0, TOUCH_MIN, TOUCH_MIN, 0x233323, 0.98)
      .setStrokeStyle(2, 0x51cf66, 0.95)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, '▶ START WAVE 1', { fontFamily: 'monospace', color: '#69db7c' })
      .setOrigin(0.5);
    btn.on(
      'pointerdown',
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        this.beginFirstWave();
      },
    );
    this.startPrompt = this.add.container(0, 0, [label, btn, text]).setDepth(DEPTH_BAR + 5);
    this.startPrompt.setData('label', label);
    this.startPrompt.setData('btn', btn);
    this.startPrompt.setData('text', text);
    this.positionStartPrompt();
  }

  private positionStartPrompt(): void {
    const ui = this.startPrompt;
    if (!ui) return;
    const { vw, vh, barH } = this.screen;
    const label = ui.getData('label') as Phaser.GameObjects.Text;
    const btn = ui.getData('btn') as Phaser.GameObjects.Rectangle;
    const text = ui.getData('text') as Phaser.GameObjects.Text;
    const cx = vw / 2;
    const btnH = TOUCH_MIN;
    const btnW = Math.max(180, Math.min(280, vw * 0.7));
    const btnCy = vh - barH - 8 - btnH / 2;
    const font = Math.round(Phaser.Math.Clamp(btnH * 0.3, 13, 17));
    btn.setSize(btnW, btnH).setPosition(cx, btnCy);
    text.setFontSize(font).setPosition(cx, btnCy);
    label
      .setFontSize(font)
      .setText('Tune up your band — then kick off the first set')
      .setPosition(cx, btnCy - btnH / 2 - 6);
  }

  private beginFirstWave(): void {
    this.startPrompt?.destroy(true);
    this.startPrompt = undefined;
    this.waves.start();
    this.maybeSpawnScout();
    this.saveRunState();
  }

  /**
   * Rare "scout in the crowd" surprise: a short while into a wave, drop one bonus
   * VIP worth a fat fan pop. Reuses the existing VIP enemy + WaveManager.spawnAt.
   * Skipped on the tutorial so first-timers aren't thrown by an off-pool foe.
   */
  private maybeSpawnScout(): void {
    if (this.levelId === 'level1') return;
    if (Math.random() > 0.14) return;
    const lanes = this.map.laneRows.length;
    const lane = Math.floor(Math.random() * lanes);
    this.time.delayedCall(900 + Math.random() * 1600, () => {
      if (this.gameOver) return;
      const scout = this.waves.spawnAt('vip', lane);
      scout.bonusFans = 40;
      this.screenFloat('📸 A scout is in the crowd!', '#74c0fc');
    });
  }

  // --- Game flow -----------------------------------------------------------

  private onEnemyReachStage(enemy: Enemy): void {
    // The Mic Grabber steals gold and kills the combo if he reaches the stage.
    if (enemy.type.boss === 'micGrabber') {
      const steal = BOSS_CONFIG.micGrabber.goldSteal;
      this.gold = Math.max(0, this.gold - steal);
      this.combo = 0;
      this.updateComboHud(false);
      this.floatText(enemy.x, enemy.y, `🎤 -${steal}g STOLEN!`, '#ff6b6b');
    }
    if (enemy === this.activeBoss) this.clearBoss();
    audio.sfx('reachStage');
    this.damageSinger(enemy.damage);
  }

  /**
   * Killed enemies pay out their reward plus a combo (Crowd Hype) bonus, then
   * any Hype Man aura (+50% gold, faster combo) and Crowd Surf (triple gold).
   */
  private onEnemyKilled(enemy: Enemy): void {
    // Death feedback: a color-matched particle burst + sound, and the stage
    // singer cheers if the foe fell near the stage.
    this.deathBurst(enemy.x, enemy.y, enemy.type.color);
    audio.sfx('death');
    this.reactSinger(enemy.x);

    const hype = this.towers.hypeAt(enemy.x, enemy.y);
    this.combo += hype.comboBoost ? 2 : 1; // Hype Man builds the meter faster
    this.comboTimer = this.comboWindow;
    this.highestCombo = Math.max(this.highestCombo, this.combo);
    this.runKills += 1;
    this.meta.lifetime.kills += 1;
    this.meta.lifetime.highestCombo = Math.max(
      this.meta.lifetime.highestCombo,
      this.combo,
    );

    const reward = this.rewardAfterCritic(enemy);
    const bonus = Math.round(reward * COMBO_BONUS * this.combo);
    let gain = reward + bonus;
    if (hype.goldMult > 1) gain = Math.round(gain * hype.goldMult);
    if (this.runMods.goldMult > 1) gain = Math.round(gain * this.runMods.goldMult); // Merch Table
    if (this.boonGoldMult > 1) gain = Math.round(gain * this.boonGoldMult); // Merch Rush boon

    this.gold += gain;
    this.goldEarned += gain;
    // Fans scale with the combo — mastery (long combos) is the main fan source,
    // so the addictive loop and the skill ceiling reinforce each other. During
    // an Encore overdrive (high-combo reward window) fan gain is doubled.
    let fanGain = 1 + Math.floor(this.combo / 4);
    if (this.overdriveTimer > 0) fanGain *= 2;
    this.runFans += fanGain;
    // The "scout in the crowd" surprise: silencing it pays a fat fan bonus.
    if (enemy.bonusFans > 0) {
      this.runFans += enemy.bonusFans;
      this.floatText(enemy.x, enemy.y - 14, `📸 +${enemy.bonusFans} fans!`, '#74c0fc');
    }

    this.floatText(
      enemy.x,
      enemy.y,
      `+${gain}`,
      this.combo >= 3 ? '#ffd43b' : '#cdeac0',
    );
    this.updateComboHud(true);
    if (this.combo >= 2) audio.sfx('comboTick', { combo: this.combo });
    if (this.combo >= 5 && this.combo % 5 === 0) this.crowdGoesWild();
    // x10+ milestones kick off an Encore overdrive: a few seconds of doubled
    // fans + fan-rain. Escalates mastery into a visible payoff.
    if (this.combo >= 10 && this.combo % 5 === 0) this.triggerOverdrive();
    if (enemy === this.activeBoss) this.clearBoss();
    this.refreshHud();
  }

  /** Critic "bad review" aura: cut the reward of enemies dying near a Critic. */
  private rewardAfterCritic(enemy: Enemy): number {
    const ts = this.layout.tileSize;
    for (const other of this.waves.enemies) {
      if (other === enemy || other.dead || !other.type.criticAura) continue;
      const within =
        Math.hypot(other.x - enemy.x, other.y - enemy.y) <= other.type.criticAura * ts;
      if (within) return Math.floor(enemy.reward * (other.type.reviewPenalty ?? 0.5));
    }
    return enemy.reward;
  }

  // --- Bosses --------------------------------------------------------------

  private onBossSpawn(boss: Enemy): void {
    this.activeBoss = boss;
    this.bossAbilityTimer =
      boss.type.boss === 'hecklerKing'
        ? BOSS_CONFIG.hecklerKing.tauntInterval
        : boss.type.boss === 'djWontStop'
          ? BOSS_CONFIG.djWontStop.spawnInterval
          : 0;
    this.bossPhase2 = false;
    this.bossPhase3 = false;
    this.bossPrevHp = boss.hpRatio;
    this.showBossBar(boss);
    audio.playMusic('boss');
    audio.sfx('bossEntrance');
    haptics.play('heavy');
    this.cameras.main.shake(450, 0.012);
    this.cameras.main.flash(320, 120, 12, 30); // dark-red menace wash
  }

  private showBossBar(boss: Enemy): void {
    this.bossBar?.destroy(true);
    // Dramatic dark frame with a neon-red border and a bold, shadowed name.
    const bg = this.add.rectangle(0, 0, 10, 9, 0x140509, 0.97).setStrokeStyle(2, 0xff3355, 0.95);
    this.bossBarFill = this.add.rectangle(0, 0, 10, 9, 0xff2d55).setOrigin(0, 0.5);
    this.bossBarLabel = this.add
      .text(0, 0, boss.mega ? `★ MEGA ${boss.type.name}` : boss.type.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: boss.mega ? '#ffd700' : '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 1, '#000000', 2);
    this.bossBar = this.add
      .container(0, 0, [bg, this.bossBarFill, this.bossBarLabel])
      .setDepth(DEPTH_BOSSBAR);
    this.positionBossBar();
    this.updateBossBar();
  }

  /** Boss health bar spans just under the HUD, full width. */
  private positionBossBar(): void {
    if (!this.bossBar || !this.bossBarFill || !this.bossBarLabel) return;
    const { vw, hudH } = this.screen;
    const w = vw - 16;
    const h = Math.round(Phaser.Math.Clamp(hudH * 0.28, 9, 14));
    const children = this.bossBar.list as Phaser.GameObjects.Rectangle[];
    (children[0] as Phaser.GameObjects.Rectangle).setSize(w, h);
    this.bossBarFill.setSize(w, h).setPosition(-w / 2, 0);
    this.bossBarLabel.setFontSize(`${Math.round(h * 0.8)}px`);
    this.bossBar.setPosition(vw / 2, hudH + h / 2 + 3);
  }

  private updateBossBar(): void {
    const boss = this.activeBoss;
    if (!boss || !this.bossBarFill || !this.bossBarLabel) return;
    const shielded = boss.shieldRatio > 0;
    this.bossBarFill.scaleX = shielded ? boss.shieldRatio : boss.hpRatio;
    this.bossBarFill.fillColor = shielded ? 0x74c0fc : 0xff2d55;
    this.bossBarLabel.setText((boss.mega ? '★ MEGA ' : '') + boss.type.name + (shielded ? '  [SHIELD]' : ''));
  }

  private clearBoss(): void {
    const hadBoss = this.activeBoss !== null;
    this.activeBoss = null;
    this.towers.attackSpeedMultiplier = 1; // undo Talent Judge phase 3
    // Drop back to the normal groove once the boss is gone (unless the run is
    // ending, where the victory / game-over track takes over).
    if (hadBoss && !this.gameOver) audio.playMusic('inWave');
    this.bossBar?.destroy(true);
    this.bossBar = undefined;
    this.bossBarFill = undefined;
    this.bossBarLabel = undefined;
  }

  /** Per-frame boss abilities. */
  private driveBoss(dt: number): void {
    const boss = this.activeBoss;
    if (!boss) return;
    // Safety: if the boss left play without a kill/stage event.
    if (!this.waves.enemies.has(boss)) {
      this.clearBoss();
      return;
    }
    this.updateBossBar();

    // Shake the camera in proportion to damage the boss soaks this frame, so
    // landing hits on the big foes feels weighty (capped so it never overwhelms).
    const drop = this.bossPrevHp - boss.hpRatio;
    if (drop > 0.0005) {
      this.cameras.main.shake(90, Math.min(0.006, drop * 0.5));
    }
    this.bossPrevHp = boss.hpRatio;

    const ts = this.layout.tileSize;

    switch (boss.type.boss) {
      case 'hecklerKing': {
        this.bossAbilityTimer -= dt;
        if (this.bossAbilityTimer <= 0) {
          const cfg = BOSS_CONFIG.hecklerKing;
          this.bossAbilityTimer = cfg.tauntInterval;
          this.towers.freezeTowersInRadius(
            boss.x,
            boss.y,
            cfg.freezeRadiusTiles * ts,
            cfg.freezeDuration,
          );
          this.bossShout(boss, cfg.freezeRadiusTiles * ts, '🔇 TAUNT!');
        }
        break;
      }
      case 'djWontStop': {
        this.bossAbilityTimer -= dt;
        if (this.bossAbilityTimer <= 0) {
          const cfg = BOSS_CONFIG.djWontStop;
          this.bossAbilityTimer = cfg.spawnInterval;
          const lanes = this.map.laneRows.length;
          for (let i = 0; i < cfg.spawnCount; i++) {
            this.waves.spawnAt(cfg.spawnType, Math.floor(Math.random() * lanes));
          }
          this.floatText(boss.x, boss.y, '🎧 DROP THE BEAT!', '#63e6be');
        }
        break;
      }
      case 'talentJudge': {
        const cfg = BOSS_CONFIG.talentJudge;
        if (!this.bossPhase2 && boss.hpRatio <= cfg.phase2Hp) {
          this.bossPhase2 = true;
          const lanes = this.map.laneRows.length;
          for (let i = 0; i < cfg.rusherCount; i++) {
            this.waves.spawnAt(cfg.rusherType, i % lanes);
          }
          this.floatText(boss.x, boss.y, 'PHASE 2: RUSHERS!', '#ffd43b');
        }
        if (!this.bossPhase3 && boss.hpRatio <= cfg.phase3Hp) {
          this.bossPhase3 = true;
          this.towers.attackSpeedMultiplier = cfg.attackSpeedFactor;
          this.floatText(boss.x, boss.y, 'PHASE 3: TOWERS SLOWED!', '#ff6b6b');
        }
        break;
      }
      default:
        break;
    }
  }

  /** Boss taunt visual: an expanding ring + a callout. */
  private bossShout(boss: Enemy, radius: number, msg: string): void {
    const ring = this.add
      .circle(boss.x, boss.y, radius, 0xffd43b, 0.18)
      .setStrokeStyle(2, 0xffd43b, 0.8)
      .setScale(0.2);
    this.layers.fx.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 450,
      onComplete: () => ring.destroy(),
    });
    this.floatText(boss.x, boss.y, msg, '#ffd43b');
  }

  // --- Combo (Crowd Hype) --------------------------------------------------

  private tickCombo(dt: number): void {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = 0;
      this.updateComboHud(false);
    }
  }

  private updateComboHud(pop: boolean): void {
    if (this.combo <= 0) {
      this.stopComboPulse();
      this.comboText.setVisible(false);
      this.positionEq();
      return;
    }
    this.comboText.setVisible(true).setText(`🔥 HYPE x${this.combo}`);
    const hot = this.combo >= 5;
    this.comboText.setColor(hot ? '#ff6bd6' : '#ffd43b');
    this.positionEq();
    if (hot) {
      // The meter throbs continuously while the crowd is whipped up.
      if (!this.comboPulse) {
        this.tweens.killTweensOf(this.comboText);
        this.comboText.setScale(1);
        this.comboPulse = this.tweens.add({
          targets: this.comboText,
          scale: 1.18,
          duration: 320,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else {
      this.stopComboPulse();
      if (pop) {
        this.comboText.setScale(1.4);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 180 });
      }
    }
  }

  private stopComboPulse(): void {
    if (this.comboPulse) {
      this.comboPulse.stop();
      this.comboPulse = undefined;
    }
    this.comboText.setScale(1);
  }

  private crowdGoesWild(): void {
    const flash = this.add
      .rectangle(this.sw / 2, this.sh / 2, this.sw, this.sh, 0xffffff, 0.5)
      .setDepth(DEPTH_OVERLAY + 40);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
    // Rotate punny "crowd's going off" callouts, stepped by the combo tier.
    const cheers = [
      'THE CROWD GOES WILD!',
      'ENCORE! ENCORE!',
      "YOU'RE A SHOW-STOPPER!",
      'BRING DOWN THE HOUSE!',
      'PITCH PERFECT!',
      'STANDING OVATION!',
      'HEADLINER ENERGY!',
      'THAT KEY? NAILED IT!',
    ];
    const cheer = cheers[Math.floor(this.combo / 5 - 1) % cheers.length];
    const text = this.add
      .text(this.sw / 2, this.sh / 2 - 30, cheer, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ff6bd6',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 41);
    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 16,
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Encore overdrive: a high-combo reward window (doubled fans for a few
   * seconds, see onEnemyKilled) announced with a banner + a burst of fan-rain.
   * Refreshes its own timer if re-triggered while already active.
   */
  private triggerOverdrive(): void {
    const fresh = this.overdriveTimer <= 0;
    this.overdriveTimer = OVERDRIVE_SECONDS;
    if (fresh) {
      const banner = this.add
        .text(this.sw / 2, this.sh / 2 + 6, '🎤 ENCORE OVERDRIVE — 2× FANS!', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffd166',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_OVERLAY + 41);
      this.tweens.add({
        targets: banner,
        alpha: 0,
        y: banner.y - 18,
        duration: 1100,
        onComplete: () => banner.destroy(),
      });
    }
    this.fanRain();
  }

  /** A quick shower of fan hearts/mics from the top edge (overdrive flourish). */
  private fanRain(): void {
    const glyphs = ['💖', '🎤', '⭐', '🎶'];
    for (let i = 0; i < 10; i++) {
      const x = 20 + Math.random() * (this.sw - 40);
      const t = this.add
        .text(x, -16, glyphs[i % glyphs.length], { fontSize: '18px' })
        .setOrigin(0.5)
        .setDepth(DEPTH_OVERLAY + 39)
        .setAlpha(0.95);
      this.tweens.add({
        targets: t,
        y: this.sh * (0.4 + Math.random() * 0.4),
        alpha: 0,
        duration: 900 + Math.random() * 700,
        delay: Math.random() * 250,
        ease: 'Sine.easeIn',
        onComplete: () => t.destroy(),
      });
    }
  }

  /** Board-space floating text (e.g. "+gold" over a killed enemy). */
  private floatText(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, { fontFamily: 'monospace', fontSize: '12px', color })
      .setOrigin(0.5);
    this.layers.fx.add(t);
    this.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  /** Screen-space floating text near the HUD (e.g. interest banked). */
  private screenFloat(msg: string, color: string): void {
    const x = this.goldText.x + 4;
    const y = this.screen.hudH + 12;
    const t = this.add
      .text(x, y, msg, { fontFamily: 'monospace', fontSize: '12px', color })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.tweens.add({
      targets: t,
      y: y + 16,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }

  // --- Intermission + interest ---------------------------------------------

  private onWaveCleared(): void {
    const clearedWave = this.waves.currentWaveNumber;
    // Next-wave boons expire when the wave they powered ends.
    this.boonGoldMult = 1;
    this.towers.damageBoost = 1;
    // Lifetime: count the wave just survived and persist progression.
    this.meta.lifetime.waves += 1;
    saveMeta(this.meta);
    audio.sfx('waveClear');
    haptics.play('soft');

    // Interest on banked gold (rate raised by the "Royalties" research node).
    const interest = Math.floor(this.gold * this.runMods.interestRate);
    if (interest > 0) {
      this.gold += interest;
      this.goldEarned += interest;
      this.screenFloat(`+${interest}g in tips 🎶`, '#69db7c');
      audio.sfx('gold');
    }

    // Fans for clearing the wave — a combo-independent baseline so even a rough
    // clear advances the meter; plus an endless milestone pop and the occasional
    // surprise crate (variable reward) to keep "one more wave" pulling.
    this.runFans += 5;
    // Comeback: held the stage by a thread → turn the near-loss into a highlight.
    if (this.singerHp > 0 && this.singerHp <= 2) {
      this.runFans += 25;
      this.screenFloat('😅 Saved the show! +25 fans', '#69db7c');
    }
    if (
      this.mode === 'endless' &&
      clearedWave % 5 === 0 &&
      clearedWave > this.endlessFanMilestone
    ) {
      this.endlessFanMilestone = clearedWave;
      this.runFans += 20;
      this.screenFloat(`🎉 Wave ${clearedWave} milestone — +20 fans`, '#ffd166');
    }
    // Best-wave chase: nudge as the run closes in on (then beats) the record.
    if (this.mode === 'endless' && this.endlessBestAtStart > 0) {
      if (clearedWave + 1 === this.endlessBestAtStart) {
        this.screenFloat('🔥 1 wave from your best!', '#ff9ed8');
      } else if (clearedWave === this.endlessBestAtStart) {
        this.screenFloat('🏆 New personal best — keep going!', '#ffd43b');
      }
    }
    this.maybeDropCrate(clearedWave);

    this.refreshHud();
    if (this.mode === 'story') this.recordStoryWave(clearedWave);

    if (this.waves.hasNextWave) {
      // Resume should pick up at the upcoming wave.
      this.resumeWaveIndex = this.waves.currentWaveIndex + 1;
      this.saveRunState();
      this.startIntermission();
      // Story: any beats for the wave just cleared play now (the intermission
      // timer is paused while the dialogue is open — see tickIntermission).
      if (this.mode === 'story') {
        const beats = beatsAfterWave(this.levelId, clearedWave);
        if (beats.length > 0) this.dialogue.show(beats, () => undefined);
      }
    } else {
      // Only story reaches here (endless always has a next wave).
      this.storyChapterComplete(clearedWave);
    }
  }

  /**
   * Variable reward: ~1-in-3 wave clears drops an "encore crate" — a small
   * surprise of either fans or gold. The unpredictability is the point (it keeps
   * each clear a little exciting); it's always a bonus, never a penalty.
   */
  private maybeDropCrate(clearedWave: number): void {
    if (Math.random() > 0.34) return;
    if (Math.random() < 0.5) {
      const fans = 10 + Math.floor(Math.random() * 31); // 10-40
      this.runFans += fans;
      this.screenFloat(`🎁 Encore crate — +${fans} fans!`, '#ff9ed8');
    } else {
      const gold = 15 + clearedWave * 3 + Math.floor(Math.random() * 20);
      this.gold += gold;
      this.goldEarned += gold;
      this.screenFloat(`🎁 Encore crate — +${gold}g!`, '#ffd43b');
    }
    audio.sfx('gold');
  }

  /** Persist how far the campaign has reached on the current chapter. */
  private recordStoryWave(waveNumber: number): void {
    const prog = loadStoryProgress() ?? {
      levelId: this.levelId,
      completedChapters: [],
      wavesCleared: 0,
    };
    prog.levelId = this.levelId;
    prog.wavesCleared = Math.max(prog.wavesCleared, waveNumber);
    saveStoryProgress(prog);
  }

  /**
   * Story: the chapter's final authored wave (20) is cleared. Score stars, mark
   * the chapter done, play its closing beats, then either advance to the next
   * chapter or roll the final victory screen.
   */
  private storyChapterComplete(clearedWave: number): void {
    this.gameOver = true; // stop spawns / the update loop
    this.clearBoss();
    const { stars, gained } = this.scoreStars();
    this.endStars = stars;
    this.endGained = gained;
    this.bankRunFans(true);

    const prog = loadStoryProgress() ?? {
      levelId: this.levelId,
      completedChapters: [],
      wavesCleared: 0,
    };
    if (!prog.completedChapters.includes(this.levelId)) {
      prog.completedChapters.push(this.levelId);
    }
    const next = nextChapter(this.levelId);
    prog.levelId = next ?? this.levelId;
    prog.wavesCleared = clearedWave;
    saveStoryProgress(prog);
    clearRun('story', this.levelId);
    this.nextChapterId = next;

    audio.playMusic('victory');
    haptics.play('win');
    const beats = beatsAfterWave(this.levelId, clearedWave);
    const after = () => {
      this.endState = next ? 'chapter' : 'victory';
      this.renderEndScreen();
    };
    if (beats.length > 0) this.dialogue.show(beats, after);
    else after();
  }

  /**
   * Bank this run's fans into the meta fan meter (win OR loss, both modes) — the
   * unifying "every run advances you" payout. Adds a best-combo flourish bonus,
   * resolves any daily quests this run satisfied, converts the total to fans +
   * bonus ★, persists, and stashes a summary for the end screen. Idempotent per
   * run (guarded by endFanGain so a re-render never double-banks).
   */
  private bankRunFans(won: boolean): void {
    if (this.banked) return; // already banked this run
    this.banked = true;

    this.runFans += Math.floor(this.highestCombo * 1.5); // combo flourish

    const stats: RunStats = {
      mode: this.mode,
      won,
      wavesReached: this.waves.currentWaveNumber,
      livesLost: SINGER_MAX_HP - this.singerHp,
      bestCombo: this.highestCombo,
      kills: this.runKills,
    };
    let questFans = 0;
    const questNames: string[] = [];
    // Daily quests + the first-win bonus are their own unlock tier (chapter 8).
    if (isFeatureUnlocked('dailies')) {
      for (const q of this.meta.daily?.quests ?? []) {
        if (q.done) continue;
        const def = questById(q.id);
        if (def && def.satisfied(stats)) {
          q.done = true;
          questFans += def.reward;
          questNames.push(def.label);
        }
      }
      // First won run of the day pays a return-hook bonus (reset by rollDaily).
      if (won && this.meta.daily && !this.meta.daily.firstWinClaimed) {
        this.meta.daily.firstWinClaimed = true;
        questFans += FIRST_WIN_FANS;
        this.endFirstWin = true;
      }
    }

    // Endless wave milestones: one-time fixed Fame for first reaching each wave.
    let milestoneFans = 0;
    if (this.mode === 'endless') {
      const reached = this.waves.currentWaveNumber;
      const claimed = this.meta.endlessMilestones;
      for (const ms of endlessMilestonesUpTo(reached)) {
        if (!claimed.includes(ms.wave)) {
          claimed.push(ms.wave);
          milestoneFans += ms.fame;
          this.endMilestoneLines.push(`🏅 Wave ${ms.wave} reached — +${ms.fame} Fame!`);
        }
      }
      if (this.endMilestoneLines.length > 0) haptics.play('success');
    }

    // Tonight's Setlist multiplies the in-run fans; the "Going Viral" research
    // node multiplies the whole haul. Quest/first-win/milestone bonuses are fixed.
    const earned = Math.round(this.runFans * this.runFanMult) + questFans;
    const total = Math.round(earned * this.runMods.fameGainMult) + milestoneFans;
    this.endFanGain = total;
    addFame(this.meta, total);
    this.endQuestNames = questNames;
    saveMeta(this.meta);
  }

  /** Score the run: one star per goal met; bank the best per level. */
  private scoreStars(): { stars: number; gained: number } {
    const livesLost = SINGER_MAX_HP - this.singerHp;
    const goals = this.map.starGoals;
    const stars = [
      livesLost <= goals.maxLivesLost,
      this.goldSpent <= goals.maxGoldSpent,
      this.highestCombo >= goals.minCombo,
    ].filter(Boolean).length;
    const prev = this.meta.stars[this.levelId] ?? 0;
    const gained = Math.max(0, stars - prev);
    if (stars > prev) this.meta.stars[this.levelId] = stars;
    saveMeta(this.meta);
    return { stars, gained };
  }

  private startIntermission(): void {
    this.intermissionActive = true;
    this.intermissionRemaining = INTERMISSION_SECONDS;
    this.towers.deselect();
    audio.playMusic('intermission');

    const label = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#ffffff' })
      .setOrigin(0.5, 1);
    // A heads-up of what the next wave brings (+ a boss warning) so the player
    // can spend the intermission building for it rather than blind.
    const previewStr = this.nextWavePreview();
    const preview = this.add
      .text(0, 0, previewStr, { fontFamily: 'monospace', color: previewStr.startsWith('⚠') ? '#ff8787' : '#9aa0b0' })
      .setOrigin(0.5, 1);
    const ffBtn = this.add
      .rectangle(0, 0, TOUCH_MIN, TOUCH_MIN, 0x233323, 0.98)
      .setStrokeStyle(2, 0x51cf66, 0.95)
      .setInteractive({ useHandCursor: true });
    const ffText = this.add
      .text(0, 0, '▶▶ FAST FORWARD', { fontFamily: 'monospace', color: '#69db7c' })
      .setOrigin(0.5);
    ffBtn.on(
      'pointerdown',
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        this.endIntermission();
      },
    );

    this.intermissionUi = this.add.container(0, 0, [label, preview, ffBtn, ffText]).setDepth(DEPTH_BAR + 5);
    this.intermissionUi.setData('label', label);
    this.intermissionUi.setData('preview', preview);
    this.intermissionUi.setData('ffBtn', ffBtn);
    this.intermissionUi.setData('ffText', ffText);
    this.positionIntermission();
    this.updateIntermissionUi();
    if (isFeatureUnlocked('boons')) this.showBoons();
  }

  /** Between-wave "encore boon": pick 1 of 3 one-shot perks (centre of screen). */
  private showBoons(): void {
    const boons = rollBoons(3);
    const cx = this.sw / 2;
    const cy = this.sh * 0.4;
    const cardW = Math.min(150, (this.sw - 36) / 3 - 8);
    const cardH = Math.min(92, cardW * 0.66);
    const gap = 10;
    const rowW = cardW * 3 + gap * 2;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.boonUi.push(o);
      return o;
    };
    track(
      this.add.text(cx, cy - cardH / 2 - 16, '✨ Encore boon — pick one', {
        fontFamily: 'monospace', fontSize: '13px', color: '#e9d8ff',
      }).setOrigin(0.5).setDepth(DEPTH_OVERLAY),
    );
    const ctx = this.boonCtx();
    boons.forEach((boon, i) => {
      const x = cx - rowW / 2 + cardW / 2 + i * (cardW + gap);
      const card = track(
        this.add.rectangle(x, cy, cardW, cardH, 0x1b1726, 0.98)
          .setStrokeStyle(2, 0xc9b6ff, 0.9).setDepth(DEPTH_OVERLAY).setInteractive({ useHandCursor: true }),
      );
      const icon = track(this.add.text(x, cy - cardH * 0.26, boon.icon, { fontSize: '22px' }).setOrigin(0.5).setDepth(DEPTH_OVERLAY + 1));
      const name = track(this.add.text(x, cy + cardH * 0.04, boon.name, { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff' }).setOrigin(0.5).setDepth(DEPTH_OVERLAY + 1));
      const desc = track(this.add.text(x, cy + cardH * 0.3, boon.desc(ctx), { fontFamily: 'monospace', fontSize: '9px', color: '#ffd166', align: 'center', wordWrap: { width: cardW - 8 } }).setOrigin(0.5).setDepth(DEPTH_OVERLAY + 1));
      card.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation();
        this.pickBoon(boon);
      });
      pressFeedback(card, [card, icon, name, desc]);
    });
  }

  private boonCtx(): BoonCtx {
    return {
      wave: this.waves.currentWaveNumber,
      gold: this.gold,
      addGold: (n) => { this.gold += n; this.goldEarned += n; this.refreshHud(); this.screenFloat(`+${n}g 💰`, '#ffd166'); audio.sfx('gold'); },
      heal: (n) => { this.singerHp = Math.min(SINGER_MAX_HP, this.singerHp + n); this.refreshHud(); this.screenFloat(`+${n} HP ❤️`, '#69db7c'); },
      addFame: (n) => { this.runFans += n; this.screenFloat(`+${n} Fame 🎤`, '#ff9ed8'); },
      boostDamage: (m) => { this.towers.damageBoost = m; this.screenFloat('💥 Amped up!', '#ff9ed8'); },
      boostKillGold: (m) => { this.boonGoldMult = m; this.screenFloat('🤑 Merch rush!', '#ffd166'); },
    };
  }

  private pickBoon(boon: Boon): void {
    boon.apply(this.boonCtx());
    haptics.play('success');
    this.clearBoons();
  }

  private clearBoons(): void {
    this.boonUi.forEach((o) => o.destroy());
    this.boonUi = [];
  }

  /** The Fast Forward control sits just above the bottom bar — one-thumb reach. */
  private positionIntermission(): void {
    const ui = this.intermissionUi;
    if (!ui) return;
    const { vw, vh, barH } = this.screen;
    const label = ui.getData('label') as Phaser.GameObjects.Text;
    const preview = ui.getData('preview') as Phaser.GameObjects.Text;
    const ffBtn = ui.getData('ffBtn') as Phaser.GameObjects.Rectangle;
    const ffText = ui.getData('ffText') as Phaser.GameObjects.Text;
    const cx = vw / 2;
    const btnH = TOUCH_MIN;
    const btnW = Math.max(180, Math.min(280, vw * 0.7));
    const btnCy = vh - barH - 8 - btnH / 2;
    const font = Math.round(Phaser.Math.Clamp(btnH * 0.3, 13, 17));
    ffBtn.setSize(btnW, btnH).setPosition(cx, btnCy);
    ffText.setFontSize(font).setPosition(cx, btnCy);
    label.setFontSize(font).setPosition(cx, btnCy - btnH / 2 - 6);
    preview.setFontSize(Math.max(10, font - 3)).setPosition(cx, label.y - font - 4);
  }

  /** A one-line heads-up of the next wave's contents (+ boss warning). */
  private nextWavePreview(): string {
    const def = buildWaveDef(this.waves.currentWaveIndex + 1, this.waveProfile);
    const types: string[] = [];
    let boss: string | null = null;
    for (const g of def.groups) {
      const et = ENEMY_TYPES[g.type];
      if (!et) continue;
      if (et.boss) boss = et.name;
      else if (!types.includes(et.name)) types.push(et.name);
    }
    const elite = this.mode === 'endless' && this.waves.currentWaveIndex + 2 >= AFFIX_MIN_WAVE ? '⚡ ' : '';
    if (boss) return `${elite}⚠ BOSS NEXT: ${boss}`;
    const list = types.slice(0, 3).join(', ');
    return list ? `${elite}Coming up: ${list}` : '';
  }

  private tickIntermission(dt: number): void {
    if (!this.intermissionActive) return;
    // Hold the countdown while a between-wave story beat is on screen.
    if (this.dialogue?.isOpen) return;
    this.intermissionRemaining -= dt;
    if (this.intermissionRemaining <= 0) {
      this.endIntermission();
    } else {
      this.updateIntermissionUi();
    }
  }

  private updateIntermissionUi(): void {
    const label = this.intermissionUi?.getData('label') as
      | Phaser.GameObjects.Text
      | undefined;
    label?.setText(
      `Set ${this.waves.currentWaveNumber} nailed — next act in ${Math.ceil(this.intermissionRemaining)}s`,
    );
  }

  private endIntermission(): void {
    if (!this.intermissionActive) return;
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    this.clearBoons();
    audio.playMusic('inWave');
    this.waves.startNextWave();
    this.maybeSpawnScout();
    this.resumeWaveIndex = this.waves.currentWaveIndex;
    this.saveRunState();
  }

  // --- End of run (victory / game over) ------------------------------------

  private triggerGameOver(): void {
    this.gameOver = true;
    this.waves.stop();
    audio.playMusic('gameover');
    haptics.play('lose');
    this.cameras.main.shake(400, 0.01);
    this.towers.deselect();
    this.closeBuild();
    this.dialogue.close();
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    this.clearBoss();

    // Persist lifetime progress; the failed run is not resumable.
    saveMeta(this.meta);
    clearRun(this.mode, this.levelId);
    // Even a loss earns: bank this run's fans → bonus stars (the "never wasted"
    // loop). Banks lifetime + fan meter together.
    this.bankRunFans(false);
    // Endless: bank the best wave reached (new record only if strictly higher).
    if (this.mode === 'endless') {
      const reached = this.waves.currentWaveNumber;
      this.endNewRecord = reached > loadEndlessBest();
      this.endBestWave = saveEndlessBest(reached);
      // A single score rewards going deep AND playing well (kills + combo).
      this.endScore = reached * 1000 + this.runKills * 5 + this.highestCombo * 25;
      this.endBestScore = saveEndlessBestScore(this.endScore);
    }

    this.endState = 'gameover';
    this.renderEndScreen();
  }

  /** (Re)draw the terminal overlay centered on the current viewport. */
  private renderEndScreen(): void {
    this.endOverlay.forEach((o) => o.destroy());
    this.endOverlay = [];
    const cx = this.sw / 2;
    const cy = this.sh / 2;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.endOverlay.push(o);
      return o;
    };
    const line = (dy: number, str: string, size: number, color: string): void => {
      add(
        this.add
          .text(cx, cy + dy, str, { fontFamily: 'monospace', fontSize: `${size}px`, color })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
    };

    add(
      this.add
        .rectangle(cx, cy, this.sw, this.sh, 0x000000, this.endState === 'gameover' ? 0.7 : 0.72)
        .setDepth(DEPTH_OVERLAY)
        .setInteractive(), // absorb taps so towers can't be tapped through the overlay
    );

    if (this.endState === 'gameover' && this.mode === 'endless') {
      this.renderEndlessSurvived(line);
    } else if (this.endState === 'gameover') {
      line(-30, "SHOW'S OVER", 30, '#ff6b6b');
      line(6, `Booed off at wave ${this.waves.currentWaveNumber}`, 13, '#9aa0b0');
      this.fanSummaryLines().forEach((s, i) => line(34 + i * 18, s, 12, '#ff9ed8'));
      this.overlayButton('Back to menu', cx, this.endButtonY(), 0x51cf66, () =>
        this.fadeToScene('MenuScene'),
      );
    } else {
      // Story chapter complete or final victory — both show the star result.
      const final = this.endState === 'victory';
      line(-90, final ? 'STANDING OVATION!' : 'SET COMPLETE!', final ? 26 : 22, '#69db7c');
      line(-64, this.map.name, 12, '#9aa0b0');
      line(-30, '★'.repeat(this.endStars) + '☆'.repeat(3 - this.endStars), 34, '#ffd43b');

      const livesLost = SINGER_MAX_HP - this.singerHp;
      const goals = this.map.starGoals;
      const conds = [
        { ok: livesLost <= goals.maxLivesLost, label: `Lose ≤${goals.maxLivesLost} lives (lost ${livesLost})` },
        { ok: this.goldSpent <= goals.maxGoldSpent, label: `Spend ≤${goals.maxGoldSpent}g (spent ${this.goldSpent})` },
        { ok: this.highestCombo >= goals.minCombo, label: `Reach combo ${goals.minCombo} (got x${this.highestCombo})` },
      ];
      conds.forEach((c, i) =>
        line(8 + i * 18, `${c.ok ? '✓' : '✗'} ${c.label}`, 11, c.ok ? '#69db7c' : '#9aa0b0'),
      );
      line(
        70,
        this.endGained > 0 ? `+${this.endGained} ⭐ earned!` : 'No new stars this time',
        13,
        this.endGained > 0 ? '#ffd43b' : '#777f8f',
      );
      let dy = 92;
      this.fanSummaryLines().forEach((s) => {
        line(dy, s, 11, '#ff9ed8');
        dy += 16;
      });

      if (final) {
        this.overlayButton('Continue →', cx, this.endButtonY(), 0x51cf66, () =>
          this.fadeToScene('MenuScene'),
        );
      } else {
        const next = this.nextChapterId;
        const nextName = next ? LEVEL_BY_ID[next].name : '';
        line(dy, `Next up: ${nextName}`, 12, '#cfd3dc');
        this.overlayButton('On to the next stage →', cx, this.endButtonY(), 0x4dabf7, () => {
          if (next) this.restartScene({ mode: 'story', levelId: next, resume: false });
          else this.fadeToScene('MenuScene');
        });
      }
    }
  }

  /** Short "what this run earned you" lines shared by every end screen. */
  private fanSummaryLines(): string[] {
    const out: string[] = [];
    // Fame + its sub-rewards stay hidden until the Fame economy has unlocked, so
    // the very first level's results screen reads cleanly (Fame is still banked
    // silently and appears once it unlocks). See data/progression.ts.
    if (isFeatureUnlocked('fame')) {
      if (this.endFanGain > 0) out.push(`🎤 +${this.endFanGain} Fame`);
      for (const s of this.endMilestoneLines) out.push(s);
      if (this.setlistName) out.push(`🎵 Setlist: ${this.setlistName} (${this.runFanMult}× fans)`);
      for (const q of this.endQuestNames) out.push(`✓ Daily done: ${q}`);
      if (this.endFirstWin) out.push(`🎤 First win today — +${FIRST_WIN_FANS} fans!`);
    }
    // Nudge toward claimable goals — only once Records itself is reachable.
    if (isFeatureUnlocked('records')) {
      const ready = claimableCount({
        meta: this.meta,
        bestWave: loadEndlessBest(),
        completedChapters: loadStoryProgress()?.completedChapters ?? [],
      });
      if (ready > 0) out.push(`🏆 ${ready} goal${ready > 1 ? 's' : ''} ready — claim in Records!`);
    }
    return out;
  }

  /** Endless "you survived" results — wave reached, run stats, best, 2 buttons. */
  private renderEndlessSurvived(line: (dy: number, s: string, sz: number, c: string) => void): void {
    const cx = this.sw / 2;
    const reached = this.waves.currentWaveNumber;
    const newScore = this.endScore >= this.endBestScore;
    line(-110, 'YOU REACHED', 20, '#4dd2ff');
    line(-78, `WAVE ${reached}`, 32, '#ffd43b');
    line(-48, `${newScore ? '⭐ ' : ''}Score ${this.endScore.toLocaleString()}`, 15, newScore ? '#ffd43b' : '#cdeac0');
    line(-22, `Enemies silenced: ${this.runKills}`, 12, '#cdeac0');
    line(-4, `Highest combo: x${this.highestCombo}`, 12, '#ff9ed8');
    line(
      18,
      this.endNewRecord ? `🏆 New best — wave ${this.endBestWave}!` : `Best: wave ${this.endBestWave} · score ${this.endBestScore.toLocaleString()}`,
      12,
      this.endNewRecord ? '#ffd43b' : '#777f8f',
    );
    this.fanSummaryLines().forEach((s, i) => line(40 + i * 18, s, 12, '#ff9ed8'));
    const y = this.endButtonY();
    const gap = 12;
    const bw = Math.min(170, (this.sw - 24 - gap) / 2);
    this.overlayButton('↻ Try Again', cx - (bw + gap) / 2, y, 0x51cf66, () =>
      this.restartScene({ mode: 'endless', levelId: 'endless', resume: false }), bw,
    );
    this.overlayButton('Menu', cx + (bw + gap) / 2, y, 0x74c0fc, () =>
      this.fadeToScene('MenuScene'), bw,
    );
  }

  private endButtonY(): number {
    return this.sh - this.screen.barH - TOUCH_MIN;
  }

  /** A tap-friendly button on an end-of-run overlay. */
  private overlayButton(
    label: string,
    x: number,
    y: number,
    color: number,
    onClick: () => void,
    width?: number,
  ): void {
    const w = width ?? Math.max(150, Math.min(240, this.sw * 0.5));
    const btn = this.add
      .rectangle(x, y, w, TOUCH_MIN, 0x232336, 0.98)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(DEPTH_OVERLAY + 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 2);
    btn.on(
      'pointerdown',
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        onClick();
      },
    );
    this.endOverlay.push(btn, text);
  }

  /** Fade out, then restart the GameScene with new mode/level data. */
  private restartScene(data: { mode: GameMode; levelId: LevelId; resume: boolean }): void {
    this.cameras.main.fadeOut(280, 11, 11, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart(data));
  }

  /** Reduce singer HP. Triggers game over at zero. */
  damageSinger(amount: number): void {
    if (this.gameOver) return;
    this.singerHp = Math.max(0, this.singerHp - amount);
    this.hpText.setText(`${this.singerHp}/${SINGER_MAX_HP}`); // match refreshHud's format (no flicker)
    // Flash the singer red to signal the hit.
    if (this.singerFigure) {
      this.singerFigure.setTint(0xff4444);
      this.time.delayedCall(150, () => this.singerFigure?.clearTint());
    }
    if (this.singerHp === 0) this.triggerGameOver();
  }
}
