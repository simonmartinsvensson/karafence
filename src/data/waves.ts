import type { EnemyTypeKey } from './enemies';

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
  hpPerWave: 0.18,
  speedPerWave: 0.06,
  countPerWave: 0.25,
};

export function scaledCount(base: number, waveIndex: number): number {
  return Math.round(base * (1 + DIFFICULTY.countPerWave * waveIndex));
}

export const WAVES: WaveDef[] = [
  // Wave 1 — easy intro.
  {
    groups: [{ type: 'heckler', count: 6, delay: 900 }],
    delayBeforeNext: 3000,
  },
  // Wave 2 — hecklers plus a couple of tanks.
  {
    groups: [
      { type: 'heckler', count: 6, delay: 700 },
      { type: 'phoneScroller', count: 3, delay: 1300 },
    ],
    delayBeforeNext: 3000,
  },
  // Wave 3 — drunk uncles weave in.
  {
    groups: [
      { type: 'drunkUncle', count: 8, delay: 500 },
      { type: 'phoneScroller', count: 4, delay: 1100 },
    ],
    delayBeforeNext: 3500,
  },
  // Wave 4 — everything at once.
  {
    groups: [
      { type: 'heckler', count: 10, delay: 450 },
      { type: 'drunkUncle', count: 6, delay: 500 },
      { type: 'phoneScroller', count: 5, delay: 900 },
    ],
    delayBeforeNext: 0,
  },
];
