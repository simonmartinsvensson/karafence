import Phaser from 'phaser';
import { COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { installHiDPI } from './systems/hidpi';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  // Mount into the inner wrapper so Phaser measures the safe-area content box
  // (the outer #game carries the env(safe-area-inset-*) padding). See index.html.
  parent: 'game-inner',
  backgroundColor: COLORS.background,
  pixelArt: true,
  // Disable the right-click / long-press context menu on the canvas so a held
  // tap on mobile never pops the browser menu.
  disableContextMenu: true,
  scale: {
    // RESIZE: the canvas always matches the #game element (full viewport), so
    // the scene lays itself out responsively per orientation rather than being
    // letterboxed. 1 game unit == 1 CSS pixel, so UI can size touch targets in
    // real pixels.
    mode: Phaser.Scale.RESIZE,
    parent: 'game-inner',
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, MenuScene, GameScene],
};

const game = new Phaser.Game(config);
// Render at the device pixel ratio for crisp visuals on high-DPI (Android/Retina)
// screens while keeping all layout in CSS pixels. See systems/hidpi.ts.
installHiDPI(game);
// Expose the game instance for debugging + headless smoke tests.
(window as unknown as { game: Phaser.Game }).game = game;

// Belt-and-braces against residual mobile browser gestures that CSS alone can
// miss: Safari's pinch "gesture*" events and double-tap-to-zoom.
for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
  window.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault(); // double-tap zoom
    lastTouchEnd = now;
  },
  { passive: false },
);
