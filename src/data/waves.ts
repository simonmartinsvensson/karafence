import type { BossKind, EnemyTypeKey } from './enemies';

/**
 * Data-driven wave definitions. Each wave is a sequence of spawn groups; each
 * group spawns `count` enemies of `type`, `delay` ms apart. After a wave is
 * fully cleared, the manager waits `delayBeforeNext` ms before the next wave.
 *
 * Spawned enemies are spread across the lanes round-robin by the WaveManager.
 */

export interface SpawnGroup {
  type: EnemyTypeKey;
  count: number;
  /** Milliseconds between spawns within this group. */
  delay: number;
  /** Boss groups set this so count/hp/speed are NOT difficulty-scaled. */
  noScale?: boolean;
}

export interface WaveDef {
  groups: SpawnGroup[];
  /** Milliseconds after this wave is cleared before the next wave starts. */
  delayBeforeNext: number;
}

/**
 * Per-wave difficulty scaling (wave index w, 0-based): each later wave spawns
 * more, faster, tougher enemies.
 */
export const DIFFICULTY = {
  hpPerWave: 0.12,
  speedPerWave: 0.05,
  countPerWave: 0.15,
};

export function scaledCount(base: number, waveIndex: number): number {
  return Math.round(base * (1 + DIFFICULTY.countPerWave * waveIndex));
}

/**
 * Endless-mode tuning (used by `WaveManager.generateWave` once play runs past
 * the authored waves). Data-driven so the survival curve is easy to tune:
 *   enemyCount = baseCount + floor(waveIndex * countPerWave)
 *   hpScale    = 1 + waveIndex * hpPerWave
 *   speedScale = min(speedCap, 1 + waveIndex * speedPerWave)
 *   a boss every `bossEvery` waves, rotating through `BOSS_ROTATION` and
 *   gaining `bossHpPerCycle` extra HP each time the rotation comes back around.
 * (`waveIndex` is 0-based, matching the authored-wave indexing.)
 */
export const ENDLESS = {
  baseCount: 6,
  countPerWave: 1.4,
  hpPerWave: 0.12,
  speedPerWave: 0.04,
  speedCap: 2.5,
  bossEvery: 5,
  bossHpPerCycle: 0.15,
  /** Standard enemies endless waves draw from (rotated by wave). */
  enemyPool: [
    'heckler',
    'phoneScroller',
    'drunkUncle',
    'stageRusher',
    'critic',
    'superfan',
    'vip',
  ] as EnemyTypeKey[],
  /** Boss personas cycled through on each boss wave. */
  bossRotation: ['hecklerKing', 'micGrabber', 'djWontStop', 'talentJudge'] as BossKind[],
};

/** A boss group never scales (one boss, fixed stats). */
const boss = (type: EnemyTypeKey): SpawnGroup => ({
  type,
  count: 1,
  delay: 0,
  noScale: true,
});

export const WAVES: WaveDef[] = [
  // 1
  { groups: [{ type: 'heckler', count: 6, delay: 900 }], delayBeforeNext: 0 },
  // 2
  {
    groups: [
      { type: 'heckler', count: 6, delay: 700 },
      { type: 'phoneScroller', count: 3, delay: 1300 },
    ],
    delayBeforeNext: 0,
  },
  // 3
  {
    groups: [
      { type: 'drunkUncle', count: 8, delay: 500 },
      { type: 'phoneScroller', count: 4, delay: 1100 },
    ],
    delayBeforeNext: 0,
  },
  // 4 — introduces Stage Rushers + Critics
  {
    groups: [
      { type: 'heckler', count: 8, delay: 450 },
      { type: 'stageRusher', count: 5, delay: 600 },
      { type: 'critic', count: 2, delay: 1500 },
    ],
    delayBeforeNext: 0,
  },
  // 5 — BOSS: The Heckler King
  {
    groups: [{ type: 'heckler', count: 4, delay: 700 }, boss('hecklerKing')],
    delayBeforeNext: 0,
  },
  // 6
  {
    groups: [
      { type: 'stageRusher', count: 8, delay: 450 },
      { type: 'critic', count: 3, delay: 1400 },
    ],
    delayBeforeNext: 0,
  },
  // 7 — introduces Superfans
  {
    groups: [
      { type: 'superfan', count: 4, delay: 1600 },
      { type: 'phoneScroller', count: 5, delay: 900 },
    ],
    delayBeforeNext: 0,
  },
  // 8 — introduces VIPs
  {
    groups: [
      { type: 'vip', count: 4, delay: 1400 },
      { type: 'heckler', count: 10, delay: 400 },
    ],
    delayBeforeNext: 0,
  },
  // 9
  {
    groups: [
      { type: 'drunkUncle', count: 10, delay: 400 },
      { type: 'superfan', count: 3, delay: 1800 },
      { type: 'critic', count: 3, delay: 1200 },
    ],
    delayBeforeNext: 0,
  },
  // 10 — BOSS: The Mic Grabber
  {
    groups: [{ type: 'stageRusher', count: 5, delay: 500 }, boss('micGrabber')],
    delayBeforeNext: 0,
  },
  // 11
  {
    groups: [
      { type: 'vip', count: 5, delay: 1200 },
      { type: 'phoneScroller', count: 6, delay: 800 },
    ],
    delayBeforeNext: 0,
  },
  // 12
  {
    groups: [
      { type: 'superfan', count: 5, delay: 1400 },
      { type: 'stageRusher', count: 8, delay: 450 },
    ],
    delayBeforeNext: 0,
  },
  // 13
  {
    groups: [
      { type: 'critic', count: 4, delay: 1100 },
      { type: 'vip', count: 4, delay: 1200 },
      { type: 'heckler', count: 12, delay: 350 },
    ],
    delayBeforeNext: 0,
  },
  // 14
  {
    groups: [
      { type: 'drunkUncle', count: 12, delay: 350 },
      { type: 'superfan', count: 4, delay: 1600 },
    ],
    delayBeforeNext: 0,
  },
  // 15 — BOSS: The DJ Who Wouldn't Stop
  {
    groups: [{ type: 'heckler', count: 6, delay: 500 }, boss('djWontStop')],
    delayBeforeNext: 0,
  },
  // 16
  {
    groups: [
      { type: 'vip', count: 6, delay: 1000 },
      { type: 'stageRusher', count: 10, delay: 400 },
    ],
    delayBeforeNext: 0,
  },
  // 17
  {
    groups: [
      { type: 'superfan', count: 6, delay: 1300 },
      { type: 'critic', count: 4, delay: 1000 },
      { type: 'phoneScroller', count: 6, delay: 800 },
    ],
    delayBeforeNext: 0,
  },
  // 18
  {
    groups: [
      { type: 'vip', count: 6, delay: 1000 },
      { type: 'drunkUncle', count: 12, delay: 350 },
    ],
    delayBeforeNext: 0,
  },
  // 19
  {
    groups: [
      { type: 'superfan', count: 6, delay: 1200 },
      { type: 'vip', count: 6, delay: 1000 },
      { type: 'critic', count: 5, delay: 900 },
    ],
    delayBeforeNext: 0,
  },
  // 20 — FINAL BOSS: The Talent Show Judge
  {
    groups: [{ type: 'vip', count: 3, delay: 900 }, boss('talentJudge')],
    delayBeforeNext: 0,
  },
];
