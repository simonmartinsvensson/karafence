import type { MapDefinition } from '../types/map';

/** Pixel placement of the map within the logical canvas. */
export interface GridLayout {
  tileSize: number;
  mapW: number;
  mapH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Fit the whole map inside the available area (below the HUD strip) and center
 * it. With Scale.FIT this layout scales as a unit: fits to width on portrait
 * phones, fills cleanly centered on landscape desktop.
 */
export function computeGridLayout(
  map: MapDefinition,
  availW: number,
  availH: number,
  topOffset: number,
): GridLayout {
  const tileSize = Math.floor(Math.min(availW / map.cols, availH / map.rows));
  const mapW = tileSize * map.cols;
  const mapH = tileSize * map.rows;
  const offsetX = Math.floor((availW - mapW) / 2);
  const offsetY = topOffset + Math.floor((availH - mapH) / 2);
  return { tileSize, mapW, mapH, offsetX, offsetY };
}

/** Center of grid cell (col, row) in world/pixel coordinates. */
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
