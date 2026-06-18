import type { LevelId } from './levels';
import { CAMPAIGN } from './campaign';
import { TOWER_LIST, type TowerTypeKey } from './towers';
import type { DailyState } from './quests';
import {
  branchStarsSpent,
  TOWER_META_TREE,
  type TowerBranchKey,
} from './towerMeta';

// Re-exported so existing consumers (Tower, TowerManager, GameScene) keep
// importing the tower bonus from meta.ts — the implementation lives in towerMeta.
export { towerBonusFor, type TowerBonus } from './towerMeta';

/**
 * Meta-progression: a star you earn per level (best result kept) is a currency
 * you spend on permanent, account-wide upgrades. This module owns the upgrade
 * definitions, the persisted shape, and the small bit of star/effect math.
 */

export type MetaUpgradeKey =
  | 'startingGold'
  | 'cheaperTowers'
  | 'longerCombo'
  | 'allDamage'
  | 'goldIncome'
  | 'interest'
  | 'fameGain'
  | 'enemyWeaken';

/**
 * A node in the global Research tree. Tiers are bought with **Fame** (escalating
 * cost); tiers past `freeTiers` are gated behind a one-time **Star** unlock.
 */
export interface MetaUpgradeDef {
  key: MetaUpgradeKey;
  name: string;
  maxTier: number;
  /** Tiers buyable before the deep star gate. */
  freeTiers: number;
  /** Fame cost to buy `tier` (1-indexed). */
  fameCost: (tier: number) => number;
  /** Stars to unlock tiers beyond `freeTiers`. */
  deepStars: number;
  /** Effect description at a purchased tier (0 = not bought). */
  effectLabel: (tier: number) => string;
}

const fameCurve = (base: number) => (tier: number): number =>
  Math.round(base * Math.pow(1.7, tier - 1));

export const META_UPGRADES: MetaUpgradeDef[] = [
  { key: 'allDamage', name: 'Amplifier', maxTier: 10, freeTiers: 4, fameCost: fameCurve(200), deepStars: 3, effectLabel: (t) => `+${t * 4}% all tower damage` },
  { key: 'goldIncome', name: 'Merch Table', maxTier: 8, freeTiers: 4, fameCost: fameCurve(160), deepStars: 2, effectLabel: (t) => `+${t * 5}% gold from kills` },
  { key: 'startingGold', name: 'Opening Act Budget', maxTier: 8, freeTiers: 4, fameCost: fameCurve(100), deepStars: 2, effectLabel: (t) => `+${t * 6}% starting gold` },
  { key: 'interest', name: 'Royalties', maxTier: 6, freeTiers: 3, fameCost: fameCurve(180), deepStars: 2, effectLabel: (t) => `+${t * 2}% wave-clear interest` },
  { key: 'fameGain', name: 'Going Viral', maxTier: 8, freeTiers: 4, fameCost: fameCurve(220), deepStars: 3, effectLabel: (t) => `+${t * 5}% Fame earned` },
  { key: 'longerCombo', name: 'Crowd Memory', maxTier: 5, freeTiers: 3, fameCost: fameCurve(120), deepStars: 2, effectLabel: (t) => `Combo window +${(t * 0.3).toFixed(1)}s` },
  { key: 'cheaperTowers', name: 'Group Discount', maxTier: 6, freeTiers: 3, fameCost: fameCurve(150), deepStars: 2, effectLabel: (t) => `Towers cost ${t * 3}% less` },
  { key: 'enemyWeaken', name: 'Stage Fright', maxTier: 6, freeTiers: 2, fameCost: fameCurve(250), deepStars: 3, effectLabel: (t) => `Enemies −${t * 2}% HP` },
];

export const META_UPGRADE_BY_KEY: Record<MetaUpgradeKey, MetaUpgradeDef> =
  Object.fromEntries(META_UPGRADES.map((u) => [u.key, u])) as Record<
    MetaUpgradeKey,
    MetaUpgradeDef
  >;

/** Current purchased tier of a research node. */
export function researchTier(meta: MetaProgress, key: MetaUpgradeKey): number {
  return meta.upgrades?.[key] ?? 0;
}

/** Fame cost of the next tier, or null if maxed. */
export function nextResearchFameCost(def: MetaUpgradeDef, tier: number): number | null {
  return tier >= def.maxTier ? null : def.fameCost(tier + 1);
}

export function isResearchDeepUnlocked(meta: MetaProgress, key: MetaUpgradeKey): boolean {
  return meta.researchUnlocks?.[key] === true;
}

