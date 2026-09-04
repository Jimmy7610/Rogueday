import type { ChallengeModifier, Quest } from '@/types';

/**
 * Tier-utmaningar.
 *
 * Det här är vad som gör VILT och FARLIGT till verkligt olika sätt att spela
 * i stället för bara högre siffror. Varje utmaning är ett extra, alltid
 * ofarligt krav ovanpå uppdraget.
 *
 * "Farligt" betyder risk och belöning i spelet - aldrig fysisk risk.
 *
 * Belöningsintervall enligt design:
 *   VILT     +20-35%
 *   FARLIGT  +50-75%
 */

export const WILD_CHALLENGES: ChallengeModifier[] = [
  {
    id: 'wild_no_social',
    name: 'FOKUSLÅS',
    requirement: 'Genomför uppdraget utan att öppna sociala medier.',
    tier: 'wild',
    rewardMultiplier: 1.25,
  },
  {
    id: 'wild_phone_away',
    name: 'TYST FICKA',
    requirement: 'Lägg telefonen utom räckhåll tills uppdraget är klart.',
    tier: 'wild',
    rewardMultiplier: 1.3,
  },
  {
    id: 'wild_one_more',
    name: 'LITE TILL',
    requirement: 'Gör lite mer än uppdraget kräver innan du slutar.',
    tier: 'wild',
    rewardMultiplier: 1.25,
  },
  {
    id: 'wild_music',
    name: 'ARBETSSÅNGEN',
    requirement: 'Genomför uppdraget till en låt eller spellista som ger dig energi.',
    tier: 'wild',
    rewardMultiplier: 1.2,
  },
  {
    id: 'wild_no_pause',
    name: 'I ETT SVEP',
    requirement: 'Gör klart uppdraget utan att pausa för något annat.',
    tier: 'wild',
    rewardMultiplier: 1.3,
  },
  {
    id: 'wild_tidy_after',
    name: 'SPÅRLÖST',
    requirement: 'Städa undan efter dig så att inget spår syns när du är klar.',
    tier: 'wild',
    rewardMultiplier: 1.25,
    categories: ['cleaning', 'home', 'food', 'organization', 'decluttering'],
  },
  {
    id: 'wild_timer_soft',
    name: 'MJUK TIMER',
    requirement: 'Starta fokustimern och håll igång tills den ringer.',
    tier: 'wild',
    rewardMultiplier: 1.3,
    timerMinutes: 10,
    minDuration: 15,
  },
  {
    id: 'wild_document',
    name: 'BEVISET',
    requirement: 'Ta ett före- och efterfoto åt dig själv.',
    tier: 'wild',
    rewardMultiplier: 1.2,
    categories: ['cleaning', 'home', 'organization', 'decluttering', 'outside'],
  },
];

export const DANGEROUS_CHALLENGES: ChallengeModifier[] = [
  {
    id: 'danger_speed_12',
    name: 'TOLV MINUTER',
    requirement: 'Klara uppdraget innan en 12-minuters fokustimer tar slut.',
    tier: 'dangerous',
    rewardMultiplier: 1.6,
    timerMinutes: 12,
    minDuration: 15,
  },
  {
    id: 'danger_speed_20',
    name: 'TJUGO MINUTER',
    requirement: 'Klara uppdraget innan en 20-minuters fokustimer tar slut.',
    tier: 'dangerous',
    rewardMultiplier: 1.65,
    timerMinutes: 20,
    minDuration: 30,
  },
  {
    id: 'danger_speed_5',
    name: 'FEM MINUTER',
    requirement: 'Klara uppdraget innan en 5-minuters fokustimer tar slut.',
    tier: 'dangerous',
    rewardMultiplier: 1.5,
    timerMinutes: 5,
  },
  {
    id: 'danger_double',
    name: 'DUBBELT UPP',
    requirement: 'Gör dubbelt så mycket som uppdraget kräver.',
    tier: 'dangerous',
    rewardMultiplier: 1.75,
  },
  {
    id: 'danger_combo',
    name: 'COMBO',
    requirement: 'Lägg till en till liten syssla och gör båda i rad.',
    tier: 'dangerous',
    rewardMultiplier: 1.6,
  },
  {
    id: 'danger_no_sitting',
    name: 'DEN FÖRBJUDNA STOLEN',
    requirement: 'Genomför uppdraget utan att sätta dig en enda gång.',
    tier: 'dangerous',
    rewardMultiplier: 1.55,
  },
  {
    id: 'danger_full_focus',
    name: 'TOTAL FOKUS',
    requirement: 'Inga skärmar, inga avbrott, ingen musik. Bara uppdraget.',
    tier: 'dangerous',
    rewardMultiplier: 1.7,
  },
  {
    id: 'danger_mystery',
    name: 'FÖRSEGLAT UPPDRAG',
    requirement: 'Målet avslöjas först när du accepterat. Ingen ångrar sig.',
    tier: 'dangerous',
    rewardMultiplier: 1.75,
    hidesObjective: true,
  },
  {
    id: 'danger_finish_it',
    name: 'HELA VÄGEN',
    requirement: 'Sluta inte förrän hela ytan eller uppgiften är helt färdig.',
    tier: 'dangerous',
    rewardMultiplier: 1.65,
    categories: ['cleaning', 'home', 'organization', 'decluttering', 'adulting', 'digital'],
  },
];

export const ALL_CHALLENGES = [...WILD_CHALLENGES, ...DANGEROUS_CHALLENGES];

export const CHALLENGE_BY_ID: Record<string, ChallengeModifier> = Object.fromEntries(
  ALL_CHALLENGES.map((challenge) => [challenge.id, challenge]),
);

/** Challenges that can legally attach to a given quest. */
export function eligibleChallenges(
  quest: Quest,
  tier: 'wild' | 'dangerous',
): ChallengeModifier[] {
  const pool = tier === 'wild' ? WILD_CHALLENGES : DANGEROUS_CHALLENGES;

  return pool.filter((challenge) => {
    if (challenge.categories && !challenge.categories.includes(quest.category)) return false;
    if (challenge.minDuration && quest.duration < challenge.minDuration) return false;
    // A timed challenge must leave a sensible amount of time for the quest.
    if (challenge.timerMinutes && challenge.timerMinutes > quest.duration) return false;
    return true;
  });
}
