import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import type { LevelId } from '../data/levels';
import { MODES, type GameMode, type ModeInfo } from '../data/modes';
import { CHAPTER_ORDER } from '../data/story';
import {
  isFeatureUnlocked,
  featuresUnlockedBetween,
  FEATURE_LABEL,
  chaptersCleared,
} from '../data/progression';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';
import {
  META_UPGRADES,
  maxTier,
  starsAvailable,
  totalStarsEarned,
  ratingStarsEarned,
  performerRank,
  addFame,
  researchTier,
  nextResearchFameCost,
  isResearchDeepUnlocked,
  buyResearchTier,
  unlockResearchDeep,
  isTowerUnlocked,
  isTowerAvailable,
  TOWER_UNLOCK_COST,
  TOWER_STORY_UNLOCK,
  unlockBranch,
  unlockBranchDeep,
  isUnlocked,
  UNLOCK_COST,
  UNLOCK_NAME,
  PLATINUM_PERKS,
  type MetaProgress,
} from '../data/meta';
import {
  TOWER_META_TREE,
  branchLevel,
  branchFameCost,
  branchBuyBlock,
  buyBranchLevel,
  respecTower,
} from '../data/towerMeta';
import {
  ACHIEVEMENTS,
  isAchieved,
  isClaimed,
  claimAchievement,
  claimableCount,
  type AchieveCtx,
} from '../data/achievements';
import { rollDaily, dateKey, yesterdayKey, questById } from '../data/quests';
import { pickSetlist } from '../data/setlist';
import { nextEndlessMilestone } from '../data/waves';
import { makeTreeNode } from '../ui/treeNode';
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
  loadSeenRank,
  saveSeenRank,
  loadSeenChapters,
  saveSeenChapters,
  saveUnlockHighWater,
} from '../systems/storage';
import { audio } from '../systems/audio';
import { haptics } from '../systems/haptics';
import { pressFeedback } from '../systems/touch';
import { addNeonCameraFX } from '../systems/fx';
import { TX } from '../systems/textures';

const STOP = (
  _p: Phaser.Input.Pointer,
  _x: number,
  _y: number,
  ev?: Phaser.Types.Input.EventData,
) => ev?.stopPropagation();

