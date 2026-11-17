import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import CharacterAvatar from '../CharacterAvatar.js';

type TranscriptMessageContentProps = {
  isImageMessage: boolean;
  isCharacterMessage: boolean;
  imageUrl?: string | undefined;
  speakerName: string;
  content: string;
  avatarImagePath?: string | undefined;
  renderAvatarWrapper?: ((avatar: ReactNode) => ReactNode) | undefined;
};

export default function TranscriptMessageContent({
  isImageMessage,
  isCharacterMessage,
  imageUrl,
  speakerName,
  content,
  avatarImagePath,
  renderAvatarWrapper,
}: TranscriptMessageContentProps) {
  if (isImageMessage) {
    return <img src={imageUrl} alt="Generated" className="rounded-sm border inline-block max-w-full" />;
  }

  const textBody = (
    <div className="text-base leading-relaxed wrap-break-word">
      <strong>{speakerName}: </strong>
      <div className="inline [&>p:first-child]:inline [&>p+p]:mt-2">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );

  if (!isCharacterMessage) {
    return textBody;
  }

  const avatar = (
    <CharacterAvatar
      imagePath={avatarImagePath}
      name={speakerName}
      className="h-10 w-10 border-border-strong bg-surface-subtle"
    />
  );

  return (
    <div className="flow-root">
      {renderAvatarWrapper ? (
        renderAvatarWrapper(avatar)
      ) : (
        <div className="float-left mr-2.5 mb-0.5">{avatar}</div>
      )}
      {textBody}
    </div>
  );
}
