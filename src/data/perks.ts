import type { PerkDefinition, PerkEffects, PerkTheme } from '@/types';

/**
 * Milestone-förmågor.
 *
 * Vid varje milstolpenivå får spelaren välja EN av tre passiva förmågor - en
 * per tema. Bonusarna är medvetet blygsamma: de ska ge en känsla av att bygga
 * en karaktär, inte förvandla spelet till en multiplikatorkalkyl.
 *
 * Inget kostar pengar, inget kräver server.
 */

/** Levels at which a perk choice unlocks. */
export const PERK_MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export const PERK_THEME_LABELS: Record<PerkTheme, string> = {
  momentum: 'MOMENTUM',
  fortune: 'RIKEDOM',
  slayer: 'SLAKTARE',
};

export const PERK_THEME_ICONS: Record<PerkTheme, string> = {
  momentum: '⚡',
  fortune: '🪙',
  slayer: '⚔️',
};

export const PERK_THEME_BLURBS: Record<PerkTheme, string> = {
  momentum: 'Håller igång svit och dagliga rutiner.',
  fortune: 'Mer guld, bättre fynd, billigare marknad.',
  slayer: 'Hårdare slag mot veckans boss.',
};

export const PERKS: PerkDefinition[] = [
  /* ---- level 5 ---- */
  {
    id: 'momentum_5',
    name: 'MORGONSTUND',
    description: 'Dagens första avklarade uppdrag ger +10% XP.',
    theme: 'momentum',
    level: 5,
    icon: '🌅',
  },
  {
    id: 'fortune_5',
    name: 'TUR I FICKAN',
    description: '+8% guld på alla uppdrag.',
    theme: 'fortune',
    level: 5,
    icon: '💰',
  },
  {
    id: 'slayer_5',
    name: 'VASST STÅL',
    description: '+8% bossskada.',
    theme: 'slayer',
    level: 5,
    icon: '🗡️',
  },

  /* ---- level 10 ---- */
  {
    id: 'momentum_10',
    name: 'DAGLIG DRIVKRAFT',
    description: 'Dagens uppdrag ger +10% XP.',
    theme: 'momentum',
    level: 10,
    icon: '⭐',
  },
  {
    id: 'fortune_10',
    name: 'SKARP BLICK',
    description: '+5 procentenheter chans att hitta loot.',
    theme: 'fortune',
    level: 10,
    icon: '🔍',
  },
  {
    id: 'slayer_10',
    name: 'SVAGHETSJÄGARE',
    description: 'Svaghetsbonusen mot bossar ökar med 10 procentenheter.',
    theme: 'slayer',
    level: 10,
    icon: '🎯',
  },

  /* ---- level 15 ---- */
  {
    id: 'momentum_15',
    name: 'ANDRA CHANSEN',
    description: 'En extra gratis omkastning varje dag.',
    theme: 'momentum',
    level: 15,
    icon: '🎲',
  },
  {
    id: 'fortune_15',
    name: 'PRUTARE',
    description: '10% rabatt på marknaden.',
    theme: 'fortune',
    level: 15,
    icon: '🏷️',
  },
  {
    id: 'slayer_15',
    name: 'TUNGT SLAG',
    description: '+10% bossskada.',
    theme: 'slayer',
    level: 15,
    icon: '🔨',
  },

  /* ---- level 20 ---- */
  {
    id: 'momentum_20',
    name: 'UTHÅLLIGHET',
    description: 'Dagens första uppdrag ger ytterligare +10% XP.',
    theme: 'momentum',
    level: 20,
    icon: '🔥',
  },
  {
    id: 'fortune_20',
    name: 'GULDÅDRA',
    description: '+10% guld på alla uppdrag.',
    theme: 'fortune',
    level: 20,
    icon: '⛏️',
  },
  {
    id: 'slayer_20',
    name: 'NYCKELSMED',
    description: 'Bossnyckeln räcker till ytterligare en träff.',
    theme: 'slayer',
    level: 20,
    icon: '🗝️',
  },

  /* ---- level 25 ---- */
  {
    id: 'momentum_25',
    name: 'RUTINMÄSTARE',
    description: 'Dagens uppdrag ger ytterligare +15% XP.',
    theme: 'momentum',
    level: 25,
    icon: '📅',
  },
  {
    id: 'fortune_25',
    name: 'LYCKOSAM',
    description: '+5 procentenheter chans att hitta loot.',
    theme: 'fortune',
    level: 25,
    icon: '🍀',
  },
  {
    id: 'slayer_25',
    name: 'BRYTPUNKT',
    description: '+12% bossskada.',
    theme: 'slayer',
    level: 25,
    icon: '💥',
  },

  /* ---- level 30 ---- */
  {
    id: 'momentum_30',
    name: 'TREDJE CHANSEN',
    description: 'Ytterligare en gratis omkastning varje dag.',
    theme: 'momentum',
    level: 30,
    icon: '🎰',
  },
  {
    id: 'fortune_30',
    name: 'HANDELSVAN',
    description: 'Ytterligare 10% rabatt på marknaden.',
    theme: 'fortune',
    level: 30,
    icon: '🤝',
  },
  {
    id: 'slayer_30',
    name: 'SVAGHETSEXPERT',
    description: 'Svaghetsbonusen ökar med ytterligare 15 procentenheter.',
    theme: 'slayer',
    level: 30,
    icon: '🏹',
  },

  /* ---- level 35 ---- */
  {
    id: 'momentum_35',
    name: 'FLYT',
    description: 'Dagens första uppdrag ger ytterligare +15% XP.',
    theme: 'momentum',
    level: 35,
    icon: '🌊',
  },
  {
    id: 'fortune_35',
    name: 'RIK PÅ RIKTIGT',
    description: '+12% guld på alla uppdrag.',
    theme: 'fortune',
    level: 35,
    icon: '💎',
  },
  {
    id: 'slayer_35',
    name: 'KROSSARE',
    description: '+12% bossskada.',
    theme: 'slayer',
    level: 35,
    icon: '⚒️',
  },

  /* ---- level 40 ---- */
  {
    id: 'momentum_40',
    name: 'OSTOPPBAR',
    description: 'Dagens uppdrag ger ytterligare +15% XP.',
    theme: 'momentum',
    level: 40,
    icon: '🚀',
  },
  {
    id: 'fortune_40',
    name: 'SKATTSÖKARE',
    description: '+8 procentenheter chans att hitta loot.',
    theme: 'fortune',
    level: 40,
    icon: '🗺️',
  },
  {
    id: 'slayer_40',
    name: 'BOSSDÖDARE',
    description: '+15% bossskada.',
    theme: 'slayer',
    level: 40,
    icon: '☠️',
  },

  /* ---- level 45 ---- */
  {
    id: 'momentum_45',
    name: 'EVIG RÖRELSE',
    description: 'Ytterligare en gratis omkastning varje dag.',
    theme: 'momentum',
    level: 45,
    icon: '♾️',
  },
  {
    id: 'fortune_45',
    name: 'KÖPMANNENS VÄN',
    description: 'Ytterligare 10% rabatt på marknaden.',
    theme: 'fortune',
    level: 45,
    icon: '🧾',
  },
  {
    id: 'slayer_45',
    name: 'DÖDLIG PRECISION',
    description: 'Svaghetsbonusen ökar med ytterligare 15 procentenheter.',
    theme: 'slayer',
    level: 45,
    icon: '🎖️',
  },

  /* ---- level 50 ---- */
  {
    id: 'momentum_50',
    name: 'LEGENDENS RYTM',
    description: 'Dagens första uppdrag ger ytterligare +20% XP.',
    theme: 'momentum',
    level: 50,
    icon: '👑',
  },
  {
    id: 'fortune_50',
    name: 'DRAKENS HÅG',
    description: '+15% guld på alla uppdrag.',
    theme: 'fortune',
    level: 50,
    icon: '🐲',
  },
  {
    id: 'slayer_50',
    name: 'VECKANS MARDRÖM',
    description: '+15% bossskada.',
    theme: 'slayer',
    level: 50,
    icon: '🏆',
  },
];

