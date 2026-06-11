import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6';
import { ConversationLogProvider } from './components/conversation_log/ConversationLogContext.js';
import { CharacterOverviewProvider } from './components/character_overview/CharacterOverviewContext.js';
import { SettingsModalProvider } from './components/settings/SettingsModalContext.js';
import { MapModalProvider } from './components/MapModalContext.js';
import {
  GlobalCharacterEditorProvider,
  GlobalCharacterEditorModal,
} from './components/character_editor_modal/GlobalCharacterEditorContext.js';
import { useApplyTheme } from './hooks/Theme.js';
import { useDeepLinkNavigation } from './hooks/useDeepLinkNavigation.js';
import CharacterOverview from './components/character_overview/CharacterOverview.js';
import ConversationLog from './components/conversation_log/ConversationLog.js';
import InteractiveRetryPopoverHost from './components/InteractiveRetryPopoverHost';
import SettingsPanel from './components/settings/SettingsPanel.js';
import MapModal from './components/MapModal.js';
import MainMenu from './pages/MainMenu';
import CharacterList from './pages/CharacterList';
import ScenarioSetup from './pages/ScenarioSetup';
import ScenarioView from './pages/ScenarioView';
import MapList from './pages/MapList';
import MapEditor from './pages/MapEditor';
import { QueryParamProvider } from 'use-query-params';
import './styles.css';

function AppRoutes() {
  const { themeSvg } = useApplyTheme();
  useDeepLinkNavigation();

  return (
    <>
      <div className="fixed weather-svg-container">{themeSvg}</div>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/characters" element={<CharacterList />} />
        <Route path="/scenario/new" element={<ScenarioSetup />} />
        <Route path="/scenario/:scenarioId/*" element={<ScenarioView />} />
        <Route path="/maps" element={<MapList />} />
        <Route path="/maps/new/*" element={<MapEditor />} />
        <Route path="/maps/:id/*" element={<MapEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SettingsPanel />
      <MapModal />
      <GlobalCharacterEditorModal />
      <ConversationLog />
      <CharacterOverview />
      <InteractiveRetryPopoverHost />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryParamProvider adapter={ReactRouter6Adapter}>
        <SettingsModalProvider>
          <MapModalProvider>
            <GlobalCharacterEditorProvider>
              <ConversationLogProvider>
                <CharacterOverviewProvider>
                  <AppRoutes />
                </CharacterOverviewProvider>
              </ConversationLogProvider>
            </GlobalCharacterEditorProvider>
          </MapModalProvider>
        </SettingsModalProvider>
      </QueryParamProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