export type ResearchBlock = 'maxed' | 'needsDeepStar' | 'needFame' | null;

export function researchBuyBlock(meta: MetaProgress, def: MetaUpgradeDef): ResearchBlock {
  const tier = researchTier(meta, def.key);
  if (tier >= def.maxTier) return 'maxed';
  if (tier >= def.freeTiers && !isResearchDeepUnlocked(meta, def.key)) return 'needsDeepStar';
  if ((meta.fame ?? 0) < def.fameCost(tier + 1)) return 'needFame';
  return null;
}

/** Spend Fame to buy the next research tier. Returns true on success. */
export function buyResearchTier(meta: MetaProgress, key: MetaUpgradeKey): boolean {
  const def = META_UPGRADE_BY_KEY[key];
  if (researchBuyBlock(meta, def) !== null) return false;
  meta.fame -= def.fameCost(researchTier(meta, key) + 1);
  meta.upgrades[key] = researchTier(meta, key) + 1;
  return true;
}

/** Stars spent unlocking deep research tiers. */
export function researchStarsSpent(meta: MetaProgress): number {
  let spent = 0;
  for (const def of META_UPGRADES) {
    if (meta.researchUnlocks?.[def.key]) spent += def.deepStars;
  }
  return spent;
}

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
  /** Purchased tier per research node (0 = unowned). */
  upgrades: Record<MetaUpgradeKey, number>;
  /** Towers bought past the starting set. */
  unlockedTowers: Partial<Record<TowerTypeKey, boolean>>;
  /** Account-wide feature unlocks (e.g. 2× speed). */
  unlocks: Record<UnlockKey, boolean>;
  /** Soft grind currency — spent on branch levels + research tiers. */
  fame: number;
  /** Per-tower branch investment: towerBranches[tower][branch] = level. */
  towerBranches: Record<TowerTypeKey, Record<TowerBranchKey, number>>;
  /** Star-gated unlocks: `${tower}:${branch}` and `${tower}:${branch}:deep`. */
  branchUnlocks: Partial<Record<string, boolean>>;
  /** Per-branch "encore" upgrades (platinum-gated, doubles the branch effect). */
  branchEncore: Partial<Record<string, boolean>>;
  /** Star-gated deep-tier unlocks per research node. */
  researchUnlocks: Partial<Record<MetaUpgradeKey, boolean>>;
  /** Stars granted by migration (legacy fan-stars), counted as earned. */
  starGrant: number;
  /** Number of times the campaign has been prestiged ("Go Platinum"). */
  platinum: number;
  /** Prestige perks chosen, by key → times picked (stacks across prestiges). */
  platinumPerks: Partial<Record<PlatinumPerkKey, number>>;
  /** Claimed achievement ids. */
  achievements: Partial<Record<string, boolean>>;
  /** Epoch ms of the last menu visit (for offline-Fame on return). */
  lastSeen: number;
  /** Daily-quest + login-streak state (rolled on menu entry). */
  daily?: DailyState;
  /** Endless wave milestones already paid out (one-time Fame rewards). */
  endlessMilestones: number[];
  /** Cosmetic tower-skin keys owned, and the active one. */
  skinsOwned: string[];
  activeSkin: string;
  lifetime: LifetimeStats;

  // --- Legacy fields, read only during save migration (see storage.ts). ---
  /** @deprecated migrated into `fame`. */ fans?: number;
  /** @deprecated migrated into `starGrant`/`fame`. */ fanStars?: number;
  /** @deprecated migrated into `fame` + branch seeds. */ towerLevels?: Record<TowerTypeKey, number>;
}

function emptyUpgrades(): Record<MetaUpgradeKey, number> {
  return {
    startingGold: 0, cheaperTowers: 0, longerCombo: 0, allDamage: 0,
    goldIncome: 0, interest: 0, fameGain: 0, enemyWeaken: 0,
  };
}

function emptyBranches(): Record<TowerTypeKey, Record<TowerBranchKey, number>> {
  const out = {} as Record<TowerTypeKey, Record<TowerBranchKey, number>>;
  for (const t of TOWER_LIST) out[t.key] = { A: 0, B: 0, C: 0 };
  return out;
}

