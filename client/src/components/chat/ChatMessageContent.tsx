import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import { SpoilerSection } from '../ui/SpoilerSection.js';

export type ChatViewMessagePart =
  | {
      type: 'text';
      text: string;
      tone?: 'default' | 'secondary' | 'muted' | undefined;
      italic?: boolean | undefined;
      mono?: boolean | undefined;
      size?: 'body' | 'xs' | undefined;
    }
  | {
      type: 'markdown';
      text: string;
    }
  | {
      type: 'image';
      url: string;
      alt?: string | undefined;
    }
  | {
      type: 'code';
      code: string;
      label?: string | undefined;
    }
  | {
      type: 'error';
      title: string;
      message: string;
    }
  | {
      type: 'spoiler';
      title: string;
      defaultRevealed?: boolean | undefined;
      parts: readonly ChatViewMessagePart[];
    };

export type ChatViewMessageStyle = 'transcript' | 'cards';
export type ChatViewMessageTone = 'subtle' | 'emphasized';
export type ChatViewSpeakerStyle = 'default' | 'uppercase';

export type ChatViewMessageAction = {
  id: string;
  label: string;
  icon?: string | undefined;
  disabled?: boolean | undefined;
  placement?: 'hover-bar' | 'header' | undefined;
  onClick: () => void;
};

type ChatMessageContentProps = {
  messageStyle: ChatViewMessageStyle;
  speakerName?: string | undefined;
  speakerStyle?: ChatViewSpeakerStyle | undefined;
  tone?: ChatViewMessageTone | undefined;
  avatarElement?: ReactNode | undefined;
  parts: readonly ChatViewMessagePart[];
  headerActions?: readonly ChatViewMessageAction[] | undefined;
};

function getTextPartClassName(
  part: Extract<ChatViewMessagePart, { type: 'text' }>,
  bodySizeClass: 'text-sm' | 'text-base'
): string {
  const sizeClass = part.size === 'xs' ? 'text-xs' : bodySizeClass;
  const toneClass =
    part.tone === 'secondary' ? 'text-secondary' : part.tone === 'muted' ? 'text-muted' : 'text-primary';
  const italicClass = part.italic ? ' italic' : '';
  const monoClass = part.mono ? ' font-mono' : '';
  return `${sizeClass} whitespace-pre-wrap wrap-break-word ${toneClass}${italicClass}${monoClass}`;
}

function renderPart(
  part: ChatViewMessagePart,
  key: string,
  bodySizeClass: 'text-sm' | 'text-base'
): ReactNode {
  switch (part.type) {
    case 'text':
      return (
        <div key={key} className={getTextPartClassName(part, bodySizeClass)}>
          {part.text}
        </div>
      );
    case 'markdown':
      return (
        <div
          key={key}
          className={`${bodySizeClass} leading-relaxed wrap-break-word text-primary [&>p+p]:mt-2`}
        >
          <Markdown>{part.text}</Markdown>
        </div>
      );
    case 'image':
      return (
        <img
          key={key}
          src={part.url}
          alt={part.alt ?? ''}
          className="rounded-sm border inline-block max-w-full"
        />
      );
    case 'code':
      return (
        <div key={key} className="space-y-1">
          {part.label && <div className="text-xs font-medium text-secondary">{part.label}</div>}
          <pre className="bg-inset rounded-sm p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
            {part.code}
          </pre>
        </div>
      );
    case 'error':
      return (
        <div key={key} className="error-card space-y-1">
          <div className="font-semibold">{part.title}</div>
          <div className="whitespace-pre-wrap wrap-break-word">{part.message}</div>
        </div>
      );
    case 'spoiler':
      return (
        <SpoilerSection
          key={key}
          title={part.title}
          defaultRevealed={part.defaultRevealed ?? false}
          className="p-2!"
        >
          <div className="space-y-2">
            {part.parts.map((child, idx) => renderPart(child, `${key}-${idx}`, 'text-sm'))}
          </div>
        </SpoilerSection>
      );
  }
}

function renderCardContent({
  speakerName,
  speakerStyle,
  tone,
  avatarElement,
  parts,
  headerActions = [],
}: Omit<ChatMessageContentProps, 'messageStyle'>) {
  const bgClass = tone === 'emphasized' ? 'bg-emphasized' : 'bg-surface-subtle';
  const spacingClass = parts.length <= 1 && headerActions.length === 0 ? 'space-y-1' : 'space-y-2';
  const speakerClass =
    speakerStyle === 'uppercase'
      ? 'text-xs font-semibold uppercase tracking-wide text-secondary'
      : 'text-xs font-semibold text-secondary';

  return (
    <div className={`rounded-sm border border-border-default ${bgClass} p-2.5 ${spacingClass}`}>
      {(speakerName || headerActions.length > 0 || avatarElement) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {avatarElement}
            {speakerName && <span className={speakerClass}>{speakerName}</span>}
          </div>
          {headerActions.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {headerActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="px-2 py-0.5 text-xs"
                >
                  {action.icon ? `${action.icon} ${action.label}` : action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {parts.map((part, idx) => renderPart(part, `part-${idx}`, 'text-sm'))}
    </div>
  );
}

function renderTranscriptContent({
  speakerName,
  avatarElement,
  parts,
}: Omit<ChatMessageContentProps, 'messageStyle' | 'speakerStyle' | 'tone' | 'headerActions'>) {
  let body: ReactNode;
  const first = parts[0];

  if (speakerName && first && (first.type === 'markdown' || first.type === 'text')) {
    const rest = parts.slice(1);
    body = (
      <>
        <div className="text-base leading-relaxed wrap-break-word">
          <strong>{speakerName}: </strong>
          {first.type === 'markdown' ? (
            <div className="inline [&>p:first-child]:inline [&>p+p]:mt-2">
              <Markdown>{first.text}</Markdown>
            </div>
          ) : (
            <span className={getTextPartClassName(first, 'text-base')}>{first.text}</span>
          )}
        </div>
        {rest.length > 0 && (
          <div className="mt-2 space-y-2">
            {rest.map((part, idx) => renderPart(part, `part-${idx + 1}`, 'text-base'))}
          </div>
        )}
      </>
    );
  } else if (speakerName) {
    body = (
      <>
        <div className="text-base leading-relaxed">
          <strong>{speakerName}:</strong>
        </div>
        {parts.length > 0 && (
          <div className="mt-1 space-y-2">
            {parts.map((part, idx) => renderPart(part, `part-${idx}`, 'text-base'))}
          </div>
        )}
      </>
    );
  } else if (parts.length === 1 && first) {
    body = renderPart(first, 'part-0', 'text-base');
  } else {
    body = (
      <div className="space-y-2">
        {parts.map((part, idx) => renderPart(part, `part-${idx}`, 'text-base'))}
      </div>
    );
  }

  if (!avatarElement) {
    return body;
  }

  return (
    <div className="flow-root">
      {avatarElement}
      {body}
    </div>
  );
}

export default function ChatMessageContent({
  messageStyle,
  speakerName,
  speakerStyle = 'default',
  tone = 'subtle',
  avatarElement,
  parts,
  headerActions,
}: ChatMessageContentProps) {
  if (messageStyle === 'cards') {
    return renderCardContent({
      speakerName,
      speakerStyle,
      tone,
      avatarElement,
      parts,
      headerActions,
    });
  }

  return renderTranscriptContent({
    speakerName,
    avatarElement,
    parts,
  });
}
