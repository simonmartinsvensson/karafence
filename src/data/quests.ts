import type { GameMode } from './modes';

/**
 * Daily quests + login streak — the "come back tomorrow" hook. Everything pays
 * out in **fans** (the single meter, see meta.ts), so this adds a return loop
 * without a new currency or screen: two per-day quests + a streak, shown in the
 * Records modal, evaluated from each run's stats at run end. Pure logic/data.
 */

export interface RunStats {
  mode: GameMode;
  won: boolean;
  wavesReached: number;
  livesLost: number; // singer-HP damage taken (0-30)
  bestCombo: number;
  kills: number;
}

export interface QuestDef {
  id: string;
  label: string;
  reward: number; // fans
  /** Did a single run satisfy this quest? */
  satisfied: (r: RunStats) => boolean;
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'wave10', label: 'Reach wave 10 in a run', reward: 120, satisfied: (r) => r.wavesReached >= 10 },
  { id: 'wave18', label: 'Reach wave 18 in a run', reward: 200, satisfied: (r) => r.wavesReached >= 18 },
  { id: 'combo8', label: 'Hit a x8 Crowd Hype combo', reward: 100, satisfied: (r) => r.bestCombo >= 8 },
  { id: 'combo15', label: 'Hit a x15 combo', reward: 170, satisfied: (r) => r.bestCombo >= 15 },
  { id: 'flawless', label: 'Win a level losing ≤2 lives', reward: 150, satisfied: (r) => r.won && r.livesLost <= 2 },
  { id: 'kills60', label: 'Silence 60 hecklers in a run', reward: 120, satisfied: (r) => r.kills >= 60 },
  { id: 'endless12', label: 'Survive 12 Endless waves', reward: 140, satisfied: (r) => r.mode === 'endless' && r.wavesReached >= 12 },
];

const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUEST_POOL.map((q) => [q.id, q]),
);
export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID[id];
}

export interface DailyQuest {
  id: string;
  done: boolean;
}
export interface DailyState {
  date: string; // local YYYY-M-D this set was rolled for
  streak: number;
  quests: DailyQuest[];
  /** Set once the first won run of the day has paid its bonus. */
  firstWinClaimed?: boolean;
}

/** Bonus fans for the first won run each day. */
export const FIRST_WIN_FANS = 80;

/** Local date key (game runs in the browser, so wall-clock is fine here). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function yesterdayKey(d: Date): string {
  const y = new Date(d.getTime() - 86400000);
  return dateKey(y);
}

/** Two distinct quests chosen deterministically from the pool by date. */
export function pickDailyQuests(date: string, count = 2): DailyQuest[] {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = (Math.imul(h ^ date.charCodeAt(i), 16777619)) >>> 0;
  const picks = new Set<number>();
  let k = h || 1;
  while (picks.size < Math.min(count, QUEST_POOL.length)) {
    picks.add(k % QUEST_POOL.length);
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
  }
  return [...picks].map((i) => ({ id: QUEST_POOL[i].id, done: false }));
}

export const STREAK_FAN_BASE = 30; // ×min(streak, 5) granted on a new-day login

/**
 * Roll the daily set for `today` (no-op if already current). Updates the streak
 * (consecutive days +1, otherwise reset to 1). Returns the new state + the
 * streak-login fan bonus to bank (0 if it's the same day).
 */
export function rollDaily(
  prev: DailyState | undefined,
  today: string,
  yesterday: string,
): { state: DailyState; loginFans: number } {
  if (prev && prev.date === today) return { state: prev, loginFans: 0 };
  const streak = prev ? (prev.date === yesterday ? prev.streak + 1 : 1) : 1;
  return {
    state: { date: today, streak, quests: pickDailyQuests(today) },
    loginFans: STREAK_FAN_BASE * Math.min(streak, 5),
  };
}
