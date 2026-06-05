import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { level1 } from '../data/level1';
import { TileType, type MapDefinition } from '../types/map';
import {
  computeGridLayout,
  tileToWorld,
  type GridLayout,
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

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Stage]: 0x3a2150,
  [TileType.Aisle]: 0x8a5a44,
  [TileType.Build]: 0x24414f,
};

const HUD_HEIGHT = 22;
const SINGER_MAX_HP = 30;
const COMBO_WINDOW = 2.5; // seconds between kills to keep the combo alive
const COMBO_BONUS = 0.15; // gold bonus per combo step
const INTERMISSION_SECONDS = 12;

/**
 * GameScene renders the lane grid + stage and runs the whole game loop: waves,
 * towers, the gold/combo/interest economy, intermissions, and the shop.
 */
export class GameScene extends Phaser.Scene {
  private readonly map: MapDefinition = level1;
  private layout!: GridLayout;
  private waves!: WaveManager;
  private towers!: TowerManager;
  private buildPanel!: BuildPanel;
  private upgradePanel!: UpgradePanel;
  private shopPanel!: ShopPanel;

  private singerHp = SINGER_MAX_HP;
  private gold = STARTING_GOLD;
  private buildTarget: { col: number; row: number } | null = null;
  private gameOver = false;

  // Crowd Hype combo.
  private combo = 0;
  private comboTimer = 0;

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

  private waveText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.layout = computeGridLayout(
      this.map,
      GAME_WIDTH,
      GAME_HEIGHT - HUD_HEIGHT,
      HUD_HEIGHT,
    );

    this.drawHud();
    this.drawMap(this.layout);

    this.waves = new WaveManager(this, this.map, this.layout, {
      onReachStage: (enemy) => this.onEnemyReachStage(enemy),
      onKill: (enemy) => this.onEnemyKilled(enemy),
      onWaveCleared: () => this.onWaveCleared(),
      onBossSpawn: (enemy) => this.onBossSpawn(enemy),
    });

    this.towers = new TowerManager(this, this.map, this.layout, this.waves.enemies);
    this.towers.onSelectionChange = (tower) => this.onTowerSelection(tower);
    this.buildPanel = new BuildPanel(this);
    this.upgradePanel = new UpgradePanel(this);
    this.shopPanel = new ShopPanel(this);
    this.setupInput();

