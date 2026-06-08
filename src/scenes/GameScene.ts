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
import { ShopPanel } from '../ui/ShopPanel';
import {
  STARTING_GOLD,
  TOWER_TYPES,
  type TowerTypeKey,
  type UpgradePathKey,
} from '../data/towers';
import {
  POWERUPS,
  SOUND_CHECK_DURATION_MS,
  ENCORE_REWIND_SECONDS,
  type PowerUpKey,
} from '../data/powerups';
import { BOSS_CONFIG } from '../data/enemies';
import { metaModifiers, type MetaProgress } from '../data/meta';
import {
  loadMeta,
  saveMeta,
  loadRun,
  saveRun,
  clearRun,
} from '../systems/storage';
import { audio } from '../systems/audio';
import { TX } from '../systems/textures';
import { TileType } from '../types/map';

/** Map each tile type to its generated (grayscale, tinted at use) texture key. */
const TILE_TEXTURE: Record<TileType, string> = {
  [TileType.Stage]: TX.tileStage,
  [TileType.Aisle]: TX.tileAisle,
  [TileType.Build]: TX.tileBuild,
};

const SINGER_MAX_HP = 30;
const COMBO_WINDOW = 2.5; // seconds between kills to keep the combo alive
const COMBO_BONUS = 0.15; // gold bonus per combo step
const INTERMISSION_SECONDS = 12;

