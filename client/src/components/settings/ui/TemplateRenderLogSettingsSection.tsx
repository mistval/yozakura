import { useTemplateRenderLogStore } from '../../../state/template_render_log_store.js';

export default function TemplateRenderLogSettingsSection() {
  const entries = useTemplateRenderLogStore((state) => state.entries);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Template Render Log</h2>
        <p className="text-sm text-secondary">The most recent 100 render group executions.</p>
      </div>

      <div className="bordered-section">
        {entries.length === 0 ? (
          <p className="text-sm text-secondary">No template render log entries yet.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.completionRequestId} className="rounded-sm border p-3 space-y-3 bg-inset">
                <div className="text-xs text-muted">
                  Entry #{entry.completionRequestId} - {entry.createdAt}
                </div>

                {entry.promptChain && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Template Group Name</p>
                    <pre className="max-h-32 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                      {entry.promptChain.name}
                    </pre>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Rendered Templates</p>
                  {entry.templates.length === 0 ? (
                    <p className="text-sm text-secondary">
                      No template renders were recorded for this request.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {entry.templates.map((template, templateIndex) => (
                        <div
                          key={`${entry.completionRequestId}-${template.templateId}-${templateIndex}`}
                          className="rounded-sm border p-2 space-y-2"
                        >
                          <div className="text-xs text-muted">{template.templateName}</div>
                          <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                            {template.renderedOutput}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {entry.completions && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Raw Response (Pre-parser)</p>
                    <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                      {entry.completions.rawResponse}
                    </pre>
                  </div>
                )}

                {entry.parser && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Parsed Response</p>
                    <pre className="max-h-72 overflow-auto rounded-sm border p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                      {typeof entry.parser?.parsedResponse === 'string'
                        ? entry.parser.parsedResponse
                        : JSON.stringify(entry.parser?.parsedResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
