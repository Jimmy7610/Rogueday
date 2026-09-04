import { useEffect, useState } from 'react';
import { useGame } from '@/app/GameProvider';
import { DEFAULT_PLAYER_NAME } from '@/persistence/defaults';

const LINES = [
  'Vardagen har invaderats.',
  'Diskberg. Inkorgar. Ärenden. Prokrastinering.',
  'Det är dags att slå tillbaka.',
];

const LINE_DURATION = 2400;

/**
 * Short cinematic intro, then the name prompt. Skippable at any point, and the
 * fact that it has been seen is persisted with the rest of the save.
 */
export function Onboarding(): JSX.Element {
  const { dispatch } = useGame();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(DEFAULT_PLAYER_NAME);

  const naming = step >= LINES.length;

  useEffect(() => {
    if (naming) return;
    const id = window.setTimeout(() => setStep((current) => current + 1), LINE_DURATION);
    return () => window.clearTimeout(id);
  }, [step, naming]);

  const finish = (): void => {
    dispatch({ type: 'COMPLETE_ONBOARDING', name: name.trim() || DEFAULT_PLAYER_NAME });
  };

  if (naming) {
    return (
      <div className="intro">
        <div className="intro__brand">ROGUEDAY</div>
        <div className="intro__tagline">OFFLINE RPG</div>

        <form
          className="intro__form"
          onSubmit={(event) => {
            event.preventDefault();
            finish();
          }}
        >
          <label className="filter-group__label" htmlFor="intro-name">
            VAD HETER DIN HJÄLTE?
          </label>
          <input
            id="intro-name"
            className="input"
            value={name}
            maxLength={24}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder={DEFAULT_PLAYER_NAME}
          />
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            style={{ marginTop: 14 }}
          >
            GÅ IN I ROGUEDAY
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12, textAlign: 'center' }}>
            Allt sparas lokalt på din enhet. Inget konto, ingen server.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div
      className="intro"
      onClick={() => setStep((current) => current + 1)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setStep((current) => current + 1);
      }}
      aria-label="Tryck för att gå vidare"
    >
      <button
        type="button"
        className="btn btn--ghost btn--sm intro__skip"
        onClick={(event) => {
          event.stopPropagation();
          setStep(LINES.length);
        }}
      >
        HOPPA ÖVER
      </button>

      <p className="intro__line" key={step}>
        {LINES[step]}
      </p>

      <div className="intro__dots" aria-hidden="true">
        {LINES.map((_, index) => (
          <span
            key={index}
            className={index === step ? 'intro__dot intro__dot--active' : 'intro__dot'}
          />
        ))}
      </div>
    </div>
  );
}
