import type { MapDefinition } from '../types/map';
import { CAMPAIGN, ENDLESS_LEVEL, MAZE_LEVEL, buildMap } from './campaign';

/**
 * Level registry, derived from the single campaign source (`campaign.ts`) plus
 * the standalone endless map. `LevelId` is just the string id of a built map.
 */
export type LevelId = string;

const ALL = [...CAMPAIGN, ENDLESS_LEVEL, MAZE_LEVEL];

/** Levels in campaign order (id + built map). */
export const LEVELS: { id: LevelId; map: MapDefinition }[] = ALL.map((entry) => ({
  id: entry.id,
  map: buildMap(entry),
}));

export const LEVEL_BY_ID: Record<LevelId, MapDefinition> = Object.fromEntries(
  LEVELS.map((l) => [l.id, l.map]),
);
