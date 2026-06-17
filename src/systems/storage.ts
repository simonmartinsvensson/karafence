import type { LevelId } from '../data/levels';
import { defaultMeta, type MetaProgress } from '../data/meta';
import type { GameMode } from '../data/modes';
import type { TargetingStrategy, TowerTypeKey, UpgradePathKey } from '../data/towers';

/**
 * localStorage persistence. Independent slots:
 *  - meta  (`karafence:meta`): permanent star/upgrade/lifetime progression.
 *  - run   (`karafence:run:<mode>:<levelId>`): an in-progress run. Namespaced by
 *    mode so an endless run and a story run on the same map don't collide.
 *  - mode  (`karafence:mode`): the last-selected game mode.
 *  - endless best (`karafence:endless:best`): highest endless wave reached.
 *  - story (`karafence:story:progress`): which chapter/waves the campaign reached.
 * Every access is wrapped so a missing / disabled / corrupt store degrades to
 * sensible defaults rather than crashing the game.
 */

const META_KEY = 'karafence:meta:v1';
const RUN_PREFIX = 'karafence:run:v1:';
const AUDIO_KEY = 'karafence:audio:v1';
const HAPTICS_KEY = 'karafence:haptics:v1';
const SEEN_RANK_KEY = 'karafence:seenrank:v1';
const SEEN_CHAPTERS_KEY = 'karafence:seenchapters:v1';
const SEEN_SYNERGY_KEY = 'karafence:seensynergy:v1';
const UNLOCK_HIGH_WATER_KEY = 'karafence:maxchapters:v1';
const MODE_KEY = 'karafence:mode';
const ENDLESS_BEST_KEY = 'karafence:endless:best';
const STORY_KEY = 'karafence:story:progress';

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
  mode: GameMode;
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
  const saved = read<any>(META_KEY);
  const base = defaultMeta();
  if (!saved) return base;

  // Merge defensively so older / partial saves keep working.
  const meta: MetaProgress = {
    stars: { ...base.stars, ...saved.stars },
    upgrades: { ...base.upgrades, ...saved.upgrades },
    unlockedTowers: { ...base.unlockedTowers, ...saved.unlockedTowers },
    unlocks: { ...base.unlocks, ...saved.unlocks },
    fame: typeof saved.fame === 'number' ? saved.fame : 0,
    towerBranches: mergeBranches(base.towerBranches, saved.towerBranches),
    branchUnlocks: { ...saved.branchUnlocks },
    researchUnlocks: { ...saved.researchUnlocks },
    starGrant: typeof saved.starGrant === 'number' ? saved.starGrant : 0,
    platinum: typeof saved.platinum === 'number' ? saved.platinum : 0,
    platinumPerks: { ...saved.platinumPerks },
    achievements: { ...saved.achievements },
    lastSeen: typeof saved.lastSeen === 'number' ? saved.lastSeen : 0,
    daily: saved.daily,
    endlessMilestones: Array.isArray(saved.endlessMilestones) ? saved.endlessMilestones : [],
    lifetime: { ...base.lifetime, ...saved.lifetime },
  };

  // One-time migration from the pre-Fame save shape (had `fans`/`fanStars`/
  // `towerLevels`, no `fame`). Convert WITHOUT losing earned spend power:
  //  - leftover fan-meter progress → Fame
  //  - earned bonus stars (fanStars) → starGrant (still counts as earned stars)
  //  - old star-bought tower levels → a generous Fame refund (re-invest in the
  //    new branch trees). Stars only ever INCREASE across this migration since
  //    the new `starsSpent` no longer subtracts tower-level / global-tier costs.
  if (typeof saved.fame !== 'number') {
    meta.fame += saved.fans ?? 0;
    meta.starGrant = saved.fanStars ?? 0;
    const lv = (saved.towerLevels ?? {}) as Record<string, number>;
    for (const key of Object.keys(lv)) meta.fame += (lv[key] ?? 0) * 150;
  }
  return meta;
}

/** Ensure every tower has an {A,B,C} branch record, carrying saved levels. */
function mergeBranches(
  base: MetaProgress['towerBranches'],
  saved: any,
): MetaProgress['towerBranches'] {
  const out = { ...base } as MetaProgress['towerBranches'];
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(out) as (keyof typeof out)[]) {
      const s = saved[key];
      if (s) out[key] = { A: s.A ?? 0, B: s.B ?? 0, C: s.C ?? 0 };
    }
  }
  return out;
}

export function saveMeta(meta: MetaProgress): void {
  write(META_KEY, meta);
}

// --- Run save --------------------------------------------------------------

