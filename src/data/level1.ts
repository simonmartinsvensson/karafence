import type { MapDefinition } from '../types/map';
import { parseMap } from './parseMap';

/**
 * Level 1 — "The Dive Bar".
 *
 * 5 narrow aisles run right-to-left toward the stage, separated by (and bordered
 * with) buildable rows, so a tower placed between two aisles can cover both.
 * Normal enemy speed — the gentle introduction map.
 */
const ASCII: string[] = [
  'SS..............',
  'SS##############',
  'SS..............',
  'SS##############',
  'SS..............',
  'SS##############',
  'SS..............',
  'SS##############',
  'SS..............',
  'SS##############',
  'SS..............',
];

export const level1: MapDefinition = parseMap({
  id: 'level1',
  name: 'The Dive Bar',
  ascii: ASCII,
  enemySpeedMultiplier: 1,
  starGoals: { maxLivesLost: 5, maxGoldSpent: 900, minCombo: 8 },
});
