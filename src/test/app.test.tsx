import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app/App';
import { GameProvider } from '@/app/GameProvider';
import { SAVE_KEY, loadGame, saveGame } from '@/persistence/storage';
import type { RogueDaySave } from '@/types';
import { makeSave } from './helpers';

function renderApp() {
  return render(
    <GameProvider>
      <App />
    </GameProvider>,
  );
}

/** Simulate a full page reload by unmounting and mounting a new tree. */
function reloadApp(unmount: () => void) {
  unmount();
  return renderApp();
}

function storedSave(): RogueDaySave {
  return JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as RogueDaySave;
}

/** Get through the intro to the game proper. */
async function completeOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /hoppa över/i }));
  const nameInput = await screen.findByLabelText(/vad heter din hjälte/i);
  await user.clear(nameInput);
  await user.type(nameInput, 'Testhjälten');
  await user.click(screen.getByRole('button', { name: /gå in i rogueday/i }));
  await screen.findByRole('tab', { name: /uppdrag/i });
}

describe('onboarding', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the cinematic intro to a new player', () => {
    renderApp();
    expect(screen.getByText('Vardagen har invaderats.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hoppa över/i })).toBeInTheDocument();
  });

  it('can be skipped and persists the chosen name', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeOnboarding(user);

    expect(screen.getByText('Testhjälten')).toBeInTheDocument();

    await waitFor(() => {
      expect(storedSave().onboardingComplete).toBe(true);
      expect(storedSave().player.name).toBe('Testhjälten');
    });
  });

  it('is not shown again after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await completeOnboarding(user);

    reloadApp(unmount);

    expect(screen.queryByText('Vardagen har invaderats.')).not.toBeInTheDocument();
    expect(await screen.findByText('Testhjälten')).toBeInTheDocument();
  });
});

describe('the core loop in the real UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    saveGame(save);
  });

  it('renders the HUD with brand, level and streak', () => {
    renderApp();

    expect(screen.getByText('ROGUEDAY')).toBeInTheDocument();
    expect(screen.getByText('OFFLINE RPG')).toBeInTheDocument();
    expect(screen.getByText('LVL 1')).toBeInTheDocument();
    expect(screen.getByText('Skuggvandrare')).toBeInTheDocument();
  });

  it('shows the quest finder hero and its call to action', () => {
    renderApp();

    expect(screen.getByText('DITT ÄVENTYR VÄNTAR')).toBeInTheDocument();
    expect(
      screen.getByText('Förvandla vardaglig tristess till verkliga hjältedåd.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hitta ett uppdrag/i })).toBeInTheDocument();
  });

  it('opens the finder modal with every filter group', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/SÖK ETT VERKLIGT UPPDRAG/)).toBeInTheDocument();
    expect(within(dialog).getByText('TILLGÄNGLIG TID')).toBeInTheDocument();
    expect(within(dialog).getByText('ENERGINIVÅ')).toBeInTheDocument();
    expect(within(dialog).getByText('PLATS')).toBeInTheDocument();
    expect(within(dialog).getByText('SINNESSTÄMNING')).toBeInTheDocument();
    expect(within(dialog).getByText('UPPDRAGSLÄGE')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /kasta tärningen/i }),
    ).toBeInTheDocument();
  });

  it('marks the selected filter chips as pressed', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    const dialog = await screen.findByRole('dialog');

    const fiveMin = within(dialog).getByRole('button', { name: '5 minuter' });
    await user.click(fiveMin);
    expect(fiveMin).toHaveAttribute('aria-pressed', 'true');

    const chaos = within(dialog).getByRole('button', { name: 'KAOS-LÄGE' });
    await user.click(chaos);
    expect(chaos).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'NORMAL ROGUELIKE' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('rolls three choices and accepts one', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('TRYGGT')).toBeInTheDocument();
    expect(within(dialog).getByText('VILT')).toBeInTheDocument();
    expect(within(dialog).getByText('FARLIGT')).toBeInTheDocument();

    const accept = within(dialog).getByRole('button', { name: /acceptera uppdrag/i });
    expect(accept).toBeDisabled();

    await user.click(within(dialog).getByText('TRYGGT').closest('button')!);
    expect(accept).toBeEnabled();
    await user.click(accept);

    expect(await screen.findByRole('button', { name: /slutför uppdraget/i })).toBeInTheDocument();
    await waitFor(() => expect(storedSave().activeQuest).not.toBeNull());
  });

  it('completes a quest, shows the reward and persists everything', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));

    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));

    expect(await screen.findByText('UPPDRAG SLUTFÖRT!')).toBeInTheDocument();

    await waitFor(() => {
      const save = storedSave();
      expect(save.history).toHaveLength(1);
      expect(save.progression.totalXp).toBeGreaterThan(0);
      expect(save.activeQuest).toBeNull();
    });
  });

  it('abandoning requires confirmation and grants nothing', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));

    await user.click(await screen.findByRole('button', { name: /^överge$/i }));
    await user.click(await screen.findByRole('button', { name: /ja, överge/i }));

    expect(await screen.findByText('DITT ÄVENTYR VÄNTAR')).toBeInTheDocument();
    await waitFor(() => {
      expect(storedSave().history).toHaveLength(0);
      expect(storedSave().statistics.questsAbandoned).toBe(1);
    });
  });
});

