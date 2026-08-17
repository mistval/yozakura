import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useQueryParams } from '../../util/queryParams.js';

type ShowConversationLogParams = {
  conversationId?: string;
  page?: number;
};

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
  const [params, setParams] = useQueryParams();

  const open = params.has('conversationlog') && params.get('conversationlog') !== 'false';
  const routeConversationId = params.get('cl_conversation') ?? undefined;
  const rawPage = params.get('cl_page');
  const routePage = sanitizePage(rawPage ? Number(rawPage) : undefined);
  const showBackButton = Boolean(routeConversationId);

  const showConversationLog = (incoming?: ShowConversationLogParams) => {
    const next = incoming || {};
    setParams({
      conversationlog: true,
      cl_conversation: next.conversationId ?? undefined,
      cl_page: next.page ? sanitizePage(next.page) : sanitizePage(routePage),
    });
  };

  const closeConversationLog = () => {
    setParams({
      conversationlog: undefined,
      cl_conversation: undefined,
      cl_page: undefined,
    });
  };

  const backToConversationLog = () => {
    setParams({ cl_conversation: undefined, cl_page: routePage });
  };

  const setConversationLogPage = (page: number) => {
    setParams({ cl_page: sanitizePage(page) });
  };

  const openConversationDetail = (entryId: string) => {
    setParams({ cl_conversation: entryId });
  };

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
    [open, routeConversationId, routePage, showBackButton]
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
