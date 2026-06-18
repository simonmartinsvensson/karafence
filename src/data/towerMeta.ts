import { TOWER_LIST, type TowerTypeKey } from './towers';
import type { MetaProgress } from './meta';

/**
 * Permanent, account-wide **branching upgrade trees** per tower (the RPG meta
 * layer). Each tower has 2-3 branches; you spend **Fame** (the grind currency)
 * to raise a branch's level, with escalating costs, and some branches/deep tiers
 * are gated behind a **Star** unlock (campaign progress). Maxing a branch grants
 * a permanent **capstone** effect. Investment is resettable (respec, full Fame
 * refund) so builds can be re-pathed across runs.
 *
 * Effects apply at placement via `towerBonusFor` → TowerManager → Tower.baseStats
 * (the same path the old single-level system used). Axes map to the stats Tower
 * already understands; capstones reuse Tower's existing effect flags.
 */

export type TowerBranchKey = 'A' | 'B' | 'C';
export type BranchAxis = 'damage' | 'range' | 'attackSpeed' | 'aura';

/** A permanent effect granted when a branch is maxed (mirrors run-upgrade flags). */
export type CapstoneFlag =
  | { kind: 'pierce'; value: number }
  | { kind: 'multiTarget'; value: number }
  | { kind: 'doubleFire' }
  | { kind: 'slowOnHit'; factor: number; duration: number }
  | { kind: 'stunOnHit'; duration: number };

export interface TowerBranch {
  key: TowerBranchKey;
  name: string;
  axis: BranchAxis;
  /** Per-level magnitude (mult step for damage/attackSpeed/aura, +tiles for range). */
  perLevel: number;
  maxLevel: number;
  /** Levels buyable before the deep star gate. */
  freeLevels: number;
  /** Fame cost base; cost(level) = round(fameBase · 1.6^(level-1)). */
  fameBase: number;
  /** Stars to open the branch at all (0 = open from the start). */
  unlockStars: number;
  /** Stars to open levels beyond `freeLevels`. */
  deepStars: number;
  /** Effect granted at max level. */
  capstone?: { label: string; flag: CapstoneFlag };
}

export interface TowerMetaDef {
  branches: TowerBranch[];
}

/** Aggregated permanent combat bonus a tower carries from its branch levels. */
export interface TowerBonus {
  damageMult: number;
  rangeAdd: number;
  attackSpeedMult: number;
  /** Support aura strength multiplier (Backup Singer / Hype Man). */
  auraMult: number;
  /** Permanent capstone effects from maxed branches. */
  capstones: CapstoneFlag[];
}

export const NO_BONUS: TowerBonus = {
  damageMult: 1,
  rangeAdd: 0,
  attackSpeedMult: 1,
  auraMult: 1,
  capstones: [],
};

