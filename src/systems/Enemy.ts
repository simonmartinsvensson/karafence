import Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import type { BossKind, EnemyType } from '../data/enemies';
import { type GridLayout, tileToWorld } from './grid';
import { enemyTextureKey } from './textures';
import { perf } from './perf';

/** Per-boss aura glow color (independent of the tinted body silhouette). */
const BOSS_AURA: Record<BossKind, number> = {
  hecklerKing: 0xc0152e, // dark red
  micGrabber: 0x37b24d, // green
  djWontStop: 0x22b8cf, // blue/cyan
  talentJudge: 0xffd43b, // gold
};

/**
 * A single enemy walking up an aisle toward the stage. Movement is waypoint
 * following: the enemy targets the next tile to its left, column by column,
 * until it reaches the stage column. Erratic types pick a random adjacent lane
 * at each step.
 */
export class Enemy {
  readonly type: EnemyType;
  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly reward: number;
  readonly armor: number;

  /** Set once the enemy reaches the stage column. */
  arrivedAtStage = false;
  /** Set once hp hits zero. */
  dead = false;
  /** Bonus fans paid on kill (the "scout in the crowd" surprise); 0 = normal. */
  bonusFans = 0;

  private readonly scene: Phaser.Scene;
  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private auraTween?: Phaser.Tweens.Tween;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly shieldFill?: Phaser.GameObjects.Rectangle;
  private readonly baseColor: number;

  /** Shield that must be depleted before hp takes damage. */
  shield: number;
  private readonly maxShield: number;
  /** Stage Rusher: id of the tower it is immune to (the first to hit it). */
  private bypassedTowerId: string | null = null;

  /** Movement speed multiplier (1 = normal). Driven by slow debuffs. */
  private slowFactor = 1;
  private slowRemaining = 0;
  /** Per-wave difficulty multiplier applied to base movement speed. */
  private readonly speedScale: number;

  private col: number;
  private laneIndex: number;
  private targetCol: number;
  private targetLane: number;
  private targetX = 0;
  private targetY = 0;
  /** Walk-cycle phase + hop height, so the silhouette waddles as it moves. */
  private walkPhase = Math.random() * Math.PI * 2;
  private readonly bobAmp: number;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    type: EnemyType,
    laneIndex: number,
    hpScale = 1,
    speedScale = 1,
    startCol = map.spawnCol,
    parent?: Phaser.GameObjects.Container,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.type = type;
    this.hp = Math.round(type.hp * hpScale);
    this.maxHp = this.hp;
    this.damage = type.damage;
    this.reward = type.reward;
    this.armor = type.armor;
    this.speedScale = speedScale;
    this.shield = type.shield ?? 0;
    this.maxShield = this.shield;

    this.laneIndex = laneIndex;
    this.targetLane = laneIndex;
    this.col = startCol;
    this.targetCol = startCol;

    const ts = layout.tileSize;
    const start = tileToWorld(layout, this.col, map.laneRows[laneIndex]);

    const bodySize = Math.max(6, Math.floor(ts * type.size));
    this.bobAmp = bodySize * 0.12;
    this.baseColor = type.color;
    // Drawn character silhouette, tinted to the enemy's color.
    this.body = scene.add
      .sprite(0, 0, enemyTextureKey(type.key))
      .setDisplaySize(bodySize, bodySize)
      .setTint(type.color);

    const children: Phaser.GameObjects.GameObject[] = [];

    // A soft ground shadow grounds the silhouette (drawn behind everything).
    // Skipped under heavy load — semi-transparent overdraw × hundreds of enemies
    // is a big fill-rate cost at deep endless waves.
    if (!perf.lowFx) {
      children.push(
        scene.add.ellipse(0, bodySize * 0.42, bodySize * 0.62, bodySize * 0.22, 0x000000, 0.32),
      );
    }

