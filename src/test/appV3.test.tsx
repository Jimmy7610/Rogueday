import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RogueDaySave } from '@/types';
import { App } from '@/app/App';
import { GameProvider } from '@/app/GameProvider';
import { SAVE_KEY } from '@/persistence/storage';
import { createDefaultSave } from '@/persistence/defaults';

/**
 * V3 in the real UI: the thumbs-up / thumbs-down prompt appears where it
 * should, changes only what it claims to change, and is undoable.
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

/** A save that is already past onboarding, so the hub renders immediately. */
function seedSave(): void {
  const save = createDefaultSave('Testhjälte');
  window.localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ ...save, onboardingComplete: true }),
  );
}

async function completeAQuest(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
  await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
  await user.click((await screen.findByText('TRYGGT')).closest('button')!);
  await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));
  await user.click(await screen.findByRole('button', { name: /slutför uppdraget/i }));
  await screen.findByText('UPPDRAG SLUTFÖRT!');
}

describe('quest feedback in the UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSave();
  });

  it('offers thumbs up and down after a completion', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeAQuest(user);

    expect(screen.getByText('MER SÅNT HÄR?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mindre/i })).toBeInTheDocument();
  });

  it('records a thumbs-up locally and says what it did', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeAQuest(user);

    const quest = storedSave().history[0];
    await user.click(screen.getByRole('button', { name: /mer/i }));

    await waitFor(() => {
      const feedback = storedSave().feedback;
      expect(feedback.up).toBe(1);
      expect(feedback.scores[quest.category]).toBe(1);
    });

    expect(screen.getByRole('button', { name: /mer/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/dyker upp lite oftare/i)).toBeInTheDocument();
  });

  it('lets the player change their mind, which undoes the first vote', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeAQuest(user);

    const quest = storedSave().history[0];
    await user.click(screen.getByRole('button', { name: /mer/i }));
    await user.click(screen.getByRole('button', { name: /mindre/i }));

    await waitFor(() => {
      expect(storedSave().feedback.scores[quest.category]).toBe(-1);
    });

    expect(screen.getByRole('button', { name: /mindre/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/men försvinner inte/i)).toBeInTheDocument();
  });

  it('asks a differently worded question after an abandon', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /hitta ett uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /kasta tärningen/i }));
    await user.click((await screen.findByText('TRYGGT')).closest('button')!);
    await user.click(screen.getByRole('button', { name: /acceptera uppdrag/i }));
    await user.click(await screen.findByRole('button', { name: /^överge$/i }));
    await user.click(await screen.findByRole('button', { name: /ja, överge/i }));

    expect(await screen.findByText('VAR DET FEL UPPDRAG?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mindre/i }));
    await waitFor(() => expect(storedSave().feedback.down).toBe(1));
  });

  it('never changes progression when the player rates a quest', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeAQuest(user);

    const before = storedSave();
    await user.click(screen.getByRole('button', { name: /mer/i }));
    await waitFor(() => expect(storedSave().feedback.up).toBe(1));

    const after = storedSave();
    expect(after.progression).toEqual(before.progression);
    expect(after.history).toEqual(before.history);
    expect(after.statistics).toEqual(before.statistics);
    expect(after.inventory).toEqual(before.inventory);
  });
});