export const TOWER_META_TREE: Record<TowerTypeKey, TowerMetaDef> = {
  leadSinger: {
    branches: [
      { key: 'A', name: 'Belt', axis: 'damage', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 120, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Stage Presence', axis: 'range', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 90, unlockStars: 0, deepStars: 2 },
      { key: 'C', name: 'Piercing Note', axis: 'attackSpeed', perLevel: 0.06, maxLevel: 4, freeLevels: 2, fameBase: 150, unlockStars: 2, deepStars: 2, capstone: { label: 'Always pierces 3', flag: { kind: 'pierce', value: 3 } } },
    ],
  },
  drummer: {
    branches: [
      { key: 'A', name: 'Bigger Kit', axis: 'damage', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 120, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Blast Beat', axis: 'attackSpeed', perLevel: 0.07, maxLevel: 5, freeLevels: 3, fameBase: 100, unlockStars: 0, deepStars: 2 },
      { key: 'C', name: 'Drum Solo', axis: 'damage', perLevel: 0.08, maxLevel: 4, freeLevels: 2, fameBase: 150, unlockStars: 2, deepStars: 2, capstone: { label: 'Hits stun briefly', flag: { kind: 'stunOnHit', duration: 0.6 } } },
    ],
  },
  keyboardist: {
    branches: [
      { key: 'A', name: 'Power Chords', axis: 'damage', perLevel: 0.11, maxLevel: 5, freeLevels: 3, fameBase: 120, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Long Reach', axis: 'range', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 90, unlockStars: 0, deepStars: 2 },
      { key: 'C', name: 'Deep Freeze', axis: 'attackSpeed', perLevel: 0.06, maxLevel: 4, freeLevels: 2, fameBase: 150, unlockStars: 3, deepStars: 2, capstone: { label: 'Hits slow the crowd', flag: { kind: 'slowOnHit', factor: 0.2, duration: 2 } } },
    ],
  },
  bassPlayer: {
    branches: [
      { key: 'A', name: 'Sub Bass', axis: 'damage', perLevel: 0.12, maxLevel: 5, freeLevels: 3, fameBase: 120, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Tight Strings', axis: 'attackSpeed', perLevel: 0.08, maxLevel: 5, freeLevels: 3, fameBase: 100, unlockStars: 0, deepStars: 2 },
      { key: 'C', name: 'Shockwave', axis: 'range', perLevel: 0.12, maxLevel: 4, freeLevels: 2, fameBase: 150, unlockStars: 2, deepStars: 2, capstone: { label: 'Blast hits 3 at once', flag: { kind: 'multiTarget', value: 3 } } },
    ],
  },
  // Support towers don't fire — their branches widen + strengthen the aura.
  backupSinger: {
    branches: [
      { key: 'A', name: 'Wider Stage', axis: 'range', perLevel: 0.12, maxLevel: 5, freeLevels: 3, fameBase: 110, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Stronger Harmony', axis: 'aura', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 130, unlockStars: 0, deepStars: 2 },
    ],
  },
  hypeMan: {
    branches: [
      { key: 'A', name: 'Bigger Crowd', axis: 'range', perLevel: 0.12, maxLevel: 5, freeLevels: 3, fameBase: 120, unlockStars: 0, deepStars: 2 },
      { key: 'B', name: 'Louder Hype', axis: 'aura', perLevel: 0.1, maxLevel: 5, freeLevels: 3, fameBase: 140, unlockStars: 0, deepStars: 2 },
    ],
  },
};

export const RESPEC_REFUND = 1; // full Fame refund on respec

function branchOf(tower: TowerTypeKey, branch: TowerBranchKey): TowerBranch | undefined {
  return TOWER_META_TREE[tower].branches.find((b) => b.key === branch);
}

export function branchLevel(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): number {
  return meta.towerBranches?.[tower]?.[branch] ?? 0;
}

/** Fame cost to buy `level` (1-indexed) of a branch. */
export function branchFameCost(b: TowerBranch, level: number): number {
  return Math.round(b.fameBase * Math.pow(1.6, level - 1));
}

export function isBranchUnlocked(meta: MetaProgress, tower: TowerTypeKey, b: TowerBranch): boolean {
  return b.unlockStars === 0 || meta.branchUnlocks?.[`${tower}:${b.key}`] === true;
}

export function isBranchDeepUnlocked(meta: MetaProgress, tower: TowerTypeKey, b: TowerBranch): boolean {
  return meta.branchUnlocks?.[`${tower}:${b.key}:deep`] === true;
}

export type BuyBlock = 'maxed' | 'locked' | 'needsDeepStar' | 'needFame' | null;

/** Why (if at all) the next branch level can't be bought right now. */
export function branchBuyBlock(
  meta: MetaProgress,
  tower: TowerTypeKey,
  b: TowerBranch,
  fame: number,
): BuyBlock {
  const lvl = branchLevel(meta, tower, b.key);
  if (lvl >= b.maxLevel) return 'maxed';
  if (!isBranchUnlocked(meta, tower, b)) return 'locked';
  if (lvl >= b.freeLevels && !isBranchDeepUnlocked(meta, tower, b)) return 'needsDeepStar';
  if (fame < branchFameCost(b, lvl + 1)) return 'needFame';
  return null;
}

// --- Encore: a platinum-gated boost beyond a maxed branch (doubles its effect) ---

export function isBranchEncore(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): boolean {
  return meta.branchEncore?.[`${tower}:${branch}`] === true;
}

/** Fame cost of a branch's encore (continues the level curve, ~2.5× the last). */
export function branchEncoreCost(b: TowerBranch): number {
  return branchFameCost(b, b.maxLevel + 2);
}

/** Whether the encore can be bought now (maxed + prestiged + not yet owned). */
export function canBuyEncore(meta: MetaProgress, tower: TowerTypeKey, b: TowerBranch): boolean {
  return (
    branchLevel(meta, tower, b.key) >= b.maxLevel &&
    (meta.platinum ?? 0) > 0 &&
    !isBranchEncore(meta, tower, b.key)
  );
}

/** Spend Fame to buy a branch's encore. Returns true on success. */
export function buyBranchEncore(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): boolean {
  const b = branchOf(tower, branch);
  if (!b || !canBuyEncore(meta, tower, b)) return false;
  const cost = branchEncoreCost(b);
  if (meta.fame < cost) return false;
  meta.fame -= cost;
  (meta.branchEncore ??= {})[`${tower}:${branch}`] = true;
  return true;
}

/** Spend Fame to raise a branch one level. Returns true on success. */
export function buyBranchLevel(meta: MetaProgress, tower: TowerTypeKey, branch: TowerBranchKey): boolean {
  const b = branchOf(tower, branch);
  if (!b) return false;
  if (branchBuyBlock(meta, tower, b, meta.fame) !== null) return false;
  const lvl = branchLevel(meta, tower, b.key);
  meta.fame -= branchFameCost(b, lvl + 1);
  (meta.towerBranches[tower] ??= { A: 0, B: 0, C: 0 })[branch] = lvl + 1;
  return true;
}

/** Total Fame currently sunk into a tower's branches (basis for respec refund). */
export function towerFameInvested(meta: MetaProgress, tower: TowerTypeKey): number {
  let sum = 0;
  for (const b of TOWER_META_TREE[tower].branches) {
    const lvl = branchLevel(meta, tower, b.key);
    for (let l = 1; l <= lvl; l++) sum += branchFameCost(b, l);
    if (isBranchEncore(meta, tower, b.key)) sum += branchEncoreCost(b);
  }
  return sum;
}

/** Refund a tower's branch Fame and reset its levels. Returns Fame restored. */
export function respecTower(meta: MetaProgress, tower: TowerTypeKey): number {
  const refund = Math.round(towerFameInvested(meta, tower) * RESPEC_REFUND);
  meta.fame += refund;
  meta.towerBranches[tower] = { A: 0, B: 0, C: 0 };
  for (const b of TOWER_META_TREE[tower].branches) delete meta.branchEncore?.[`${tower}:${b.key}`];
  return refund;
}

/** Stars spent on branch + deep-tier unlocks (for the star ledger). */
export function branchStarsSpent(meta: MetaProgress): number {
  let spent = 0;
  for (const t of TOWER_LIST) {
    for (const b of TOWER_META_TREE[t.key].branches) {
      if (b.unlockStars > 0 && meta.branchUnlocks?.[`${t.key}:${b.key}`]) spent += b.unlockStars;
      if (meta.branchUnlocks?.[`${t.key}:${b.key}:deep`]) spent += b.deepStars;
    }
  }
  return spent;
}

/** The aggregated permanent bonus a tower gets from its current branch levels. */
export function towerBonusFor(meta: MetaProgress, key: TowerTypeKey): TowerBonus {
  const def = TOWER_META_TREE[key];
  let damageMult = 1;
  let rangeAdd = 0;
  let attackSpeedMult = 1;
  let auraMult = 1;
  const capstones: CapstoneFlag[] = [];
  if (def) {
    for (const b of def.branches) {
      const lvl = branchLevel(meta, key, b.key);
      if (lvl <= 0) continue;
      // Encore (platinum-gated, branch maxed) doubles this branch's contribution.
      const f = lvl >= b.maxLevel && isBranchEncore(meta, key, b.key) ? 2 : 1;
      if (b.axis === 'damage') damageMult *= 1 + b.perLevel * lvl * f;
      else if (b.axis === 'range') rangeAdd += b.perLevel * lvl * f;
      else if (b.axis === 'attackSpeed') attackSpeedMult *= 1 + b.perLevel * lvl * f;
      else if (b.axis === 'aura') auraMult *= 1 + b.perLevel * lvl * f;
      if (b.capstone && lvl >= b.maxLevel) capstones.push(b.capstone.flag);
    }
  }
  return { damageMult, rangeAdd, attackSpeedMult, auraMult, capstones };
}
