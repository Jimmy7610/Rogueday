import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenId } from '@/types';
import { useGame } from './GameProvider';
import { Hud } from '@/components/Hud';
import { Navigation } from '@/components/Navigation';
import { EventModal } from '@/components/EventModal';
import { EventResultModal } from '@/components/EventResultModal';
import { LootRevealModal } from '@/components/LootRevealModal';
import { PerkChooserModal } from '@/components/PerkChooser';
import { RewardModal } from '@/components/RewardModal';
import { QuestScreen } from '@/screens/QuestScreen';
import { BossScreen } from '@/screens/BossScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { BadgeScreen } from '@/screens/BadgeScreen';
import { DataScreen } from '@/screens/DataScreen';
import { Onboarding } from '@/screens/Onboarding';
import { useSound } from '@/hooks/useSound';
import { hasPendingChoice } from '@/game/perks';

const SCREEN_TITLES: Record<ScreenId, { title: string; subtitle: string }> = {
  quests: { title: 'UPPDRAG', subtitle: 'Verkliga hjältedåd, ett i taget.' },
  boss: { title: 'VECKANS BOSS', subtitle: 'Varje avklarat uppdrag skadar fienden.' },
  history: { title: 'HISTORIK', subtitle: 'Allt du har åstadkommit.' },
  badges: { title: 'MÄRKEN', subtitle: 'Bevis på dina bedrifter.' },
  data: { title: 'DATA', subtitle: 'Sparfil, säkerhetskopior och inställningar.' },
};

export function App(): JSX.Element {
  const { state, dispatch } = useGame();
  const play = useSound();

  const [screen, setScreen] = useState<ScreenId>('quests');
  const [autoOpenFinder, setAutoOpenFinder] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; icon: string }[]>([]);
  const toastId = useRef(1);

  // Reflect settings on the document root so CSS can react without prop
  // drilling through every component.
  const { settings } = state.save;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    if (settings.reducedMotion || !settings.animations) root.dataset.motion = 'reduced';
    else root.dataset.motion = 'full';
  }, [settings.highContrast, settings.reducedMotion, settings.animations]);

  const pushToast = useCallback((text: string, icon = '🏆') => {
    const id = toastId.current;
    toastId.current += 1;
    setToasts((current) => [...current, { id, text, icon }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  // Sound cues for the big moments.
  const reward = state.lastReward;
  useEffect(() => {
    if (!reward) return;
    if (reward.bossDefeated) play('defeat');
    else if (reward.levelUps.length > 0) play('levelup');
    else if (reward.loot.length > 0) play('loot');
  }, [reward, play]);

  const handleContinue = useCallback(() => {
    if (reward?.achievements.length) {
      reward.achievements.forEach((achievement) =>
        pushToast(achievement.name, achievement.icon),
      );
    }
    dispatch({ type: 'DISMISS_REWARD' });
  }, [dispatch, pushToast, reward]);

  const handleNewQuest = useCallback(() => {
    handleContinue();
    setScreen('quests');
    setAutoOpenFinder(true);
  }, [handleContinue]);

  if (!state.save.onboardingComplete) {
    return <Onboarding />;
  }

  const meta = SCREEN_TITLES[screen];
  const hasPendingPerk = hasPendingChoice(state.save);

  return (
    <div className="app-shell">
      <a href="#main" className="visually-hidden">
        Hoppa till innehållet
      </a>

      <Hud />

      <main
        className={screen === 'badges' || screen === 'data' ? 'screen screen--wide' : 'screen'}
        id="main"
        role="tabpanel"
        aria-labelledby={`nav-${screen}`}
      >
        <div className="screen__header">
          <h1 className="screen__title">{meta.title}</h1>
          <p className="screen__subtitle">{meta.subtitle}</p>
        </div>

        {screen === 'quests' && (
          <QuestScreen
            autoOpenFinder={autoOpenFinder}
            onFinderOpened={() => setAutoOpenFinder(false)}
            onOpenBoss={() => setScreen('boss')}
          />
        )}
        {screen === 'boss' && <BossScreen />}
        {screen === 'history' && <HistoryScreen />}
        {screen === 'badges' && <BadgeScreen />}
        {screen === 'data' && <DataScreen />}
      </main>

      <Navigation
        active={screen}
        onChange={(next) => {
          play('click');
          setScreen(next);
        }}
        bossDefeated={state.save.boss?.defeated ?? false}
      />

      {/* One modal at a time, in the order the player earned them. */}
      {reward && (
        <RewardModal
          reward={reward}
          quest={state.lastQuestOutcome === 'completed' ? state.lastQuest : null}
          onContinue={handleContinue}
          onNewQuest={handleNewQuest}
        />
      )}

      {!reward && <PerkChooserModal />}

      {!reward && !hasPendingPerk && state.pendingEvent && (
        <EventModal
          event={state.pendingEvent}
          gold={state.save.progression.gold}
          onChoose={(choiceId) => {
            play('loot');
            dispatch({ type: 'RESOLVE_EVENT', choiceId });
          }}
          onDismiss={() => dispatch({ type: 'DISMISS_EVENT' })}
        />
      )}

      {!reward && !hasPendingPerk && !state.pendingEvent && state.eventResult && (
        <EventResultModal
          result={state.eventResult}
          onClose={() => dispatch({ type: 'DISMISS_EVENT_RESULT' })}
        />
      )}

      {!reward && !hasPendingPerk && state.itemReveal && (
        <LootRevealModal
          reveal={state.itemReveal}
          onClose={() => dispatch({ type: 'DISMISS_ITEM_REVEAL' })}
        />
      )}

      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              <span className="toast__icon" aria-hidden="true">
                {toast.icon}
              </span>
              <span className="toast__text">MÄRKE UPPLÅST · {toast.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
