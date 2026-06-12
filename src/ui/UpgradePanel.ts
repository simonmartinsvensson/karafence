import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { computeScreenLayout } from '../systems/grid';
import { MAX_TIER, type UpgradePathKey } from '../data/towers';
import type { Tower } from '../systems/Tower';

export interface UpgradePanelCallbacks {
  onUpgrade: (path: UpgradePathKey) => void;
  onSell: () => void;
  onCycleTarget: () => void;
}

const ABSORB = (
  _p: Phaser.Input.Pointer,
  _x: number,
  _y: number,
  ev?: Phaser.Types.Input.EventData,
) => ev?.stopPropagation();

/**
 * Non-modal panel shown when a placed tower is selected. Shows the two upgrade
 * paths (current tier as pips, next-tier label + cost) for towers that have
 * them, a targeting toggle for attacking towers, and a Sell button. Anchored
 * just above the bottom control bar (one-thumb reach), sized in CSS pixels with
 * >=44px rows. Rebuilt on every change.
 */
export class UpgradePanel {
  private container?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  open(tower: Tower, gold: number, cb: UpgradePanelCallbacks): void {
    this.close();
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    const screen = computeScreenLayout(vw, vh);

    const w = Math.min(vw - 16, 380);
    const pad = 10;
    const gap = 6;
    const headerH = TOUCH_MIN;
    const rowH = TOUCH_MIN;
    const showUpgrades = tower.hasUpgrades;
    // Body rows: (two upgrade paths) + sell.
    const bodyRows = (showUpgrades ? 2 : 0) + 1;
    const h = pad + headerH + (bodyRows + 1) * gap + bodyRows * rowH + pad;

    const parts: Phaser.GameObjects.GameObject[] = [];
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x14141c, 0.98)
      .setStrokeStyle(2, tower.type.color, 0.9)
      .setInteractive();
    bg.on('pointerdown', ABSORB);
    parts.push(bg);

    const top = -h / 2 + pad;

    // Header: tower name (left) + targeting toggle (right, attacking only).
    const headerCy = top + headerH / 2;
    parts.push(
      this.scene.add
        .text(-w / 2 + 12, headerCy, `${tower.type.icon} ${tower.type.name}`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    if (tower.attacks) {
      const tw = Math.min(150, w * 0.42);
      const tx = w / 2 - 12 - tw / 2;
      const targBtn = this.scene.add
        .rectangle(tx, headerCy, tw, headerH - 12, 0x232336)
        .setStrokeStyle(1, 0xffd166, 0.8)
        .setInteractive({ useHandCursor: true });
      targBtn.on('pointerdown', (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        cb.onCycleTarget();
      });
      parts.push(targBtn);
      parts.push(
        this.scene.add
          .text(tx, headerCy, `🎯 ${tower.targeting}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffd166',
          })
          .setOrigin(0.5),
      );
    }

    let y = top + headerH + gap + rowH / 2;
    if (showUpgrades) {
      const recommended = this.bestBuy(tower, gold);
      parts.push(...this.pathRow(tower, 'A', gold, y, w, cb, recommended === 'A'));
      y += rowH + gap;
      parts.push(...this.pathRow(tower, 'B', gold, y, w, cb, recommended === 'B'));
      y += rowH + gap;
    }

    // Sell button.
    const sell = this.scene.add
      .rectangle(0, y, w - 20, rowH, 0x3a1a1a)
      .setStrokeStyle(1, 0xff6b6b, 0.9)
      .setInteractive({ useHandCursor: true });
    sell.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => {
      ev?.stopPropagation();
      cb.onSell();
    });
    parts.push(sell);
    parts.push(
      this.scene.add
        .text(0, y, `SELL  +${tower.sellValue}g`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ff8787',
        })
        .setOrigin(0.5),
    );

    // Anchor the panel just above the bottom control bar (one-thumb reach).
    const cy = vh - screen.barH - 8 - h / 2;
    this.container = this.scene.add.container(vw / 2, cy, parts).setDepth(300);
  }

  /**
   * The recommended affordable upgrade: the cheapest buyable next tier across
   * both paths (A wins ties). Returns null if nothing is affordable. Used to
   * gently steer spending toward a sensible next buy.
   */
  private bestBuy(tower: Tower, gold: number): UpgradePathKey | null {
    let best: UpgradePathKey | null = null;
    let bestCost = Infinity;
    for (const p of ['A', 'B'] as UpgradePathKey[]) {
      const next = tower.nextTier(p);
      if (next && tower.canUpgrade(p) && gold >= next.cost && next.cost < bestCost) {
        best = p;
        bestCost = next.cost;
      }
    }
    return best;
  }

  private pathRow(
    tower: Tower,
    path: UpgradePathKey,
    gold: number,
    y: number,
    w: number,
    cb: UpgradePanelCallbacks,
    recommended: boolean,
  ): Phaser.GameObjects.GameObject[] {
    const tier = tower.tiers[path];
    const pips = '●'.repeat(tier) + '○'.repeat(MAX_TIER - tier);
    const next = tower.nextTier(path);
    const maxed = tier >= MAX_TIER;
    const locked = tower.isLocked(path);
    const affordable = !!next && tower.canUpgrade(path) && gold >= next.cost;

    let text: string;
    let color: string;
    if (maxed) {
      text = `${path} ${pips}  ${tower.pathName(path)} · MAX`;
      color = '#a0e0a0';
    } else if (locked) {
      text = `${path} ${pips}  LOCKED (other path committed)`;
      color = '#777777';
    } else if (next) {
      text = `${path} ${pips}  ▶ ${next.label}  ${next.cost}g${recommended ? '  ⭐' : ''}`;
      color = affordable ? '#ffffff' : '#cc8888';
    } else {
      text = `${path} ${pips}`;
      color = '#777777';
    }

    // The recommended buy gets a gold border + warmer fill to draw the eye.
    const fill = recommended ? 0x2e2a16 : affordable ? 0x233323 : 0x232336;
    const stroke = recommended ? 0xffd43b : affordable ? 0x51cf66 : 0x444455;
    const row = this.scene.add
      .rectangle(0, y, w - 20, TOUCH_MIN, fill)
      .setStrokeStyle(recommended ? 2 : 1, stroke, 0.9);
    if (affordable) {
      row.setInteractive({ useHandCursor: true });
      row.on('pointerdown', (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        ev?: Phaser.Types.Input.EventData,
      ) => {
        ev?.stopPropagation();
        cb.onUpgrade(path);
      });
    }
    const label = this.scene.add
      .text(-w / 2 + 14, y, text, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color,
      })
      .setOrigin(0, 0.5);
    return [row, label];
  }

  close(): void {
    this.container?.destroy(true);
    this.container = undefined;
  }
}
