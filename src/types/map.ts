/**
 * Map / lane type definitions.
 *
 * Maps are data-driven: a level is authored as ASCII rows + a legend and parsed
 * into a MapDefinition. The campaign (src/data/campaign.ts) builds 20 of them
 * from layout templates + a difficulty profile. Edit the table, get new levels.
 */

import type { WaveProfile } from '../data/waves';

export enum TileType {
  /** Stage / singer zone on the left edge. Enemies that reach it deal damage. */
  Stage = 'stage',
  /** Aisle the enemies walk along (right -> left toward the stage). */
  Aisle = 'aisle',
  /** Buildable seats / floor off the path where towers can be placed. */
  Build = 'build',
  /**
   * A venue prop (speaker stack / pillar) occupying a seat: NOT buildable and
   * NOT walkable. Used to vary the back-half board footprint so each venue
   * forces different tower placement instead of being the same open rectangle.
   */
  Obstacle = 'obstacle',
}

/**
 * Set-piece "special" rule for milestone levels (30/40/50/60), so they play
 * differently instead of being one more number-inflated normal level.
 *  - bossRush: a boss every wave.
 *  - survival: no new tower placement while a wave is in progress.
 *  - suddenDeath: the singer has very few hit points.
 *  - finale: the campaign's final showdown (a unique boss).
 */
export type SpecialKind = 'bossRush' | 'survival' | 'suddenDeath' | 'finale';

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
  /** Gold the player starts the run with (before meta modifiers). */
  startingGold?: number;
  /** Drives wave generation for this level (count / scaling / enemy pool / bosses). */
  waveProfile?: WaveProfile;
  /** Set-piece rule for milestone levels (undefined = a normal level). */
  special?: SpecialKind;
  /**
   * Movement model. Default (undefined) = `lane`: enemies walk a fixed aisle
   * row right→left. `maze`: the board is an open floor and towers block tiles;
   * enemies flow-field pathfind around them (Maze Night mode). See systems/maze.ts.
   */
  pathMode?: 'lane' | 'maze';
}
