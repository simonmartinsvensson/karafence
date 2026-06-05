import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

// Logical resolution: 16:9, deliberately wide to show a TD lane grid.
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0b12',
  pixelArt: true,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
