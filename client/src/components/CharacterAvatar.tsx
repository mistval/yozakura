import { useEffect, useState } from 'react';

type CharacterAvatarProps = {
  imagePath: string | undefined;
  name: string;
  className?: string | undefined;
  fallbackClassName?: string | undefined;
};

export default function CharacterAvatar({
  imagePath,
  name,
  className = 'h-10 w-10',
  fallbackClassName = 'text-xs',
}: CharacterAvatarProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [imagePath]);

  const showImage = Boolean(imagePath) && !imageError;
  const fallbackInitial = name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-border-default bg-emphasized ${className}`}
    >
      {showImage ? (
        <img
          src={imagePath}
          alt={name || 'Character'}
          draggable={false}
          onError={() => setImageError(true)}
          className="h-full w-full object-cover object-top scale-185 origin-[50%_30%] pointer-events-none"
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-semibold text-muted select-none ${fallbackClassName}`}
        >
          {fallbackInitial}
        </span>
      )}
    </div>
  );
}