function runKey(mode: GameMode, levelId: LevelId): string {
  return `${RUN_PREFIX}${mode}:${levelId}`;
}

export function loadRun(mode: GameMode, levelId: LevelId): RunSave | null {
  return read<RunSave>(runKey(mode, levelId));
}

export function saveRun(run: RunSave): void {
  write(runKey(run.mode, run.levelId), run);
}

export function clearRun(mode: GameMode, levelId: LevelId): void {
  remove(runKey(mode, levelId));
}

export function hasRun(mode: GameMode, levelId: LevelId): boolean {
  return loadRun(mode, levelId) !== null;
}

// --- Active mode -----------------------------------------------------------

export function loadActiveMode(): GameMode {
  const m = read<GameMode>(MODE_KEY);
  return m === 'endless' || m === 'story' ? m : 'story';
}

export function saveActiveMode(mode: GameMode): void {
  write(MODE_KEY, mode);
}

// --- Endless best wave -----------------------------------------------------

export function loadEndlessBest(): number {
  const n = read<number>(ENDLESS_BEST_KEY);
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Persist a new endless best only if it beats the stored one. */
export function saveEndlessBest(wave: number): number {
  const best = Math.max(loadEndlessBest(), Math.floor(wave));
  write(ENDLESS_BEST_KEY, best);
  return best;
}

// --- Story progress --------------------------------------------------------

/** Campaign progress: the active chapter, chapters fully cleared, waves cleared. */
export interface StoryProgress {
  levelId: LevelId;
  completedChapters: LevelId[];
  wavesCleared: number;
}

export function loadStoryProgress(): StoryProgress | null {
  const p = read<Partial<StoryProgress>>(STORY_KEY);
  if (!p || typeof p.levelId !== 'string') return null;
  return {
    levelId: p.levelId,
    completedChapters: Array.isArray(p.completedChapters) ? p.completedChapters : [],
    wavesCleared: typeof p.wavesCleared === 'number' ? p.wavesCleared : 0,
  };
}

export function saveStoryProgress(progress: StoryProgress): void {
  write(STORY_KEY, progress);
}

export function clearStoryProgress(): void {
  remove(STORY_KEY);
}

// --- Audio settings --------------------------------------------------------

/** Master mute + volume (0-1), shared by every scene's audio. */
export interface AudioSettings {
  muted: boolean;
  volume: number;
}

export function loadAudio(): AudioSettings {
  const saved = read<Partial<AudioSettings>>(AUDIO_KEY);
  const volume =
    typeof saved?.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 0.7;
  return { muted: saved?.muted ?? false, volume };
}

export function saveAudio(settings: AudioSettings): void {
  write(AUDIO_KEY, settings);
}

// --- Haptics setting -------------------------------------------------------

/** Whether vibration feedback is enabled (Android). On by default. */
export function loadHaptics(): boolean {
  const v = read<boolean>(HAPTICS_KEY);
  return typeof v === 'boolean' ? v : true;
}

export function saveHaptics(enabled: boolean): void {
  write(HAPTICS_KEY, enabled);
}

// --- Performer rank seen (for the rank-up flourish) ------------------------

/** The performer-rank title last shown to the player (''=never). */
export function loadSeenRank(): string {
  return read<string>(SEEN_RANK_KEY) ?? '';
}

export function saveSeenRank(rank: string): void {
  write(SEEN_RANK_KEY, rank);
}

// --- Progressive-disclosure: chapters seen (for unlock reveal toasts) ------

/** Chapters-cleared count last reflected to the player (-1 = never). */
export function loadSeenChapters(): number {
  const n = read<number>(SEEN_CHAPTERS_KEY);
  return typeof n === 'number' ? n : -1;
}

export function saveSeenChapters(n: number): void {
  write(SEEN_CHAPTERS_KEY, n);
}

/**
 * High-water mark of chapters ever cleared — feature unlocks are derived from
 * this (never the live count) so prestige, which resets campaign progress to 0,
 * can't re-lock systems the player already earned. Monotonic; never decreases.
 */
export function loadUnlockHighWater(): number {
  const n = read<number>(UNLOCK_HIGH_WATER_KEY);
  return typeof n === 'number' ? n : 0;
}

export function saveUnlockHighWater(n: number): void {
  write(UNLOCK_HIGH_WATER_KEY, Math.max(n, loadUnlockHighWater()));
}

/** Whether the one-time tower-synergy explainer has been shown. */
export function loadSeenSynergyHint(): boolean {
  return read<boolean>(SEEN_SYNERGY_KEY) === true;
}

export function saveSeenSynergyHint(seen: boolean): void {
  write(SEEN_SYNERGY_KEY, seen);
}
