import { TileType, type MapDefinition, type SpecialKind, type StarGoals } from '../types/map';
import type { EnemyTypeKey } from './enemies';
import { parseMap } from './parseMap';
import { ENDLESS_PROFILE, type WaveProfile } from './waves';
import { CHAPTER_THEMES, themeForChapterIndex } from './themes';

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
  /** Pre-rendered ASCII layout (back-half venues stamp in obstacle props). */
  layoutRows: string[];
  /** Set-piece rule for milestone levels (undefined = a normal level). */
  special?: SpecialKind;
  /** `maze` = open-floor flow-field routing (Maze Night); default lane walking. */
  pathMode?: 'lane' | 'maze';
}

/** Milestone set-piece levels: index (0-based) -> the special rule it runs. */
const SPECIAL_BY_INDEX: Record<number, SpecialKind> = {
  29: 'bossRush', // Level 30
  39: 'survival', // Level 40
  49: 'suddenDeath', // Level 50
  59: 'finale', // Level 60
};

/** Player-facing name + one-line blurb for each set-piece (shown at run start). */
export const SPECIAL_INFO: Record<SpecialKind, { name: string; blurb: string }> = {
  bossRush: { name: 'BOSS RUSH', blurb: 'A headline act every single wave.' },
  survival: { name: 'SURVIVAL', blurb: 'No building once a wave is live — plan ahead!' },
  suddenDeath: { name: 'SUDDEN DEATH', blurb: 'One bad night ends the show — barely any HP.' },
  finale: { name: 'GRAND FINALE', blurb: 'The ultimate headliner awaits.' },
};

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

/**
 * Layout for campaign level `i`. The first third is the open rectangle above;
 * from level 21 (i>=20) each venue stamps in **obstacle props** (speaker stacks
 * / pillars) on buildable seats so the board footprint actually changes — the
 * same open grid was the main reason the back half felt repetitive. Obstacles
 * only sit on seating (never the path, so enemy routes are unchanged) and the
 * board edges stay clear so every lane is still coverable. Four patterns cycle
 * so consecutive venues look distinct.
 */
function makeLayout(i: number, lanes: number, tutorial: boolean): string[] {
  const stage = 'S'.repeat(STAGE_W);
  const aisle = stage + '#'.repeat(COLS - STAGE_W);
  const buildRow = (): string[] => (stage + '.'.repeat(COLS - STAGE_W)).split('');
  const rows: string[][] = [buildRow()];
  for (let l = 0; l < lanes; l++) rows.push(aisle.split(''), buildRow());

  if (tutorial || i < 20) return rows.map((cells) => cells.join(''));

  const pattern = (i - 20) % 4;
  // `j` = build-row ordinal (0..lanes), `c` = column. Keep c at the stage edge
  // (2) and the far edge (15) clear so a lane can never be walled off.
  const isProp = (j: number, c: number): boolean => {
    if (c < STAGE_W + 1 || c > COLS - 2) return false;
    switch (pattern) {
      case 0:
        return (c + j * 2) % 5 === 2; // scattered pillars
      case 1:
        return c === 6 || c === 11; // twin chokepoint columns
      case 2:
        return c >= 5 && c <= 12 && (c + j) % 2 === 0; // central checker
      default:
        return c >= 7 && c <= 10 && j > 0 && j < lanes; // center stack
    }
  };
  let j = 0;
  for (let r = 0; r < rows.length; r += 2, j++) {
    for (let c = STAGE_W; c < COLS; c++) {
      if (rows[r][c] === '.' && isProp(j, c)) rows[r][c] = 'X';
    }
  }
  return rows.map((cells) => cells.join(''));
}

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
  const pool = order.slice(0, n);
  // Back-half archetypes drip in past level 15 so something genuinely new keeps
  // appearing instead of just bigger numbers (see "back-half variety" overhaul).
  if (i >= 14) pool.push('crowdSurfer');
  if (i >= 22) pool.push('roadie');
  if (i >= 30) pool.push('pyro');
  return pool;
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
  const special = SPECIAL_BY_INDEX[i];
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
  // Boss Rush: a headliner every wave, light trash between them, short run.
  if (special === 'bossRush') {
    profile.bossEvery = 1;
    profile.waveCount = 8;
    profile.baseCount = 3;
    profile.countPerWave = 0.3;
  }
  // Grand Finale: the last wave is a solo showdown with the Encore Phantom.
  if (special === 'finale') profile.finalBoss = 'encorePhantom';
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
    colors: themeForChapterIndex(i).tiles,
    tutorial,
    layoutRows: makeLayout(i, lanes, tutorial),
    special,
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
  // Endless is "the club that never closes" — the neon lounge look.
  colors: CHAPTER_THEMES[1].tiles,
  layoutRows: makeAscii(5),
};

/**
 * Standalone **Maze Night** map: an open floor (no fixed lanes) where towers
 * block tiles and the crowd flow-field pathfinds around them. The stage sits in
 * the left columns; the right edge is a walkable-but-unbuildable spawn strip so
 * spawns can never be walled in. Everything between is buildable seating — build
 * it into a maze to lengthen the crowd's walk. See systems/maze.ts.
 */
const MAZE_ROWS = 13;
function makeMazeAscii(): string[] {
  const stage = 'S'.repeat(STAGE_W);
  const interior = '.'.repeat(COLS - STAGE_W - 1); // buildable + walkable floor
  const row = stage + interior + '#'; // trailing '#': walkable spawn strip, not buildable
  return Array.from({ length: MAZE_ROWS }, () => row);
}

export const MAZE_LEVEL: CampaignLevel = {
  id: 'maze',
  name: 'Maze Night',
  lanes: MAZE_ROWS,
  enemySpeedMultiplier: 1,
  startingGold: 260,
  waveProfile: ENDLESS_PROFILE,
  starGoals: { maxLivesLost: 99, maxGoldSpent: 99999, minCombo: 0 },
  // The grand-theater teal — visually distinct from the neon-lounge endless map.
  colors: CHAPTER_THEMES[2].tiles,
  layoutRows: makeMazeAscii(),
  pathMode: 'maze',
};

/** Turn a campaign entry into a playable MapDefinition. */
export function buildMap(entry: CampaignLevel): MapDefinition {
  return parseMap({
    id: entry.id,
    name: entry.name,
    ascii: entry.layoutRows,
    enemySpeedMultiplier: entry.enemySpeedMultiplier,
    starGoals: entry.starGoals,
    colors: entry.colors,
    startingGold: entry.startingGold,
    waveProfile: entry.waveProfile,
    special: entry.special,
    pathMode: entry.pathMode,
  });
}
