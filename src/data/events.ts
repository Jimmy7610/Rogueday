import type { GameEventDefinition } from '@/types';

/**
 * Slumphändelser efter avklarade uppdrag.
 *
 * Designregel: en händelse får aldrig straffa spelaren hårt. Det värsta som
 * kan hända är en liten guldförlust som dessutom går att undvika helt.
 *
 * V2: varje val leder till en synlig RESULTAT-vy, och två händelser har fått
 * riktiga val i stället för gratis belöningar respektive en självklar utväg.
 */
export const GAME_EVENTS: GameEventDefinition[] = [
  {
    id: 'wandering_merchant',
    name: 'DEN VANDRANDE KÖPMANNEN',
    title: '🧙 EN FRÄMLING MED EN VÄSKA',
    description:
      'En köpman dyker upp ur ingenstans och öppnar sin väska. "Bara för dig", säger han. Det säger han säkert till alla.',
    icon: '🧙',
    weight: 22,
    choices: [
      { id: 'buy', label: 'KÖP FÖREMÅLET', description: 'Betala guldet och ta varan.' },
      { id: 'decline', label: 'GÅ VIDARE', description: 'Behåll ditt guld.' },
    ],
  },
  {
    id: 'double_or_nothing',
    name: 'DUBBELT ELLER INGET',
    title: '🎲 ETT VAD MED ÖDET',
    description:
      'En röst erbjuder dig ett vad. "Ett litet uppdrag till", säger den. "Så dubblar jag din belöning."',
    icon: '🎲',
    weight: 20,
    choices: [
      {
        id: 'accept',
        label: 'ANTA UTMANINGEN',
        description: 'Du får ett litet bonusmål att klara idag.',
      },
      { id: 'decline', label: 'AVSTÅ', description: 'Behåll det du redan vunnit.' },
    ],
  },
  {
    id: 'lucky_drop',
    name: 'TURENS FALL',
    title: '✨ NÅGOT GLIMMAR I HÖRNET',
    description: 'Något glimmar där du precis städat. En kista, orörd, som väntat på dig.',
    icon: '✨',
    weight: 18,
    choices: [{ id: 'take', label: 'ÖPPNA KISTAN', description: 'Ta emot din belöning.' }],
  },
  {
    id: 'goblin_tax',
    name: 'GOBLINSKATTEN',
    title: '👺 EN LITEN AVGIFT',
    description:
      'En goblin dyker upp med ett formulär. "Rutinkontroll", muttrar den och sträcker fram handen. Formuläret ser hemmagjort ut.',
    icon: '👺',
    weight: 12,
    choices: [
      {
        id: 'pay',
        label: 'BETALA AVGIFTEN',
        description: 'Den försvinner nöjd - och lämnar något i utbyte.',
      },
      {
        id: 'outsmart',
        label: 'GRANSKA FORMULÄRET',
        description: 'Läs finstilt. Kanske hittar du felet.',
      },
      { id: 'walk', label: 'GÅ FÖRBI', description: 'Ingen förlust, ingen vinst.' },
    ],
  },
  {
    id: 'mysterious_stranger',
    name: 'DEN MYSTISKE FRÄMLINGEN',
    title: '🎭 TRE HÄNDER, ETT VAL',
    description:
      'En gestalt håller fram tre knutna nävar. "Välj", säger den. Den säger inget mer.',
    icon: '🎭',
    weight: 16,
    choices: [
      { id: 'left', label: 'VÄNSTER HAND', description: 'Något litet och glänsande.' },
      { id: 'middle', label: 'MITTEN', description: 'Något tungt.' },
      { id: 'right', label: 'HÖGER HAND', description: 'Något som prasslar.' },
    ],
  },
  {
    id: 'ancient_shrine',
    name: 'DEN URÅLDRIGA HELGEDOMEN',
    title: '⛩️ EN ALTARSTEN I DAMMET',
    description:
      'En sten med inskriptioner du inte förstår. Skålen framför den är tom och förväntansfull.',
    icon: '⛩️',
    weight: 12,
    choices: [
      { id: 'offer', label: 'OFFRA GULD', description: 'Få en XP-välsignelse på nästa uppdrag.' },
      { id: 'leave', label: 'LÄMNA DEN IFRED', description: 'Vissa stenar ska inte väckas.' },
    ],
  },
];

export const EVENT_BY_ID = Object.fromEntries(
  GAME_EVENTS.map((event) => [event.id, event]),
) as Record<string, GameEventDefinition>;

/** Probability that any event fires after a completed quest. */
export const EVENT_TRIGGER_CHANCE = 0.22;

/**
 * Bonus objectives offered by DOUBLE OR NOTHING. Small, safe and always
 * optional - missing one costs nothing at all.
 */
export const FOLLOW_UP_OBJECTIVES: { title: string; description: string }[] = [
  {
    title: 'FEM SAKER PÅ PLATS',
    description: 'Lägg tillbaka fem saker som ligger fel. Var som helst i hemmet.',
  },
  {
    title: 'EN YTA TILL',
    description: 'Torka av en yta till innan dagen är slut.',
  },
  {
    title: 'TVÅ MINUTERS STRÄCKNING',
    description: 'Sträck ut nacke och axlar i två minuter.',
  },
  {
    title: 'ETT GLAS VATTEN',
    description: 'Drick ett stort glas vatten.',
  },
  {
    title: 'TRE MEJL TILL',
    description: 'Radera eller arkivera tre mejl till.',
  },
  {
    title: 'FEM MINUTER UT',
    description: 'Gå ut och rör på dig i fem minuter.',
  },
  {
    title: 'EN SAK DU SKJUTIT UPP',
    description: 'Gör en enda liten sak du skjutit upp idag.',
  },
];
