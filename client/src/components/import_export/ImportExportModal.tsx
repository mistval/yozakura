import { useState } from 'react';
import Modal from '../ui/Modal.js';
import Tabs, { type TabDefinition } from '../ui/Tabs.js';
import DataExportComponent from './DataExportComponent.js';
import DataImportComponent from './DataImportComponent.js';

type ImportExportModalProps = {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'export' | 'import';
};

export default function ImportExportModal({ open, onClose, defaultTab = 'export' }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const isBusy = isExporting || isImporting;

  const tabs: TabDefinition[] = [
    { id: 'export', label: 'Export Data' },
    { id: 'import', label: 'Import Data' },
  ];

  const handleClose = () => {
    if (!isBusy) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnBackdropClick={!isBusy}
      className="flex items-center justify-center p-4"
      zIndex={60}
    >
      <div className="bg-emphasized rounded-sm border border-border-default p-6 w-full max-w-3xl max-h-[90vh] flex flex-col space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <h2 className="text-xl font-semibold text-primary">Import / Export Data</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className={`text-lg px-2 transition-colors ${
              isBusy
                ? 'opacity-30 cursor-not-allowed text-muted'
                : 'text-secondary hover:text-primary cursor-pointer'
            }`}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => {
            if (!isBusy) setActiveTab(id);
          }}
          className="flex-1 overflow-y-auto"
        >
          {activeTab === 'export' && <DataExportComponent onExportStateChange={setIsExporting} />}
          {activeTab === 'import' && <DataImportComponent onImportStateChange={setIsImporting} />}
        </Tabs>
      </div>
    </Modal>
  );
}