    this.waves.start();
    this.refreshHud();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    const dt = delta / 1000;
    this.waves.update(dt);
    this.towers.update(dt);
    this.tickCombo(dt);
    this.tickIntermission(dt);
    this.driveBoss(dt);
    this.refreshHud();
  }

  // --- Input / placement ---------------------------------------------------

  private setupInput(): void {
    const { offsetX, offsetY, mapW, mapH } = this.layout;
    this.add
      .zone(offsetX, offsetY, mapW, mapH)
      .setOrigin(0, 0)
      .setDepth(1)
      .setInteractive()
      .on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.onMapClick(pointer),
      );

    // Persistent shop button (also reachable during intermission).
    const shopBtn = this.add
      .rectangle(GAME_WIDTH - 34, GAME_HEIGHT - 11, 64, 16, 0x141420, 0.95)
      .setStrokeStyle(1, 0xffd166, 0.9)
      .setDepth(110)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_WIDTH - 34, GAME_HEIGHT - 11, '🎟 Shop', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(111);
    shopBtn.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => {
      ev?.stopPropagation();
      this.openShop();
    });
  }

  private onMapClick(pointer: Phaser.Input.Pointer): void {
    if (this.gameOver || this.buildPanel.isOpen) return;
    const { offsetX, offsetY, tileSize } = this.layout;
    const col = Math.floor((pointer.worldX - offsetX) / tileSize);
    const row = Math.floor((pointer.worldY - offsetY) / tileSize);

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
      );
    }
  }

  private placeTower(type: TowerTypeKey): void {
    const target = this.buildTarget;
    const cost = TOWER_TYPES[type].cost;
    if (target && this.gold >= cost && this.towers.canPlace(target.col, target.row)) {
      this.gold -= cost;
      this.towers.placeTower(type, target.col, target.row);
      this.refreshHud();
    }
    this.closeBuild();
  }

  private closeBuild(): void {
    this.buildPanel.close();
    this.towers.hideBuildOverlay();
    this.buildTarget = null;
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
    });
  }

  private upgradeTower(tower: Tower, path: UpgradePathKey): void {
    const next = tower.nextTier(path);
    if (!next || !tower.canUpgrade(path) || this.gold < next.cost) return;
    this.gold -= tower.applyUpgrade(path);
    this.refreshHud();
    this.openUpgradePanel(tower); // rebuild with new tier / gold
  }

  private sellTower(tower: Tower): void {
    this.gold += tower.sellValue;
    this.towers.removeTower(tower); // deselects -> closes the upgrade panel
    this.refreshHud();
  }

  // --- Map rendering -------------------------------------------------------

  private drawMap(layout: GridLayout): void {
    const { tileSize, mapW, mapH, offsetX, offsetY } = layout;

    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const type = this.map.tiles[r][c];
        const { x, y } = tileToWorld(layout, c, r);
        this.add
          .rectangle(x, y, tileSize, tileSize, TILE_COLORS[type])
          .setStrokeStyle(1, 0x000000, 0.35);
      }
    }

    this.add
      .rectangle(offsetX + mapW / 2, offsetY + mapH / 2, mapW, mapH)
      .setStrokeStyle(2, 0xffffff, 0.15);

    this.drawLaneMarkers(layout);
    this.drawSinger(layout);
  }

  /** Numbered entrance markers at the right edge of each aisle. */
  private drawLaneMarkers(layout: GridLayout): void {
    const { tileSize, mapW, offsetX, offsetY } = layout;
    this.map.laneRows.forEach((row, i) => {
      const y = offsetY + row * tileSize + tileSize / 2;
      const x = offsetX + mapW - tileSize / 2;
      this.add
        .text(x, y, `${i + 1}`, {
          fontFamily: 'monospace',
          fontSize: `${Math.max(8, tileSize - 8)}px`,
          color: '#ffd166',
        })
        .setOrigin(0.5);
    });
  }

  /** Placeholder singer in the stage zone on the left. */
  private drawSinger(layout: GridLayout): void {
    const { tileSize, mapH, offsetX, offsetY } = layout;
    const stageW = tileSize * (this.map.stageCol + 1);
    const cx = offsetX + stageW / 2;
    const cy = offsetY + mapH / 2;

    this.add
      .rectangle(cx, cy, stageW - 6, mapH * 0.45, 0xe84393)
      .setStrokeStyle(2, 0xffffff, 0.8);
    this.add
      .text(cx, cy - 7, '♪', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 8, 'SINGER', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  // --- HUD -----------------------------------------------------------------

  private drawHud(): void {
    this.add
      .text(6, 5, 'KaraFence', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e84393',
      })
      .setDepth(100);
    this.goldText = this.add
      .text(96, 6, `Gold ${this.gold}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffd166',
      })
      .setDepth(100);
    this.waveText = this.add
      .text(GAME_WIDTH / 2 + 28, 6, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#dddddd',
      })
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.hpText = this.add
      .text(GAME_WIDTH - 6, 6, `SINGER  HP ${this.singerHp}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(1, 0)
      .setDepth(100);
    this.comboText = this.add
      .text(GAME_WIDTH / 2, 32, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd43b',
      })
      .setOrigin(0.5)
      .setDepth(120)
      .setVisible(false);
    this.statusText = this.add
      .text(6, 30, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#69db7c',
      })
      .setDepth(120)
      .setVisible(false);
  }

  private refreshHud(): void {
    this.goldText.setText(`Gold ${this.gold}`);
    this.waveText.setText(
      `Wave ${this.waves.currentWaveNumber}/${this.waves.totalWaves}  ·  Foes ${this.waves.enemiesRemaining}`,
    );
    this.hpText.setText(`SINGER  HP ${this.singerHp}`);
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
    this.damageSinger(enemy.damage);
  }

  /** Killed enemies pay out their reward plus a combo (Crowd Hype) bonus. */
  private onEnemyKilled(enemy: Enemy): void {
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    const reward = this.rewardAfterCritic(enemy);
    const bonus = Math.round(reward * COMBO_BONUS * this.combo);
    const gain = reward + bonus;
    this.gold += gain;

    this.floatText(
      enemy.x,
      enemy.y,
      `+${gain}`,
      this.combo >= 3 ? '#ffd43b' : '#cdeac0',
    );
    this.updateComboHud(true);
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
    this.showBossBar(boss);
  }

  private showBossBar(boss: Enemy): void {
    this.bossBar?.destroy(true);
    const w = GAME_WIDTH - 16;
    const bg = this.add.rectangle(0, 0, w, 9, 0x2a0e16, 0.95).setStrokeStyle(1, 0xffffff, 0.5);
    this.bossBarFill = this.add
      .rectangle(-w / 2, 0, w, 9, 0xff5070)
      .setOrigin(0, 0.5);
    this.bossBarLabel = this.add
      .text(0, 0, boss.type.name, {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.bossBar = this.add
      .container(GAME_WIDTH / 2, 19, [bg, this.bossBarFill, this.bossBarLabel])
      .setDepth(135);
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
    this.activeBoss = null;
    this.towers.attackSpeedMultiplier = 1; // undo Talent Judge phase 3
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
      .setScale(0.2)
      .setDepth(19);
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
      this.comboText.setVisible(false);
      return;
    }
    this.comboText.setVisible(true).setText(`🔥 HYPE x${this.combo}`);
    if (pop) {
      this.comboText.setScale(1.4);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 180 });
    }
  }

  private crowdGoesWild(): void {
    const flash = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.5)
      .setDepth(240);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'THE CROWD GOES WILD!', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ff6bd6',
      })
      .setOrigin(0.5)
      .setDepth(241);
    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 16,
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  private floatText(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, { fontFamily: 'monospace', fontSize: '9px', color })
      .setOrigin(0.5)
      .setDepth(130);
    this.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  // --- Intermission + interest ---------------------------------------------

  private onWaveCleared(): void {
    // Interest: +1 gold per 10 banked.
    const interest = Math.floor(this.gold / 10);
    if (interest > 0) {
      this.gold += interest;
      this.floatText(96, 30, `+${interest}g interest`, '#69db7c');
    }
    this.refreshHud();

    if (this.waves.hasNextWave) {
      this.startIntermission();
    } else {
      this.triggerVictory();
    }
  }

  private startIntermission(): void {
    this.intermissionActive = true;
    this.intermissionRemaining = INTERMISSION_SECONDS;
    this.towers.deselect();

    const w = 250;
    const bg = this.add
      .rectangle(0, 0, w, 30, 0x141420, 0.95)
      .setStrokeStyle(1, 0x4dabf7, 0.9);
    const label = this.add
      .text(-w / 2 + 8, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ffffff' })
      .setOrigin(0, 0.5);
    const ffBtn = this.add
      .rectangle(w / 2 - 46, 0, 80, 18, 0x233323)
      .setStrokeStyle(1, 0x51cf66, 0.9)
      .setInteractive({ useHandCursor: true });
    const ffText = this.add
      .text(w / 2 - 46, 0, '▶▶ Skip', { fontFamily: 'monospace', fontSize: '9px', color: '#69db7c' })
      .setOrigin(0.5);
    ffBtn.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => {
      ev?.stopPropagation();
      this.endIntermission();
    });

    this.intermissionUi = this.add
      .container(GAME_WIDTH / 2, 40, [bg, label, ffBtn, ffText])
      .setDepth(140);
    this.intermissionUi.setData('label', label);
    this.updateIntermissionUi();
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
      `Next wave in ${Math.ceil(this.intermissionRemaining)}s   ·   Build / shop now`,
    );
  }

  private endIntermission(): void {
    if (!this.intermissionActive) return;
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    this.waves.startNextWave();
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
    this.refreshHud();
    this.shopPanel.close();
    this.activatePowerUp(key);
  }

  private activatePowerUp(key: PowerUpKey): void {
    switch (key) {
      case 'securityGuard':
        // Lethal hit to everything on screen (routes kills through the economy).
        for (const enemy of [...this.waves.enemies]) enemy.takeDamage(999999);
        this.floatText(GAME_WIDTH / 2, GAME_HEIGHT / 2, '🛡️ CLEARED!', '#ffffff');
        break;
      case 'encore':
        for (const enemy of this.waves.enemies) enemy.rewind(ENCORE_REWIND_SECONDS);
        this.floatText(GAME_WIDTH / 2, GAME_HEIGHT / 2, '🔁 ENCORE!', '#74c0fc');
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

  private triggerVictory(): void {
    this.gameOver = true;
    this.clearBoss();
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setDepth(200);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'YOU SURVIVED!\nThe show goes on 🎤', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#69db7c',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(201);
  }

  /** Reduce singer HP. Triggers game over at zero. */
  damageSinger(amount: number): void {
    if (this.gameOver) return;
    this.singerHp = Math.max(0, this.singerHp - amount);
    this.hpText.setText(`SINGER  HP ${this.singerHp}`);
    if (this.singerHp === 0) this.triggerGameOver();
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.waves.stop();
    this.towers.deselect();
    this.closeBuild();
    this.shopPanel.close();
    this.intermissionActive = false;
    this.intermissionUi?.destroy(true);
    this.intermissionUi = undefined;
    this.clearBoss();
    this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x000000,
        0.6,
      )
      .setDepth(200);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ff6b6b',
      })
      .setOrigin(0.5)
      .setDepth(201);
  }
}
