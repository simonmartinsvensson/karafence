import Phaser from 'phaser';
import { TOWER_TYPES, type TowerTypeKey } from '../data/towers';

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
  // Baked (NOT tinted) accents overlaid on tiles for readability — their real
  // gold/green colors survive whatever palette the tile underneath is tinted to.
  aisleArrow: 'kf-aisle-arrow', // gold left-chevron + cream lane dividers
  buildPlus: 'kf-build-plus', // green "+" + tower-base shadow on a faint green wash
  lanePill: 'kf-lane-pill', // dark rounded badge behind a lane number
  portrait: 'kf-portrait', // grayscale VN bust, tinted to a story character
  glow: 'kf-glow', // soft white radial, tinted + ADD-blended for neon glows/shadows
  curtain: 'kf-curtain',
  spotlight: 'kf-spotlight',
  singer: 'kf-singer',
  projNote: 'kf-proj-note',
  projStaff: 'kf-proj-staff',
  drumstick: 'kf-drumstick',
  coin: 'kf-coin',
  mic: 'kf-mic',
  spotIcon: 'kf-spot-icon',
  hpFill: 'kf-hp-fill',
} as const;

/** Texture key for a tower type's drawn sprite. */
export const towerTextureKey = (key: TowerTypeKey): string => `kf-tower-${key}`;

/** Texture key for an enemy type's drawn silhouette (grayscale, tinted at use). */
export const enemyTextureKey = (key: string): string => `kf-enemy-${key}`;

/**
 * Generate every texture once. Idempotent: re-running (e.g. if Boot re-enters)
 * is a no-op once the first key exists.
 */
export function generateTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TX.tileStage)) return;
  generateTileTextures(scene);
  generateTileAccentTextures(scene);
  generateGlowTexture(scene);
  generatePortraitTexture(scene);
  generateStageTextures(scene);
  generateTowerTextures(scene);
  generateEnemyTextures(scene);
  generateProjectileTextures(scene);
  generateUiTextures(scene);
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

  // Aisle: a flat woven-carpet base. The directional chevron + the bright
  // lane-divider lines are drawn as baked (non-tinted) accents in
  // `generateTileAccentTextures` and overlaid in GameScene.drawMap, so the
  // carpet here is kept plain (just a subtle horizontal weave) to read clearly
  // as the walkable path once tinted to a saturated red-brown.
  g.clear();
  g.fillStyle(BASE, 1);
  g.fillRect(0, 0, R, R);
  g.fillStyle(SHADOW, 0.16);
  for (let y = 5; y < R; y += 8) g.fillRect(0, y, R, 3); // carpet weave bands
  // Lengthwise runner depth: darken the top + bottom edges, leaving a lit
  // central band so the lane reads as a recessed runner under the footlights.
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.4, 0.4, 0, 0);
  g.fillRect(0, 0, R, R * 0.5);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.4, 0.4);
  g.fillRect(0, R * 0.5, R, R * 0.5);
  frame();
  g.generateTexture(TX.tileAisle, R, R);

  // Build: a dark slate/charcoal floor with two rows of faint "seat"
  // silhouettes. Drawn darker than the aisle so the buildable seating reads as
  // dimmer/recessed; the green wash + center "+" tower-base indicator are baked
  // accents overlaid in GameScene.drawMap so "I can build here" is unmistakable.
  g.clear();
  g.fillStyle(0x707074, 1); // darker base — seating area reads dimmer/recessed
  g.fillRect(0, 0, R, R);
  // Top-lit gradient: a touch brighter at the top, sinking to shadow at the
  // bottom, so each buildable tile reads as a recessed booth.
  g.fillGradientStyle(0xffffff, 0xffffff, 0x000000, 0x000000, 0.06, 0.06, 0.34, 0.34);
  g.fillRect(0, 0, R, R);
  const seatW = 12;
  const seatH = 9;
  const gap = 4;
  for (let row = 0; row < 2; row++) {
    const sy = 12 + row * (seatH + 12);
    for (let sx = 6; sx + seatW <= R - 4; sx += seatW + gap) {
      g.fillStyle(0x2e2e34, 0.9);
      g.fillRoundedRect(sx + 1, sy + 2, seatW, seatH, 3); // seat shadow
      g.fillStyle(LIGHT, 0.42);
      g.fillRoundedRect(sx, sy, seatW, seatH - 2, 3); // seat back highlight
    }
  }
  frame();
  g.generateTexture(TX.tileBuild, R, R);

  g.destroy();
}

// --- Section 1b: baked tile accents ----------------------------------------
//
// These are drawn in their REAL colors (no tint) and overlaid on the tiles in
// GameScene.drawMap, so the directional / "buildable" cues read identically on
// every map palette: a gold left-chevron + cream lane dividers on aisles, and a
// green "+" tower-base indicator on a faint green wash on buildable tiles.

