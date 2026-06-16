type LocationItem = {
  id: string;
  name: string;
  description: string;
};

type LocationPanelProps = {
  location: LocationItem;
  adjacentLocationIds: LocationItem[];
  onMove: (locationId: string) => void;
  onWait?: () => void;
  disabled?: boolean;
  canMove?: boolean;
};

export default function LocationPanel({
  location,
  adjacentLocationIds,
  onMove,
  onWait,
  disabled,
  canMove = true,
}: LocationPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">🌍 {location.name}</h2>
        <p className="font-semibold">{location.description}</p>
      </div>

      {canMove && (
        <div>
          <div className="font-semibold mb-1">Move to</div>
          <div className="flex gap-2 flex-wrap">
            {adjacentLocationIds.map((location) => (
              <button key={location.id} type="button" onClick={() => onMove(location.id)} disabled={disabled}>
                {location.name}
              </button>
            ))}
            {onWait && (
              <button type="button" onClick={onWait} disabled={disabled}>
                Wait
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
