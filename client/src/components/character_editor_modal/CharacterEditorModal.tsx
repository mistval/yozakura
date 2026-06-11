import CharacterCardImportModal from './CharacterCardImportModal';
import Modal from '../ui/Modal';
import BaseAppearanceSection from './BaseAppearanceSection';
import CharacterCardSection from './CharacterCardSection';
import { CharacterEditorModalProvider, useCharacterEditorModal } from './CharacterEditorModalContext';
import DescriptionSection from './DescriptionSection';
import ExampleDialogueSection from './ExampleDialogueSection';
import FooterSection from './FooterSection';
import HeaderSection from './HeaderSection';
import IdentitySection from './IdentitySection';
import type { CharacterEditorModalProps } from './types';
import WardrobesSection from './WardrobesSection';
import { useModalStackZIndex } from '../../hooks/useModalQueryParam.js';

function CharacterEditorModalContent({ zIndex }: { zIndex?: number }) {
  const { open, closeEditor } = useCharacterEditorModal();

  return (
    <>
      <Modal
        closeOnBackdropClick={false}
        open={open}
        onClose={closeEditor}
        className="p-4 md:p-6"
        zIndex={zIndex}
      >
        <div className="bg-emphasized rounded-sm border shadow-xs max-w-4xl w-full mx-auto p-6 space-y-4">
          <HeaderSection />
          <IdentitySection />
          <DescriptionSection />
          <ExampleDialogueSection />
          <BaseAppearanceSection />
          <WardrobesSection />
          <CharacterCardSection />
          <FooterSection />
        </div>
      </Modal>

      <CharacterCardImportModal {...(zIndex !== undefined && { zIndex: zIndex + 100 })} />
    </>
  );
}

export default function CharacterEditorModal({ queryParam, ...props }: CharacterEditorModalProps) {
  const zIndex = useModalStackZIndex(queryParam ?? '');

  if (!props.open) {
    return undefined;
  }

  return (
    <CharacterEditorModalProvider {...props}>
      <CharacterEditorModalContent {...(queryParam !== undefined && { zIndex })} />
    </CharacterEditorModalProvider>
  );
}
