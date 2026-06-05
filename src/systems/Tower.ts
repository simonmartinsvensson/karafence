import Phaser from 'phaser';
import { type GridLayout, tileToWorld } from './grid';
import type { Enemy } from './Enemy';
import { Projectile } from './Projectile';
import {
  type TowerType,
  type TargetingStrategy,
  TARGETING_STRATEGIES,
} from '../data/towers';

/**
 * A placed tower. Each frame it picks a target in range (per its targeting
 * strategy) and, when off cooldown, fires: single-target towers spawn a homing
 * projectile; splash towers pulse damage to everything in range.
 */
export class Tower {
  readonly type: TowerType;
  readonly col: number;
  readonly row: number;
  targeting: TargetingStrategy;
  /** Interactive hit target for hover/select. */
  readonly body: Phaser.GameObjects.Rectangle;

  private readonly scene: Phaser.Scene;
  private readonly worldX: number;
  private readonly worldY: number;
  private readonly rangePx: number;
  private readonly projectileSpeed: number;
  private readonly container: Phaser.GameObjects.Container;
  private readonly rangeCircle: Phaser.GameObjects.Arc;
  private cooldown = 0;

  constructor(
    scene: Phaser.Scene,
    layout: GridLayout,
    type: TowerType,
    col: number,
    row: number,
  ) {
    this.scene = scene;
    this.type = type;
    this.col = col;
    this.row = row;
    this.targeting = type.defaultTargeting;

    const ts = layout.tileSize;
    const pos = tileToWorld(layout, col, row);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.rangePx = type.range * ts;
    this.projectileSpeed = ts * 12;

    this.rangeCircle = scene.add
      .circle(this.worldX, this.worldY, this.rangePx, type.color, 0.1)
      .setStrokeStyle(1, type.color, 0.6)
      .setDepth(8)
      .setVisible(false);

    const size = Math.floor(ts * 0.82);
    this.body = scene.add
      .rectangle(0, 0, size, size, type.color)
      .setStrokeStyle(2, 0xffffff, 0.85);
    const icon = scene.add
      .text(0, 0, type.icon, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.floor(ts * 0.55)}px`,
      })
      .setOrigin(0.5);
    this.container = scene.add
      .container(this.worldX, this.worldY, [this.body, icon])
      .setDepth(15);

    this.body.setInteractive({ useHandCursor: true });
  }

  showRange(visible: boolean): void {
    this.rangeCircle.setVisible(visible);
  }

  cycleTargeting(): TargetingStrategy {
    const i = TARGETING_STRATEGIES.indexOf(this.targeting);
    this.targeting = TARGETING_STRATEGIES[(i + 1) % TARGETING_STRATEGIES.length];
    return this.targeting;
  }

  /**
   * Advance the tower. Returns a projectile to be tracked by the caller, or
   * null (splash damage is applied immediately; no fire when idle).
   * @param dt seconds since last frame
   */
  update(dt: number, enemies: Iterable<Enemy>): Projectile | null {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return null;
    }

    if (this.type.splash) {
      const inRange = this.enemiesInRange(enemies);
      if (inRange.length === 0) return null;
      this.cooldown = 1 / this.type.attackSpeed;
      this.fireSplash(inRange);
      return null;
    }

    const target = this.selectTarget(enemies);
    if (!target) return null;
    this.cooldown = 1 / this.type.attackSpeed;
    return new Projectile(
      this.scene,
      this.worldX,
      this.worldY,
      target,
      this.type.projectileColor,
      this.projectileSpeed,
      (t) => this.applyHit(t),
    );
  }

  private applyHit(target: Enemy): void {
    target.takeDamage(this.type.damage);
    if (this.type.slowFactor && this.type.slowDuration) {
      target.applySlow(this.type.slowFactor, this.type.slowDuration);
    }
  }

  private fireSplash(targets: Enemy[]): void {
    const ring = this.scene.add
      .circle(this.worldX, this.worldY, this.rangePx, this.type.projectileColor, 0.35)
      .setStrokeStyle(2, this.type.color, 0.9)
      .setDepth(18)
      .setScale(0.15);
    this.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });
    for (const enemy of targets) this.applyHit(enemy);
  }

  private inRange(enemy: Enemy): boolean {
    return Math.hypot(enemy.x - this.worldX, enemy.y - this.worldY) <= this.rangePx;
  }

  private enemiesInRange(enemies: Iterable<Enemy>): Enemy[] {
    const list: Enemy[] = [];
    for (const e of enemies) {
      if (e.isTargetable && this.inRange(e)) list.push(e);
    }
    return list;
  }

  private selectTarget(enemies: Iterable<Enemy>): Enemy | null {
    const candidates = this.enemiesInRange(enemies);
    if (candidates.length === 0) return null;
    switch (this.targeting) {
      // "first" = furthest along toward the stage = smallest x (stage is left).
      case 'first':
        return candidates.reduce((a, b) => (b.x < a.x ? b : a));
      case 'last':
        return candidates.reduce((a, b) => (b.x > a.x ? b : a));
      case 'strongest':
        return candidates.reduce((a, b) => (b.hp > a.hp ? b : a));
    }
    return null;
  }

  destroy(): void {
    this.container.destroy();
    this.rangeCircle.destroy();
  }
}