/** Bump this whenever the game is patched — shown in the menu corner. */
const LAST_PATCH = '2026-06-18 · Prestige New Game+ skip';

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
  /** Active tab in the Upgrades modal. */
  private metaTab: 'research' | 'towers' | 'unlocks' = 'research';
  /** When set, the Towers tab shows this tower's branch sub-panel. */
  private branchTower: TowerTypeKey | null = null;
  /** Active tab in the Records modal. */
  private recordsTab: 'stats' | 'achievements' = 'stats';
  /** Objects belonging to the currently open modal (destroyed on close). */
  private modal: Phaser.GameObjects.GameObject[] = [];
  /** "Welcome back" lines (offline Fame + login streak), shown once on entry. */
  private welcomeLines: string[] = [];
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
    this.welcomeLines = [];
    this.meta = loadMeta();
    // Offline Fame waits for the Fame economy (chapter 1); the daily quests +
    // login streak are their own later unlock (chapter 8).
    if (isFeatureUnlocked('fame')) this.grantOffline();
    if (isFeatureUnlocked('dailies')) this.refreshDaily();
    this.checkUnlocks();
    this.checkRankUp();
    this.meta.lastSeen = Date.now();
    saveMeta(this.meta);
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.cameras.main.fadeIn(350, 11, 11, 18);
    addNeonCameraFX(this.cameras.main);
    audio.playMusic('menu');
    this.rebuild();
    if (this.welcomeLines.length > 0) this.showWelcomeToast();
    this.scale.on('resize', this.resizeHandler);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeHandler));
  }

  /**
   * Offline Fame: your fans keep talking while you're away. Grants capped Fame
   * scaled by time since the last visit (and a little by prestige) — a gentle
   * reason to come back, never a replacement for playing.
   */
  private grantOffline(): void {
    const last = this.meta.lastSeen ?? 0;
    if (last <= 0) return; // first ever visit — nothing to grant
    const hours = Math.max(0, (Date.now() - last) / 3_600_000);
    if (hours < 0.05) return; // ignore quick re-entries
    const ratePerHour = 25 + 10 * (this.meta.platinum ?? 0);
    const fame = Math.floor(Math.min(hours, 12) * ratePerHour); // cap 12h
    if (fame <= 0) return;
    addFame(this.meta, fame);
    this.welcomeLines.push(`🎤 While you were away: +${fame} Fame`);
  }

  /**
   * Roll today's daily quests + login streak (no-op if already current). A new
   * day banks a streak Fame bonus — the "come back tomorrow" hook.
   */
  private refreshDaily(): void {
    const now = new Date();
    const { state, loginFans } = rollDaily(this.meta.daily, dateKey(now), yesterdayKey(now));
    this.meta.daily = state;
    if (loginFans > 0) {
      addFame(this.meta, loginFans);
      this.welcomeLines.push(`🔥 Day ${state.streak} streak! +${loginFans} Fame`);
    }
  }

  /**
   * Progressive disclosure: when the player has cleared new chapters since they
   * last saw the menu, announce any features that just crossed their unlock
   * threshold (queued into the welcome toast + a fanfare). First-ever visit just
   * records the baseline silently so existing saves don't spam reveals.
   */
  private checkUnlocks(): void {
    const now = chaptersCleared();
    saveUnlockHighWater(now); // lock in progress so prestige never re-gates features
    const seen = loadSeenChapters();
    if (seen >= 0 && now > seen) {
      const revealed = featuresUnlockedBetween(seen, now);
      if (revealed.length > 0) {
        for (const f of revealed) this.welcomeLines.push(`🔓 New: ${FEATURE_LABEL[f]}!`);
        audio.sfx('fanfare');
        haptics.play('win');
      }
    }
    saveSeenChapters(now);
  }

  /**
   * Performer rank-up flourish: if the career title has advanced since the
   * player last saw the menu, queue a toast line + play the fanfare. Monotonic
   * (stars only ever increase), so any change is a promotion.
   */
  private checkRankUp(): void {
    const title = performerRank(totalStarsEarned(this.meta)).rank.title;
    const seen = loadSeenRank();
    if (seen && seen !== title) {
      this.welcomeLines.push(`🌟 Ranked up: ${title}!`);
      audio.sfx('fanfare');
      haptics.play('win');
    }
    saveSeenRank(title);
  }

  /** One-off centered "welcome back" toast (login streak + offline Fame). */
  private showWelcomeToast(): void {
    const msg = this.welcomeLines.join('\n');
    this.welcomeLines = [];
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
      delay: 2000,
      duration: 1000,
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

    // Progressive disclosure: the rank / stars / Fame header only appears once
    // the Fame economy has unlocked (after the first chapter). A brand-new
    // player just sees the title + the Story card — nothing to parse.
    const fameUnlocked = isFeatureUnlocked('fame');
    let cardsTop = titleY + 48;
    if (fameUnlocked) {
      const rank = performerRank(totalStarsEarned(this.meta)).rank;
      const plat = this.meta.platinum ?? 0;
      this.text(
        sw / 2,
        titleY + 30,
        plat > 0 ? `🎙 ${rank.title}  ✦${plat}` : `🎙 ${rank.title}`,
        plat > 0 ? '#e9d8ff' : '#f783ac',
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
      cardsTop = titleY + 112;
    }

    // "Go Platinum" appears once the campaign's final chapter is cleared.
    if (this.campaignComplete()) {
      const py = titleY + 104;
      this.button({
        x: sw / 2, y: py, w: Math.min(260, sw - 60), h: TOUCH_MIN - 4,
        label: '✦ GO PLATINUM', color: 0xc9b6ff,
        onClick: () => this.requestPrestige(),
      });
      cardsTop = py + 30;
    }
    this.drawModeCards(portrait, cardsTop);

    // Bottom action buttons — only the unlocked ones show, laid out evenly so
    // an early-game menu stays uncluttered (just Levels at the very start).
    const actions: { label: string; color: number; onClick: () => void }[] = [];
    if (fameUnlocked) {
      actions.push({ label: '⭐ Upgrades', color: 0xffd166, onClick: () => this.openMetaPanel() });
    }
    actions.push({ label: '🗺 Levels', color: 0x69db7c, onClick: () => this.openLevelSelect() });
    if (isFeatureUnlocked('records')) {
      actions.push({
        label: claimableCount(this.achieveCtx()) > 0 ? '🏆 Records ●' : '🏆 Records',
        color: 0x74c0fc,
        onClick: () => this.openRecordsPanel(),
      });
    }
    const by = sh - TOUCH_MIN / 2 - 14;
    const gap = 8;
    const bw = Math.min(190, (sw - 24 - gap * (actions.length - 1)) / actions.length);
    const rowW = bw * actions.length + gap * (actions.length - 1);
    actions.forEach((a, i) => {
      this.button({
        x: sw / 2 - rowW / 2 + bw / 2 + i * (bw + gap),
        y: by, w: bw, h: TOUCH_MIN,
        label: a.label, color: a.color, onClick: a.onClick,
      });
    });

    // Settings (sound / volume / haptics) — a gear in the top-right corner.
    const gear = this.add
      .text(sw - 10, 10, '⚙', { fontFamily: 'monospace', fontSize: '22px', color: '#ffd166' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    gear.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => {
      ev?.stopPropagation();
      this.openSettingsPanel();
    });
    this.root.add(gear);

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

  /** Sound / volume / haptics — the same controls as the in-run pause menu,
   *  reachable from the main menu via the ⚙ button so you can set them up front. */
  private openSettingsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 320);
    const showBuzz = haptics.supported;
    const h = showBuzz ? 300 : 234;
    this.pushBackdrop();
    this.modal.push(
      this.add.rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xffd166, 0.9).setDepth(310).setInteractive().on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    const bw = Math.min(240, w - 40);
    this.modalText(sw / 2, top + 22, '⚙ SETTINGS', '#ffd166', 15);

    // Explicit row centres (each ≥TOUCH_MIN tall control needs clear spacing).
    this.modal.push(...this.button({
      x: sw / 2, y: top + 58, w: bw, h: TOUCH_MIN,
      label: audio.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
      color: audio.muted ? 0xff6b6b : 0x51cf66, depth: 311,
      onClick: () => { audio.toggleMuted(); this.openSettingsPanel(); },
    }));

    this.modalText(sw / 2, top + 102, `Volume  ${Math.round(audio.volume * 100)}%`, '#cfd3dc', 12);
    const volY = top + 128;
    const stepW = TOUCH_MIN;
    const barW = bw - stepW * 2 - 16;
    this.modal.push(...this.button({
      x: sw / 2 - barW / 2 - stepW / 2 - 4, y: volY, w: stepW, h: TOUCH_MIN, label: '−', color: 0xffd166, depth: 311,
      onClick: () => { audio.setVolume(audio.volume - 0.1); this.openSettingsPanel(); },
    }));
    this.modal.push(...this.button({
      x: sw / 2 + barW / 2 + stepW / 2 + 4, y: volY, w: stepW, h: TOUCH_MIN, label: '+', color: 0xffd166, depth: 311,
      onClick: () => { audio.setVolume(audio.volume + 0.1); this.openSettingsPanel(); },
    }));
    this.modal.push(
      this.add.rectangle(sw / 2, volY, barW, 10, 0x232336).setStrokeStyle(1, 0x555566, 0.9).setDepth(311),
      this.add.rectangle(sw / 2 - barW / 2, volY, barW * audio.volume, 10, 0xffd166).setOrigin(0, 0.5).setDepth(312),
    );

    if (showBuzz) {
      this.modal.push(...this.button({
        x: sw / 2, y: top + 192, w: bw, h: TOUCH_MIN,
        label: haptics.isEnabled() ? '📳 Buzz: ON' : '📴 Buzz: OFF',
        color: haptics.isEnabled() ? 0x51cf66 : 0xff6b6b, depth: 311,
        onClick: () => { haptics.toggle(); haptics.play('tap'); this.openSettingsPanel(); },
      }));
    }

    this.modal.push(...this.button({
      x: sw / 2, y: top + h - 14 - TOUCH_MIN / 2, w: Math.min(140, w - 40), h: TOUCH_MIN,
      label: 'Close', color: 0xff6b6b, depth: 311, onClick: () => this.closeModal(),
    }));
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
   * Fame banner — every system (kills, waves, quests, crates, daily streak)
   * feeds this single grind currency, spent in the Upgrades tree. Drawn under
   * the star line with a goal tease (campaign % + the next act to unlock) so
   * there's always a visible "next thing".
   */
  private drawFanMeter(cx: number, cy: number, _width: number): void {
    this.text(cx, cy - 6, `🎤 ${Math.floor(this.meta.fame)} Fame — spend it in Upgrades`, '#ff9ed8', 12);

    const maxStars = CHAPTER_ORDER.length * 3;
    const got = ratingStarsEarned(this.meta);
    const completion = Math.round((got / maxStars) * 100);
    this.text(
      cx,
      cy + 14,
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

    // Endless is hidden until unlocked, so a new player only sees Story.
    const modes = MODES.filter((m) => m.key !== 'endless' || isFeatureUnlocked('endless'));
    const n = modes.length;

    let cardW: number;
    let cardH: number;
    const centers: { x: number; y: number }[] = [];
    if (portrait || n === 1) {
      cardW = Math.min(sw - 28, 460);
      cardH = Math.min((areaH - 16) / n, n === 1 ? 240 : 210);
      const stackH = cardH * n + 16 * (n - 1);
      const stackTop = top + Math.max(0, (areaH - stackH) / 2);
      modes.forEach((_, i) => {
        centers.push({ x: sw / 2, y: stackTop + cardH / 2 + i * (cardH + 16) });
      });
    } else {
      cardW = Math.min((sw - 44) / 2, 340);
      cardH = Math.min(areaH, 280);
      const cy = top + cardH / 2;
      centers.push({ x: sw / 2 - cardW / 2 - 10, y: cy });
      centers.push({ x: sw / 2 + cardW / 2 + 10, y: cy });
    }

    modes.forEach((mode, i) => {
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
    let firstStory = false;
    if (mode.key === 'endless') {
      const best = loadEndlessBest();
      detail = best > 0 ? `Best: wave ${best} — beat it!` : 'No record yet';
      resumable = hasRun('endless', 'endless');
      // Up to two flavour lines: the next unclaimed milestone reward + today's
      // Setlist. Stacked so neither overruns the card's Play button.
      const flavor: { text: string; color: string }[] = [];
      const nextMs = nextEndlessMilestone(this.meta.endlessMilestones);
      flavor.push({ text: `🏅 Next: wave ${nextMs.wave} → +${nextMs.fame} Fame`, color: '#ffd166' });
      if (isFeatureUnlocked('dailies')) {
        const sl = pickSetlist(dateKey(new Date()));
        if (sl.fanMult > 1) flavor.push({ text: `🎵 Tonight: ${sl.name} · ${sl.fanMult}× fans`, color: '#ff9ed8' });
      }
      flavor.slice(0, 2).forEach((f, i) => this.text(cx, cardTop + 142 + i * 16, f.text, f.color, 10));
    } else {
      const progress = loadStoryProgress();
      const done = progress?.completedChapters.length ?? 0;
      detail =
        done >= CHAPTER_ORDER.length
          ? 'Campaign complete!'
          : `Level ${Math.min(done + 1, CHAPTER_ORDER.length)} of ${CHAPTER_ORDER.length}`;
      resumable = progress !== null && hasRun('story', progress.levelId);
      firstStory = done === 0 && !resumable; // brand-new player
    }
    this.text(cx, cardTop + 124, detail, '#ffd43b', 12);

    const btnW = cardW - 28;
    const resumeY = cardTop + cardH - 14 - TOUCH_MIN / 2;
    const playY = resumable ? resumeY - TOUCH_MIN - 8 : resumeY;
    // Once the campaign is complete, the bright "Go Platinum" button up top is
    // the intended next step — a fresh story run just replays (no reward) and
    // wipes unlock progress. Relabel + mute it so it isn't the obvious tap.
    const storyDone = mode.key === 'story' && this.campaignComplete();
    this.button({
      x: cx,
      y: playY,
      w: btnW,
      h: TOUCH_MIN,
      label: storyDone ? '↺ Replay (no ✦)' : resumable ? '▶ New Game' : '▶ Play',
      color: storyDone ? 0x9aa0b0 : 0x51cf66,
      onClick: () => this.requestNewGame(mode.key),
    });
    // First-timer nudge: a gentle pulsing pointer to the Story Play button.
    if (firstStory) {
      const hint = this.text(cx, playY - TOUCH_MIN / 2 - 12, '👇 New here? Tap to start', '#69db7c', 11);
      this.tweens.add({ targets: hint, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
    }
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

  /**
   * "New Game" guard: starting a fresh campaign wipes story unlock progress, and
   * a fresh endless run abandons the one in progress — both easy to hit by
   * accident. Confirm first when there's something to lose; otherwise just start.
   */
  private requestNewGame(mode: GameMode): void {
    if (mode === 'story') {
      const prog = loadStoryProgress();
      const done = prog?.completedChapters.length ?? 0;
      const hasProgress =
        !!prog && (done > 0 || (prog.wavesCleared ?? 0) > 0 || hasRun('story', prog.levelId));
      if (hasProgress) {
        this.confirmModal(
          'Start a new campaign?',
          [
            `This resets your campaign — you've cleared`,
            `${done}/${CHAPTER_ORDER.length} chapters (now on Level ${Math.min(done + 1, CHAPTER_ORDER.length)}).`,
            'Your stars, upgrades & fans are kept.',
          ],
          'Erase & start new',
          () => this.startMode('story', false),
        );
        return;
      }
    } else if (mode === 'endless' && hasRun('endless', 'endless')) {
      this.confirmModal(
        'Start a new endless run?',
        ['Your run in progress will be abandoned.', 'Your best wave is kept.'],
        'Start new',
        () => this.startMode('endless', false),
      );
      return;
    }
    this.startMode(mode, false);
  }

  /** A two-button confirmation modal (Cancel / destructive confirm). */
  private confirmModal(
    title: string,
    lines: string[],
    confirmLabel: string,
    onConfirm: () => void,
  ): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 360);
    const h = 64 + lines.length * 20 + 16 + TOUCH_MIN;
    this.pushBackdrop();
    this.modal.push(
      this.add
        .rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xff6b6b, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 22, `⚠ ${title}`, '#ffd43b', 15);
    lines.forEach((lineStr, i) =>
      this.modalText(sw / 2, top + 50 + i * 20, lineStr, '#cfd3dc', 11),
    );
    const by = top + h - 14 - TOUCH_MIN / 2;
    const gap = 10;
    const bw = Math.min(160, (w - 40 - gap) / 2);
    this.modal.push(
      ...this.button({
        x: sw / 2 - (bw + gap) / 2,
        y: by,
        w: bw,
        h: TOUCH_MIN,
        label: 'Cancel',
        color: 0x74c0fc,
        depth: 311,
        onClick: () => this.closeModal(),
      }),
    );
    this.modal.push(
      ...this.button({
        x: sw / 2 + (bw + gap) / 2,
        y: by,
        w: bw,
        h: TOUCH_MIN,
        label: confirmLabel,
        color: 0xff6b6b,
        depth: 311,
        onClick: () => {
          this.closeModal();
          onConfirm();
        },
      }),
    );
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

  // --- Prestige ("Go Platinum") --------------------------------------------

  /** Campaign's final chapter cleared → prestige is available. */
  private campaignComplete(): boolean {
    const last = CHAPTER_ORDER[CHAPTER_ORDER.length - 1];
    return (loadStoryProgress()?.completedChapters ?? []).includes(last);
  }

  /** New Game+ skip: each prestige starts the campaign further in (5 chapters
   *  per ✦), so repeat runs aren't a full 60-level slog. Always leaves ≥10 to play. */
  private prestigeSkip(platinum: number): number {
    return Math.min(platinum * 5, CHAPTER_ORDER.length - 10);
  }

  private requestPrestige(): void {
    const next = (this.meta.platinum ?? 0) + 1;
    const skip = this.prestigeSkip(next);
    this.confirmModal(
      'Go Platinum?',
      [
        `New Game+: replay from chapter ${skip + 1} (earlier chapters skipped).`,
        `Permanent: +15% Fame & gold per ✦ (you'll be ✦${next}) + pick a perk.`,
        'Your Fame, upgrades, stars & unlocks are all kept.',
      ],
      '✦ Go Platinum',
      () => this.openPrestigePerkPanel(),
    );
  }

  /** Pick one permanent perk, then commit the prestige. Perks stack across ✦. */
  private openPrestigePerkPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 340);
    const h = 84 + PLATINUM_PERKS.length * (TOUCH_MIN + 8) + TOUCH_MIN + 20;
    this.pushBackdrop();
    this.modal.push(
      this.add.rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xc9b6ff, 0.9).setDepth(310).setInteractive().on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 22, '✦ GO PLATINUM — pick a perk', '#e9d8ff', 14);
    this.modalText(sw / 2, top + 42, 'permanent · stacks each prestige', '#9aa0b0', 10);

    PLATINUM_PERKS.forEach((p, i) => {
      const have = this.meta.platinumPerks?.[p.key] ?? 0;
      this.modal.push(...this.button({
        x: sw / 2, y: top + 70 + TOUCH_MIN / 2 + i * (TOUCH_MIN + 8),
        w: Math.min(280, w - 40), h: TOUCH_MIN,
        label: have > 0 ? `${p.label}   (×${have})` : p.label,
        color: 0xc9b6ff, depth: 311,
        onClick: () => {
          this.meta.platinumPerks = this.meta.platinumPerks ?? {};
          this.meta.platinumPerks[p.key] = (this.meta.platinumPerks[p.key] ?? 0) + 1;
          this.doPrestige();
        },
      }));
    });
    this.modal.push(...this.button({
      x: sw / 2, y: top + h - 14 - TOUCH_MIN / 2, w: Math.min(140, w - 40), h: TOUCH_MIN,
      label: 'Cancel', color: 0x9aa0b0, depth: 311, onClick: () => this.closeModal(),
    }));
  }

  private doPrestige(): void {
    haptics.play('win');
    audio.sfx('fanfare');
    this.cameras.main.flash(420, 255, 215, 120); // warm platinum wash
    // Prestige wipes campaign progress; lock in the all-cleared high-water mark
    // first so every unlocked feature stays available afterwards.
    saveUnlockHighWater(CHAPTER_ORDER.length);
    const newPlat = (this.meta.platinum ?? 0) + 1;
    this.meta.platinum = newPlat;
    // New Game+: auto-complete the early chapters and resume deeper, so prestige
    // isn't a full replay. Stars already earned are kept; skipped chapters stay
    // replayable from the Levels grid.
    const skip = this.prestigeSkip(newPlat);
    clearStoryProgress();
    CHAPTER_ORDER.forEach((id) => clearRun('story', id));
    saveStoryProgress({
      levelId: CHAPTER_ORDER[skip],
      completedChapters: CHAPTER_ORDER.slice(0, skip),
      wavesCleared: 0,
    });
    saveMeta(this.meta);
    this.rebuild();
  }

  // --- Meta-upgrade tree ---------------------------------------------------

  private openMetaPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 460);

    // A branch sub-panel (one tower's tree) is its own focused view.
    if (this.metaTab === 'towers' && this.branchTower) {
      this.drawBranchPanel(w);
      return;
    }

    const rowCount =
      this.metaTab === 'research' ? META_UPGRADES.length :
      this.metaTab === 'towers' ? TOWER_LIST.length :
      TOWER_LIST.length + 1; // unlocks: towers + 2× speed
    const headH = 96;
    const closeArea = TOUCH_MIN + 14;
    const idealRowH = TOUCH_MIN + 18;
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
    this.modalText(sw / 2, top + 16, '⭐ UPGRADES', '#ffd166', 15);
    this.modalText(
      sw / 2, top + 34,
      `★ ${starsAvailable(this.meta)} stars  ·  🎤 ${Math.floor(this.meta.fame)} Fame`,
      '#ffd43b', 12,
    );

    // Tabs: Research (Fame) / Towers (Fame branches, gated) / Unlocks (Stars).
    // The branch tab only appears once branch trees have unlocked; tabs lay out
    // evenly so the header stays balanced with two tabs or three.
    const tabs: { label: string; key: 'research' | 'towers' | 'unlocks' }[] = [
      { label: 'Research', key: 'research' },
    ];
    if (isFeatureUnlocked('branches')) tabs.push({ label: 'Towers', key: 'towers' });
    tabs.push({ label: 'Unlocks', key: 'unlocks' });
    if (this.metaTab === 'towers' && !isFeatureUnlocked('branches')) this.metaTab = 'research';

    const tabW = Math.min(120, (w - 40) / tabs.length);
    const tabY = top + 60;
    const tabGap = 8;
    const tabsW = tabW * tabs.length + tabGap * (tabs.length - 1);
    tabs.forEach((t, i) => {
      this.modal.push(
        ...this.button({
          x: sw / 2 - tabsW / 2 + tabW / 2 + i * (tabW + tabGap),
          y: tabY, w: tabW, h: TOUCH_MIN - 6, label: t.label,
          color: this.metaTab === t.key ? 0xffd166 : 0x555a66,
          depth: 311,
          onClick: () => { this.metaTab = t.key; this.branchTower = null; this.openMetaPanel(); },
        }),
      );
    });

    const rowTop = top + headH;
    if (this.metaTab === 'research') this.drawResearchRows(left, w, rowTop, rowH);
    else if (this.metaTab === 'towers') this.drawTowerRows(left, w, rowTop, rowH);
    else this.drawUnlockRows(left, w, rowTop, rowH);

    this.modal.push(
      ...this.button({
        x: sw / 2, y: top + h - 14 - TOUCH_MIN / 2,
        w: Math.min(140, w - 40), h: TOUCH_MIN,
        label: 'Close', color: 0xff6b6b, depth: 311,
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

  /** Research tree: Fame buys each tier; deep tiers need a one-time Star unlock. */
  private drawResearchRows(left: number, w: number, rowTop: number, rowH: number): void {
    const avail = starsAvailable(this.meta);
    const accent = 0xffd166; // uniform "research" gold
    const nameX = left + 12;
    const chainL = left + w * 0.46;
    const chainR = left + w - 22;
    META_UPGRADES.forEach((def, i) => {
      const rowY = rowTop + i * rowH;
      const cy = rowY + rowH / 2;
      const tier = researchTier(this.meta, def.key);
      const max = maxTier(def);
      const deepUnlocked = isResearchDeepUnlocked(this.meta, def.key);
      const maxed = tier >= max;

      // Name + current effect on the left.
      this.modalText(nameX, cy - 7, def.name, this.hex(accent), 11, 0);
      this.modalText(nameX, cy + 7, tier > 0 ? def.effectLabel(tier) : 'Not purchased', '#9aa0b0', 9, 0);
      if (maxed) this.modalText(chainR + 8, cy, 'MAX', '#69db7c', 10, 1);

      // Horizontal node ladder on the right.
      const gap = max > 1 ? Phaser.Math.Clamp((chainR - chainL) / (max - 1), 16, 40) : 0;
      const r = Phaser.Math.Clamp(Math.floor(rowH * 0.2), 5, 9);
      const links = this.add.graphics().setDepth(311);
      this.modal.push(links);
      for (let j = 1; j <= max; j++) {
        const x = chainL + (j - 1) * gap;
        if (j > 1) {
          const on = j <= tier;
          links.lineStyle(2, on ? accent : 0x33333f, on ? 0.9 : 0.7);
          links.beginPath();
          links.moveTo(x - gap + r, cy);
          links.lineTo(x - r, cy);
          links.strokePath();
        }
        let state: 'owned' | 'next' | 'gate' | 'locked' | 'future' = 'future';
        let costLabel = '';
        let action: (() => void) | null = null;
        if (j <= tier) {
          state = 'owned';
        } else if (j === tier + 1 && !maxed) {
          if (tier >= def.freeTiers && !deepUnlocked) {
            costLabel = `★${def.deepStars}`;
            if (avail >= def.deepStars) {
              state = 'gate';
              action = () => { if (unlockResearchDeep(this.meta, def.key)) this.commitMeta(); };
            } else {
              state = 'locked';
            }
          } else {
            // Always the glowing "next" (buyResearchTier guards Fame, so a tap
            // while short simply no-ops) — consistent with the branch tree.
            costLabel = `🎤${nextResearchFameCost(def, tier) ?? 0}`;
            state = 'next';
            action = () => { if (buyResearchTier(this.meta, def.key)) this.commitMeta(); };
          }
        }
        this.drawBranchNode(x, cy, r, { state, accent, capstone: false, costLabel, action });
      }
    });
  }

  /** Towers tab: a summary row per tower; tap to open its branch tree. */
  private drawTowerRows(left: number, w: number, rowTop: number, rowH: number): void {
    TOWER_LIST.forEach((tower, i) => {
      const rowY = rowTop + i * rowH;
      const branches = TOWER_META_TREE[tower.key].branches;
      const summary = branches
        .map((b) => `${b.name} ${branchLevel(this.meta, tower.key, b.key)}`)
        .join(' · ');
      this.metaRow(left, w, rowY, rowH, `${tower.icon} ${tower.name}`, summary, 'View ▸', true, () => {
        this.branchTower = tower.key;
        this.openMetaPanel();
      });
    });
  }

  /** Unlocks tab (Stars): tower unlocks + the 2× speed feature. */
  private drawUnlockRows(left: number, w: number, rowTop: number, rowH: number): void {
    const avail = starsAvailable(this.meta);
    TOWER_LIST.forEach((tower, i) => {
      const rowY = rowTop + i * rowH;
      const owned = isTowerUnlocked(this.meta, tower.key);
      const cost = TOWER_UNLOCK_COST[tower.key];
      const ok = !owned && avail >= cost;
      this.metaRow(left, w, rowY, rowH,
        `${tower.icon} ${tower.name}  ${owned ? '●' : '🔒'}`,
        owned ? 'Available' : `Auto-unlocks at level ${TOWER_STORY_UNLOCK[tower.key]} — or buy now`,
        owned ? 'OWNED' : ok ? `Unlock ★${cost}` : `Need ★${cost}`, ok,
        () => { this.meta.unlockedTowers[tower.key] = true; this.commitMeta(); });
    });
    const rowY = rowTop + TOWER_LIST.length * rowH;
    const owned = isUnlocked(this.meta, 'speed2x');
    const cost = UNLOCK_COST.speed2x;
    const ok = !owned && avail >= cost;
    this.metaRow(left, w, rowY, rowH, `${UNLOCK_NAME.speed2x}  ${owned ? '●' : '○'}`,
      'Toggle 1×/2× game speed in a run',
      owned ? 'OWNED' : ok ? `Buy ★${cost}` : `Need ★${cost}`, ok,
      () => { this.meta.unlocks.speed2x = true; this.commitMeta(); });
  }

  /** Per-tower branch tree: invest Fame per branch, with star gates + respec. */
  private drawBranchPanel(w: number): void {
    const tower = this.branchTower!;
    const { sw, sh } = this;
    const branches = TOWER_META_TREE[tower].branches;
    const def = TOWER_LIST.find((t) => t.key === tower)!;
    const headH = 76;
    const footH = TOUCH_MIN * 2 + 26; // respec + back
    const maxLevels = Math.max(...branches.map((b) => b.maxLevel));
    const h = Math.min(sh - 12, headH + footH + 64 + maxLevels * 46);
    this.pushBackdrop();
    this.modal.push(
      this.add.rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0xffd166, 0.9).setDepth(310).setInteractive().on('pointerdown', STOP),
    );
    const left = sw / 2 - w / 2;
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 16, `${def.icon} ${def.name}`, '#ffffff', 15);
    this.modalText(sw / 2, top + 34, `🎤 ${Math.floor(this.meta.fame)} Fame  ·  ★ ${starsAvailable(this.meta)}`, '#ffd43b', 11);

    const avail = starsAvailable(this.meta);
    const fame = Math.floor(this.meta.fame);
    const accent = def.color;

    // --- Skill-tree layout: tower root → one node column per branch ---
    const treeTop = top + headH;
    const treeBottom = top + h - footH;
    const nBr = branches.length;
    const colW = w / nBr;
    const rootX = sw / 2;
    const rootY = treeTop + 14;
    const labelY = rootY + 30; // branch name + axis
    const firstY = labelY + 30; // first node of each branch
    // Reserve room for the capstone caption, and let the gap (and node radius)
    // shrink to fit short / landscape viewports rather than overrun the footer.
    const capReserve = branches.some((b) => b.capstone) ? 18 : 4;
    const gap = Phaser.Math.Clamp(
      (treeBottom - firstY - capReserve) / Math.max(1, maxLevels - 1),
      20,
      46,
    );
    const r = Phaser.Math.Clamp(Math.floor(gap * 0.32), 5, 13);

    // Connector lines live under the nodes in a single Graphics.
    const links = this.add.graphics().setDepth(311);
    this.modal.push(links);

    branches.forEach((_, i) => {
      const x = left + colW * (i + 0.5);
      links.lineStyle(3, 0x44445a, 0.8);
      links.beginPath();
      links.moveTo(rootX, rootY + r);
      links.lineTo(x, firstY - r);
      links.strokePath();
    });

    // Tower root node.
    this.modal.push(
      this.add.circle(rootX, rootY, r + 5, 0x232336, 0.98).setStrokeStyle(2, 0xffd166, 0.9).setDepth(312),
    );
    this.modal.push(
      this.add.text(rootX, rootY, def.icon, { fontFamily: 'monospace', fontSize: `${Math.round(r * 1.3)}px` })
        .setOrigin(0.5).setDepth(313),
    );

    branches.forEach((b, i) => {
      const x = left + colW * (i + 0.5);
      const lvl = branchLevel(this.meta, tower, b.key);
      const block = branchBuyBlock(this.meta, tower, b, fame);
      const lockedBranch = block === 'locked';

      this.modalText(x, labelY - 6, b.name, lockedBranch ? '#8a8a96' : this.hex(accent), 11);
      this.modalText(x, labelY + 7, this.branchAxisShort(b.axis), '#9aa0b0', 9);

      for (let j = 1; j <= b.maxLevel; j++) {
        const y = firstY + (j - 1) * gap;
        const isCap = !!b.capstone && j === b.maxLevel;
        if (j > 1) {
          const on = j <= lvl; // link filled only between two owned nodes
          links.lineStyle(3, on ? accent : 0x33333f, on ? 0.95 : 0.7);
          links.beginPath();
          links.moveTo(x, y - gap + r);
          links.lineTo(x, y - r);
          links.strokePath();
        }

        let state: 'owned' | 'next' | 'gate' | 'locked' | 'future' = 'future';
        let costLabel = '';
        let action: (() => void) | null = null;
        if (lockedBranch) {
          state = 'locked';
          if (j === 1) {
            const can = avail >= b.unlockStars;
            costLabel = `★${b.unlockStars}`;
            if (can) {
              state = 'gate';
              action = () => { if (unlockBranch(this.meta, tower, b.key)) this.commitMeta(); };
            }
          }
        } else if (j <= lvl) {
          state = 'owned';
        } else if (j === lvl + 1) {
          if (block === 'needsDeepStar') {
            const can = avail >= b.deepStars;
            costLabel = `★${b.deepStars}`;
            if (can) {
              state = 'gate';
              action = () => { if (unlockBranchDeep(this.meta, tower, b.key)) this.commitMeta(); };
            } else {
              state = 'locked';
            }
          } else if (block === null) {
            state = 'next';
            costLabel = `🎤${branchFameCost(b, lvl + 1)}`;
            action = () => {
              if (buyBranchLevel(this.meta, tower, b.key)) {
                const maxed = branchLevel(this.meta, tower, b.key) >= b.maxLevel;
                this.commitMeta(maxed ? 'levelUp' : 'gold');
              }
            };
          }
        }
        this.drawBranchNode(x, y, r, { state, accent, capstone: isCap, costLabel, action });
      }

      // Capstone effect caption under the column (so the payoff is legible).
      if (b.capstone) {
        this.modalText(x, firstY + (b.maxLevel - 1) * gap + r + 11, b.capstone.label, '#c9b6ff', 8);
      }
    });

    const by = top + h - 14 - TOUCH_MIN / 2;
    const backY = by - TOUCH_MIN - 8;
    const invested = branches.reduce((s, b) => {
      let t = 0;
      for (let l = 1; l <= branchLevel(this.meta, tower, b.key); l++) t += branchFameCost(b, l);
      return s + t;
    }, 0);
    this.modal.push(
      ...this.button({
        x: sw / 2, y: backY, w: Math.min(220, w - 40), h: TOUCH_MIN,
        label: invested > 0 ? `↺ Respec  (+${invested} Fame)` : '↺ Respec',
        color: invested > 0 ? 0xffa94d : 0x555555, enabled: invested > 0, depth: 311,
        onClick: () => { respecTower(this.meta, tower); this.commitMeta(); },
      }),
    );
    this.modal.push(
      ...this.button({
        x: sw / 2, y: by, w: Math.min(140, w - 40), h: TOUCH_MIN,
        label: '← Back', color: 0x74c0fc, depth: 311,
        onClick: () => { this.branchTower = null; this.openMetaPanel(); },
      }),
    );
  }

  /** One skill-tree node (delegates to the shared primitive; depth 311+). */
  private drawBranchNode(
    x: number,
    y: number,
    r: number,
    opts: {
      state: 'owned' | 'next' | 'gate' | 'locked' | 'future';
      accent: number;
      capstone: boolean;
      costLabel: string;
      action: (() => void) | null;
    },
  ): void {
    this.modal.push(...makeTreeNode(this, x, y, r, { ...opts, depth: 311 }));
  }

  private branchAxisShort(axis: string): string {
    if (axis === 'damage') return 'damage';
    if (axis === 'range') return 'range';
    if (axis === 'attackSpeed') return 'fire rate';
    return 'aura';
  }

  /** Persist + refresh the menu balances and re-open the modal. */
  private commitMeta(sound: 'gold' | 'levelUp' | null = 'gold'): void {
    if (sound) audio.sfx(sound);
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
    const pad = 12;
    const gap = 6;
    const headerH = 34;
    const closeArea = TOUCH_MIN + 16;
    // 60 levels: size cells to fit BOTH width and the available height so the
    // whole campaign shows without scrolling, even on short screens.
    const widthCell = Math.floor((w - pad * 2 - gap * (cols - 1)) / cols);
    const maxGridH = sh - 12 - headerH - closeArea;
    const heightCell = Math.floor((maxGridH - gap * (rows - 1)) / rows);
    const cell = Math.max(28, Math.min(widthCell, heightCell));
    const gridH = rows * cell + (rows - 1) * gap;
    const h = headerH + gridH + closeArea;
    const showStars = cell >= 52; // star row only legible on bigger cells
    this.pushBackdrop();
    this.modal.push(
      this.add
        .rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0x69db7c, 0.9)
        .setDepth(310)
        .setInteractive()
        .on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    const got = ratingStarsEarned(this.meta);
    const maxStars = CHAPTER_ORDER.length * 3;
    this.modalText(sw / 2, top + 16, `🗺 SELECT LEVEL · ${got}/${maxStars} ★`, '#69db7c', 14);

    const unlockedMax = this.highestUnlockedIndex();
    const gridW = cols * cell + (cols - 1) * gap;
    const gridLeft = sw / 2 - gridW / 2 + cell / 2;
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
          .text(cx, showStars ? cy - cell * 0.12 : cy, unlocked ? `${i + 1}` : '🔒', {
            fontFamily: 'monospace',
            fontSize: `${Math.round(cell * (showStars ? 0.34 : 0.4))}px`,
            color: unlocked ? '#ffffff' : '#888888',
          })
          .setOrigin(0.5)
          .setDepth(312),
      );
      if (unlocked) {
        if (showStars) {
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
        }
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

  private achieveCtx(): AchieveCtx {
    return {
      meta: this.meta,
      bestWave: loadEndlessBest(),
      completedChapters: loadStoryProgress()?.completedChapters ?? [],
    };
  }

  private openRecordsPanel(): void {
    this.closeModal();
    const { sw, sh } = this;
    const w = Math.min(sw - 16, 360);
    const ach = this.recordsTab === 'achievements';
    const headH = 78; // title + tabs
    const closeArea = TOUCH_MIN + 14;

    // Body height per tab (clamped to the viewport). The daily block only
    // counts once dailies have unlocked (chapter 8).
    const quests = this.meta.daily?.quests ?? [];
    const perksH = (this.meta.platinum ?? 0) > 0 ? 24 : 0;
    const statsBodyH = 6 * 26 + perksH + (isFeatureUnlocked('dailies') ? 30 + quests.length * 24 + 8 : 4);
    const maxBody = sh - 12 - headH - closeArea;
    // Let rows shrink to fit short (landscape) viewports — the old max(20) floor
    // overran the panel/footer with 12 goals on screens ≲380px tall.
    const achRowH = Math.max(14, Math.min(26, Math.floor(maxBody / ACHIEVEMENTS.length)));
    const bodyH = ach ? ACHIEVEMENTS.length * achRowH : statsBodyH;
    const h = Math.min(sh - 12, headH + bodyH + closeArea);
    this.pushBackdrop();
    this.modal.push(
      this.add.rectangle(sw / 2, sh / 2, w, h, 0x14141c, 0.99)
        .setStrokeStyle(2, 0x74c0fc, 0.9).setDepth(310).setInteractive().on('pointerdown', STOP),
    );
    const top = sh / 2 - h / 2;
    this.modalText(sw / 2, top + 18, '🏆 RECORDS', '#74c0fc', 15);

    // Tabs.
    const tabW = Math.min(140, (w - 36) / 2);
    const tabY = top + 50;
    const tab = (label: string, key: 'stats' | 'achievements', x: number) =>
      this.modal.push(
        ...this.button({
          x, y: tabY, w: tabW, h: TOUCH_MIN - 8, label,
          color: this.recordsTab === key ? 0x74c0fc : 0x555a66, depth: 311,
          onClick: () => { this.recordsTab = key; this.openRecordsPanel(); },
        }),
      );
    tab('Stats', 'stats', sw / 2 - tabW / 2 - 6);
    tab('Goals', 'achievements', sw / 2 + tabW / 2 + 6);

    if (ach) this.drawAchievements(w, top + headH, achRowH);
    else this.drawStatsTab(w, top + headH);

    // Footer: Claim-all (achievements, when any are ready) + Close.
    const ctx = this.achieveCtx();
    const claimable = ach ? claimableCount(ctx) : 0;
    const by = top + h - 14 - TOUCH_MIN / 2;
    if (claimable > 0) {
      const fameReady = ACHIEVEMENTS
        .filter((a) => isAchieved(a, ctx) && !isClaimed(this.meta, a.id))
        .reduce((s, a) => s + a.fame, 0);
      const gap = 10;
      const bw = Math.min(150, (w - 40 - gap) / 2);
      this.modal.push(...this.button({
        x: sw / 2 - (bw + gap) / 2, y: by, w: bw, h: TOUCH_MIN,
        label: `Claim +${fameReady}`, color: 0x51cf66, depth: 311,
        onClick: () => {
          haptics.play('success');
          audio.sfx('reward');
          for (const a of ACHIEVEMENTS) claimAchievement(a, ctx);
          saveMeta(this.meta);
          this.rebuild();
          this.openRecordsPanel();
        },
      }));
      this.modal.push(...this.button({
        x: sw / 2 + (bw + gap) / 2, y: by, w: bw, h: TOUCH_MIN,
        label: 'Close', color: 0xff6b6b, depth: 311, onClick: () => this.closeModal(),
      }));
    } else {
      this.modal.push(...this.button({
        x: sw / 2, y: by, w: Math.min(140, w - 40), h: TOUCH_MIN,
        label: 'Close', color: 0xff6b6b, depth: 311, onClick: () => this.closeModal(),
      }));
    }
  }

  private drawStatsTab(w: number, bodyTop: number): void {
    const { sw } = this;
    const lx = sw / 2 - w / 2 + 20;
    const rx = sw / 2 + w / 2 - 20;
    const lt = this.meta.lifetime;
    const best = loadEndlessBest();
    const totalStars = totalStarsEarned(this.meta);
    const { rank, next } = performerRank(totalStars);
    const lines: [string, string][] = [
      ['Performer rank', this.meta.platinum > 0 ? `${rank.title} ✦${this.meta.platinum}` : rank.title],
      ['Enemies silenced', `${lt.kills}`],
      ['Waves survived', `${lt.waves}`],
      ['Highest combo', `x${lt.highestCombo}`],
      ['Best endless wave', best > 0 ? `${best}` : '—'],
      ['Stars earned', next ? `${totalStars}  (★${next.min} → ${next.title})` : `${totalStars}`],
    ];
    lines.forEach(([label, value], i) => {
      const y = bodyTop + 8 + i * 26;
      this.modalText(lx, y, label, '#cfd3dc', 12, 0);
      this.modal.push(
        this.add.text(rx, y, value, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd43b' })
          .setOrigin(1, 0.5).setDepth(311),
      );
    });
    let dy = bodyTop + 8 + 6 * 26 + 4;
    // Owned prestige perks (full-width line so the breakdown isn't cramped).
    if ((this.meta.platinum ?? 0) > 0) {
      const abbr: Record<string, string> = { startGold: 'gold', damage: 'dmg', combo: 'combo', cheaper: 'cost' };
      const bits = PLATINUM_PERKS
        .filter((p) => (this.meta.platinumPerks?.[p.key] ?? 0) > 0)
        .map((p) => `${abbr[p.key]}×${this.meta.platinumPerks![p.key]}`);
      this.modalText(lx, dy, `✦ Perks: ${bits.length ? bits.join(' · ') : '—'}`, '#c9b6ff', 11, 0);
      dy += 24;
    }
    if (!isFeatureUnlocked('dailies')) return; // daily quests unlock at chapter 8
    const daily = this.meta.daily;
    const quests = daily?.quests ?? [];
    this.modalText(lx, dy, `📅 DAILY  ·  🔥 Day ${daily?.streak ?? 1} streak`, '#ffd166', 12, 0);
    dy += 24;
    if (quests.length === 0) this.modalText(lx, dy, 'Play to roll today’s quests.', '#9aa0b0', 11, 0);
    for (const q of quests) {
      const def = questById(q.id);
      if (!def) continue;
      this.modalText(lx, dy, `${q.done ? '✓' : '○'} ${def.label}`, q.done ? '#69db7c' : '#cfd3dc', 11, 0);
      this.modal.push(
        this.add.text(rx, dy, q.done ? 'done' : `+${def.reward} Fame`, {
          fontFamily: 'monospace', fontSize: '11px', color: q.done ? '#69db7c' : '#ff9ed8',
        }).setOrigin(1, 0.5).setDepth(311),
      );
      dy += 24;
    }
  }

  private drawAchievements(w: number, bodyTop: number, rowH: number): void {
    const { sw } = this;
    const lx = sw / 2 - w / 2 + 18;
    const rx = sw / 2 + w / 2 - 18;
    const ctx = this.achieveCtx();
    // Scale text down with the row so tight (landscape) layouts stay legible.
    const nameFont = Math.max(9, Math.min(11, rowH - 4));
    const valFont = Math.max(8, Math.min(10, rowH - 5));
    ACHIEVEMENTS.forEach((a, i) => {
      const y = bodyTop + rowH / 2 + i * rowH;
      const claimed = isClaimed(this.meta, a.id);
      const ready = !claimed && isAchieved(a, ctx);
      const mark = claimed ? '✓' : ready ? '★' : '🔒';
      const color = claimed ? '#69db7c' : ready ? '#ffd166' : '#7a8090';
      this.modalText(lx, y, `${mark} ${a.name}`, color, nameFont, 0);
      this.modal.push(
        this.add.text(rx, y, claimed ? 'claimed' : ready ? `+${a.fame} ★ready` : `+${a.fame}`, {
          fontFamily: 'monospace', fontSize: `${valFont}px`,
          color: claimed ? '#69db7c' : ready ? '#ffd166' : '#7a8090',
        }).setOrigin(1, 0.5).setDepth(311),
      );
    });
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
  private text(x: number, y: number, str: string, color: string, size: number): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, str, { fontFamily: 'monospace', fontSize: `${size}px`, color })
      .setOrigin(0.5);
    this.root.add(t);
    return t;
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
      pressFeedback(rect, [rect, text], { rect, base: 0x232336, active: 0x33334d });
    }
    if (!isModal) this.root.add([rect, text]);
    return [rect, text];
  }
}
