/**
 * Global low-FX switch for heavy moments (deep endless waves, where hundreds of
 * tanky enemies pile up). When `lowFx` is on, the cosmetic, fill-rate-hungry
 * effects are skipped — projectile trails, enemy ground shadows, big death
 * bursts — which are pure eye-candy and the main GPU cost at scale (especially
 * at high devicePixelRatio). Gameplay is unaffected. Driven by the live enemy
 * count in `GameScene.update` (with hysteresis so it doesn't flicker).
 */
export const perf = { lowFx: false };
