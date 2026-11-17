import type { Character } from '../engine/types.js';

export default function CharacterCard({
  character,
  subtitle,
  subtitle2,
  onClick,
  selected,
  disabled,
  className = 'w-48 p-3',
  imageClassName = 'h-52 object-cover object-top',
  children,
}: {
  character: Character;
  subtitle?: string;
  subtitle2?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string | undefined;
  imageClassName?: string | undefined;
  children?: React.ReactNode;
}) {
  const borderClass = selected ? 'ring-2 ring-success-ring' : 'border border-border-default';

  return (
    <div className={`${borderClass} rounded-sm bg-emphasized space-y-2 ${className}`}>
      <button type="button" className="w-full text-left" onClick={onClick} disabled={disabled}>
        <img
          src={character.imagePath}
          alt={`${character.firstName} ${character.lastName}`}
          className={`w-full rounded-sm ${imageClassName}`}
        />
        <div className="font-semibold mt-2 text-center">
          {character.firstName} {character.lastName}
        </div>
        <div className="text-sm text-muted text-center underline">{subtitle}</div>
        <div className="text-sm text-muted text-center">{subtitle2}</div>
        {children && <div className="flex justify-center">{children}</div>}
      </button>
    </div>
  );
}
