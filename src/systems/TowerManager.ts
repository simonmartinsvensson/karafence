import Phaser from 'phaser';
import { TileType, type MapDefinition } from '../types/map';
import { type GridLayout, type BoardLayers, tileToWorld } from './grid';
import type { Enemy } from './Enemy';
import { Tower } from './Tower';
import { Projectile } from './Projectile';
import { TOWER_TYPES, type TowerTypeKey } from '../data/towers';
import type { TowerBonus } from '../data/meta';
import { NO_BONUS } from '../data/towerMeta';
import type { TowerSave } from './storage';

/**
 * Owns all placed towers and their projectiles. Handles placement validation,
 * the valid/invalid build overlay, and selection (delegating the selection UI
 * to GameScene via `onSelectionChange`).
 */
export class TowerManager {
  private readonly scene: Phaser.Scene;
  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly layers: BoardLayers;
  private readonly enemies: Iterable<Enemy>;
  /** Per-tower permanent meta bonus (RPG leveling), applied at placement. */
  private readonly towerBonus: (key: TowerTypeKey) => TowerBonus;

  private readonly towers = new Map<string, Tower>();
  private readonly projectiles: Projectile[] = [];

  /** Adjacency-synergy bonus is gated behind a campaign unlock (set by GameScene). */
  synergiesEnabled = false;
  private static readonly SYNERGY_PER_NEIGHBOR = 0.15;
  private static readonly SYNERGY_MAX_NEIGHBORS = 3;

  private selected: Tower | null = null;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayTweens: Phaser.Tweens.Tween[] = [];

  /** Global attack-speed multiplier (Talent Judge phase 3 sets this below 1). */
  attackSpeedMultiplier = 1;

  /** Notified when the selected tower changes (null = deselected). */
  onSelectionChange?: (tower: Tower | null) => void;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    enemies: Iterable<Enemy>,
    layers: BoardLayers,
    towerBonus: (key: TowerTypeKey) => TowerBonus = () => NO_BONUS,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.enemies = enemies;
    this.layers = layers;
    this.towerBonus = towerBonus;
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

