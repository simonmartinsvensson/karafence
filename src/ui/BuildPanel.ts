import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';
import { towerTextureKey } from '../systems/textures';
import { pressFeedback } from '../systems/touch';
import { haptics } from '../systems/haptics';

/** Per-tower accent border color, so each card reads at a glance. */
const ACCENT: Record<TowerTypeKey, number> = {
  leadSinger: 0xffd166, // warm gold
  drummer: 0xff4d4d, // red
  keyboardist: 0x9775fa, // blue/purple
  bassPlayer: 0x3b5bdb, // deep blue
  backupSinger: 0xffa8d8, // soft pink
  hypeMan: 0xff922b, // bright orange
};

/**
 * Modal tower-picker. Opens when the player taps a buildable tile: a dim
 * backdrop (tap to cancel) plus a grid of the available towers and their gold
 * costs. Unaffordable towers are greyed out and non-selectable. Sized in CSS
 * pixels (Scale.RESIZE) and centered on the viewport, with cells comfortably
 * larger than the 44px touch-target minimum.
 */
export class BuildPanel {
  private backdrop?: Phaser.GameObjects.Rectangle;
  private container?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  open(
    gold: number,
    onSelect: (type: TowerTypeKey) => void,
    onCancel: () => void,
    costOf: (type: TowerTypeKey) => number,
    isUnlocked: (type: TowerTypeKey) => boolean = () => true,
  ): void {
    this.close();
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;

    this.backdrop = this.scene.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x000000, 0.45)
      .setDepth(250)
      .setInteractive();
    this.backdrop.on('pointerdown', () => onCancel());

    // Only unlocked towers are buildable; the rest are bought with stars on the
    // menu (so the in-game picker stays focused on what you can actually place).
    const towers = TOWER_LIST.filter((t) => isUnlocked(t.key));
    const cols = 3;
    const rows = Math.ceil(towers.length / cols);
    const pad = 12;
    const gap = 8;
    const headerH = 26;
    // Fit the grid to the viewport but cap it so it stays legible on desktop.
    const panelW = Math.min(vw - 16, 380);
    const cellW = Math.floor((panelW - pad * 2 - gap * (cols - 1)) / cols);
    // Taller cells so each card fits sprite + name + a one-line role blurb + cost.
    const cellH = Math.max(TOUCH_MIN + 54, Math.floor(cellW * 1.04));
    const panelH = headerH + rows * cellH + (rows - 1) * gap + pad * 2;
    const parts: Phaser.GameObjects.GameObject[] = [];

    const bg = this.scene.add
      .rectangle(0, 0, panelW, panelH, 0x14141c, 0.98)
      .setStrokeStyle(2, 0xe84393, 0.9)
      .setInteractive(); // absorb taps on panel chrome
    bg.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => ev?.stopPropagation());
    parts.push(bg);

    parts.push(
      this.scene.add
        .text(0, -panelH / 2 + 14, 'ADD TO THE LINEUP', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e84393',
        })
        .setOrigin(0.5),
    );

    const gridLeft = -panelW / 2 + pad + cellW / 2;
    const gridTop = -panelH / 2 + headerH + pad + cellH / 2;
    towers.forEach((tower, i) => {
      const cx = gridLeft + (i % cols) * (cellW + gap);
      const cy = gridTop + Math.floor(i / cols) * (cellH + gap);
      const cost = costOf(tower.key);
      const affordable = gold >= cost;

      const accent = ACCENT[tower.key];
      const cell = this.scene.add
        .rectangle(cx, cy, cellW, cellH, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(2, affordable ? accent : 0x555555, affordable ? 1 : 0.7);
      parts.push(cell);
      const cellTop = cy - cellH / 2;
      // Tower sprite up top, then name, a one-line role blurb, and the cost.
      const iconSize = Math.floor(cellH * 0.4);
      parts.push(
        this.scene.add
          .image(cx, cellTop + cellH * 0.28, towerTextureKey(tower.key))
          .setDisplaySize(iconSize, iconSize)
          .setAlpha(affordable ? 1 : 0.4),
      );
      parts.push(
        this.scene.add
          .text(cx, cellTop + cellH * 0.55, tower.name, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: affordable ? '#ffffff' : '#888888',
            align: 'center',
            wordWrap: { width: cellW - 8 },
          })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, cellTop + cellH * 0.72, tower.blurb, {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: affordable ? '#9aa0b0' : '#6b6b75',
            align: 'center',
            wordWrap: { width: cellW - 10 },
          })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, cellTop + cellH * 0.92, `${cost}g`, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: affordable ? '#ffd166' : '#888888',
          })
          .setOrigin(0.5),
      );

      if (affordable) {
        cell.setInteractive({ useHandCursor: true });
        cell.on('pointerdown', (
          _p: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          ev?: Phaser.Types.Input.EventData,
        ) => {
          ev?.stopPropagation();
          onSelect(tower.key);
        });
        pressFeedback(cell, [cell], { rect: cell, base: 0x232336, active: 0x33334d, fillAlpha: 1 });
      } else {
        // Unaffordable: tapping now gives feedback (a shake + error buzz) instead
        // of doing nothing silently.
        cell.setInteractive();
        cell.on('pointerdown', (
          _p: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          ev?: Phaser.Types.Input.EventData,
        ) => {
          ev?.stopPropagation();
          haptics.play('error');
          this.scene.tweens.add({ targets: cell, scaleX: 0.93, scaleY: 0.93, yoyo: true, duration: 80 });
        });
      }
    });

    this.container = this.scene.add.container(vw / 2, vh / 2, parts).setDepth(300);
  }

  close(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }
}
