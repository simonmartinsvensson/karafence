/**
 * Data-driven enemy types — the "bad audience" archetypes that march up the
 * aisles toward the stage. Tune these numbers to rebalance; add a key here to
 * add a new enemy type. Bosses live in this same map (flagged with `boss`).
 */

export type EnemyTypeKey =
  | 'heckler'
  | 'phoneScroller'
  | 'drunkUncle'
  | 'stageRusher'
  | 'critic'
  | 'superfan'
  | 'vip'
  | 'hecklerKing'
  | 'micGrabber'
  | 'djWontStop'
  | 'talentJudge';

export type BossKind = 'hecklerKing' | 'micGrabber' | 'djWontStop' | 'talentJudge';

export interface EnemyType {
  key: EnemyTypeKey;
  name: string;
  /** Hit points. */
  hp: number;
  /** Movement speed in tiles per second. */
  speed: number;
  /** Flat damage reduction per hit. */
  armor: number;
  /** Gold awarded when killed. */
  reward: number;
  /** Singer HP removed if this enemy reaches the stage. */
  damage: number;
  /** Placeholder sprite color. */
  color: number;
  /** Body size as a fraction of a tile (bosses are > 1). */
  size: number;
  /** If true, randomly picks an adjacent lane at each step (erratic path). */
  erratic: boolean;

  // --- Special behaviors -------------------------------------------------
  /** Stage Rusher: immune to the first tower that damages it. */
  bypassFirstTower?: boolean;
  /** Critic: radius (tiles) of the "bad review" aura that cuts nearby rewards. */
  criticAura?: number;
  /** Critic: reward multiplier applied to enemies that die inside the aura. */
  reviewPenalty?: number;
  /** Superfan: spawn these on death. */
  splitInto?: { type: EnemyTypeKey; count: number };
  /** VIP: chance (0-1) that a hit is fully deflected. */
  deflectChance?: number;
  /** Shield hit points that must be broken before hp takes damage. */
  shield?: number;
  /** Marks a boss and which ability set it uses. */
  boss?: BossKind;
}

export const ENEMY_TYPES: Record<EnemyTypeKey, EnemyType> = {
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
  // Very fast, fragile; ignores the first tower that hits it.
  stageRusher: {
    key: 'stageRusher',
    name: 'Stage Rusher',
    hp: 14,
    speed: 3.6,
    armor: 0,
    reward: 6,
    damage: 2,
    color: 0xff922b,
    size: 0.55,
    erratic: false,
    bypassFirstTower: true,
  },
  // Cuts the gold reward of enemies dying within its "bad review" aura.
  critic: {
    key: 'critic',
    name: 'Critic',
    hp: 60,
    speed: 1.4,
    armor: 0,
    reward: 7,
    damage: 1,
    color: 0xb197fc,
    size: 0.66,
    erratic: false,
    criticAura: 1.9,
    reviewPenalty: 0.5,
  },
  // Slow tank; splits into 2 Hecklers when killed.
  superfan: {
    key: 'superfan',
    name: 'Superfan',
    hp: 150,
    speed: 0.8,
    armor: 0,
    reward: 12,
    damage: 1,
    color: 0xffa94d,
    size: 0.8,
    erratic: false,
    splitInto: { type: 'heckler', count: 2 },
  },
  // Armored; deflects some hits; pays out a big reward.
  vip: {
    key: 'vip',
    name: 'VIP',
    hp: 80,
    speed: 1.3,
    armor: 2,
    reward: 30,
    damage: 1,
    color: 0xfab005,
    size: 0.7,
    erratic: false,
    deflectChance: 0.4,
  },

  // --- Bosses (one per 5 waves) -----------------------------------------
  hecklerKing: {
    key: 'hecklerKing',
    name: 'The Heckler King',
    hp: 650,
    speed: 0.55,
    armor: 1,
    reward: 120,
    damage: 4,
    color: 0xd6336c,
    size: 1.7,
    erratic: false,
    boss: 'hecklerKing',
  },
  micGrabber: {
    key: 'micGrabber',
    name: 'The Mic Grabber',
    hp: 420,
    speed: 1.4,
    armor: 0,
    reward: 140,
    damage: 2,
    color: 0x5c7cfa,
    size: 1.25,
    erratic: false,
    boss: 'micGrabber',
  },
  djWontStop: {
    key: 'djWontStop',
    name: "The DJ Who Wouldn't Stop",
    hp: 520,
    speed: 1.0,
    armor: 0,
    reward: 180,
    damage: 3,
    color: 0x20c997,
    size: 1.35,
    erratic: false,
    shield: 220,
    boss: 'djWontStop',
  },
  talentJudge: {
    key: 'talentJudge',
    name: 'The Talent Show Judge',
    hp: 1000,
    speed: 1.9,
    armor: 3,
    reward: 350,
    damage: 5,
    color: 0xfa5252,
    size: 1.5,
    erratic: false,
    boss: 'talentJudge',
  },
};

/** Tuning for boss abilities (driven by GameScene). */
export const BOSS_CONFIG = {
  hecklerKing: { freezeRadiusTiles: 3, freezeDuration: 1.5, tauntInterval: 4 },
  micGrabber: { goldSteal: 10 },
  djWontStop: { spawnInterval: 3, spawnType: 'heckler' as EnemyTypeKey, spawnCount: 2 },
  talentJudge: {
    phase2Hp: 0.5,
    phase3Hp: 0.25,
    rusherType: 'stageRusher' as EnemyTypeKey,
    rusherCount: 6,
    attackSpeedFactor: 0.5,
  },
};
