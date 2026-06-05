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
  ): void {
    this.close();

    this.backdrop = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.4)
      .setDepth(250)
      .setInteractive();
    this.backdrop.on('pointerdown', () => onCancel());

    const panelW = 234;
    const panelH = 84;
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

    const colW = panelW / TOWER_LIST.length;
    TOWER_LIST.forEach((tower, i) => {
      const cx = -panelW / 2 + colW * (i + 0.5);
      const affordable = gold >= tower.cost;

      const cell = this.scene.add
        .rectangle(cx, 6, colW - 8, panelH - 26, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(1, affordable ? 0x51cf66 : 0x555555, 0.9);
      parts.push(cell);
      parts.push(
        this.scene.add
          .text(cx, -8, tower.icon, { fontFamily: 'sans-serif', fontSize: '18px' })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, 11, tower.name, {
            fontFamily: 'monospace',
            fontSize: '7px',
            color: affordable ? '#ffffff' : '#888888',
            align: 'center',
            wordWrap: { width: colW - 12 },
          })
          .setOrigin(0.5),
      );
      parts.push(
        this.scene.add
          .text(cx, 26, `${tower.cost}g`, {
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
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 58, parts)
      .setDepth(300);
  }

  close(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }
}
