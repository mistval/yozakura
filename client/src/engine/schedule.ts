import { timeOfDaySchema, type TimeOfDay } from './types';

export const TURNS_PER_PERIOD = 1;

export function getTimePeriod(turnNumber: number): TimeOfDay {
  const index = Math.floor(turnNumber / TURNS_PER_PERIOD) % timeOfDaySchema.options.length;
  return timeOfDaySchema.options[index] ?? timeOfDaySchema.options[0]!;
}

export function getDayNumber(turnNumber: number): number {
  const turnsPerDay = TURNS_PER_PERIOD * timeOfDaySchema.options.length;
  return Math.floor(turnNumber / turnsPerDay) + 1;
}

export function getTimePeriodLabel(timePeriod: string): string {
  return `${timePeriod.charAt(0).toUpperCase()}${timePeriod.slice(1)}`;
}
