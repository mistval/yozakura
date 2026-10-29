import { useState } from 'react';
import Modal from '../ui/Modal.js';
import Tabs, { type TabDefinition } from '../ui/Tabs.js';
import DataExportComponent from './DataExportComponent.js';

type ImportExportModalProps = {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'export' | 'import';
};

export default function ImportExportModal({ open, onClose, defaultTab = 'export' }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const tabs: TabDefinition[] = [
    { id: 'export', label: 'Export Data' },
    { id: 'import', label: 'Import Data' },
  ];

  return (
    <Modal open={open} onClose={onClose} className="flex items-center justify-center p-4" zIndex={60}>
      <div className="bg-emphasized rounded-sm border border-border-default p-6 w-full max-w-3xl max-h-[90vh] flex flex-col space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <h2 className="text-xl font-semibold text-primary">Import / Export Data</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-primary text-lg cursor-pointer px-2"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} className="flex-1 overflow-y-auto">
          {activeTab === 'export' && <DataExportComponent />}
          {activeTab === 'import' && (
            <div className="p-8 text-center text-secondary space-y-2">
              <div className="text-base font-medium text-primary">Import Archive</div>
              <p className="text-sm">Import staging and archive inspection will be enabled in Phase 2.</p>
            </div>
          )}
        </Tabs>
      </div>
    </Modal>
  );
}
