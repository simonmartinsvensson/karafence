/**
 * Cosmetic tower skins — power-neutral recolours bought with Fame (a long-tail
 * sink for when there's nothing left to upgrade). A skin is just a tint applied
 * to every tower's body sprite; the per-tower neon glow keeps its own colour so
 * towers stay readable. 'default' (white tint) = the original look.
 */
export interface Skin {
  key: string;
  name: string;
  tint: number;
  cost: number;
}

export const SKINS: Skin[] = [
  { key: 'default', name: 'Classic', tint: 0xffffff, cost: 0 },
  { key: 'platinum', name: 'Platinum', tint: 0xffe9a8, cost: 2000 },
  { key: 'ice', name: 'Ice', tint: 0x9ad0ff, cost: 1500 },
  { key: 'sunset', name: 'Sunset', tint: 0xffb38a, cost: 1500 },
  { key: 'toxic', name: 'Toxic', tint: 0xb6ff8a, cost: 1500 },
  { key: 'chrome', name: 'Chrome', tint: 0xcfd2dc, cost: 1200 },
];

export const SKIN_BY_KEY: Record<string, Skin> = Object.fromEntries(SKINS.map((s) => [s.key, s]));
