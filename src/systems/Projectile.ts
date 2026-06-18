import Phaser from 'phaser';
import type { Enemy } from './Enemy';
import { TX } from './textures';
import { perf } from './perf';

/**
 * A homing visual projectile fired by a single-target tower. It tracks its
 * target each frame and spins as it flies; on contact it invokes `onHit` and
 * pops a small neon impact flash. If the target dies or leaves play mid-flight,
 * the projectile simply fizzles. The sprite is a drawn texture (musical note /
 * music-wave) with a soft additive glow trailing it, referenced by key.
 */
export class Projectile {
  private readonly scene: Phaser.Scene;
  private readonly parent: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly glowColor: number;
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
    glowColor = 0xffffff,
    private readonly spin = 9, // radians per second
  ) {
    this.scene = scene;
    this.parent = parent;
    this.glowColor = glowColor;
    this.glow = scene.add
      .image(x, y, TX.glow)
      .setDisplaySize(size * 2.4, size * 2.4)
      .setTint(glowColor)
      .setAlpha(0.6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(x, y, textureKey).setDisplaySize(size, size);
    parent.add(this.glow);
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
      this.glow.setPosition(this.sprite.x, this.sprite.y);
      this.dropTrail(dt);
    }
  }

  /** Periodically stamp a fading glow ghost so the shot leaves a neon trail. */
  private trailAccum = 0;
  private dropTrail(dt: number): void {
    if (perf.lowFx) return; // skip neon trails under heavy load
    this.trailAccum += dt;
    if (this.trailAccum < 0.028) return;
    this.trailAccum = 0;
    const ghost = this.scene.add
      .image(this.sprite.x, this.sprite.y, TX.glow)
      .setDisplaySize(this.glow.displayWidth * 0.6, this.glow.displayHeight * 0.6)
      .setTint(this.glowColor)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.parent.add(ghost);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: ghost.scale * 0.3,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }

  /** A quick additive glow pop where the projectile lands. */
  private impactFlash(x: number, y: number): void {
    const flash = this.scene.add
      .image(x, y, TX.glow)
      .setDisplaySize(this.sprite.displayWidth * 1.4, this.sprite.displayHeight * 1.4)
      .setTint(this.glowColor)
      .setAlpha(0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.parent.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: flash.scale * 2.4,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
  }

  private end(hit: boolean): void {
    if (hit) {
      this.impactFlash(this.sprite.x, this.sprite.y);
      this.onHit(this.target);
    }
    this.sprite.destroy();
    this.glow.destroy();
    this.finished = true;
  }
}
