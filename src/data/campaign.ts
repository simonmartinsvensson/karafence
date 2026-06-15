import { TileType, type MapDefinition, type StarGoals } from '../types/map';
import type { EnemyTypeKey } from './enemies';
import { parseMap } from './parseMap';
import { ENDLESS_PROFILE, type WaveProfile } from './waves';

/**
 * The story campaign: 20 levels generated from a difficulty curve so the ramp
 * is smooth and tunable in one place. Level 1 is a gentle tutorial; difficulty
 * (lanes, enemy speed, wave count + scaling, enemy variety, boss frequency)
 * climbs steadily to a hard finale. Each entry is turned into a MapDefinition
 * by `buildMap` (ASCII layout template + the per-level `WaveProfile`).
 *
 * Endless mode plays its own standard map (`ENDLESS_LEVEL`) with `ENDLESS_PROFILE`.
 */

export interface CampaignLevel {
  id: string;
  name: string;
  /** Number of enemy lanes (more lanes = harder to cover). */
  lanes: number;
  enemySpeedMultiplier: number;
  startingGold: number;
  waveProfile: WaveProfile;
  starGoals: StarGoals;
  colors?: Record<TileType, number>;
  tutorial?: boolean;
}

const COLS = 16;
const STAGE_W = 2;

/** Build an ASCII layout: a build row, then `lanes` × (aisle row, build row). */
function makeAscii(lanes: number): string[] {
  const stage = 'S'.repeat(STAGE_W);
  const aisle = stage + '#'.repeat(COLS - STAGE_W);
  const build = stage + '.'.repeat(COLS - STAGE_W);
  const rows = [build];
  for (let i = 0; i < lanes; i++) rows.push(aisle, build);
  return rows;
}

/** A cooler palette for the back half of the campaign (bigger, fancier venues). */
const COOL_PALETTE: Record<TileType, number> = {
  [TileType.Stage]: 0x24243a,
  [TileType.Aisle]: 0x394a63,
  [TileType.Build]: 0x33405a,
};

/** Enemy types unlocked by level index (variety grows as you progress). */
function poolForLevel(i: number): EnemyTypeKey[] {
  const order: EnemyTypeKey[] = [
    'heckler',
    'phoneScroller',
    'drunkUncle',
    'stageRusher',
    'critic',
    'superfan',
    'vip',
  ];
  let n = 1;
  if (i >= 1) n = 2;
  if (i >= 2) n = 3;
  if (i >= 3) n = 4;
  if (i >= 5) n = 5;
  if (i >= 8) n = 6;
  if (i >= 11) n = 7;
  return order.slice(0, n);
}

const NAMES = [
  'The Garage', // 1 — tutorial (named in the tutorial dialogue)
  'Open Mic Drop',
  'Tone-Deaf Tavern',
  'The Treble Maker',
  'Bar None',
  'The Lyric Lounge',
  'Reverb Room',
  'The Bassment',
  'Sharp Note Saloon',
  'Mic Drop Inn', // 10
  'The Crescendo',
  'All That Jazz Cellar',
  'The Warm-Up Act',
  'The Showboat',
  'Off the Record',
  'Sound Check Arena',
  'Curtain Call Hall',
  'Highnote Heights',
  'The Encore Estate',
  "Pitchy's Place", // 20
  'The Key Change',
  'Tempo Tap House',
  'The Falsetto Factory',
  'Harmony Hall',
  'The Riff Raff',
  'Decibel Den',
  'The Chord Cave',
  'Vinyl Resting Place',
  'The Acapella Alley',
  'Stage Left Lounge', // 30
  'The Headliner Hideaway',
  'Backbeat Ballroom',
  'The Glee Club',
  'Octave Outpost',
  'The Power Ballad Palace',
  'Whistle Register',
  'The Diva Dome',
  'Sing Sing Sing Hall',
  'The Money Note',
  'Grand Finale Grounds', // 40
];

// Procedural punny names fill the back stretch; the last two are fixed for the
// finale dialogue ("The Grand Stage" at level 59, "The Final Countdown" at 60).
const NAME_ADJ = ['Encore', 'Velvet', 'Neon', 'Midnight', 'Golden', 'Electric', 'Smoky', 'Platinum', 'Wild', 'Roaring'];
const NAME_NOUN = ['Amphitheatre', 'Mainstage', 'Coliseum', 'Ballroom', 'Dome', 'Auditorium', 'Rooftop', 'Pavilion', 'Megadome', 'Opera House'];

