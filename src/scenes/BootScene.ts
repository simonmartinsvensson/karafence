import Phaser from 'phaser';
import { generateTextures } from '../systems/textures';

/**
 * BootScene is the first scene in the flow. It confirms Phaser is alive
 * (logs "boot"), generates every procedural texture (see systems/textures.ts)
 * plus the death-burst spark, and then hands off to the MenuScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    generateTextures(this);
    this.makeSparkTexture();
  }

  create(): void {
    console.log('boot');
    this.scene.start('MenuScene');
  }

  /**
   * A soft round "spark" used by enemy-death particle bursts. Generated once
   * here (no asset file) and tinted per enemy color at emit time.
   */
  private makeSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const size = 16;
    const r = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // A few stacked translucent circles fake a soft radial falloff.
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(r, r, r);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(r, r, r * 0.6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, r * 0.3);
    g.generateTexture('spark', size, size);
    g.destroy();
  }
}
