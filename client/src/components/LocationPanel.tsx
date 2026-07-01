import { useMemo } from 'react';
import type { MoveHighlight } from '../engine/character_schedule/schedule_movement.js';

type LocationItem = {
  id: string;
  name: string;
  description: string;
};

export type MoveSuggestion = {
  suggestedLocations: LocationItem[];
  highlightByLocationId: Record<string, MoveHighlight>;
  consumesTurnByLocationId: Record<string, boolean>;
  highlightWait: boolean;
  forbiddenLocationIds: string[];
};

type LocationPanelProps = {
  location: LocationItem;
  adjacentLocationIds: LocationItem[];
  onMove: (locationId: string) => void;
  onWait?: () => void;
  disabled?: boolean;
  canMove?: boolean;
  suggestion?: MoveSuggestion | undefined;
};

const HIGHLIGHT_RING: Record<MoveHighlight, string> = {
  urgent: 'ring-2 ring-danger-border-accent',
  gentle: 'ring-2 ring-warning-border',
  allowed: 'ring-2 ring-success-ring',
};

function MoveButtons({ suggestion, adjacentLocationIds, onMove, onWait }: LocationPanelProps) {
  const { orderedLocations, forbiddenIds } = useMemo(() => {
    const suggestedLocations = suggestion?.suggestedLocations ?? [];
    const suggestedIds = new Set(suggestedLocations.map((entry) => entry.id));
    const forbiddenIds = new Set(suggestion?.forbiddenLocationIds ?? []);
    const orderedLocations = suggestedLocations
      .concat(
        adjacentLocationIds.filter((entry) => !suggestedIds.has(entry.id) && !forbiddenIds.has(entry.id))
      )
      .concat(adjacentLocationIds.filter((entry) => forbiddenIds.has(entry.id)));

    return { orderedLocations, forbiddenIds };
  }, [suggestion]);

  return (
    <div>
      <div className="font-semibold mb-1">Move to</div>
      <div className="flex gap-2 flex-wrap">
        {orderedLocations.map((entry) => {
          const highlight = suggestion?.highlightByLocationId[entry.id];
          const locked = forbiddenIds.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onMove(entry.id)}
              className={highlight ? HIGHLIGHT_RING[highlight] : undefined}
            >
              {locked ? `🔒 ${entry.name}` : entry.name}
            </button>
          );
        })}
        {onWait && (
          <button
            type="button"
            onClick={onWait}
            className={suggestion?.highlightWait ? HIGHLIGHT_RING.allowed : undefined}
          >
            Wait
          </button>
        )}
      </div>
    </div>
  );
}

export default function LocationPanel(props: LocationPanelProps) {
  const { location, canMove } = props;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">🌍 {location.name}</h2>
        <p className="font-semibold">{location.description}</p>
      </div>

      {canMove && <MoveButtons {...props} />}
    </div>
  );
}
