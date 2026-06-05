import Phaser from 'phaser';

/**
 * BootScene is the first scene in the flow. It confirms Phaser is alive
 * (logs "boot") and then hands off to GameScene. Asset preloading will live
 * here later.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    console.log('boot');
    this.scene.start('GameScene');
  }
}