const GOLD = 0xffd98a;
const CREAM = 0xffe9b0;
const GREEN = 0x69db7c;

function generateTileAccentTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = TILE_RES;

  // Aisle accent: two gold "<" chevrons pointing LEFT (enemy travel direction),
  // kept low-alpha so the lane reads as a runner rather than a row of arrows,
  // plus soft cream divider lines along the top + bottom edges.
  g.clear();
  const chevron = (cx: number, alpha: number) => {
    const half = 10; // vertical reach
    const w = 8; // horizontal depth of the "<"
    g.lineStyle(4, GOLD, alpha);
    g.beginPath();
    g.moveTo(cx + w, R / 2 - half);
    g.lineTo(cx, R / 2);
    g.lineTo(cx + w, R / 2 + half);
    g.strokePath();
  };
  chevron(R * 0.36, 0.26);
  chevron(R * 0.54, 0.13);
  g.fillStyle(CREAM, 0.32);
  g.fillRect(0, 0, R, 2); // top lane divider
  g.fillRect(0, R - 2, R, 2); // bottom lane divider
  g.generateTexture(TX.aisleArrow, R, R);

  // Build accent: deliberately quiet so the board isn't a sea of markers. A
  // faint inset frame + a small dim center pip hint "placeable"; the full green
  // build overlay only appears when you tap a tile (TowerManager.showBuildOverlay).
  g.clear();
  g.lineStyle(1, GREEN, 0.16);
  g.strokeRoundedRect(5.5, 5.5, R - 11, R - 11, 6); // faint inset frame
  g.fillStyle(GREEN, 0.22);
  g.fillCircle(R / 2, R / 2, 2.4); // tiny center pip
  g.fillStyle(GREEN, 0.08);
  g.fillCircle(R / 2, R / 2, 6); // soft halo around the pip
  g.generateTexture(TX.buildPlus, R, R);

  // Lane pill: a dark, semi-transparent rounded badge sized for a single digit.
  g.clear();
  g.fillStyle(0x05050a, 0.6);
  g.fillRoundedRect(0, 0, 36, 26, 9);
  g.lineStyle(1, 0xffffff, 0.12);
  g.strokeRoundedRect(0.5, 0.5, 35, 25, 9);
  g.generateTexture(TX.lanePill, 36, 26);

  g.destroy();
}

// --- Section 1b2: soft radial glow -----------------------------------------
//
// One white radial fade, tinted + (usually) ADD-blended at use-time for neon
// glows behind towers, projectile/impact flashes, menu light pools, etc. Also
// re-used dark + normal-blend as a soft ground shadow.

function generateGlowTexture(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const S = 64;
  const c = S / 2;
  g.clear();
  // Stacked translucent circles fake a smooth radial falloff (white core out).
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    g.fillStyle(0xffffff, 0.10 * (1 - t) + 0.01);
    g.fillCircle(c, c, c * (1 - t));
  }
  g.generateTexture(TX.glow, S, S);
  g.destroy();
}

// --- Section 1c: story dialogue portrait -----------------------------------
//
// A grayscale head-and-shoulders bust drawn light so `setTint(character.color)`
// in the DialogueOverlay renders it as that character's silhouette (visual-novel
// style). One texture serves the whole cast.

function generatePortraitTexture(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 96;
  const H = 112;
  const cx = W / 2;
  g.clear();
  // Shoulders / torso (rounded, rising from the bottom edge).
  g.fillStyle(0xd2d2d2, 1);
  g.fillRoundedRect(cx - 38, H - 42, 76, 60, 22);
  // Neck.
  g.fillRect(cx - 9, H - 56, 18, 18);
  // Head.
  g.fillCircle(cx, H - 66, 24);
  // Hair / brow shadow (darker, reads as a backlit silhouette detail).
  g.fillStyle(0x8f8f8f, 1);
  g.fillEllipse(cx, H - 80, 50, 30);
  g.fillRect(cx - 25, H - 84, 50, 10);
  // Soft lit highlight along one cheek + shoulder so it isn't a flat blob.
  g.fillStyle(0xf2f2f2, 0.55);
  g.fillCircle(cx - 8, H - 70, 9);
  g.fillRoundedRect(cx - 34, H - 38, 16, 22, 8);
  g.generateTexture(TX.portrait, W, H);
  g.destroy();
}

// --- Section 2: stage / singer ---------------------------------------------
//
// The stage zone is composed in GameScene.drawSinger from three textures:
// a curtain backdrop (filling the stage column), a warm spotlight cone (ADD
// blend) and a lit singer figure at a mic stand. The figure is the one that
// bounces on nearby kills and flashes red when the stage is hit.

function generateStageTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Theatre curtains: deep-red vertical drapes, a gold valance + tassels on top,
  // and gold footlights along the bottom. Real colors (not tinted at use).
  const CW = 64;
  const CH = 96;
  g.clear();
  g.fillStyle(0x6b1020, 1);
  g.fillRect(0, 0, CW, CH);
  for (let x = 0; x < CW; x += 10) {
    g.fillStyle(0x4a0a16, 1);
    g.fillRect(x, 0, 5, CH); // fold shadow
    g.fillStyle(0x9c1c30, 1);
    g.fillRect(x + 6, 0, 3, CH); // fold highlight
  }
  // Gold valance across the top with scalloped tassels.
  g.fillStyle(0xd9a020, 1);
  g.fillRect(0, 0, CW, 9);
  g.fillStyle(0xffe680, 1);
  g.fillRect(0, 0, CW, 3);
  for (let x = 6; x < CW; x += 12) {
    g.fillStyle(0xd9a020, 1);
    g.fillCircle(x, 10, 4);
    g.fillStyle(0xffe680, 1);
    g.fillCircle(x, 9, 1.5);
  }
  // Footlights along the bottom edge.
  for (let x = 7; x < CW; x += 12) {
    g.fillStyle(0xffe680, 0.3);
    g.fillCircle(x, CH - 4, 5);
    g.fillStyle(0xffe680, 1);
    g.fillCircle(x, CH - 4, 2.5);
  }
  g.generateTexture(TX.curtain, CW, CH);

  // Spotlight cone: warm, soft-edged, narrow at the top widening downward.
  const SP = 96;
  g.clear();
  const apexX = SP / 2;
  for (let i = 0; i < 3; i++) {
    const spread = 16 + i * 13;
    g.fillStyle(0xfff2c0, 0.17 - i * 0.045);
    g.beginPath();
    g.moveTo(apexX, 3);
    g.lineTo(apexX - spread, SP - 2);
    g.lineTo(apexX + spread, SP - 2);
    g.closePath();
    g.fillPath();
  }
  g.generateTexture(TX.spotlight, SP, SP);

  // Singer: a lit humanoid figure at a microphone stand (on-brand magenta).
  const W = 48;
  const H = 96;
  const cx = W / 2;
  g.clear();
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(cx, H - 5, W * 0.66, 8); // ground shadow
  // Legs.
  g.fillStyle(0x2b2b3a, 1);
  g.fillRoundedRect(cx - 9, H * 0.56, 7, H * 0.4, 3);
  g.fillRoundedRect(cx + 2, H * 0.56, 7, H * 0.4, 3);
  // Arms.
  g.fillStyle(0xc23280, 1);
  g.fillRoundedRect(cx - 16, H * 0.32, 5, H * 0.22, 3);
  g.fillRoundedRect(cx + 11, H * 0.32, 5, H * 0.22, 3);
  // Torso (dress), lit brighter along the top.
  g.fillStyle(0xe84393, 1);
  g.fillRoundedRect(cx - 12, H * 0.3, 24, H * 0.3, 6);
  g.fillStyle(0xff7ec3, 0.85);
  g.fillRoundedRect(cx - 12, H * 0.3, 24, 7, 6);
  // Head + lit cheek + hair.
  g.fillStyle(0xffd9b0, 1);
  g.fillCircle(cx, H * 0.21, 9);
  g.fillStyle(0xfff0d8, 0.7);
  g.fillCircle(cx - 2, H * 0.19, 4);
  g.fillStyle(0x3a2a22, 1);
  g.fillEllipse(cx, H * 0.15, 20, 12);
  // Mic stand: pole + mic head near the mouth.
  g.fillStyle(0xb8b8c0, 1);
  g.fillRect(cx - 1, H * 0.27, 2, H * 0.68);
  g.fillStyle(0x222228, 1);
  g.fillCircle(cx, H * 0.27, 4);
  g.fillStyle(0x55555f, 0.9);
  g.fillCircle(cx - 1, H * 0.26, 1.5);
  g.generateTexture(TX.singer, W, H);

  g.destroy();
}

// --- Section 3: towers -----------------------------------------------------
//
// Each tower is a distinct instrument/performer silhouette on a dark rounded
// tile base bordered in the tower's color, drawn at TOWER_RES so it stays
// readable scaled down to ~33px on the board. Replaces the colored-rectangle +
// emoji body in Tower.ts (kept readable at small sizes via bold silhouettes).

const TOWER_RES = 64;

function generateTowerTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = TOWER_RES;

  const base = (color: number) => {
    g.clear();
    // Dark outer body.
    g.fillStyle(0x0e0e16, 1);
    g.fillRoundedRect(2, 2, R - 4, R - 4, 11);
    // Top-lit → shadowed-bottom gradient face for depth.
    g.fillGradientStyle(0x363650, 0x363650, 0x161620, 0x161620, 1, 1, 1, 1);
    g.fillRoundedRect(4, 4, R - 8, R - 8, 9);
    // Faint inner rim in the tower's color (neon bleed).
    g.lineStyle(6, color, 0.13);
    g.strokeRoundedRect(6, 6, R - 12, R - 12, 8);
    // Top sheen.
    g.fillStyle(0xffffff, 0.09);
    g.fillRoundedRect(7, 6, R - 14, 10, 6);
    // Crisp color border.
    g.lineStyle(3, color, 1);
    g.strokeRoundedRect(2.5, 2.5, R - 5, R - 5, 11);
  };

  // Lead Singer: figure + mic under a small spotlight.
  base(TOWER_TYPES.leadSinger.color);
  g.fillStyle(0xfff2c0, 0.13);
  g.beginPath();
  g.moveTo(32, 8);
  g.lineTo(20, 52);
  g.lineTo(44, 52);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xffe066, 1);
  g.fillCircle(30, 26, 6);
  g.fillRoundedRect(24, 32, 12, 20, 4);
  g.fillStyle(0xdddddd, 1);
  g.fillRect(37, 28, 2, 18);
  g.fillStyle(0x222228, 1);
  g.fillCircle(38, 28, 3.5);
  g.generateTexture(towerTextureKey('leadSinger'), R, R);

  // Drummer: bass drum + snare + hi-hat + crossed sticks.
  base(TOWER_TYPES.drummer.color);
  g.fillStyle(0xffd8a8, 1);
  g.fillEllipse(18, 36, 13, 6); // snare
  g.fillStyle(0xcccccc, 1);
  g.fillRect(47, 28, 2, 16); // hi-hat stand
  g.fillEllipse(48, 28, 13, 3); // hi-hat cymbal
  g.fillStyle(TOWER_TYPES.drummer.color, 1);
  g.fillCircle(32, 42, 14); // bass drum
  g.fillStyle(0x14141c, 1);
  g.fillCircle(32, 42, 7);
  g.lineStyle(2, 0xffe0b0, 1);
  g.strokeCircle(32, 42, 14);
  g.beginPath(); // sticks up
  g.moveTo(26, 22);
  g.lineTo(33, 9);
  g.moveTo(39, 22);
  g.lineTo(31, 9);
  g.strokePath();
  g.generateTexture(towerTextureKey('drummer'), R, R);

  // Keyboardist: keyboard with black keys + player head behind.
  base(TOWER_TYPES.keyboardist.color);
  g.fillStyle(TOWER_TYPES.keyboardist.color, 1);
  g.fillCircle(32, 17, 6); // head behind
  g.fillStyle(0xeeeeee, 1);
  g.fillRoundedRect(13, 31, 38, 18, 3); // white keys
  g.fillStyle(0x1a1a22, 1);
  for (let i = 0; i < 6; i++) g.fillRect(18 + i * 6, 31, 3, 10); // black keys
  g.lineStyle(2, TOWER_TYPES.keyboardist.color, 1);
  g.strokeRoundedRect(13, 31, 38, 18, 3);
  g.generateTexture(towerTextureKey('keyboardist'), R, R);

  // Bass Player: bass-guitar body + neck + tuning pegs (distinct from keyboard).
  base(TOWER_TYPES.bassPlayer.color);
  g.lineStyle(4, 0x9b78ff, 1);
  g.beginPath();
  g.moveTo(30, 40);
  g.lineTo(52, 13);
  g.strokePath(); // neck
  g.fillStyle(TOWER_TYPES.bassPlayer.color, 1);
  g.fillEllipse(25, 43, 24, 17); // body
  g.fillStyle(0x14141c, 1);
  g.fillCircle(25, 43, 4); // sound spot
  g.fillStyle(0xcccccc, 1);
  g.fillRoundedRect(49, 9, 9, 8, 2); // headstock
  g.fillStyle(0xffffff, 1);
  g.fillCircle(50, 9, 1.6);
  g.fillCircle(55, 9, 1.6);
  g.fillCircle(58, 13, 1.6); // tuning pegs
  g.lineStyle(1, 0xd0bfff, 0.8);
  g.beginPath();
  g.moveTo(19, 43);
  g.lineTo(50, 13);
  g.strokePath(); // string
  g.generateTexture(towerTextureKey('bassPlayer'), R, R);

  // Backup Singer: two smaller figures sharing a central mic.
  base(TOWER_TYPES.backupSinger.color);
  g.fillStyle(TOWER_TYPES.backupSinger.color, 1);
  g.fillCircle(21, 27, 5);
  g.fillCircle(43, 27, 5); // heads
  g.fillRoundedRect(16, 32, 10, 18, 3);
  g.fillRoundedRect(38, 32, 10, 18, 3); // bodies
  g.fillStyle(0xdddddd, 1);
  g.fillRect(31, 28, 2, 16); // shared mic stand
  g.fillStyle(0x222228, 1);
  g.fillCircle(32, 28, 3.5);
  g.generateTexture(towerTextureKey('backupSinger'), R, R);

  // Hype Man: figure with arms raised wide + radiating energy lines.
  base(TOWER_TYPES.hypeMan.color);
  g.lineStyle(2, 0xffd8a8, 0.9);
  g.beginPath();
  g.moveTo(32, 6);
  g.lineTo(32, 12);
  g.moveTo(10, 16);
  g.lineTo(15, 20);
  g.moveTo(54, 16);
  g.lineTo(49, 20);
  g.moveTo(7, 32);
  g.lineTo(13, 32);
  g.moveTo(57, 32);
  g.lineTo(51, 32);
  g.strokePath(); // energy
  g.fillStyle(TOWER_TYPES.hypeMan.color, 1);
  g.fillCircle(32, 30, 6); // head
  g.fillRoundedRect(27, 36, 10, 16, 3); // body
  g.lineStyle(4, TOWER_TYPES.hypeMan.color, 1);
  g.beginPath();
  g.moveTo(29, 38);
  g.lineTo(17, 23);
  g.moveTo(35, 38);
  g.lineTo(47, 23);
  g.strokePath(); // raised arms
  g.generateTexture(towerTextureKey('hypeMan'), R, R);

  g.destroy();
}

