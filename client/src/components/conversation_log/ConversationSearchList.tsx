import { useEffect, useMemo, useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import * as Database from '../../backend_bridge/database';
import type { Character, StoredConversation, TranscriptParticipant } from '../../engine/types.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { ConversationTranscript } from '../../engine/chat/transcript.js';

type ConversationSearchListProps = {
  scenarioId: string;
  participantIds: string[];
  onSelectConversation: (entryId: string) => void;
  heading?: string;
  showHeading?: boolean;
  controlledPage?: number;
  open: boolean;
  onControlledPageChange?: (nextPage: number) => void;
};

type ConversationWithTranscript = StoredConversation & { transcript: ConversationTranscript };

function getUniqueParticipantIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function ParticipantAvatar({
  participant,
  character,
}: {
  participant: TranscriptParticipant;
  character?: Character;
}) {
  const [imageError, setImageError] = useState(false);
  const imagePath = !imageError ? character?.imagePath || participant.imagePath : '';
  const name = character
    ? `${character.firstName} ${character.lastName}`.trim()
    : `${participant.firstName} ${participant.lastName}`.trim();

  return (
    <div
      className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border-default bg-emphasized"
      title={name || 'Character'}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt={name || 'Character'}
          className="h-full w-full object-cover object-top"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted select-none">
          {name ? name[0]?.toUpperCase() : '?'}
        </div>
      )}
    </div>
  );
}

function ParticipantAvatarStack({
  participants,
  scenarioCharactersById,
}: {
  participants: TranscriptParticipant[];
  scenarioCharactersById: Record<string, Character>;
}) {
  const uniqueParticipants = useMemo(() => {
    const seen = new Set<string>();
    return participants.filter((p) => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [participants]);

  if (uniqueParticipants.length === 0) {
    return null;
  }

  return (
    <div className="flex -space-x-2 shrink-0 items-center">
      {uniqueParticipants.map((p) => {
        const character = scenarioCharactersById[p.id];

        return character && <ParticipantAvatar key={p.id} participant={p} character={character} />;
      })}
    </div>
  );
}

export default function ConversationSearchList({
  scenarioId,
  participantIds,
  onSelectConversation,
  heading = 'Recent conversations',
  showHeading,
  controlledPage,
  open,
  onControlledPageChange,
}: ConversationSearchListProps) {
  const participantsKey = useMemo(() => getUniqueParticipantIds(participantIds).join('|'), [participantIds]);
  const userId = useScenarioStore((state) => state.activeScenario?.userCharacterId);
  const scenarioCharactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const uniqueParticipantIds = useMemo(
    () => (participantsKey ? participantsKey.split('|') : []),
    [participantsKey]
  );
  const isFiltered = uniqueParticipantIds.length > 0;
  const shouldShowHeading = showHeading ?? isFiltered;

  const [uncontrolledPage, setUncontrolledPage] = useState(1);
  const [entries, setEntries] = useState<ConversationWithTranscript[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading, loadingRef] = useStateRef(false);

  const currentPage = controlledPage ?? uncontrolledPage;
  const setPage = (nextPage: number) => {
    if (onControlledPageChange) {
      onControlledPageChange(nextPage);
      return;
    }
    setUncontrolledPage(nextPage);
  };

  useEffect(() => {
    if (onControlledPageChange) {
      return;
    }
    setUncontrolledPage(1);
  }, [scenarioId, participantsKey, onControlledPageChange]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const pageResult = await Database.doAsDataRead(() => {
          return Database.loadConversationByParticipantsPage(scenarioId, uniqueParticipantIds, currentPage);
        }, 'conversation');

        if (cancelled) {
          return;
        }

        setEntries(
          pageResult.entries.map((entry) => ({
            ...entry,
            transcript: ConversationTranscript.deserialize(entry.serializedTranscript),
          }))
        );
        setHasNextPage(pageResult.hasNextPage);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [scenarioId, participantsKey, currentPage]);

  const groupedByTurn = useMemo(() => {
    if (isFiltered) {
      return [] as Array<[number, ConversationWithTranscript[]]>;
    }

    const byTurn = new Map<number, ConversationWithTranscript[]>();
    for (const entry of entries) {
      const turn = Number(entry.turnNumber || 0);
      if (!byTurn.has(turn)) {
        byTurn.set(turn, []);
      }
      byTurn.get(turn)?.push(entry);
    }

    return [...byTurn.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries, isFiltered]);

  if (!open) {
    return undefined;
  }

  return (
    <div className="space-y-2">
      {shouldShowHeading && (
        <h4 className="font-medium">
          {heading}
        </h4>
      )}
      {loading && entries.length === 0 && (
        <div className="text-sm text-secondary">Loading conversations...</div>
      )}
      {!loading && entries.length === 0 && <div className="text-sm text-muted">No conversations yet.</div>}

      {!isFiltered && (
        <div className="space-y-3">
          {groupedByTurn.map(([turnNumber, turnEntries]) => (
            <div key={turnNumber} className="space-y-2">
              <h3 className="text-sm font-medium text-muted ">Turn {turnNumber}</h3>
              <div className="border rounded-sm divide-y">
                {turnEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      onSelectConversation(entry.id);
                    }}
                    className="w-full text-left px-3 py-2 flex justify-between items-center hover:bg-surface-hover"
                  >
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                      <span className="truncate">
                        {entry.label || 'Conversation'}
                        {userId &&
                          !entry.transcript.participantInfo.some((i) => i.id === userId) &&
                          entry.transcript.hasMemoryRaggedCharacter(userId) && (
                            <span className="text-xs text-muted ml-2">(might reference user)</span>
                          )}
                      </span>
                      <ParticipantAvatarStack
                        participants={entry.transcript.participantInfo}
                        scenarioCharactersById={scenarioCharactersById}
                      />
                    </div>
                    <span className="text-xs text-muted shrink-0 ml-2">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {isFiltered && entries.length > 0 && (
        <div className="border rounded-sm divide-y">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectConversation(entry.id)}
              className="w-full text-left px-3 py-2 flex justify-between items-center hover:bg-surface-hover"
            >
              <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                <div>
                  <span className="text-sm text-muted shrink-0">Turn {entry.turnNumber} ·</span>
                  <span className="truncate">{entry.label || 'Conversation'}</span>
                </div>
                <ParticipantAvatarStack
                  participants={entry.transcript.participantInfo}
                  scenarioCharactersById={scenarioCharactersById}
                />
              </div>
              <span className="text-xs text-muted shrink-0 ml-2">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {currentPage > 1 && (
          <button
            type="button"
            onClick={() => {
              if (loadingRef.current) return;
              setPage(Math.max(1, currentPage - 1));
            }}
            disabled={loading}
          >
            Previous Page
          </button>
        )}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => {
              if (loadingRef.current) return;
              setPage(currentPage + 1);
            }}
            disabled={loading}
          >
            Next Page
          </button>
        )}
      </div>
    </div>
  );
}
