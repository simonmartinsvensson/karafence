import { loadAudio, saveAudio, type AudioSettings } from './storage';

/**
 * KaraFence audio engine — entirely procedural (Web Audio API), so the game
 * ships with no audio asset files. Music is a looping chiptune sequencer with a
 * track per game context; SFX are one-shot synthesized blips.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  SWAPPING IN REAL TRACKS / SAMPLES
 * ──────────────────────────────────────────────────────────────────────────
 *  This module is intentionally the single seam for audio. To replace the
 *  placeholder chiptune with real assets later:
 *
 *   • Music: drop loop files in `public/assets/audio/` and rewrite `playMusic`
 *     to drive an <audio> element (or Phaser sound) per `MusicTrackName`
 *     instead of `startSequencer`/`TRACKS`. The call sites (MenuScene /
 *     GameScene) already name the right track for each context, so nothing
 *     upstream changes.
 *   • SFX: replace the body of `sfx()` with buffer playback keyed by `SfxName`
 *     (decode files once on unlock). The throttle table + call sites stay.
 *
 *  Everything routes through `master` (mute/volume), so persistence and the
 *  pause-menu controls keep working regardless of the source.
 *
 *  Autoplay policy: browsers start an AudioContext suspended until a user
 *  gesture. We create/resume it on the first pointer/touch/key event (see the
 *  listeners wired in the constructor) and (re)start whatever music context was
 *  requested before the unlock.
 */

export type MusicTrackName =
  | 'menu'
  | 'inWave'
  | 'intermission'
  | 'boss'
  | 'gameover'
  | 'victory';

export type SfxName =
  | 'shoot'
  | 'hit'
  | 'death'
  | 'reachStage'
  | 'gold'
  | 'comboTick'
  | 'bossEntrance'
  | 'ability'
  | 'waveClear'
  // Menu / meta-progression flourishes (see MenuScene).
  | 'reward' // achievement claimed
  | 'levelUp' // a tower branch / research node maxed
  | 'fanfare'; // prestige + rank-up

