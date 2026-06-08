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
