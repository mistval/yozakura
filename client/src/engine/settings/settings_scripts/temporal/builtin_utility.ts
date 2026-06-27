import type { SettingsControlValues, SettingsScriptControl } from '../settings_script.js';

export const DEFAULT_PERIODS = [
  'Dawn',
  'Morning',
  'Midday',
  'Afternoon',
  'Evening',
  'Dusk',
  'Night',
  'Midnight',
];
export const DEFAULT_DAYLIGHT_PERIODS = ['Morning', 'Midday', 'Afternoon', 'Evening'];
export const DEFAULT_JUMP_BY_DAYS = 7;
export const DEFAULT_START_DATE = '2026-06-01';
export const SCENARIO_CREATE_DATE_SENTINEL = 'SCENARIO_CREATE_DATE';

export type TemporalDefaults = {
  tempFrac?: number[];
  periods?: string[];
  daylightPeriods?: string[];
  jumpByDays?: number;
};

export type TemporalBasics = {
  periods: string[];
  turnsPerDay: number;
  periodIndex: number;
  period: string;
  isDaylight: boolean;
  dayIndex: number;
  tempFrac: number[];
  tempFracAtPeriod: number;
  date: Date;
  year: number;
  month: number;
  dom: number;
  daysInMonth: number;
  isoDate: string;
  dateLabel: string;
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  if (!value?.trim()) return fallback;
  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(Number);
  if (items.length === 0 || items.some((entry) => !Number.isFinite(entry))) return fallback;
  return items;
}

export function interpolateCurve(points: number[], count: number): number[] {
  if (count <= 0) return [];
  if (points.length === 0) return new Array(count).fill(0);
  if (points.length === count) return points;
  if (points.length === 1 || count === 1) return new Array(count).fill(points[0]!);

  const result: number[] = [];
  for (let i = 0; i < count; ++i) {
    const source = (i / (count - 1)) * (points.length - 1);
    const lowIndex = Math.floor(source);
    const highIndex = Math.ceil(source);
    const fraction = source - lowIndex;
    result.push(points[lowIndex]! * (1 - fraction) + points[highIndex]! * fraction);
  }
  return result;
}

export function temporalControls(defaults: TemporalDefaults): SettingsScriptControl[] {
  return [
    {
      id: 'jumpByDays',
      type: 'number',
      label: 'Jump by days',
      default: String(defaults.jumpByDays ?? DEFAULT_JUMP_BY_DAYS),
      min: 0,
      width: 'full',
      tooltipHtml:
        "Extra days skipped each time an in-world day passes. With the default of 7, every day jumps the calendar forward by an extra week, so the day after Monday is <strong>the following week's</strong> Tuesday. Set lower if you want months to pass by more slowly, higher for them to pass by more quickly.",
    },
    {
      id: 'periods',
      type: 'string',
      label: 'Time periods',
      default: (defaults.periods ?? DEFAULT_PERIODS).join(', '),
      width: 'full',
      tooltipHtml:
        'Comma-separated names for the periods within a day. Each turn advances to the next period, so the number of periods is the number of turns per day.',
    },
    {
      id: 'tempCurve',
      type: 'string',
      label: 'Temperature curve',
      default: defaults.tempFrac?.join(', '),
      width: 'full',
      tooltipHtml:
        'Comma-separated fractions from 0 (daily low) to 1 (daily high) describing temperature through the day. If the number of points differs from the number of time periods, the curve is linearly interpolated to fit.',
    },
    {
      id: 'daylightPeriods',
      type: 'string',
      label: 'Daylight periods',
      default: (defaults.daylightPeriods ?? DEFAULT_DAYLIGHT_PERIODS).join(', '),
      width: 'full',
      tooltipHtml:
        'Comma-separated subset of the time period names that count as daylight. Affects sky descriptions and day/night emoji.',
    },
  ];
}

export function resolveSentinelStartDates(
  controlValues: SettingsControlValues,
  scenarioCreatedAt: string | undefined
): SettingsControlValues {
  const resolvedDate = (scenarioCreatedAt ?? new Date().toISOString()).slice(0, 10);
  let resolved: SettingsControlValues | undefined;
  for (const [id, value] of Object.entries(controlValues)) {
    if (value === SCENARIO_CREATE_DATE_SENTINEL) {
      resolved ??= { ...controlValues };
      resolved[id] = resolvedDate;
    }
  }
  return resolved ?? controlValues;
}

export function resolveTemporalDate(
  controlValues: SettingsControlValues,
  turnNumber: number,
  turnsPerDay: number,
  defaults: TemporalDefaults
) {
  const jumpByDays = Math.max(
    0,
    Math.floor(parseNumber(controlValues.jumpByDays, defaults.jumpByDays ?? DEFAULT_JUMP_BY_DAYS))
  );

  const periodIndex = ((turnNumber % turnsPerDay) + turnsPerDay) % turnsPerDay;
  const dayIndex = Math.floor(turnNumber / turnsPerDay);
  const calendarOffset = dayIndex * (1 + jumpByDays);
  const date = new Date(`${controlValues.startDate ?? DEFAULT_START_DATE}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + calendarOffset);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dom = date.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const isoDate = date.toISOString().slice(0, 10);
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return {
    turnsPerDay,
    dayIndex,
    date,
    year,
    month,
    dom,
    daysInMonth,
    isoDate,
    dateLabel,
    periodIndex,
  };
}

export function resolveTemporalBasics(
  controlValues: SettingsControlValues,
  turnNumber: number,
  defaults: TemporalDefaults
): TemporalBasics {
  const periods = parseList(controlValues.periods, defaults.periods ?? DEFAULT_PERIODS);
  const turnsPerDay = periods.length;
  const dateInfo = resolveTemporalDate(controlValues, turnNumber, turnsPerDay, defaults);
  const period = periods[dateInfo.periodIndex]!;

  const daylightPeriods = parseList(
    controlValues.daylightPeriods,
    defaults.daylightPeriods ?? DEFAULT_DAYLIGHT_PERIODS
  ).map((name) => name.toLowerCase());

  const isDaylight = daylightPeriods.includes(period.toLowerCase());

  const tempFrac = interpolateCurve(
    parseNumberList(controlValues.tempCurve, defaults.tempFrac ?? []),
    turnsPerDay
  );

  const tempFracAtPeriod = tempFrac[dateInfo.periodIndex]!;

  return {
    ...dateInfo,
    periods,
    turnsPerDay,
    period,
    isDaylight,
    tempFrac,
    tempFracAtPeriod,
  };
}
