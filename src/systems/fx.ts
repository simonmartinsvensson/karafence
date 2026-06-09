import Phaser from 'phaser';

/**
 * The neon-noir camera look: a soft **bloom** so the additive glows (towers,
 * projectiles, stage lights, menu pools) bleed like real neon, plus a gentle
 * **vignette**. WebGL-only — `camera.postFX` is undefined under the Canvas
 * fallback, so this no-ops gracefully there.
 */
export function addNeonCameraFX(camera: Phaser.Cameras.Scene2D.Camera): void {
  const fx = camera.postFX;
  if (!fx) return;
  // addBloom(color, offsetX, offsetY, blurStrength, strength, steps)
  fx.addBloom(0xffffff, 1, 1, 1.05, 0.7, 6);
  // addVignette(x, y, radius, strength)
  fx.addVignette(0.5, 0.5, 0.82, 0.32);
}
