import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
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
 *
 * Responsive (Scale.RESIZE): the whole menu lives in a `root` container that is
 * rebuilt for the current viewport on every resize — level cards stack
 * vertically in portrait and sit side-by-side in landscape, and every button
 * is at least the 44px touch-target minimum.
 */
export class MenuScene extends Phaser.Scene {
  private meta!: MetaProgress;
  private root!: Phaser.GameObjects.Container;
  /** Objects belonging to the currently open modal (destroyed on close). */
  private modal: Phaser.GameObjects.GameObject[] = [];
  private resizeHandler = () => {
    this.closeModal();
    this.rebuild();
  };

  constructor() {
    super('MenuScene');
  }

  private get sw(): number {
    return this.scale.width;
  }
  private get sh(): number {
    return this.scale.height;
  }

  create(): void {
    this.modal = [];
    this.meta = loadMeta();
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.rebuild();
    this.scale.on('resize', this.resizeHandler);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeHandler));
  }

  /** Redraw the whole menu for the current viewport size. */
  private rebuild(): void {
    this.root?.destroy(true);
    this.root = this.add.container(0, 0);
    const { sw, sh } = this;
    const portrait = sh >= sw;

    const titleY = Math.max(30, sh * 0.07);
    this.text(sw / 2, titleY, '🎤 KaraFence', '#e84393', 26);
    this.text(
      sw / 2,
      titleY + 24,
      'Karaoke night gone hostile — defend the singer',
      '#9aa0b0',
      Math.min(12, sw / 34),
    );
    this.text(
      sw / 2,
      titleY + 44,
      `★ ${starsAvailable(this.meta)} stars available · ${totalStarsEarned(this.meta)} earned all-time`,
      '#ffd43b',
      12,
    );

    this.drawLevelCards(portrait, titleY + 64);

    // Bottom action buttons (always >=44px tall, reachable at screen bottom).
    const by = sh - TOUCH_MIN / 2 - 14;
    const bw = Math.min(220, (sw - 36) / 2);
    this.button({
      x: sw / 2 - bw / 2 - 6,
      y: by,
      w: bw,
      h: TOUCH_MIN,
      label: '⭐ Meta Upgrades',
      color: 0xffd166,
      onClick: () => this.openMetaPanel(),
    });
    this.button({
      x: sw / 2 + bw / 2 + 6,
      y: by,
      w: bw,
      h: TOUCH_MIN,
      label: '📊 Lifetime Stats',
      color: 0x74c0fc,
      onClick: () => this.openStatsPanel(),
    });
  }

  // --- Level cards ---------------------------------------------------------

  private drawLevelCards(portrait: boolean, top: number): void {
    const { sw, sh } = this;
    const bottom = sh - TOUCH_MIN - 28;
    const areaH = bottom - top;

    let cardW: number;
    let cardH: number;
    const centers: { x: number; y: number }[] = [];
    if (portrait) {
      cardW = Math.min(sw - 28, 460);
      cardH = Math.min((areaH - 14) / LEVELS.length, 200);
      // Center the stack of cards in the available area.
      const stackH = cardH * LEVELS.length + 14 * (LEVELS.length - 1);
      const stackTop = top + Math.max(0, (areaH - stackH) / 2);
      LEVELS.forEach((_, i) => {
        centers.push({ x: sw / 2, y: stackTop + cardH / 2 + i * (cardH + 14) });
      });
    } else {
      cardW = Math.min((sw - 44) / 2, 320);
      cardH = Math.min(areaH, 230);
      const cy = top + cardH / 2;
      centers.push({ x: sw / 2 - cardW / 2 - 8, y: cy });
      centers.push({ x: sw / 2 + cardW / 2 + 8, y: cy });
    }

    LEVELS.forEach((entry, i) => {
      const { x: cx, y: cy } = centers[i];
      const cardTop = cy - cardH / 2;
      this.rect(cx, cy, cardW, cardH, 0x14141c, 0xe84393);

      this.text(cx, cardTop + 18, `Map ${i + 1}`, '#9aa0b0', 10);
      this.text(cx, cardTop + 38, entry.map.name, '#ffffff', 15);

      const stars = this.meta.stars[entry.id] ?? 0;
      this.text(cx, cardTop + 62, this.starString(stars), '#ffd43b', 18);

      const goals = entry.map.starGoals;
      this.text(
        cx,
        cardTop + 84,
        `≤${goals.maxLivesLost} lost · ≤${goals.maxGoldSpent}g · combo ${goals.minCombo}`,
        '#777f8f',
        9,
      );

      const resumable = hasRun(entry.id);
      const btnW = cardW - 28;
      // Stack the play / resume buttons at the bottom of the card.
      const resumeY = cardTop + cardH - 14 - TOUCH_MIN / 2;
      const playY = resumable ? resumeY - TOUCH_MIN - 8 : resumeY;
      this.button({
        x: cx,
        y: playY,
        w: btnW,
        h: TOUCH_MIN,
        label: resumable ? '▶ New Game' : '▶ Play',
        color: 0x51cf66,
        onClick: () => this.startLevel(entry.id, false),
      });
      if (resumable) {
        this.button({
          x: cx,
          y: resumeY,
          w: btnW,
          h: TOUCH_MIN,
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
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 420);
    const rowH = TOUCH_MIN + 18;
    const h = Math.min(sh - 24, 90 + META_UPGRADES.length * rowH + TOUCH_MIN);
    this.pushBackdrop();

    this.modal.push(
      this.add
        .rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xffd166, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const left = sw / 2 - w / 2;
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 18, '⭐ META UPGRADES', '#ffd166', 15);
    this.modalText(sw / 2, top + 38, `${starsAvailable(this.meta)} stars to spend`, '#ffd43b', 12);

    META_UPGRADES.forEach((def, i) => {
      const rowY = top + 64 + i * rowH;
      const tier = this.meta.upgrades[def.key] ?? 0;
      const max = maxTier(def);
      const cost = nextTierCost(def, tier);
      const pips = '●'.repeat(tier) + '○'.repeat(max - tier);

      this.modalText(left + 16, rowY, `${def.name}  ${pips}`, '#ffffff', 12, 0);
      this.modalText(
        left + 16,
        rowY + 16,
        tier > 0 ? def.effectLabel(tier) : 'Not purchased',
        '#9aa0b0',
        10,
        0,
      );

      const affordable = cost !== null && starsAvailable(this.meta) >= cost;
      const label = cost === null ? 'MAXED' : affordable ? `Buy ★${cost}` : `Need ★${cost}`;
      const bw = Math.min(110, w * 0.3);
      this.modal.push(
        ...this.button({
          x: left + w - bw / 2 - 14,
          y: rowY + 8,
          w: bw,
          h: TOUCH_MIN,
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
        x: sw / 2,
        y: top + h - 14 - TOUCH_MIN / 2,
        w: Math.min(140, w - 40),
        h: TOUCH_MIN,
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
    this.rebuild(); // refresh the available-stars line behind the modal
    this.openMetaPanel(); // rebuild with the new tier / star balance
  }

  // --- Lifetime stats ------------------------------------------------------

  private openStatsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 340);
    const h = 96 + 4 * 26 + TOUCH_MIN;
    this.pushBackdrop();
    this.modal.push(
      this.add
        .rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0x74c0fc, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 20, '📊 LIFETIME STATS', '#74c0fc', 15);

    const lt = this.meta.lifetime;
    const lines: [string, string][] = [
      ['Enemies silenced', `${lt.kills}`],
      ['Waves survived', `${lt.waves}`],
      ['Highest combo', `x${lt.highestCombo}`],
      ['Stars earned', `${totalStarsEarned(this.meta)}`],
    ];
    lines.forEach(([label, value], i) => {
      const y = top + 56 + i * 26;
      this.modalText(sw / 2 - w / 2 + 20, y, label, '#cfd3dc', 12, 0);
      this.modal.push(
        this.add
          .text(sw / 2 + w / 2 - 20, y, value, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffd43b',
          })
          .setOrigin(1, 0.5)
          .setDepth(311),
      );
    });

    this.modal.push(
      ...this.button({
        x: sw / 2,
        y: top + h - 14 - TOUCH_MIN / 2,
        w: Math.min(140, w - 40),
        h: TOUCH_MIN,
        label: 'Close',
        color: 0xff6b6b,
        depth: 311,
        onClick: () => this.closeModal(),
      }),
    );
  }

  // --- Modal / draw helpers ------------------------------------------------

  private pushBackdrop(): void {
    this.modal.push(
      this.add
        .rectangle(this.sw / 2, this.sh / 2, this.sw, this.sh, 0x000000, 0.55)
        .setDepth(300)
        .setInteractive()
        .on('pointerdown', () => this.closeModal()),
    );
  }

  /** Menu text (added to the rebuildable root). */
  private text(x: number, y: number, str: string, color: string, size: number): void {
    this.root.add(
      this.add
        .text(x, y, str, { fontFamily: 'monospace', fontSize: `${size}px`, color })
        .setOrigin(0.5),
    );
  }

  /** Card background (added to the rebuildable root). */
  private rect(x: number, y: number, w: number, h: number, fill: number, stroke: number): void {
    this.root.add(
      this.add.rectangle(x, y, w, h, fill, 0.98).setStrokeStyle(2, stroke, 0.7),
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

  /** A labelled, tap-friendly button. Returns its objects (for modal tracking).
   * Non-modal (menu) buttons are also added to `root` so a rebuild clears them. */
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
    const isModal = opts.depth !== undefined;
    const depth = opts.depth ?? 10;
    const rect = this.add
      .rectangle(opts.x, opts.y, opts.w, opts.h, enabled ? 0x232336 : 0x1a1a22, 0.98)
      .setStrokeStyle(2, enabled ? opts.color : 0x555555, 0.9)
      .setDepth(depth);
    const text = this.add
      .text(opts.x, opts.y, opts.label, {
        fontFamily: 'monospace',
        fontSize: '13px',
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
    if (!isModal) this.root.add([rect, text]);
    return [rect, text];
  }
}
