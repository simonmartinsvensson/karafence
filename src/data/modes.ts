/**
 * Game modes. KaraFence ships two distinct ways to play, picked on the
 * mode-select screen and persisted so the GameScene knows which rules to apply:
 *
 *  - `endless` — a pure survival loop on The Dive Bar. Waves never stop; after
 *    the 20 authored waves the WaveManager generates them procedurally, scaling
 *    harder forever. No win condition, no star rating — just a best-wave record.
 *  - `story`   — a narrative campaign across the two maps (Dive Bar → Grand
 *    Stage) with character dialogue between waves (see `src/data/story.ts`).
 *    Star ratings still apply.
 */
export type GameMode = 'endless' | 'story' | 'maze';

export interface ModeInfo {
  key: GameMode;
  name: string;
  icon: string;
  tagline: string;
  accent: number;
}

export const MODES: ModeInfo[] = [
  {
    key: 'endless',
    name: 'ENDLESS MODE',
    icon: '♾️', // ♾️
    tagline: 'How long can you last?',
    accent: 0x4dd2ff,
  },
  {
    key: 'story',
    name: 'STORY MODE',
    icon: '🎭', // 🎭
    tagline: 'Defend the dream.',
    accent: 0xe84393,
  },
  {
    key: 'maze',
    name: 'MAZE NIGHT',
    icon: '🧩',
    tagline: 'Build the path. Trap the crowd.',
    accent: 0x51cf66,
  },
];
