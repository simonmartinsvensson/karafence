import type { LevelId } from './levels';
import { CAMPAIGN } from './campaign';

/** Final wave of the last campaign level — when the closing beats play. */
const FINALE_WAVES = CAMPAIGN[CAMPAIGN.length - 1].waveProfile.waveCount;

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
 *  - MAX   — a rival act; antagonistic at first, becomes a true ally.
 *  - THE JUDGE — runs the scene, decides who gets booked. Hides a past.
 *  - RIVA  — the reigning circuit champion; a glamorous diva ALEX must dethrone.
 *  - DEX   — a fast-talking promoter who books (and profits from) every venue.
 *
 * Arc: ALEX rises from a garage open-mic to the World Finals. The story runs the
 * full 60 levels — a beat at almost every chapter start, richer multi-character
 * scenes at the milestone/set-piece levels (30 Boss Rush, 40 Survival, 50 Sudden
 * Death, 60 Finale), and a reveal that the Judge is the long-lost "Encore
 * Phantom" who froze on the world stage and never sang again.
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
  riva: { name: 'RIVA', color: 0xffd43b },
  dex: { name: 'DEX', color: 0x69db7c },
  phantom: { name: 'THE ENCORE PHANTOM', color: 0xcc5de8 },
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
 * Beats per level id. The campaign teaches one act at a time (each tower's
 * how-it-works beat sits at the level where it auto-unlocks, TOWER_STORY_UNLOCK
 * in meta.ts) AND tells one continuous story across all 60 levels. New enemy
 * archetypes get an in-story heads-up the level they appear (crowd surfers ~15,
 * roadies ~23, pyros ~31). Several beats may share a `waveAfter` — they play in
 * order. Pure data.
 */
