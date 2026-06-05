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

export interface MapDefinition {
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
}
