import { loadStoryProgress, loadUnlockHighWater } from '../systems/storage';

/**
 * Progressive disclosure: the game starts simple and reveals systems as the
 * player advances through the **story campaign** (chapters cleared is the
 * natural onboarding spine). Each feature unlocks at a chapters-cleared
 * threshold; unlock state is *derived* (no extra save data, monotonic), so an
 * existing save with lots of progress simply sees everything already unlocked.
 *
 * `prestige` is intentionally NOT here — it stays gated by `campaignComplete()`
 * (all chapters) in MenuScene.
 */
// Features are added here as each rollout phase actually gates them, so a reveal
// toast never announces something that isn't really there yet.
export type Feature =
  | 'fame' // Fame economy: the menu meter, rank/stars header, offline/streak
  | 'research' // the Upgrades button + Research tab
  | 'branches' // the Upgrades → Towers (per-tower branch) tab
  | 'endless' // the Endless mode card
  | 'records' // the Records / Goals button
  | 'dailies' // daily quests + Tonight's Setlist
  | 'synergies' // tower adjacency synergies
  | 'boons'; // between-wave "encore boon" choices

/** Chapters cleared required to unlock each feature. */
export const FEATURE_UNLOCK: Record<Feature, number> = {
  fame: 1,
  research: 1,
  branches: 3,
  endless: 5,
  records: 6,
  dailies: 8,
  synergies: 12,
  boons: 15,
};

/** Short label shown in the "🔓 New: …" reveal toast when a feature unlocks. */
export const FEATURE_LABEL: Record<Feature, string> = {
  fame: 'Fame & Upgrades',
  research: 'Research upgrades',
  branches: 'Tower branch trees',
  endless: 'Endless Mode',
  records: 'Records & Goals',
  dailies: 'Daily quests & Setlist',
  synergies: 'Tower synergies',
  boons: 'Encore boons (between waves)',
};

export function chaptersCleared(): number {
  // Monotonic: max of the live count and the all-time high-water mark, so
  // unlocks never regress when prestige resets campaign progress to 0.
  const live = loadStoryProgress()?.completedChapters.length ?? 0;
  return Math.max(live, loadUnlockHighWater());
}

export function isFeatureUnlocked(feature: Feature, cleared: number = chaptersCleared()): boolean {
  return cleared >= FEATURE_UNLOCK[feature];
}

/** Features whose threshold was crossed when going from `prev`→`now` cleared. */
export function featuresUnlockedBetween(prev: number, now: number): Feature[] {
  return (Object.keys(FEATURE_UNLOCK) as Feature[]).filter(
    (f) => FEATURE_UNLOCK[f] > prev && FEATURE_UNLOCK[f] <= now,
  );
}
