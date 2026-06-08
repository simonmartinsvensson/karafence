/**
 * Map / lane type definitions.
 *
 * Maps are data-driven: a level is authored as ASCII rows + a legend (see
 * src/data/level1.ts) and parsed into a MapDefinition. This keeps new maps
 * cheap to author — edit the ASCII, get a new level.
 */

export enum TileType {
  /** Stage / singer zone on the left edge. Enemies that reach it deal damage. */
  Stage = 'stage',
  /** Aisle the enemies walk along (right -> left toward the stage). */
  Aisle = 'aisle',
  /** Buildable seats / floor off the path where towers can be placed. */
  Build = 'build',
}

/** Per-level thresholds for the 0-3 star rating (one star per goal met). */
export interface StarGoals {
  /** Earn a star for finishing with no more than this many lives lost. */
  maxLivesLost: number;
  /** Earn a star for spending no more than this much gold over the run. */
  maxGoldSpent: number;
  /** Earn a star for reaching at least this combo at some point. */
  minCombo: number;
}

export interface MapDefinition {
  /** Stable id, used as the meta-progression / save key. */
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Row-major grid: tiles[row][col]. */
  tiles: TileType[][];
  /** Row indices of the aisles (lanes), top to bottom. */
  laneRows: number[];
  /** Column where enemies spawn (right edge). */
  spawnCol: number;
  /** Column enemies march toward (the stage edge). */
  stageCol: number;
  /** Global speed multiplier applied to this map's enemies (1 = normal). */
  enemySpeedMultiplier: number;
  /** Star-rating thresholds for this level. */
  starGoals: StarGoals;
  /** Flat placeholder tile colors that give the map its look. */
  colors: Record<TileType, number>;
}