export const STORY_BEATS: Record<LevelId, StoryBeat[]> = {
  // === ACT I — The Garage & the local circuit (learn the band) ===

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

  // Level 4 — the circuit takes notice.
  level4: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Three venues down and the regulars are starting to chant your name.',
        'Don’t let it go to your head — this circuit eats one-hit wonders for breakfast.',
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

  // Level 6 — ALEX digs in.
  level6: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: [
        'That guy Max thinks I’m a one-night fluke.',
        'I’ve been singing into a hairbrush since I was six. Let’s show the room who’s a fluke.',
      ],
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

  // Level 8 — DEX the promoter is introduced (the circuit is a business).
  level8: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: [
        'Name’s DEX. I book every stage from here to the World Finals.',
        'Play nice with me and doors open. Play nice with the crowd and... well, we’ll see how far you go.',
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
    {
      waveAfter: 0,
      character: 'dex',
      lines: ['The Judge made me. The Judge can unmake you.', 'Stay on his good side, kid — if he has one.'],
    },
  ],

  // === ACT II — Climbing the circuit (a rival, a champion, a dream) ===

  // Level 11 — RIVA name-dropped.
  level11: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'You’re climbing fast. People are whispering about RIVA — the reigning champion.',
        'Nobody’s taken a night off her in three years. Nobody.',
      ],
    },
  ],

  // Level 12 — synergies come online (the "backing band").
  level12: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'See how your acts feed off each other when they stand close? That’s a real band forming.',
        'Shoulder to shoulder, they hit harder. Keep your bandmates tight.',
      ],
    },
  ],

  // Level 13 — Max keeps circling.
  level13: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['Heard you’re chasing Riva’s crown.', 'Adorable. I’ll be right behind you when she chews you up.'],
    },
  ],

  // Level 14 — heads-up: crowd surfers (new enemy ~15).
  level14: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Heads up — this crowd’s got CROWD SURFERS.',
        'They ride right over your front act. Stack a second line behind, or they’ll sail clean through.',
      ],
    },
  ],

  // Level 15 — Max comes around.
  level15: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['...okay. You’re the real deal.', 'Knock ’em dead up there. I mean it.'],
    },
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['Coming from you? That almost sounded like a compliment.'],
    },
  ],

  // Level 16 — RIVA appears.
  level16: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: [
        'So you’re the little spark everyone’s buzzing about.',
        'Enjoy the climb, darling. The view from MY stage is much, much colder.',
      ],
    },
  ],

  // Level 17 — ALEX, stung but resolved.
  level17: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['Riva didn’t even look at me.', 'Fine. I’ll make the whole room look at ME.'],
    },
  ],

  // Level 18 — VY steadies the nerves.
  level18: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Doubt’s normal. Every headliner I knew wanted to quit the night before they broke through.',
        'You’re not quitting. Sing.',
      ],
    },
  ],

  // Level 19 — DEX raises the stakes.
  level19: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: [
        'Big rooms now, kid. Bigger cuts for me.',
        'Keep selling out and I’ll get you on the main circuit. Slip once and you’re an opening act forever.',
      ],
    },
  ],

  // Level 20 — halfway up the mountain.
  level20: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['Pitchy’s Place — real room, real lights, real stakes.', 'Halfway up the mountain. Don’t look down. Look at the mic.'],
    },
  ],

  // Level 21 — fancier venues (obstacle props flavor).
  level21: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Fancier venues, tighter stages — speaker stacks and pillars eating your floor.',
        'Work around them. A great act makes any room sound huge.',
      ],
    },
  ],

  // Level 22 — Max, ally now.
  level22: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['We’re both still standing. Didn’t expect that.', 'Tell you what — go take Riva down. I’ll cover the lanes you can’t.'],
    },
  ],

  // Level 23 — heads-up: roadies (new enemy ~23).
  level23: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Watch for ROADIES tonight — they shield the rest of the crowd.',
        'Take the roadie out first or you’ll be chipping armor all night.',
      ],
    },
  ],

  // Level 24 — Riva, grudging.
  level24: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: ['You keep showing up. Persistent.', 'Persistence isn’t talent. Prove me wrong — if you can.'],
    },
  ],

  // Level 25 — the duel with the champion.
  level25: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: ['One stage. You and me.', 'Whoever the crowd loves walks away the headliner. No excuses.'],
    },
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['I’ve been waiting for this since the garage.', 'Let’s sing.'],
    },
  ],

  // === ACT III — Going pro (the gatekeeper closes in) ===

  // Level 26 — the Judge speaks directly.
  level26: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['I’ve watched you climb. Loud. Hungry.', 'The circuit is mine to give. Don’t mistake noise for a booking.'],
    },
  ],

  // Level 27 — VY reads the moment.
  level27: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['The Judge spoke to you. He never does that.', 'You rattled something in him. Good. Keep singing.'],
    },
  ],

  // Level 28 — ALEX, alive.
  level28: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['Every room’s bigger. Every crowd meaner.', 'And I’ve never felt more alive. Bring the next one.'],
    },
  ],

  // Level 29 — DEX warns of the gauntlet.
  level29: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: ['Word is the Judge set up a gauntlet for you. Boss after boss, all night.', 'Nobody’s ever cleared it. Nobody. ...Break a leg, kid.'],
    },
  ],

  // Level 30 — BOSS RUSH set-piece.
  level30: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: [
        'Welcome to my little test. Every headache the circuit can throw — one after another.',
        'Most singers run before the second act. Let’s see how long you last.',
      ],
    },
    {
      waveAfter: 4,
      character: 'vy',
      lines: ['Halfway through the gauntlet and the stage is still yours.', 'Breathe. You were built for this.'],
    },
  ],

  // Level 31 — heads-up: pyros (new enemy ~31) + sabotage.
  level31: [
    {
      waveAfter: 0,
      character: 'max',
      lines: [
        'You cleared the Judge’s gauntlet. NOBODY clears the gauntlet.',
        'Also — careful. There are PYROS in the crowd now; they knock your acts offline. Somebody wants you to fail.',
      ],
    },
  ],

  // Level 32 — VY connects the dots.
  level32: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['Pyros, surprise bookings, sabotage... the Judge is throwing everything at you.', 'You scared the gatekeeper. That means you’re close.'],
    },
  ],

  // Level 33 — Riva concedes, joins the cause.
  level33: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: [
        'I lost the crowd to you. First time in three years.',
        'Don’t gloat. ...Go finish what you started. The crown was getting heavy anyway.',
      ],
    },
  ],

  // Level 34 — the band of misfits.
  level34: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['Riva in your corner. Max in your corner. You built a real band of misfits.', 'Now let’s get you to the Finals.'],
    },
  ],

  // Level 35 — the Judge, rattled.
  level35: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['You turned my own champion against me.', 'Enjoy the applause while it lasts. The biggest stages break the brightest stars.'],
    },
  ],

  // Level 36 — ALEX won't be written off.
  level36: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['He keeps talking like he knows how it ends.', 'He doesn’t. Nobody’s written this song but me.'],
    },
  ],

  // Level 37 — Max, full circle.
  level37: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['Remember the garage? You could barely hold a lane.', 'Look at you now. Save me a spot at the Finals.'],
    },
  ],

  // Level 38 — the legend of the Phantom (foreshadow).
  level38: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'There’s a story they tell about the Judge. Before the gavel, he had a voice.',
        'They called him the greatest who ever took a stage. Then one night... he just stopped.',
      ],
    },
  ],

  // Level 39 — DEX warns of survival night.
  level39: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: ['Tomorrow’s a survival set. No breaks, no rebuilds mid-song.', 'Whatever you bring on stage is what you’ve got. Choose well.'],
    },
  ],

  // Level 40 — SURVIVAL set-piece.
  level40: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'No rebuilding once the music starts. Set your band, then hold — no matter what.',
        'This is where pretenders fold. You are not a pretender.',
      ],
    },
    {
      waveAfter: 11,
      character: 'alex',
      lines: ['Can’t change a thing now. Just me, the band, and the crowd.', 'Hold the line. HOLD.'],
    },
  ],

  // === ACT IV — The big leagues (the Phantom revealed) ===

  // Level 41 — into the big leagues.
  level41: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['The big leagues. Velvet ropes, sold-out houses, your name in lights.', 'Same job as the garage, really. Hold the stage. Move the crowd.'],
    },
  ],

  // Level 42 — Max in the bracket.
  level42: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['I made the Finals bracket. Because of you, partly.', 'Don’t you dare lose before I get to share a stage with you.'],
    },
  ],

  // Level 43 — Riva, mentor now.
  level43: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: ['I’ve sung every room in this city. None rattle like the Finals.', 'Take it from a champ — let the fear make you louder.'],
    },
  ],

  // Level 44 — the Judge hints at his cost.
  level44: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['You want the world stage? Then you should know what it costs.', 'I stood there once. It took everything I had... and then it took the rest.'],
    },
  ],

  // Level 45 — the reveal: the Judge was the Encore Phantom.
  level45: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'The Judge WAS the Encore Phantom. The greatest voice the world ever heard.',
        'One night at the World Finals the crowd roared for an encore — and he froze. He never sang again.',
      ],
    },
  ],

  // Level 46 — ALEX understands.
  level46: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['The man who runs the circuit was once the best of us.', 'And fear took it all. ...I won’t let it take mine.'],
    },
  ],

  // Level 47 — DEX, quietly proud.
  level47: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: ['Whole world’s buying tickets to see you, kid. Even I’m a little proud.', 'Don’t tell anyone I said that.'],
    },
  ],

  // Level 48 — almost there.
  level48: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['Two more rooms and we’re at the Grand Stage.', 'Whatever’s waiting up there — we walk in together.'],
    },
  ],

  // Level 49 — VY's farewell-as-mentor + sudden-death warning.
  level49: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: [
        'Next one’s sudden death. One slip and the night’s over.',
        'I’ve got nothing left to teach you, headliner. Just sing it like you mean it. I’m proud of you.',
      ],
    },
  ],

  // Level 50 — SUDDEN DEATH set-piece.
  level50: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['One mistake. That’s all the room gives you tonight.', 'Steady hands. Steady heart. Show them why you climbed.'],
    },
    {
      waveAfter: 13,
      character: 'alex',
      lines: ['One thread holding the whole show together.', 'Good. I sing best with everything on the line.'],
    },
  ],

  // === ACT V — The Finale (face the encore) ===

  // Level 51 — the Phantom's mask cracks.
  level51: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['You’re still standing. Still singing.', 'Do you know how long it’s been since I felt this... close to the music?'],
    },
  ],

  // Level 52 — VY sees the turn.
  level52: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['The Phantom’s mask is cracking. He sees himself in you.', 'Finish the climb. Maybe you free him too.'],
    },
  ],

  // Level 53 — Max, all in.
  level53: [
    {
      waveAfter: 0,
      character: 'max',
      lines: ['The Grand Stage next. THE Grand Stage.', 'Everyone we ever played with is in that crowd. Let’s give them a night.'],
    },
  ],

  // Level 54 — Riva, front row.
  level54: [
    {
      waveAfter: 0,
      character: 'riva',
      lines: ['I’ll be in the front row, darling.', 'Cheering. ...Don’t make me regret it.'],
    },
  ],

  // Level 55 — ALEX, ready.
  level55: [
    {
      waveAfter: 0,
      character: 'alex',
      lines: ['From a garage with a borrowed mic to this.', 'Whatever’s on that stage — I’m ready to sing to it.'],
    },
  ],

  // Level 56 — DEX, the whole world watching.
  level56: [
    {
      waveAfter: 0,
      character: 'dex',
      lines: ['Sold out. Every seat, every continent watching.', 'This is the one they’ll talk about forever. Make it count.'],
    },
  ],

  // Level 57 — the world holds its breath.
  level57: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['Last room before the Finals. Feel that hum? That’s the whole world holding its breath.', 'Breathe it in. Then take it.'],
    },
  ],

  // Level 58 — the Judge, torn.
  level58: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['Tomorrow you stand where I fell.', 'Part of me wants you to fly. Part of me wants company in the dark. We’ll see which wins.'],
    },
  ],

  // Level 59 — The Grand Stage.
  level59: [
    {
      waveAfter: 0,
      character: 'vy',
      lines: ['The Grand Stage. Everyone who matters is in this room tonight.', 'Whatever happens — sing it like it’s yours.'],
    },
  ],

  // Level 60 — World Finals: the Phantom reveal, the showdown, the redemption.
  level60: [
    {
      waveAfter: 0,
      character: 'judge',
      lines: ['So you’re the one stirring up my circuit.', 'Let’s see if you can hold the biggest stage there is.'],
    },
    {
      waveAfter: FINALE_WAVES - 1,
      character: 'judge',
      lines: ['The crowd wants an encore. They always do.', 'They wanted one from me, too... and I have been hiding in these wings ever since.'],
    },
    {
      waveAfter: FINALE_WAVES - 1,
      character: 'phantom',
      lines: ['Sing, headliner — if you can face the very thing that stole my voice.'],
    },
    {
      waveAfter: FINALE_WAVES,
      character: 'alex',
      lines: ['We did it, Vy. The whole world — on its feet.', "I didn’t think a night could feel like this."],
    },
    {
      waveAfter: FINALE_WAVES,
      character: 'vy',
      lines: ['You did it. I just held the door.', 'Take your bow, headliner. You earned every note.'],
    },
    {
      waveAfter: FINALE_WAVES,
      character: 'judge',
      lines: [
        'You faced the encore... and you sang anyway.',
        'Thank you. The stage is yours now — it always should have belonged to someone brave enough to sing.',
      ],
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
