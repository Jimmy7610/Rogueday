import { useCallback, useState } from 'react';
import type { QuestOffer } from '@/types';
import { useGame } from '@/app/GameProvider';
import { CATEGORY_ICONS, CATEGORY_LABELS, getQuestById } from '@/data/quests';
import { LOOT_BY_ID } from '@/data/loot';
import { buildDailyOffer, getActiveChains, getRerollAvailability } from '@/game/questSelection';
import { useSound } from '@/hooks/useSound';
import { QuestChoiceModal } from '@/components/QuestChoiceModal';
import { QuestFinderModal } from '@/components/QuestFinderModal';
import {
  DIFFICULTY_LABELS,
  EmptyState,
  ENERGY_LABELS,
  LOCATION_LABELS,
  Pill,
  RarityTag,
  SectionTitle,
} from '@/components/ui';
import { toLocalDateKey } from '@/utils/date';

interface QuestScreenProps {
  /** Set by the reward modal's "NYTT UPPDRAG" button. */
  autoOpenFinder: boolean;
  onFinderOpened: () => void;
}

export function QuestScreen({ autoOpenFinder, onFinderOpened }: QuestScreenProps): JSX.Element {
  const { state, dispatch } = useGame();
  const { save } = state;
  const play = useSound();

  const [finderOpen, setFinderOpen] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  if (autoOpenFinder && !finderOpen && !save.activeQuest) {
    // Runs during render on purpose: opening on the next tick would flash the
    // hero screen between the reward modal closing and the finder appearing.
    onFinderOpened();
    setFinderOpen(true);
  }

  const openFinder = useCallback(() => {
    play('click');
    setFinderOpen(true);
  }, [play]);

  const handleRoll = useCallback(
    (filters: typeof state.filters) => {
      play('accept');
      dispatch({ type: 'ROLL_QUESTS', filters });
      setSelectedOfferId(null);
      setFinderOpen(false);
    },
    [dispatch, play, state.filters],
  );

  const handleAccept = useCallback(
    (offer: QuestOffer) => {
      play('accept');
      dispatch({ type: 'ACCEPT_QUEST', offer });
      setSelectedOfferId(null);
    },
    [dispatch, play],
  );

  const activeQuest = save.activeQuest;

  if (activeQuest) {
    return (
      <>
        <ActiveQuestCard offer={activeQuest.offer} />
        {state.offers && (
          <QuestChoiceModalWrapper
            selectedOfferId={selectedOfferId}
            setSelectedOfferId={setSelectedOfferId}
            onAccept={handleAccept}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="hero">
        <div className="hero__icon" aria-hidden="true">
          🧭
        </div>
        <h1 className="hero__title">DITT ÄVENTYR VÄNTAR</h1>
        <p className="hero__text">Förvandla vardaglig tristess till verkliga hjältedåd.</p>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={openFinder}>
          HITTA ETT UPPDRAG 🎲
        </button>
      </div>

      <DailyQuestCard />
      <ChainProgress />
      <InventoryPanel />

      {finderOpen && (
        <QuestFinderModal
          initial={state.filters}
          onClose={() => setFinderOpen(false)}
          onRoll={handleRoll}
        />
      )}

      {state.offers && !finderOpen && (
        <QuestChoiceModalWrapper
          selectedOfferId={selectedOfferId}
          setSelectedOfferId={setSelectedOfferId}
          onAccept={handleAccept}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function QuestChoiceModalWrapper({
  selectedOfferId,
  setSelectedOfferId,
  onAccept,
}: {
  selectedOfferId: string | null;
  setSelectedOfferId: (id: string | null) => void;
  onAccept: (offer: QuestOffer) => void;
}): JSX.Element | null {
  const { state, dispatch } = useGame();
  const play = useSound();

  if (!state.offers) return null;

  const availability = getRerollAvailability(state.save);

  return (
    <QuestChoiceModal
      offers={state.offers}
      selectedId={selectedOfferId}
      onSelect={(id) => {
        play('click');
        setSelectedOfferId(id);
      }}
      onAccept={onAccept}
      onReroll={() => {
        play('click');
        dispatch({ type: 'REROLL' });
        setSelectedOfferId(null);
      }}
      rerollLabel={availability.reason}
      canReroll={availability.canReroll}
      onClose={() => {
        dispatch({ type: 'CLOSE_OFFERS' });
        setSelectedOfferId(null);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

function ActiveQuestCard({ offer }: { offer: QuestOffer }): JSX.Element {
  const { dispatch } = useGame();
  const play = useSound();
  const quest = offer.quest;
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  return (
    <div className="active-quest" data-rarity={offer.rarity}>
      {offer.chainInfo && (
        <div className="chain-banner">
          <span className="chain-banner__icon" aria-hidden="true">
            ⛓️
          </span>
          <span>
            <span className="chain-banner__name">{offer.chainInfo.chainName}</span>
            <br />
            <span className="chain-banner__step">
              Del {offer.chainInfo.step} av {offer.chainInfo.total}
            </span>
          </span>
        </div>
      )}

      <div className="active-quest__head">
        <span className="active-quest__category">
          {CATEGORY_ICONS[quest.category]} {CATEGORY_LABELS[quest.category]}
          {offer.isDaily ? ' · DAGENS' : ''}
        </span>
        <RarityTag rarity={offer.rarity} />
      </div>

      <h1 className="active-quest__title">{quest.title}</h1>
      <p className="active-quest__flavour">{quest.flavourText}</p>
      <p className="active-quest__desc">{quest.description}</p>

      {offer.modifier && (
        <div className="offer__modifier" style={{ marginBottom: 16 }}>
          <span aria-hidden="true">🌀</span>
          <span>
            <span className="offer__modifier-name">{offer.modifier.name}</span>
            <br />
            <span className="offer__modifier-desc">{offer.modifier.description}</span>
          </span>
        </div>
      )}

      <div className="active-quest__meta">
        <Pill>⏱ {quest.duration} MIN</Pill>
        <Pill>⚡ {DIFFICULTY_LABELS[quest.difficulty]}</Pill>
        <Pill>🔋 {ENERGY_LABELS[quest.energy]}</Pill>
        <Pill>
          📍{' '}
          {quest.locations.includes('anywhere')
            ? LOCATION_LABELS.anywhere
            : quest.locations.map((location) => LOCATION_LABELS[location]).join(' / ')}
        </Pill>
      </div>

      <div className="active-quest__rewards">
        <div className="reward-block">
          <div className="reward-block__value reward-xp">+{offer.xp}</div>
          <div className="reward-block__label">XP</div>
        </div>
        <div className="reward-block">
          <div className="reward-block__value reward-gold">+{offer.gold}</div>
          <div className="reward-block__label">GULD</div>
        </div>
        <div className="reward-block">
          <div className="reward-block__value reward-dmg">-{offer.bossDamage}</div>
          <div className="reward-block__label">BOSS HP</div>
        </div>
      </div>

      <div className="active-quest__actions">
        <button
          type="button"
          className="btn btn--success btn--lg btn--block"
          onClick={() => {
            play('complete');
            dispatch({ type: 'COMPLETE_QUEST' });
          }}
        >
          SLUTFÖR UPPDRAGET ✨
        </button>

        {confirmAbandon ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn--danger"
              style={{ flex: 1 }}
              onClick={() => {
                play('error');
                dispatch({ type: 'ABANDON_QUEST' });
                setConfirmAbandon(false);
              }}
            >
              JA, ÖVERGE
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ flex: 1 }}
              onClick={() => setConfirmAbandon(false)}
            >
              AVBRYT
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => setConfirmAbandon(true)}
          >
            ÖVERGE
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DailyQuestCard(): JSX.Element | null {
  const { state, dispatch } = useGame();
  const play = useSound();
  const { save } = state;

  const today = toLocalDateKey();
  const questId = save.daily.date === today ? save.daily.questId : null;
  const quest = questId ? getQuestById(questId) : null;
  if (!quest) return null;

  const done = save.daily.completed && save.daily.date === today;
  const offer = buildDailyOffer(today);

  return (
    <section className="section" style={{ marginTop: 20 }}>
      <SectionTitle>DAGENS UPPDRAG</SectionTitle>
      <div className={done ? 'daily daily--done' : 'daily'}>
        <div className="daily__tag">
          {done ? '✓ AVKLARAT IDAG' : '⭐ DAGENS UPPDRAG · BONUSBELÖNING'}
        </div>
        <h3 className="daily__title">{quest.title}</h3>
        <p className="daily__desc">{quest.description}</p>
        <div className="daily__meta">
          <span>
            {CATEGORY_ICONS[quest.category]} {CATEGORY_LABELS[quest.category]}
          </span>
          <span>⏱ {quest.duration} MIN</span>
          <span className="reward-xp">+{Math.round(offer.xp * 1.5)} XP</span>
          <span className="reward-gold">+{Math.round(offer.gold * 1.5)} G</span>
        </div>
        {!done && (
          <button
            type="button"
            className="btn btn--magenta btn--block"
            onClick={() => {
              play('accept');
              dispatch({ type: 'ACCEPT_DAILY' });
            }}
          >
            ANTA DAGENS UPPDRAG
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ChainProgress(): JSX.Element | null {
  const { state } = useGame();
  const chains = getActiveChains(state.save.questChains);
  if (chains.length === 0) return null;

  return (
    <section className="section">
      <SectionTitle>PÅGÅENDE KEDJOR</SectionTitle>
      {chains.map((chain) => (
        <div key={chain.chainId} className="chain-row">
          <span className="chain-row__icon" aria-hidden="true">
            {chain.icon}
          </span>
          <div className="chain-row__body">
            <div className="chain-row__name">{chain.name}</div>
            <div className="chain-pips" aria-label={`${chain.step} av ${chain.total} klara`}>
              {Array.from({ length: chain.total }, (_, index) => (
                <span
                  key={index}
                  className={index < chain.step ? 'chain-pip chain-pip--done' : 'chain-pip'}
                />
              ))}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {chain.step}/{chain.total}
          </span>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function InventoryPanel(): JSX.Element {
  const { state, dispatch } = useGame();
  const play = useSound();
  const items = state.save.inventory.filter((entry) => entry.count > 0);

  return (
    <section className="section">
      <SectionTitle>VÄSKA</SectionTitle>
      {items.length === 0 ? (
        <EmptyState icon="🎒" text="Väskan är tom. Slutför uppdrag för att hitta föremål." />
      ) : (
        <div className="inv-grid">
          {items.map((entry) => {
            const item = LOOT_BY_ID[entry.itemId];
            return (
              <button
                key={entry.itemId}
                type="button"
                className="inv-item"
                disabled={!item.usable}
                title={item.description}
                onClick={() => {
                  if (!item.usable) return;
                  play(item.isChest ? 'loot' : 'click');
                  dispatch({ type: 'USE_ITEM', itemId: entry.itemId });
                }}
              >
                <span className="inv-item__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="inv-item__name">{item.name}</span>
                  <br />
                  <span className="inv-item__count">×{entry.count}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ActiveBuffs />
    </section>
  );
}

function ActiveBuffs(): JSX.Element | null {
  const { state } = useGame();
  const buffs = state.save.buffs;

  const active: string[] = [];
  if (buffs.xpElixir) active.push('🧪 +25% XP');
  if (buffs.luckyCoin) active.push('🪙 Ökad lootchans');
  if (buffs.bossKey) active.push('🗝️ Dubbel bossskada');
  if (buffs.focusRune) active.push('🔮 +15% guld');
  if (buffs.shrineXpBonusQuests > 0)
    active.push(`⛩️ +30% XP (${buffs.shrineXpBonusQuests} kvar)`);

  if (active.length === 0) return null;

  return (
    <div className="notice notice--ok" style={{ marginTop: 10 }}>
      AKTIVA EFFEKTER: {active.join(' · ')}
    </div>
  );
}
