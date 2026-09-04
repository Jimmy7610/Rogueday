import type { Quest, RogueDaySave } from '@/types';
import { toLocalDateKey } from '@/utils/date';

/**
 * Secret quests.
 *
 * A quest in the `secret` category is not part of the ordinary pool. It only
 * becomes eligible when a condition about the player's own situation holds -
 * the hour on their clock, the day of the week, how long their streak is, how
 * far they have come, or what they have already done today.
 *
 * Everything here reads local state only: the device clock and the save file.
 * There is no network call, no location lookup, no weather service and no
 * server of any kind. The conditions are deliberately reachable - a secret
 * should feel like a discovery, not like a lottery nobody wins.
 */

export interface SecretContext {
  now: Date;
  save: RogueDaySave;
}

type Condition = (ctx: SecretContext) => boolean;

const hour = (ctx: SecretContext): number => ctx.now.getHours();

/** Sunday is 0 in JS; treat Saturday and Sunday as the weekend. */
const isWeekend = (ctx: SecretContext): boolean => [0, 6].includes(ctx.now.getDay());

const completedToday = (ctx: SecretContext): number =>
  ctx.save.statistics.completionDates[toLocalDateKey(ctx.now)] ?? 0;

/* --- reusable conditions --- */

const lateEvening: Condition = (ctx) => hour(ctx) >= 21 || hour(ctx) < 2;
const earlyMorning: Condition = (ctx) => hour(ctx) >= 4 && hour(ctx) < 8;
const daytime: Condition = (ctx) => hour(ctx) >= 9 && hour(ctx) < 18;
const dusk: Condition = (ctx) => hour(ctx) >= 17 && hour(ctx) < 22;

const streakAtLeast =
  (days: number): Condition =>
  (ctx) =>
    ctx.save.streak.current >= days;

const levelAtLeast =
  (level: number): Condition =>
  (ctx) =>
    ctx.save.progression.level >= level;

const doneTodayAtLeast =
  (count: number): Condition =>
  (ctx) =>
    completedToday(ctx) >= count;

const questsCompletedAtLeast =
  (count: number): Condition =>
  (ctx) =>
    ctx.save.statistics.questsCompleted >= count;

const any =
  (...conditions: Condition[]): Condition =>
  (ctx) =>
    conditions.some((condition) => condition(ctx));

const all =
  (...conditions: Condition[]): Condition =>
  (ctx) =>
    conditions.every((condition) => condition(ctx));

/**
 * One condition per secret quest.
 *
 * Anything not listed here falls back to DEFAULT_CONDITION, so a new secret
 * quest is never accidentally unreachable.
 */
const CONDITIONS: Record<string, Condition> = {
  /* --- the hour on the clock --- */
  secret_midnight_pact: lateEvening,
  sc_night_silence: lateEvening,
  sc_dawn_watch: earlyMorning,
  sc_before_anyone_wakes: earlyMorning,
  sc_last_light: dusk,
  sc_rainy_day_ritual: daytime,

  /* --- what today already looks like --- */
  sc_one_more_after_done: doneTodayAtLeast(2),
  in_secret_finish_before_start: doneTodayAtLeast(1),
  sc_the_hundredth_time: all(questsCompletedAtLeast(50), doneTodayAtLeast(1)),

  /* --- how long you have kept it up --- */
  sc_thank_the_past: streakAtLeast(3),
  secret_forgotten_thing: streakAtLeast(3),
  sc_unfinished_thing: streakAtLeast(4),
  secret_unfinished_thing: all(streakAtLeast(5), levelAtLeast(8)),
  in_secret_no_complaint_day: streakAtLeast(5),
  in_secret_wait_a_beat: streakAtLeast(4),

  /* --- how far you have come --- */
  secret_hidden_corner: levelAtLeast(5),
  secret_old_photo: levelAtLeast(4),
  sc_old_letter: levelAtLeast(4),
  in_secret_hardest_call: levelAtLeast(10),
  sc_return_lost: levelAtLeast(6),
  in_secret_finish_the_bottle: levelAtLeast(3),

  /* --- the day of the week --- */
  sc_five_hundred_steps: any(isWeekend, doneTodayAtLeast(1)),
  sc_finish_what_no_one_asked: isWeekend,
  secret_kindness_anonymous: any(isWeekend, streakAtLeast(2)),
  sc_leave_it_better: any(isWeekend, daytime),
  in_secret_stranger_kindness: daytime,
};

/** A quest with no explicit rule still needs a little history behind it. */
const DEFAULT_CONDITION: Condition = questsCompletedAtLeast(10);

/**
 * Nothing in the secret category is reachable on someone's very first roll.
 * A secret should be something the game reveals over time, so every rule sits
 * on top of a small amount of play.
 */
const BASE_CONDITION: Condition = questsCompletedAtLeast(3);

/**
 * Is this secret quest currently reachable?
 *
 * Non-secret quests are always reachable; this only gates the `secret`
 * category.
 */
export function isSecretUnlocked(quest: Quest, ctx: SecretContext): boolean {
  if (quest.category !== 'secret') return true;
  if (!BASE_CONDITION(ctx)) return false;
  return (CONDITIONS[quest.id] ?? DEFAULT_CONDITION)(ctx);
}

/** Every secret quest whose condition holds right now. Used by the tests. */
export function unlockedSecrets(quests: Quest[], ctx: SecretContext): Quest[] {
  return quests.filter((quest) => quest.category === 'secret' && isSecretUnlocked(quest, ctx));
}

/** Secret quests that have an explicit rule rather than the fallback. */
export function hasExplicitCondition(questId: string): boolean {
  return questId in CONDITIONS;
}
