import { useState } from 'react';
import { useGame } from '@/app/GameProvider';
import { PERK_THEME_BLURBS, PERK_THEME_ICONS, PERK_THEME_LABELS } from '@/data/perks';
import { getPerkViews, nextPerkChoice } from '@/game/perks';
import { useSound } from '@/hooks/useSound';
import { Modal } from './Modal';
import { SectionTitle } from './ui';

/**
 * Milestone perk chooser.
 *
 * Appears whenever a reached milestone still owes the player a choice. It is
 * derived from level + selection, so it cannot be missed by dismissing a modal
 * at the wrong moment.
 */
export function PerkChooserModal(): JSX.Element | null {
  const { state, dispatch } = useGame();
  const play = useSound();
  const [selected, setSelected] = useState<string | null>(null);

  const choice = nextPerkChoice(state.save);
  if (!choice) return null;

  return (
    <Modal
      bare
      dismissible={false}
      title={`Välj förmåga för nivå ${choice.level}`}
      footer={
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            play('levelup');
            dispatch({ type: 'SELECT_PERK', perkId: selected });
            setSelected(null);
          }}
        >
          VÄLJ FÖRMÅGA
        </button>
      }
    >
      <div className="perk-chooser">
        <div className="perk-chooser__flash">NIVÅ {choice.level}</div>
        <h2 className="perk-chooser__title">VÄLJ EN FÖRMÅGA</h2>
        <p className="perk-chooser__sub">
          Passiv och permanent. Du väljer en per milstolpe — valet går inte att ångra.
        </p>

        <div className="perk-options">
          {choice.options.map((perk) => (
            <button
              key={perk.id}
              type="button"
              className={
                selected === perk.id
                  ? `perk-option perk-option--${perk.theme} perk-option--selected`
                  : `perk-option perk-option--${perk.theme}`
              }
              aria-pressed={selected === perk.id}
              onClick={() => {
                play('click');
                setSelected(perk.id);
              }}
            >
              <span className="perk-option__theme">
                {PERK_THEME_ICONS[perk.theme]} {PERK_THEME_LABELS[perk.theme]}
              </span>
              <span className="perk-option__icon" aria-hidden="true">
                {perk.icon}
              </span>
              <span className="perk-option__name">{perk.name}</span>
              <span className="perk-option__desc">{perk.description}</span>
              <span className="perk-option__blurb">{PERK_THEME_BLURBS[perk.theme]}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** FÖRMÅGOR - the full list of milestone perks and their state. */
export function PerkPanel(): JSX.Element {
  const { state } = useGame();
  const views = getPerkViews(state.save);
  const owned = views.filter((view) => view.owned);

  const levels = [...new Set(views.map((view) => view.level))].sort((a, b) => a - b);

  return (
    <section className="section">
      <SectionTitle>
        FÖRMÅGOR · {owned.length}/{levels.length}
      </SectionTitle>

      {owned.length === 0 && (
        <p className="notice" style={{ marginBottom: 10 }}>
          Vid nivå 5, 10, 15 och varje femte nivå därefter får du välja en passiv förmåga.
        </p>
      )}

      <div className="perk-list">
        {levels.map((level) => {
          const atLevel = views.filter((view) => view.level === level);
          const chosen = atLevel.find((view) => view.owned);
          const reached = level <= state.save.progression.level;

          return (
            <div
              key={level}
              className={
                chosen
                  ? 'perk-row perk-row--chosen'
                  : reached
                    ? 'perk-row perk-row--open'
                    : 'perk-row perk-row--locked'
              }
            >
              <span className="perk-row__level">NIVÅ {level}</span>
              {chosen ? (
                <span className="perk-row__body">
                  <span className="perk-row__icon" aria-hidden="true">
                    {chosen.icon}
                  </span>
                  <span>
                    <span className="perk-row__name">{chosen.name}</span>
                    <br />
                    <span className="perk-row__desc">{chosen.description}</span>
                  </span>
                </span>
              ) : (
                <span className="perk-row__body perk-row__body--empty">
                  {reached ? 'Väntar på ditt val' : 'Låst'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
