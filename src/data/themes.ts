import { TileType } from '../types/map';

/**
 * Per-chapter visual themes. The 60-level campaign is split into six 10-level
 * "chapters", each a distinct venue look so the game changes appearance as you
 * climb (instead of one palette swap at level 20). A theme drives the tile
 * palette (the dominant board color), the camera background wash, the board-edge
 * vignette and the backstage frame behind the stage curtain — all solid colors
 * we fully control (the red theatre curtain stays constant as "the stage").
 *
 * The arc mirrors the story: grungy dive bars → neon lounge → grand theater →
 * concert hall → arena → the gold world stage. In every theme the AISLE (the
 * walkable path) stays the most saturated tile so the lane reads clearly against
 * the cooler, darker buildable seating.
 */
export interface ChapterTheme {
  /** Short venue name for the chapter band (UI / future use). */
  name: string;
  /** Tile palette (the level's `colors`). */
  tiles: Record<TileType, number>;
  /** Camera background wash shown in the margins around the board. */
  bg: number;
  /** Board-edge vignette darkening color. */
  vignette: number;
  /** Solid fill behind the stage curtain (frames the stage in the theme). */
  backstage: number;
}

export const CHAPTER_THEMES: ChapterTheme[] = [
  {
    // Chapter 1 (L1-10) — dive bars / The Garage: warm, grungy red-brown.
    name: 'Dive Bars',
    tiles: {
      [TileType.Stage]: 0x3a2150,
      [TileType.Aisle]: 0x8f3a26,
      [TileType.Build]: 0x33403a,
      [TileType.Obstacle]: 0x1d2230,
    },
    bg: 0x0b0b12,
    vignette: 0x05050a,
    backstage: 0x140a1e,
  },
  {
    // Chapter 2 (L11-20) — neon lounge: purple/magenta nightclub.
    name: 'Neon Lounge',
    tiles: {
      [TileType.Stage]: 0x2a1640,
      [TileType.Aisle]: 0x8a2f9e,
      [TileType.Build]: 0x33285a,
      [TileType.Obstacle]: 0x1a1230,
    },
    bg: 0x0c0814,
    vignette: 0x080510,
    backstage: 0x1c0e2a,
  },
  {
    // Chapter 3 (L21-30) — the grand theater: cool teal / steel blue.
    name: 'Grand Theater',
    tiles: {
      [TileType.Stage]: 0x24243a,
      [TileType.Aisle]: 0x2f7d9e,
      [TileType.Build]: 0x2c3f5a,
      [TileType.Obstacle]: 0x161a2a,
    },
    bg: 0x080b12,
    vignette: 0x04060a,
    backstage: 0x0e1422,
  },
  {
    // Chapter 4 (L31-40) — concert hall: emerald green.
    name: 'Concert Hall',
    tiles: {
      [TileType.Stage]: 0x123026,
      [TileType.Aisle]: 0x1f9e63,
      [TileType.Build]: 0x244a3a,
      [TileType.Obstacle]: 0x0e1f18,
    },
    bg: 0x070f0b,
    vignette: 0x030806,
    backstage: 0x0c1f16,
  },
  {
    // Chapter 5 (L41-50) — the arena: sunset orange / red.
    name: 'The Arena',
    tiles: {
      [TileType.Stage]: 0x401a10,
      [TileType.Aisle]: 0xc1531a,
      [TileType.Build]: 0x5a3a2a,
      [TileType.Obstacle]: 0x2a160c,
    },
    bg: 0x120a07,
    vignette: 0x0a0503,
    backstage: 0x241008,
  },
  {
    // Chapter 6 (L51-60) — the world stage: royal gold + purple finale.
    name: 'World Stage',
    tiles: {
      [TileType.Stage]: 0x3a2e10,
      [TileType.Aisle]: 0xc7991f,
      [TileType.Build]: 0x4a3a5a,
      [TileType.Obstacle]: 0x241c0e,
    },
    bg: 0x100c08,
    vignette: 0x080603,
    backstage: 0x241a0a,
  },
];

/** Theme for a 0-based campaign level index (10 levels per chapter, clamped). */
export function themeForChapterIndex(i: number): ChapterTheme {
  const band = Math.floor(Math.max(0, i) / 10);
  return CHAPTER_THEMES[Math.min(CHAPTER_THEMES.length - 1, band)];
}
