import { usePromptLogStore } from '../../state/prompt_log_store.js';

export default function PromptLogSettingsSection() {
  const promptLogEntries = usePromptLogStore((state) => state.entries);
  const clearPromptLog = usePromptLogStore((state) => state.clear);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Prompt Log</h2>
        <p className="text-sm text-secondary">
          Showing the most recent 100 prompt payloads and raw responses. This log is in-memory only and is
          cleared when the app closes.
        </p>
      </div>

      <div className="bordered-section">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-secondary">Entries: {promptLogEntries.length}</p>
          <button
            type="button"
            onClick={clearPromptLog}
            disabled={promptLogEntries.length === 0}
            className="px-3 py-1 border rounded-sm disabled:opacity-50"
          >
            Clear Log
          </button>
        </div>

        {promptLogEntries.length === 0 ? (
          <p className="text-sm text-secondary">No prompt log entries yet.</p>
        ) : (
          <div className="space-y-4">
            {promptLogEntries.map((entry) => (
              <div key={entry.id} className="rounded-sm border p-3 space-y-3 bg-inset">
                <div className="text-xs text-muted">{entry.createdAt}</div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Payload</p>
                  <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                    {entry.payloadJson}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Transport Options (authToken hidden)</p>
                  <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                    {entry.transportOptionsJson}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Raw Response (Pre-parser)</p>
                  <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                    {entry.responseJson}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
