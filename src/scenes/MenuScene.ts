import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { LEVELS, type LevelId } from '../data/levels';
import {
  META_UPGRADES,
  nextTierCost,
  maxTier,
  starsAvailable,
  totalStarsEarned,
  type MetaProgress,
} from '../data/meta';
import { loadMeta, saveMeta, hasRun, clearRun } from '../systems/storage';

const STOP = (
  _p: Phaser.Input.Pointer,
  _x: number,
  _y: number,
  ev?: Phaser.Types.Input.EventData,
) => ev?.stopPropagation();

/**
 * Landing screen: pick a level (with its star rating and a Resume option if a
 * run is saved), open the meta-upgrade tree to spend earned stars, or view
 * lifetime stats. Reads the persisted meta fresh on every entry.
 */
export class MenuScene extends Phaser.Scene {
  private meta!: MetaProgress;
  private starsText!: Phaser.GameObjects.Text;
  /** Objects belonging to the currently open modal (destroyed on close). */
  private modal: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.modal = [];
    this.meta = loadMeta();
    this.cameras.main.setBackgroundColor('#0b0b12');

    this.add
      .text(GAME_WIDTH / 2, 22, '🎤 KaraFence', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#e84393',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 42, 'Karaoke night gone hostile — defend the singer', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#9aa0b0',
      })
      .setOrigin(0.5);

    this.starsText = this.add
      .text(GAME_WIDTH / 2, 58, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffd43b',
      })
      .setOrigin(0.5);
    this.refreshStars();

    this.drawLevelCards();

    // Bottom action buttons.
    this.button({
      x: GAME_WIDTH / 2 - 76,
      y: 250,
      w: 140,
      h: 20,
      label: '⭐ Meta Upgrades',
      color: 0xffd166,
      onClick: () => this.openMetaPanel(),
    });
    this.button({
      x: GAME_WIDTH / 2 + 76,
      y: 250,
      w: 140,
      h: 20,
      label: '📊 Lifetime Stats',
      color: 0x74c0fc,
      onClick: () => this.openStatsPanel(),
    });
  }

  private refreshStars(): void {
    this.starsText.setText(
      `★ ${starsAvailable(this.meta)} stars available  ·  ${totalStarsEarned(this.meta)} earned all-time`,
    );
  }

  // --- Level cards ---------------------------------------------------------

  private drawLevelCards(): void {
    const cardW = 200;
    const cardH = 128;
    const cy = 148;
    const positions = [GAME_WIDTH / 2 - 105, GAME_WIDTH / 2 + 105];

    LEVELS.forEach((entry, i) => {
      const cx = positions[i];
      const top = cy - cardH / 2;
      this.add
        .rectangle(cx, cy, cardW, cardH, 0x14141c, 0.98)
        .setStrokeStyle(2, 0xe84393, 0.7);

      this.add
        .text(cx, top + 16, `Map ${i + 1}`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#9aa0b0',
        })
        .setOrigin(0.5);
      this.add
        .text(cx, top + 32, entry.map.name, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      const stars = this.meta.stars[entry.id] ?? 0;
      this.add
        .text(cx, top + 54, this.starString(stars), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffd43b',
        })
        .setOrigin(0.5);

      const goals = entry.map.starGoals;
      this.add
        .text(
          cx,
          top + 74,
          `≤${goals.maxLivesLost} lost · ≤${goals.maxGoldSpent}g · combo ${goals.minCombo}`,
          { fontFamily: 'monospace', fontSize: '6px', color: '#777f8f' },
        )
        .setOrigin(0.5);

      const resumable = hasRun(entry.id);
      this.button({
        x: cx,
        y: top + 96,
        w: cardW - 28,
        h: 18,
        label: resumable ? '▶ New Game' : '▶ Play',
        color: 0x51cf66,
        onClick: () => this.startLevel(entry.id, false),
      });
      if (resumable) {
        this.button({
          x: cx,
          y: top + 116,
          w: cardW - 28,
          h: 16,
          label: '⏵ Resume saved run',
          color: 0x4dabf7,
          onClick: () => this.startLevel(entry.id, true),
        });
      }
    });
  }

  private startLevel(levelId: LevelId, resume: boolean): void {
    if (!resume) clearRun(levelId); // New Game wipes any saved run for this level
    this.scene.start('GameScene', { levelId, resume });
  }

  private starString(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
  }

  // --- Meta-upgrade tree ---------------------------------------------------

  private openMetaPanel(): void {
    this.closeModal();
    const w = 360;
    const h = 200;
    this.pushBackdrop();

    this.modal.push(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xffd166, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const left = GAME_WIDTH / 2 - w / 2;
    const top = GAME_HEIGHT / 2 - h / 2;
    this.modalText(GAME_WIDTH / 2, top + 14, '⭐ META UPGRADES', '#ffd166', 11);
    this.modalText(
      GAME_WIDTH / 2,
      top + 30,
      `${starsAvailable(this.meta)} stars to spend`,
      '#ffd43b',
      9,
    );

    META_UPGRADES.forEach((def, i) => {
      const rowY = top + 52 + i * 42;
      const tier = this.meta.upgrades[def.key] ?? 0;
      const max = maxTier(def);
      const cost = nextTierCost(def, tier);
      const pips = '●'.repeat(tier) + '○'.repeat(max - tier);

      this.modalText(left + 14, rowY, `${def.name}  ${pips}`, '#ffffff', 9, 0);
      this.modalText(
        left + 14,
        rowY + 13,
        tier > 0 ? def.effectLabel(tier) : 'Not purchased',
        '#9aa0b0',
        8,
        0,
      );

      const affordable = cost !== null && starsAvailable(this.meta) >= cost;
      const label =
        cost === null ? 'MAXED' : affordable ? `Buy ★${cost}` : `Need ★${cost}`;
      this.modal.push(
        ...this.button({
          x: left + w - 56,
          y: rowY + 6,
          w: 86,
          h: 22,
          label,
          color: affordable ? 0x51cf66 : 0x555555,
          enabled: affordable,
          depth: 311,
          onClick: () => this.buyUpgrade(def.key),
        }),
      );
    });

    this.modal.push(
      ...this.button({
        x: GAME_WIDTH / 2,
        y: top + h - 14,
        w: 90,
        h: 18,
        label: 'Close',
        color: 0xff6b6b,
        depth: 311,
        onClick: () => this.closeModal(),
      }),
    );
  }

  private buyUpgrade(key: (typeof META_UPGRADES)[number]['key']): void {
    const def = META_UPGRADES.find((u) => u.key === key);
    if (!def) return;
    const tier = this.meta.upgrades[key] ?? 0;
    const cost = nextTierCost(def, tier);
    if (cost === null || starsAvailable(this.meta) < cost) return;
    this.meta.upgrades[key] = tier + 1;
    saveMeta(this.meta);
    this.refreshStars();
    this.openMetaPanel(); // rebuild with the new tier / star balance
  }

  // --- Lifetime stats ------------------------------------------------------

  private openStatsPanel(): void {
    this.closeModal();
    const w = 280;
    const h = 150;
    this.pushBackdrop();
    this.modal.push(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0x74c0fc, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const top = GAME_HEIGHT / 2 - h / 2;
    this.modalText(GAME_WIDTH / 2, top + 16, '📊 LIFETIME STATS', '#74c0fc', 11);

    const lt = this.meta.lifetime;
    const lines: [string, string][] = [
      ['Enemies silenced', `${lt.kills}`],
      ['Waves survived', `${lt.waves}`],
      ['Highest combo', `x${lt.highestCombo}`],
      ['Stars earned', `${totalStarsEarned(this.meta)}`],
    ];
    lines.forEach(([label, value], i) => {
      const y = top + 44 + i * 18;
      this.modalText(GAME_WIDTH / 2 - w / 2 + 18, y, label, '#cfd3dc', 9, 0);
      this.modal.push(
        this.add
          .text(GAME_WIDTH / 2 + w / 2 - 18, y, value, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ffd43b',
          })
          .setOrigin(1, 0.5)
          .setDepth(311),
      );
    });

    this.modal.push(
      ...this.button({
        x: GAME_WIDTH / 2,
        y: top + h - 14,
        w: 90,
        h: 18,
        label: 'Close',
        color: 0xff6b6b,
        depth: 311,
        onClick: () => this.closeModal(),
      }),
    );
  }

  // --- Modal / button helpers ----------------------------------------------

  private pushBackdrop(): void {
    this.modal.push(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
        .setDepth(300)
        .setInteractive()
        .on('pointerdown', () => this.closeModal()),
    );
  }

  private modalText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    originX = 0.5,
  ): void {
    this.modal.push(
      this.add
        .text(x, y, text, { fontFamily: 'monospace', fontSize: `${size}px`, color })
        .setOrigin(originX, 0.5)
        .setDepth(311),
    );
  }

  private closeModal(): void {
    this.modal.forEach((o) => o.destroy());
    this.modal = [];
  }

  /** A labelled, tap-friendly button. Returns its objects (for modal tracking). */
  private button(opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    color: number;
    onClick: () => void;
    enabled?: boolean;
    depth?: number;
  }): Phaser.GameObjects.GameObject[] {
    const enabled = opts.enabled ?? true;
    const depth = opts.depth ?? 10;
    const rect = this.add
      .rectangle(opts.x, opts.y, opts.w, opts.h, enabled ? 0x232336 : 0x1a1a22)
      .setStrokeStyle(1, enabled ? opts.color : 0x555555, 0.9)
      .setDepth(depth);
    const text = this.add
      .text(opts.x, opts.y, opts.label, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: enabled ? '#ffffff' : '#888888',
      })
      .setOrigin(0.5)
      .setDepth(depth + 1);
    if (enabled) {
      rect
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (
          _p: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          ev?: Phaser.Types.Input.EventData,
        ) => {
          ev?.stopPropagation();
          opts.onClick();
        });
    }
    return [rect, text];
  }
}
