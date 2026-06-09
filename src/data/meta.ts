import type { LevelId } from './levels';
import { CAMPAIGN } from './campaign';
import { TOWER_LIST, type TowerTypeKey } from './towers';

/**
 * Meta-progression: a star you earn per level (best result kept) is a currency
 * you spend on permanent, account-wide upgrades. This module owns the upgrade
 * definitions, the persisted shape, and the small bit of star/effect math.
 */

export type MetaUpgradeKey = 'startingGold' | 'cheaperTowers' | 'longerCombo';

export interface MetaUpgradeDef {
  key: MetaUpgradeKey;
  name: string;
  /** Star cost of each tier, in order. Length = max tier. */
  tierCosts: number[];
  /** Effect description at a given purchased tier (0 = not bought). */
  effectLabel: (tier: number) => string;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    key: 'startingGold',
    name: 'Opening Act Budget',
    tierCosts: [1, 1, 2],
    effectLabel: (t) => `+${t * 5}% starting gold`,
  },
  {
    key: 'cheaperTowers',
    name: 'Group Discount',
    tierCosts: [1, 2],
    effectLabel: (t) => `Towers cost ${t * 5}% less`,
  },
  {
    key: 'longerCombo',
    name: 'Crowd Memory',
    tierCosts: [1, 2],
    effectLabel: (t) => `Combo window +${(t * 0.5).toFixed(1)}s`,
  },
];

export const META_UPGRADE_BY_KEY: Record<MetaUpgradeKey, MetaUpgradeDef> =
  Object.fromEntries(META_UPGRADES.map((u) => [u.key, u])) as Record<
    MetaUpgradeKey,
    MetaUpgradeDef
  >;

export interface LifetimeStats {
  kills: number;
  waves: number;
  highestCombo: number;
}

/** Account-wide unlock flags bought with stars. */
export type UnlockKey = 'speed2x';

/** The full persisted meta-progression blob. */
export interface MetaProgress {
  /** Best star rating (0-3) achieved per level. */
  stars: Record<LevelId, number>;
  /** Purchased tier per meta-upgrade (0 = unowned). */
  upgrades: Record<MetaUpgradeKey, number>;
  /** Permanent per-tower upgrade level (RPG leveling), 0..TOWER_MAX_LEVEL. */
  towerLevels: Record<TowerTypeKey, number>;
  /** Towers bought past the starting set. */
  unlockedTowers: Partial<Record<TowerTypeKey, boolean>>;
  /** Account-wide feature unlocks (e.g. 2× speed). */
  unlocks: Record<UnlockKey, boolean>;
  lifetime: LifetimeStats;
}

export function defaultMeta(): MetaProgress {
  const stars: Record<LevelId, number> = {};
  for (const level of CAMPAIGN) stars[level.id] = 0;
  const towerLevels = {} as Record<TowerTypeKey, number>;
  for (const t of TOWER_LIST) towerLevels[t.key] = 0;
  return {
    stars,
    upgrades: { startingGold: 0, cheaperTowers: 0, longerCombo: 0 },
    towerLevels,
    unlockedTowers: {},
    unlocks: { speed2x: false },
    lifetime: { kills: 0, waves: 0, highestCombo: 0 },
  };
}

// --- Tower RPG leveling ----------------------------------------------------

export const TOWER_MAX_LEVEL = 5;

/** Star cost to go from `level` to `level+1`, or null if maxed. */
export function towerUpgradeCost(level: number): number | null {
  if (level >= TOWER_MAX_LEVEL) return null;
  return level + 1; // 1, 2, 3, 4, 5 (cumulative 15 to max a tower)
}

export interface TowerBonus {
  damageMult: number;
  rangeAdd: number;
  attackSpeedMult: number;
}

/** Permanent combat bonus a tower gets from its meta level. */
export function towerBonus(level: number): TowerBonus {
  return {
    damageMult: 1 + 0.12 * level,
    rangeAdd: 0.12 * level,
    attackSpeedMult: 1 + 0.08 * level,
  };
}

export function towerBonusFor(meta: MetaProgress, key: TowerTypeKey): TowerBonus {
  return towerBonus(meta.towerLevels[key] ?? 0);
}

export function towerUpgradeEffectLabel(level: number): string {
  const b = towerBonus(level);
  return `+${Math.round((b.damageMult - 1) * 100)}% dmg · +${b.rangeAdd.toFixed(2)} range · +${Math.round((b.attackSpeedMult - 1) * 100)}% rate`;
}

// --- Tower unlocks ---------------------------------------------------------

/** Towers available from the very start; the rest are bought with stars. */
export const STARTING_TOWERS: TowerTypeKey[] = ['leadSinger', 'drummer'];

export const TOWER_UNLOCK_COST: Record<TowerTypeKey, number> = {
  leadSinger: 0,
  drummer: 0,
  keyboardist: 2,
  bassPlayer: 3,
  backupSinger: 3,
  hypeMan: 4,
};

export function isTowerUnlocked(meta: MetaProgress, key: TowerTypeKey): boolean {
  return STARTING_TOWERS.includes(key) || meta.unlockedTowers[key] === true;
}

// --- Feature unlocks -------------------------------------------------------

export const UNLOCK_COST: Record<UnlockKey, number> = { speed2x: 3 };
export const UNLOCK_NAME: Record<UnlockKey, string> = { speed2x: '2× Speed' };

export function isUnlocked(meta: MetaProgress, key: UnlockKey): boolean {
  return meta.unlocks?.[key] === true;
}

// --- Star economy ----------------------------------------------------------

export function maxTier(def: MetaUpgradeDef): number {
  return def.tierCosts.length;
}

/** Star cost to buy the next tier, or null if already maxed. */
export function nextTierCost(def: MetaUpgradeDef, currentTier: number): number | null {
  if (currentTier >= maxTier(def)) return null;
  return def.tierCosts[currentTier];
}

export function totalStarsEarned(meta: MetaProgress): number {
  return Object.values(meta.stars).reduce((a, b) => a + b, 0);
}

export function starsSpent(meta: MetaProgress): number {
  let spent = 0;
  // Global tiered upgrades.
  for (const def of META_UPGRADES) {
    const tier = meta.upgrades[def.key] ?? 0;
    for (let i = 0; i < tier; i++) spent += def.tierCosts[i];
  }
  // Per-tower leveling (cumulative 1+2+...+level).
  for (const t of TOWER_LIST) {
    const level = meta.towerLevels?.[t.key] ?? 0;
    spent += (level * (level + 1)) / 2;
  }
  // Tower unlocks.
  for (const t of TOWER_LIST) {
    if (!STARTING_TOWERS.includes(t.key) && meta.unlockedTowers?.[t.key]) {
      spent += TOWER_UNLOCK_COST[t.key];
    }
  }
  // Feature unlocks.
  for (const key of Object.keys(UNLOCK_COST) as UnlockKey[]) {
    if (meta.unlocks?.[key]) spent += UNLOCK_COST[key];
  }
  return spent;
}

export function starsAvailable(meta: MetaProgress): number {
  return Math.max(0, totalStarsEarned(meta) - starsSpent(meta));
}

/** Effective run modifiers granted by the purchased meta-upgrades. */
export function metaModifiers(meta: MetaProgress): {
  startingGoldMult: number;
  towerCostMult: number;
  comboWindowBonus: number;
} {
  return {
    startingGoldMult: 1 + 0.05 * (meta.upgrades.startingGold ?? 0),
    towerCostMult: 1 - 0.05 * (meta.upgrades.cheaperTowers ?? 0),
    comboWindowBonus: 0.5 * (meta.upgrades.longerCombo ?? 0),
  };
}
