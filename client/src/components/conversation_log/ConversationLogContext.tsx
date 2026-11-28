import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';

type ShowConversationLogParams = {
  conversationId?: string;
  page?: number;
};

const CONVERSATION_LOG_OWNED_KEYS = ['cl_conversation', 'cl_page', 'cl_participants'] as const;

type ConversationLogContextType = {
  open: boolean;
  routePage: number;
  routeConversationId: string | undefined;
  showBackButton: boolean;
  notFoundMessage?: string | undefined;
  closeConversationLog: () => void;
  backToConversationLog: () => void;
  setConversationLogPage: (page: number) => void;
  openConversationDetail: (entryId: string) => void;
  showConversationLog: (params?: ShowConversationLogParams) => void;
};

const ConversationLogContext = createContext<ConversationLogContextType | undefined>(undefined);

function sanitizePage(page?: number | undefined) {
  if (!page) return 1;
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(page)));
}

export function ConversationLogProvider({ children }: { children: ReactNode }) {
  const { open, pushModal, closeModal, updateModalParams, layerParams } = useModalQueryParam(
    'conversationlog',
    CONVERSATION_LOG_OWNED_KEYS
  );

  const routeConversationId = layerParams.get('cl_conversation') ?? undefined;
  const rawPage = layerParams.get('cl_page');
  const routePage = sanitizePage(rawPage ? Number(rawPage) : undefined);
  const showBackButton = Boolean(routeConversationId);

  const showConversationLog = useCallback(
    (incoming?: ShowConversationLogParams) => {
      const next = incoming || {};
      pushModal({
        cl_conversation: next.conversationId ?? undefined,
        cl_page: next.page ? sanitizePage(next.page) : 1,
      });
    },
    [pushModal]
  );

  const closeConversationLog = closeModal;

  const backToConversationLog = useCallback(() => {
    updateModalParams({ cl_conversation: undefined, cl_page: routePage, cl_participants: undefined });
  }, [updateModalParams, routePage]);

  const setConversationLogPage = useCallback(
    (page: number) => {
      updateModalParams({ cl_page: sanitizePage(page) });
    },
    [updateModalParams]
  );

  const openConversationDetail = useCallback(
    (entryId: string) => {
      updateModalParams({ cl_conversation: entryId });
    },
    [updateModalParams]
  );

  const value = useMemo(
    () => ({
      showConversationLog,
      open,
      routePage,
      routeConversationId,
      showBackButton,
      notFoundMessage: routeConversationId ? 'Conversation not found.' : undefined,
      closeConversationLog,
      backToConversationLog,
      setConversationLogPage,
      openConversationDetail,
    }),
    [
      open,
      routeConversationId,
      routePage,
      showBackButton,
      showConversationLog,
      closeConversationLog,
      backToConversationLog,
      setConversationLogPage,
      openConversationDetail,
    ]
  );

  return <ConversationLogContext.Provider value={value}>{children}</ConversationLogContext.Provider>;
}

export function useConversationLog() {
  const context = useContext(ConversationLogContext);
  if (!context) {
    throw new Error('useConversationLog must be used inside ConversationLogProvider');
  }
  return context;
}
