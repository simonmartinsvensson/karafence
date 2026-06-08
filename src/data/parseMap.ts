import { TileType, type MapDefinition, type StarGoals } from '../types/map';

/**
 * Shared ASCII map parser. A level is authored as equal-length rows + a legend
 * and parsed into a MapDefinition — edit the ASCII, get a new level.
 *
 *   S = stage / singer zone (left edge)
 *   # = aisle (enemies walk these, right -> left toward the stage)
 *   . = buildable seats / floor (towers go here, off the path)
 */
const LEGEND: Record<string, TileType> = {
  S: TileType.Stage,
  '#': TileType.Aisle,
  '.': TileType.Build,
};

/** Default tile palette (Level 1 look); maps can override per tile. */
export const DEFAULT_COLORS: Record<TileType, number> = {
  [TileType.Stage]: 0x3a2150,
  // Aisle: a darker, more saturated red-brown carpet so the walkable path is
  // unmistakable. Build: a dark slate/charcoal with a faint green cast so the
  // buildable seating reads as a distinct, cooler surface.
  [TileType.Aisle]: 0x8f3a26,
  [TileType.Build]: 0x33403a,
};

export interface MapOptions {
  id: string;
  name: string;
  ascii: string[];
  enemySpeedMultiplier?: number;
  starGoals: StarGoals;
  colors?: Record<TileType, number>;
}

export function parseMap(opts: MapOptions): MapDefinition {
  const { id, name, ascii } = opts;
  const rows = ascii.length;
  const cols = ascii[0]?.length ?? 0;

  const tiles: TileType[][] = ascii.map((line, r) => {
    if (line.length !== cols) {
      throw new Error(
        `Map "${name}" row ${r} has length ${line.length}, expected ${cols}`,
      );
    }
    return [...line].map((ch, c) => {
      const type = LEGEND[ch];
      if (type === undefined) {
        throw new Error(`Map "${name}" has unknown tile "${ch}" at ${r},${c}`);
      }
      return type;
    });
  });

  const laneRows = tiles
    .map((row, r) => ({ r, hasAisle: row.includes(TileType.Aisle) }))
    .filter((x) => x.hasAisle)
    .map((x) => x.r);

  // Stage occupies the leftmost columns; enemies march toward the first column
  // just right of the stage, and spawn at the far right edge.
  const stageWidth = tiles[laneRows[0]].filter((t) => t === TileType.Stage).length;

  return {
    id,
    name,
    cols,
    rows,
    tiles,
    laneRows,
    spawnCol: cols - 1,
    stageCol: stageWidth - 1,
    enemySpeedMultiplier: opts.enemySpeedMultiplier ?? 1,
    starGoals: opts.starGoals,
    colors: opts.colors ?? DEFAULT_COLORS,
  };
}
