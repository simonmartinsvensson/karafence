import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import type { LevelId } from '../data/levels';
import { MODES, type GameMode, type ModeInfo } from '../data/modes';
import { CHAPTER_ORDER } from '../data/story';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';
import {
  META_UPGRADES,
  nextTierCost,
  maxTier,
  starsAvailable,
  totalStarsEarned,
  ratingStarsEarned,
  performerRank,
  TOWER_MAX_LEVEL,
  towerUpgradeCost,
  towerUpgradeEffectLabel,
  isTowerUnlocked,
  isTowerAvailable,
  TOWER_UNLOCK_COST,
  TOWER_STORY_UNLOCK,
  isUnlocked,
  UNLOCK_COST,
  UNLOCK_NAME,
  FAN_PER_STAR,
  bankFans,
  type UnlockKey,
  type MetaProgress,
} from '../data/meta';
import { rollDaily, dateKey, yesterdayKey, questById } from '../data/quests';
import { pickSetlist } from '../data/setlist';
import { ART_CREDITS } from '../systems/spriteOverrides';
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
import { addNeonCameraFX } from '../systems/fx';
import { TX } from '../systems/textures';

const STOP = (
  _p: Phaser.Input.Pointer,
  _x: number,
  _y: number,
  ev?: Phaser.Types.Input.EventData,
) => ev?.stopPropagation();