// --- Section 4: enemies ----------------------------------------------------
//
// Each enemy is a grayscale character silhouette tinted to its type color at
// use (so the existing slow / deflect color-flash via setTint keeps working).
// Normal foes are drawn at 48px, bosses at 96px with a larger, more detailed
// silhouette; the boss aura glow is a separate colored element drawn in Enemy.

const E_BODY = 0xdcdcdc; // takes the tint (the enemy's color)
const E_EDGE = 0x6e6e6e; // darker features / outlines
const E_DARK = 0x474747; // deep features (brows, lapels)
const E_LIT = 0xffffff; // bright accents (phone screen, shirt, crown)

function generateEnemyTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const N = 48; // normal enemy resolution

  // Heckler: blocky figure, arms crossed, scowling brow.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(16, 34, 7, 13);
  g.fillRect(25, 34, 7, 13);
  g.fillRoundedRect(13, 16, 22, 20, 4);
  g.fillCircle(24, 12, 7);
  g.fillStyle(E_DARK, 1);
  g.fillRect(20, 10, 9, 2); // scowl brow
  g.lineStyle(4, E_EDGE, 1);
  g.beginPath();
  g.moveTo(14, 22);
  g.lineTo(34, 28);
  g.moveTo(34, 22);
  g.lineTo(14, 28);
  g.strokePath(); // crossed arms
  g.generateTexture(enemyTextureKey('heckler'), N, N);

  // Phone Scroller: hunched forward, a glowing phone lighting the face.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(15, 34, 7, 13);
  g.fillRect(24, 34, 7, 13);
  g.fillRoundedRect(13, 18, 20, 18, 4);
  g.fillCircle(28, 14, 7); // head forward
  g.fillRoundedRect(25, 23, 11, 4, 2); // arms out
  g.fillStyle(E_LIT, 0.35);
  g.fillCircle(37, 22, 7); // screen glow
  g.fillStyle(E_LIT, 1);
  g.fillRoundedRect(34, 18, 6, 10, 1); // phone screen
  g.generateTexture(enemyTextureKey('phoneScroller'), N, N);

  // Drunk Uncle: wide stance, holding a frothy drink.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(12, 34, 7, 13);
  g.fillRect(28, 34, 7, 13); // wide legs
  g.fillRoundedRect(15, 16, 19, 20, 4);
  g.fillCircle(24, 11, 7);
  g.lineStyle(3, E_BODY, 1);
  g.beginPath();
  g.moveTo(31, 24);
  g.lineTo(37, 22);
  g.strokePath(); // arm to mug
  g.fillStyle(E_EDGE, 1);
  g.fillRect(35, 20, 7, 9); // mug
  g.fillStyle(E_LIT, 0.9);
  g.fillRect(35, 20, 7, 3); // foam
  g.generateTexture(enemyTextureKey('drunkUncle'), N, N);

  // Stage Rusher: forward-lean sprint with motion lines behind.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillCircle(31, 12, 6);
  g.fillRoundedRect(19, 15, 17, 14, 5); // angled torso
  g.lineStyle(4, E_BODY, 1);
  g.beginPath();
  g.moveTo(25, 27);
  g.lineTo(19, 44);
  g.moveTo(29, 27);
  g.lineTo(35, 42); // running legs
  g.moveTo(23, 19);
  g.lineTo(15, 25); // arm
  g.strokePath();
  g.lineStyle(2, E_EDGE, 0.9);
  g.beginPath();
  g.moveTo(3, 15);
  g.lineTo(13, 15);
  g.moveTo(1, 23);
  g.lineTo(11, 23);
  g.moveTo(3, 31);
  g.lineTo(13, 31); // motion lines
  g.strokePath();
  g.generateTexture(enemyTextureKey('stageRusher'), N, N);

  // Critic: upright, nose in the air, notepad in hand.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(18, 34, 6, 13);
  g.fillRect(25, 34, 6, 13);
  g.fillRoundedRect(16, 16, 17, 20, 4);
  g.fillCircle(23, 11, 7);
  g.fillStyle(E_DARK, 1);
  g.fillTriangle(27, 8, 32, 8, 28, 12); // upturned nose
  g.fillStyle(E_LIT, 1);
  g.fillRect(31, 22, 8, 10); // notepad
  g.lineStyle(1, E_EDGE, 1);
  g.beginPath();
  g.moveTo(32, 25);
  g.lineTo(38, 25);
  g.moveTo(32, 28);
  g.lineTo(38, 28);
  g.strokePath();
  g.generateTexture(enemyTextureKey('critic'), N, N);

  // Superfan: oversized, chunky, arms thrown up in excitement.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillCircle(24, 30, 15); // chunky body
  g.fillCircle(24, 11, 8); // head
  g.lineStyle(5, E_BODY, 1);
  g.beginPath();
  g.moveTo(12, 26);
  g.lineTo(6, 12);
  g.moveTo(36, 26);
  g.lineTo(42, 12); // arms up
  g.strokePath();
  g.fillStyle(E_DARK, 1);
  g.fillCircle(24, 13, 2); // open mouth
  g.generateTexture(enemyTextureKey('superfan'), N, N);

  // VIP: suited figure with sunglasses.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(18, 34, 6, 13);
  g.fillRect(25, 34, 6, 13);
  g.fillRoundedRect(15, 16, 18, 20, 3);
  g.fillCircle(24, 11, 7);
  g.fillStyle(E_DARK, 1);
  g.fillTriangle(24, 16, 19, 16, 24, 25);
  g.fillTriangle(24, 16, 29, 16, 24, 25); // lapels
  g.fillStyle(E_LIT, 1);
  g.fillTriangle(24, 17, 22, 17, 24, 24); // shirt
  g.fillStyle(E_DARK, 1);
  g.fillRect(19, 10, 11, 3); // sunglasses
  g.generateTexture(enemyTextureKey('vip'), N, N);

  // Crowd Surfer: figure lying back, arms up, carried over the crowd.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRoundedRect(13, 22, 24, 9, 4); // horizontal torso
  g.fillCircle(35, 20, 6); // head (right, leading)
  g.lineStyle(4, E_BODY, 1);
  g.beginPath();
  g.moveTo(30, 24);
  g.lineTo(33, 13); // raised arm
  g.moveTo(18, 26);
  g.lineTo(13, 16); // raised arm
  g.moveTo(15, 29);
  g.lineTo(9, 36); // trailing legs
  g.strokePath();
  g.lineStyle(2, E_EDGE, 0.8); // crowd hands beneath
  g.beginPath();
  for (let hx = 12; hx <= 36; hx += 6) {
    g.moveTo(hx, 40);
    g.lineTo(hx, 33);
  }
  g.strokePath();
  g.generateTexture(enemyTextureKey('crowdSurfer'), N, N);

  // Roadie: burly figure in a cap hauling a flight case.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(14, 35, 7, 12);
  g.fillRect(23, 35, 7, 12); // sturdy legs
  g.fillRoundedRect(11, 14, 22, 22, 4); // broad torso
  g.fillCircle(22, 10, 7); // head
  g.fillStyle(E_DARK, 1);
  g.fillRoundedRect(14, 4, 16, 4, 2); // cap brim
  g.fillRect(16, 1, 12, 4); // cap crown
  g.fillStyle(E_EDGE, 1);
  g.fillRoundedRect(33, 22, 11, 16, 2); // flight case
  g.fillStyle(E_LIT, 0.8);
  g.fillRect(33, 29, 11, 2); // case latch line
  g.generateTexture(enemyTextureKey('roadie'), N, N);

  // Pyro: figure brandishing a torch with a flame above.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(17, 34, 6, 13);
  g.fillRect(25, 34, 6, 13);
  g.fillRoundedRect(15, 17, 18, 19, 4);
  g.fillCircle(23, 12, 7);
  g.lineStyle(4, E_BODY, 1);
  g.beginPath();
  g.moveTo(31, 22);
  g.lineTo(38, 14); // arm to torch
  g.strokePath();
  g.fillStyle(E_EDGE, 1);
  g.fillRect(37, 12, 3, 8); // torch handle
  g.fillStyle(E_LIT, 1);
  g.fillTriangle(38, 12, 34, 4, 42, 4); // flame
  g.fillStyle(E_DARK, 0.7);
  g.fillTriangle(38, 10, 36, 5, 40, 5); // flame core
  g.generateTexture(enemyTextureKey('pyro'), N, N);

  // --- Bosses (96px, larger + more detailed silhouettes) ---
  const B = 96;

  // Heckler King: crown + megaphone, large and imposing.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(34, 64, 12, 27);
  g.fillRect(50, 64, 12, 27);
  g.fillRoundedRect(28, 34, 40, 34, 8);
  g.fillCircle(48, 24, 14);
  g.fillStyle(E_LIT, 1);
  g.beginPath();
  g.moveTo(36, 16);
  g.lineTo(40, 6);
  g.lineTo(44, 14);
  g.lineTo(48, 4);
  g.lineTo(52, 14);
  g.lineTo(56, 6);
  g.lineTo(60, 16);
  g.closePath();
  g.fillPath(); // crown
  g.fillStyle(E_EDGE, 1);
  g.beginPath();
  g.moveTo(28, 44);
  g.lineTo(11, 37);
  g.lineTo(11, 55);
  g.lineTo(28, 52);
  g.closePath();
  g.fillPath(); // megaphone
  g.generateTexture(enemyTextureKey('hecklerKing'), B, B);

  // Mic Grabber: a long hand reaching toward the stage (left).
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(46, 64, 11, 27);
  g.fillRect(58, 64, 11, 27);
  g.fillRoundedRect(40, 34, 32, 32, 7);
  g.fillCircle(56, 24, 13);
  g.lineStyle(7, E_BODY, 1);
  g.beginPath();
  g.moveTo(44, 42);
  g.lineTo(11, 52);
  g.strokePath(); // reaching arm
  g.fillStyle(E_BODY, 1);
  g.fillCircle(10, 52, 6); // hand
  g.lineStyle(3, E_BODY, 1);
  g.beginPath();
  g.moveTo(7, 47);
  g.lineTo(2, 43);
  g.moveTo(6, 52);
  g.lineTo(0, 52);
  g.moveTo(7, 57);
  g.lineTo(2, 61);
  g.strokePath(); // fingers
  g.generateTexture(enemyTextureKey('micGrabber'), B, B);

  // DJ Who Wouldn't Stop: headphones + turntable disc.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRoundedRect(30, 40, 36, 30, 7);
  g.fillCircle(48, 26, 13);
  g.lineStyle(4, E_EDGE, 1);
  g.beginPath();
  g.arc(48, 24, 16, Math.PI * 1.1, Math.PI * 1.9, false);
  g.strokePath(); // headphone band
  g.fillStyle(E_DARK, 1);
  g.fillCircle(34, 26, 5);
  g.fillCircle(62, 26, 5); // ear cups
  g.fillStyle(E_EDGE, 1);
  g.fillEllipse(48, 66, 32, 11); // turntable
  g.fillStyle(E_LIT, 1);
  g.fillCircle(48, 66, 3); // spindle
  g.generateTexture(enemyTextureKey('djWontStop'), B, B);

  // Talent Show Judge: suited, arms folded, podium energy.
  g.clear();
  g.fillStyle(E_BODY, 1);
  g.fillRect(40, 62, 12, 24);
  g.fillRect(54, 62, 12, 24);
  g.fillRoundedRect(32, 30, 36, 34, 7);
  g.fillCircle(50, 22, 13);
  g.fillStyle(E_DARK, 1);
  g.fillTriangle(50, 30, 44, 30, 50, 44);
  g.fillTriangle(50, 30, 56, 30, 50, 44); // lapels
  g.fillStyle(E_LIT, 1);
  g.fillTriangle(50, 32, 47, 32, 50, 42); // shirt
  g.lineStyle(7, E_EDGE, 1);
  g.beginPath();
  g.moveTo(34, 48);
  g.lineTo(66, 48);
  g.strokePath(); // folded arms
  g.fillStyle(E_EDGE, 1);
  g.fillRect(36, 74, 28, 14); // podium
  g.generateTexture(enemyTextureKey('talentJudge'), B, B);

  g.destroy();
}

