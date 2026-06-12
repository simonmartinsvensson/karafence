import type { WaveProfile } from './waves';

/**
 * "Tonight's Setlist" — a date-seeded run modifier for **Endless** mode. Each
 * day the same map plays with a twist (more bosses, a faster crowd, a bigger
 * crowd…) and a matching **fan multiplier** as the reward for taking it on. It
 * reuses the existing `WaveProfile` knobs + the fan meter, so it's a fresh daily
 * reason to replay without a new mode, screen, or currency. Pure data/logic.
 */

export interface Setlist {
  id: string;
  /** Short name shown on the endless card + a run-start pop. */
  name: string;
  /** One-line description of the twist. */
  blurb: string;
  /** Fans earned this run are multiplied by this (the incentive to play it). */
  fanMult: number;
  /** Apply the twist to the base endless profile (returns a modified copy). */
  tweak: (p: WaveProfile) => WaveProfile;
}

export const SETLISTS: Setlist[] = [
  {
    id: 'standard',
    name: 'House Band',
    blurb: 'A regular night — no twist.',
    fanMult: 1,
    tweak: (p) => p,
  },
  {
    id: 'bossNight',
    name: 'Battle of the Bands',
    blurb: 'Bosses twice as often.',
    fanMult: 1.6,
    tweak: (p) => ({ ...p, bossEvery: Math.max(2, Math.round(p.bossEvery / 2)) }),
  },
  {
    id: 'fastCrowd',
    name: 'Mosh Pit',
    blurb: 'The crowd surges in faster.',
    fanMult: 1.7,
    tweak: (p) => ({ ...p, speedPerWave: p.speedPerWave * 1.6, speedCap: p.speedCap + 0.4 }),
  },
  {
    id: 'bigCrowd',
    name: 'Sold-Out Show',
    blurb: 'Bigger crowds every wave.',
    fanMult: 1.5,
    tweak: (p) => ({ ...p, baseCount: Math.round(p.baseCount * 1.5), countPerWave: p.countPerWave * 1.3 }),
  },
  {
    id: 'tanks',
    name: 'Tough Crowd',
    blurb: 'Hecklers hit the gym — more HP.',
    fanMult: 1.6,
    tweak: (p) => ({ ...p, hpPerWave: p.hpPerWave * 1.5 }),
  },
  {
    id: 'doubleTime',
    name: 'Double-Time',
    blurb: 'Faster spawns, relentless pace.',
    fanMult: 1.8,
    tweak: (p) => ({ ...p, spawnDelay: Math.max(180, Math.round(p.spawnDelay * 0.6)) }),
  },
];

/** Deterministically pick the day's setlist from its date key. */
export function pickSetlist(date: string): Setlist {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = (Math.imul(h ^ date.charCodeAt(i), 16777619)) >>> 0;
  return SETLISTS[h % SETLISTS.length];
}
