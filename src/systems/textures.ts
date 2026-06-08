import Phaser from 'phaser';

/**
 * Procedural art for KaraFence. Every sprite the game draws is generated here
 * at boot with Phaser Graphics + `generateTexture` — there are NO external
 * image files. Game logic only ever references the string keys in `TX` (and the
 * `*Key` helpers), so the placeholder art below can be swapped for real
 * hand-drawn / imported textures later without touching any scene or system:
 * just change what `generateTextures` produces for a given key.
 *
 * Resolution note: textures are generated larger than their on-screen logic
 * size (a tile is BOARD_TILE=40 but drawn at TILE_RES=64) so they stay crisp
 * when the board container scales up on big screens. With `pixelArt: true` the
 * sampling is NEAREST, so edges read as clean pixels rather than blurring.
 *
 * Tinting: tiles and enemies are drawn in GRAYSCALE and tinted at use-time
 * (tiles to the map's palette, enemies to the enemy color) so one texture
 * serves every palette and the existing color-flash / slow-tint logic keeps
 * working via `setTint`.
 */

// Generation resolutions (px). On-screen size is set by the consumer.
const TILE_RES = 64;

/** Stable texture keys. Helpers build per-type keys for towers/enemies/projectiles. */
export const TX = {
  tileStage: 'kf-tile-stage',
  tileAisle: 'kf-tile-aisle',
  tileBuild: 'kf-tile-build',
} as const;

/**
 * Generate every texture once. Idempotent: re-running (e.g. if Boot re-enters)
 * is a no-op once the first key exists.
 */
export function generateTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TX.tileStage)) return;
  generateTileTextures(scene);
}

// --- Section 1: tiles ------------------------------------------------------
//
// Drawn in grayscale around a light base (≈0xc8c8c8) so that `setTint(mapColor)`
// in GameScene.drawMap lands the tile near the map's palette color, with detail
// carried as relative brightness: near-white = bright accent (footlights, seat
// highlights), dark grays = shadows (curtain folds, grid lines, lane dividers).

const BASE = 0xc8c8c8;
const SHADOW = 0x6e6e6e;
const DARK = 0x565656;
const LIGHT = 0xeaeaea;
const ACCENT = 0xffffff;

function generateTileTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = TILE_RES;

  const frame = () => {
    // A subtle 1px inset edge so tiles read as a grid without a separate stroke.
    g.lineStyle(1, DARK, 0.5);
    g.strokeRect(0.5, 0.5, R - 1, R - 1);
  };

  // Stage: footlights along the bottom + vertical curtain folds.
  g.clear();
  g.fillStyle(BASE, 1);
  g.fillRect(0, 0, R, R);
  // Curtain folds: alternating vertical shadow stripes.
  g.fillStyle(SHADOW, 0.5);
  for (let x = 4; x < R; x += 12) g.fillRect(x, 0, 5, R);
  g.fillStyle(LIGHT, 0.35);
  for (let x = 10; x < R; x += 12) g.fillRect(x, 0, 2, R);
  // Gold footlight dots glowing up from the bottom edge.
  for (let x = 8; x < R; x += 12) {
    g.fillStyle(ACCENT, 0.25);
    g.fillCircle(x, R - 5, 6);
    g.fillStyle(ACCENT, 1);
    g.fillCircle(x, R - 5, 3);
  }
  frame();
  g.generateTexture(TX.tileStage, R, R);

  // Aisle: carpet with a faint chevron pattern + a lane-divider line on top edge.
  g.clear();
  g.fillStyle(BASE, 1);
  g.fillRect(0, 0, R, R);
  g.lineStyle(2, LIGHT, 0.22);
  for (let y = -R; y < R; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(R / 2, y + R / 2);
    g.lineTo(R, y);
    g.strokePath();
  }
  // Lane divider: a darker line along the top edge (between stacked aisles).
  g.fillStyle(DARK, 0.6);
  g.fillRect(0, 0, R, 2);
  frame();
  g.generateTexture(TX.tileAisle, R, R);

  // Build: charcoal floor with two rows of little rounded "seat" silhouettes.
  g.clear();
  g.fillStyle(0x8c8c8c, 1); // slightly darker base — seating area reads dimmer
  g.fillRect(0, 0, R, R);
  const seatW = 12;
  const seatH = 9;
  const gap = 4;
  for (let row = 0; row < 2; row++) {
    const sy = 14 + row * (seatH + 10);
    for (let sx = 6; sx + seatW <= R - 4; sx += seatW + gap) {
      g.fillStyle(DARK, 0.9);
      g.fillRoundedRect(sx + 1, sy + 2, seatW, seatH, 3); // seat shadow
      g.fillStyle(LIGHT, 0.85);
      g.fillRoundedRect(sx, sy, seatW, seatH - 2, 3); // seat back highlight
    }
  }
  frame();
  g.generateTexture(TX.tileBuild, R, R);

  g.destroy();
}