export function defaultMeta(): MetaProgress {
  const stars: Record<LevelId, number> = {};
  for (const level of CAMPAIGN) stars[level.id] = 0;
  return {
    stars,
    upgrades: emptyUpgrades(),
    unlockedTowers: {},
    unlocks: { speed2x: false },
    fame: 0,
    towerBranches: emptyBranches(),
    branchUnlocks: {},
    branchEncore: {},
    researchUnlocks: {},
    starGrant: 0,
    platinum: 0,
    platinumPerks: {},
    achievements: {},
    lastSeen: 0,
    endlessMilestones: [],
    skinsOwned: ['default'],
    activeSkin: 'default',
    lifetime: { kills: 0, waves: 0, highestCombo: 0 },
  };
}

// --- Prestige ("Go Platinum") ----------------------------------------------
//
// Once the campaign's final chapter is cleared, the player can prestige: reset
// campaign unlock progress (replay all 60 levels) for a permanent, stacking
// Fame + gold multiplier. Their build (Fame, branches, research, stars, unlocks)
// is kept — prestige is a long-horizon accelerator + flex, not a wipe.

/** Permanent Fame/gold multiplier from prestige count. */
export function platinumMult(meta: MetaProgress): number {
  return 1 + 0.15 * (meta.platinum ?? 0);
}

/**
 * Prestige perks — each Go Platinum lets the player pick one permanent perk;
 * picks stack across prestiges (`meta.platinumPerks[key]` = times chosen). The
 * effects fold into `metaModifiers`, giving prestige something to keep buying.
 */
export type PlatinumPerkKey = 'startGold' | 'damage' | 'combo' | 'cheaper';
export const PLATINUM_PERKS: { key: PlatinumPerkKey; label: string }[] = [
  { key: 'startGold', label: '+20% starting gold' },
  { key: 'damage', label: '+8% all tower damage' },
  { key: 'combo', label: 'Combo window +0.5s' },
  { key: 'cheaper', label: 'Towers 5% cheaper' },
];

/** Add Fame (the grind currency). Earned every run, win or loss. */
export function addFame(meta: MetaProgress, amount: number): void {
  meta.fame = (meta.fame ?? 0) + Math.max(0, Math.round(amount));
}

// (Per-tower RPG leveling now lives in towerMeta.ts — branching trees funded by
// Fame. `towerBonusFor`/`TowerBonus` are re-exported from there at the top.)

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

/**
 * Story level at which each tower auto-unlocks for free (so the campaign teaches
 * one new act at a time, and a tower's tutorial beat is always relevant). Stars
 * can still buy a tower earlier (see `isTowerUnlocked`).
 */
export const TOWER_STORY_UNLOCK: Record<TowerTypeKey, number> = {
  leadSinger: 1,
  drummer: 1,
  keyboardist: 3,
  bassPlayer: 5,
  backupSinger: 7,
  hypeMan: 9,
};

/** Bought-or-starting unlock (account-wide, persisted). */
export function isTowerUnlocked(meta: MetaProgress, key: TowerTypeKey): boolean {
  return STARTING_TOWERS.includes(key) || meta.unlockedTowers[key] === true;
}

/**
 * Whether a tower can be built now: starting/bought, OR the campaign has reached
 * its story-unlock level. `reachedLevel` is the 1-based level number the player
 * is on / has reached (pass a large number for endless = everything available).
 */
export function isTowerAvailable(
  meta: MetaProgress,
  reachedLevel: number,
  key: TowerTypeKey,
): boolean {
  return isTowerUnlocked(meta, key) || reachedLevel >= TOWER_STORY_UNLOCK[key];
}

// --- Feature unlocks -------------------------------------------------------

export const UNLOCK_COST: Record<UnlockKey, number> = { speed2x: 3 };
export const UNLOCK_NAME: Record<UnlockKey, string> = { speed2x: '2× Speed' };

export function isUnlocked(meta: MetaProgress, key: UnlockKey): boolean {
  return meta.unlocks?.[key] === true;
}

// --- Star economy ----------------------------------------------------------

export function maxTier(def: MetaUpgradeDef): number {
  return def.maxTier;
}

/** Stars earned from level ratings only (the campaign "collection" total). */
export function ratingStarsEarned(meta: MetaProgress): number {
  return Object.values(meta.stars).reduce((a, b) => a + b, 0);
}

/** Total spendable stars ever earned: level ratings + migrated legacy grant. */
export function totalStarsEarned(meta: MetaProgress): number {
  return ratingStarsEarned(meta) + (meta.starGrant ?? 0);
}

