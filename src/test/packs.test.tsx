import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RogueDaySave } from '@/types';
import { App } from '@/app/App';
import { GameProvider } from '@/app/GameProvider';
import { SAVE_KEY } from '@/persistence/storage';
import { createDefaultSave } from '@/persistence/defaults';
import { ACTIVITY_PACKS, FAVOURITE_PACK_LIMIT, FEATURED_PACK_COUNT } from '@/data/activityPacks';
import { getDailyPack } from '@/game/activityPacks';

/**
 * Activity packs in the real UI.
 *
 * The flow the brief describes: pick a situation, see what it means and how
 * much it can offer, then roll into the ordinary three-choice system. Picking
 * a pack must never hand out a quest by itself.
 */

function storedSave(): RogueDaySave {
  return JSON.parse(window.localStorage.getItem(SAVE_KEY)!) as RogueDaySave;
}

function renderApp() {
  return render(
    <GameProvider>
      <App />
    </GameProvider>,
  );
}

function seedSave(overrides: Partial<RogueDaySave> = {}): void {
  const save = createDefaultSave('Testhjälte');
  window.localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ ...save, onboardingComplete: true, ...overrides }),
  );
}

describe('the pack picker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSave();
  });

  it('shows the situation picker on the quest hub', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'VÄLJ ETT LÄGE' })).toBeInTheDocument();
  });

  it('shows a handful of packs first and the rest behind one tap', async () => {
    const user = userEvent.setup();
    renderApp();

    const showAll = await screen.findByRole('button', { name: /visa alla lägen/i });
    // Only the featured slice is on screen to begin with.
    expect(screen.queryByRole('button', { name: 'Öppna läget GRATIS NÖJE' })).not.toBeInTheDocument();

    await user.click(showAll);
    expect(await screen.findByRole('button', { name: 'Öppna läget GRATIS NÖJE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /visa färre lägen/i })).toBeInTheDocument();
  });

  it('shows a real pool count on every visible card', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'VÄLJ ETT LÄGE' });

    const counts = screen.getAllByText(/möjliga uppdrag/);
    expect(counts.length).toBe(FEATURED_PACK_COUNT);
    for (const node of counts) {
      const value = Number(node.textContent!.replace(/\D/g, ''));
      expect(value).toBeGreaterThan(0);
    }
  });

  it('keeps the manual finder as the advanced path', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: /hitta ett uppdrag/i })).toBeInTheDocument();
  });

  it('offers the deterministic pack of the day', async () => {
    renderApp();
    await screen.findByText('DAGENS LÄGE');
    expect(
      screen.getByRole('button', { name: `Öppna dagens läge: ${getDailyPack().name}` }),
    ).toBeInTheDocument();
  });
});

describe('the pack screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSave();
  });

  it('explains the pack and counts its pool before anything is rolled', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Öppna läget JAG ÄR HELT SLUT' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/uppdrag matchar/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /kasta tärningen/i })).toBeInTheDocument();
    // Nothing has been assigned yet.
    expect(storedSave().activeQuest).toBeNull();
  });

  it('rolls into the ordinary three choices', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Öppna läget JAG ÄR HELT SLUT' }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));

    const choices = await screen.findByRole('dialog');
    expect(within(choices).getByText('TRYGGT')).toBeInTheDocument();
    expect(within(choices).getByText('VILT')).toBeInTheDocument();
    expect(within(choices).getByText('FARLIGT')).toBeInTheDocument();
  });

  it('only offers quests the pack allows', async () => {
    const user = userEvent.setup();
    renderApp();

    // This one lives behind "visa alla lägen".
    await user.click(await screen.findByRole('button', { name: /visa alla lägen/i }));
    await user.click(
      await screen.findByRole('button', { name: 'Öppna läget JAG HAR 5 MINUTER' }),
    );
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));

    const choices = await screen.findByRole('dialog');
    // Every offer in this pack must be a five-minute quest.
    expect(within(choices).queryByText(/15 MIN/)).not.toBeInTheDocument();
    expect(within(choices).queryByText(/30 MIN/)).not.toBeInTheDocument();
    expect(within(choices).queryByText(/60 MIN/)).not.toBeInTheDocument();
    expect(within(choices).getAllByText(/5 MIN/).length).toBeGreaterThan(0);
  });

  it('remembers which pack was used', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Öppna läget STÄDRÄD' }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));

    await waitFor(() => expect(storedSave().packs.recent).toEqual(['pack_cleaning_raid']));
  });

  it('attributes a completion to the pack it came from', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Öppna läget STÄDRÄD' }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));

    await screen.findByText('UPPDRAG SLUTFÖRT!');
    await waitFor(() => {
      expect(storedSave().packs.completions.pack_cleaning_raid).toBe(1);
    });
  });
});

describe('favourites', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSave();
  });

  it('pins a pack and moves it to the front', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /Spara STÄDRÄD som favorit/ }));

    await waitFor(() => expect(storedSave().packs.favourites).toEqual(['pack_cleaning_raid']));
    // The favourite is now the first card in the grid.
    const cards = screen.getAllByText(/möjliga uppdrag/);
    expect(cards[0].closest('.pack-card__main')!.textContent).toContain('STÄDRÄD');
  });

  it('stops offering more slots once the limit is reached', async () => {
    const user = userEvent.setup();
    seedSave({
      packs: {
        favourites: ACTIVITY_PACKS.slice(0, FAVOURITE_PACK_LIMIT).map((pack) => pack.id),
        recent: [],
        completions: {},
        dailyBonusClaimedOn: null,
        dailyPackCompletions: 0,
      },
    });
    renderApp();

    await screen.findByRole('heading', { name: 'VÄLJ ETT LÄGE' });
    await user.click(screen.getByRole('button', { name: /visa alla lägen/i }));

    const unpinned = screen.getByRole('button', { name: /Spara GRATIS NÖJE som favorit/ });
    expect(unpinned).toBeDisabled();
  });
});

describe('ÖVERRASKA MIG', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSave();
  });

  it('rolls three choices straight away', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /överraska mig/i }));

    const choices = await screen.findByRole('dialog');
    expect(within(choices).getByText('TRYGGT')).toBeInTheDocument();
    expect(within(choices).getByText('FARLIGT')).toBeInTheDocument();
  });

  it('never offers an hour-long quest by default', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /överraska mig/i }));
    const choices = await screen.findByRole('dialog');
    expect(within(choices).queryByText(/60 MIN/)).not.toBeInTheDocument();
  });

  it('is not attributed to any pack', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /överraska mig/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));

    await waitFor(() => expect(storedSave().activeQuest).not.toBeNull());
    expect(storedSave().activeQuest?.packId).toBeUndefined();
  });
});