// --- Section 5: projectiles ------------------------------------------------
//
// Tower-specific projectiles (baked full color, spun by Projectile): a golden
// musical note (Lead Singer), a glowing music-wave (Keyboardist) and a tumbling
// drumstick (Drummer splash flourish). The Bass Player's "drop the bass" stays
// an expanding pulse ring drawn directly in Tower.

function generateProjectileTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Golden musical note (♩): head + stem + flag.
  g.clear();
  g.fillStyle(0xffe066, 1);
  g.fillEllipse(9, 18, 10, 7); // note head
  g.fillRect(13, 4, 3, 14); // stem
  g.fillTriangle(15, 4, 15, 12, 22, 8); // flag
  g.fillStyle(0xfff3bf, 0.9);
  g.fillEllipse(7, 16, 3, 2); // highlight
  g.generateTexture(TX.projNote, 26, 26);

  // Glowing music-wave: a cyan sine ripple with a soft halo + staff lines.
  g.clear();
  g.fillStyle(0xc5f6fa, 0.28);
  g.fillCircle(14, 12, 11); // glow
  g.lineStyle(1, 0xc5f6fa, 0.5);
  g.beginPath();
  g.moveTo(2, 8);
  g.lineTo(26, 8);
  g.moveTo(2, 16);
  g.lineTo(26, 16);
  g.strokePath(); // staff lines
  g.lineStyle(3, 0x66d9e8, 1);
  g.beginPath();
  g.moveTo(3, 12);
  g.lineTo(8, 5);
  g.lineTo(13, 12);
  g.lineTo(18, 19);
  g.lineTo(23, 12); // sine-ish wave
  g.strokePath();
  g.generateTexture(TX.projStaff, 28, 24);

  // Drumstick: a tan rounded stick with a ball tip (tumbles end-over-end).
  g.clear();
  g.fillStyle(0xffd8a8, 1);
  g.fillRoundedRect(2, 9, 15, 4, 2); // shaft
  g.fillCircle(18, 11, 3.5); // tip
  g.fillStyle(0xfff0db, 0.9);
  g.fillRoundedRect(3, 9, 8, 1.5, 1); // highlight
  g.generateTexture(TX.drumstick, 22, 22);

  g.destroy();
}

