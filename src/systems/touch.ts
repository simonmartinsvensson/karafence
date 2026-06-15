import Phaser from 'phaser';
import { haptics, type HapticName } from './haptics';

/**
 * Tactile press feedback for touch UI. Mobile has no hover state, so a tap can
 * feel laggy with no visible reaction; this dips the control's scale (and
 * optionally brightens its fill) on pointer-down and snaps it back on release,
 * plus fires a light haptic. It is **purely event-driven** — no tweens or
 * timers — so it still animates while the scene is paused (the pause menu pauses
 * all tweens/timers, which would otherwise freeze the feedback).
 */
export function pressFeedback(
  hit: Phaser.GameObjects.GameObject,
  visuals: Phaser.GameObjects.Components.Transform[],
  opts: {
    rect?: Phaser.GameObjects.Rectangle;
    base?: number;
    active?: number;
    fillAlpha?: number;
    haptic?: HapticName;
  } = {},
): void {
  const alpha = opts.fillAlpha ?? 0.98;
  const press = (): void => {
    visuals.forEach((v) => v.setScale(0.94));
    if (opts.rect && opts.active !== undefined) opts.rect.setFillStyle(opts.active, alpha);
    haptics.play(opts.haptic ?? 'tap');
  };
  const release = (): void => {
    visuals.forEach((v) => v.setScale(1));
    if (opts.rect && opts.base !== undefined) opts.rect.setFillStyle(opts.base, alpha);
  };
  hit.on('pointerdown', press);
  hit.on('pointerup', release);
  hit.on('pointerout', release);
  hit.on('pointerupoutside', release);
}
