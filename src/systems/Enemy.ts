import Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import type { EnemyType } from '../data/enemies';
import { type GridLayout, tileToWorld } from './grid';

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

  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly container: Phaser.GameObjects.Container;
  private readonly hpFill: Phaser.GameObjects.Rectangle;

  private col: number;
  private laneIndex: number;
  private targetCol: number;
  private targetLane: number;
  private targetX = 0;
  private targetY = 0;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    type: EnemyType,
    laneIndex: number,
  ) {
    this.map = map;
    this.layout = layout;
    this.type = type;
    this.hp = type.hp;
    this.maxHp = type.hp;
    this.damage = type.damage;
    this.reward = type.reward;
    this.armor = type.armor;

    this.laneIndex = laneIndex;
    this.targetLane = laneIndex;
    this.col = map.spawnCol;
    this.targetCol = map.spawnCol;

    const ts = layout.tileSize;
    const start = tileToWorld(layout, this.col, map.laneRows[laneIndex]);

    const bodySize = Math.max(6, Math.floor(ts * type.size));
    const body = scene.add
      .rectangle(0, 0, bodySize, bodySize, type.color)
      .setStrokeStyle(1, 0x000000, 0.6);

    const barWidth = Math.floor(ts * 0.7);
    const barY = -bodySize / 2 - 5;
    const barBg = scene.add.rectangle(0, barY, barWidth, 3, 0x000000, 0.6);
    this.hpFill = scene.add
      .rectangle(-barWidth / 2, barY, barWidth, 3, 0x51cf66)
      .setOrigin(0, 0.5);

    this.container = scene.add
      .container(start.x, start.y, [body, barBg, this.hpFill])
      .setDepth(10);

    this.pickNextTarget();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
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

    const step = this.type.speed * this.layout.tileSize * dt;
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

  /** Apply damage (used by towers later). Armor reduces it, min 1. */
  takeDamage(amount: number): void {
    const dealt = Math.max(1, amount - this.armor);
    this.hp = Math.max(0, this.hp - dealt);
    this.hpFill.scaleX = this.hp / this.maxHp;
    if (this.hp === 0) this.dead = true;
  }

  destroy(): void {
    this.container.destroy();
  }
}
