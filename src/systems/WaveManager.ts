import Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import type { GridLayout } from './grid';
import { Enemy } from './Enemy';
import { ENEMY_TYPES, type EnemyTypeKey } from '../data/enemies';
import {
  WAVES,
  DIFFICULTY,
  ENDLESS,
  scaledCount,
  type SpawnGroup,
  type WaveDef,
} from '../data/waves';

export interface WaveManagerCallbacks {
  /** An enemy reached the stage. */
  onReachStage: (enemy: Enemy) => void;
  /** An enemy was killed. */
  onKill?: (enemy: Enemy) => void;
  /** The current wave was fully cleared (drives intermission + interest). */
  onWaveCleared?: () => void;
  /** A boss enemy just spawned (drives the boss health bar + abilities). */
  onBossSpawn?: (enemy: Enemy) => void;
}

/**
 * Reads wave definitions and spawns enemies from the right edge across the
 * lanes (round-robin). Drives enemy movement each frame and advances to the
 * next wave once the current one is fully cleared.
 */
export class WaveManager {
  readonly enemies = new Set<Enemy>();

  private readonly scene: Phaser.Scene;
  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly callbacks: WaveManagerCallbacks;
  private readonly enemyLayer: Phaser.GameObjects.Container;

  private waveIndex = -1;
  private toSpawn = 0; // enemies not yet spawned in the current wave
  private laneCursor = 0; // round-robin lane assignment
  private waveActive = false;
  private stopped = false;
  private timers: Phaser.Time.TimerEvent[] = [];
  private hpScale = 1;
  private speedScale = 1;
  private bossHpScale = 1; // endless bosses get tougher each rotation
  /** Endless: keep generating waves forever past the authored list. */
  private readonly endless: boolean;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    callbacks: WaveManagerCallbacks,
    enemyLayer: Phaser.GameObjects.Container,
    endless = false,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.callbacks = callbacks;
    this.enemyLayer = enemyLayer;
    this.endless = endless;
  }

  get currentWaveNumber(): number {
    return Math.max(1, this.waveIndex + 1);
  }

  /** 0-based index of the active (or most recent) wave; for the run save. */
  get currentWaveIndex(): number {
    return Math.max(0, this.waveIndex);
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  /** Enemies left to deal with this wave: not-yet-spawned + still alive. */
  get enemiesRemaining(): number {
    return this.toSpawn + this.enemies.size;
  }

  get hasNextWave(): boolean {
    return this.endless || this.waveIndex < WAVES.length - 1;
  }

  get finished(): boolean {
    return (
      !this.endless &&
      !this.hasNextWave &&
      !this.waveActive &&
      this.enemiesRemaining === 0
    );
  }

  start(): void {
    this.startWave(0);
  }

  /** Begin play at a specific wave index (used to resume a saved run). */
  startAtWave(index: number): void {
    const max = this.endless ? Number.MAX_SAFE_INTEGER : WAVES.length - 1;
    this.startWave(Math.min(Math.max(0, index), max));
  }

  /** Begin the next wave (called by GameScene when intermission ends). */
  startNextWave(): void {
    if (this.hasNextWave) this.startWave(this.waveIndex + 1);
  }

  private startWave(index: number): void {
    if (this.stopped) return;
    if (!this.endless && index >= WAVES.length) return;
    this.waveIndex = index;
    this.waveActive = true;

    // Authored waves scale per `DIFFICULTY`; procedural (endless) waves past the
    // authored list scale per the `ENDLESS` formula (speed capped).
    const procedural = index >= WAVES.length;
    if (procedural) {
      this.hpScale = 1 + ENDLESS.hpPerWave * index;
      this.speedScale = Math.min(ENDLESS.speedCap, 1 + ENDLESS.speedPerWave * index);
      // Each boss (every `bossEvery` waves) is tougher than the previous one.
      const bossNumber = Math.floor((index + 1) / ENDLESS.bossEvery);
      this.bossHpScale = 1 + ENDLESS.bossHpPerCycle * Math.max(0, bossNumber - 1);
    } else {
      this.hpScale = 1 + DIFFICULTY.hpPerWave * index;
      this.speedScale = 1 + DIFFICULTY.speedPerWave * index;
      this.bossHpScale = 1;
    }

    const wave = procedural ? this.generateWave(index) : WAVES[index];
    const groupCount = (g: (typeof wave.groups)[number]) =>
      g.noScale ? g.count : scaledCount(g.count, index);
    this.toSpawn = wave.groups.reduce((sum, g) => sum + groupCount(g), 0);

    let at = 0;
    for (const group of wave.groups) {
      const count = groupCount(group);
      for (let i = 0; i < count; i++) {
        this.timers.push(
          this.scene.time.delayedCall(at, () => this.spawn(group.type)),
        );
        at += group.delay;
      }
    }
  }

  /**
   * Procedurally build a wave for endless mode (waves past the authored list).
   * Enemy count grows with the wave; a rotating boss arrives every `bossEvery`
   * waves. HP/speed scaling is applied separately in `startWave`.
   */
  private generateWave(index: number): WaveDef {
    const waveNumber = index + 1;
    const total = ENDLESS.baseCount + Math.floor(index * ENDLESS.countPerWave);
    const pool = ENDLESS.enemyPool;

    // Spread the count across 2-3 enemy types, rotated by wave so later waves
    // mix different crowds. `noScale` keeps the computed count exact.
    const typeCount = 2 + (index % 2);
    const per = Math.max(1, Math.floor(total / typeCount));
    const groups: SpawnGroup[] = [];
    let remaining = total;
    for (let i = 0; i < typeCount; i++) {
      const type = pool[(index + i) % pool.length];
      const count = i === typeCount - 1 ? remaining : Math.min(per, remaining);
      remaining -= count;
      if (count > 0) groups.push({ type, count, delay: 420, noScale: true });
    }

    if (waveNumber % ENDLESS.bossEvery === 0) {
      const which = (waveNumber / ENDLESS.bossEvery - 1) % ENDLESS.bossRotation.length;
      groups.push({ type: ENDLESS.bossRotation[which], count: 1, delay: 0, noScale: true });
    }
    return { groups, delayBeforeNext: 0 };
  }

  private spawn(typeKey: EnemyTypeKey): void {
    if (this.stopped) return;
    const laneIndex = this.laneCursor % this.map.laneRows.length;
    this.laneCursor++;
    this.spawnEnemy(typeKey, laneIndex);
    this.toSpawn = Math.max(0, this.toSpawn - 1);
  }

  /**
   * Spawn one enemy, optionally at a given column (used for Superfan splits and
   * boss-summoned enemies). Bosses are never difficulty-scaled. Does not touch
   * `toSpawn` (use `spawn` for scheduled wave spawns).
   */
  spawnAt(typeKey: EnemyTypeKey, laneIndex: number, startCol?: number): Enemy {
    return this.spawnEnemy(typeKey, laneIndex, startCol);
  }

  private spawnEnemy(
    typeKey: EnemyTypeKey,
    laneIndex: number,
    startCol?: number,
  ): Enemy {
    const type = ENEMY_TYPES[typeKey];
    const isBoss = type.boss !== undefined;
    // Per-map speed multiplier applies to everyone (Grand Stage runs faster);
    // per-wave difficulty scaling only applies to non-boss enemies.
    const speedScale =
      (isBoss ? 1 : this.speedScale) * this.map.enemySpeedMultiplier;
    const enemy = new Enemy(
      this.scene,
      this.map,
      this.layout,
      type,
      laneIndex,
      isBoss ? this.bossHpScale : this.hpScale,
      speedScale,
      startCol ?? this.map.spawnCol,
      this.enemyLayer,
    );
    this.enemies.add(enemy);
    if (isBoss) this.callbacks.onBossSpawn?.(enemy);
    return enemy;
  }

  /** @param dt seconds since last frame */
  update(dt: number): void {
    if (this.stopped) return;

    for (const enemy of this.enemies) {
      enemy.update(dt);
      if (enemy.arrivedAtStage) {
        this.callbacks.onReachStage(enemy);
        enemy.destroy();
        this.enemies.delete(enemy);
      } else if (enemy.dead) {
        this.callbacks.onKill?.(enemy);
        // Superfan: split into smaller enemies at the death location.
        const split = enemy.type.splitInto;
        if (split) {
          for (let i = 0; i < split.count; i++) {
            this.spawnAt(split.type, enemy.lane, enemy.gridCol);
          }
        }
        enemy.destroy();
        this.enemies.delete(enemy);
      }
    }

    // Wave fully cleared -> hand off to GameScene (intermission + interest).
    if (this.waveActive && this.enemiesRemaining === 0) {
      this.waveActive = false;
      this.callbacks.onWaveCleared?.();
    }
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies.clear();
  }
}