/** Bump this whenever the game is patched — shown in the menu corner. */
const LAST_PATCH = '2026-06-12 16:45 CEST';

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
  /** Active tab in the meta-upgrade modal. */
  private metaTab: 'upgrades' | 'towers' = 'upgrades';
  /** Objects belonging to the currently open modal (destroyed on close). */
  private modal: Phaser.GameObjects.GameObject[] = [];
  /** Today's login-streak bonus, shown as a one-off toast on entry. */
  private loginBonus?: { fans: number; stars: number; streak: number };
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
    this.refreshDaily();
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.cameras.main.fadeIn(350, 11, 11, 18);
    addNeonCameraFX(this.cameras.main);
    audio.playMusic('menu');
    this.rebuild();
    if (this.loginBonus) this.showLoginToast();
    this.scale.on('resize', this.resizeHandler);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeHandler));
  }

  /**
   * Roll today's daily quests + login streak (no-op if already current). A new
   * day banks a streak fan bonus (×streak, capped) — the "come back tomorrow"
   * hook, feeding the same fan meter as everything else.
   */
  private refreshDaily(): void {
    const now = new Date();
    const { state, loginFans } = rollDaily(this.meta.daily, dateKey(now), yesterdayKey(now));
    this.meta.daily = state;
    if (loginFans > 0) {
      const stars = bankFans(this.meta, loginFans);
      this.loginBonus = { fans: loginFans, stars, streak: state.streak };
    }
    saveMeta(this.meta);
  }

  /** One-off centered toast celebrating the daily login streak + fan bonus. */
  private showLoginToast(): void {
    const b = this.loginBonus;
    if (!b) return;
    this.loginBonus = undefined; // show only once per entry
    const msg =
      `🔥 Day ${b.streak} streak! +${b.fans} fans` + (b.stars > 0 ? ` → +${b.stars} ★` : '');
    const t = this.add
      .text(this.sw / 2, this.sh - TOUCH_MIN * 2 - 24, msg, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffd166',
        backgroundColor: '#1b1320cc',
        padding: { x: 12, y: 8 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(5000);
    this.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: { from: 1, to: 0 },
      delay: 1600,
      duration: 900,
      ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  /** Redraw the whole menu for the current viewport size. */
  private rebuild(): void {
    this.root?.destroy(true);
    this.root = this.add.container(0, 0);
    const { sw, sh } = this;
    const portrait = sh >= sw;

    this.drawMenuBackground();

    const titleY = Math.max(34, sh * 0.09);
    this.drawNeonTitle(sw / 2, titleY);
    const rank = performerRank(totalStarsEarned(this.meta)).rank;
    this.text(
      sw / 2,
      titleY + 30,
      `🎙 ${rank.title}`,
      '#f783ac',
      Math.min(13, sw / 30),
    );
    this.text(
      sw / 2,
      titleY + 50,
      `★ ${starsAvailable(this.meta)} stars available · ${totalStarsEarned(this.meta)} earned all-time`,
      '#ffd43b',
      12,
    );

    this.drawFanMeter(sw / 2, titleY + 76, Math.min(360, sw - 40));
    this.drawModeCards(portrait, titleY + 112);

    // Bottom action buttons (always >=44px tall, reachable at screen bottom).
    const by = sh - TOUCH_MIN / 2 - 14;
    const gap = 8;
    const bw = Math.min(190, (sw - 24 - gap * 2) / 3);
    this.button({
      x: sw / 2 - bw - gap,
      y: by,
      w: bw,
      h: TOUCH_MIN,
      label: '⭐ Upgrades',
      color: 0xffd166,
      onClick: () => this.openMetaPanel(),
    });
    this.button({
      x: sw / 2,
      y: by,
      w: bw,
      h: TOUCH_MIN,
      label: '🗺 Levels',
      color: 0x69db7c,
      onClick: () => this.openLevelSelect(),
    });
    this.button({
      x: sw / 2 + bw + gap,
      y: by,
      w: bw,
      h: TOUCH_MIN,
      label: '🏆 Records',
      color: 0x74c0fc,
      onClick: () => this.openRecordsPanel(),
    });

    // Last-patch stamp, tucked low-key in the bottom-left corner.
    this.root.add(
      this.add
        .text(8, sh - 6, `Last patch: ${LAST_PATCH}`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#5b6172',
        })
        .setOrigin(0, 1),
    );

    // Art-credits link (bottom-right) — only when sprite attributions exist.
    if (ART_CREDITS.length > 0) {
      const credit = this.add
        .text(sw - 8, sh - 6, 'ⓘ Credits', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#74c0fc',
        })
        .setOrigin(1, 1)
        .setInteractive({ useHandCursor: true });
      credit.on('pointerdown', () => this.openCreditsPanel());
      this.root.add(credit);
    }
  }

  /** Lists the art attributions (CC BY etc.) from ART_CREDITS. */
  private openCreditsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 360);
    const h = 70 + ART_CREDITS.length * 22 + TOUCH_MIN;
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
    this.modalText(sw / 2, top + 20, '🎨 ART CREDITS', '#74c0fc', 15);
    ART_CREDITS.forEach((lineStr, i) =>
      this.modalText(sw / 2, top + 50 + i * 22, lineStr, '#cfd3dc', 11),
    );
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

  /** Atmospheric backdrop: gradient wash, colored stage-light pools, drifting
   * motes and an edge vignette — drawn first so it sits behind the menu. */
  private drawMenuBackground(): void {
    const { sw, sh } = this;
    const add = (o: Phaser.GameObjects.GameObject) => this.root.add(o);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1b0e24, 0x160b20, 0x07070d, 0x07070d, 1, 1, 1, 1);
    bg.fillRect(0, 0, sw, sh);
    add(bg);

    // Sweeping concert spotlight beams from the top edge (additive cones that
    // rock back and forth out of phase) — the "live venue" centerpiece.
    const beam = (x: number, color: number, from: number, to: number, dur: number) => {
      const img = this.add
        .image(x, -sh * 0.05, TX.spotlight)
        .setOrigin(0.5, 0)
        .setDisplaySize(sw * 0.42, sh * 1.15)
        .setTint(color)
        .setAlpha(0.16)
        .setAngle(from)
        .setBlendMode(Phaser.BlendModes.ADD);
      add(img);
      this.tweens.add({
        targets: img,
        angle: to,
        duration: dur,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };
    beam(sw * 0.34, 0xe84393, -16, 10, 5200);
    beam(sw * 0.66, 0x6cc5ff, 14, -12, 6100);

    // Soft stage-light pools (additive) — a magenta key light + cool/warm fills,
    // each slowly breathing so the backdrop never sits still.
    const pool = (x: number, y: number, d: number, color: number, alpha: number) => {
      const img = this.add
        .image(x, y, TX.glow)
        .setDisplaySize(d, d)
        .setTint(color)
        .setAlpha(alpha)
        .setBlendMode(Phaser.BlendModes.ADD);
      add(img);
      this.tweens.add({
        targets: img,
        alpha: alpha * 1.5,
        scaleX: img.scaleX * 1.12,
        scaleY: img.scaleY * 1.12,
        duration: 2200 + d,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };
    pool(sw * 0.5, sh * 0.1, Math.max(sw, sh) * 0.85, 0xe84393, 0.2);
    pool(sw * 0.18, sh * 0.0, sw * 0.6, 0x6cc5ff, 0.12);
    pool(sw * 0.82, sh * 0.0, sw * 0.6, 0xffd166, 0.1);

    // Slow drifting motes (dust in the stage light) rising from the bottom.
    add(
      this.add.particles(0, 0, TX.glow, {
        x: { min: 0, max: sw },
        y: sh + 12,
        lifespan: 9000,
        frequency: 340,
        speedY: { min: -26, max: -10 },
        speedX: { min: -8, max: 8 },
        scale: { min: 0.05, max: 0.13 },
        alpha: { start: 0.22, end: 0 },
        tint: [0xffd9f2, 0x9fdcff],
        blendMode: 'ADD',
      }),
    );

    // Edge vignette.
    const vg = this.add.graphics();
    const vy = sh * 0.14;
    const vx = sw * 0.1;
    vg.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0, 0, 0.5, 0.5);
    vg.fillRect(0, sh - vy, sw, vy);
    vg.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0.4, 0, 0.4, 0);
    vg.fillRect(0, 0, vx, sh);
    vg.fillGradientStyle(0x05050a, 0x05050a, 0x05050a, 0x05050a, 0, 0.4, 0, 0.4);
    vg.fillRect(sw - vx, 0, vx, sh);
    add(vg);
  }

  // --- Mode cards ----------------------------------------------------------

  /**
   * The unifying fan meter — every system (kills, waves, quests, crates, daily
   * streak) feeds this single bar; filling it grants a bonus ★. Drawn under the
   * star line with a goal tease (campaign % + the next act to unlock) so there's
   * always a visible "next thing" without a new screen.
   */
  private drawFanMeter(cx: number, cy: number, width: number): void {
    const fans = this.meta.fans ?? 0;
    const pct = Phaser.Math.Clamp(fans / FAN_PER_STAR, 0, 1);
    const barH = 12;

    this.text(cx, cy - 15, `🎤 ${fans} / ${FAN_PER_STAR} fans to your next bonus ★`, '#ff9ed8', 11);

    this.root.add(
      this.add.rectangle(cx, cy, width, barH, 0x241a2b, 0.95).setStrokeStyle(1, 0xff5fae, 0.5),
    );
    if (pct > 0) {
      const fillW = Math.max(3, width * pct);
      this.root.add(
        this.add.rectangle(cx - width / 2 + fillW / 2, cy, fillW, barH - 4, 0xff5fae, 0.95),
      );
    }

    const maxStars = CHAPTER_ORDER.length * 3;
    const got = ratingStarsEarned(this.meta);
    const completion = Math.round((got / maxStars) * 100);
    this.text(
      cx,
      cy + 16,
      `Campaign ${completion}% · ${got}/${maxStars} ★ · ${this.nextUnlockTease()}`,
      '#9aa0b0',
      10,
    );
  }

  /** A one-line "here's your next unlock" goal tease for the menu. */
  private nextUnlockTease(): string {
    const reached = this.highestUnlockedIndex() + 1;
    const locked = TOWER_LIST.filter(
      (t) => !isTowerAvailable(this.meta, reached, t.key),
    ).sort(
      (a, b) => (TOWER_STORY_UNLOCK[a.key] ?? 99) - (TOWER_STORY_UNLOCK[b.key] ?? 99),
    )[0];
    if (locked) {
      return `Next act: ${locked.name} (lvl ${TOWER_STORY_UNLOCK[locked.key]} or ★${TOWER_UNLOCK_COST[locked.key]})`;
    }
    if (!isUnlocked(this.meta, 'speed2x')) return `Unlock 2× Speed for ★${UNLOCK_COST.speed2x}`;
    return 'All acts unlocked — keep chasing stars!';
  }

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
    // Accent glow bleeding out from behind the card (neon edge).
    this.root.add(
      this.add
        .image(cx, cy, TX.glow)
        .setDisplaySize(cardW * 1.12, cardH * 1.16)
        .setTint(mode.accent)
        .setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    this.rect(cx, cy, cardW, cardH, 0x14141c, mode.accent);
    // A big translucent icon glow + a soft accent wash across the card top.
    this.root.add(
      this.add
        .image(cx, cardTop + 40, TX.glow)
        .setDisplaySize(cardW * 0.7, cardH * 0.5)
        .setTint(mode.accent)
        .setAlpha(0.12)
        .setBlendMode(Phaser.BlendModes.ADD),
    );

    this.text(cx, cardTop + 40, mode.icon, '#ffffff', 34);
    this.text(cx, cardTop + 78, mode.name, this.hex(mode.accent), 17);
    this.text(cx, cardTop + 100, mode.tagline, '#cfd3dc', 11);

    // Per-mode flavour line + resume detection.
    let detail: string;
    let resumable: boolean;
    if (mode.key === 'endless') {
      const best = loadEndlessBest();
      detail = best > 0 ? `Best: wave ${best} — beat it!` : 'No record yet';
      resumable = hasRun('endless', 'endless');
      const sl = pickSetlist(dateKey(new Date()));
      if (sl.fanMult > 1) {
        this.text(cx, cardTop + 142, `🎵 Tonight: ${sl.name} · ${sl.fanMult}× fans`, '#ff9ed8', 10);
      }
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
    const w = Math.min(sw - 16, 440);
    const towers = this.metaTab === 'towers';
    const rowCount = towers ? TOWER_LIST.length : META_UPGRADES.length + 1;
    const headH = 96; // title + stars line + tab row
    const closeArea = TOUCH_MIN + 14;
    const idealRowH = TOUCH_MIN + 18;
    // Fit the panel to the screen, then size rows to the space that's left so
    // they never spill past the panel / off-screen on short (landscape) viewports.
    const h = Math.min(sh - 12, headH + rowCount * idealRowH + closeArea);
    const rowH = Math.max(30, Math.floor((h - headH - closeArea) / rowCount));
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
    this.modalText(sw / 2, top + 16, '⭐ META UPGRADES', '#ffd166', 15);
    this.modalText(sw / 2, top + 34, `${starsAvailable(this.meta)} stars to spend`, '#ffd43b', 12);

    // Tabs.
    const tabW = Math.min(150, (w - 36) / 2);
    const tabY = top + 60;
    const tab = (label: string, key: 'upgrades' | 'towers', x: number) =>
      this.modal.push(
        ...this.button({
          x,
          y: tabY,
          w: tabW,
          h: TOUCH_MIN - 6,
          label,
          color: this.metaTab === key ? 0xffd166 : 0x555a66,
          depth: 311,
          onClick: () => {
            this.metaTab = key;
            this.openMetaPanel();
          },
        }),
      );
    tab('Upgrades', 'upgrades', sw / 2 - tabW / 2 - 6);
    tab('Towers', 'towers', sw / 2 + tabW / 2 + 6);

    const rowTop = top + headH;
    if (towers) this.drawTowerRows(left, w, rowTop, rowH);
    else this.drawUpgradeRows(left, w, rowTop, rowH);

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

  /** One meta row: title + subtitle on the left, an action button on the right. */
  private metaRow(
    left: number,
    w: number,
    rowY: number,
    rowH: number,
    title: string,
    subtitle: string,
    btnLabel: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    this.modalText(left + 16, rowY, title, '#ffffff', 12, 0);
    this.modalText(left + 16, rowY + Math.min(16, rowH * 0.36), subtitle, '#9aa0b0', 10, 0);
    const bw = Math.min(120, w * 0.3);
    // Button height tracks the (possibly compressed) row so rows never overlap.
    const bh = Math.min(TOUCH_MIN, rowH - 2);
    this.modal.push(
      ...this.button({
        x: left + w - bw / 2 - 14,
        y: rowY + 8,
        w: bw,
        h: bh,
        label: btnLabel,
        color: enabled ? 0x51cf66 : 0x555555,
        enabled,
        depth: 311,
        onClick,
      }),
    );
  }

  private drawUpgradeRows(left: number, w: number, rowTop: number, rowH: number): void {
    const avail = starsAvailable(this.meta);
    META_UPGRADES.forEach((def, i) => {
      const rowY = rowTop + i * rowH;
      const tier = this.meta.upgrades[def.key] ?? 0;
      const max = maxTier(def);
      const cost = nextTierCost(def, tier);
      const pips = '●'.repeat(tier) + '○'.repeat(max - tier);
      const affordable = cost !== null && avail >= cost;
      this.metaRow(
        left,
        w,
        rowY,
        rowH,
        `${def.name}  ${pips}`,
        tier > 0 ? def.effectLabel(tier) : 'Not purchased',
        cost === null ? 'MAXED' : affordable ? `Buy ★${cost}` : `Need ★${cost}`,
        affordable,
        () => this.buyUpgrade(def.key),
      );
    });
    // Feature unlock: 2× speed.
    const rowY = rowTop + META_UPGRADES.length * rowH;
    const owned = isUnlocked(this.meta, 'speed2x');
    const cost = UNLOCK_COST.speed2x;
    const affordable = !owned && avail >= cost;
    this.metaRow(
      left,
      w,
      rowY,
      rowH,
      `${UNLOCK_NAME.speed2x}  ${owned ? '●' : '○'}`,
      'Toggle 1×/2× game speed in a run',
      owned ? 'OWNED' : affordable ? `Buy ★${cost}` : `Need ★${cost}`,
      affordable,
      () => this.buyUnlock('speed2x'),
    );
  }

  private drawTowerRows(left: number, w: number, rowTop: number, rowH: number): void {
    const avail = starsAvailable(this.meta);
    const reached = this.highestUnlockedIndex() + 1; // 1-based campaign level reached
    TOWER_LIST.forEach((tower, i) => {
      const rowY = rowTop + i * rowH;
      const available = isTowerAvailable(this.meta, reached, tower.key);
      if (!available) {
        // Auto-unlocks by reaching its story level — or buy it early with stars.
        const cost = TOWER_UNLOCK_COST[tower.key];
        const affordable = avail >= cost;
        this.metaRow(
          left,
          w,
          rowY,
          rowH,
          `${tower.icon} ${tower.name}  🔒`,
          `Unlocks at level ${TOWER_STORY_UNLOCK[tower.key]} — or buy now`,
          affordable ? `Unlock ★${cost}` : `Need ★${cost}`,
          affordable,
          () => this.unlockTower(tower.key),
        );
        return;
      }
      const level = this.meta.towerLevels[tower.key] ?? 0;
      const cost = towerUpgradeCost(level);
      const affordable = cost !== null && avail >= cost;
      const pips = '●'.repeat(level) + '○'.repeat(TOWER_MAX_LEVEL - level);
      this.metaRow(
        left,
        w,
        rowY,
        rowH,
        `${tower.icon} ${tower.name}  ${pips}`,
        level > 0 ? towerUpgradeEffectLabel(level) : 'Base stats',
        cost === null ? 'MAX' : affordable ? `Lvl ★${cost}` : `Need ★${cost}`,
        affordable,
        () => this.buyTowerLevel(tower.key),
      );
    });
  }

  private buyUpgrade(key: (typeof META_UPGRADES)[number]['key']): void {
    const def = META_UPGRADES.find((u) => u.key === key);
    if (!def) return;
    const tier = this.meta.upgrades[key] ?? 0;
    const cost = nextTierCost(def, tier);
    if (cost === null || starsAvailable(this.meta) < cost) return;
    this.meta.upgrades[key] = tier + 1;
    this.commitMeta();
  }

  private buyTowerLevel(key: TowerTypeKey): void {
    const level = this.meta.towerLevels[key] ?? 0;
    const cost = towerUpgradeCost(level);
    if (cost === null || starsAvailable(this.meta) < cost) return;
    this.meta.towerLevels[key] = level + 1;
    this.commitMeta();
  }

  private unlockTower(key: TowerTypeKey): void {
    if (isTowerUnlocked(this.meta, key)) return;
    if (starsAvailable(this.meta) < TOWER_UNLOCK_COST[key]) return;
    this.meta.unlockedTowers[key] = true;
    this.commitMeta();
  }

  private buyUnlock(key: UnlockKey): void {
    if (isUnlocked(this.meta, key) || starsAvailable(this.meta) < UNLOCK_COST[key]) return;
    this.meta.unlocks[key] = true;
    this.commitMeta();
  }

  /** Persist + refresh the available-stars line and the (re)open the modal. */
  private commitMeta(): void {
    saveMeta(this.meta);
    this.rebuild();
    this.openMetaPanel();
  }

  // --- Story level select --------------------------------------------------

  /** Highest campaign index the player may pick (one past the last completed). */
  private highestUnlockedIndex(): number {
    const completed = loadStoryProgress()?.completedChapters ?? [];
    let maxDone = -1;
    CHAPTER_ORDER.forEach((id, i) => {
      if (completed.includes(id)) maxDone = Math.max(maxDone, i);
    });
    return Math.min(CHAPTER_ORDER.length - 1, maxDone + 1);
  }

  private openLevelSelect(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 460);
    const cols = 5;
    const rows = Math.ceil(CHAPTER_ORDER.length / cols);
    const pad = 14;
    const gap = 8;
    const headerH = 40;
    const cell = Math.floor((w - pad * 2 - gap * (cols - 1)) / cols);
    const h = Math.min(sh - 16, headerH + rows * (cell + gap) + pad + TOUCH_MIN);
    this.pushBackdrop();
    this.modal.push(
      this.add
        .rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0x69db7c, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const left = sw / 2 - w / 2;
    const top = sh / 2 - h / 2;
    const got = ratingStarsEarned(this.meta);
    const maxStars = CHAPTER_ORDER.length * 3;
    this.modalText(sw / 2, top + 18, `🗺 SELECT LEVEL · ${got}/${maxStars} ★`, '#69db7c', 14);

    const unlockedMax = this.highestUnlockedIndex();
    const gridLeft = left + pad + cell / 2;
    const gridTop = top + headerH + cell / 2;
    CHAPTER_ORDER.forEach((id, i) => {
      const cx = gridLeft + (i % cols) * (cell + gap);
      const cy = gridTop + Math.floor(i / cols) * (cell + gap);
      const unlocked = i <= unlockedMax;
      const stars = this.meta.stars[id] ?? 0;
      // Unlocked-but-not-3★ levels get an amber border to flag stars still on
      // the table; fully-starred ones go bright green; locked ones stay grey.
      const border = !unlocked ? 0x444455 : stars >= 3 ? 0x69db7c : 0xffd43b;
      const rect = this.add
        .rectangle(cx, cy, cell, cell, unlocked ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(2, border, unlocked ? 0.9 : 0.6)
        .setDepth(311);
      this.modal.push(rect);
      this.modal.push(
        this.add
          .text(cx, cy - cell * 0.12, unlocked ? `${i + 1}` : '🔒', {
            fontFamily: 'monospace',
            fontSize: `${Math.round(cell * 0.34)}px`,
            color: unlocked ? '#ffffff' : '#888888',
          })
          .setOrigin(0.5)
          .setDepth(312),
      );
      if (unlocked) {
        this.modal.push(
          this.add
            .text(cx, cy + cell * 0.28, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
              fontFamily: 'monospace',
              fontSize: `${Math.round(cell * 0.16)}px`,
              color: '#ffd43b',
            })
            .setOrigin(0.5)
            .setDepth(312),
        );
        rect
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', (
            _p: Phaser.Input.Pointer,
            _x: number,
            _y: number,
            ev?: Phaser.Types.Input.EventData,
          ) => {
            ev?.stopPropagation();
            this.playLevel(id);
          });
      }
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

  /** Start a chosen campaign level (story mode), preserving unlock progress. */
  private playLevel(id: LevelId): void {
    saveActiveMode('story');
    const progress = loadStoryProgress() ?? { levelId: id, completedChapters: [], wavesCleared: 0 };
    progress.levelId = id;
    saveStoryProgress(progress);
    clearRun('story', id); // a fresh attempt at this level
    this.cameras.main.fadeOut(280, 11, 11, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { mode: 'story', levelId: id, resume: false });
    });
  }

  // --- Records (lifetime stats + endless best) -----------------------------

  private openRecordsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 340);
    const daily = this.meta.daily;
    const quests = daily?.quests ?? [];
    const recordRows = 6;
    const dailyH = 30 + quests.length * 24 + 8;
    const h = 96 + recordRows * 26 + dailyH + TOUCH_MIN;
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
    const lx = sw / 2 - w / 2 + 20;
    const rx = sw / 2 + w / 2 - 20;
    this.modalText(sw / 2, top + 20, '🏆 RECORDS', '#74c0fc', 15);

    const lt = this.meta.lifetime;
    const best = loadEndlessBest();
    const totalStars = totalStarsEarned(this.meta);
    const { rank, next } = performerRank(totalStars);
    const lines: [string, string][] = [
      ['Performer rank', rank.title],
      ['Enemies silenced', `${lt.kills}`],
      ['Waves survived', `${lt.waves}`],
      ['Highest combo', `x${lt.highestCombo}`],
      ['Best endless wave', best > 0 ? `${best}` : '—'],
      ['Stars earned', next ? `${totalStars}  (★${next.min} → ${next.title})` : `${totalStars}`],
    ];
    lines.forEach(([label, value], i) => {
      const y = top + 56 + i * 26;
      this.modalText(lx, y, label, '#cfd3dc', 12, 0);
      this.modal.push(
        this.add
          .text(rx, y, value, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffd43b',
          })
          .setOrigin(1, 0.5)
          .setDepth(311),
      );
    });

    // --- Daily quests + streak (the come-back-tomorrow hook). ---------------
    let dy = top + 56 + recordRows * 26 + 4;
    this.modalText(lx, dy, `📅 DAILY  ·  🔥 Day ${daily?.streak ?? 1} streak`, '#ffd166', 12, 0);
    dy += 24;
    if (quests.length === 0) {
      this.modalText(lx, dy, 'Play to roll today’s quests.', '#9aa0b0', 11, 0);
    }
    for (const q of quests) {
      const def = questById(q.id);
      if (!def) continue;
      const mark = q.done ? '✓' : '○';
      this.modalText(lx, dy, `${mark} ${def.label}`, q.done ? '#69db7c' : '#cfd3dc', 11, 0);
      this.modal.push(
        this.add
          .text(rx, dy, q.done ? 'done' : `+${def.reward} fans`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: q.done ? '#69db7c' : '#ff9ed8',
          })
          .setOrigin(1, 0.5)
          .setDepth(311),
      );
      dy += 24;
    }

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
