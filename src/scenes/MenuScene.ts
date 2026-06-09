import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import type { LevelId } from '../data/levels';
import { MODES, type GameMode, type ModeInfo } from '../data/modes';
import { CHAPTER_ORDER } from '../data/story';
import {
  META_UPGRADES,
  nextTierCost,
  maxTier,
  starsAvailable,
  totalStarsEarned,
  type MetaProgress,
} from '../data/meta';
import {
  loadMeta,
  saveMeta,
  hasRun,
  clearRun,
  saveActiveMode,
  loadEndlessBest,
  loadStoryProgress,
  saveStoryProgress,
  clearStoryProgress,
} from '../systems/storage';
import { audio } from '../systems/audio';

const STOP = (
  _p: Phaser.Input.Pointer,
  _x: number,
  _y: number,
  ev?: Phaser.Types.Input.EventData,
) => ev?.stopPropagation();

/**
 * Landing screen: pick a game mode (Endless or Story — each with a Resume
 * option if a run is saved), open the meta-upgrade tree to spend earned stars,
 * or view Records (lifetime stats + best endless wave). Reads the persisted
 * meta fresh on every entry.
 *
 * Responsive (Scale.RESIZE): the whole menu lives in a `root` container that is
 * rebuilt for the current viewport on every resize — mode cards stack
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
    this.cameras.main.fadeIn(350, 11, 11, 18);
    audio.playMusic('menu');
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

    const titleY = Math.max(34, sh * 0.09);
    this.drawNeonTitle(sw / 2, titleY);
    this.text(
      sw / 2,
      titleY + 30,
      'Karaoke night gone hostile — pick your stage',
      '#9aa0b0',
      Math.min(12, sw / 34),
    );
    this.text(
      sw / 2,
      titleY + 50,
      `★ ${starsAvailable(this.meta)} stars available · ${totalStarsEarned(this.meta)} earned all-time`,
      '#ffd43b',
      12,
    );

    this.drawModeCards(portrait, titleY + 72);

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
      label: '🏆 Records',
      color: 0x74c0fc,
      onClick: () => this.openRecordsPanel(),
    });
  }

  /** Big "KARAFENCE" wordmark with a layered neon glow + spotlight wash. */
  private drawNeonTitle(x: number, y: number): void {
    const size = Math.round(Phaser.Math.Clamp(this.sw / 12, 30, 52));
    // Stacked low-alpha copies fake a neon bloom behind the crisp wordmark.
    for (const [dy, alpha, color] of [
      [3, 0.18, '#7a1b48'],
      [0, 0.3, '#ff5fae'],
    ] as [number, number, string][]) {
      const glow = this.add
        .text(x, y + dy, 'KARAFENCE', {
          fontFamily: 'monospace',
          fontSize: `${size + 6}px`,
          color,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setAlpha(alpha);
      this.root.add(glow);
    }
    const main = this.add
      .text(x, y, 'KARAFENCE', {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    main.setShadow(0, 0, '#e84393', 18, true, true);
    this.root.add(main);
  }

  // --- Mode cards ----------------------------------------------------------

  private drawModeCards(portrait: boolean, top: number): void {
    const { sw, sh } = this;
    const bottom = sh - TOUCH_MIN - 28;
    const areaH = bottom - top;

    let cardW: number;
    let cardH: number;
    const centers: { x: number; y: number }[] = [];
    if (portrait) {
      cardW = Math.min(sw - 28, 460);
      cardH = Math.min((areaH - 16) / MODES.length, 210);
      const stackH = cardH * MODES.length + 16 * (MODES.length - 1);
      const stackTop = top + Math.max(0, (areaH - stackH) / 2);
      MODES.forEach((_, i) => {
        centers.push({ x: sw / 2, y: stackTop + cardH / 2 + i * (cardH + 16) });
      });
    } else {
      cardW = Math.min((sw - 44) / 2, 340);
      cardH = Math.min(areaH, 280);
      const cy = top + cardH / 2;
      centers.push({ x: sw / 2 - cardW / 2 - 10, y: cy });
      centers.push({ x: sw / 2 + cardW / 2 + 10, y: cy });
    }

    MODES.forEach((mode, i) => {
      this.drawModeCard(mode, centers[i].x, centers[i].y, cardW, cardH);
    });
  }

  private drawModeCard(mode: ModeInfo, cx: number, cy: number, cardW: number, cardH: number): void {
    const cardTop = cy - cardH / 2;
    this.rect(cx, cy, cardW, cardH, 0x14141c, mode.accent);

    this.text(cx, cardTop + 40, mode.icon, '#ffffff', 34);
    this.text(cx, cardTop + 78, mode.name, this.hex(mode.accent), 17);
    this.text(cx, cardTop + 100, mode.tagline, '#cfd3dc', 11);

    // Per-mode flavour line + resume detection.
    let detail: string;
    let resumable: boolean;
    if (mode.key === 'endless') {
      const best = loadEndlessBest();
      detail = best > 0 ? `Best: wave ${best}` : 'No record yet';
      resumable = hasRun('endless', 'endless');
    } else {
      const progress = loadStoryProgress();
      const done = progress?.completedChapters.length ?? 0;
      detail =
        done >= CHAPTER_ORDER.length
          ? 'Campaign complete!'
          : `Level ${Math.min(done + 1, CHAPTER_ORDER.length)} of ${CHAPTER_ORDER.length}`;
      resumable = progress !== null && hasRun('story', progress.levelId);
    }
    this.text(cx, cardTop + 124, detail, '#ffd43b', 12);

    const btnW = cardW - 28;
    const resumeY = cardTop + cardH - 14 - TOUCH_MIN / 2;
    const playY = resumable ? resumeY - TOUCH_MIN - 8 : resumeY;
    this.button({
      x: cx,
      y: playY,
      w: btnW,
      h: TOUCH_MIN,
      label: resumable ? '▶ New Game' : '▶ Play',
      color: 0x51cf66,
      onClick: () => this.startMode(mode.key, false),
    });
    if (resumable) {
      this.button({
        x: cx,
        y: resumeY,
        w: btnW,
        h: TOUCH_MIN,
        label: '⏵ Resume',
        color: 0x4dabf7,
        onClick: () => this.startMode(mode.key, true),
      });
    }
  }

  /** Resolve the (mode, level) to launch and hand off to the GameScene. */
  private startMode(mode: GameMode, resume: boolean): void {
    saveActiveMode(mode);
    const firstChapter = CHAPTER_ORDER[0];
    let levelId: LevelId = firstChapter;

    if (mode === 'endless') {
      levelId = 'endless';
      if (!resume) clearRun('endless', 'endless');
    } else if (resume) {
      const progress = loadStoryProgress();
      levelId = progress?.levelId ?? firstChapter;
      resume = hasRun('story', levelId);
    } else {
      // New campaign: wipe progress + any in-progress chapter runs.
      clearStoryProgress();
      CHAPTER_ORDER.forEach((id) => clearRun('story', id));
      saveStoryProgress({ levelId: firstChapter, completedChapters: [], wavesCleared: 0 });
    }

    // Fade out, then hand off to the game (which fades itself in).
    this.cameras.main.fadeOut(280, 11, 11, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { mode, levelId, resume });
    });
  }

  private hex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
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

  // --- Records (lifetime stats + endless best) -----------------------------

  private openRecordsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 340);
    const h = 96 + 5 * 26 + TOUCH_MIN;
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
    this.modalText(sw / 2, top + 20, '🏆 RECORDS', '#74c0fc', 15);

    const lt = this.meta.lifetime;
    const best = loadEndlessBest();
    const lines: [string, string][] = [
      ['Enemies silenced', `${lt.kills}`],
      ['Waves survived', `${lt.waves}`],
      ['Highest combo', `x${lt.highestCombo}`],
      ['Best endless wave', best > 0 ? `${best}` : '—'],
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