describe('history survives a reload in the real UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    saveGame(save);
  });

  it('shows completed quests in HISTORIK after remounting the app', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();

    // Complete one quest.
    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));

    const title = storedSave().activeQuest!.offer.quest.title;

    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));
    await screen.findByText('UPPDRAG SLUTFÖRT!');
    await user.click(screen.getByRole('button', { name: /^fortsätt$/i }));

    await waitFor(() => expect(storedSave().history).toHaveLength(1));

    // Full reload.
    reloadApp(unmount);

    await user.click(await screen.findByRole('tab', { name: /historik/i }));

    expect(await screen.findByText('FULLGJORDA UPPDRAG (1)')).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('Avklarade')).toBeInTheDocument();
  });

  it('shows the time filters in a sensible order', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /historik/i }));

    const filterBar = await screen.findByRole('tablist', { name: /tidsfilter/i });
    const labels = within(filterBar)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);

    // Regression: Object.keys hoists the integer-like '7'/'30' keys, which put
    // these tabs in the wrong order.
    expect(labels).toEqual(['ALLA', 'IDAG', '7 DAGAR', '30 DAGAR']);
  });

  it('XP and level survive a reload', async () => {
    const save = makeSave();
    save.onboardingComplete = true;
    save.progression = { level: 7, xp: 620, totalXp: 5000, gold: 342 };
    saveGame(save);

    renderApp();

    expect(await screen.findByText('LVL 7')).toBeInTheDocument();
    expect(screen.getByText('342')).toBeInTheDocument();
  });
});

describe('boss screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    saveGame(save);
  });

  it('shows the weekly enemy with its HP bar', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /boss/i }));

    expect(await screen.findByText('VECKANS FIENDE')).toBeInTheDocument();
    expect(screen.getByText('Skada idag')).toBeInTheDocument();
    expect(screen.getByText('Total skada')).toBeInTheDocument();

    const stored = storedSave();
    const bar = screen.getByRole('progressbar', { name: /bossens hälsa/i });
    expect(bar).toHaveAttribute('aria-valuenow', String(stored.boss!.currentHp));
  });

  it('boss HP survives a reload', async () => {
    const save = makeSave();
    save.onboardingComplete = true;
    save.boss!.currentHp = save.boss!.maxHp - 777;
    save.boss!.totalDamage = 777;
    saveGame(save);

    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('tab', { name: /boss/i }));

    const bar = await screen.findByRole('progressbar', { name: /bossens hälsa/i });
    expect(bar).toHaveAttribute('aria-valuenow', String(save.boss!.maxHp - 777));
  });
});

