import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../main';

/**
 * BootScene is the first scene in the flow. For now it only confirms that
 * Phaser is rendering by logging "boot" and drawing a colored rectangle.
 * Game systems (waves, towers, enemies) are intentionally not implemented yet.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    console.log('boot');

    // Render-confirmation rectangle, centered on the logical canvas.
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 160, 90, 0xe84393)
      .setStrokeStyle(2, 0xffffff);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'KaraFence', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
