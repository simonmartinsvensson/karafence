import Phaser from 'phaser';
import type { Enemy } from './Enemy';

/**
 * A homing visual projectile fired by a single-target tower. It tracks its
 * target each frame; on contact it invokes `onHit`. If the target dies or
 * leaves play mid-flight, the projectile simply fizzles.
 */
export class Projectile {
  private readonly dot: Phaser.GameObjects.Arc;
  private finished = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Enemy,
    color: number,
    private readonly speed: number, // pixels per second
    private readonly onHit: (target: Enemy) => void,
    parent: Phaser.GameObjects.Container,
  ) {
    this.dot = scene.add.circle(x, y, 3, color);
    parent.add(this.dot);
  }

  get isDone(): boolean {
    return this.finished;
  }

  update(dt: number): void {
    if (this.finished) return;
    if (!this.target.isTargetable) {
      this.end(false);
      return;
    }

    const dx = this.target.x - this.dot.x;
    const dy = this.target.y - this.dot.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step || dist === 0) {
      this.end(true);
    } else {
      this.dot.x += (dx / dist) * step;
      this.dot.y += (dy / dist) * step;
    }
  }

  private end(hit: boolean): void {
    if (hit) this.onHit(this.target);
    this.dot.destroy();
    this.finished = true;
  }
}
