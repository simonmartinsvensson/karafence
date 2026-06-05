import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { level1 } from '../data/level1';
import { TileType, type MapDefinition } from '../types/map';

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Stage]: 0x3a2150,
  [TileType.Aisle]: 0x8a5a44,
  [TileType.Build]: 0x24414f,
};

const HUD_HEIGHT = 22;
const SINGER_MAX_HP = 20;

interface Layout {
  tileSize: number;
  mapW: number;
  mapH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * GameScene renders the lane grid and the stage. No game systems (enemies,
 * towers, waves) are wired up yet — this is the playfield + stage only.
 */
export class GameScene extends Phaser.Scene {
  private readonly map: MapDefinition = level1;
  private singerHp = SINGER_MAX_HP;
  private hpText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.drawHud();
    this.drawMap(this.computeLayout());
  }

  /**
   * Fit the whole map inside the logical canvas (below the HUD strip) and
   * center it. Because the game uses Scale.FIT, this logical layout then scales
   * as a unit: on a portrait phone it fits to width with letterboxing top and
   * bottom; on a landscape desktop it fills cleanly, centered.
   */
  private computeLayout(): Layout {
    const availW = GAME_WIDTH;
    const availH = GAME_HEIGHT - HUD_HEIGHT;
    const tileSize = Math.floor(
      Math.min(availW / this.map.cols, availH / this.map.rows),
    );
    const mapW = tileSize * this.map.cols;
    const mapH = tileSize * this.map.rows;
    const offsetX = Math.floor((availW - mapW) / 2);
    const offsetY = HUD_HEIGHT + Math.floor((availH - mapH) / 2);
    return { tileSize, mapW, mapH, offsetX, offsetY };
  }

  private drawMap(layout: Layout): void {
    const { tileSize, mapW, mapH, offsetX, offsetY } = layout;

    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const type = this.map.tiles[r][c];
        const x = offsetX + c * tileSize + tileSize / 2;
        const y = offsetY + r * tileSize + tileSize / 2;
        this.add
          .rectangle(x, y, tileSize, tileSize, TILE_COLORS[type])
          .setStrokeStyle(1, 0x000000, 0.35);
      }
    }

    // Outer frame around the playfield.
    this.add
      .rectangle(offsetX + mapW / 2, offsetY + mapH / 2, mapW, mapH)
      .setStrokeStyle(2, 0xffffff, 0.15);

    this.drawLaneMarkers(layout);
    this.drawSinger(layout);
  }

  /** Numbered entrance markers at the right edge of each aisle. */
  private drawLaneMarkers(layout: Layout): void {
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
  private drawSinger(layout: Layout): void {
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

  private drawHud(): void {
    this.add.text(6, 5, 'KaraFence', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e84393',
    });
    this.hpText = this.add
      .text(GAME_WIDTH - 6, 6, `SINGER  HP ${this.singerHp}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(1, 0);
  }

  /**
   * Hook for later: called when an enemy reaches the stage. Wired into enemy
   * movement in a future task.
   */
  damageSinger(amount: number): void {
    this.singerHp = Math.max(0, this.singerHp - amount);
    this.hpText.setText(`SINGER  HP ${this.singerHp}`);
    if (this.singerHp === 0) {
      console.log('singer down — game over (not implemented yet)');
    }
  }
}
