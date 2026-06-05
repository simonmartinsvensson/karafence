import Phaser from 'phaser';
import { type GridLayout, tileToWorld } from './grid';
import type { Enemy } from './Enemy';
import { Projectile } from './Projectile';
import {
  type TowerType,
  type TargetingStrategy,
  type UpgradePathKey,
  type UpgradeTier,
  TARGETING_STRATEGIES,
  UPGRADES,
  MAX_TIER,
  SELL_REFUND,
} from '../data/towers';

/** Effective combat stats after applying purchased upgrade tiers. */
interface RuntimeStats {
  damage: number;
  rangeTiles: number;
  attackSpeed: number;
  splash: boolean;
  pierce: number;
  multiTarget: number;
  doubleFire: boolean;
  slowOnHit: boolean;
  slowFactor: number;
  slowDuration: number;
  stunOnHit: boolean;
  stunDuration: number;
}

/**
 * A placed tower. Targets enemies in range per its strategy and fires:
 * single-target towers spawn homing projectiles (optionally multi-target /
 * piercing / slow-on-hit); splash towers pulse damage (optionally stun /
 * double-fire) to everything in range. Supports two 3-tier upgrade paths
 * (BTD6 constraint: only one path may pass tier 1) and selling for a refund.
 */
export class Tower {
  readonly type: TowerType;
  readonly col: number;
  readonly row: number;
  targeting: TargetingStrategy;
  readonly body: Phaser.GameObjects.Rectangle;

  /** Purchased tier per path (0-3). */
  readonly tiers: Record<UpgradePathKey, number> = { A: 0, B: 0 };

  private readonly scene: Phaser.Scene;
  private readonly layout: GridLayout;
  private readonly enemies: Iterable<Enemy>;
  private readonly damageMultiplier: () => number;
  private readonly worldX: number;
  private readonly worldY: number;
  private readonly container: Phaser.GameObjects.Container;
  private readonly pips: Phaser.GameObjects.Rectangle[] = [];

  private rangeCircle: Phaser.GameObjects.Arc;
  private stats: RuntimeStats;
  private rangePx = 0;
  private projectileSpeed = 0;
  private cooldown = 0;
  private totalSpent: number;

  constructor(
    scene: Phaser.Scene,
    layout: GridLayout,
    type: TowerType,
    col: number,
    row: number,
    enemies: Iterable<Enemy>,
    damageMultiplier: () => number,
  ) {
    this.scene = scene;
    this.layout = layout;
    this.type = type;
    this.col = col;
    this.row = row;
    this.enemies = enemies;
    this.damageMultiplier = damageMultiplier;
    this.targeting = type.defaultTargeting;
    this.totalSpent = type.cost;

    const ts = layout.tileSize;
    const pos = tileToWorld(layout, col, row);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.projectileSpeed = ts * 12;

    this.stats = this.baseStats();
    this.rangeCircle = scene.add
      .circle(this.worldX, this.worldY, 0, type.color, 0.1)
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

    this.recompute();
  }

  // --- Upgrades / economy --------------------------------------------------

  private baseStats(): RuntimeStats {
    return {
      damage: this.type.damage,
      rangeTiles: this.type.range,
      attackSpeed: this.type.attackSpeed,
      splash: this.type.splash,
      pierce: 1,
      multiTarget: 1,
      doubleFire: false,
      slowOnHit: this.type.slowFactor !== undefined,
      slowFactor: this.type.slowFactor ?? 1,
      slowDuration: this.type.slowDuration ?? 0,
      stunOnHit: false,
      stunDuration: 0,
    };
  }

  private applyTier(s: RuntimeStats, t: UpgradeTier): void {
    if (t.damage) s.damage += t.damage;
    if (t.rangeTiles) s.rangeTiles += t.rangeTiles;
    if (t.attackSpeed) s.attackSpeed += t.attackSpeed;
    if (t.pierce !== undefined) s.pierce = t.pierce;
    if (t.multiTarget !== undefined) s.multiTarget = t.multiTarget;
    if (t.doubleFire) s.doubleFire = true;
    if (t.slowOnHit) {
      s.slowOnHit = true;
      s.slowFactor = t.slowOnHit.factor;
      s.slowDuration = t.slowOnHit.duration;
    }
    if (t.stunOnHit) {
      s.stunOnHit = true;
      s.stunDuration = t.stunOnHit.duration;
    }
  }

  /** Rebuild stats from base + purchased tiers, then refresh range/pips. */
  private recompute(): void {
    const s = this.baseStats();
    const tree = UPGRADES[this.type.key];
    for (let i = 0; i < this.tiers.A; i++) this.applyTier(s, tree.A.tiers[i]);
    for (let i = 0; i < this.tiers.B; i++) this.applyTier(s, tree.B.tiers[i]);
    this.stats = s;
    this.rangePx = s.rangeTiles * this.layout.tileSize;

    const wasVisible = this.rangeCircle.visible;
    this.rangeCircle.destroy();
    this.rangeCircle = this.scene.add
      .circle(this.worldX, this.worldY, this.rangePx, this.type.color, 0.1)
      .setStrokeStyle(1, this.type.color, 0.6)
      .setDepth(8)
      .setVisible(wasVisible);

    this.updatePips();
  }

