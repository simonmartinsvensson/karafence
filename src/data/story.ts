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
 * Beats per level id. The campaign teaches one act at a time: each tower's
 * how-it-works beat sits at the level where it auto-unlocks (TOWER_STORY_UNLOCK
 * in meta.ts), so the tutorial never mentions a tower you can't build yet.
 * Level 1 teaches only the two starting acts (Lead Singer + Drummer) + basics.
 * Several beats may share a `waveAfter` — they play in order. Pure data.
 */
export const STORY_BEATS: Record<LevelId, StoryBeat[]> = {
  // Level 1 — TUTORIAL (3 short waves → beats at 0/1/2/3). Only the two
  // starting acts: Lead Singer + Drummer.
  level1: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Welcome to The Garage, kid — where every singer starts.',
        'Tap a glowing seat to set up a bandmate. They defend the lanes on their own; your job is to place them well.',
        "Spend your gold, then hit ▶ START WAVE 1 when you're ready. No rush — plan first.",
      ],
    },
    {
      waveAfter: 1,
      character: 'vy',
      lines: [
        'Nice. Your Lead Singer picks off one heckler at a time down a lane.',
        'Tap a placed bandmate to upgrade it or change who it targets — first, last, or strongest.',
      ],
    },
    {
      waveAfter: 2,
      character: 'vy',
      lines: [
        'Your other starter, the Drummer, hits a whole cluster at once.',
        'Park it where a few lanes bunch up and it covers them all.',
      ],
    },
    {
      waveAfter: 3,
      character: 'vy',
      lines: [
        "That's the basics, kid. Place smart, upgrade smarter, hold the stage.",
        'I’ll introduce the rest of the band as you climb. The real venues are waiting — let’s go.',
      ],
    },
  ],

  // Level 2 — placement tip (still just the two starters).
  level2: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Two acts is plenty to start. Cover the seats where two lanes run close —',
        'one well-placed bandmate can guard both at once.',
      ],
    },
  ],

  // Level 3 — Keyboardist unlocks (teach the slow).
  level3: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'New act on the bill: a Keyboardist. Long reach, and it slows the crowd to a crawl.',
        'Great for buying your damage-dealers more time on the tanky ones.',
      ],
    },
  ],

  // Level 5 — Bass Player unlocks (teach knockback) + the rival shows up.
  level5: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Say hi to your Bass Player — that low end physically shoves the whole crowd back down the lane.',
        'Drop it near the stage as a last line of defense.',
      ],
    },
    {
      waveAfter: 1,
      character: 'max',
      lines: ['Oh, fresh meat at the mic.', "Cute. You'll never last the night, newbie."],
    },
  ],

  // Level 7 — Backup Singer unlocks (teach the support aura).
  level7: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        "A Backup Singer doesn't fight — park it among your acts and everyone nearby plays faster.",
        'Tuck it in the middle of your setup where it covers the most bandmates.',
      ],
    },
  ],

  // Level 9 — Hype Man unlocks (teach the gold/combo aura).
  level9: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'The Hype Man works the crowd: kills in his range pay extra gold and build your combo faster.',
        'Pure support — place him over your busiest lanes.',
      ],
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
