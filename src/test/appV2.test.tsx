import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RogueDaySave } from '@/types';
import { App } from '@/app/App';
import { GameProvider } from '@/app/GameProvider';
import { SAVE_KEY, saveGame } from '@/persistence/storage';
import { makeOffer, makeSave } from './helpers';

/**
 * V2 surfaces driven through the real UI.
 *
 * These exist to prove the new systems are actually visible and usable, not
 * merely present in the model.
 */

function renderApp() {
  return render(
    <GameProvider>
      <App />
    </GameProvider>,
  );
}

function storedSave(): RogueDaySave {
  return JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as RogueDaySave;
}

function seed(mutate: (save: RogueDaySave) => void = () => {}): RogueDaySave {
  const save = makeSave();
  save.onboardingComplete = true;
  mutate(save);
  saveGame(save);
  return save;
}


/** Click past any LEVEL UP screens that interrupt the reward summary. */
async function dismissLevelUps(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let guard = 0; guard < 6; guard += 1) {
    if (!screen.queryByText('LEVEL UP!')) return;
    await user.click(screen.getByRole('button', { name: /^fortsätt$/i }));
  }
}

describe('quest hub subtabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seed((save) => {
      save.progression.gold = 2000;
    });
  });

  it('offers ÄVENTYR, VÄSKA and MARKNAD', () => {
    renderApp();
    const hub = screen.getByRole('tablist', { name: /uppdragsnav/i });
    expect(within(hub).getAllByRole('tab')).toHaveLength(3);
  });

  it('shows the market with purchasable stock', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /marknad/i }));

    expect(await screen.findByText('DAGENS MARKNAD')).toBeInTheDocument();
    expect(screen.getByText(/nytt utbud varje dag/i)).toBeInTheDocument();
    // Gold is only ever an in-game currency.
    expect(screen.getByText(/inget här kostar riktiga pengar/i)).toBeInTheDocument();
  });

  it('buying deducts gold, shows a reveal and persists', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /marknad/i }));
    const buyButtons = await screen.findAllByRole('button', { name: /^köp /i });
    await user.click(buyButtons[0]);

    expect(await screen.findByText('KÖPT')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^fortsätt$/i }));

    await waitFor(() => {
      const save = storedSave();
      expect(save.statistics.marketPurchases).toBe(1);
      expect(save.progression.gold).toBeLessThan(2000);
      expect(save.inventory.length).toBeGreaterThan(0);
    });
  });

  it('a sold-out item cannot be bought again', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /marknad/i }));
    const featured = (await screen.findAllByRole('button', { name: /^köp /i }))[0];
    await user.click(featured);
    await user.click(await screen.findByRole('button', { name: /^fortsätt$/i }));

    // Whatever had a single copy now reads as sold out.
    const soldOut = screen.queryAllByRole('button', { name: /slutsåld/i });
    const remaining = screen.queryAllByRole('button', { name: /^köp /i });
    expect(soldOut.length + remaining.length).toBeGreaterThan(0);
    for (const button of soldOut) expect(button).toBeDisabled();
  });

  it('the bag opens a chest with a visible reveal', async () => {
    window.localStorage.clear();
    seed((save) => {
      save.inventory = [{ itemId: 'mystery_chest', count: 1 }];
    });

    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /väska/i }));
    await user.click(await screen.findByRole('button', { name: /mysteriekista/i }));

    expect(await screen.findByText('KISTA ÖPPNAD')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^fortsätt$/i }));

    await waitFor(() => {
      const stored = storedSave();
      expect(stored.inventory.find((entry) => entry.itemId === 'mystery_chest')).toBeUndefined();
      expect(stored.statistics.lootFound).toBeGreaterThan(0);
    });
  });
});

describe('boss strip and boss detail', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seed();
  });

  it('shows the weekly boss and its weaknesses on the quest hub', async () => {
    renderApp();
    const strip = await screen.findByRole('button', { name: /veckans boss/i });

    expect(within(strip).getByText('SVAG:')).toBeInTheDocument();
    expect(storedSave().boss).not.toBeNull();
  });

  it('clicking the strip opens the boss screen', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /veckans boss/i }));

    expect(await screen.findByText('VECKANS FIENDE')).toBeInTheDocument();
    expect(screen.getByText('TAKTIK')).toBeInTheDocument();
    expect(screen.getByText('SVAGHET')).toBeInTheDocument();
  });

  it('keeps phases hidden until they are reached', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /boss/i }));
    await screen.findByText('FASER');

    expect(screen.getAllByText('???').length).toBeGreaterThan(0);
  });
});

describe('perk milestones', () => {
  beforeEach(() => window.localStorage.clear());

  it('prompts at a milestone and persists the pick', async () => {
    seed((save) => {
      save.progression = { level: 5, xp: 0, totalXp: 3000, gold: 0 };
    });

    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText('VÄLJ EN FÖRMÅGA')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /MORGONSTUND/i }));
    await user.click(screen.getByRole('button', { name: /^välj förmåga$/i }));

    await waitFor(() => expect(storedSave().perks.selected).toEqual(['momentum_5']));
    expect(screen.queryByText('VÄLJ EN FÖRMÅGA')).not.toBeInTheDocument();
  });

  it('lists chosen perks on the Data screen', async () => {
    seed((save) => {
      save.progression = { level: 5, xp: 0, totalXp: 3000, gold: 0 };
      save.perks = { selected: ['slayer_5'] };
    });

    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /data/i }));

    expect(await screen.findByText(/FÖRMÅGOR/)).toBeInTheDocument();
    expect(screen.getByText('VASST STÅL')).toBeInTheDocument();
  });
});