function nameFor(i: number): string {
  if (i === 58) return 'The Grand Stage'; // named in the level-59 dialogue
  if (i === 59) return 'The Final Countdown'; // finale (level 60)
  if (i < NAMES.length) return NAMES[i];
  const a = NAME_ADJ[(i * 7) % NAME_ADJ.length];
  const n = NAME_NOUN[(i * 13 + 3) % NAME_NOUN.length];
  return `The ${a} ${n}`;
}

/**
 * Difficulty curve for level index `i` (0-based) across a 60-level campaign.
 * Slopes are gentler than a 20-level curve would be (they span 3× the levels);
 * the brutal back third assumes meaningful meta investment (Fame branch trees +
 * research). Tutorial (i===0) is a gentle on-ramp.
 */
function makeLevel(i: number): CampaignLevel {
  const tutorial = i === 0;
  const lanes = i < 2 ? 3 : i < 8 ? 4 : i < 20 ? 5 : i < 40 ? 6 : 7;
  const profile: WaveProfile = {
    waveCount: tutorial ? 3 : Math.min(28, 5 + Math.floor(i * 0.45)),
    baseCount: tutorial ? 2 : 4 + Math.floor(i * 0.35),
    countPerWave: tutorial ? 0 : 0.4 + i * 0.03,
    hpPerWave: tutorial ? 0 : 0.05 + i * 0.004,
    speedPerWave: tutorial ? 0 : 0.015 + i * 0.0009,
    // Speed is the scariest late knob (probe: ~4.8× at L60 with lives floored at
    // 5). Pull the per-wave ceiling in a touch so the top end stays hard-but-fair.
    speedCap: Math.min(2.3, 1.5 + i * 0.02),
    bossEvery: i < 3 ? 0 : i < 12 ? 5 : i < 30 ? 4 : 3,
    bossHpPerCycle: 0.12,
    enemyPool: poolForLevel(i),
    spawnDelay: tutorial ? 1500 : Math.max(300, 900 - i * 11),
  };
  return {
    id: `level${i + 1}`,
    name: nameFor(i),
    lanes,
    enemySpeedMultiplier: tutorial ? 0.62 : Math.min(2.0, 0.8 + i * 0.018),
    // Floor raised 180→210: late levels widen to 7 lanes while starting gold
    // falls, so give a little more opening budget to cover the board.
    startingGold: tutorial ? 420 : Math.max(210, 300 - i * 2),
    waveProfile: profile,
    starGoals: {
      // "Lives" is singer-HP damage (0-30; most foes deal 1, bosses 4-5).
      // Floor raised 4→6 so the fast, wide late levels leave a little margin.
      maxLivesLost: Math.max(6, 12 - Math.floor(i / 8)),
      // "Thrifty" star scales the budget with level size.
      maxGoldSpent: 600 + i * 60,
      minCombo: 3 + Math.floor(i / 3),
    },
    colors: i >= 20 ? COOL_PALETTE : undefined,
    tutorial,
  };
}

export const CAMPAIGN: CampaignLevel[] = Array.from({ length: 60 }, (_, i) => makeLevel(i));

/** Standalone endless map (a roomy 5-lane venue) + the endless wave profile. */
export const ENDLESS_LEVEL: CampaignLevel = {
  id: 'endless',
  name: 'Endless',
  lanes: 5,
  enemySpeedMultiplier: 1,
  startingGold: 240,
  waveProfile: ENDLESS_PROFILE,
  starGoals: { maxLivesLost: 99, maxGoldSpent: 99999, minCombo: 0 },
};

/** Turn a campaign entry into a playable MapDefinition. */
export function buildMap(entry: CampaignLevel): MapDefinition {
  return parseMap({
    id: entry.id,
    name: entry.name,
    ascii: makeAscii(entry.lanes),
    enemySpeedMultiplier: entry.enemySpeedMultiplier,
    starGoals: entry.starGoals,
    colors: entry.colors,
    startingGold: entry.startingGold,
    waveProfile: entry.waveProfile,
  });
}
