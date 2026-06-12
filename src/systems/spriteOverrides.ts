import Phaser from 'phaser';
import { TX, towerTextureKey, enemyTextureKey } from './textures';
import type { TowerTypeKey } from '../data/towers';

/**
 * Optional real-sprite overrides for the procedural art.
 *
 * The game ships with 100% generated textures (see textures.ts). This module
 * lets you replace any of them with a real PNG **without touching any scene or
 * system** — game logic only references texture keys, so dropping a file in and
 * adding one line here swaps the art.
 *
 * It is fully OPT-IN and degrades gracefully:
 *   - `SPRITE_OVERRIDES` starts empty → behaviour is identical to today.
 *   - Only files listed here are loaded, so there's no 404 console noise.
 *   - If a listed file fails to load, that key silently keeps its procedural art.
 *
 * Recommended pack: **game-icons.net** (CC BY 3.0) — monochrome silhouettes that
 * fit the existing tint + neon-glow pipeline. Add the required attribution to
 * `ART_CREDITS` below (shown in the menu's Credits modal).
 *
 * ── How tinting interacts with your art ──────────────────────────────────────
 *  • ENEMY keys (`kf-enemy-*`) are drawn GRAYSCALE and tinted to the enemy's
 *    color at runtime. Provide WHITE / light-gray silhouettes (e.g. a white
 *    game-icons PNG) and they'll tint + color-flash automatically.
 *  • TOWER keys (`kf-tower-*`) are full-color in code (base + border + figure).
 *    A plain icon would drop the neon base — provide a full-color tile-style
 *    sprite, or accept a flat icon look. (The colored base/border/glow that
 *    Tower.ts draws around the body still render regardless.)
 *  • HUD / projectile / stage keys (coin, mic, note, curtain, …) are used as-is
 *    — provide finished full-color art.
 *
 * Place files under `public/assets/sprites/` and reference them path-relative
 * (e.g. `assets/sprites/heckler.png`).
 *
 * Example (uncomment + add the matching files):
 *   export const SPRITE_OVERRIDES: Record<string, string> = {
 *     [enemyTextureKey('heckler')]:     'assets/sprites/heckler.png',
 *     [enemyTextureKey('phoneScroller')]:'assets/sprites/phone-scroller.png',
 *     [TX.coin]:                         'assets/sprites/coin.png',
 *     [TX.mic]:                          'assets/sprites/mic.png',
 *   };
 */
export const SPRITE_OVERRIDES: Record<string, string> = {
  // Enemies — white game-icons.net silhouettes; tinted to type color at runtime.
  [enemyTextureKey('heckler')]: 'assets/sprites/heckler.png',
  [enemyTextureKey('phoneScroller')]: 'assets/sprites/phone-scroller.png',
  [enemyTextureKey('drunkUncle')]: 'assets/sprites/drunk-uncle.png',
  [enemyTextureKey('stageRusher')]: 'assets/sprites/stage-rusher.png',
  [enemyTextureKey('critic')]: 'assets/sprites/critic.png',
  [enemyTextureKey('superfan')]: 'assets/sprites/superfan.png',
  [enemyTextureKey('vip')]: 'assets/sprites/vip.png',
  [enemyTextureKey('hecklerKing')]: 'assets/sprites/heckler-king.png',
  [enemyTextureKey('micGrabber')]: 'assets/sprites/mic-grabber.png',
  [enemyTextureKey('djWontStop')]: 'assets/sprites/dj.png',
  [enemyTextureKey('talentJudge')]: 'assets/sprites/judge.png',
  // HUD / projectile icons — pre-colored, used as-is.
  [TX.coin]: 'assets/sprites/coin.png',
  [TX.mic]: 'assets/sprites/mic.png',
  [TX.projNote]: 'assets/sprites/note.png',
};

/** Every overridable key, for reference / tooling (not required to use). */
export const OVERRIDABLE_KEYS = {
  towers: [
    'leadSinger', 'drummer', 'keyboardist', 'bassPlayer', 'backupSinger', 'hypeMan',
  ].map((k) => towerTextureKey(k as TowerTypeKey)),
  enemies: [
    'heckler', 'phoneScroller', 'drunkUncle', 'stageRusher', 'critic', 'superfan', 'vip',
    'hecklerKing', 'micGrabber', 'djWontStop', 'talentJudge',
  ].map((k) => enemyTextureKey(k)),
  icons: [TX.coin, TX.mic, TX.spotIcon, TX.projNote, TX.projStaff, TX.drumstick],
  stage: [TX.curtain, TX.spotlight, TX.singer, TX.portrait],
} as const;

/** Attribution lines shown in the menu Credits modal (required for CC BY art). */
export const ART_CREDITS: string[] = [
  'Icons from game-icons.net (CC BY 3.0)',
  'by Lorc, Delapouite & DarkZaitzev',
  'recolored; backgrounds removed',
];

const TMP_PREFIX = 'ovr:';

/**
 * Queue every override image for loading (call in a scene's `preload`). Loads
 * into a temp key so it never collides with the already-generated procedural
 * texture; `applySpriteOverrides` swaps them in afterwards.
 */
export function queueSpriteOverrides(scene: Phaser.Scene): void {
  for (const [key, file] of Object.entries(SPRITE_OVERRIDES)) {
    scene.load.image(TMP_PREFIX + key, file);
  }
}

/**
 * Swap any successfully-loaded overrides in over their procedural textures
 * (call in `create`, after `preload` has finished). Missing/failed files are
 * skipped, so the procedural art remains as a fallback.
 */
export function applySpriteOverrides(scene: Phaser.Scene): void {
  for (const key of Object.keys(SPRITE_OVERRIDES)) {
    const tmp = TMP_PREFIX + key;
    if (!scene.textures.exists(tmp)) continue; // file missing / failed → keep procedural
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.renameTexture(tmp, key);
  }
}
