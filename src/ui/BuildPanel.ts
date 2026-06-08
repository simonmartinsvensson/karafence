import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';

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
  ): void {
    this.close();
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;

    this.backdrop = this.scene.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x000000, 0.45)
      .setDepth(250)
      .setInteractive();
    this.backdrop.on('pointerdown', () => onCancel());

    const cols = 3;
    const rows = Math.ceil(TOWER_LIST.length / cols);
    const pad = 12;
    const gap = 8;
    const headerH = 26;
    // Fit the grid to the viewport but cap it so it stays legible on desktop.
    const panelW = Math.min(vw - 16, 380);
    const cellW = Math.floor((panelW - pad * 2 - gap * (cols - 1)) / cols);
    const cellH = Math.max(TOUCH_MIN + 18, Math.floor(cellW * 0.62));
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
        .text(0, -panelH / 2 + 14, 'BUILD A TOWER', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e84393',
        })
        .setOrigin(0.5),
    );

    const gridLeft = -panelW / 2 + pad + cellW / 2;
    const gridTop = -panelH / 2 + headerH + pad + cellH / 2;
    TOWER_LIST.forEach((tower, i) => {
      const cx = gridLeft + (i % cols) * (cellW + gap);
      const cy = gridTop + Math.floor(i / cols) * (cellH + gap);
      const cost = costOf(tower.key);
      const affordable = gold >= cost;

      const cell = this.scene.add
        .rectangle(cx, cy, cellW, cellH, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(1, affordable ? 0x51cf66 : 0x555555, 0.9);
      parts.push(cell);
      parts.push(
        this.scene.add
          .text(cx, cy - cellH * 0.26, tower.icon, {
            fontFamily: 'sans-serif',
            fontSize: '22px',
          })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, cy + cellH * 0.06, tower.name, {
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
          .text(cx, cy + cellH * 0.34, `${cost}g`, {
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
