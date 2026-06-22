import { describe, expect, it } from 'vitest';
import { newYorkTemporalScript } from './new_york.js';
import type { SettingsScriptHelpers } from '../../settings_script.js';

const helpers = {} as SettingsScriptHelpers;

function getContext(turnNumber: number, startDate = '2026-06-21') {
  return newYorkTemporalScript.getTemporalContext({ startDate }, { turnNumber }, helpers);
}

describe('newYorkTemporalScript', () => {
  it('reports the start date and first period at turn 0', async () => {
    const result = await getContext(0, '2026-06-21');
    expect(result.plainText).toBe('Sunday, June 21, 2026, Dawn');
    expect(result.displayHtml).toBe('<b>Sunday, June 21, 2026</b><br>Dawn');
    expect(result.dayIndex).toBe(0);
  });

  it('cycles through 8 periods within a day without advancing the date', async () => {
    const labels = [
      'Dawn',
      'Late Morning',
      'Midday',
      'Late Afternoon',
      'Early Evening',
      'Sunset',
      'Twilight',
      'Night',
    ];
    for (let turn = 0; turn < 8; turn++) {
      const result = await getContext(turn, '2026-06-21');
      expect(result.plainText).toBe(`Sunday, June 21, 2026, ${labels[turn]}`);
      expect(result.dayIndex).toBe(0);
    }
  });

  it('advances one day every 8 turns', async () => {
    const result = await getContext(8, '2026-06-21');
    expect(result.plainText).toBe('Monday, June 22, 2026, Dawn');
    expect(result.dayIndex).toBe(1);
  });

  it('advances across month boundaries', async () => {
    // 2026-06-21 + 9 days = 2026-06-30; +10 days = 2026-07-01.
    const result = await getContext(10 * 8, '2026-06-21');
    expect(result.plainText).toBe('Wednesday, July 1, 2026, Dawn');
    expect(result.dayIndex).toBe(10);
  });

  it('falls back to today when the start date is blank', async () => {
    const result = await getContext(0, '');
    expect(result.plainText).not.toBe('');
    expect(result.dayIndex).toBe(0);
  });
});
