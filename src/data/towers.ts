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

export type TowerTypeKey =
  | 'leadSinger'
  | 'drummer'
  | 'keyboardist'
  | 'backupSinger'
  | 'bassPlayer'
  | 'hypeMan';

/** Identifier for each tower's one active (cooldown-gated) ability. */
export type AbilityKey =
  | 'powerNote'
  | 'drumRoll'
  | 'chordBomb'
  | 'choirBoost'
  | 'dropTheBass'
  | 'crowdSurf';

/** An active ability triggered from the tower's upgrade panel. */
export interface TowerAbility {
  key: AbilityKey;
  name: string;
  /** One-line description for the activate button. */
  description: string;
  /** Cooldown in seconds before it can fire again. */
  cooldown: number;
}

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
  /** This tower's active ability. */
  ability: TowerAbility;
  /**
   * If false, the tower never targets/fires at enemies — it's a support tower
   * whose value is its aura (Backup Singer, Hype Man). Defaults to true.
   */
  attacks?: boolean;
  /** Bass Player: each "bass blast" knocks every enemy in range back this many tiles. */
  knockbackTiles?: number;
  /** Backup Singer: multiplies the attack speed of attacking towers in range. */
  buffAttackSpeed?: number;
  /** Hype Man: multiplies gold earned from kills inside its range (e.g. 1.5). */
  goldBoost?: number;
  /** Hype Man: kills inside its range build the combo meter faster. */
  comboBoost?: boolean;
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
    ability: {
      key: 'powerNote',
      name: 'Power Note',
      description: 'Massive single-target nuke',
      cooldown: 18,
    },
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
    ability: {
      key: 'drumRoll',
      name: 'Drum Roll',
      description: '3s stun blast around the drummer',
      cooldown: 20,
    },
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
    ability: {
      key: 'chordBomb',
      name: 'Chord Bomb',
      description: 'Drops a 10s slow field',
      cooldown: 22,
    },
  },
  // Short range support: buffs the attack speed of nearby attacking towers.
  backupSinger: {
    key: 'backupSinger',
    name: 'Backup Singer',
    cost: 60,
    range: 1.9,
    damage: 0,
    attackSpeed: 0,
    splash: false,
    color: 0xb197fc,
    projectileColor: 0xd0bfff,
    icon: '🎙️',
    defaultTargeting: 'first',
    attacks: false,
    buffAttackSpeed: 1.4,
    ability: {
      key: 'choirBoost',
      name: 'Choir Boost',
      description: 'All towers fire 2x for 10s',
      cooldown: 25,
    },
  },
  // Medium range: a low-frequency bass blast that knocks enemies back.
  bassPlayer: {
    key: 'bassPlayer',
    name: 'Bass Player',
    cost: 85,
    range: 2.4,
    damage: 4,
    attackSpeed: 0.5,
    splash: false,
    knockbackTiles: 2,
    color: 0x7048e8,
    projectileColor: 0xb197fc,
    icon: '🎸',
    defaultTargeting: 'first',
    ability: {
      key: 'dropTheBass',
      name: 'Drop the Bass',
      description: 'Knock ALL enemies back 5 tiles',
      cooldown: 20,
    },
  },
  // Wide range support: boosts gold + combo for kills in range.
  hypeMan: {
    key: 'hypeMan',
    name: 'Hype Man',
    cost: 90,
    range: 3.8,
    damage: 0,
    attackSpeed: 0,
    splash: false,
    color: 0xffa94d,
    projectileColor: 0xffd8a8,
    icon: '📣',
    defaultTargeting: 'first',
    attacks: false,
    goldBoost: 1.5,
    comboBoost: true,
    ability: {
      key: 'crowdSurf',
      name: 'Crowd Surf',
      description: 'Next 10 kills pay triple gold',
      cooldown: 28,
    },
  },
};

export const TOWER_LIST: TowerType[] = [
  TOWER_TYPES.leadSinger,
  TOWER_TYPES.drummer,
  TOWER_TYPES.keyboardist,
  TOWER_TYPES.backupSinger,
  TOWER_TYPES.bassPlayer,
  TOWER_TYPES.hypeMan,
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
 * only one path may go past tier 1. Towers without an entry (the support
 * towers) simply can't be upgraded — their value is their aura + ability.
 */
export const UPGRADES: Partial<Record<TowerTypeKey, UpgradeTree>> = {
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
