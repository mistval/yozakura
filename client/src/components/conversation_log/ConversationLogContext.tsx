import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import { NumberParam, StringParam, useQueryParams } from 'use-query-params';
import { FlagParam } from '../../hooks/useModalQueryParam.js';

type ShowConversationLogParams = {
  conversationId?: string;
  page?: number;
};

type ConversationLogContextType = {
  launchParams: ShowConversationLogParams | undefined;
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
  clearConversationLogParams: () => void;
};

const ConversationLogContext = createContext<ConversationLogContextType | undefined>(undefined);

function sanitizePage(page?: number | undefined) {
  if (!page) return 1;
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(page)));
}

export function ConversationLogProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams({
    conversationlog: FlagParam,
    cl_conversation: StringParam,
    cl_page: NumberParam,
  });

  const [launchParams, setLaunchParams] = useState<ShowConversationLogParams | undefined>(undefined);

  const open = params.conversationlog ?? false;
  const routeConversationId = params.cl_conversation ?? undefined;
  const routePage = sanitizePage(params.cl_page ?? undefined);
  const showBackButton = Boolean(routeConversationId);

  const showConversationLog = (incoming?: ShowConversationLogParams) => {
    const next = incoming || {};
    setLaunchParams(next);
    setParams({
      conversationlog: true,
      cl_conversation: next.conversationId ?? undefined,
      cl_page: next.page ? sanitizePage(next.page) : sanitizePage(routePage),
    });
  };

  const clearConversationLogParams = () => {
    setLaunchParams(undefined);
  };

  const closeConversationLog = () => {
    setLaunchParams(undefined);
    setParams({
      conversationlog: undefined as unknown as boolean,
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
      launchParams,
      showConversationLog,
      clearConversationLogParams,
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
    [launchParams, open, routeConversationId, routePage, showBackButton]
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
