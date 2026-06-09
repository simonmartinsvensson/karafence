import Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import type { GridLayout } from './grid';
import { Enemy } from './Enemy';
import { ENEMY_TYPES, type EnemyTypeKey } from '../data/enemies';
import {
  buildWaveDef,
  waveScaling,
  type WaveProfile,
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
 * Generates each wave from a `WaveProfile` and spawns enemies from the right
 * edge across the lanes (round-robin). Drives enemy movement each frame and
 * advances to the next wave once the current one is fully cleared. In endless
 * mode it keeps generating waves forever (profile.waveCount is just a cap).
 */
export class WaveManager {
  readonly enemies = new Set<Enemy>();

  private readonly scene: Phaser.Scene;
  private readonly map: MapDefinition;
  private readonly layout: GridLayout;
  private readonly callbacks: WaveManagerCallbacks;
  private readonly enemyLayer: Phaser.GameObjects.Container;
  private readonly profile: WaveProfile;

  private waveIndex = -1;
  private toSpawn = 0; // enemies not yet spawned in the current wave
  private laneCursor = 0; // round-robin lane assignment
  private waveActive = false;
  private stopped = false;
  private timers: Phaser.Time.TimerEvent[] = [];
  private hpScale = 1;
  private speedScale = 1;
  private bossHpScale = 1; // bosses get tougher each rotation
  /** Endless: keep generating waves forever (no win condition). */
  private readonly endless: boolean;

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    callbacks: WaveManagerCallbacks,
    enemyLayer: Phaser.GameObjects.Container,
    profile: WaveProfile,
    endless = false,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.callbacks = callbacks;
    this.enemyLayer = enemyLayer;
    this.profile = profile;
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
    return this.profile.waveCount;
  }

  /** Enemies left to deal with this wave: not-yet-spawned + still alive. */
  get enemiesRemaining(): number {
    return this.toSpawn + this.enemies.size;
  }

  get hasNextWave(): boolean {
    return this.endless || this.waveIndex < this.profile.waveCount - 1;
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
    const max = this.endless ? Number.MAX_SAFE_INTEGER : this.profile.waveCount - 1;
    this.startWave(Math.min(Math.max(0, index), max));
  }

  /** Begin the next wave (called by GameScene when intermission ends). */
  startNextWave(): void {
    if (this.hasNextWave) this.startWave(this.waveIndex + 1);
  }

  private startWave(index: number): void {
    if (this.stopped) return;
    if (!this.endless && index >= this.profile.waveCount) return;
    this.waveIndex = index;
    this.waveActive = true;
    // The previous wave's spawn timers have all fired by now (a wave only clears
    // once toSpawn hits 0) — drop them so the array can't grow unbounded.
    this.timers = [];

    const scale = waveScaling(index, this.profile);
    this.hpScale = scale.hpScale;
    this.speedScale = scale.speedScale;
    this.bossHpScale = scale.bossHpScale;

    const wave = buildWaveDef(index, this.profile);
    this.toSpawn = wave.groups.reduce((sum, g) => sum + g.count, 0);

    let at = 0;
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        this.timers.push(
          this.scene.time.delayedCall(at, () => this.spawn(group.type)),
        );
        at += group.delay;
      }
    }
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
