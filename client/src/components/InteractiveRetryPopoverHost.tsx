import { useEffect, useMemo, useState } from 'react';
import {
  useInteractiveRetryStore,
  type InteractiveRetryAction,
  type InteractiveRetryCard,
} from '../state/interactive_retry_store.js';
import { DEFAULT_RETRY_DELAY_MS } from '../engine/interative_retry.js';

function formatRetryCountdown(card: InteractiveRetryCard, nowMs: number): string {
  if (card.status === 'retrying') {
    return 'Retrying...';
  }

  if (card.mode !== 'retry_enabled' || typeof card.retryAt !== 'number') {
    return 'Operation failed';
  }

  const remainingMs = Math.max(0, card.retryAt - nowMs);
  if (remainingMs > (card.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)) {
    return 'Retrying...';
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const secondsLabel = remainingSeconds === 1 ? 'second' : 'seconds';
  return `Retrying in ${remainingSeconds} ${secondsLabel}...`;
}

function RetryCard({
  card,
  nowMs,
  onAction,
}: {
  card: InteractiveRetryCard;
  nowMs: number;
  onAction: (id: number, action: InteractiveRetryAction) => void;
}) {
  const isRetrying = card.status === 'retrying';

  return (
    <div className="w-120 max-w-[calc(100vw-2rem)] rounded-sm border border-border-strong bg-inset p-3 shadow-md">
      <div className="space-y-2">
        <div className="text-sm font-semibold text-primary">
          {card.operationType} (Attempt {card.attempt})
        </div>
        <div className="text-sm text-secondary-strong">{formatRetryCountdown(card, nowMs)}</div>
        <div className="rounded-sm border border-danger-border bg-danger-bg px-2 py-1 text-sm text-danger-text wrap-break-word">
          {card.errorMessage || 'Unknown error'}
        </div>

        {card.hint && (
          <div className="rounded-sm border border-warning-border bg-warning-bg px-2 py-1 text-sm text-warning-text">
            {card.hint}
          </div>
        )}

        <details className="rounded-sm border border-border-default bg-surface-subtle px-2 py-1 text-xs text-secondary-strong">
          <summary className="cursor-pointer select-none font-medium">Error details</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-[11px] leading-4">
            {card.errorStack || card.errorMessage}
          </pre>
        </details>

        {card.mode === 'retry_enabled' ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onAction(card.id, 'retry_now')}
              disabled={isRetrying}
              className="rounded-sm border border-border-strong px-2 py-1 text-sm hover:bg-surface-hover-soft dark:border-border-muted"
            >
              Retry Now
            </button>
            <button
              type="button"
              onClick={() => onAction(card.id, 'cancel')}
              disabled={isRetrying}
              className="rounded-sm border border-danger-border-strong bg-danger-solid px-2 py-1 text-sm text-on-accent hover:bg-danger-solid"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onAction(card.id, 'confirm')}
              className="rounded-sm border border-border-strong px-2 py-1 text-sm hover:bg-surface-hover-soft dark:border-border-muted"
            >
              Okay
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InteractiveRetryPopoverHost() {
  const operationsById = useInteractiveRetryStore((state) => state.operationsById);
  const orderedIds = useInteractiveRetryStore((state) => state.orderedIds);
  const dispatchAction = useInteractiveRetryStore((state) => state.dispatchAction);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const cards = useMemo(
    () =>
      orderedIds
        .map((id) => operationsById[id])
        .filter((card): card is InteractiveRetryCard => Boolean(card)),
    [orderedIds, operationsById]
  );

  const hasCountdown = cards.some(
    (card) =>
      card.mode === 'retry_enabled' && card.status === 'waiting_for_retry' && typeof card.retryAt === 'number'
  );

  useEffect(() => {
    if (!hasCountdown) {
      return;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => {
      clearInterval(intervalId);
    };
  }, [hasCountdown]);

  if (cards.length === 0) {
    return undefined;
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-10000 flex max-h-[calc(100vh-1.5rem)] flex-col gap-2 overflow-y-auto">
      {cards.map((card) => (
        <div key={card.id} className="pointer-events-auto">
          <RetryCard card={card} nowMs={nowMs} onAction={dispatchAction} />
        </div>
      ))}
    </div>
  );
}
