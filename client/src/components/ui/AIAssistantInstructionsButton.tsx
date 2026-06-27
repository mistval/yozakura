import { useState } from 'react';
import Modal from './Modal.js';

export default function AIAssistantInstructionsButton({
  getDocumentation,
  instructions,
  title,
  isDirty,
  fileNameBase,
}: {
  title: string;
  isDirty: boolean;
  fileNameBase: string;
  instructions: string;
  getDocumentation: () => string;
}) {
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [documentation, setDocumentation] = useState('');

  return (
    <>
      <header className="space-y-1 flex flex-col gap-2">
        <div className="flex  items-start justify-between gap-3">
          <button
            type="button"
            className="px-3 py-1 border rounded-sm w-full h-12 button-emphasized"
            onClick={() => {
              const documentation = getDocumentation();
              setDocumentation(documentation);
              setDocumentationOpen(true);
            }}
          >
            🤖 AI Assistant Instructions 🗒️
          </button>
        </div>
      </header>

      <Modal
        open={documentationOpen}
        onClose={() => setDocumentationOpen(false)}
        className="flex items-center justify-center p-4"
      >
        <div className="bg-emphasized rounded-sm p-4 w-full max-w-4xl space-y-3">
          <header className="space-y-2">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-secondary">{instructions}</p>
          </header>

          {isDirty && (
            <div className="rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
              You have unsaved changes. The below instructions document does not include your unsaved changes.
              Please save your changes if you would like your AI assistant to have access to your unsaved
              changes.
            </div>
          )}

          <textarea
            rows={20}
            readOnly
            value={documentation}
            spellCheck={false}
            className="rounded-input font-mono text-xs w-full"
          />

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              className="px-3 py-1 border rounded-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(documentation);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="px-3 py-1 border rounded-sm"
              onClick={() => {
                const blob = new Blob([documentation], { type: 'text/markdown;charset=utf-8' });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${fileNameBase}.md`;
                link.click();
                URL.revokeObjectURL(downloadUrl);
              }}
            >
              Download
            </button>
            <button
              type="button"
              className="px-3 py-1 border rounded-sm"
              onClick={() => setDocumentationOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
