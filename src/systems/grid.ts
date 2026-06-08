import type Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import { BOARD_TILE, TOUCH_MIN } from '../config';

/**
 * Ordered z-layers inside the board container (back to front). All board game
 * objects are added to one of these instead of the scene root, so a single
 * transform on the parent board container reflows the whole board on resize
 * while layer order preserves the original depth stacking.
 */
export interface BoardLayers {
  tiles: Phaser.GameObjects.Container;
  range: Phaser.GameObjects.Container;
  enemies: Phaser.GameObjects.Container;
  towers: Phaser.GameObjects.Container;
  projectiles: Phaser.GameObjects.Container;
  fx: Phaser.GameObjects.Container;
}

/** Board-local placement of the map. With the board-container approach the
 * map is built once at a fixed tile size with origin (0,0); the container is
 * then scaled/positioned to fit the screen, so these never change at runtime. */
export interface GridLayout {
  tileSize: number;
  mapW: number;
  mapH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Build the board-local layout: a fixed reference tile size, origin at (0,0).
 * The map lives inside a container that gets scaled/positioned to fit the
 * available region (see `computeScreenLayout` + GameScene.fitBoard), so all
 * tower/enemy coordinates are stable for the life of the run.
 */
export function computeGridLayout(map: MapDefinition): GridLayout {
  const tileSize = BOARD_TILE;
  return {
    tileSize,
    mapW: tileSize * map.cols,
    mapH: tileSize * map.rows,
    offsetX: 0,
    offsetY: 0,
  };
}

/** Center of grid cell (col, row) in board-local coordinates. */
export function tileToWorld(
  layout: GridLayout,
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: layout.offsetX + col * layout.tileSize + layout.tileSize / 2,
    y: layout.offsetY + row * layout.tileSize + layout.tileSize / 2,
  };
}

/** A rectangle in viewport (CSS-pixel) coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Responsive screen layout derived from the live viewport size. Splits the
 * screen into a top HUD strip, a bottom control bar (the one-thumb buttons),
 * and the board region between them where the lane grid is fitted.
 */
export interface ScreenLayout {
  vw: number;
  vh: number;
  portrait: boolean;
  hudH: number;
  barH: number;
  /** Region the board container is scaled to fit + centered within. */
  board: Rect;
}

export function computeScreenLayout(vw: number, vh: number): ScreenLayout {
  const portrait = vh >= vw;
  // Top HUD strip: tall enough to read gold/wave/HP comfortably.
  const hudH = Math.round(Math.min(56, Math.max(40, vh * 0.07)));
  // Bottom control bar: must fit >=44px buttons with padding.
  const barH = Math.round(Math.max(TOUCH_MIN + 16, Math.min(76, vh * 0.1)));
  return {
    vw,
    vh,
    portrait,
    hudH,
    barH,
    board: { x: 0, y: hudH, w: vw, h: Math.max(40, vh - hudH - barH) },
  };
}

/** Scale + position to fit a board of intrinsic size (mapW,mapH) into a
 * region, centered, preserving aspect ratio. */
export function fitTransform(
  mapW: number,
  mapH: number,
  region: Rect,
): { scale: number; x: number; y: number } {
  const scale = Math.min(region.w / mapW, region.h / mapH);
  return {
    scale,
    x: region.x + (region.w - mapW * scale) / 2,
    y: region.y + (region.h - mapH * scale) / 2,
  };
}
