import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import MainMenuFtueModal from '../components/MainMenuFtueModal.js';
import YozakuraLogo from '../theme/yozakura_logo.js';
import { useSettingsStore } from '../state/settings_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import type { ScenarioSummary } from '../engine/types.js';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function MainMenu() {
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();
  const [scenarioPendingDelete, setScenarioPendingDelete] = useState<ScenarioSummary | undefined>(undefined);
  const scenarioSummaries = useScenarioStore((s) => s.scenarioSummaries);
  const scenarioSummariesAreLoaded = useScenarioStore((s) => s.scenarioSummariesAreLoaded);
  const mainMenuFtueSeen = useSettingsStore((s) => s.mainMenuFtueSeen);

  const sortedScenarioSummaries = useMemo(() => {
    return scenarioSummaries.concat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [scenarioSummaries]);

  const removeScenario = async (summary: ScenarioSummary) => {
    setScenarioPendingDelete(undefined);

    useScenarioStore.getState().deleteInactiveScenario(summary.scenario.id);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <MainMenuFtueModal />

      {mainMenuFtueSeen && (
        <>
          <YozakuraLogo className="mx-auto w-96" size={360} />

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Load</h2>

            {!scenarioSummariesAreLoaded && <div className="text-sm text-secondary">Loading...</div>}

            {scenarioSummariesAreLoaded && scenarioSummaries.length === 0 && (
              <div className="text-sm text-secondary">No saved scenarios yet.</div>
            )}

            <div className="space-y-3">
              {sortedScenarioSummaries.map((summary) => (
                <div key={summary.scenario.id} className="relative">
                  <button
                    type="button"
                    className="w-full text-left rounded-sm border px-4 py-3 pr-12 hover:bg-surface-hover disabled:opacity-70"
                    onClick={() => navigate(`/scenario/${summary.scenario.id}`)}
                  >
                    <div className="text-sm text-secondary-strong mb-2">
                      User: {summary.userCharacterName}
                    </div>
                    <div className="text-sm text-secondary-strong mb-2">Map: {summary.mapName}</div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-secondary">
                        Updated: {formatDateTime(summary.updatedAt)}
                      </div>
                    </div>
                    <div className="text-xs text-secondary mt-1">
                      Created: {formatDateTime(summary.createdAt)}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="absolute bottom-3 right-3 text-sm leading-none px-1"
                    onClick={(event) => {
                      event.stopPropagation();
                      setScenarioPendingDelete(summary);
                    }}
                    aria-label={`Delete scenario ${summary.scenario.id}`}
                    title="Delete scenario"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <button type="button" className="w-full" onClick={() => navigate('/scenario/new')}>
              Start New Scenario
            </button>

            <button type="button" className="w-full" onClick={() => navigate('/characters')}>
              Manage Characters
            </button>
            <button type="button" className="w-full" onClick={() => navigate('/maps')}>
              Manage Maps
            </button>
          </section>

          <div>
            <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
              ⚙
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(scenarioPendingDelete)}
        onClose={() => setScenarioPendingDelete(undefined)}
        title="Delete Scenario"
        message="Delete scenario? This will permanently remove scenario data, conversations, and image files."
        confirmLabel="Delete Scenario"
        onConfirm={() => {
          if (!scenarioPendingDelete) {
            return;
          }

          void removeScenario(scenarioPendingDelete);
        }}
      />
    </div>
  );
}