    // Bosses get a soft pulsing aura behind the silhouette in their own color.
    if (type.boss) {
      const aura = scene.add
        .circle(0, 0, bodySize * 0.78, BOSS_AURA[type.boss], 0.45)
        .setBlendMode(Phaser.BlendModes.ADD);
      children.push(aura);
      this.auraTween = scene.tweens.add({
        targets: aura,
        scale: { from: 0.85, to: 1.15 },
        alpha: { from: 0.55, to: 0.25 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const barWidth = Math.floor(ts * 0.7);
    const barY = -bodySize / 2 - 5;
    const barBg = scene.add.rectangle(0, barY, barWidth, 3, 0x000000, 0.6);
    this.hpFill = scene.add
      .rectangle(-barWidth / 2, barY, barWidth, 3, 0x51cf66)
      .setOrigin(0, 0.5);

    children.push(this.body, barBg, this.hpFill);
    if (this.maxShield > 0) {
      this.shieldFill = scene.add
        .rectangle(-barWidth / 2, barY - 4, barWidth, 3, 0x74c0fc)
        .setOrigin(0, 0.5);
      children.push(this.shieldFill);
    }

    this.container = scene.add.container(start.x, start.y, children);
    if (parent) parent.add(this.container);
    else this.container.setDepth(type.boss ? 12 : 10);

    this.pickNextTarget();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  /** Towers should only target enemies that are alive and still in play. */
  get isTargetable(): boolean {
    return !this.dead && !this.arrivedAtStage;
  }

  get isBoss(): boolean {
    return this.type.boss !== undefined;
  }

  /** Health fraction (0-1), for the boss bar. */
  get hpRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  get shieldRatio(): number {
    return this.maxShield > 0 ? this.shield / this.maxShield : 0;
  }

  /** Current grid column (used to spawn splits at the death location). */
  get gridCol(): number {
    return this.col;
  }

  get lane(): number {
    return this.laneIndex;
  }

  /** Choose the next waypoint: one column left, possibly switching lanes. */
  private pickNextTarget(): void {
    const nextCol = this.col - 1;
    let nextLane = this.laneIndex;

    // Erratic enemies stagger to an adjacent lane each step (but not on the
    // final step into the stage, so they arrive cleanly).
    if (this.type.erratic && nextCol > this.map.stageCol) {
      const choices = [this.laneIndex];
      if (this.laneIndex > 0) choices.push(this.laneIndex - 1);
      if (this.laneIndex < this.map.laneRows.length - 1) {
        choices.push(this.laneIndex + 1);
      }
      nextLane = choices[Math.floor(Math.random() * choices.length)];
    }

    this.targetCol = nextCol;
    this.targetLane = nextLane;
    const target = tileToWorld(this.layout, nextCol, this.map.laneRows[nextLane]);
    this.targetX = target.x;
    this.targetY = target.y;
  }

  /** @param dt seconds since last frame */
  update(dt: number): void {
    if (this.arrivedAtStage || this.dead) return;

    // Smoothly animate the hp / shield bars toward their true ratios rather
    // than snapping on each hit.
    const ease = Math.min(1, dt * 12);
    this.hpFill.scaleX += (this.hp / this.maxHp - this.hpFill.scaleX) * ease;
    if (this.shieldFill) {
      this.shieldFill.scaleX += (this.shieldRatio - this.shieldFill.scaleX) * ease;
    }

    // Tick down any active slow debuff and restore speed/color when it ends.
    if (this.slowRemaining > 0) {
      this.slowRemaining -= dt;
      if (this.slowRemaining <= 0) {
        this.slowFactor = 1;
        this.body.setTint(this.baseColor);
      }
    }

    // Waddle: a little hop synced to walk speed (the silhouette bobs, not its
    // ground shadow / hp bars, which sit on other children).
    this.walkPhase += dt * (6 + this.type.speed * this.speedScale * this.slowFactor * 2.2);
    this.body.y = -Math.abs(Math.sin(this.walkPhase)) * this.bobAmp;

    const step =
      this.type.speed * this.speedScale * this.slowFactor * this.layout.tileSize * dt;
    const dx = this.targetX - this.container.x;
    const dy = this.targetY - this.container.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= step || dist === 0) {
      this.container.setPosition(this.targetX, this.targetY);
      this.col = this.targetCol;
      this.laneIndex = this.targetLane;
      if (this.col <= this.map.stageCol) {
        this.arrivedAtStage = true;
        return;
      }
      this.pickNextTarget();
    } else {
      this.container.x += (dx / dist) * step;
      this.container.y += (dy / dist) * step;
    }
  }

  /**
   * Apply damage from a tower hit. Armor reduces it (min 1). Handles VIP
   * deflection, Stage Rusher first-tower bypass, and shield absorption.
   * @param towerId identity of the firing tower ("col,row").
   */
  takeDamage(amount: number, towerId?: string): void {
    // Stage Rusher: ignore the first tower to hit it (and that tower forever).
    if (this.type.bypassFirstTower && towerId) {
      if (this.bypassedTowerId === null) this.bypassedTowerId = towerId;
      if (this.bypassedTowerId === towerId) {
        this.flash(0xffffff);
        return;
      }
    }
    // VIP: random deflection.
    if (this.type.deflectChance && Math.random() < this.type.deflectChance) {
      this.flash(0xfff3bf);
      return;
    }

    let dealt = Math.max(1, amount - this.armor);

    // Shield soaks damage first; overflow carries to hp. (Bars animate toward
    // these new ratios in update().)
    if (this.shield > 0) {
      const toShield = Math.min(this.shield, dealt);
      this.shield -= toShield;
      dealt -= toShield;
    }
    if (dealt <= 0) return;

    this.hp = Math.max(0, this.hp - dealt);
    if (this.hp === 0) {
      this.dead = true;
      this.hpFill.scaleX = 0; // settle instantly; the enemy is about to vanish
    }
  }

  /** Brief color blip to signal a deflected / bypassed hit. */
  private flash(color: number): void {
    this.body.setTint(color);
    this.scene.time.delayedCall(80, () => {
      if (this.slowRemaining <= 0) this.body.setTint(this.baseColor);
    });
  }

  /**
   * Apply a slow debuff: multiply speed by `factor` (<1) for `durationSec`.
   * Refreshes the timer and keeps the stronger of any overlapping slows.
   */
  applySlow(factor: number, durationSec: number): void {
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowRemaining = Math.max(this.slowRemaining, durationSec);
    this.body.setTint(0x74c0fc);
  }

  /**
   * Push the enemy back toward the spawn edge by `tiles` tiles along its lane,
   * snapping onto the lane and re-aiming. Clamped at the spawn column so it
   * never slides off the board. Used by the Bass Player's bass blast and its
   * "Drop the Bass" ability.
   */
  knockback(tiles: number): void {
    if (this.arrivedAtStage || this.dead || tiles <= 0) return;
    const ts = this.layout.tileSize;
    const laneRow = this.map.laneRows[this.laneIndex];
    const spawnX = tileToWorld(this.layout, this.map.spawnCol, laneRow).x;
    const newX = Math.min(spawnX, this.container.x + tiles * ts);
    const laneY = tileToWorld(this.layout, 0, laneRow).y;
    this.container.setPosition(newX, laneY);
    this.col = Math.round((newX - this.layout.offsetX - ts / 2) / ts);
    this.targetLane = this.laneIndex;
    this.pickNextTarget();
  }

  destroy(): void {
    this.auraTween?.stop();
    this.container.destroy();
  }
}
