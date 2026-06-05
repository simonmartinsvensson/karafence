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

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Stage]: 0x3a2150,
  [TileType.Aisle]: 0x8a5a44,
  [TileType.Build]: 0x24414f,
};

const HUD_HEIGHT = 22;
const SINGER_MAX_HP = 20;

/**
 * GameScene renders the lane grid + stage and runs the enemy waves. Towers are
 * not implemented yet, so enemies currently march unopposed to the stage.
 */
export class GameScene extends Phaser.Scene {
  private readonly map: MapDefinition = level1;
  private layout!: GridLayout;
  private waves!: WaveManager;

  private singerHp = SINGER_MAX_HP;
  private gameOver = false;

  private waveText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;

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
    });
    this.waves.start();
    this.refreshHud();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    this.waves.update(delta / 1000);
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
    this.waveText = this.add
      .text(GAME_WIDTH / 2, 6, '', {
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
  }

  private refreshHud(): void {
    this.waveText.setText(
      `Wave ${this.waves.currentWaveNumber}/${this.waves.totalWaves}  ·  Foes ${this.waves.enemiesRemaining}`,
    );
    this.hpText.setText(`SINGER  HP ${this.singerHp}`);
  }

  // --- Game flow -----------------------------------------------------------

  private onEnemyReachStage(enemy: Enemy): void {
    this.damageSinger(enemy.damage);
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
