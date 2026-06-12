import type { Character } from '../engine/types.js';

export default function CharacterCard({
  character,
  subtitle,
  subtitle2,
  onClick,
  selected,
  disabled,
  children,
}: {
  character: Character;
  subtitle?: string;
  subtitle2?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const borderClass = selected ? 'ring-2 ring-success-ring' : 'border border-border-default';

  return (
    <div className={`${borderClass} rounded-sm bg-emphasized p-3 w-48 space-y-2`}>
      <button type="button" className="w-full text-left" onClick={onClick} disabled={disabled}>
        <img
          src={character.imagePath}
          alt={`${character.firstName} ${character.lastName}`}
          className="w-full h-52 object-cover rounded-sm"
        />
        <div className="font-semibold mt-2">
          {character.firstName} {character.lastName}
        </div>
        <div className="text-sm text-muted">{subtitle}</div>
        <div className="text-sm text-muted">{subtitle2}</div>
      </button>

      {children && <div className="flex justify-center">{children}</div>}
    </div>
  );
}
