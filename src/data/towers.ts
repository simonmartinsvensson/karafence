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

export const STARTING_GOLD = 220;

// --- Upgrades --------------------------------------------------------------

export type UpgradePathKey = 'A' | 'B';

/**
 * One purchasable tier on an upgrade path. Costs rise per tier. Each tier
 * carries stat deltas (added) and/or flag effects (set). A `label` describes
 * the tier for the UI.
 */
export interface UpgradeTier {
  label: string;
  cost: number;
  // Stat deltas (added to current stats).
  damage?: number;
  rangeTiles?: number;
  attackSpeed?: number;
  // Effect setters.
  pierce?: number; // a single-target shot hits this many enemies near impact
  multiTarget?: number; // fire at this many distinct targets per attack
  doubleFire?: boolean; // fire twice per attack cycle
  slowOnHit?: { factor: number; duration: number }; // factor 0 = full stop
  stunOnHit?: { duration: number }; // splash stun (full stop)
}

export interface UpgradePath {
  name: string;
  tiers: [UpgradeTier, UpgradeTier, UpgradeTier];
}

export interface UpgradeTree {
  A: UpgradePath;
  B: UpgradePath;
}

export const MAX_TIER = 3;
/** Fraction of total gold spent refunded when a tower is sold. */
export const SELL_REFUND = 0.6;

/**
 * Upgrade trees per tower. Path A is power, Path B is utility; each path's
 * third tier is a signature effect. BTD6-style constraint (enforced in Tower):
 * only one path may go past tier 1.
 */
export const UPGRADES: Record<TowerTypeKey, UpgradeTree> = {
  leadSinger: {
    A: {
      name: 'Power',
      tiers: [
        { label: 'Louder', cost: 40, damage: 6 },
        { label: 'Belt It Out', cost: 70, damage: 10 },
        { label: 'Piercing Note', cost: 140, damage: 6, pierce: 3 },
      ],
    },
    B: {
      name: 'Utility',
      tiers: [
        { label: 'Stage Presence', cost: 35, rangeTiles: 0.8 },
        { label: 'Big Venue', cost: 60, rangeTiles: 1.0 },
        {
          label: 'Crowd Control',
          cost: 120,
          rangeTiles: 0.5,
          slowOnHit: { factor: 0.55, duration: 1.5 },
        },
      ],
    },
  },
  drummer: {
    A: {
      name: 'Power',
      tiers: [
        { label: 'Bigger Kit', cost: 50, rangeTiles: 0.4, damage: 2 },
        { label: 'Crash Cymbal', cost: 85, rangeTiles: 0.5, damage: 3 },
        {
          label: 'Drum Solo',
          cost: 160,
          damage: 3,
          stunOnHit: { duration: 0.8 },
        },
      ],
    },
    B: {
      name: 'Utility',
      tiers: [
        { label: 'Faster Hands', cost: 45, attackSpeed: 0.4 },
        { label: 'Blast Beat', cost: 75, attackSpeed: 0.5 },
        { label: 'Double Kick', cost: 140, attackSpeed: 0.2, doubleFire: true },
      ],
    },
  },
  keyboardist: {
    A: {
      name: 'Power',
      tiers: [
        { label: 'Sustain Pedal', cost: 40, slowOnHit: { factor: 0.4, duration: 2.2 } },
        { label: 'Deep Chill', cost: 70, slowOnHit: { factor: 0.3, duration: 2.4 } },
        { label: 'Freeze', cost: 150, slowOnHit: { factor: 0, duration: 1.2 } },
      ],
    },
    B: {
      name: 'Utility',
      tiers: [
        { label: 'Two Hands', cost: 45, damage: 4 },
        { label: 'Power Chords', cost: 75, damage: 6 },
        { label: 'Chord Strike', cost: 150, damage: 3, multiTarget: 3 },
      ],
    },
  },
};
