import type { LevelId } from './levels';

/**
 * Story-mode content — ALL narrative lives here so the script can be tuned
 * without touching game logic. `GameScene` (story mode only) looks up the
 * beats for a `(levelId, waveAfter)` pair after each wave clears (and the
 * `waveAfter: 0` beat at chapter start) and plays them through the reusable
 * `DialogueOverlay`.
 *
 * Cast:
 *  - ALEX  — the player character; an aspiring singer defending their first gig.
 *  - VY    — a seasoned producer / mentor who took a chance on Alex.
 *  - MAX   — a rival act; antagonistic at first, with a small change of heart.
 *  - THE JUDGE — the talent-show judge (the wave-20 boss persona) who quietly
 *    runs the local scene and decides who gets booked.
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
 * Beats per chapter (map). Several beats may share a `waveAfter` — they play in
 * order as a little back-and-forth. Edit freely: this is pure data.
 */
export const STORY_BEATS: Record<LevelId, StoryBeat[]> = {
  // Chapter 1 — The Dive Bar.
  level1: [
    {
      waveAfter: 1,
      character: 'vy',
      lines: [
        "Not bad for a first song, kid. Name's Vy — I book the talent here.",
        "This crowd came to heckle, not to listen. Your job is to keep singing anyway.",
      ],
    },
    {
      waveAfter: 1,
      character: 'alex',
      lines: [
        "I, uh — I've never played a room this rowdy.",
        "What if I freeze up out there?",
      ],
    },
    {
      waveAfter: 3,
      character: 'max',
      lines: [
        "Oh, look. Fresh meat at the mic.",
        "Cute. You'll never last the night, newbie.",
      ],
    },
    {
      waveAfter: 5,
      character: 'vy',
      lines: [
        "You just sent the Heckler King home crying into his last call.",
        "I've signed pros who couldn't do that. Maybe you've got something.",
      ],
    },
    {
      waveAfter: 5,
      character: 'alex',
      lines: ["Huh. They're... actually listening now.", "Okay. Okay! I can do this."],
    },
    {
      waveAfter: 8,
      character: 'max',
      lines: [
        "Lucky streak. That's all this is.",
        "...you're really still up there, huh.",
      ],
    },
    {
      waveAfter: 10,
      character: 'vy',
      lines: [
        "That Mic Grabber works for someone. Someone who's been watching you.",
        "There's a name nobody says too loud around here: The Judge.",
      ],
    },
    {
      waveAfter: 13,
      character: 'vy',
      lines: [
        "The Judge decides who gets booked in this town. Every stage, every slot.",
        "He doesn't like surprises. And kid — you are one big surprise.",
      ],
    },
    {
      waveAfter: 15,
      character: 'max',
      lines: [
        "You shut down the DJ. The DJ. Nobody shuts down the DJ.",
        "...Look. Don't let it go to your head. But — nice set. I mean it.",
      ],
    },
    {
      waveAfter: 18,
      character: 'vy',
      lines: [
        "He's coming himself now. No more middlemen.",
        "Whatever he says up there — remember why you got on that stage.",
      ],
    },
    {
      waveAfter: 18,
      character: 'alex',
      lines: ["I'm not singing for him.", "I'm singing because it's mine. Let's finish this."],
    },
    {
      waveAfter: 20,
      character: 'judge',
      lines: ["...Fine. You have the room.", "Don't waste it. The big stages are watching now."],
    },
    {
      waveAfter: 20,
      character: 'max',
      lines: ["Yeah, yeah. You earned it.", "Buy me a drink sometime, headliner."],
    },
    {
      waveAfter: 20,
      character: 'vy',
      lines: [
        "Pack your mic, kid. The Dive Bar's too small for you now.",
        "Let's get you to The Grand Stage.",
      ],
    },
  ],

  // Chapter 2 — The Grand Stage.
  level2: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        "Bigger room. Brighter lights. Faster crowd.",
        "Same you. Same mic. Show them what the Dive Bar already knows.",
      ],
    },
    {
      waveAfter: 10,
      character: 'alex',
      lines: [
        "This crowd moves so fast I can barely keep a verse going.",
        "...but I'm keeping it going.",
      ],
    },
    {
      waveAfter: 18,
      character: 'vy',
      lines: ["One more wave. The whole scene is in this room tonight.", "Land it."],
    },
    {
      waveAfter: 20,
      character: 'alex',
      lines: [
        "We did it, Vy. The whole place — on its feet.",
        "I didn't think a night could feel like this.",
      ],
    },
    {
      waveAfter: 20,
      character: 'vy',
      lines: [
        "You did it. I just held the door.",
        "Go on — take your bow, headliner. You earned every note.",
      ],
    },
  ],
};

/** Order chapters are played in (story mode auto-advances through these). */
export const CHAPTER_ORDER: LevelId[] = ['level1', 'level2'];

/** The chapter after `levelId`, or null if it's the last one. */
export function nextChapter(levelId: LevelId): LevelId | null {
  const i = CHAPTER_ORDER.indexOf(levelId);
  return i >= 0 && i < CHAPTER_ORDER.length - 1 ? CHAPTER_ORDER[i + 1] : null;
}

/** Every beat to play after `waveNumber` clears on `levelId` (in order). */
export function beatsAfterWave(levelId: LevelId, waveNumber: number): StoryBeat[] {
  return (STORY_BEATS[levelId] ?? []).filter((b) => b.waveAfter === waveNumber);
}
