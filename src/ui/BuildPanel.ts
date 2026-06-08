import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { TOWER_LIST, type TowerTypeKey } from '../data/towers';

/**
 * Modal tower-picker. Opens when the player taps a buildable tile: a dim
 * backdrop (tap to cancel) plus a panel of the available towers and their
 * gold costs. Unaffordable towers are greyed out and non-selectable.
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

    this.backdrop = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.4)
      .setDepth(250)
      .setInteractive();
    this.backdrop.on('pointerdown', () => onCancel());

    // Grid of towers: 3 per row, as many rows as needed (2 for six towers).
    const cols = 3;
    const rows = Math.ceil(TOWER_LIST.length / cols);
    const cellW = 96;
    const cellH = 54;
    const cellGap = 6;
    const headerH = 16;
    const pad = 8;
    const panelW = cols * cellW + (cols - 1) * cellGap + pad * 2;
    const panelH = headerH + rows * cellH + (rows - 1) * cellGap + pad * 2;
    const parts: Phaser.GameObjects.GameObject[] = [];

    const bg = this.scene.add
      .rectangle(0, 0, panelW, panelH, 0x14141c, 0.98)
      .setStrokeStyle(2, 0xe84393, 0.9)
      .setInteractive(); // absorb clicks on panel chrome
    bg.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => ev?.stopPropagation());
    parts.push(bg);

    parts.push(
      this.scene.add
        .text(0, -panelH / 2 + 9, 'BUILD A TOWER', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#e84393',
        })
        .setOrigin(0.5),
    );

    const gridLeft = -panelW / 2 + pad + cellW / 2;
    const gridTop = -panelH / 2 + headerH + pad + cellH / 2;
    TOWER_LIST.forEach((tower, i) => {
      const cx = gridLeft + (i % cols) * (cellW + cellGap);
      const cy = gridTop + Math.floor(i / cols) * (cellH + cellGap);
      const cost = costOf(tower.key);
      const affordable = gold >= cost;

      const cell = this.scene.add
        .rectangle(cx, cy, cellW, cellH, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(1, affordable ? 0x51cf66 : 0x555555, 0.9);
      parts.push(cell);
      parts.push(
        this.scene.add
          .text(cx, cy - 16, tower.icon, { fontFamily: 'sans-serif', fontSize: '16px' })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, cy + 4, tower.name, {
            fontFamily: 'monospace',
            fontSize: '7px',
            color: affordable ? '#ffffff' : '#888888',
            align: 'center',
            wordWrap: { width: cellW - 8 },
          })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, cy + 19, `${cost}g`, {
            fontFamily: 'monospace',
            fontSize: '9px',
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

    this.container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, parts)
      .setDepth(300);
  }

  close(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }
}