export const PERK_BY_ID: Record<string, PerkDefinition> = Object.fromEntries(
  PERKS.map((perk) => [perk.id, perk]),
);

export function getPerkById(id: string): PerkDefinition | undefined {
  return PERK_BY_ID[id];
}

/** The three choices offered at a given milestone level. */
export function getPerksForLevel(level: number): PerkDefinition[] {
  return PERKS.filter((perk) => perk.level === level);
}

export function createEmptyPerkEffects(): PerkEffects {
  return {
    firstQuestXpBonus: 0,
    dailyQuestXpBonus: 0,
    extraFreeRerolls: 0,
    goldBonus: 0,
    lootChanceBonus: 0,
    merchantDiscount: 0,
    bossDamageBonus: 0,
    weaknessBonusExtra: 0,
    bossKeyDoubleHit: false,
  };
}

/** How each perk contributes to the aggregate effects. */
const PERK_EFFECTS: Record<string, (effects: PerkEffects) => void> = {
  momentum_5: (e) => {
    e.firstQuestXpBonus += 0.1;
  },
  momentum_10: (e) => {
    e.dailyQuestXpBonus += 0.1;
  },
  momentum_15: (e) => {
    e.extraFreeRerolls += 1;
  },
  momentum_20: (e) => {
    e.firstQuestXpBonus += 0.1;
  },
  momentum_25: (e) => {
    e.dailyQuestXpBonus += 0.15;
  },
  momentum_30: (e) => {
    e.extraFreeRerolls += 1;
  },
  momentum_35: (e) => {
    e.firstQuestXpBonus += 0.15;
  },
  momentum_40: (e) => {
    e.dailyQuestXpBonus += 0.15;
  },
  momentum_45: (e) => {
    e.extraFreeRerolls += 1;
  },
  momentum_50: (e) => {
    e.firstQuestXpBonus += 0.2;
  },

  fortune_5: (e) => {
    e.goldBonus += 0.08;
  },
  fortune_10: (e) => {
    e.lootChanceBonus += 0.05;
  },
  fortune_15: (e) => {
    e.merchantDiscount += 0.1;
  },
  fortune_20: (e) => {
    e.goldBonus += 0.1;
  },
  fortune_25: (e) => {
    e.lootChanceBonus += 0.05;
  },
  fortune_30: (e) => {
    e.merchantDiscount += 0.1;
  },
  fortune_35: (e) => {
    e.goldBonus += 0.12;
  },
  fortune_40: (e) => {
    e.lootChanceBonus += 0.08;
  },
  fortune_45: (e) => {
    e.merchantDiscount += 0.1;
  },
  fortune_50: (e) => {
    e.goldBonus += 0.15;
  },

  slayer_5: (e) => {
    e.bossDamageBonus += 0.08;
  },
  slayer_10: (e) => {
    e.weaknessBonusExtra += 0.1;
  },
  slayer_15: (e) => {
    e.bossDamageBonus += 0.1;
  },
  slayer_20: (e) => {
    e.bossKeyDoubleHit = true;
  },
  slayer_25: (e) => {
    e.bossDamageBonus += 0.12;
  },
  slayer_30: (e) => {
    e.weaknessBonusExtra += 0.15;
  },
  slayer_35: (e) => {
    e.bossDamageBonus += 0.12;
  },
  slayer_40: (e) => {
    e.bossDamageBonus += 0.15;
  },
  slayer_45: (e) => {
    e.weaknessBonusExtra += 0.15;
  },
  slayer_50: (e) => {
    e.bossDamageBonus += 0.15;
  },
};

/** Fold the player's selected perks into one effects object. */
export function computePerkEffects(selected: string[]): PerkEffects {
  const effects = createEmptyPerkEffects();
  for (const perkId of selected) {
    PERK_EFFECTS[perkId]?.(effects);
  }
  // Keep the market from ever becoming free.
  effects.merchantDiscount = Math.min(0.4, effects.merchantDiscount);
  return effects;
}
