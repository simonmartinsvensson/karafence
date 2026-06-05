import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
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
 * Non-modal panel shown when a placed tower is selected. Lists the two upgrade
 * paths (current tier as pips, next-tier label + cost), a targeting toggle, and
 * a Sell button. Rebuilt on every change by re-calling open().
 */
export class UpgradePanel {
  private container?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  open(tower: Tower, gold: number, cb: UpgradePanelCallbacks): void {
    this.close();
    const w = 320;
    const h = 86;
    const parts: Phaser.GameObjects.GameObject[] = [];

    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x14141c, 0.97)
      .setStrokeStyle(2, tower.type.color, 0.9)
      .setInteractive();
    bg.on('pointerdown', ABSORB);
    parts.push(bg);

    parts.push(
      this.scene.add
        .text(-w / 2 + 8, -h / 2 + 7, `${tower.type.icon} ${tower.type.name}`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );

    // Targeting toggle (top-right).
    const targBtn = this.scene.add
      .rectangle(w / 2 - 70, -h / 2 + 8, 130, 13, 0x232336)
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
        .text(w / 2 - 70, -h / 2 + 8, `Target: ${tower.targeting} (tap)`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#ffd166',
        })
        .setOrigin(0.5),
    );

    parts.push(...this.pathRow(tower, 'A', gold, -8, w, cb));
    parts.push(...this.pathRow(tower, 'B', gold, 9, w, cb));

    // Sell button.
    const sell = this.scene.add
      .rectangle(0, h / 2 - 12, w - 16, 15, 0x3a1a1a)
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
        .text(0, h / 2 - 12, `SELL  +${tower.sellValue}g`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#ff8787',
        })
        .setOrigin(0.5),
    );

    this.container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 55, parts)
      .setDepth(300);
  }

  private pathRow(
    tower: Tower,
    path: UpgradePathKey,
    gold: number,
    y: number,
    w: number,
    cb: UpgradePanelCallbacks,
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
      text = `${path} ${pips}  ▶ ${next.label}  ${next.cost}g`;
      color = affordable ? '#ffffff' : '#cc8888';
    } else {
      text = `${path} ${pips}`;
      color = '#777777';
    }

    const row = this.scene.add
      .rectangle(0, y, w - 16, 15, affordable ? 0x233323 : 0x232336)
      .setStrokeStyle(1, affordable ? 0x51cf66 : 0x444455, 0.9);
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
      .text(-w / 2 + 12, y, text, {
        fontFamily: 'monospace',
        fontSize: '8px',
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
