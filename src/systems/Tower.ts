import Phaser from 'phaser';
import { type GridLayout, type BoardLayers, tileToWorld } from './grid';
import type { Enemy } from './Enemy';
import { Projectile } from './Projectile';
import { audio } from './audio';
import { TX, towerTextureKey } from './textures';
import type { TowerSave } from './storage';
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
import type { TowerBonus } from '../data/meta';

const NO_BONUS: TowerBonus = { damageMult: 1, rangeAdd: 0, attackSpeedMult: 1 };

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
  readonly body: Phaser.GameObjects.Sprite;

  /** Purchased tier per path (0-3). */
  readonly tiers: Record<UpgradePathKey, number> = { A: 0, B: 0 };

  /** Stable identity ("col,row"), used by Stage Rusher bypass. */
  readonly id: string;

  private readonly scene: Phaser.Scene;
  private readonly layout: GridLayout;
  private readonly layers: BoardLayers;
  private readonly enemies: Iterable<Enemy>;
  private readonly attackSpeedMultiplier: () => number;
  private readonly metaBonus: TowerBonus;
  private readonly worldX: number;
  private readonly worldY: number;
  private readonly container: Phaser.GameObjects.Container;
  private readonly pips: Phaser.GameObjects.Rectangle[] = [];
  /** Pending one-shot timers (e.g. double-fire), cancelled on destroy. */
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  private rangeCircle: Phaser.GameObjects.Arc;
  private stats: RuntimeStats;
  private rangePx = 0;
  private projectileSpeed = 0;
  private cooldown = 0;
  private frozenRemaining = 0;
  private destroyed = false;
  private totalSpent: number;

  /** Attack-speed multiplier from a Backup Singer aura (1 = none). */
  private supportSpeedBuff = 1;

  constructor(
    scene: Phaser.Scene,
    layout: GridLayout,
    type: TowerType,
    col: number,
    row: number,
    enemies: Iterable<Enemy>,
    attackSpeedMultiplier: () => number,
    layers: BoardLayers,
    placementCost: number = type.cost,
    bonus: TowerBonus = NO_BONUS,
  ) {
    this.scene = scene;
    this.layout = layout;
    this.layers = layers;
    this.type = type;
    this.col = col;
    this.row = row;
    this.id = `${col},${row}`;
    this.enemies = enemies;
    this.attackSpeedMultiplier = attackSpeedMultiplier;
    this.metaBonus = bonus;
    this.targeting = type.defaultTargeting;
    this.totalSpent = placementCost;

    const ts = layout.tileSize;
    const pos = tileToWorld(layout, col, row);
    this.worldX = pos.x;
    this.worldY = pos.y;
    this.projectileSpeed = ts * 12;

    this.stats = this.baseStats();
    this.rangeCircle = scene.add
      .circle(this.worldX, this.worldY, 0, type.color, 0.1)
      .setStrokeStyle(1, type.color, 0.6)
      .setVisible(false);
    this.layers.range.add(this.rangeCircle);

    const size = Math.floor(ts * 0.9);
    // Drawn tower sprite (instrument/performer silhouette on a dark base).
    this.body = scene.add
      .sprite(0, 0, towerTextureKey(type.key))
      .setDisplaySize(size, size);
    this.container = scene.add.container(this.worldX, this.worldY, [this.body]);
    this.layers.towers.add(this.container);
    this.body.setInteractive({ useHandCursor: true });

    this.recompute();
  }

  // --- Roles / queries -----------------------------------------------------

  /** Support towers (Backup Singer, Hype Man) never fire at enemies. */
  get attacks(): boolean {
    return this.type.attacks !== false;
  }

  get knockbackTiles(): number {
    return this.type.knockbackTiles ?? 0;
  }

  get hasUpgrades(): boolean {
    return UPGRADES[this.type.key] !== undefined;
  }

  /** Is a world point within this tower's range? (auras / support buffs) */
  coversPoint(x: number, y: number): boolean {
    return Math.hypot(x - this.worldX, y - this.worldY) <= this.rangePx;
  }

  get supportBuff(): number {
    return this.supportSpeedBuff;
  }

  setSupportBuff(value: number): void {
    this.supportSpeedBuff = value;
  }

  // --- Upgrades / economy --------------------------------------------------

  private baseStats(): RuntimeStats {
    const b = this.metaBonus;
    return {
      damage: this.type.damage * b.damageMult,
      rangeTiles: this.type.range + b.rangeAdd,
      attackSpeed: this.type.attackSpeed * b.attackSpeedMult,
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
    if (tree) {
      for (let i = 0; i < this.tiers.A; i++) this.applyTier(s, tree.A.tiers[i]);
      for (let i = 0; i < this.tiers.B; i++) this.applyTier(s, tree.B.tiers[i]);
    }
    this.stats = s;
    this.rangePx = s.rangeTiles * this.layout.tileSize;

    const wasVisible = this.rangeCircle.visible;
    this.rangeCircle.destroy();
    this.rangeCircle = this.scene.add
      .circle(this.worldX, this.worldY, this.rangePx, this.type.color, 0.1)
      .setStrokeStyle(1, this.type.color, 0.6)
      .setVisible(wasVisible);
    this.layers.range.add(this.rangeCircle);

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
        const pip = this.scene.add.rectangle(px, py, 4, 3, color);
        this.layers.towers.add(pip);
        this.pips.push(pip);
      }
    };
    drawRow(this.tiers.A, 0xff6b6b, true); // power pips on top
    drawRow(this.tiers.B, 0x66d9e8, false); // utility pips on bottom
  }

  nextTier(path: UpgradePathKey): UpgradeTier | null {
    const tree = UPGRADES[this.type.key];
    if (!tree) return null;
    const tier = this.tiers[path];
    if (tier >= MAX_TIER) return null;
    return tree[path].tiers[tier];
  }

  pathName(path: UpgradePathKey): string {
    return UPGRADES[this.type.key]?.[path].name ?? '';
  }

  /** BTD6 rule: a path can pass tier 1 only if the other path is at tier <= 1. */
  canUpgrade(path: UpgradePathKey): boolean {
    if (!UPGRADES[this.type.key]) return false;
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

  // --- Save / restore ------------------------------------------------------

  /** Snapshot for the run save. */
  toSave(): TowerSave {
    return {
      type: this.type.key,
      col: this.col,
      row: this.row,
      tiers: { A: this.tiers.A, B: this.tiers.B },
      targeting: this.targeting,
      totalSpent: this.totalSpent,
    };
  }

  /** Re-apply a saved tower's purchased tiers / targeting / spend (no cost). */
  restore(save: TowerSave): void {
    this.tiers.A = save.tiers.A;
    this.tiers.B = save.tiers.B;
    this.targeting = save.targeting;
    this.totalSpent = save.totalSpent;
    this.recompute();
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

  get x(): number {
    return this.worldX;
  }

  get y(): number {
    return this.worldY;
  }

  /** Heckler King taunt: silence the tower for `seconds`. */
  freeze(seconds: number): void {
    this.frozenRemaining = Math.max(this.frozenRemaining, seconds);
    this.body.setTint(0x74c0fc); // frozen blue wash
  }

  // --- Combat --------------------------------------------------------------

  /**
   * Seconds between shots, including the global attack-speed multiplier and any
   * Backup Singer aura buff.
   */
  private fireInterval(): number {
    return (
      1 /
      (this.stats.attackSpeed * this.attackSpeedMultiplier() * this.supportSpeedBuff)
    );
  }

  /**
   * Advance the tower. Returns projectiles for the caller to track (splash
   * applies immediately and returns none).
   * @param dt seconds since last frame
   */
  update(dt: number): Projectile[] {
    if (this.frozenRemaining > 0) {
      this.frozenRemaining -= dt;
      if (this.frozenRemaining <= 0) this.body.clearTint();
      return [];
    }

    // Support towers (Backup Singer, Hype Man) never fire; their aura is
    // applied by TowerManager / GameScene.
    if (!this.attacks) return [];

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return [];
    }

    // Bass Player: a periodic blast that knocks everything in range back.
    if (this.knockbackTiles > 0) {
      if (this.enemiesInRange().length === 0) return [];
      this.cooldown = this.fireInterval();
      this.fireBassBlast();
      return [];
    }

    if (this.stats.splash) {
      if (this.enemiesInRange().length === 0) return [];
      this.cooldown = this.fireInterval();
      this.fireSplash();
      if (this.stats.doubleFire) {
        this.timers.push(
          this.scene.time.delayedCall(120, () => {
            if (!this.destroyed && this.frozenRemaining <= 0 && this.enemiesInRange().length > 0) {
              this.fireSplash();
            }
          }),
        );
      }
      return [];
    }

    const targets = this.selectTargets(this.stats.multiTarget);
    if (targets.length === 0) return [];
    this.cooldown = this.fireInterval();
    audio.sfx('shoot');
    // Keyboardist throws a glowing music-wave; everyone else a spinning note.
    const key = this.type.key === 'keyboardist' ? TX.projStaff : TX.projNote;
    const size = this.layout.tileSize * 0.55;
    return targets.map(
      (target) =>
        new Projectile(
          this.scene,
          this.worldX,
          this.worldY,
          target,
          key,
          this.projectileSpeed,
          (t) => this.onProjectileHit(t),
          this.layers.projectiles,
          size,
        ),
    );
  }

  private dealHit(enemy: Enemy): void {
    audio.sfx('hit');
    enemy.takeDamage(Math.round(this.stats.damage), this.id);
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
    audio.sfx('shoot');
    const ring = this.scene.add
      .circle(this.worldX, this.worldY, this.rangePx, this.type.projectileColor, 0.35)
      .setStrokeStyle(2, this.type.color, 0.9)
      .setScale(0.15);
    this.layers.fx.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });
    this.tossDrumsticks();
    for (const enemy of this.enemiesInRange()) {
      this.dealHit(enemy);
      if (this.stats.stunOnHit) enemy.applySlow(0, this.stats.stunDuration);
    }
  }

  /** Cosmetic: fling a few tumbling drumsticks outward on each splash hit. */
  private tossDrumsticks(): void {
    const ts = this.layout.tileSize;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const stick = this.scene.add
        .image(this.worldX, this.worldY, TX.drumstick)
        .setDisplaySize(ts * 0.5, ts * 0.5);
      this.layers.projectiles.add(stick);
      this.scene.tweens.add({
        targets: stick,
        x: this.worldX + Math.cos(ang) * this.rangePx * 0.8,
        y: this.worldY + Math.sin(ang) * this.rangePx * 0.8,
        rotation: 6 + Math.random() * 4,
        alpha: 0,
        duration: 320,
        onComplete: () => stick.destroy(),
      });
    }
  }

  /** Bass Player blast: a deep pulse that knocks every enemy in range back. */
  private fireBassBlast(): void {
    audio.sfx('shoot');
    // A low-frequency pulse: two concentric rings expanding outward.
    for (let i = 0; i < 2; i++) {
      const ring = this.scene.add
        .circle(this.worldX, this.worldY, this.rangePx, this.type.projectileColor, 0.28)
        .setStrokeStyle(3, this.type.color, 0.9)
        .setScale(0.15);
      this.layers.fx.add(ring);
      this.scene.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        delay: i * 110,
        duration: 340,
        onComplete: () => ring.destroy(),
      });
    }
    for (const enemy of this.enemiesInRange()) {
      if (this.stats.damage > 0) {
        enemy.takeDamage(Math.round(this.stats.damage), this.id);
      }
      enemy.knockback(this.knockbackTiles);
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
    this.destroyed = true;
    this.timers.forEach((t) => t.remove(false));
    this.timers.length = 0;
    this.container.destroy();
    this.rangeCircle.destroy();
    this.pips.forEach((p) => p.destroy());
  }
}
