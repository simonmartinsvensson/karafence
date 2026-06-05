/**
 * Data-driven enemy types — the "bad audience" archetypes that march up the
 * aisles toward the stage. Tune these numbers to rebalance; add a key here to
 * add a new enemy type.
 */

export type EnemyTypeKey = 'heckler' | 'phoneScroller' | 'drunkUncle';

export interface EnemyType {
  key: EnemyTypeKey;
  name: string;
  /** Hit points. */
  hp: number;
  /** Movement speed in tiles per second. */
  speed: number;
  /** Flat damage reduction per hit (used by towers later). */
  armor: number;
  /** Gold awarded when killed. */
  reward: number;
  /** Singer HP removed if this enemy reaches the stage. */
  damage: number;
  /** Placeholder sprite color. */
  color: number;
  /** Body size as a fraction of a tile. */
  size: number;
  /** If true, randomly picks an adjacent lane at each step (erratic path). */
  erratic: boolean;
}

export const ENEMY_TYPES: Record<EnemyTypeKey, EnemyType> = {
  // Standard speed, standard hp.
  heckler: {
    key: 'heckler',
    name: 'Heckler',
    hp: 30,
    speed: 1.6,
    armor: 0,
    reward: 5,
    damage: 1,
    color: 0xff6b6b,
    size: 0.6,
    erratic: false,
  },
  // Slow but tanky.
  phoneScroller: {
    key: 'phoneScroller',
    name: 'Phone Scroller',
    hp: 120,
    speed: 0.9,
    armor: 1,
    reward: 9,
    damage: 1,
    color: 0x4dabf7,
    size: 0.72,
    erratic: false,
  },
  // Fast, low hp, erratic — staggers between adjacent lanes.
  drunkUncle: {
    key: 'drunkUncle',
    name: 'Drunk Uncle',
    hp: 16,
    speed: 2.6,
    armor: 0,
    reward: 6,
    damage: 2,
    color: 0xffd43b,
    size: 0.6,
    erratic: true,
  },
};