// --- Performer rank --------------------------------------------------------
//
// A long-horizon "career ladder" derived purely from total stars ever earned
// (monotonic — never decreases). No new storage; just a flavourful title shown
// on the menu + Records, giving a sense of growth beyond the spend economy.

export interface PerformerRank {
  min: number; // total stars to reach this rank
  title: string;
}

export const PERFORMER_RANKS: PerformerRank[] = [
  { min: 0, title: 'Open Mic Hopeful' },
  { min: 5, title: 'Regular' },
  { min: 12, title: 'Rising Act' },
  { min: 22, title: 'Local Favorite' },
  { min: 35, title: 'Headliner' },
  { min: 50, title: 'Chart-Topper' },
  { min: 70, title: 'Legend' },
];

/** The rank for a star total, plus the next rank's threshold (null if maxed). */
export function performerRank(stars: number): { rank: PerformerRank; next: PerformerRank | null } {
  let idx = 0;
  for (let i = 0; i < PERFORMER_RANKS.length; i++) {
    if (stars >= PERFORMER_RANKS[i].min) idx = i;
  }
  return { rank: PERFORMER_RANKS[idx], next: PERFORMER_RANKS[idx + 1] ?? null };
}

/**
 * Stars are the UNLOCK currency now: tower unlocks, branch + deep-tier gates,
 * research deep-tier gates, and feature unlocks. (Branch/research *levels* are
 * bought with Fame, not stars.)
 */
export function starsSpent(meta: MetaProgress): number {
  let spent = 0;
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
  // Branch unlocks + deep-tier gates, and research deep-tier gates.
  spent += branchStarsSpent(meta);
  spent += researchStarsSpent(meta);
  return spent;
}

export function starsAvailable(meta: MetaProgress): number {
  return Math.max(0, totalStarsEarned(meta) - starsSpent(meta));
}

// --- Star-spending unlocks (gates that open Fame-funded depth) -------------

/** Open a star-gated branch. Returns true if it was bought. */
export function unlockBranch(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): boolean {
  const b = TOWER_META_TREE[tower].branches.find((x) => x.key === branch);
  if (!b || b.unlockStars === 0) return false;
  const id = `${tower}:${branch}`;
  if (meta.branchUnlocks[id]) return false;
  if (starsAvailable(meta) < b.unlockStars) return false;
  meta.branchUnlocks[id] = true;
  return true;
}

/** Open a branch's deep tiers (past freeLevels). */
export function unlockBranchDeep(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): boolean {
  const b = TOWER_META_TREE[tower].branches.find((x) => x.key === branch);
  if (!b) return false;
  const id = `${tower}:${branch}:deep`;
  if (meta.branchUnlocks[id]) return false;
  if (starsAvailable(meta) < b.deepStars) return false;
  meta.branchUnlocks[id] = true;
  return true;
}

/** Open a research node's deep tiers. */
export function unlockResearchDeep(meta: MetaProgress, key: MetaUpgradeKey): boolean {
  const def = META_UPGRADE_BY_KEY[key];
  if (meta.researchUnlocks[key]) return false;
  if (starsAvailable(meta) < def.deepStars) return false;
  meta.researchUnlocks[key] = true;
  return true;
}

/** Effective run modifiers granted by the purchased research nodes. */
export function metaModifiers(meta: MetaProgress): {
  startingGoldMult: number;
  towerCostMult: number;
  comboWindowBonus: number;
  allDamageMult: number;
  goldMult: number;
  interestRate: number;
  fameGainMult: number;
  enemyHpMult: number;
} {
  const t = (k: MetaUpgradeKey) => meta.upgrades?.[k] ?? 0;
  const perk = (k: PlatinumPerkKey) => meta.platinumPerks?.[k] ?? 0;
  const plat = platinumMult(meta); // prestige boosts Fame + gold
  return {
    startingGoldMult: 1 + 0.06 * t('startingGold') + 0.2 * perk('startGold'),
    towerCostMult: Math.max(0.4, 1 - 0.03 * t('cheaperTowers') - 0.05 * perk('cheaper')),
    comboWindowBonus: 0.3 * t('longerCombo') + 0.5 * perk('combo'),
    allDamageMult: 1 + 0.04 * t('allDamage') + 0.08 * perk('damage'),
    goldMult: (1 + 0.05 * t('goldIncome')) * plat,
    interestRate: 0.1 + 0.02 * t('interest'),
    fameGainMult: (1 + 0.05 * t('fameGain')) * plat,
    enemyHpMult: 1 - 0.02 * t('enemyWeaken'),
  };
}
