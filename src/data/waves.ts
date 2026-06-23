import type { BossKind, EnemyTypeKey } from './enemies';

/**
 * Waves are generated from a per-level `WaveProfile` (carried on each campaign
 * map; endless uses `ENDLESS_PROFILE`). A profile drives how many waves the
 * level has, how many enemies each wave spawns, how fast hp/speed scale, which
 * enemy types appear, and how often a boss arrives. This keeps the whole
 * difficulty curve data-driven and tunable in one place.
 */

export interface SpawnGroup {
  type: EnemyTypeKey;
  count: number;
  /** Milliseconds between spawns within this group. */
  delay: number;
  /** Boss / fixed-count groups set this so count is not re-derived. */
  noScale?: boolean;
}

export interface WaveDef {
  groups: SpawnGroup[];
}

export interface WaveProfile {
  /** Number of waves in the level (endless: a large finite cap, looped forever). */
  waveCount: number;
  /** Enemies in wave 1, before per-wave growth. */
  baseCount: number;
  /** Extra enemies per wave index. */
  countPerWave: number;
  /** Enemy hp scale slope: hp ×(1 + index·hpPerWave). */
  hpPerWave: number;
  /**
   * Deep-wave **compounding** hp growth (optional, endless only). Past wave
   * `hpCompoundFrom`, hp is additionally multiplied by `(1 + hpCompoundPerWave)`
   * **per wave** — so the curve bends from linear into exponential and a long
   * run hits a real wall instead of an infinite stay-awake grind. Applied to
   * both standard enemies and bosses. Omit (or 0) for a purely linear curve.
   */
  hpCompoundPerWave?: number;
  hpCompoundFrom?: number;
  /** Enemy speed scale slope, capped at `speedCap`. */
  speedPerWave: number;
  speedCap: number;
  /** A boss every N waves (0 = no bosses). */
  bossEvery: number;
  /** Extra hp per boss appearance (Nth boss = ×(1 + N·bossHpPerCycle)). */
  bossHpPerCycle: number;
  /** Standard enemies this level draws from (distributed/rotated per wave). */
  enemyPool: EnemyTypeKey[];
  /** Milliseconds between spawns within a wave. */
  spawnDelay: number;
}

/** Boss personas cycled through on each boss wave. */
export const BOSS_ROTATION: BossKind[] = [
  'hecklerKing',
  'micGrabber',
  'djWontStop',
  'talentJudge',
];

/**
 * One-time Fame rewards for the *first* time the player reaches each Endless
 * wave — a milestone every 10 waves from 20, **forever** (so deep runs keep
 * paying out, not just up to wave 50). Each is paid once, remembered in
 * `meta.endlessMilestones`. Fame scales with the wave (linear, no runaway).
 */
export function endlessMilestoneFame(wave: number): number {
  return Math.round(wave * 18); // 20→360, 50→900, 100→1800, 150→2700
}

/** Every milestone at or below `wave` (ascending). */
export function endlessMilestonesUpTo(wave: number): { wave: number; fame: number }[] {
  const out: { wave: number; fame: number }[] = [];
  for (let w = 20; w <= wave; w += 10) out.push({ wave: w, fame: endlessMilestoneFame(w) });
  return out;
}

/** The next milestone the player hasn't claimed yet (for the menu tease). */
export function nextEndlessMilestone(claimed: number[]): { wave: number; fame: number } {
  let w = 20;
  while (claimed.includes(w)) w += 10;
  return { wave: w, fame: endlessMilestoneFame(w) };
}

/** Deep-endless "mega boss": every 25th wave the rotating boss arrives as a
 *  much tankier checkpoint version (×HP, bigger, gold aura, 2× reward). */
export const MEGA_BOSS_EVERY = 25;
export const MEGA_BOSS_HP_MULT = 3;

/** Endless mode: never really ends; ramps forever on a standard map. */
export const ENDLESS_PROFILE: WaveProfile = {
  waveCount: 999,
  baseCount: 6,
  countPerWave: 1.4,
  hpPerWave: 0.12,
  // Past wave 40 hp compounds ~2%/wave: ~linear to 50, then bends hard —
  // ~4× harder at wave 100 than the old linear curve, a steep wall beyond.
  hpCompoundPerWave: 0.02,
  hpCompoundFrom: 40,
  speedPerWave: 0.04,
  speedCap: 2.8,
  bossEvery: 5,
  bossHpPerCycle: 0.15,
  enemyPool: [
    'heckler',
    'phoneScroller',
    'drunkUncle',
    'stageRusher',
    'critic',
    'superfan',
    'vip',
    'crowdSurfer',
    'roadie',
    'pyro',
  ],
  spawnDelay: 420,
};

/** Per-wave hp / speed / boss-hp scaling derived from a profile (0-based index). */
export function waveScaling(
  index: number,
  profile: WaveProfile,
): { hpScale: number; speedScale: number; bossHpScale: number } {
  const bossNumber = profile.bossEvery > 0 ? Math.floor((index + 1) / profile.bossEvery) : 0;
  const compoundRate = profile.hpCompoundPerWave ?? 0;
  const deep = Math.max(0, index - (profile.hpCompoundFrom ?? 0));
  const compound = compoundRate > 0 ? Math.pow(1 + compoundRate, deep) : 1;
  return {
    hpScale: (1 + profile.hpPerWave * index) * compound,
    speedScale: Math.min(profile.speedCap, 1 + profile.speedPerWave * index),
    bossHpScale: (1 + profile.bossHpPerCycle * Math.max(0, bossNumber - 1)) * compound,
  };
}

/**
 * Build the spawn groups for one wave from a profile. Enemy count grows with the
 * wave; the count is spread across 2-3 pool types (rotated by wave so later
 * waves mix different crowds); a rotating boss arrives every `bossEvery` waves.
 */
export function buildWaveDef(index: number, profile: WaveProfile): WaveDef {
  const waveNumber = index + 1;
  const total = Math.max(1, profile.baseCount + Math.floor(index * profile.countPerWave));
  const pool = profile.enemyPool.length > 0 ? profile.enemyPool : (['heckler'] as EnemyTypeKey[]);

  const typeCount = Math.min(pool.length, 2 + (index % 2));
  const per = Math.max(1, Math.floor(total / typeCount));
  const groups: SpawnGroup[] = [];
  let remaining = total;
  for (let i = 0; i < typeCount; i++) {
    const type = pool[(index + i) % pool.length];
    const count = i === typeCount - 1 ? remaining : Math.min(per, remaining);
    remaining -= count;
    if (count > 0) groups.push({ type, count, delay: profile.spawnDelay, noScale: true });
  }

  if (profile.bossEvery > 0 && waveNumber % profile.bossEvery === 0) {
    const which = (waveNumber / profile.bossEvery - 1) % BOSS_ROTATION.length;
    groups.push({ type: BOSS_ROTATION[which], count: 1, delay: 0, noScale: true });
  }
  return { groups };
}
