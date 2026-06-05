/**
 * One-use "KaraFence Cash" power-ups sold in the between-waves shop. The effect
 * is applied immediately on purchase (see GameScene).
 */

export type PowerUpKey = 'securityGuard' | 'encore' | 'soundCheck';

export interface PowerUp {
  key: PowerUpKey;
  name: string;
  desc: string;
  cost: number;
  icon: string;
}

export const POWERUPS: Record<PowerUpKey, PowerUp> = {
  securityGuard: {
    key: 'securityGuard',
    name: 'Security Guard',
    desc: 'Instantly removes all enemies on screen',
    cost: 120,
    icon: '🛡️',
  },
  encore: {
    key: 'encore',
    name: 'Encore',
    desc: 'Rewinds all enemies 10s back along their path',
    cost: 80,
    icon: '🔁',
  },
  soundCheck: {
    key: 'soundCheck',
    name: 'Sound Check',
    desc: 'Doubles all tower damage for 15s',
    cost: 90,
    icon: '🎚️',
  },
};

export const POWERUP_LIST: PowerUp[] = [
  POWERUPS.securityGuard,
  POWERUPS.encore,
  POWERUPS.soundCheck,
];

export const SOUND_CHECK_DURATION_MS = 15000;
export const ENCORE_REWIND_SECONDS = 10;
