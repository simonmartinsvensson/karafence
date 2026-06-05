import Phaser from 'phaser';
import { TileType, type MapDefinition } from '../types/map';
import { type GridLayout, tileToWorld } from './grid';
import type { Enemy } from './Enemy';
import { Tower } from './Tower';
import { Projectile } from './Projectile';
import { TOWER_TYPES, type TowerTypeKey } from '../data/towers';

/**
 * Owns all placed towers and their projectiles. Handles placement validation,
 * the valid/invalid build overlay, and selection (delegating the selection UI
 * to GameScene via `onSelectionChange`).
 */
export class TowerManager {
  private readonly scene: Phaser.Scene;
  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly enemies: Iterable<Enemy>;

  private readonly towers = new Map<string, Tower>();
  private readonly projectiles: Projectile[] = [];

  private selected: Tower | null = null;
  private overlay: Phaser.GameObjects.Rectangle[] = [];

  /** Notified when the selected tower changes (null = deselected). */
  onSelectionChange?: (tower: Tower | null) => void;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    enemies: Iterable<Enemy>,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.enemies = enemies;
  }

  get selectedTower(): Tower | null {
    return this.selected;
  }

  private key(col: number, row: number): string {
    return `${col},${row}`;
  }

  hasTowerAt(col: number, row: number): boolean {
    return this.towers.has(this.key(col, row));
  }

  /** A tower may go on a buildable (non-path, non-stage) tile that is empty. */
  canPlace(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) {
      return false;
    }
    return (
      this.map.tiles[row][col] === TileType.Build && !this.hasTowerAt(col, row)
    );
  }

  placeTower(typeKey: TowerTypeKey, col: number, row: number): Tower {
    const tower = new Tower(
      this.scene,
      this.layout,
      TOWER_TYPES[typeKey],
      col,
      row,
      this.enemies,
    );
    this.towers.set(this.key(col, row), tower);

    tower.body.on('pointerover', () => {
      if (this.selected !== tower) tower.showRange(true);
    });
    tower.body.on('pointerout', () => {
      if (this.selected !== tower) tower.showRange(false);
    });
    tower.body.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation();
        this.select(tower);
      },
    );
    return tower;
  }

  // --- Selection -----------------------------------------------------------

  select(tower: Tower): void {
    if (this.selected && this.selected !== tower) this.selected.showRange(false);
    this.selected = tower;
    tower.showRange(true);
    this.onSelectionChange?.(tower);
  }

  deselect(): void {
    if (this.selected) {
      this.selected.showRange(false);
      this.selected = null;
      this.onSelectionChange?.(null);
    }
  }

  /** Remove a tower from the board (selling). Frees its tile. */
  removeTower(tower: Tower): void {
    if (this.selected === tower) this.deselect();
    this.towers.delete(this.key(tower.col, tower.row));
    tower.destroy();
  }

  // --- Build overlay -------------------------------------------------------

  /** Tint every tile green (placeable) or red (not) while a tile is selected. */
  showBuildOverlay(targetCol: number, targetRow: number): void {
    this.hideBuildOverlay();
    const ts = this.layout.tileSize;
    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const ok = this.canPlace(c, r);
        const isTarget = c === targetCol && r === targetRow;
        const { x, y } = tileToWorld(this.layout, c, r);
        const rect = this.scene.add
          .rectangle(x, y, ts - 1, ts - 1, ok ? 0x51cf66 : 0xff6b6b, ok ? 0.28 : 0.2)
          .setDepth(260);
        if (isTarget) rect.setStrokeStyle(2, 0xffffff, 1).setFillStyle(0x51cf66, 0.5);
        this.overlay.push(rect);
      }
    }
  }

  hideBuildOverlay(): void {
    this.overlay.forEach((r) => r.destroy());
    this.overlay = [];
  }

  // --- Frame update --------------------------------------------------------

  /** @param dt seconds since last frame */
  update(dt: number): void {
    for (const tower of this.towers.values()) {
      const fired = tower.update(dt);
      for (const p of fired) this.projectiles.push(p);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.isDone) this.projectiles.splice(i, 1);
    }
  }
}
