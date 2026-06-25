import { TileType, type MapDefinition } from '../types/map';

export interface Cell {
  col: number;
  row: number;
}

/**
 * Flow-field pathfinder for **Maze Night** mode. Unlike the lane maps (where
 * enemies walk a fixed row right→left), a maze map is an open floor: towers
 * BLOCK the tiles they sit on, so the player builds walls to route the crowd.
 *
 * One breadth-first search from the stage goal over every walkable cell yields a
 * `next[cell]` direction map covering the whole grid; an enemy just looks up the
 * next step from its current cell. Placing or selling a tower recomputes the
 * field once — and because in-flight enemies re-query each cell, they re-route
 * for free with no per-enemy pathfinding. The grid is tiny (~16×13), so a full
 * BFS is a few hundred cell visits — cheap to run on every placement.
 *
 * Walkable = in bounds, not Stage/Obstacle, and not currently blocked by a
 * tower. The goal is the stage edge (any walkable cell whose left neighbour is
 * the stage); reaching column `stageCol` means the enemy made it to the singer.
 */
export class MazeField {
  private readonly cols: number;
  private readonly rows: number;
  private readonly stageCol: number;
  /** Stage / obstacle tiles — never walkable, independent of towers. */
  private readonly staticBlocked: boolean[];
  private readonly nextCol: Int16Array;
  private readonly nextRow: Int16Array;
  private readonly dist: Int32Array;

  constructor(map: MapDefinition) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.stageCol = map.stageCol;
    const n = this.cols * this.rows;
    this.staticBlocked = new Array(n).fill(false);
    this.nextCol = new Int16Array(n);
    this.nextRow = new Int16Array(n);
    this.dist = new Int32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = map.tiles[r][c];
        this.staticBlocked[this.idx(c, r)] =
          t === TileType.Stage || t === TileType.Obstacle;
      }
    }
  }

  private idx(c: number, r: number): number {
    return r * this.cols + c;
  }

  private walkable(c: number, r: number, blocked: (c: number, r: number) => boolean): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    if (this.staticBlocked[this.idx(c, r)]) return false;
    return !blocked(c, r);
  }

  /** Rebuild the live flow field for the current tower layout. */
  recompute(blocked: (c: number, r: number) => boolean): void {
    this.computeInto(this.nextCol, this.nextRow, this.dist, blocked, null);
  }

  /** BFS from the stage goal. `extra` (if set) is treated as an additional blocked cell. */
  private computeInto(
    nc: Int16Array,
    nr: Int16Array,
    dist: Int32Array,
    blocked: (c: number, r: number) => boolean,
    extra: Cell | null,
  ): void {
    dist.fill(-1);
    const isBlocked = (c: number, r: number): boolean =>
      (extra !== null && extra.col === c && extra.row === r) || blocked(c, r);

    const queue: number[] = [];
    let head = 0;
    // Sources: walkable cells adjacent to the stage (their left step is the goal).
    const goalAdj = this.stageCol + 1;
    for (let r = 0; r < this.rows; r++) {
      if (this.walkable(goalAdj, r, isBlocked)) {
        const id = this.idx(goalAdj, r);
        dist[id] = 0;
        nc[id] = this.stageCol;
        nr[id] = r;
        queue.push(id);
      }
    }
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (head < queue.length) {
      const id = queue[head++];
      const c = id % this.cols;
      const r = (id - c) / this.cols;
      for (const [dc, dr] of dirs) {
        const cc = c + dc;
        const rr = r + dr;
        if (!this.walkable(cc, rr, isBlocked)) continue;
        const nid = this.idx(cc, rr);
        if (dist[nid] !== -1) continue;
        dist[nid] = dist[id] + 1;
        nc[nid] = c;
        nr[nid] = r;
        queue.push(nid);
      }
    }
  }

  /** The next cell an enemy at (c,r) should step toward, or null if at/blocked from the goal. */
  next(c: number, r: number): Cell | null {
    if (c <= this.stageCol) return null;
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    const id = this.idx(c, r);
    if (this.dist[id] < 0) return null;
    return { col: this.nextCol[id], row: this.nextRow[id] };
  }

  /** True if (c,r) can currently reach the stage (has a finite flow-field distance). */
  reaches(c: number, r: number): boolean {
    if (c <= this.stageCol) return true;
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.dist[this.idx(c, r)] >= 0;
  }

  /**
   * Would adding a blocker at `cell` (on top of the current towers) still leave
   * EVERY source able to reach the goal? Used to forbid sealing the maze. A
   * source whose own cell equals `cell` is reported unreachable, which also
   * forbids building on a tile an enemy currently occupies.
   */
  pathClearWith(cell: Cell, blocked: (c: number, r: number) => boolean, sources: Cell[]): boolean {
    const n = this.cols * this.rows;
    const dist = new Int32Array(n);
    const nc = new Int16Array(n);
    const nr = new Int16Array(n);
    this.computeInto(nc, nr, dist, blocked, cell);
    for (const s of sources) {
      if (s.col <= this.stageCol) continue; // already at the goal
      if (s.col < 0 || s.row < 0 || s.col >= this.cols || s.row >= this.rows) continue;
      if (dist[this.idx(s.col, s.row)] < 0) return false;
    }
    return true;
  }
}
