import { ratingStarsEarned, addFame, type MetaProgress } from './meta';
import { TOWER_LIST } from './towers';
import { TOWER_META_TREE, branchLevel } from './towerMeta';
import { CHAPTER_ORDER } from './story';

/**
 * One-time goals that pay **Fame** when claimed — a completionist checklist that
 * points the grind somewhere. Everything is *computed* from state the game
 * already persists (ratings, lifetime stats, branches, endless best, prestige),
 * so no new tracking is needed; `meta.achievements[id]` only records the claim.
 */

export interface AchieveCtx {
  meta: MetaProgress;
  bestWave: number;
  completedChapters: string[];
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  fame: number;
  done: (c: AchieveCtx) => boolean;
}

const MAX_STARS = CHAPTER_ORDER.length * 3;

function anyBranchMaxed(meta: MetaProgress): boolean {
  return TOWER_LIST.some((t) =>
    TOWER_META_TREE[t.key].branches.some((b) => branchLevel(meta, t.key, b.key) >= b.maxLevel),
  );
}

function everyTowerInvested(meta: MetaProgress): boolean {
  return TOWER_LIST.every((t) =>
    TOWER_META_TREE[t.key].branches.some((b) => branchLevel(meta, t.key, b.key) > 0),
  );
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'openMic', name: 'Open Mic', desc: 'Clear your first level', fame: 50, done: (c) => c.completedChapters.length > 0 },
  { id: 'combo15', name: 'Pitch Perfect', desc: 'Hit a x15 combo', fame: 100, done: (c) => c.meta.lifetime.highestCombo >= 15 },
  { id: 'combo25', name: 'Show-Stopper', desc: 'Hit a x25 combo', fame: 220, done: (c) => c.meta.lifetime.highestCombo >= 25 },
  { id: 'kills1k', name: 'Crowd Control', desc: 'Silence 1,000 hecklers', fame: 120, done: (c) => c.meta.lifetime.kills >= 1000 },
  { id: 'kills10k', name: 'Sold Out', desc: 'Silence 10,000 hecklers', fame: 450, done: (c) => c.meta.lifetime.kills >= 10000 },
  { id: 'waves150', name: 'Seasoned Act', desc: 'Survive 150 total waves', fame: 160, done: (c) => c.meta.lifetime.waves >= 150 },
  { id: 'endless20', name: 'Marathon', desc: 'Reach Endless wave 20', fame: 160, done: (c) => c.bestWave >= 20 },
  { id: 'endless40', name: 'Iron Lungs', desc: 'Reach Endless wave 40', fame: 450, done: (c) => c.bestWave >= 40 },
  { id: 'specialist', name: 'Specialist', desc: 'Max any tower branch', fame: 200, done: (c) => anyBranchMaxed(c.meta) },
  { id: 'renaissance', name: 'Renaissance', desc: 'Invest in every tower', fame: 180, done: (c) => everyTowerInvested(c.meta) },
  { id: 'perfectPitch', name: 'Perfect Pitch', desc: `Earn all ${MAX_STARS} ★`, fame: 700, done: (c) => ratingStarsEarned(c.meta) >= MAX_STARS },
  { id: 'platinum', name: 'Platinum Record', desc: 'Go Platinum once', fame: 500, done: (c) => (c.meta.platinum ?? 0) >= 1 },
];

export function isAchieved(a: Achievement, ctx: AchieveCtx): boolean {
  return a.done(ctx);
}
export function isClaimed(meta: MetaProgress, id: string): boolean {
  return meta.achievements?.[id] === true;
}

/** Claim an unlocked-but-unclaimed achievement: grant Fame, mark claimed. */
export function claimAchievement(a: Achievement, ctx: AchieveCtx): boolean {
  if (!isAchieved(a, ctx) || isClaimed(ctx.meta, a.id)) return false;
  addFame(ctx.meta, a.fame);
  ctx.meta.achievements[a.id] = true;
  return true;
}

/** Count of unclaimed-but-earned achievements (for a menu badge). */
export function claimableCount(ctx: AchieveCtx): number {
  return ACHIEVEMENTS.filter((a) => isAchieved(a, ctx) && !isClaimed(ctx.meta, a.id)).length;
}
