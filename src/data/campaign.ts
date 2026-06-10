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
  'The Grand Stage', // named in the level-19 dialogue
  'The Final Countdown', // 20
];

/** Difficulty curve for level index `i` (0-based). */
function makeLevel(i: number): CampaignLevel {
  const tutorial = i === 0;
  const lanes = i < 2 ? 3 : i < 6 ? 4 : i < 12 ? 5 : 6;
  const profile: WaveProfile = {
    waveCount: tutorial ? 3 : Math.min(20, 5 + Math.floor(i * 0.8)),
    baseCount: tutorial ? 4 : 4 + Math.floor(i * 0.5),
    countPerWave: 0.4 + i * 0.06,
    hpPerWave: 0.05 + i * 0.006,
    speedPerWave: 0.015 + i * 0.0015,
    speedCap: 1.5 + i * 0.04,
    bossEvery: i < 3 ? 0 : i < 10 ? 5 : 4,
    bossHpPerCycle: 0.12,
    enemyPool: poolForLevel(i),
    spawnDelay: tutorial ? 1100 : Math.max(380, 900 - i * 28),
  };
  return {
    id: `level${i + 1}`,
    name: NAMES[i],
    lanes,
    enemySpeedMultiplier: 0.8 + i * 0.032,
    startingGold: tutorial ? 320 : Math.max(210, 300 - i * 5),
    waveProfile: profile,
    starGoals: {
      // "Lives" is singer-HP damage (0-30; most foes deal 1, bosses 4-5). Keep
      // the clean-run star a real but achievable challenge — never so tight that
      // a single boss leak auto-fails it on a long level.
      maxLivesLost: Math.max(5, 12 - Math.floor(i / 3)),
      // "Thrifty" star: scale the budget with the level's size so it rewards an
      // efficient build (not maxing everything) instead of being free early and
      // impossible late.
      maxGoldSpent: 600 + i * 90,
      minCombo: 3 + Math.floor(i / 2),
    },
    colors: i >= 13 ? COOL_PALETTE : undefined,
    tutorial,
  };
}

export const CAMPAIGN: CampaignLevel[] = Array.from({ length: 20 }, (_, i) => makeLevel(i));

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
