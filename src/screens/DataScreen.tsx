import { useCallback, useMemo, useRef, useState } from 'react';
import type { RogueDaySave, Settings } from '@/types';
import { useGame } from '@/app/GameProvider';
import { QUEST_COUNT } from '@/data/quests';
import { ACHIEVEMENT_COUNT } from '@/data/achievements';
import { BOSSES } from '@/data/bosses';
import { getBossById } from '@/game/boss';
import { DEFAULT_PLAYER_NAME } from '@/persistence/defaults';
import {
  exportSave,
  importSave,
  readDiagnostics,
  resetGame,
  testSaveRoundTrip,
  type SaveTestResult,
} from '@/persistence/storage';
import { formatDateTime } from '@/utils/date';
import { KeyValue, SectionTitle, ToggleRow, formatNumber } from '@/components/ui';
import { Modal } from '@/components/Modal';

export function DataScreen(): JSX.Element {
  const { state, dispatch, saveNow, replaceSave } = useGame();
  const { save } = state;

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [testResult, setTestResult] = useState<SaveTestResult | null>(null);
  const [importPreview, setImportPreview] = useState<RogueDaySave | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [nameDraft, setNameDraft] = useState(save.player.name);

  const fileInput = useRef<HTMLInputElement>(null);

  // Re-read straight from localStorage whenever the save changes, so this
  // panel always reflects what is actually stored rather than in-memory state.
  const diagnostics = useMemo(() => readDiagnostics(), [state.saveTick, diagnosticsOpen]);

  const handleExport = useCallback(() => {
    saveNow();
    const payload = exportSave(save);
    const blob = new Blob([payload.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = payload.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setMessage({ text: `Sparfil nedladdad: ${payload.filename}`, tone: 'ok' });
  }, [save, saveNow]);

  const handleFile = useCallback((file: File) => {
    setImportErrors([]);
    setImportPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = importSave(String(reader.result ?? ''));
      if (!result.ok || !result.save) {
        setImportErrors(result.errors.length > 0 ? result.errors : ['Okänt fel vid inläsning.']);
        return;
      }
      setImportPreview(result.save);
      setImportErrors(result.errors);
    };
    reader.onerror = () => setImportErrors(['Filen kunde inte läsas.']);
    reader.readAsText(file);
  }, []);

  const confirmImport = useCallback(() => {
    if (!importPreview) return;
    replaceSave(importPreview);
    setImportPreview(null);
    setMessage({ text: 'Sparfilen har återställts.', tone: 'ok' });
  }, [importPreview, replaceSave]);

  const handleReset = useCallback(() => {
    const fresh = resetGame();
    replaceSave(fresh);
    setConfirmReset(false);
    setNameDraft(fresh.player.name);
    setMessage({ text: 'Äventyret har nollställts.', tone: 'ok' });
  }, [replaceSave]);

  const updateSetting = useCallback(
    (key: keyof Settings, value: boolean) => {
      dispatch({ type: 'SET_SETTINGS', settings: { [key]: value } as Partial<Settings> });
    },
    [dispatch],
  );

  const bossDefinition = save.boss ? getBossById(save.boss.bossId) : undefined;

  return (
    <>
      {message && (
        <p
          className={message.tone === 'ok' ? 'notice notice--ok' : 'notice notice--bad'}
          style={{ marginBottom: 14 }}
          role="status"
        >
          {message.text}
        </p>
      )}

      {state.saveError && (
        <p className="notice notice--bad" style={{ marginBottom: 14 }} role="alert">
          Sparfel: {state.saveError}
        </p>
      )}

      {state.loadWarnings.length > 0 && (
        <p className="notice notice--warn" style={{ marginBottom: 14 }}>
          {state.loadWarnings.join(' ')}
        </p>
      )}

      {/* --- local save --- */}
      <section className="section">
        <SectionTitle>LOKAL SPARFIL</SectionTitle>
        <div className="panel">
          <div className="panel__body">
            <KeyValue
              label="Status"
              value={diagnostics.hasSave ? 'Sparad lokalt' : 'Inget sparat ännu'}
              tone={diagnostics.hasSave ? 'ok' : undefined}
            />
            <KeyValue
              label="Senast sparad"
              value={
                diagnostics.lastSavedAt ? formatDateTime(diagnostics.lastSavedAt) : 'Aldrig'
              }
            />
            <KeyValue label="Sparversion" value={`v${diagnostics.schemaVersion ?? '-'}`} />
            <KeyValue label="Appversion" value={diagnostics.appVersion ?? '-'} />
            <KeyValue label="Storlek" value={`${formatNumber(diagnostics.bytes)} byte`} />
            <KeyValue label="Antal sparningar" value={formatNumber(diagnostics.saveCount ?? 0)} />
            <KeyValue
              label="Säkerhetskopia"
              value={diagnostics.hasBackup ? `${formatNumber(diagnostics.backupBytes)} byte` : 'Ingen'}
              tone={diagnostics.hasBackup ? 'ok' : undefined}
            />
            <KeyValue
              label="Lagring"
              value={diagnostics.storageAvailable ? 'localStorage tillgängligt' : 'EJ TILLGÄNGLIGT'}
              tone={diagnostics.storageAvailable ? 'ok' : 'bad'}
            />
          </div>
        </div>
      </section>

      {/* --- player summary --- */}
      <section className="section">
        <SectionTitle>SPELARDATA</SectionTitle>
        <div className="panel">
          <div className="panel__body">
            <KeyValue label="Hjälte" value={save.player.name} />
            <KeyValue label="Nivå" value={save.progression.level} />
            <KeyValue label="XP" value={formatNumber(save.progression.totalXp)} />
            <KeyValue label="Guld" value={formatNumber(save.progression.gold)} />
            <KeyValue label="Historikposter" value={save.history.length} />
            <KeyValue
              label="Märken"
              value={`${save.achievements.length} / ${ACHIEVEMENT_COUNT}`}
            />
            <KeyValue label="Bossar besegrade" value={save.bossHistory.length} />
            <KeyValue
              label="Nuvarande boss"
              value={
                bossDefinition && save.boss
                  ? `${bossDefinition.name} · ${formatNumber(save.boss.currentHp)} HP`
                  : '-'
              }
            />
            <KeyValue label="Svit" value={`${save.streak.current} (bäst ${save.streak.longest})`} />
            <KeyValue label="Föremål i väskan" value={save.inventory.length} />
          </div>
        </div>
      </section>

      {/* --- backup / restore --- */}
      <section className="section">
        <SectionTitle>SÄKERHETSKOPIERING</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn btn--primary btn--block" onClick={handleExport}>
            SÄKERHETSKOPIERA SPARFIL
          </button>
          <button
            type="button"
            className="btn btn--block"
            onClick={() => fileInput.current?.click()}
          >
            ÅTERSTÄLL SPARFIL
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Välj sparfil att återställa"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = '';
            }}
          />
          {importErrors.length > 0 && (
            <p className="notice notice--bad" role="alert">
              {importErrors.join(' ')}
            </p>
          )}
        </div>
      </section>

      {/* --- settings --- */}
      <section className="section">
        <SectionTitle>INSTÄLLNINGAR</SectionTitle>
        <div className="panel">
          <div className="panel__body">
            <label className="filter-group__label" htmlFor="hero-name">
              HJÄLTENS NAMN
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input
                id="hero-name"
                className="input"
                value={nameDraft}
                maxLength={24}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder={DEFAULT_PLAYER_NAME}
              />
              <button
                type="button"
                className="btn btn--sm"
                disabled={!nameDraft.trim() || nameDraft === save.player.name}
                onClick={() => {
                  dispatch({ type: 'SET_PLAYER_NAME', name: nameDraft });
                  setMessage({ text: 'Namnet har sparats.', tone: 'ok' });
                }}
              >
                SPARA
              </button>
            </div>

            <ToggleRow
              label="Ljud"
              hint="Genererade toner i webbläsaren. Inga ljudfiler laddas ner."
              checked={save.settings.sound}
              onChange={(value) => updateSetting('sound', value)}
            />
            <ToggleRow
              label="Animationer"
              hint="Stäng av för en helt stillsam upplevelse."
              checked={save.settings.animations}
              onChange={(value) => {
                updateSetting('animations', value);
                if (!value) updateSetting('reducedMotion', true);
              }}
            />
            <ToggleRow
              label="Reducerad rörelse"
              hint="Följer systemets inställning som standard."
              checked={save.settings.reducedMotion}
              onChange={(value) => updateSetting('reducedMotion', value)}
            />
            <ToggleRow
              label="Hög kontrast"
              hint="Tydligare kanter och ljusare text."
              checked={save.settings.highContrast}
              onChange={(value) => updateSetting('highContrast', value)}
            />
          </div>
        </div>
      </section>

      {/* --- diagnostics --- */}
      <section className="section">
        <div className="panel">
          <button
            type="button"
            className="panel__header"
            style={{ width: '100%', textAlign: 'left' }}
            aria-expanded={diagnosticsOpen}
            aria-controls="diagnostics-body"
            onClick={() => setDiagnosticsOpen((open) => !open)}
          >
            <span className="panel__heading">SPARNINGSDIAGNOSTIK</span>
            <span aria-hidden="true">{diagnosticsOpen ? '▾' : '▸'}</span>
          </button>

          {diagnosticsOpen && (
            <div className="panel__body" id="diagnostics-body">
              <KeyValue label="Lagring" value="localStorage" />
              <KeyValue label="Nyckel" value={diagnostics.key} />
              <KeyValue label="Backupnyckel" value={diagnostics.backupKey} />
              <KeyValue label="Sparversion" value={diagnostics.schemaVersion ?? '-'} />
              <KeyValue
                label="Senaste skrivning"
                value={diagnostics.lastSavedAt ? formatDateTime(diagnostics.lastSavedAt) : '-'}
              />
              <KeyValue label="Sparade byte" value={formatNumber(diagnostics.bytes)} />
              <KeyValue
                label="XP i sparfilen"
                value={formatNumber(diagnostics.storedTotalXp ?? 0)}
              />
              <KeyValue label="Nivå i sparfilen" value={diagnostics.storedLevel ?? '-'} />
              <KeyValue label="Historikposter i sparfilen" value={diagnostics.storedHistoryCount ?? 0} />
              <KeyValue label="Märken i sparfilen" value={diagnostics.storedAchievementCount ?? 0} />
              <KeyValue
                label="Boss-HP i sparfilen"
                value={diagnostics.storedBossHp !== null ? formatNumber(diagnostics.storedBossHp) : '-'}
              />
              {diagnostics.parseError && (
                <KeyValue label="Tolkningsfel" value={diagnostics.parseError} tone="bad" />
              )}

              <button
                type="button"
                className="btn btn--block"
                style={{ marginTop: 12 }}
                onClick={() => setTestResult(testSaveRoundTrip(save))}
              >
                TESTA SPARNING
              </button>

              {testResult && (
                <div style={{ marginTop: 10 }}>
                  <p
                    className={testResult.passed ? 'notice notice--ok' : 'notice notice--bad'}
                    role="status"
                  >
                    {testResult.message}
                  </p>
                  {testResult.checks.map((check) => (
                    <KeyValue
                      key={check.label}
                      label={check.label}
                      value={check.ok ? check.actual : `${check.actual} (väntat ${check.expected})`}
                      tone={check.ok ? 'ok' : 'bad'}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* --- content info --- */}
      <section className="section">
        <SectionTitle>OM SPELET</SectionTitle>
        <div className="panel">
          <div className="panel__body">
            <KeyValue label="Uppdrag i biblioteket" value={QUEST_COUNT} />
            <KeyValue label="Bossar" value={BOSSES.length} />
            <KeyValue label="Märken" value={ACHIEVEMENT_COUNT} />
            <KeyValue label="Nätverk" value="Krävs aldrig" tone="ok" />
            <KeyValue label="Konto" value="Behövs inte" tone="ok" />
            <KeyValue label="Data" value="Endast på din enhet" tone="ok" />
          </div>
        </div>
      </section>

      {/* --- reset --- */}
      <section className="section">
        <SectionTitle>FARLIG ZON</SectionTitle>
        <button
          type="button"
          className="btn btn--danger btn--block"
          onClick={() => setConfirmReset(true)}
        >
          NOLLSTÄLL ÄVENTYRET
        </button>
        <p className="notice" style={{ marginTop: 8 }}>
          Detta raderar sparfilen och säkerhetskopian permanent. Ladda ner en säkerhetskopia först
          om du vill kunna komma tillbaka.
        </p>
      </section>

      {/* --- modals --- */}
      {importPreview && (
        <Modal
          title="ÅTERSTÄLL SPARFIL"
          onClose={() => setImportPreview(null)}
          footer={
            <>
              <button type="button" className="btn btn--danger btn--block" onClick={confirmImport}>
                ERSÄTT MITT ÄVENTYR
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => setImportPreview(null)}
              >
                AVBRYT
              </button>
            </>
          }
        >
          <p className="notice notice--warn" style={{ marginBottom: 14 }}>
            Detta ersätter all nuvarande progression. Det går inte att ångra.
          </p>
          <div className="panel panel--inset">
            <div className="panel__body">
              <KeyValue label="Hjälte" value={importPreview.player.name} />
              <KeyValue label="Nivå" value={importPreview.progression.level} />
              <KeyValue label="XP" value={formatNumber(importPreview.progression.totalXp)} />
              <KeyValue label="Guld" value={formatNumber(importPreview.progression.gold)} />
              <KeyValue label="Historikposter" value={importPreview.history.length} />
              <KeyValue label="Märken" value={importPreview.achievements.length} />
              <KeyValue label="Bossar besegrade" value={importPreview.bossHistory.length} />
              <KeyValue label="Sparversion" value={importPreview.schemaVersion} />
            </div>
          </div>
          {importErrors.length > 0 && (
            <p className="notice notice--warn" style={{ marginTop: 12 }}>
              {importErrors.join(' ')}
            </p>
          )}
        </Modal>
      )}

      {confirmReset && (
        <Modal
          title="ÄR DU HELT SÄKER?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button type="button" className="btn btn--danger btn--block" onClick={handleReset}>
                JA, RADERA ALLT
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => setConfirmReset(false)}
              >
                AVBRYT
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Du är på väg att radera hela ditt äventyr: nivå {save.progression.level},{' '}
            {save.history.length} historikposter, {save.achievements.length} märken och{' '}
            {save.bossHistory.length} besegrade bossar.
          </p>
          <p className="notice notice--bad">Både sparfilen och säkerhetskopian raderas.</p>
        </Modal>
      )}
    </>
  );
}
