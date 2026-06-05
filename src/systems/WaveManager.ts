import Phaser from 'phaser';
import type { MapDefinition } from '../types/map';
import type { GridLayout } from './grid';
import { Enemy } from './Enemy';
import { ENEMY_TYPES, type EnemyTypeKey } from '../data/enemies';
import { WAVES } from '../data/waves';

export interface WaveManagerCallbacks {
  /** An enemy reached the stage. */
  onReachStage: (enemy: Enemy) => void;
  /** An enemy was killed (used once towers exist). */
  onKill?: (enemy: Enemy) => void;
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

  private waveIndex = -1;
  private toSpawn = 0; // enemies not yet spawned in the current wave
  private laneCursor = 0; // round-robin lane assignment
  private waveActive = false;
  private stopped = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    scene: Phaser.Scene,
    map: MapDefinition,
    layout: GridLayout,
    callbacks: WaveManagerCallbacks,
  ) {
    this.scene = scene;
    this.map = map;
    this.layout = layout;
    this.callbacks = callbacks;
  }

  get currentWaveNumber(): number {
    return Math.max(1, this.waveIndex + 1);
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  /** Enemies left to deal with this wave: not-yet-spawned + still alive. */
  get enemiesRemaining(): number {
    return this.toSpawn + this.enemies.size;
  }

  get finished(): boolean {
    return (
      this.waveIndex >= WAVES.length - 1 &&
      !this.waveActive &&
      this.enemiesRemaining === 0
    );
  }

  start(): void {
    this.startWave(0);
  }

  private startWave(index: number): void {
    if (this.stopped || index >= WAVES.length) return;
    this.waveIndex = index;
    this.waveActive = true;

    const wave = WAVES[index];
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
    const enemy = new Enemy(
      this.scene,
      this.map,
      this.layout,
      ENEMY_TYPES[typeKey],
      laneIndex,
    );
    this.enemies.add(enemy);
    this.toSpawn = Math.max(0, this.toSpawn - 1);
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
        enemy.destroy();
        this.enemies.delete(enemy);
      }
    }

    // Wave fully cleared -> schedule the next one.
    if (this.waveActive && this.enemiesRemaining === 0) {
      this.waveActive = false;
      const wave = WAVES[this.waveIndex];
      if (this.waveIndex < WAVES.length - 1) {
        this.timers.push(
          this.scene.time.delayedCall(wave.delayBeforeNext, () =>
            this.startWave(this.waveIndex + 1),
          ),
        );
      }
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
