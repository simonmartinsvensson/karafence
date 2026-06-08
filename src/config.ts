// The game uses Phaser's RESIZE scale mode: the canvas always fills the
// viewport and the scenes lay themselves out responsively (see
// `computeScreenLayout` in `systems/grid.ts`). 1 game unit == 1 CSS pixel.

// Board-local reference tile size. The lane grid is built once at this fixed
// tile size into a container; that container is then scaled/positioned to fit
// the available board region, so the board reflows on resize/rotation with a
// single transform (no per-object relayout). Larger = crisper when scaled up.
export const BOARD_TILE = 40;

// Minimum on-screen size for any interactive control (Android/iOS touch
// target guidance). UI sizes buttons/rows to at least this in CSS pixels.
export const TOUCH_MIN = 44;

export const COLORS = {
  background: '#0b0b12',
  accent: '#e84393',
} as const;
