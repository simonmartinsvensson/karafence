import Phaser from 'phaser';
import { TOUCH_MIN } from '../config';
import { TX } from '../systems/textures';
import { pressFeedback } from '../systems/touch';

export type TreeNodeState = 'owned' | 'next' | 'gate' | 'locked' | 'future';

export interface TreeNodeOpts {
  state: TreeNodeState;
  accent: number;
  capstone?: boolean;
  /** Small caption under the node (cost / star requirement). */
  costLabel?: string;
  /** Tap handler — when set, an invisible ≥44px hit target is added. */
  action?: (() => void) | null;
  /** Base depth; the node uses depth..depth+3 (glow / shape / labels / hit). */
  depth?: number;
}

/**
 * One skill-tree node, shared by every upgrade surface (per-tower branches,
 * research ladders, in-run paths). Returns every GameObject it creates so the
 * caller can add them to its own list/container — owned = filled accent, next =
 * glowing with cost, gate = amber ★, locked/future = dim, capstone = gold diamond.
 */
export function makeTreeNode(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  opts: TreeNodeOpts,
): Phaser.GameObjects.GameObject[] {
  const { state, accent, capstone = false, costLabel = '', action = null } = opts;
  const d = opts.depth ?? 0;
  const owned = state === 'owned';
  const next = state === 'next';
  const gate = state === 'gate';
  const active = next || gate;
  const out: Phaser.GameObjects.GameObject[] = [];

  if (active) {
    out.push(
      scene.add
        .image(x, y, TX.glow)
        .setDisplaySize(r * 5, r * 5)
        .setTint(gate ? 0xffd166 : accent)
        .setAlpha(0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(d),
    );
  }
  const fill = owned ? accent : active ? 0x232336 : 0x171720;
  const stroke = owned ? 0xffffff : next ? accent : gate ? 0xffd166 : state === 'locked' ? 0x6b6b75 : 0x33333f;
  const alpha = owned || active ? 0.98 : 0.65;
  let shape: Phaser.GameObjects.Shape;
  if (capstone) {
    shape = scene.add
      .rectangle(x, y, r * 1.8, r * 1.8, owned ? 0xffd166 : fill, alpha)
      .setStrokeStyle(active ? 3 : 2, owned ? 0xffffff : stroke, 1)
      .setAngle(45)
      .setDepth(d + 1);
  } else {
    shape = scene.add.circle(x, y, r, fill, alpha).setStrokeStyle(next ? 3 : 2, stroke, 1).setDepth(d + 1);
  }
  out.push(shape);
  if (capstone && owned) {
    out.push(
      scene.add
        .text(x, y, '★', { fontFamily: 'monospace', fontSize: `${Math.round(r)}px`, color: '#1a1a22' })
        .setOrigin(0.5)
        .setDepth(d + 2),
    );
  }
  if (costLabel) {
    out.push(
      scene.add
        .text(x, y + r + 9, costLabel, { fontFamily: 'monospace', fontSize: '10px', color: '#ffd166' })
        .setOrigin(0.5)
        .setDepth(d + 2),
    );
  }
  if (action) {
    const hs = Math.max(TOUCH_MIN, r * 2.6);
    const hit = scene.add.rectangle(x, y, hs, hs, 0xffffff, 0.001).setDepth(d + 3).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation();
      action();
    });
    pressFeedback(hit, [shape]);
    out.push(hit);
  }
  return out;
}