// Active-ability tuning.
const POWER_NOTE_DAMAGE = 400; // Lead Singer single-target nuke
const DRUM_ROLL_RADIUS_TILES = 2.6; // Drummer stun blast radius
const DRUM_ROLL_STUN = 3; // seconds
const CHORD_BOMB_RADIUS_TILES = 2.5; // Keyboardist slow field radius
const CHORD_BOMB_DURATION = 10; // seconds the field persists
const CHORD_BOMB_SLOW = 0.4; // speed multiplier inside the field
const CHOIR_BOOST_DURATION_MS = 10000; // Backup Singer 2x attack-speed window
const DROP_THE_BASS_TILES = 5; // Bass Player screen-wide knockback
const CROWD_SURF_KILLS = 10; // Hype Man triple-gold kills

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
  private levelId: LevelId = 'level1';
  private resume = false;
  private map!: MapDefinition;
  private layout!: GridLayout;
  private screen!: ScreenLayout;
  private waves!: WaveManager;
  private towers!: TowerManager;
  private buildPanel!: BuildPanel;
  private upgradePanel!: UpgradePanel;
  private shopPanel!: ShopPanel;

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

  // Crowd Hype combo.
  private combo = 0;
  private comboTimer = 0;

  // Active-ability state.
  private crowdSurfKills = 0; // remaining triple-gold kills (Crowd Surf)
  private slowFields: {
    x: number;
    y: number;
    radius: number;
    remaining: number;
    visual: Phaser.GameObjects.Arc;
  }[] = []; // active Chord Bomb fields

  // Intermission between waves.
  private intermissionActive = false;
  private intermissionRemaining = 0;
  private intermissionUi?: Phaser.GameObjects.Container;

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
  private titleText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // Bottom control bar (screen-space).
  private barBg!: Phaser.GameObjects.Rectangle;
  private menuBtn!: { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };
  private shopBtn!: { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };

  // Terminal-state overlay (victory / game over), re-rendered on resize.
  private endState: 'none' | 'victory' | 'gameover' = 'none';
  private endStars = 0;
  private endGained = 0;
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
  init(data: { levelId?: LevelId; resume?: boolean }): void {
    this.levelId = data.levelId ?? 'level1';
    this.resume = data.resume ?? false;
    this.map = LEVEL_BY_ID[this.levelId];

    this.singerHp = SINGER_MAX_HP;
    this.gold = STARTING_GOLD;
    this.buildTarget = null;
    this.gameOver = false;
    this.paused = false;
    this.pauseUi = [];
    this.singer = undefined;
    this.singerFigure = undefined;
    this.singerTween = undefined;
    this.comboPulse = undefined;
    this.bossPrevHp = 0;
    this.goldSpent = 0;
    this.highestCombo = 0;
    this.resumeWaveIndex = 0;

    this.combo = 0;
    this.comboTimer = 0;
    this.crowdSurfKills = 0;
    this.slowFields = [];

    this.intermissionActive = false;
    this.intermissionRemaining = 0;
    this.intermissionUi = undefined;

    this.activeBoss = null;
    this.bossAbilityTimer = 0;
    this.bossPhase2 = false;
    this.bossPhase3 = false;
    this.bossBar = undefined;
    this.bossBarFill = undefined;
    this.bossBarLabel = undefined;

    this.endState = 'none';
    this.endOverlay = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.cameras.main.fadeIn(350, 11, 11, 18);
    this.screen = computeScreenLayout(this.sw, this.sh);

    // Load meta-progression and apply its permanent modifiers to this run.
    this.meta = loadMeta();
    const mods = metaModifiers(this.meta);
    this.gold = Math.round(STARTING_GOLD * mods.startingGoldMult);
    this.towerCostMult = mods.towerCostMult;
    this.comboWindow = COMBO_WINDOW + mods.comboWindowBonus;

    // Board-local layout (fixed tile size, origin 0,0) + the board container.
    this.layout = computeGridLayout(this.map);
    this.createBoard();

    this.drawHud();
    this.drawControlBar();
    this.drawMap(this.layout);

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
    );

    this.towers = new TowerManager(
      this,
      this.map,
      this.layout,
      this.waves.enemies,
      this.layers,
    );
    this.towers.onSelectionChange = (tower) => this.onTowerSelection(tower);
    this.buildPanel = new BuildPanel(this);
    this.upgradePanel = new UpgradePanel(this);
    this.shopPanel = new ShopPanel(this);
    this.setupInput();

    this.relayout(); // size board + chrome to the current viewport
    this.scale.on('resize', this.resizeHandler);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeHandler));

    const saved = this.resume ? loadRun(this.levelId) : null;
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
      this.waves.start();
      this.saveRunState();
    }
    this.refreshHud();
    audio.playMusic('inWave');
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

    // Transient panels re-anchor cleanly by closing; reopen the upgrade panel
    // for the still-selected tower so its Activate button stays reachable.
    this.buildPanel.close();
    this.shopPanel.close();
    if (this.buildTarget) this.closeBuild();
    const sel = this.towers?.selectedTower ?? null;
    if (sel) this.openUpgradePanel(sel);

    if (this.endState !== 'none') this.renderEndScreen();
    if (this.paused) this.renderPauseMenu();
  }

  /** Effective placement cost after the Group Discount meta-upgrade. */
  private towerCost(type: TowerTypeKey): number {
    return Math.round(TOWER_TYPES[type].cost * this.towerCostMult);
  }

  /** Persist the current run so the player can close and resume later. */
  private saveRunState(): void {
    if (this.gameOver) return;
    saveRun({
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
    const dt = delta / 1000;
    this.waves.update(dt);
    this.towers.update(dt);
    this.tickCombo(dt);
    this.tickSlowFields(dt);
    this.tickIntermission(dt);
    this.driveBoss(dt);
    this.refreshHud();
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
      this.buildPanel.open(
        this.gold,
        (type) => this.placeTower(type),
        () => this.closeBuild(),
        (type) => this.towerCost(type),
      );
    }
  }

  private placeTower(type: TowerTypeKey): void {
    const target = this.buildTarget;
    const cost = this.towerCost(type);
    if (target && this.gold >= cost && this.towers.canPlace(target.col, target.row)) {
      this.gold -= cost;
      this.goldSpent += cost;
      this.towers.placeTower(type, target.col, target.row, cost);
      this.refreshHud();
      this.saveRunState();
    }
    this.closeBuild();
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
    this.towers.deselect();
    this.closeBuild();
    this.shopPanel.close();
    this.time.paused = true;
    this.tweens.pauseAll();
    this.renderPauseMenu();
  }

  private closePauseMenu(): void {
    if (!this.paused) return;
    this.paused = false;
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

    const w = Math.max(200, Math.min(300, this.sw * 0.7));

    // Mute toggle.
    this.pauseButton(cx, cy - 54, w, audio.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
      audio.muted ? 0xff6b6b : 0x51cf66, () => {
        audio.toggleMuted();
        this.renderPauseMenu();
      });

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

    // Resume + Quit.
    this.pauseButton(cx, cy + 66, w, '▶ Resume', 0x51cf66, () => this.closePauseMenu());
    this.pauseButton(cx, cy + 66 + TOUCH_MIN + 10, w, '≡ Quit to menu', 0x9aa0b0, () => {
      this.closePauseMenu();
      this.quitToMenu();
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
    this.pauseUi.push(rect, text);
  }

  // --- Tower selection / upgrades / selling --------------------------------

  private onTowerSelection(tower: Tower | null): void {
    if (tower) {
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
      onActivate: () => this.activateAbility(tower),
    });
  }

  private upgradeTower(tower: Tower, path: UpgradePathKey): void {
    const next = tower.nextTier(path);
    if (!next || !tower.canUpgrade(path) || this.gold < next.cost) return;
    const spent = tower.applyUpgrade(path);
    this.gold -= spent;
    this.goldSpent += spent;
    this.refreshHud();
    this.saveRunState();
    this.openUpgradePanel(tower); // rebuild with new tier / gold
  }

  private sellTower(tower: Tower): void {
    this.gold += tower.sellValue;
    this.towers.removeTower(tower); // deselects -> closes the upgrade panel
    this.refreshHud();
    this.saveRunState();
  }

  // --- Active abilities ----------------------------------------------------

  /** Fire the selected tower's active ability if it's off cooldown. */
  private activateAbility(tower: Tower): void {
    if (this.gameOver || !tower.abilityReady) return;
    tower.startAbilityCooldown();
    audio.sfx('ability');
    this.cameras.main.shake(220, 0.008);
    const ts = this.layout.tileSize;

    switch (tower.type.ability.key) {
      case 'powerNote': {
        // Nuke the single strongest enemy on screen.
        let target: Enemy | null = null;
        for (const e of this.waves.enemies) {
          if (!e.isTargetable) continue;
          if (!target || e.hp > target.hp) target = e;
        }
        if (target) {
          target.takeDamage(POWER_NOTE_DAMAGE);
          this.abilityRing(target.x, target.y, ts * 1.4, 0xfff3bf);
          this.floatText(target.x, target.y, '💥 POWER NOTE!', '#fff3bf');
        }
        break;
      }
      case 'drumRoll': {
        const radius = DRUM_ROLL_RADIUS_TILES * ts;
        for (const e of this.waves.enemies) {
          if (Math.hypot(e.x - tower.x, e.y - tower.y) <= radius) {
            e.applySlow(0, DRUM_ROLL_STUN); // factor 0 = full stop
          }
        }
        this.abilityRing(tower.x, tower.y, radius, 0xff922b);
        this.floatText(tower.x, tower.y, '🥁 DRUM ROLL!', '#ffd8a8');
        break;
      }
      case 'chordBomb': {
        const radius = CHORD_BOMB_RADIUS_TILES * ts;
        const visual = this.add
          .circle(tower.x, tower.y, radius, 0x66d9e8, 0.18)
          .setStrokeStyle(2, 0x66d9e8, 0.6);
        this.layers.fx.add(visual);
        this.slowFields.push({
          x: tower.x,
          y: tower.y,
          radius,
          remaining: CHORD_BOMB_DURATION,
          visual,
        });
        this.floatText(tower.x, tower.y, '🧊 CHORD BOMB!', '#c5f6fa');
        break;
      }
      case 'choirBoost': {
        this.towers.abilitySpeedMultiplier = 2;
        this.showStatus(`🎶 CHOIR BOOST: 2x fire ${CHOIR_BOOST_DURATION_MS / 1000}s`);
        this.time.delayedCall(CHOIR_BOOST_DURATION_MS, () => {
          this.towers.abilitySpeedMultiplier = 1;
          if (this.statusText.text.startsWith('🎶')) this.statusText.setVisible(false);
        });
        this.abilityRing(tower.x, tower.y, ts * 2, 0xb197fc);
        this.floatText(tower.x, tower.y, '🎶 CHOIR BOOST!', '#d0bfff');
        break;
      }
      case 'dropTheBass': {
        for (const e of this.waves.enemies) e.knockback(DROP_THE_BASS_TILES);
        const cx = this.layout.mapW / 2;
        const cy = this.layout.mapH / 2;
        this.abilityRing(cx, cy, this.layout.mapW / 2, 0x7048e8);
        this.floatText(cx, cy, '🔊 DROP THE BASS!', '#d0bfff');
        break;
      }
      case 'crowdSurf': {
        this.crowdSurfKills = CROWD_SURF_KILLS;
        this.showStatus(`🏄 CROWD SURF: 3x gold ×${this.crowdSurfKills}`);
        this.floatText(tower.x, tower.y, '🏄 CROWD SURF!', '#ffd8a8');
        break;
      }
    }

    this.openUpgradePanel(tower); // rebuild so the button shows the cooldown
  }

  /** Expanding ring used as the visual punch for an activated ability. */
  private abilityRing(x: number, y: number, radius: number, color: number): void {
    const ring = this.add
      .circle(x, y, radius, color, 0.22)
      .setStrokeStyle(3, color, 0.9)
      .setScale(0.15);
    this.layers.fx.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
  }

  /** Chord Bomb slow fields: re-slow enemies inside them, expire after 10s. */
  private tickSlowFields(dt: number): void {
    for (let i = this.slowFields.length - 1; i >= 0; i--) {
      const f = this.slowFields[i];
      f.remaining -= dt;
      for (const e of this.waves.enemies) {
        if (Math.hypot(e.x - f.x, e.y - f.y) <= f.radius) {
          e.applySlow(CHORD_BOMB_SLOW, 0.3); // short, continually refreshed
        }
      }
      if (f.remaining <= 0) {
        f.visual.destroy();
        this.slowFields.splice(i, 1);
      }
    }
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
      }
    }

    const border = this.add
      .rectangle(offsetX + mapW / 2, offsetY + mapH / 2, mapW, mapH)
      .setStrokeStyle(2, 0xffffff, 0.15);
    this.layers.tiles.add(border);

    this.drawLaneMarkers(layout);
    this.drawSinger(layout);
  }

  /** Numbered entrance markers at the right edge of each aisle. */
  private drawLaneMarkers(layout: GridLayout): void {
    const { tileSize, mapW, offsetX, offsetY } = layout;
    this.map.laneRows.forEach((row, i) => {
      const y = offsetY + row * tileSize + tileSize / 2;
      const x = offsetX + mapW - tileSize / 2;
      const label = this.add
        .text(x, y, `${i + 1}`, {
          fontFamily: 'monospace',
          fontSize: `${Math.max(8, tileSize - 8)}px`,
          color: '#ffd166',
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

    // Theatre-curtain backdrop fills the stage column.
    const curtain = this.add.image(0, 0, TX.curtain).setDisplaySize(stageW, mapH);
    // Singer figure, sized to the column width (natural aspect, not stretched).
    const fw = Math.min(stageW * 0.92, tileSize * 1.2);
    const fh = fw * 2; // texture is 48x96
    const figure = this.add.image(0, mapH * 0.06, TX.singer).setDisplaySize(fw, fh);
    // Warm spotlight cone above the figure (additive glow).
    const spot = this.add
      .image(0, -fh * 0.55, TX.spotlight)
      .setDisplaySize(stageW * 1.5, fh * 1.6)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.singerFigure = figure;
    this.singer = this.add.container(cx, cy, [curtain, spot, figure]);
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
  }

  // --- HUD (screen-space top strip) ----------------------------------------

  private drawHud(): void {
    this.hudBg = this.add
      .rectangle(0, 0, 10, 10, 0x14141c, 0.92)
      .setOrigin(0, 0)
      .setDepth(DEPTH_HUD);
    this.titleText = this.add
      .text(0, 0, 'KaraFence', { fontFamily: 'monospace', color: '#e84393' })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.goldText = this.add
      .text(0, 0, `Gold ${this.gold}`, { fontFamily: 'monospace', color: '#ffd166' })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.waveText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#dddddd' })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.hpText = this.add
      .text(0, 0, `♥ ${this.singerHp}`, { fontFamily: 'monospace', color: '#ffffff' })
      .setOrigin(1, 0.5)
      .setDepth(DEPTH_HUD + 1);
    this.comboText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#ffd43b' })
      .setOrigin(0.5)
      .setDepth(DEPTH_BOSSBAR)
      .setVisible(false);
    this.statusText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#69db7c' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_BOSSBAR)
      .setVisible(false);
  }

  private positionHud(): void {
    const { vw, hudH, portrait } = this.screen;
    this.hudBg.setPosition(0, 0).setSize(vw, hudH);
    const cy = hudH / 2;
    const font = Math.round(Phaser.Math.Clamp(hudH * 0.32, 12, 18));
    const small = `${font}px`;
    // On narrow portrait screens the title would crowd the readouts.
    const showTitle = !portrait || vw >= 460;
    this.titleText.setVisible(showTitle).setFontSize(font).setPosition(8, cy);
    const goldX = showTitle ? Math.min(vw * 0.32, 120) : 8;
    this.goldText.setFontSize(font).setPosition(goldX, cy);
    // The wave/foes readout is the longest string; on narrow screens shrink it
    // and bias it toward the right so it never collides with Gold or HP.
    const waveFont = Math.round(font * (vw < 460 ? 0.72 : 0.85));
    const waveX = Math.min(vw * 0.62, vw - 70);
    this.waveText.setFontSize(`${waveFont}px`).setPosition(waveX, cy);
    this.hpText.setFontSize(font).setPosition(vw - 8, cy);
    this.comboText
      .setFontSize(`${Math.round(font * 1.3)}px`)
      .setPosition(vw / 2, hudH + Math.round(font * 1.1));
    this.statusText.setFontSize(small).setPosition(vw / 2, hudH + 4);
  }

  private refreshHud(): void {
    this.goldText.setText(`Gold ${this.gold}`);
    this.waveText.setText(
      `Wave ${this.waves.currentWaveNumber}/${this.waves.totalWaves} · Foes ${this.waves.enemiesRemaining}`,
    );
    this.hpText.setText(`♥ ${this.singerHp}`);
  }

  // --- Bottom control bar (screen-space) -----------------------------------

  private drawControlBar(): void {
    this.barBg = this.add
      .rectangle(0, 0, 10, 10, 0x14141c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2a2a3a, 1)
      .setDepth(DEPTH_BAR);
    this.menuBtn = this.barButton('≡ Pause', 0x9aa0b0, '#cfd3dc', () => this.openPauseMenu());
    this.shopBtn = this.barButton('🎟 Shop', 0xffd166, '#ffd166', () => this.openShop());
  }

  /** A bar button (rect + centered label), positioned later by the layout. */
  private barButton(
    label: string,
    stroke: number,
    color: string,
    onClick: () => void,
  ): { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const rect = this.add
      .rectangle(0, 0, TOUCH_MIN, TOUCH_MIN, 0x232336, 0.98)
      .setStrokeStyle(2, stroke, 0.9)
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
    return { rect, text };
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

    this.menuBtn.rect.setSize(btnW, btnH).setPosition(margin + btnW / 2, cy);
    this.menuBtn.text.setFontSize(font).setPosition(margin + btnW / 2, cy);
    this.shopBtn.rect.setSize(btnW, btnH).setPosition(vw - margin - btnW / 2, cy);
    this.shopBtn.text.setFontSize(font).setPosition(vw - margin - btnW / 2, cy);
  }

  // --- Game flow -----------------------------------------------------------

  private onEnemyReachStage(enemy: Enemy): void {
    // The Mic Grabber steals gold and kills the combo if he reaches the stage.
    if (enemy.type.boss === 'micGrabber') {
      this.gold = Math.max(0, this.gold - BOSS_CONFIG.micGrabber.goldSteal);
      this.combo = 0;
      this.updateComboHud(false);
      this.floatText(enemy.x, enemy.y, '🎤 -10g STOLEN!', '#ff6b6b');
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
    this.meta.lifetime.kills += 1;
    this.meta.lifetime.highestCombo = Math.max(
      this.meta.lifetime.highestCombo,
      this.combo,
    );

    const reward = this.rewardAfterCritic(enemy);
    const bonus = Math.round(reward * COMBO_BONUS * this.combo);
    let gain = reward + bonus;
    if (hype.goldMult > 1) gain = Math.round(gain * hype.goldMult);

    let tripled = false;
    if (this.crowdSurfKills > 0) {
      gain *= 3;
      this.crowdSurfKills -= 1;
      tripled = true;
      if (this.crowdSurfKills > 0) {
        this.showStatus(`🏄 CROWD SURF: 3x gold ×${this.crowdSurfKills}`);
      } else {
        this.statusText.setVisible(false);
      }
    }
    this.gold += gain;

    this.floatText(
      enemy.x,
      enemy.y,
      `+${gain}`,
      tripled ? '#ffa94d' : this.combo >= 3 ? '#ffd43b' : '#cdeac0',
    );
    this.updateComboHud(true);
    if (this.combo >= 2) audio.sfx('comboTick', { combo: this.combo });
    if (this.combo >= 5 && this.combo % 5 === 0) this.crowdGoesWild();
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
    this.cameras.main.shake(450, 0.012);
  }

  private showBossBar(boss: Enemy): void {
    this.bossBar?.destroy(true);
    const bg = this.add.rectangle(0, 0, 10, 9, 0x2a0e16, 0.95).setStrokeStyle(1, 0xffffff, 0.5);
    this.bossBarFill = this.add.rectangle(0, 0, 10, 9, 0xff5070).setOrigin(0, 0.5);
    this.bossBarLabel = this.add
      .text(0, 0, boss.type.name, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
      .setOrigin(0.5);
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
    this.bossBarFill.fillColor = shielded ? 0x74c0fc : 0xff5070;
    this.bossBarLabel.setText(boss.type.name + (shielded ? '  [SHIELD]' : ''));
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
      return;
    }
    this.comboText.setVisible(true).setText(`🔥 HYPE x${this.combo}`);
    const hot = this.combo >= 5;
    this.comboText.setColor(hot ? '#ff6bd6' : '#ffd43b');
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
    const text = this.add
      .text(this.sw / 2, this.sh / 2 - 30, 'THE CROWD GOES WILD!', {
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
    // Lifetime: count the wave just survived and persist progression.
    this.meta.lifetime.waves += 1;
    saveMeta(this.meta);
    audio.sfx('waveClear');

    // Interest: +1 gold per 10 banked.
    const interest = Math.floor(this.gold / 10);
    if (interest > 0) {
      this.gold += interest;
      this.screenFloat(`+${interest}g interest`, '#69db7c');
      audio.sfx('gold');
    }
    this.refreshHud();

    if (this.waves.hasNextWave) {
      // Resume should pick up at the upcoming wave.
      this.resumeWaveIndex = this.waves.currentWaveIndex + 1;
      this.saveRunState();
      this.startIntermission();
    } else {
      this.triggerVictory();
    }
  }

  private startIntermission(): void {
    this.intermissionActive = true;
    this.intermissionRemaining = INTERMISSION_SECONDS;
    this.towers.deselect();
    audio.playMusic('intermission');

    const label = this.add
      .text(0, 0, '', { fontFamily: 'monospace', color: '#ffffff' })
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

    this.intermissionUi = this.add.container(0, 0, [label, ffBtn, ffText]).setDepth(DEPTH_BAR + 5);
    this.intermissionUi.setData('label', label);
    this.intermissionUi.setData('ffBtn', ffBtn);
    this.intermissionUi.setData('ffText', ffText);
    this.positionIntermission();
    this.updateIntermissionUi();
  }

  /** The Fast Forward control sits just above the bottom bar — one-thumb reach. */
  private positionIntermission(): void {
    const ui = this.intermissionUi;
    if (!ui) return;
    const { vw, vh, barH } = this.screen;
    const label = ui.getData('label') as Phaser.GameObjects.Text;
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
  }

  private tickIntermission(dt: number): void {
    if (!this.intermissionActive) return;
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
      `Next wave in ${Math.ceil(this.intermissionRemaining)}s · Build / shop now`,
    );
  }

  private endIntermission(): void {
    if (!this.intermissionActive) return;
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    audio.playMusic('inWave');
    this.waves.startNextWave();
    this.resumeWaveIndex = this.waves.currentWaveIndex;
    this.saveRunState();
  }

  // --- Shop / power-ups ----------------------------------------------------

  private openShop(): void {
    if (this.gameOver) return;
    this.towers.deselect();
    this.shopPanel.open(
      this.gold,
      (key) => this.buyPowerUp(key),
      () => this.shopPanel.close(),
    );
  }

  private buyPowerUp(key: PowerUpKey): void {
    const cost = POWERUPS[key].cost;
    if (this.gold < cost) return;
    this.gold -= cost;
    this.goldSpent += cost;
    this.refreshHud();
    this.shopPanel.close();
    this.activatePowerUp(key);
    this.saveRunState();
  }

  private activatePowerUp(key: PowerUpKey): void {
    const cx = this.layout.mapW / 2;
    const cy = this.layout.mapH / 2;
    switch (key) {
      case 'securityGuard':
        // Lethal hit to everything on screen (routes kills through the economy).
        for (const enemy of [...this.waves.enemies]) enemy.takeDamage(999999);
        this.floatText(cx, cy, '🛡️ CLEARED!', '#ffffff');
        break;
      case 'encore':
        for (const enemy of this.waves.enemies) enemy.rewind(ENCORE_REWIND_SECONDS);
        this.floatText(cx, cy, '🔁 ENCORE!', '#74c0fc');
        break;
      case 'soundCheck':
        this.towers.damageMultiplier = 2;
        this.showStatus(`🎚 2x DMG ${SOUND_CHECK_DURATION_MS / 1000}s`);
        this.time.delayedCall(SOUND_CHECK_DURATION_MS, () => {
          this.towers.damageMultiplier = 1;
          this.statusText.setVisible(false);
        });
        break;
    }
  }

  private showStatus(msg: string): void {
    this.statusText.setVisible(true).setText(msg);
  }

  // --- End of run (victory / game over) ------------------------------------

  private triggerVictory(): void {
    this.gameOver = true;
    this.clearBoss();
    audio.playMusic('victory');

    // Score the run: one star per goal met.
    const livesLost = SINGER_MAX_HP - this.singerHp;
    const goals = this.map.starGoals;
    const stars = [
      livesLost <= goals.maxLivesLost,
      this.goldSpent <= goals.maxGoldSpent,
      this.highestCombo >= goals.minCombo,
    ].filter(Boolean).length;
    const prev = this.meta.stars[this.levelId] ?? 0;
    this.endGained = Math.max(0, stars - prev);
    if (stars > prev) this.meta.stars[this.levelId] = stars;
    saveMeta(this.meta);
    clearRun(this.levelId); // run complete — no resume

    this.endStars = stars;
    this.endState = 'victory';
    this.renderEndScreen();
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.waves.stop();
    audio.playMusic('gameover');
    this.cameras.main.shake(400, 0.01);
    this.towers.deselect();
    this.closeBuild();
    this.shopPanel.close();
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    this.slowFields.forEach((f) => f.visual.destroy());
    this.slowFields = [];
    this.clearBoss();

    // Persist lifetime progress; the failed run is not resumable.
    saveMeta(this.meta);
    clearRun(this.levelId);

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

    add(
      this.add
        .rectangle(cx, cy, this.sw, this.sh, 0x000000, this.endState === 'victory' ? 0.72 : 0.7)
        .setDepth(DEPTH_OVERLAY),
    );

    if (this.endState === 'victory') {
      add(
        this.add
          .text(cx, cy - 90, 'YOU SURVIVED!', {
            fontFamily: 'monospace',
            fontSize: '26px',
            color: '#69db7c',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      add(
        this.add
          .text(cx, cy - 64, this.map.name, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#9aa0b0',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      add(
        this.add
          .text(
            cx,
            cy - 30,
            '★'.repeat(this.endStars) + '☆'.repeat(3 - this.endStars),
            { fontFamily: 'monospace', fontSize: '34px', color: '#ffd43b' },
          )
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );

      const livesLost = SINGER_MAX_HP - this.singerHp;
      const goals = this.map.starGoals;
      const conds = [
        { ok: livesLost <= goals.maxLivesLost, label: `Lose ≤${goals.maxLivesLost} lives (lost ${livesLost})` },
        { ok: this.goldSpent <= goals.maxGoldSpent, label: `Spend ≤${goals.maxGoldSpent}g (spent ${this.goldSpent})` },
        { ok: this.highestCombo >= goals.minCombo, label: `Reach combo ${goals.minCombo} (got x${this.highestCombo})` },
      ];
      conds.forEach((c, i) => {
        add(
          this.add
            .text(cx, cy + 8 + i * 18, `${c.ok ? '✓' : '✗'} ${c.label}`, {
              fontFamily: 'monospace',
              fontSize: '11px',
              color: c.ok ? '#69db7c' : '#9aa0b0',
            })
            .setOrigin(0.5)
            .setDepth(DEPTH_OVERLAY + 1),
        );
      });
      add(
        this.add
          .text(
            cx,
            cy + 70,
            this.endGained > 0 ? `+${this.endGained} ⭐ earned!` : 'No new stars this time',
            {
              fontFamily: 'monospace',
              fontSize: '13px',
              color: this.endGained > 0 ? '#ffd43b' : '#777f8f',
            },
          )
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      this.endRunButton('Continue →');
    } else {
      add(
        this.add
          .text(cx, cy - 30, 'GAME OVER', {
            fontFamily: 'monospace',
            fontSize: '30px',
            color: '#ff6b6b',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      add(
        this.add
          .text(cx, cy + 6, `Reached wave ${this.waves.currentWaveNumber}`, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#9aa0b0',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH_OVERLAY + 1),
      );
      this.endRunButton('Back to menu');
    }
  }

  /** A big "back to the level select" button on the end-of-run overlays. */
  private endRunButton(label: string): void {
    const cx = this.sw / 2;
    const y = this.sh - this.screen.barH - TOUCH_MIN;
    const w = Math.max(180, Math.min(260, this.sw * 0.6));
    const btn = this.add
      .rectangle(cx, y, w, TOUCH_MIN, 0x232336, 0.98)
      .setStrokeStyle(2, 0x51cf66, 0.95)
      .setDepth(DEPTH_OVERLAY + 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(cx, y, label, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' })
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
        this.fadeToScene('MenuScene');
      },
    );
    this.endOverlay.push(btn, text);
  }

  /** Reduce singer HP. Triggers game over at zero. */
  damageSinger(amount: number): void {
    if (this.gameOver) return;
    this.singerHp = Math.max(0, this.singerHp - amount);
    this.hpText.setText(`♥ ${this.singerHp}`);
    // Flash the singer red to signal the hit.
    if (this.singerFigure) {
      this.singerFigure.setTint(0xff4444);
      this.time.delayedCall(150, () => this.singerFigure?.clearTint());
    }
    if (this.singerHp === 0) this.triggerGameOver();
  }
}