  private updatePips(): void {
    this.pips.forEach((p) => p.destroy());
    this.pips.length = 0;
    const ts = this.layout.tileSize;
    const half = ts * 0.41;
    const drawRow = (count: number, color: number, topEdge: boolean) => {
      for (let i = 0; i < count; i++) {
        const px = this.worldX - 6 + i * 6;
        const py = this.worldY + (topEdge ? -half - 2 : half + 2);
        this.pips.push(
          this.scene.add.rectangle(px, py, 4, 3, color).setDepth(16),
        );
      }
    };
    drawRow(this.tiers.A, 0xff6b6b, true); // power pips on top
    drawRow(this.tiers.B, 0x66d9e8, false); // utility pips on bottom
  }

  nextTier(path: UpgradePathKey): UpgradeTier | null {
    const tier = this.tiers[path];
    if (tier >= MAX_TIER) return null;
    return UPGRADES[this.type.key][path].tiers[tier];
  }

  pathName(path: UpgradePathKey): string {
    return UPGRADES[this.type.key][path].name;
  }

  /** BTD6 rule: a path can pass tier 1 only if the other path is at tier <= 1. */
  canUpgrade(path: UpgradePathKey): boolean {
    const tier = this.tiers[path];
    if (tier >= MAX_TIER) return false;
    if (tier === 0) return true;
    const other = path === 'A' ? this.tiers.B : this.tiers.A;
    return other <= 1;
  }

  /** Tier < max but blocked by the cross-path rule. */
  isLocked(path: UpgradePathKey): boolean {
    return this.tiers[path] < MAX_TIER && !this.canUpgrade(path);
  }

  /** Apply (purchase) the next tier on a path. Caller checks gold first. */
  applyUpgrade(path: UpgradePathKey): number {
    const tier = this.nextTier(path);
    if (!tier || !this.canUpgrade(path)) return 0;
    this.tiers[path] += 1;
    this.totalSpent += tier.cost;
    this.recompute();
    return tier.cost;
  }

  get sellValue(): number {
    return Math.floor(this.totalSpent * SELL_REFUND);
  }

  // --- Selection helpers ---------------------------------------------------

  showRange(visible: boolean): void {
    this.rangeCircle.setVisible(visible);
  }

  cycleTargeting(): TargetingStrategy {
    const i = TARGETING_STRATEGIES.indexOf(this.targeting);
    this.targeting = TARGETING_STRATEGIES[(i + 1) % TARGETING_STRATEGIES.length];
    return this.targeting;
  }

  // --- Combat --------------------------------------------------------------

  /**
   * Advance the tower. Returns projectiles for the caller to track (splash
   * applies immediately and returns none).
   * @param dt seconds since last frame
   */
  update(dt: number): Projectile[] {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return [];
    }

    if (this.stats.splash) {
      if (this.enemiesInRange().length === 0) return [];
      this.cooldown = 1 / this.stats.attackSpeed;
      this.fireSplash();
      if (this.stats.doubleFire) {
        this.scene.time.delayedCall(120, () => {
          if (this.enemiesInRange().length > 0) this.fireSplash();
        });
      }
      return [];
    }

    const targets = this.selectTargets(this.stats.multiTarget);
    if (targets.length === 0) return [];
    this.cooldown = 1 / this.stats.attackSpeed;
    return targets.map(
      (target) =>
        new Projectile(
          this.scene,
          this.worldX,
          this.worldY,
          target,
          this.type.projectileColor,
          this.projectileSpeed,
          (t) => this.onProjectileHit(t),
        ),
    );
  }

  private dealHit(enemy: Enemy): void {
    enemy.takeDamage(Math.round(this.stats.damage * this.damageMultiplier()));
    if (this.stats.slowOnHit) {
      enemy.applySlow(this.stats.slowFactor, this.stats.slowDuration);
    }
  }

  private onProjectileHit(target: Enemy): void {
    this.dealHit(target);
    // Piercing shot also hits the nearest other enemies around the impact.
    if (this.stats.pierce > 1) {
      const radius = this.layout.tileSize * 0.9;
      const others: { e: Enemy; d: number }[] = [];
      for (const e of this.enemies) {
        if (e === target || !e.isTargetable) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= radius) others.push({ e, d });
      }
      others
        .sort((a, b) => a.d - b.d)
        .slice(0, this.stats.pierce - 1)
        .forEach((o) => this.dealHit(o.e));
    }
  }

  private fireSplash(): void {
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
    for (const enemy of this.enemiesInRange()) {
      this.dealHit(enemy);
      if (this.stats.stunOnHit) enemy.applySlow(0, this.stats.stunDuration);
    }
  }

  private inRange(enemy: Enemy): boolean {
    return Math.hypot(enemy.x - this.worldX, enemy.y - this.worldY) <= this.rangePx;
  }

  private enemiesInRange(): Enemy[] {
    const list: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.isTargetable && this.inRange(e)) list.push(e);
    }
    return list;
  }

  private selectTargets(count: number): Enemy[] {
    const candidates = this.enemiesInRange();
    if (candidates.length === 0) return [];
    switch (this.targeting) {
      // "first" = furthest along toward the stage = smallest x (stage is left).
      case 'first':
        candidates.sort((a, b) => a.x - b.x);
        break;
      case 'last':
        candidates.sort((a, b) => b.x - a.x);
        break;
      case 'strongest':
        candidates.sort((a, b) => b.hp - a.hp);
        break;
    }
    return candidates.slice(0, Math.max(1, count));
  }

  destroy(): void {
    this.container.destroy();
    this.rangeCircle.destroy();
    this.pips.forEach((p) => p.destroy());
  }
}
