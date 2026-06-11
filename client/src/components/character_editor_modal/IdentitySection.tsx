import type { ChangeEvent } from 'react';
import { useCharacterEditorModal } from './CharacterEditorModalContext';
import InfoTooltip from '../ui/InfoTooltip';

export default function IdentitySection() {
  const { character, setCharacterField: setField } = useCharacterEditorModal();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <div className="flex items-center gap-1 mb-1">
          <h3 className="text-base font-medium mb-1">First Name</h3>
          <InfoTooltip
            label="First Name"
            html={
              'This is the character\'s first name. Avoid names that are common words that come up in discussion. If you have a character named "and" or "the", the system will think everyone is constantly talking about them. The same applies to Last Name.'
            }
          />
        </div>
        <div className="flex gap-2">
          <input
            value={character.firstName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setField('firstName', event.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <h3 className="text-base font-medium mb-1">Last Name</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={character.lastName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setField('lastName', event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
