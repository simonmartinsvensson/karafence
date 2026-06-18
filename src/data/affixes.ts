/**
 * Elite affixes — deep in **endless**, individual (non-boss) enemies roll a
 * chance to spawn "elite" with one affix that buffs an existing Enemy stat
 * (hp / speed / shield), so deep waves are a fresh read rather than just bigger
 * numbers. Elites are marked with a coloured ring and pay extra reward. Reuses
 * only stats Enemy already tracks per-instance — no new combat mechanics.
 */
export interface Affix {
  key: string;
  label: string;
  color: number;
  hpMult: number;
  speedMult: number;
  /** Shield added as a fraction of (scaled) hp. */
  shieldFrac: number;
}

export const AFFIXES: Affix[] = [
  { key: 'swift', label: 'Swift', color: 0x4dd2ff, hpMult: 1, speedMult: 1.5, shieldFrac: 0 },
  { key: 'tough', label: 'Tough', color: 0xffa94d, hpMult: 1.9, speedMult: 1, shieldFrac: 0 },
  { key: 'shielded', label: 'Shielded', color: 0x9775fa, hpMult: 1, speedMult: 1, shieldFrac: 0.7 },
  { key: 'frenzied', label: 'Frenzied', color: 0xff6b6b, hpMult: 1.35, speedMult: 1.3, shieldFrac: 0 },
];

/** Elites only start appearing this deep into endless. */
export const AFFIX_MIN_WAVE = 30;

/** Reward multiplier for killing an elite (they're harder, so pay more). */
export const AFFIX_REWARD_MULT = 1.5;

/** Per-enemy affix roll; chance climbs with the wave (cap 40%). null = normal. */
export function rollAffix(wave: number): Affix | null {
  if (wave < AFFIX_MIN_WAVE) return null;
  const chance = Math.min(0.4, 0.08 + (wave - AFFIX_MIN_WAVE) * 0.004);
  if (Math.random() > chance) return null;
  return AFFIXES[Math.floor(Math.random() * AFFIXES.length)];
}
