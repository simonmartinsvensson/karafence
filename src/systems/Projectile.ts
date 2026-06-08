import Phaser from 'phaser';
import type { Enemy } from './Enemy';

/**
 * A homing visual projectile fired by a single-target tower. It tracks its
 * target each frame and spins as it flies; on contact it invokes `onHit`. If
 * the target dies or leaves play mid-flight, the projectile simply fizzles.
 * The sprite is a drawn texture (musical note / music-wave), referenced by key.
 */
export class Projectile {
  private readonly sprite: Phaser.GameObjects.Image;
  private finished = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Enemy,
    textureKey: string,
    private readonly speed: number, // pixels per second
    private readonly onHit: (target: Enemy) => void,
    parent: Phaser.GameObjects.Container,
    size = 16,
    private readonly spin = 9, // radians per second
  ) {
    this.sprite = scene.add.image(x, y, textureKey).setDisplaySize(size, size);
    parent.add(this.sprite);
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

    this.sprite.rotation += this.spin * dt;

    const dx = this.target.x - this.sprite.x;
    const dy = this.target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step || dist === 0) {
      this.end(true);
    } else {
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
    }
  }

  private end(hit: boolean): void {
    if (hit) this.onHit(this.target);
    this.sprite.destroy();
    this.finished = true;
  }
}
