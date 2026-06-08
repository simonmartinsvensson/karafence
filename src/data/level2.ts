import { TileType, type MapDefinition } from '../types/map';
import { parseMap } from './parseMap';

/**
 * Level 2 — "The Grand Stage".
 *
 * Only 3 aisles (vs Level 1's five), but a shorter grid means bigger tiles —
 * the lanes read as wider — and there are two buildable rows between aisles for
 * roomier tower placement. Enemies move noticeably faster here. A cooler,
 * fancier flat palette distinguishes it from the Dive Bar.
 */
const ASCII: string[] = [
  'SS..............',
  'SS##############',
  'SS..............',
  'SS..............',
  'SS##############',
  'SS..............',
  'SS..............',
  'SS##############',
  'SS..............',
];

export const level2: MapDefinition = parseMap({
  id: 'level2',
  name: 'The Grand Stage',
  ascii: ASCII,
  enemySpeedMultiplier: 1.35,
  starGoals: { maxLivesLost: 4, maxGoldSpent: 1100, minCombo: 10 },
  colors: {
    [TileType.Stage]: 0x24243a,
    [TileType.Aisle]: 0x3b4a5a,
    [TileType.Build]: 0x4d3a52,
  },
});
