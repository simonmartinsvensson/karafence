import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { POWERUP_LIST, type PowerUpKey } from '../data/powerups';

/**
 * Modal "KaraFence Cash" shop. Lists the one-use power-ups with costs;
 * unaffordable ones are greyed out. Buying applies the effect immediately.
 */
export class ShopPanel {
  private backdrop?: Phaser.GameObjects.Rectangle;
  private container?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  open(
    gold: number,
    onBuy: (key: PowerUpKey) => void,
    onClose: () => void,
  ): void {
    this.close();

    this.backdrop = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
      .setDepth(250)
      .setInteractive();
    this.backdrop.on('pointerdown', () => onClose());

    const w = 300;
    const h = 150;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x141420, 0.98)
      .setStrokeStyle(2, 0xffd166, 0.9)
      .setInteractive();
    bg.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev?: Phaser.Types.Input.EventData,
    ) => ev?.stopPropagation());
    parts.push(bg);
    parts.push(
      this.scene.add
        .text(0, -h / 2 + 11, '🎟  KaraFence Cash', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffd166',
        })
        .setOrigin(0.5),
    );

    const rowH = 34;
    POWERUP_LIST.forEach((p, i) => {
      const y = -h / 2 + 30 + i * rowH;
      const affordable = gold >= p.cost;
      const row = this.scene.add
        .rectangle(0, y, w - 18, rowH - 4, affordable ? 0x232336 : 0x1a1a22)
        .setStrokeStyle(1, affordable ? 0x51cf66 : 0x555555, 0.9);
      if (affordable) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerdown', (
          _p: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          ev?: Phaser.Types.Input.EventData,
        ) => {
          ev?.stopPropagation();
          onBuy(p.key);
        });
      }
      parts.push(row);
      parts.push(
        this.scene.add
          .text(-w / 2 + 12, y - 6, `${p.icon} ${p.name}`, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: affordable ? '#ffffff' : '#888888',
          })
          .setOrigin(0, 0.5),
      );
      parts.push(
        this.scene.add
          .text(-w / 2 + 12, y + 7, p.desc, {
            fontFamily: 'monospace',
            fontSize: '7px',
            color: '#aaaaaa',
          })
          .setOrigin(0, 0.5),
      );
      parts.push(
        this.scene.add
          .text(w / 2 - 12, y, `${p.cost}g`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: affordable ? '#ffd166' : '#888888',
          })
          .setOrigin(1, 0.5),
      );
    });

    this.container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2, parts)
      .setDepth(300);
  }

  close(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }
}
