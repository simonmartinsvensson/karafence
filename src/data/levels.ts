import type { MapDefinition } from '../types/map';
import { level1 } from './level1';
import { level2 } from './level2';

/** Stable identifiers for each playable level (also the meta/save keys). */
export type LevelId = 'level1' | 'level2';

/** Levels in level-select order. */
export const LEVELS: { id: LevelId; map: MapDefinition }[] = [
  { id: 'level1', map: level1 },
  { id: 'level2', map: level2 },
];

export const LEVEL_BY_ID: Record<LevelId, MapDefinition> = {
  level1,
  level2,
};
