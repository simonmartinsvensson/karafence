import type { LevelId } from '../data/levels';
import { defaultMeta, type MetaProgress } from '../data/meta';
import type { TargetingStrategy, TowerTypeKey, UpgradePathKey } from '../data/towers';

/**
 * localStorage persistence. Two independent slots:
 *  - meta  (`karafence:meta`): permanent star/upgrade/lifetime progression.
 *  - run   (`karafence:run:<levelId>`): an in-progress run for that level.
 * Every access is wrapped so a missing / disabled / corrupt store degrades to
 * sensible defaults rather than crashing the game.
 */

const META_KEY = 'karafence:meta:v1';
const RUN_PREFIX = 'karafence:run:v1:';

/** One placed tower, captured for resume. */
export interface TowerSave {
  type: TowerTypeKey;
  col: number;
  row: number;
  tiers: Record<UpgradePathKey, number>;
  targeting: TargetingStrategy;
  totalSpent: number;
}

/** A resumable run. Resumes by replaying `resumeWaveIndex` from its start. */
export interface RunSave {
  levelId: LevelId;
  resumeWaveIndex: number;
  gold: number;
  singerHp: number;
  goldSpent: number;
  highestCombo: number;
  towers: TowerSave[];
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / disabled (private mode): play on without persistence.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// --- Meta progression ------------------------------------------------------

export function loadMeta(): MetaProgress {
  const saved = read<Partial<MetaProgress>>(META_KEY);
  const base = defaultMeta();
  if (!saved) return base;
  // Merge defensively so older / partial saves keep working.
  return {
    stars: { ...base.stars, ...saved.stars },
    upgrades: { ...base.upgrades, ...saved.upgrades },
    lifetime: { ...base.lifetime, ...saved.lifetime },
  };
}

export function saveMeta(meta: MetaProgress): void {
  write(META_KEY, meta);
}

// --- Run save --------------------------------------------------------------

function runKey(levelId: LevelId): string {
  return `${RUN_PREFIX}${levelId}`;
}

export function loadRun(levelId: LevelId): RunSave | null {
  return read<RunSave>(runKey(levelId));
}

export function saveRun(run: RunSave): void {
  write(runKey(run.levelId), run);
}

export function clearRun(levelId: LevelId): void {
  remove(runKey(levelId));
}

export function hasRun(levelId: LevelId): boolean {
  return loadRun(levelId) !== null;
}