// --- Section 6: UI / HUD ---------------------------------------------------
//
// Small HUD icons + a gradient fill, used by GameScene's restyled HUD (coin by
// the gold count, mic on the singer-energy bar, spotlight by the wave counter,
// red→pink gradient for the energy fill). Bars/borders that resize live in
// GameScene as Graphics/rects; only the fixed-size icons are textures here.

function generateUiTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Gold coin with a 4-point sparkle.
  g.clear();
  g.fillStyle(0xd9a020, 1);
  g.fillCircle(12, 12, 10);
  g.fillStyle(0xffe680, 1);
  g.fillCircle(12, 12, 7.5);
  g.fillStyle(0xb37400, 1);
  g.fillTriangle(12, 5, 10, 12, 14, 12);
  g.fillTriangle(12, 19, 10, 12, 14, 12);
  g.fillTriangle(5, 12, 12, 10, 12, 14);
  g.fillTriangle(19, 12, 12, 10, 12, 14);
  g.generateTexture(TX.coin, 24, 24);

  // Microphone (for the singer-energy bar).
  g.clear();
  g.fillStyle(0xe6e9f0, 1);
  g.fillRoundedRect(8, 3, 8, 11, 4); // head
  g.lineStyle(1, 0x6e6e6e, 1);
  g.beginPath();
  g.moveTo(9, 6);
  g.lineTo(15, 6);
  g.moveTo(9, 9);
  g.lineTo(15, 9);
  g.strokePath(); // grille
  g.fillStyle(0x9aa0b0, 1);
  g.fillRect(11, 13, 2, 7); // handle
  g.fillRoundedRect(9, 19, 6, 2, 1); // base
  g.generateTexture(TX.mic, 24, 24);

  // Spotlight lamp + beam (for the wave counter).
  g.clear();
  g.fillStyle(0xfff2c0, 0.4);
  g.fillTriangle(8, 11, 16, 11, 12, 22); // beam
  g.fillStyle(0x2b2b3a, 1);
  g.fillRoundedRect(7, 4, 10, 7, 2); // housing
  g.fillStyle(0xffe680, 1);
  g.fillEllipse(12, 11, 8, 3); // lens
  g.generateTexture(TX.spotIcon, 24, 24);

  // Red→pink horizontal gradient for the singer-energy fill (scaled at use).
  g.clear();
  g.fillGradientStyle(0xff2d55, 0xff8fb1, 0xff2d55, 0xff8fb1, 1);
  g.fillRect(0, 0, 64, 8);
  g.generateTexture(TX.hpFill, 64, 8);

  g.destroy();
}
