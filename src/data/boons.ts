/**
 * Roguelite "encore boons" — between waves the player is offered a choice of
 * three one-shot perks, adding run-to-run variety (especially deep in endless).
 * Effects are all INSTANT (gold / heal / freeze / Fame) so there's no temporary
 * per-frame state to track — `apply` just calls back into the GameScene via the
 * `BoonCtx` it's handed. Unlocked at a campaign threshold (see data/progression).
 */
export interface BoonCtx {
  /** Current wave number (effects scale with it). */
  wave: number;
  /** Current gold (for proportional boons). */
  gold: number;
  addGold(n: number): void;
  heal(n: number): void;
  addFame(n: number): void;
  /** Temp multipliers that apply to the *next* wave only (reset on wave clear). */
  boostDamage(mult: number): void;
  boostKillGold(mult: number): void;
}

export interface Boon {
  key: string;
  icon: string;
  name: string;
  desc: (c: BoonCtx) => string;
  apply: (c: BoonCtx) => void;
}

export const BOONS: Boon[] = [
  { key: 'payday', icon: '💰', name: 'Payday', desc: (c) => `+${80 + c.wave * 8}g now`, apply: (c) => c.addGold(80 + c.wave * 8) },
  { key: 'royalties', icon: '🪙', name: 'Royalties', desc: (c) => `+${Math.floor(c.gold * 0.4)}g now`, apply: (c) => c.addGold(Math.floor(c.gold * 0.4)) },
  { key: 'encore', icon: '❤️', name: 'Encore', desc: () => '+3 HP', apply: (c) => c.heal(3) },
  { key: 'viral', icon: '🎤', name: 'Going Viral', desc: (c) => `+${60 + c.wave * 4} Fame`, apply: (c) => c.addFame(60 + c.wave * 4) },
  { key: 'ampup', icon: '💥', name: 'Amp Up', desc: () => '+40% dmg next wave', apply: (c) => c.boostDamage(1.4) },
  { key: 'merchrush', icon: '🤑', name: 'Merch Rush', desc: () => '+60% kill gold next wave', apply: (c) => c.boostKillGold(1.6) },
];

/** Pick `n` distinct random boons to offer this intermission. */
export function rollBoons(n = 3): Boon[] {
  const pool = [...BOONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