// --- Note helpers ----------------------------------------------------------

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Scientific-pitch note name ("A4", "C#5", "Eb3") -> frequency in Hz. */
function noteToFreq(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return 0;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const semis = SEMITONE[m[1]] + accidental;
  const midi = semis + (parseInt(m[3], 10) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pre-resolve a pattern of note names (null = rest) into Hz once. */
const f = (...names: (string | null)[]): (number | null)[] =>
  names.map((n) => (n ? noteToFreq(n) : null));

// --- Music tracks ----------------------------------------------------------
// Each track is an 8th-note grid looped forever. `lead`/`bass` can differ in
// length (they wrap independently) for a less mechanical feel.

interface MusicTrack {
  bpm: number;
  /** Overall track loudness relative to the music bus. */
  gain: number;
  leadType: OscillatorType;
  bassType: OscillatorType;
  lead: (number | null)[];
  bass: (number | null)[];
}

const TRACKS: Record<MusicTrackName, MusicTrack> = {
  // Menu: relaxed, welcoming, major key.
  menu: {
    bpm: 96,
    gain: 0.5,
    leadType: 'triangle',
    bassType: 'sine',
    lead: f('E5', null, 'G5', null, 'B4', null, 'C5', 'D5', 'E5', null, 'D5', null, 'C5', null, 'B4', null),
    bass: f('C3', null, 'C3', null, 'G2', null, 'G2', null, 'A2', null, 'A2', null, 'F2', null, 'G2', null),
  },
  // In-wave: upbeat, driving, bouncy — the main groove.
  inWave: {
    bpm: 132,
    gain: 0.42,
    leadType: 'square',
    bassType: 'triangle',
    lead: f('A4', 'C5', 'E5', 'A5', 'E5', 'C5', 'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'F4', 'A4', 'C5', 'E5'),
    bass: f('A2', null, 'A2', 'A2', 'G2', null, 'G2', 'G2', 'F2', null, 'F2', 'F2', 'E2', null, 'E2', 'E2'),
  },
  // Intermission: calmer breather between waves.
  intermission: {
    bpm: 84,
    gain: 0.4,
    leadType: 'triangle',
    bassType: 'sine',
    lead: f('C5', null, null, 'E5', null, null, 'G5', null, 'F5', null, null, 'D5', null, null, 'C5', null),
    bass: f('C3', null, null, null, 'A2', null, null, null, 'F2', null, null, null, 'G2', null, null, null),
  },
  // Boss: intense, minor, relentless 16th-feel bass.
  boss: {
    bpm: 150,
    gain: 0.46,
    leadType: 'sawtooth',
    bassType: 'square',
    lead: f('A4', 'A4', 'C5', 'E5', 'F5', 'E5', 'C5', 'A4', 'G#4', 'B4', 'E5', 'G5', 'F5', 'E5', 'D5', 'C5'),
    bass: f('A1', 'A1', 'A1', 'A1', 'F1', 'F1', 'F1', 'F1', 'E1', 'E1', 'E1', 'E1', 'G1', 'G1', 'G1', 'G1'),
  },
  // Game over: somber, slow descent.
  gameover: {
    bpm: 72,
    gain: 0.42,
    leadType: 'triangle',
    bassType: 'sine',
    lead: f('A4', null, 'G4', null, 'F4', null, 'E4', null, 'D4', null, null, null, 'C4', null, null, null),
    bass: f('A2', null, null, null, 'F2', null, null, null, 'D2', null, null, null, 'C2', null, null, null),
  },
  // Victory: triumphant fanfare loop, bright major.
  victory: {
    bpm: 120,
    gain: 0.48,
    leadType: 'square',
    bassType: 'triangle',
    lead: f('C5', 'E5', 'G5', 'C6', null, 'G5', 'C6', null, 'D5', 'F5', 'A5', 'D6', null, 'A5', 'D6', null),
    bass: f('C3', null, 'G2', null, 'C3', null, 'E3', null, 'F2', null, 'C3', null, 'G2', null, 'G2', null),
  },
};

/** Minimum seconds between repeats of the same SFX (machine-gun guard). */
const SFX_THROTTLE: Partial<Record<SfxName, number>> = {
  shoot: 0.05,
  hit: 0.04,
  death: 0.03,
  comboTick: 0.04,
};

type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Singleton audio engine. Scene-independent so music survives scene changes.
 * Access via the exported `audio` instance.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode; // mute/volume bus (everything routes here)
  private musicBus!: GainNode; // music sub-bus (for track gain / future ducking)
  private sfxBus!: GainNode; // sfx sub-bus

  private settings: AudioSettings;

  // Sequencer state.
  private current: MusicTrackName | null = null;
  private pending: MusicTrackName | null = null; // requested before unlock
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private lastSfx: Record<string, number> = {};

  private static readonly LOOKAHEAD_MS = 25;
  private static readonly SCHEDULE_AHEAD = 0.12; // seconds

  constructor() {
    this.settings = loadAudio();
    // A user gesture is required to start audio; resume on the first one.
    if (typeof window !== 'undefined') {
      const unlock = () => this.unlock();
      for (const evt of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
        window.addEventListener(evt, unlock, { capture: true });
      }
    }
  }

  // --- Lifecycle -----------------------------------------------------------

  /** Create the context + bus graph lazily (first gesture). */
  private ensureContext(): boolean {
    if (this.ctx) return true;
    const Ctx =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as WindowWithAudio).webkitAudioContext
        : undefined;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.applyMasterGain(0);
    return true;
  }

  /**
   * Resume the context on a user gesture and (re)assert the desired track.
   * Runs on every gesture so that if the context was suspended (tab refocus on
   * mobile) and a track was requested meanwhile, it actually starts on return.
   * `playMusic` is a no-op when already on the right track, so this never
   * restarts music on an ordinary tap.
   */
  private unlock(): void {
    if (!this.ensureContext() || !this.ctx) return;
    const start = (): void => {
      const track = this.pending ?? this.current;
      if (track && this.current !== track) {
        this.current = null;
        this.playMusic(track);
      } else if (track && this.schedulerId === null) {
        this.current = null; // scheduler was stopped — restart the same track
        this.playMusic(track);
      }
    };
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(start);
    else start();
  }

  private get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private applyMasterGain(ramp: number): void {
    if (!this.ctx) return;
    const target = this.settings.muted ? 0 : this.settings.volume;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + ramp);
  }

  // --- Settings (pause menu) ----------------------------------------------

  get muted(): boolean {
    return this.settings.muted;
  }

  get volume(): number {
    return this.settings.volume;
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    saveAudio(this.settings);
    this.applyMasterGain(0.08);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  /** Set master volume (0-1). Unmutes when raised above zero. */
  setVolume(volume: number): void {
    this.settings.volume = Math.min(1, Math.max(0, volume));
    if (this.settings.volume > 0 && this.settings.muted) this.settings.muted = false;
    saveAudio(this.settings);
    this.applyMasterGain(0.08);
  }

  // --- Music sequencer -----------------------------------------------------

  /**
   * Switch the looping background music to `track`. No-op if already playing
   * it. If audio isn't unlocked yet, the request is remembered and started on
   * the first user gesture.
   */
  playMusic(track: MusicTrackName): void {
    if (this.current === track) return;
    this.pending = track;
    if (!this.ready) return;
    this.current = track;
    this.step = 0;
    this.nextNoteTime = this.ctx!.currentTime + 0.06;
    if (this.schedulerId === null) {
      this.schedulerId = window.setInterval(
        () => this.scheduler(),
        AudioManager.LOOKAHEAD_MS,
      );
    }
  }

  stopMusic(): void {
    this.current = null;
    this.pending = null;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  /** Look-ahead scheduler: queue every note that falls due in the next window. */
  private scheduler(): void {
    if (!this.ctx || !this.current) return;
    // Don't schedule while the context is suspended (e.g. the tab is in the
    // background) — `currentTime` is frozen there, and on resume it jumps
    // forward, which would otherwise make the catch-up loop queue a huge burst
    // of overlapping notes at once. Re-anchor the clock when far behind.
    if (this.ctx.state !== 'running') return;
    if (this.nextNoteTime < this.ctx.currentTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.06;
    }
    const track = TRACKS[this.current];
    const stepDur = 60 / track.bpm / 2; // 8th notes
    while (this.nextNoteTime < this.ctx.currentTime + AudioManager.SCHEDULE_AHEAD) {
      const lead = track.lead[this.step % track.lead.length];
      const bass = track.bass[this.step % track.bass.length];
      if (lead) {
        this.voice(lead, this.nextNoteTime, stepDur * 0.9, track.leadType, track.gain * 0.5);
      }
      if (bass) {
        this.voice(bass, this.nextNoteTime, stepDur * 1.6, track.bassType, track.gain * 0.7);
      }
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  /** One enveloped oscillator note on the music bus. */
  private voice(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // --- SFX -----------------------------------------------------------------

  /** Fire a one-shot sound effect (no-op until audio is unlocked). */
  sfx(name: SfxName, opts: { combo?: number } = {}): void {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const minGap = SFX_THROTTLE[name] ?? 0;
    if (minGap > 0 && now - (this.lastSfx[name] ?? -1) < minGap) return;
    this.lastSfx[name] = now;

    switch (name) {
      case 'shoot':
        this.blip(880, 660, 0.07, 'square', 0.18);
        break;
      case 'hit':
        this.blip(440, 300, 0.05, 'triangle', 0.16);
        break;
      case 'death':
        this.blip(360, 90, 0.16, 'sawtooth', 0.2);
        this.noise(0.08, 0.12);
        break;
      case 'reachStage':
        this.blip(160, 70, 0.4, 'sawtooth', 0.28);
        break;
      case 'gold':
        // Two-tone "coin" pickup.
        this.blip(988, 988, 0.06, 'square', 0.2);
        this.blip(1319, 1319, 0.12, 'square', 0.2, 0.06);
        break;
      case 'comboTick': {
        // Pitch climbs with the combo for a rising musical streak.
        const semis = Math.min(24, (opts.combo ?? 1) - 1);
        const base = 523.25 * Math.pow(2, semis / 12);
        this.blip(base, base, 0.08, 'square', 0.16);
        break;
      }
      case 'bossEntrance':
        this.blip(110, 220, 0.7, 'sawtooth', 0.32);
        this.noise(0.5, 0.12);
        break;
      case 'ability':
        // Bright rising arpeggio.
        this.blip(523, 523, 0.08, 'square', 0.2);
        this.blip(659, 659, 0.08, 'square', 0.2, 0.06);
        this.blip(988, 988, 0.16, 'square', 0.2, 0.12);
        break;
      case 'waveClear':
        // Pleasant ascending chord.
        this.blip(523, 523, 0.18, 'triangle', 0.22);
        this.blip(659, 659, 0.18, 'triangle', 0.22, 0.05);
        this.blip(784, 784, 0.3, 'triangle', 0.22, 0.1);
        break;
      case 'reward':
        // Bright two-tone "ding" with a high sparkle — a satisfying claim.
        this.blip(784, 784, 0.1, 'triangle', 0.22);
        this.blip(1047, 1047, 0.12, 'triangle', 0.22, 0.07);
        this.blip(1568, 1568, 0.16, 'sine', 0.16, 0.14);
        break;
      case 'levelUp':
        // Ascending C-E-G-C arpeggio — a small "mastered it" cue.
        this.blip(523, 523, 0.1, 'square', 0.2);
        this.blip(659, 659, 0.1, 'square', 0.2, 0.08);
        this.blip(784, 784, 0.1, 'square', 0.2, 0.16);
        this.blip(1047, 1047, 0.22, 'square', 0.2, 0.24);
        break;
      case 'fanfare':
        // Brassy rising flourish + shimmer — prestige / rank-up.
        this.blip(392, 392, 0.14, 'sawtooth', 0.22);
        this.blip(523, 523, 0.14, 'sawtooth', 0.22, 0.1);
        this.blip(659, 659, 0.14, 'sawtooth', 0.22, 0.2);
        this.blip(1047, 1047, 0.34, 'square', 0.24, 0.3);
        this.noise(0.3, 0.05);
        break;
    }
  }

  /** A short tone with an optional pitch slide, started `delay` s from now. */
  private blip(
    fromHz: number,
    toHz: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t);
    if (toHz !== fromHz) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short filtered white-noise burst (impacts / explosions). */
  private noise(dur: number, gain: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(env).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur);
  }
}

/** Shared, scene-independent audio engine. */
export const audio = new AudioManager();
