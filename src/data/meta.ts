import type { LevelId } from './levels';
import { CAMPAIGN } from './campaign';

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

/** The full persisted meta-progression blob. */
export interface MetaProgress {
  /** Best star rating (0-3) achieved per level. */
  stars: Record<LevelId, number>;
  /** Purchased tier per meta-upgrade (0 = unowned). */
  upgrades: Record<MetaUpgradeKey, number>;
  lifetime: LifetimeStats;
}

export function defaultMeta(): MetaProgress {
  const stars: Record<LevelId, number> = {};
  for (const level of CAMPAIGN) stars[level.id] = 0;
  return {
    stars,
    upgrades: { startingGold: 0, cheaperTowers: 0, longerCombo: 0 },
    lifetime: { kills: 0, waves: 0, highestCombo: 0 },
  };
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
  for (const def of META_UPGRADES) {
    const tier = meta.upgrades[def.key] ?? 0;
    for (let i = 0; i < tier; i++) spent += def.tierCosts[i];
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
