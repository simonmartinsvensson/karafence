import { TileType, type MapDefinition } from '../types/map';

/**
 * Level 1 — "The Open Mic".
 *
 * Authored as ASCII for easy editing. Each row is one grid row; each character
 * is one tile. Keep every row the same length.
 *
 *   S = stage / singer zone (left edge)
 *   # = aisle (enemies walk these, right -> left toward the stage)
 *   . = buildable seats / floor (towers go here, off the path)
 *
 * 5 aisles run left-to-right, separated by (and bordered with) buildable rows,
 * so a tower placed between two aisles can cover both.
 */
const LEGEND: Record<string, TileType> = {
  S: TileType.Stage,
  '#': TileType.Aisle,
  '.': TileType.Build,
};

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

function parseMap(name: string, ascii: string[]): MapDefinition {
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
    name,
    cols,
    rows,
    tiles,
    laneRows,
    spawnCol: cols - 1,
    stageCol: stageWidth - 1,
  };
}

export const level1: MapDefinition = parseMap('The Open Mic', ASCII);
