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
  | 'crowdSurfer'
  | 'roadie'
  | 'pyro'
  | 'hecklerKing'
  | 'micGrabber'
  | 'djWontStop'
  | 'talentJudge'
  | 'encorePhantom';

export type BossKind =
  | 'hecklerKing'
  | 'micGrabber'
  | 'djWontStop'
  | 'talentJudge'
  | 'encorePhantom';

export interface EnemyType {
  key: EnemyTypeKey;
  name: string;
  /** One-line description shown in the pause-menu Enemy Guide. */
  blurb: string;
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
  /** Crowd Surfer: immune to the first N towers that damage it (generalises bypassFirstTower). */
  bypassCount?: number;
  /** Roadie: periodically grants a shield to nearby un-shielded allies. */
  healAura?: { radiusTiles: number; shield: number; interval: number; max: number };
  /** Pyro: periodically disables (freezes) towers it passes near. */
  disablesTowers?: { radiusTiles: number; duration: number; interval: number };
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
    blurb: "Basic crowd — weak, but comes in numbers.",
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
    blurb: "Oblivious and slow, but soaks up tons of damage.",
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
    blurb: "Fast and weaves between lanes — hard to pin down.",
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
    blurb: "Sprints for the stage; ignores the first tower to hit it.",
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
    blurb: "Cuts the gold of any foe that dies near its bad-review aura.",
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
    blurb: "Tanky; splits into two Hecklers when downed.",
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
    blurb: "Armored and often deflects hits — but pays out big.",
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

  // --- Back-half archetypes (introduced past level 15) ------------------
  // Rides over the crowd: ignores the first TWO towers that hit it, so a single
  // chokepoint can't stop it — you need layered coverage or splash.
  crowdSurfer: {
    key: 'crowdSurfer',
    name: 'Crowd Surfer',
    blurb: "Rides the crowd over the first two towers that hit it.",
    hp: 42,
    speed: 2.2,
    armor: 0,
    reward: 8,
    damage: 2,
    color: 0x9775fa,
    size: 0.62,
    erratic: false,
    bypassCount: 2,
  },
  // Support unit: every few seconds it shields nearby un-shielded allies, so
  // killing the Roadie first stops it from turning a wave into a tank squad.
  roadie: {
    key: 'roadie',
    name: 'Roadie',
    blurb: "Shields nearby foes every few seconds — take it out first.",
    hp: 110,
    speed: 1.0,
    armor: 1,
    reward: 14,
    damage: 1,
    color: 0x66a80f,
    size: 0.74,
    erratic: false,
    healAura: { radiusTiles: 2.2, shield: 40, interval: 4, max: 3 },
  },
  // Briefly knocks out towers it walks past (pyrotechnics misfire), pressuring
  // your defensive line's uptime rather than tanking damage.
  pyro: {
    key: 'pyro',
    name: 'Pyro',
    blurb: "Sets off sparks that briefly knock out nearby towers.",
    hp: 70,
    speed: 1.4,
    armor: 0,
    reward: 13,
    damage: 2,
    color: 0xe8590c,
    size: 0.66,
    erratic: false,
    disablesTowers: { radiusTiles: 1.6, duration: 1.0, interval: 3.5 },
  },

  // --- Bosses (one per 5 waves) -----------------------------------------
  hecklerKing: {
    key: 'hecklerKing',
    name: 'The Heckler King',
    blurb: "Boss: taunts that briefly freeze nearby towers.",
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
    blurb: "Boss: steals gold and resets your combo if it reaches the stage.",
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
    blurb: "Boss: shielded, and keeps summoning more Hecklers.",
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
    blurb: "Boss: multi-phase finale — speeds up and rushes you late.",
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
  // Campaign finale (Level 60): a shielded headliner that alternates a wide
  // tower-silencing "feedback screech" with crowd-surfer summons, and enrages
  // (faster cadence) below 40% HP.
  encorePhantom: {
    key: 'encorePhantom',
    name: 'The Encore Phantom',
    blurb: "Final boss: shielded, screeches towers silent and summons backup.",
    hp: 1500,
    speed: 1.1,
    armor: 3,
    reward: 600,
    damage: 6,
    color: 0xcc5de8,
    size: 1.7,
    erratic: false,
    shield: 400,
    boss: 'encorePhantom',
  },
};

/**
 * Tuning for boss abilities (driven by GameScene). Tower-disabling effects are
 * deliberately mild: combat is pure-passive now, so the player can't actively
 * counter a freeze/slow — these pressure rather than fully neutralize defenses.
 */
export const BOSS_CONFIG = {
  hecklerKing: { freezeRadiusTiles: 2, freezeDuration: 0.8, tauntInterval: 5 },
  micGrabber: { goldSteal: 10 },
  djWontStop: { spawnInterval: 3, spawnType: 'heckler' as EnemyTypeKey, spawnCount: 2 },
  talentJudge: {
    phase2Hp: 0.5,
    phase3Hp: 0.25,
    rusherType: 'stageRusher' as EnemyTypeKey,
    rusherCount: 6,
    attackSpeedFactor: 0.8,
  },
  encorePhantom: {
    screechRadiusTiles: 2.5,
    screechDuration: 1.0,
    abilityInterval: 4,
    summonType: 'crowdSurfer' as EnemyTypeKey,
    summonCount: 2,
    enrageHp: 0.4,
    enrageCadence: 0.6, // ability interval multiplier once enraged
  },
};
