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
import { useModalPanelClasses } from '../../hooks/use_mobile_layout.js';

function CharacterEditorModalContent({ zIndex }: { zIndex?: number }) {
  const { open, closeEditor } = useCharacterEditorModal();
  const { outerClassName, panelClassName } = useModalPanelClasses({
    maxWidthClassName: 'max-w-4xl',
    desktopPanelClassName: 'rounded-sm border shadow-xs p-6 space-y-4',
  });

  return (
    <>
      <Modal closeOnBackdropClick={false} open={open} onClose={closeEditor} zIndex={zIndex}>
        <div className={outerClassName}>
          <div className={panelClassName}>
            <HeaderSection />
            <IdentitySection />
            <DescriptionSection />
            <ExampleDialogueSection />
            <BaseAppearanceSection />
            <WardrobesSection />
            <CharacterCardSection />
            <FooterSection />
          </div>
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
