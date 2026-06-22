import type { SettingsScriptControlsDefinition } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

const TURNS_PER_DAY = 8;

const PERIOD_LABELS = [
  'Dawn',
  'Late Morning',
  'Midday',
  'Late Afternoon',
  'Early Evening',
  'Sunset',
  'Twilight',
  'Night',
];

const controls: SettingsScriptControlsDefinition = () => [
  {
    id: 'startDate',
    type: 'calendar',
    label: 'Start date',
    tooltipHtml: 'The in-world date at turn 0. The current date advances one day every 8 turns.',
    width: 'full',
  },
];

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseStartDate(value: string | undefined): Date {
  const trimmed = value?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export const newYorkTemporalScript: TemporalContextSettingsScript = {
  id: 'new-york',
  name: 'New York',
  controls,
  getTemporalContext(controlValues, request): Promise<TemporalContext> {
    const turnNumber = Math.max(0, Math.floor(request.turnNumber));
    const dayIndex = Math.floor(turnNumber / TURNS_PER_DAY);
    const periodLabel = PERIOD_LABELS[turnNumber % TURNS_PER_DAY] ?? 'Night';

    const currentDate = parseStartDate(controlValues.startDate);
    currentDate.setUTCDate(currentDate.getUTCDate() + dayIndex);
    const dateLabel = DATE_FORMAT.format(currentDate);

    return Promise.resolve({
      displayHtml: `<b>${dateLabel}</b><br>${periodLabel}`,
      plainText: `${dateLabel}, ${periodLabel}`,
      dayIndex,
    });
  },
};
