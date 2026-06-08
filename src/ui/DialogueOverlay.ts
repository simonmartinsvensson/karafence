import Phaser from 'phaser';
import { CHARACTERS, type StoryBeat } from '../data/story';
import { TX } from '../systems/textures';

/**
 * Reusable visual-novel-style dialogue overlay (story mode). Given a queue of
 * story beats it shows, one at a time, a tinted character portrait, a name
 * plate and that beat's lines; a tap/click advances to the next beat, and when
 * the queue is exhausted it closes and fires `onComplete`.
 *
 * It is intentionally self-contained (no game-logic dependencies beyond the
 * `StoryBeat` shape) so any scene can drive it. Rendered in screen space and
 * rebuilt on `relayout()`, so it reflows with the viewport.
 */
const DEPTH = 400;

export class DialogueOverlay {
  private backdrop?: Phaser.GameObjects.Rectangle;
  private container?: Phaser.GameObjects.Container;
  private beats: StoryBeat[] = [];
  private index = 0;
  private onComplete: () => void = () => {};

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  /** Play `beats` in order; `onComplete` fires once the last beat is dismissed. */
  show(beats: StoryBeat[], onComplete: () => void): void {
    this.close();
    if (beats.length === 0) {
      onComplete();
      return;
    }
    this.beats = beats;
    this.index = 0;
    this.onComplete = onComplete;

    this.backdrop = this.scene.add
      .rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x05050a, 0.55)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setInteractive();
    this.backdrop.on('pointerdown', () => this.advance());

    this.render();
  }

  /** Advance to the next beat, or finish + close after the last one. */
  private advance(): void {
    this.index += 1;
    if (this.index >= this.beats.length) {
      const done = this.onComplete;
      this.close();
      done();
      return;
    }
    this.render();
  }

  /** Re-render the current beat for the current viewport. */
  private render(): void {
    this.container?.destroy(true);
    const beat = this.beats[this.index];
    if (!beat) return;
    const char = CHARACTERS[beat.character] ?? { name: beat.character, color: 0xffffff };

    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    const boxW = Math.min(vw - 24, 660);
    const boxH = Math.round(Phaser.Math.Clamp(vh * 0.3, 150, 220));
    const cx = vw / 2;
    const boxCy = vh - 18 - boxH / 2;
    const left = cx - boxW / 2;

    const parts: Phaser.GameObjects.GameObject[] = [];

    // Dialogue box.
    parts.push(
      this.scene.add
        .rectangle(cx, boxCy, boxW, boxH, 0x141420, 0.98)
        .setStrokeStyle(2.5, char.color, 0.95),
    );

    // Portrait — a tinted silhouette that rises above the box (VN style).
    const portraitH = boxH * 1.18;
    const portraitW = portraitH * (96 / 112);
    const portraitX = left + portraitW / 2 + 14;
    const portraitBottom = boxCy + boxH / 2 - 6;
    parts.push(
      this.scene.add
        .rectangle(portraitX, portraitBottom - portraitH * 0.42, portraitW + 8, portraitH * 0.9, 0x0c0c14, 0.9)
        .setStrokeStyle(2, char.color, 0.55),
    );
    parts.push(
      this.scene.add
        .image(portraitX, portraitBottom, TX.portrait)
        .setOrigin(0.5, 1)
        .setDisplaySize(portraitW, portraitH)
        .setTint(char.color),
    );

    // Name plate.
    const textLeft = portraitX + portraitW / 2 + 18;
    const textW = boxW - (textLeft - left) - 18;
    const nameY = boxCy - boxH / 2 + 18;
    parts.push(
      this.scene.add
        .text(textLeft, nameY, char.name, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    parts.push(
      this.scene.add
        .rectangle(textLeft, nameY + 13, textW, 2, char.color, 0.8)
        .setOrigin(0, 0.5),
    );

    // Lines.
    parts.push(
      this.scene.add
        .text(textLeft, nameY + 26, beat.lines.join('\n'), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e8e8f0',
          lineSpacing: 6,
          wordWrap: { width: textW },
        })
        .setOrigin(0, 0),
    );

    // Advance hint + progress dots.
    const last = this.index === this.beats.length - 1;
    parts.push(
      this.scene.add
        .text(
          cx + boxW / 2 - 14,
          boxCy + boxH / 2 - 12,
          last ? 'tap to continue ▶' : 'tap ▶',
          { fontFamily: 'monospace', fontSize: '10px', color: '#9aa0b0' },
        )
        .setOrigin(1, 0.5),
    );

    this.container = this.scene.add.container(0, 0, parts).setDepth(DEPTH + 1).setScrollFactor(0);
    // Make the whole box tappable too (not just the backdrop).
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(left, boxCy - boxH / 2, boxW, boxH),
      Phaser.Geom.Rectangle.Contains,
    );
    this.container.on('pointerdown', () => this.advance());
  }

  /** Reflow on resize (no-op if closed). */
  relayout(): void {
    if (!this.isOpen) return;
    this.backdrop?.setSize(this.scene.scale.width, this.scene.scale.height);
    this.render();
  }

  close(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
    this.beats = [];
    this.index = 0;
  }
}