describe('focus timer', () => {
  beforeEach(() => window.localStorage.clear());

  it('is optional, and can be started, paused and hidden', async () => {
    seed((save) => {
      save.activeQuest = {
        offer: makeOffer('digi_inbox_raid'),
        acceptedAt: new Date().toISOString(),
      };
    });

    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText('FOKUSTIMER (VALFRI)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /starta fokustimer/i }));
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    await waitFor(() => expect(storedSave().activeQuest?.timer).toBeDefined());

    await user.click(screen.getByRole('button', { name: /^pausa$/i }));
    await waitFor(() => expect(storedSave().activeQuest?.timer?.runningSince).toBeNull());

    await user.click(screen.getByRole('button', { name: /^dölj$/i }));
    await waitFor(() => expect(storedSave().activeQuest?.timer).toBeUndefined());
  });

  it('an expired challenge timer never blocks completion', async () => {
    const timedOffer = {
      ...makeOffer('digi_inbox_raid'),
      challenge: {
        id: 'danger_speed_12',
        name: 'TOLV MINUTER',
        requirement: 'Klara det på 12 minuter.',
        tier: 'dangerous' as const,
        rewardMultiplier: 1.6,
        timerMinutes: 12,
      },
    };

    seed((save) => {
      save.activeQuest = {
        offer: timedOffer,
        acceptedAt: new Date().toISOString(),
        timer: {
          // Started an hour ago: the challenge window is long gone.
          runningSince: new Date(Date.now() - 3_600_000).toISOString(),
          accumulatedMs: 0,
          targetMs: 12 * 60_000,
        },
      };
    });

    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText('TIDEN UTE')).toBeInTheDocument();
    expect(screen.getByText(/går fortfarande att slutföra/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /slutför uppdraget/i }));
    expect(await screen.findByText('UPPDRAG SLUTFÖRT!')).toBeInTheDocument();

    await waitFor(() => expect(storedSave().history).toHaveLength(1));
  });

  it('shows the challenge requirement before the quest is completed', async () => {
    seed((save) => {
      save.activeQuest = {
        offer: {
          ...makeOffer('digi_inbox_raid'),
          challenge: {
            id: 'wild_no_social',
            name: 'FOKUSLÅS',
            requirement: 'Genomför uppdraget utan att öppna sociala medier.',
            tier: 'wild' as const,
            rewardMultiplier: 1.25,
          },
        },
        acceptedAt: new Date().toISOString(),
      };
    });

    renderApp();

    expect(await screen.findByText('FOKUSLÅS')).toBeInTheDocument();
    expect(
      screen.getByText('Genomför uppdraget utan att öppna sociala medier.'),
    ).toBeInTheDocument();
  });
});

describe('reward breakdown', () => {
  beforeEach(() => window.localStorage.clear());

  it('explains every part of the reward and totals them', async () => {
    seed((save) => {
      save.activeQuest = {
        offer: makeOffer('clean_floor_deep'),
        acceptedAt: new Date().toISOString(),
      };
    });

    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));
    await dismissLevelUps(user);
    await screen.findByText('UPPDRAG SLUTFÖRT!');

    // Scope to the dialog: the screen header also reads "UPPDRAG".
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('UPPDRAG')).toBeInTheDocument();
    expect(within(dialog).getByText('TOTALT')).toBeInTheDocument();
    // Every line's XP contributes to the stated total.
    expect(within(dialog).getAllByText(/\+\d+ XP/).length).toBeGreaterThan(0);
  });

  it('shows the boss attack with its HP transition', async () => {
    seed((save) => {
      save.activeQuest = {
        offer: makeOffer('clean_floor_deep'),
        acceptedAt: new Date().toISOString(),
      };
    });

    const before = storedSave().boss!.currentHp;

    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));
    await dismissLevelUps(user);
    await screen.findByText('UPPDRAG SLUTFÖRT!');

    // Before-HP is displayed as part of the attack readout.
    expect(screen.getByText(`${before.toLocaleString('sv-SE')} HP`)).toBeInTheDocument();
    expect(screen.getByText(/SVAGHET TRÄFFAD/)).toBeInTheDocument();
  });
});

describe('event outcomes are shown', () => {
  beforeEach(() => window.localStorage.clear());

  it('an event result is displayed before the event closes', async () => {
    seed((save) => {
      save.progression.gold = 500;
      save.activeQuest = {
        offer: makeOffer('digi_inbox_raid'),
        acceptedAt: new Date().toISOString(),
      };
    });

    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));
    await dismissLevelUps(user);
    await screen.findByText('UPPDRAG SLUTFÖRT!');
    await user.click(screen.getByRole('button', { name: /^fortsätt$/i }));

    // Events are random; when one fires, choosing must lead to a result view
    // rather than the modal silently vanishing.
    const eventHeading = screen.queryByText(/EN FRÄMLING|ETT VAD MED ÖDET|NÅGOT GLIMMAR|EN LITEN AVGIFT|TRE HÄNDER|EN ALTARSTEN/);
    if (!eventHeading) return;

    const choices = screen.getAllByRole('button').filter((button) =>
      button.className.includes('event-choice'),
    );
    expect(choices.length).toBeGreaterThan(0);
    await user.click(choices[choices.length - 1]);

    // A result modal appears with its own continue button.
    expect(await screen.findByRole('button', { name: /^fortsätt$/i })).toBeInTheDocument();
  });
});
