import Phaser from 'phaser';

/**
 * High-DPI (Retina / Android) crisp rendering.
 *
 * Phaser's RESIZE scale mode sizes the canvas backing store to CSS pixels, so on
 * a device with `devicePixelRatio > 1` the browser upscales a low-res buffer and
 * everything (especially text + gradients) looks soft/blocky. This installs a
 * supersampling layer that keeps the whole game authored in **CSS pixels**
 * (1 unit == 1 CSS px, so no scene/layout code changes) while rendering into a
 * backing store of `cssSize × dpr` physical pixels.
 *
 * How it stays consistent across rendering AND input:
 *  - canvas backing  = cssSize · dpr, displayed (CSS) at cssSize → 1:1 with the
 *    physical screen when dpr matches the device (pixel-perfect).
 *  - renderer/projection/viewport (and the postFX render targets, which size off
 *    `renderer.width`) run at the physical size, so the whole frame is hi-res.
 *  - each camera maps the CSS world onto the physical buffer with a pure ×dpr:
 *    `origin (0,0)`, `zoom = dpr`, `scroll = 0`. Origin-0 (not the default
 *    centre) makes the scale a plain multiply, so `scrollFactor: 0` UI (e.g. the
 *    DialogueOverlay) lands in the right place too.
 *  - input: `displayScale = dpr` so a CSS-pixel pointer delta becomes a physical
 *    coordinate, which the camera's ×dpr transform inverts straight back to the
 *    CSS world — taps map to the same tile they always did.
 *
 * Capped at 3× so a 4× phone doesn't allocate an enormous buffer. At dpr 1 the
 * whole thing is a no-op. WebGL + Canvas both work (Canvas just skips postFX).
 */
const MAX_DPR = 3;

function deviceDpr(): number {
  const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.min(MAX_DPR, raw));
}

function fixCameras(game: Phaser.Game, dpr: number, pxW: number, pxH: number): void {
  for (const scene of game.scene.getScenes(true)) {
    const list = scene.cameras?.cameras;
    if (!list) continue;
    for (const cam of list) {
      // Idempotent: only rewrite a camera that has drifted (fresh cameras from a
      // scene start default to CSS size, centre origin, zoom 1).
      if (cam.zoom !== dpr || cam.width !== pxW || cam.height !== pxH || cam.originX !== 0) {
        cam.setSize(pxW, pxH);
        cam.setOrigin(0, 0);
        cam.setZoom(dpr);
      }
    }
  }
}

export function installHiDPI(game: Phaser.Game): void {
  const apply = (): void => {
    const dpr = deviceDpr();
    const scale = game.scale;
    const cssW = scale.gameSize.width;
    const cssH = scale.gameSize.height;
    if (cssW <= 0 || cssH <= 0) return; // pre-first-refresh; the resize event re-fires
    if (dpr === 1) return; // nothing to gain at 1×

    const pxW = Math.floor(cssW * dpr);
    const pxH = Math.floor(cssH * dpr);
    const canvas = game.canvas;

    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    // Keep the on-screen (CSS) size at the logical size; only the buffer is dense.
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    // Renderer (projection + gl viewport + postFX render targets) at physical res.
    game.renderer.resize(pxW, pxH);

    // Input: a CSS-pixel pointer delta × displayScale must yield a physical coord.
    scale.baseSize.setSize(pxW, pxH);
    scale.displayScale.set(pxW / cssW, pxH / cssH);

    fixCameras(game, dpr, pxW, pxH);
  };

  game.scale.on(Phaser.Scale.Events.RESIZE, apply);
  // Scene starts mint fresh cameras (default CSS size); keep them fixed each frame.
  game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
    const dpr = deviceDpr();
    if (dpr === 1) return;
    fixCameras(game, dpr, game.canvas.width, game.canvas.height);
  });

  apply();
}
