import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';
import { towerTextureKey } from '../systems/textures';

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
    const cellH = Math.max(TOUCH_MIN + 30, Math.floor(cellW * 0.74));
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

      const accent = ACCENT[tower.key];
      const cell = this.scene.add
        .rectangle(cx, cy, cellW, cellH, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(2, affordable ? accent : 0x555555, affordable ? 1 : 0.7);
      parts.push(cell);
      // Big tower sprite filling ~55% of the card height (was a tiny emoji).
      const iconSize = Math.floor(cellH * 0.55);
      parts.push(
        this.scene.add
          .image(cx, cy - cellH * 0.16, towerTextureKey(tower.key))
          .setDisplaySize(iconSize, iconSize)
          .setAlpha(affordable ? 1 : 0.4),
      );
      parts.push(
        this.scene.add
          .text(cx, cy + cellH * 0.21, tower.name, {
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
          .text(cx, cy + cellH * 0.4, `${cost}g`, {
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
