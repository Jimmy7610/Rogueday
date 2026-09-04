import type { Quest, QuestCategory } from '@/types';
import { buildQuests, type QuestSeed } from './questFactory';
import { HOME_QUEST_SEEDS } from './quests.home';
import { WORLD_QUEST_SEEDS } from './quests.world';
import { MIND_QUEST_SEEDS } from './quests.mind';
import { DAILY_QUEST_SEEDS } from './quests.daily';
import { CHAOS_QUEST_SEEDS } from './quests.chaos';
import { CHAOS2_QUEST_SEEDS } from './quests.chaos2';
import { OUTDOOR_QUEST_SEEDS } from './quests.outdoor';
import { HOME2_QUEST_SEEDS } from './quests.home2';
import { ADMIN_QUEST_SEEDS } from './quests.admin';
import { BODY_QUEST_SEEDS } from './quests.body';
import { MIND2_QUEST_SEEDS } from './quests.mind2';
import { SOCIAL_QUEST_SEEDS } from './quests.social';
import { RHYTHM_QUEST_SEEDS } from './quests.rhythm';
import { LEGENDARY_QUEST_SEEDS } from './quests.legendary';
import { CHAOS3_QUEST_SEEDS } from './quests.chaos3';
import { MICRO_QUEST_SEEDS } from './quests.micro';
import { FILL_QUEST_SEEDS } from './quests.fill';
import { SEASONS_QUEST_SEEDS } from './quests.seasons';
import { CRAFT_QUEST_SEEDS } from './quests.craft';
import { CIVIC_QUEST_SEEDS } from './quests.civic';
import { INNER_QUEST_SEEDS } from './quests.inner';
import { FOCUS_QUEST_SEEDS } from './quests.focus';
import { CHAIN_QUEST_SEEDS } from './chains';

const ALL_SEEDS: QuestSeed[] = [
  ...HOME_QUEST_SEEDS,
  ...WORLD_QUEST_SEEDS,
  ...MIND_QUEST_SEEDS,
  ...DAILY_QUEST_SEEDS,
  ...CHAOS_QUEST_SEEDS,
  ...CHAOS2_QUEST_SEEDS,
  ...OUTDOOR_QUEST_SEEDS,
  ...HOME2_QUEST_SEEDS,
  ...ADMIN_QUEST_SEEDS,
  ...BODY_QUEST_SEEDS,
  ...MIND2_QUEST_SEEDS,
  ...SOCIAL_QUEST_SEEDS,
  ...RHYTHM_QUEST_SEEDS,
  ...LEGENDARY_QUEST_SEEDS,
  ...CHAOS3_QUEST_SEEDS,
  ...MICRO_QUEST_SEEDS,
  ...FILL_QUEST_SEEDS,
  ...SEASONS_QUEST_SEEDS,
  ...CRAFT_QUEST_SEEDS,
  ...CIVIC_QUEST_SEEDS,
  ...INNER_QUEST_SEEDS,
  ...FOCUS_QUEST_SEEDS,
  ...CHAIN_QUEST_SEEDS,
];

/** The full built-in quest library. */
export const QUESTS: Quest[] = buildQuests(ALL_SEEDS);

export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(
  QUESTS.map((quest) => [quest.id, quest]),
);

export function getQuestById(id: string): Quest | undefined {
  return QUEST_BY_ID[id];
}

/** Quests that never appear in the normal random pool (chain steps are gated). */
export const STANDALONE_QUESTS: Quest[] = QUESTS.filter((quest) => !quest.chainId);

export const CHAIN_QUESTS: Quest[] = QUESTS.filter((quest) => Boolean(quest.chainId));

export const QUEST_COUNT = QUESTS.length;

/** Swedish display names for every category. */
export const CATEGORY_LABELS: Record<QuestCategory, string> = {
  adulting: 'VUXENLIV',
  home: 'HEM',
  cleaning: 'STÄDNING',
  organization: 'ORDNING',
  outside: 'UTOMHUS',
  walking: 'PROMENAD',
  social: 'SOCIALT',
  creative: 'KREATIVT',
  health: 'HÄLSA',
  movement: 'RÖRELSE',
  mindfulness: 'NÄRVARO',
  digital: 'DIGITALT',
  learning: 'LÄRANDE',
  decluttering: 'RENSNING',
  food: 'MAT',
  selfcare: 'EGENVÅRD',
  miniadventure: 'MINIÄVENTYR',
  chaos: 'KAOS',
  secret: 'HEMLIGT',
  weekend: 'HELG',
  morning: 'MORGON',
  evening: 'KVÄLL',
};

export const CATEGORY_ICONS: Record<QuestCategory, string> = {
  adulting: '📋',
  home: '🏠',
  cleaning: '🧽',
  organization: '📦',
  outside: '🌤️',
  walking: '🚶',
  social: '💬',
  creative: '🎨',
  health: '💚',
  movement: '🤸',
  mindfulness: '🧘',
  digital: '💻',
  learning: '📚',
  decluttering: '🗑️',
  food: '🍲',
  selfcare: '🛁',
  miniadventure: '🧭',
  chaos: '🌀',
  secret: '🗝️',
  weekend: '🎈',
  morning: '🌅',
  evening: '🌙',
};

/** Fails loudly in development if the library has duplicate ids. */
export function findDuplicateQuestIds(): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const quest of QUESTS) {
    if (seen.has(quest.id)) duplicates.push(quest.id);
    seen.add(quest.id);
  }
  return duplicates;
}