  placeTower(
    typeKey: TowerTypeKey,
    col: number,
    row: number,
    placementCost?: number,
  ): Tower {
    const tower = new Tower(
      this.scene,
      this.layout,
      TOWER_TYPES[typeKey],
      col,
      row,
      this.enemies,
      () => this.attackSpeedMultiplier,
      this.layers,
      placementCost,
      this.towerBonus(typeKey),
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

  // --- Save / restore ------------------------------------------------------

  /** Snapshot every placed tower for the run save. */
  serialize(): TowerSave[] {
    return [...this.towers.values()].map((t) => t.toSave());
  }

  /** Recreate towers from a run save (placement cost already paid). */
  restore(saves: TowerSave[]): void {
    for (const save of saves) {
      const tower = this.placeTower(save.type, save.col, save.row, save.totalSpent);
      tower.restore(save);
    }
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

  // --- Support auras -------------------------------------------------------

  /**
   * Recompute the Backup Singer attack-speed aura: every attacking tower picks
   * up the strongest buff among the Backup Singers covering it (no stacking).
   */
  private applySupportBuffs(): void {
    for (const tower of this.towers.values()) tower.setSupportBuff(1);
    for (const source of this.towers.values()) {
      const buff = source.type.buffAttackSpeed;
      if (!buff) continue;
      // Meta "Stronger Harmony" branch scales the bonus portion of the aura.
      const scaled = 1 + (buff - 1) * source.auraStrength;
      for (const tower of this.towers.values()) {
        if (tower === source || !tower.attacks) continue;
        if (source.coversPoint(tower.x, tower.y)) {
          tower.setSupportBuff(Math.max(tower.supportBuff, scaled));
        }
      }
    }
  }

  /**
   * "Backing band" adjacency synergy: each attacking tower gains +15% damage
   * per orthogonally-adjacent attacking tower (capped at 3 neighbours, +45%),
   * rewarding players who line their performers up into a band. No-op until the
   * feature unlocks (see GameScene / data/progression.ts).
   */
  private applySynergies(): void {
    for (const t of this.towers.values()) t.setSynergyDamage(1);
    if (!this.synergiesEnabled) return;
    for (const t of this.towers.values()) {
      if (!t.attacks) continue;
      let neighbors = 0;
      for (const o of this.towers.values()) {
        if (o === t || !o.attacks) continue;
        if (Math.abs(o.col - t.col) + Math.abs(o.row - t.row) === 1) neighbors++;
      }
      if (neighbors > 0) {
        const n = Math.min(TowerManager.SYNERGY_MAX_NEIGHBORS, neighbors);
        t.setSynergyDamage(1 + n * TowerManager.SYNERGY_PER_NEIGHBOR);
      }
    }
  }

  /**
   * Hype Man aura at a world point: the gold multiplier (best of any covering
   * Hype Man) and whether a kill there should build the combo faster.
   */
  hypeAt(x: number, y: number): { goldMult: number; comboBoost: boolean } {
    let goldMult = 1;
    let comboBoost = false;
    for (const tower of this.towers.values()) {
      if (!tower.coversPoint(x, y)) continue;
      if (tower.type.goldBoost) {
        // "Louder Hype" branch scales the bonus portion of the gold aura.
        const scaled = 1 + (tower.type.goldBoost - 1) * tower.auraStrength;
        goldMult = Math.max(goldMult, scaled);
      }
      if (tower.type.comboBoost) comboBoost = true;
    }
    return { goldMult, comboBoost };
  }

  /** Freeze every tower within `radiusPx` of a point (Heckler King taunt). */
  freezeTowersInRadius(x: number, y: number, radiusPx: number, seconds: number): void {
    for (const tower of this.towers.values()) {
      if (Math.hypot(tower.x - x, tower.y - y) <= radiusPx) tower.freeze(seconds);
    }
  }

  // --- Build overlay -------------------------------------------------------

  /** Tint every tile green (placeable) or red (not) while a tile is selected. */
  showBuildOverlay(targetCol: number, targetRow: number): void {
    this.hideBuildOverlay();
    const ts = this.layout.tileSize;
    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const ok = this.canPlace(c, r);
        const { x, y } = tileToWorld(this.layout, c, r);
        const rect = this.scene.add
          .rectangle(x, y, ts - 1, ts - 1, ok ? 0x51cf66 : 0xff6b6b, ok ? 0.22 : 0.2);
        this.layers.fx.add(rect);
        this.overlay.push(rect);
      }
    }
    this.highlightTarget(targetCol, targetRow);
  }

  /**
   * The chosen tile gets a stronger read: a faint green fill, a tower-base
   * shadow ("something will go here"), and a pulsing bright-green border.
   */
  private highlightTarget(col: number, row: number): void {
    const ts = this.layout.tileSize;
    const { x, y } = tileToWorld(this.layout, col, row);

    const fill = this.scene.add.rectangle(x, y, ts - 2, ts - 2, 0x51cf66, 0.32);
    this.layers.fx.add(fill);
    this.overlay.push(fill);

    const shadow = this.scene.add.ellipse(x, y + ts * 0.16, ts * 0.5, ts * 0.22, 0x000000, 0.3);
    this.layers.fx.add(shadow);
    this.overlay.push(shadow);

    const border = this.scene.add
      .rectangle(x, y, ts - 3, ts - 3)
      .setStrokeStyle(3, 0x8cff9e, 1);
    this.layers.fx.add(border);
    this.overlay.push(border);
    // Pulse the border so the active tile clearly draws the eye.
    this.overlayTweens.push(
      this.scene.tweens.add({
        targets: border,
        scaleX: 1.07,
        scaleY: 1.07,
        alpha: 0.45,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  hideBuildOverlay(): void {
    this.overlayTweens.forEach((t) => t.stop());
    this.overlayTweens = [];
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
  }

  // --- Frame update --------------------------------------------------------

  /** @param dt seconds since last frame */
  update(dt: number): void {
    this.applySupportBuffs();
    this.applySynergies();
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