describe('badges screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    saveGame(save);
  });

  it('shows locked badges and masks the hidden ones', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /märken/i }));

    expect(await screen.findByText('FÖRSTA BLODET')).toBeInTheDocument();
    expect(screen.getAllByText('???').length).toBeGreaterThan(0);
  });

  it('unlocked badges survive a reload', async () => {
    const save = makeSave();
    save.onboardingComplete = true;
    save.achievements = [{ id: 'first_blood', unlockedAt: new Date(2026, 8, 4).toISOString() }];
    saveGame(save);

    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('tab', { name: /märken/i }));

    const badge = await screen.findByRole('group', { name: /FÖRSTA BLODET.*Upplåst/i });
    expect(badge).toBeInTheDocument();
  });
});

describe('data screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    save.progression.gold = 250;
    saveGame(save);
  });

  it('reports the local save status', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /data/i }));

    expect(await screen.findByText('LOKAL SPARFIL')).toBeInTheDocument();
    expect(screen.getByText('Sparad lokalt')).toBeInTheDocument();
    expect(screen.getByText('localStorage tillgängligt')).toBeInTheDocument();

    // The storage key itself lives in the collapsible diagnostics panel.
    await user.click(screen.getByRole('button', { name: /sparningsdiagnostik/i }));
    expect(await screen.findByText('rogueDay.save.v1')).toBeInTheDocument();
    expect(screen.getByText('rogueDay.save.backup')).toBeInTheDocument();
  });

  it('the save self-test passes from the diagnostics panel', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /data/i }));
    await user.click(await screen.findByRole('button', { name: /sparningsdiagnostik/i }));
    await user.click(await screen.findByRole('button', { name: /testa sparning/i }));

    expect(await screen.findByText('SPARNINGSTEST GODKÄNT')).toBeInTheDocument();
  });

  it('reset requires explicit confirmation and then clears storage', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /data/i }));
    await user.click(await screen.findByRole('button', { name: /nollställ äventyret/i }));

    expect(await screen.findByText('ÄR DU HELT SÄKER?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /avbryt/i }));
    expect(loadGame().save.progression.gold).toBe(250);

    await user.click(screen.getByRole('button', { name: /nollställ äventyret/i }));
    await user.click(await screen.findByRole('button', { name: /ja, radera allt/i }));

    await waitFor(() => {
      expect(loadGame().save.progression.gold).toBe(0);
      expect(loadGame().save.history).toHaveLength(0);
    });
  });

  it('settings persist immediately', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: /data/i }));
    await user.click(await screen.findByRole('switch', { name: /hög kontrast/i }));

    await waitFor(() => expect(storedSave().settings.highContrast).toBe(true));
    expect(document.documentElement.dataset.contrast).toBe('high');
  });
});

describe('navigation accessibility', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const save = makeSave();
    save.onboardingComplete = true;
    saveGame(save);
  });

  it('exposes the five screens as tabs', () => {
    renderApp();
    // The quest hub has its own subtab strip, so scope to the screen switcher.
    const nav = screen.getByRole('tablist', { name: /skärmar/i });
    const tabs = within(nav).getAllByRole('tab');

    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('the quest hub exposes its own subtabs', () => {
    renderApp();
    const hub = screen.getByRole('tablist', { name: /uppdragsnav/i });
    const labels = within(hub)
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.replace(/[^A-ZÄÖÅ]/g, ''));

    expect(labels).toEqual(['ÄVENTYR', 'VÄSKA', 'MARKNAD']);
  });

  it('arrow keys move between screens', async () => {
    const user = userEvent.setup();
    renderApp();

    const questsTab = screen.getByRole('tab', { name: /uppdrag/i });
    questsTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /boss/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('VECKANS FIENDE')).toBeInTheDocument();
  });

  it('Escape closes the finder modal', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('modals are labelled and marked as dialogs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
  });
});
