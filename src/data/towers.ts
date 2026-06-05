/**
 * Data-driven tower types — the performers you place to defend the singer.
 * Add a key here to add a new tower.
 */

export type TargetingStrategy = 'first' | 'last' | 'strongest';
export const TARGETING_STRATEGIES: TargetingStrategy[] = [
  'first',
  'last',
  'strongest',
];

export type TowerTypeKey = 'leadSinger' | 'drummer' | 'keyboardist';

export interface TowerType {
  key: TowerTypeKey;
  name: string;
  /** Gold cost to place. */
  cost: number;
  /** Attack range, in tiles. */
  range: number;
  /** Damage per hit. */
  damage: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** If true, every attack hits all enemies in range (AoE). */
  splash: boolean;
  /** Optional slow debuff applied on hit: speed multiplier (<1). */
  slowFactor?: number;
  /** Slow duration in seconds. */
  slowDuration?: number;
  /** Body color. */
  color: number;
  /** Projectile / effect color. */
  projectileColor: number;
  /** Placeholder icon. */
  icon: string;
  defaultTargeting: TargetingStrategy;
}

export const TOWER_TYPES: Record<TowerTypeKey, TowerType> = {
  // Medium range / medium damage, single target.
  leadSinger: {
    key: 'leadSinger',
    name: 'Lead Singer',
    cost: 50,
    range: 2.6,
    damage: 9,
    attackSpeed: 1.3,
    splash: false,
    color: 0xffe066,
    projectileColor: 0xfff3bf,
    icon: '🎤',
    defaultTargeting: 'first',
  },
  // Short range, AoE splash damage.
  drummer: {
    key: 'drummer',
    name: 'Drummer',
    cost: 75,
    range: 1.7,
    damage: 5,
    attackSpeed: 0.9,
    splash: true,
    color: 0xff922b,
    projectileColor: 0xffd8a8,
    icon: '🥁',
    defaultTargeting: 'first',
  },
  // Long range, slow firing, applies a slow debuff.
  keyboardist: {
    key: 'keyboardist',
    name: 'Keyboardist',
    cost: 65,
    range: 3.4,
    damage: 4,
    attackSpeed: 0.7,
    splash: false,
    slowFactor: 0.5,
    slowDuration: 2,
    color: 0x66d9e8,
    projectileColor: 0xc5f6fa,
    icon: '🎹',
    defaultTargeting: 'first',
  },
};

export const TOWER_LIST: TowerType[] = [
  TOWER_TYPES.leadSinger,
  TOWER_TYPES.drummer,
  TOWER_TYPES.keyboardist,
];

export const STARTING_GOLD = 150;
