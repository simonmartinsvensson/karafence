import Phaser from 'phaser';

/**
 * The neon-noir camera look. We deliberately DON'T use a full-screen bloom — it
 * blurs the crisp pixel-art sprites and (worse) the text. Instead the neon glow
 * comes from additive `TX.glow` halos drawn *behind* the crisp sprites, which
 * don't soften them at all. The camera only adds a gentle **vignette** for mood.
 * WebGL-only — `camera.postFX` is undefined under the Canvas fallback (no-op).
 */
export function addNeonCameraFX(camera: Phaser.Cameras.Scene2D.Camera): void {
  const fx = camera.postFX;
  if (!fx) return;
  // addVignette(x, y, radius, strength) — darkens edges only, no blur.
  fx.addVignette(0.5, 0.5, 0.82, 0.3);
}
