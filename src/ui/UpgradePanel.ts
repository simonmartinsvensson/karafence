import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { computeScreenLayout } from '../systems/grid';
import { MAX_TIER, describeTier, type UpgradePathKey } from '../data/towers';
import type { Tower } from '../systems/Tower';
import { makeTreeNode, type TreeNodeState } from './treeNode';

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
    // A two-branch node fork (A/B) when the tower has upgrade paths, else just sell.
    const forkH = showUpgrades ? 142 : 0;
    const h = pad + headerH + gap + forkH + (showUpgrades ? gap : 0) + rowH + pad;

    const parts: Phaser.GameObjects.GameObject[] = [];
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x14141c, 0.98)
      .setStrokeStyle(2, tower.type.color, 0.9)
      .setInteractive();
    bg.on('pointerdown', ABSORB);
    parts.push(bg);

    const top = -h / 2 + pad;

    // Header: tower name + role blurb (left) + targeting toggle (right).
    const headerCy = top + headerH / 2;
    parts.push(
      this.scene.add
        .text(-w / 2 + 12, headerCy - 8, `${tower.type.icon} ${tower.type.name}`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    parts.push(
      this.scene.add
        .text(-w / 2 + 12, headerCy + 9, tower.type.blurb, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#9aa0b0',
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

    let y = top + headerH + gap + rowH / 2; // sell-row centre when no upgrades
    if (showUpgrades) {
      const forkTop = top + headerH + gap;
      parts.push(...this.drawFork(tower, gold, forkTop, w, cb));
      y = forkTop + forkH + gap + rowH / 2;
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
   * The two upgrade paths drawn as a node fork branching from a tower root:
   * column A (power) and B (utility), each a chain of MAX_TIER nodes. The next
   * buyable tier glows (tap to buy — GameScene guards gold/path so a tap while
   * short or on a committed-out path no-ops); a locked path dims. The next
   * tier's cost + effect sit under each column.
   */
  private drawFork(
    tower: Tower,
    gold: number,
    top: number,
    w: number,
    cb: UpgradePanelCallbacks,
  ): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    const accent = tower.type.color;
    const rootX = 0;
    const rootY = top + 8;
    const labelY = rootY + 22;
    const firstY = labelY + 24;
    const gap = 24;
    const r = 9;
    const cols: { p: UpgradePathKey; x: number }[] = [
      { p: 'A', x: -w * 0.24 },
      { p: 'B', x: w * 0.24 },
    ];

    const links = this.scene.add.graphics();
    out.push(links);
    out.push(this.scene.add.circle(rootX, rootY, r + 4, 0x232336, 0.98).setStrokeStyle(2, accent, 0.9));
    out.push(this.scene.add.text(rootX, rootY, tower.type.icon, { fontFamily: 'monospace', fontSize: '13px' }).setOrigin(0.5));

    for (const { p, x } of cols) {
      const tier = tower.tiers[p];
      const maxed = tier >= MAX_TIER;
      const locked = tower.isLocked(p);
      const next = tower.nextTier(p);

      links.lineStyle(3, 0x44445a, 0.8);
      links.beginPath();
      links.moveTo(rootX, rootY + r);
      links.lineTo(x, firstY - r);
      links.strokePath();

      out.push(
        this.scene.add
          .text(x, labelY - 3, `${p}· ${tower.pathName(p)}`, {
            fontFamily: 'monospace', fontSize: '10px', color: locked ? '#8a8a96' : '#cfd3dc',
          })
          .setOrigin(0.5),
      );
      const affordable = !!next && gold >= next.cost;
      const note = maxed ? 'MAX' : locked ? 'locked' : next ? `▶ ${next.cost}g` : '';
      if (note) {
        const noteColor = maxed ? '#69db7c' : locked ? '#8a8a96' : affordable ? '#ffd166' : '#cc8888';
        out.push(
          this.scene.add
            .text(x, labelY + 9, note, { fontFamily: 'monospace', fontSize: '9px', color: noteColor })
            .setOrigin(0.5),
        );
      }

      for (let j = 1; j <= MAX_TIER; j++) {
        const ny = firstY + (j - 1) * gap;
        if (j > 1) {
          const on = j <= tier;
          links.lineStyle(3, on ? accent : 0x33333f, on ? 0.95 : 0.7);
          links.beginPath();
          links.moveTo(x, ny - gap + r);
          links.lineTo(x, ny - r);
          links.strokePath();
        }
        let state: TreeNodeState = 'future';
        let action: (() => void) | null = null;
        if (j <= tier) state = 'owned';
        else if (j === tier + 1 && !maxed && !locked && next) {
          state = 'next';
          action = () => cb.onUpgrade(p);
        } else if (locked) state = 'locked';
        out.push(...makeTreeNode(this.scene, x, ny, r, { state, accent, action }));
      }

      if (next && !maxed && !locked) {
        out.push(
          this.scene.add
            .text(x, firstY + (MAX_TIER - 1) * gap + r + 10, describeTier(next), {
              fontFamily: 'monospace', fontSize: '8px', color: '#a9b0c0', align: 'center', wordWrap: { width: w * 0.44 },
            })
            .setOrigin(0.5, 0),
        );
      }
    }
    return out;
  }

  close(): void {
    this.container?.destroy(true);
    this.container = undefined;
  }
}
