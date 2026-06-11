import ConversationLogView from './ConversationLogView';
import * as Database from '../../backend_bridge/database';
import { useEffect, useRef, useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import type { StoredConversation } from '../../engine/types.js';
import RoutedModalFrame from '../ui/RoutedModalFrame';
import { useConversationLog } from './ConversationLogContext.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import ConversationSearchList from './ConversationSearchList.js';
import { useSettingsStore, type ChatPaneWidth } from '../../state/settings_store.js';

const CONVERSATION_LOG_WIDTH_CLASS_BY_SETTING: Record<ChatPaneWidth, string> = {
  narrow: 'max-w-4xl',
  medium: 'max-w-5xl',
  wide: 'max-w-6xl',
  extra_wide: 'max-w-7xl',
  unconstrained: 'max-w-conversation-log-unconstrained',
};

export default function ConversationLog() {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const conversationLogWidth = useSettingsStore((s) => s.conversationLogWidth);
  const {
    open,
    routePage,
    closeConversationLog,
    routeConversationId,
    showBackButton,
    backToConversationLog,
    setConversationLogPage,
    openConversationDetail,
    notFoundMessage,
  } = useConversationLog();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<StoredConversation | undefined>(undefined);
  const [loadingSelectedEntry, setLoadingSelectedEntry] = useStateRef(false);
  const listScrollTopRef = useRef(0);
  const wasShowingDetailRef = useRef(false);

  useEffect(() => {
    if (!open || !scenario || !routeConversationId) {
      setSelectedEntry(undefined);
      setLoadingSelectedEntry(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingSelectedEntry(true);
      try {
        const loaded = await Database.doAsDataRead(
          () => Database.loadConversationById(routeConversationId),
          'conversation',
          { debouncerKey: routeConversationId }
        );

        if (cancelled) return;
        setSelectedEntry(loaded);
      } finally {
        if (!cancelled) setLoadingSelectedEntry(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, routeConversationId, scenario?.id]);

  useEffect(() => {
    if (!open) return;

    if (routeConversationId) {
      wasShowingDetailRef.current = true;
      contentRef.current?.scrollTo({ top: 0 });
      return;
    }

    if (wasShowingDetailRef.current) {
      contentRef.current?.scrollTo({ top: listScrollTopRef.current });
      wasShowingDetailRef.current = false;
      return;
    }

    contentRef.current?.scrollTo({ top: 0 });
  }, [open, routeConversationId]);

  const selectedConversationMissing = Boolean(routeConversationId) && !selectedEntry && !loadingSelectedEntry;
  const showDetail = Boolean(routeConversationId);

  const maxWidthClassName = showDetail
    ? CONVERSATION_LOG_WIDTH_CLASS_BY_SETTING[conversationLogWidth]
    : 'max-w-5xl';

  return (
    <RoutedModalFrame
      queryParam="conversationlog"
      onClose={closeConversationLog}
      showBack={showBackButton}
      contentRef={contentRef}
      maxWidthClassName={maxWidthClassName}
      {...(showBackButton ? { onBack: backToConversationLog } : {})}
    >
      <>
        {!showDetail && <h2 className="text-xl font-semibold">Conversation Log</h2>}
        <ConversationSearchList
          open={!showDetail}
          scenarioId={scenario?.id ?? ''}
          participantIds={[]}
          showHeading={false}
          controlledPage={routePage}
          onControlledPageChange={setConversationLogPage}
          onSelectConversation={(entryId) => {
            listScrollTopRef.current = contentRef.current?.scrollTop ?? 0;
            openConversationDetail(entryId);
          }}
        />
      </>
      {showDetail && (
        <>
          {loadingSelectedEntry && <div className="text-sm text-secondary">Loading conversation...</div>}
          {selectedConversationMissing && (
            <div className="rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
              {notFoundMessage || 'Conversation not found.'}
            </div>
          )}
          {selectedEntry && scenario && (
            <ConversationLogView userId={scenario.userCharacterId} selectedEntry={selectedEntry} />
          )}
        </>
      )}
    </RoutedModalFrame>
  );
}
