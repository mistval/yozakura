import RangeNumberInput from './RangeNumberInput.js';
import SettingFieldLabel from './SettingFieldLabel.js';
import { clamp } from '../../../util/numeric.js';

export type ProportionalWeightItem = {
  id: string;
  label: string;
};

export type ProportionalWeightSlidersProps = {
  idPrefix: string;
  label: string;
  items: ReadonlyArray<ProportionalWeightItem>;
  weights: Record<string, number>;
  tooltipHtml?: string | undefined;
  defaultWeight?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  onChange: (weightsPatch: Record<string, number | null>) => void;
};

export default function ProportionalWeightSliders({
  idPrefix,
  label,
  items,
  weights,
  tooltipHtml,
  defaultWeight = 50,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: ProportionalWeightSlidersProps) {
  const handleChange = (itemId: string, nextValue: number) => {
    const validIds = new Set(items.map((item) => item.id));
    const patch: Record<string, number | null> = {
      [itemId]: Math.round(clamp(nextValue, min, max)),
    };

    for (const existingKey of Object.keys(weights)) {
      if (!validIds.has(existingKey)) {
        patch[existingKey] = null;
      }
    }

    onChange(patch);
  };

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-surface-soft">
      <SettingFieldLabel
        text={label}
        htmlFor={items[0] ? `${idPrefix}-${items[0].id}` : undefined}
        tooltipHtml={tooltipHtml}
      />
      <div className="space-y-2">
        {items.map((item) => {
          const inputId = `${idPrefix}-${item.id}`;
          const currentWeight = weights[item.id] ?? defaultWeight;

          return (
            <div key={item.id} className="space-y-1">
              <label htmlFor={inputId} className="text-xs font-semibold text-secondary-strong block">
                {item.label}
              </label>
              <RangeNumberInput
                id={inputId}
                min={min}
                max={max}
                step={step}
                value={currentWeight}
                ariaLabel={`${item.label} weight`}
                onChange={(next) => handleChange(item.id, next)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
