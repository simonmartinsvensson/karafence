import Phaser from 'phaser';
import { CHARACTERS, type StoryBeat } from '../data/story';
import { portraitKey } from '../systems/textures';
import { audio } from '../systems/audio';

/** Per-character "voice" pitch (Hz) for the typewriter blip; lower = deeper. */
const VOICE: Record<string, number> = {
  alex: 520,
  vy: 300,
  max: 440,
  judge: 220,
  riva: 640,
  dex: 480,
  phantom: 190,
};
const VOICE_DEFAULT = 400;
/** Characters typed per typewriter tick + tick length (ms). */
const TYPE_STEP = 2;
const TYPE_DELAY = 18;

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

  // Typewriter state for the current beat.
  private bodyText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private typeEvent?: Phaser.Time.TimerEvent;
  private fullText = '';
  private typing = false;
  /** True once the current beat's text has fully revealed (skip re-typing on relayout). */
  private revealed = false;

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
    this.revealed = false;
    this.onComplete = onComplete;

    this.backdrop = this.scene.add
      .rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x05050a, 0.55)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setInteractive();
    this.backdrop.on('pointerdown', () => this.onTap());

    this.render();
  }

  /** Tap: first finish the typewriter, then advance on the next tap. */
  private onTap(): void {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.advance();
  }

  /** Advance to the next beat, or finish + close after the last one. */
  private advance(): void {
    this.index += 1;
    this.revealed = false;
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
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.typing = false;
    this.container?.destroy(true);
    const beat = this.beats[this.index];
    if (!beat) return;
    const char = CHARACTERS[beat.character] ?? { name: beat.character, color: 0xffffff };

    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    const margin = 12;
    const pad = 14;
    const cx = vw / 2;
    const boxW = Math.min(vw - margin * 2, 660);
    const left = cx - boxW / 2;

    // Reserve a portrait column independent of box height, so the text width
    // (and thus its wrapped height) is known before we size the box.
    const colW = Math.min(boxW * 0.26, 108);
    const textLeft = left + colW + pad * 1.5;
    const textW = Math.max(48, left + boxW - pad - textLeft);
    const topArea = 42; // name + divider above the body text

    // Box must fit on screen; size it to the text, shrinking the font (to a
    // floor) only if even the tallest allowed box can't contain the beat.
    const maxBoxH = vh - margin * 2;
    const maxTextH = maxBoxH - topArea - pad;
    let fontSize = Math.round(Phaser.Math.Clamp(vw / 52, 11, 14));
    let body = this.makeBody(beat, fontSize, textW);
    while (body.height > maxTextH && fontSize > 9) {
      body.destroy();
      fontSize -= 1;
      body = this.makeBody(beat, fontSize, textW);
    }
    const boxH = Math.min(maxBoxH, Math.max(120, Math.round(topArea + body.height + pad)));
    const boxCy = vh - margin - boxH / 2;
    const boxTop = boxCy - boxH / 2;

    const parts: Phaser.GameObjects.GameObject[] = [];

    // Dialogue box.
    parts.push(
      this.scene.add
        .rectangle(cx, boxCy, boxW, boxH, 0x141420, 0.98)
        .setStrokeStyle(2.5, char.color, 0.95),
    );

    // Portrait — a tinted silhouette in its column, bottom-aligned to the box,
    // capped so it never runs off the top of the screen.
    const portraitBottom = boxCy + boxH / 2 - 6;
    let portraitH = Math.min(boxH * 1.12, vh * 0.42);
    let portraitW = portraitH * (96 / 112);
    if (portraitW > colW) {
      portraitW = colW;
      portraitH = portraitW * (112 / 96);
    }
    const portraitX = left + pad + colW / 2;
    parts.push(
      this.scene.add
        .rectangle(portraitX, portraitBottom - portraitH * 0.45, portraitW + 8, portraitH * 0.92, 0x0c0c14, 0.9)
        .setStrokeStyle(2, char.color, 0.55),
    );
    const portrait = this.scene.add
      .image(portraitX, portraitBottom, portraitKey(beat.character))
      .setOrigin(0.5, 1)
      .setDisplaySize(portraitW, portraitH)
      .setTint(char.color);
    parts.push(portrait);
    // Fresh beat: slide the portrait up + fade/pop it in so the speaker "enters".
    if (!this.revealed) {
      portrait.setAlpha(0).setY(portraitBottom + 14);
      this.scene.tweens.add({
        targets: portrait,
        y: portraitBottom,
        alpha: 1,
        duration: 260,
        ease: 'Back.out',
      });
    }

    // Name plate.
    const nameY = boxTop + 16;
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

    // Body lines (built + measured above). Freeze the wrapped layout so the
    // typewriter can reveal a growing substring without any reflow jumps.
    this.fullText = body.getWrappedText(beat.lines.join('\n')).join('\n');
    body.setText(this.revealed ? this.fullText : '');
    body.setPosition(textLeft, boxTop + topArea);
    this.bodyText = body;
    parts.push(body);

    // Advance hint.
    const hint = this.scene.add
      .text(cx + boxW / 2 - 12, boxCy + boxH / 2 - 11, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9aa0b0',
      })
      .setOrigin(1, 0.5);
    this.hintText = hint;
    parts.push(hint);

    this.container = this.scene.add.container(0, 0, parts).setDepth(DEPTH + 1).setScrollFactor(0);
    // Make the whole box tappable too (not just the backdrop).
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(left, boxTop, boxW, boxH),
      Phaser.Geom.Rectangle.Contains,
    );
    this.container.on('pointerdown', () => this.onTap());

    if (this.revealed) this.updateHint();
    else this.startTyping(beat.character);
  }

  /** Reveal the current beat's text one chunk at a time, with a per-char blip. */
  private startTyping(character: string): void {
    this.typing = true;
    this.updateHint();
    const freq = VOICE[character] ?? VOICE_DEFAULT;
    let n = 0;
    const total = this.fullText.length;
    this.typeEvent = this.scene.time.addEvent({
      delay: TYPE_DELAY,
      loop: true,
      callback: () => {
        n += TYPE_STEP;
        this.bodyText?.setText(this.fullText.slice(0, n));
        const ch = this.fullText[n - 1];
        // Blip only on a printable char, and only every other tick, so the
        // "voice" patters along with the text without becoming a buzz.
        if (ch && ch !== ' ' && ch !== '\n' && n % 4 === 0) audio.sfx('talk', { freq });
        if (n >= total) this.finishTyping();
      },
    });
  }

  /** Skip to (or settle on) the full text and stop the typewriter. */
  private finishTyping(): void {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.typing = false;
    this.revealed = true;
    this.bodyText?.setText(this.fullText);
    this.updateHint();
  }

  /** Hint reflects whether we're mid-type (skip) or ready to advance. */
  private updateHint(): void {
    if (!this.hintText) return;
    if (this.typing) {
      this.hintText.setText('tap to skip');
      return;
    }
    const last = this.index === this.beats.length - 1;
    this.hintText.setText(last ? 'tap to continue ▶' : 'tap ▶');
  }

  /** The beat's lines as a wrapped text object (used for measure + display). */
  private makeBody(beat: StoryBeat, fontSize: number, textW: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, beat.lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color: '#e8e8f0',
        lineSpacing: 5,
        wordWrap: { width: textW },
      })
      .setOrigin(0, 0);
  }

  /** Reflow on resize (no-op if closed). */
  relayout(): void {
    if (!this.isOpen) return;
    this.backdrop?.setSize(this.scene.scale.width, this.scene.scale.height);
    this.render();
  }

  close(): void {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.typing = false;
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.container?.destroy(true);
    this.container = undefined;
    this.bodyText = undefined;
    this.hintText = undefined;
    this.beats = [];
    this.index = 0;
  }
}
