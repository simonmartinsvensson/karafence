import type { LevelId } from './levels';
import { CAMPAIGN } from './campaign';

/**
 * Story-mode content — ALL narrative + the tutorial script lives here so it can
 * be tuned without touching game logic. `GameScene` (story mode only) looks up
 * the beats for a `(levelId, waveAfter)` pair after each wave clears (and the
 * `waveAfter: 0` beat at chapter start) and plays them through the reusable
 * `DialogueOverlay`. Levels with no entry simply play with no dialogue.
 *
 * Cast:
 *  - ALEX  — the player character; an aspiring singer working up the circuit.
 *  - VY    — a seasoned producer / mentor (also the tutorial coach).
 *  - MAX   — a rival act; antagonistic at first, with a small change of heart.
 *  - THE JUDGE — runs the local scene and decides who gets booked.
 */

export interface StoryCharacter {
  /** Display name shown on the dialogue name-plate. */
  name: string;
  /** Silhouette / name-plate tint (the portrait is drawn as a tinted figure). */
  color: number;
}

export const CHARACTERS: Record<string, StoryCharacter> = {
  alex: { name: 'ALEX', color: 0xff7eb6 },
  vy: { name: 'VY', color: 0x66d9e8 },
  max: { name: 'MAX', color: 0xff6b6b },
  judge: { name: 'THE JUDGE', color: 0x845ef7 },
};

/** One unit of dialogue: a character speaking 1-3 lines after a given wave. */
export interface StoryBeat {
  /** Played after this wave number clears. `0` = at chapter start. */
  waveAfter: number;
  /** Key into `CHARACTERS`. */
  character: string;
  /** 1-3 lines, shown together; a tap advances to the next beat. */
  lines: string[];
}

/**
 * Beats per level id. Level 1 ("The Garage") is the guided tutorial; later
 * levels carry a light narrative arc at milestone venues. Several beats may
 * share a `waveAfter` — they play in order. Edit freely: this is pure data.
 */
export const STORY_BEATS: Record<LevelId, StoryBeat[]> = {
  // Level 1 — TUTORIAL. (waveCount is 3, so beats land at 0/1/2/3.)
  level1: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        "Welcome to The Garage, kid — where every singer starts.",
        'Tap a glowing seat (the green +) to set up a bandmate. They defend the lanes on their own; your job is to place them well.',
        "Spend your gold, then hit ▶ START WAVE 1 when you're ready. No rush — plan first.",
      ],
    },
    {
      waveAfter: 1,
      character: 'vy',
      lines: [
        'Nice. Your Lead Singer picks off one heckler at a time down a lane.',
        'Tap a placed bandmate to upgrade them or change who they target — first, last, or strongest.',
        'Each act has two upgrade paths but can only MAX one. Pick a specialty.',
      ],
    },
    {
      waveAfter: 2,
      character: 'vy',
      lines: [
        'Different acts, different jobs: the Drummer hits a whole cluster, the Keyboardist slows a lane, the Bass Player shoves the crowd back.',
        "The Backup Singer and Hype Man don't attack — they boost the bandmates around them. Tuck them in the middle of your setup.",
        'Place where two lanes run close and one act can cover both.',
      ],
    },
    {
      waveAfter: 3,
      character: 'vy',
      lines: [
        "That's the whole game, kid. Place smart, upgrade smarter, hold the stage.",
        'The real venues are waiting. Let’s go.',
      ],
    },
  ],

  // Level 5 — the rival shows up.
  level5: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ["Oh, fresh meat at the mic.", "Cute. You'll never last the night, newbie."],
    },
  ],

  // Level 10 — the Judge is named.
  level10: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Word travels. Someone’s been watching your sets.',
        'There’s a name nobody says too loud around here: The Judge. He decides who gets booked.',
      ],
    },
  ],

  // Level 15 — Max comes around.
  level15: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ["...okay. You’re the real deal.", 'Knock ’em dead up there. I mean it.'],
    },
  ],

  // Level 19 — The Grand Stage.
  level19: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['The Grand Stage. Everyone who matters is in this room tonight.', 'Whatever happens — sing it like it’s yours.'],
    },
  ],

  // Level 20 — World Finals + the closing exchange.
  level20: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['So you’re the one stirring up my circuit.', 'Let’s see if you can hold the biggest stage there is.'],
    },
    {
      waveAfter: 20,
      character: 'alex',
      lines: ['We did it, Vy. The whole world — on its feet.', "I didn’t think a night could feel like this."],
    },
    {
      waveAfter: 20,
      character: 'vy',
      lines: ['You did it. I just held the door.', 'Take your bow, headliner. You earned every note.'],
    },
  ],
};

/** Story chapters in play order (the campaign ids; endless is separate). */
export const CHAPTER_ORDER: LevelId[] = CAMPAIGN.map((entry) => entry.id);

/** The chapter after `levelId`, or null if it's the last one. */
export function nextChapter(levelId: LevelId): LevelId | null {
  const i = CHAPTER_ORDER.indexOf(levelId);
  return i >= 0 && i < CHAPTER_ORDER.length - 1 ? CHAPTER_ORDER[i + 1] : null;
}

/** Every beat to play after `waveNumber` clears on `levelId` (in order). */
export function beatsAfterWave(levelId: LevelId, waveNumber: number): StoryBeat[] {
  return (STORY_BEATS[levelId] ?? []).filter((b) => b.waveAfter === waveNumber);
}
