import { loadHaptics, saveHaptics } from './storage';

/**
 * Lightweight haptic feedback for **Android Chrome** (the Vibration API is a
 * no-op on iOS Safari and most desktops). Feature-detected and user-toggleable;
 * every call is a no-op when unsupported or disabled, so call sites stay
 * unconditional (`haptics.play('tap')`). Mirrors the `audio` singleton style.
 */
export type HapticName =
  | 'tap' // a button / menu press — the lightest tick
  | 'place' // a tower placed
  | 'error' // an invalid action (can't build / can't afford)
  | 'soft' // a wave cleared — a gentle confirm
  | 'heavy' // a boss arrives
  | 'success' // an achievement / reward claimed
  | 'win' // chapter / campaign victory
  | 'lose'; // the show is over

// Vibration patterns in ms (single number = one buzz; array = on/off timings).
const PATTERNS: Record<HapticName, number | number[]> = {
  tap: 10,
  place: 18,
  error: [0, 26, 40, 26],
  soft: 14,
  heavy: 45,
  success: [0, 16, 30, 26],
  win: [0, 22, 40, 22, 40, 70],
  lose: [0, 90],
};

class Haptics {
  /** True only where `navigator.vibrate` exists (≈ Android Chrome/Firefox). */
  readonly supported: boolean =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  private enabled: boolean;
  private last = 0;

  constructor() {
    this.enabled = loadHaptics();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    saveHaptics(on);
    // Cancel any in-flight buzz the moment haptics are turned off.
    if (!on && this.supported) navigator.vibrate(0);
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /** Fire a named haptic. No-op when unsupported, disabled, or fired too fast. */
  play(name: HapticName): void {
    if (!this.supported || !this.enabled) return;
    const now = Date.now();
    // Coalesce rapid bursts (e.g. a flurry of kills) into a single buzz so the
    // phone never stutters; light taps are still responsive at ~40/s.
    if (now - this.last < 24) return;
    this.last = now;
    try {
      navigator.vibrate(PATTERNS[name]);
    } catch {
      /* Some browsers throw outside a user gesture — safe to ignore. */
    }
  }
}

export const haptics = new Haptics();
