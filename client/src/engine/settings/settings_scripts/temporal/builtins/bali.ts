import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

export const baliTemporalScript: TemporalContextSettingsScript = {
  id: 'bali-weather',
  name: 'Bali',
  description:
    'An 8-turn-long-day weather/season simulation for Bali, Indonesia. Tracks calendar date, time of day, temperature, and tropical weather events based on historical climate normals for the region.',

  controls: (() => [
    { id: 'startDate', type: 'calendar', label: 'Start date', default: '2026-06-01', width: 'full' },
    {
      id: 'units',
      type: 'dropdown_select',
      label: 'Temperature units',
      default: 'C',
      options: [
        { name: '°C (Celsius)', value: 'C' },
        { name: '°F (Fahrenheit)', value: 'F' },
      ],
    },
  ]) as SettingsScriptControlsDefinition,

  async getTemporalContext(controlValues, request, helpers): Promise<TemporalContext> {
    const TURNS_PER_DAY = 8;
    const PERIODS = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Dusk', 'Night', 'Midnight'];
    // Diurnal temperature curve across the 8 periods: 0 = daily low, 1 = daily high.
    const TEMP_FRAC = [0.05, 0.4, 0.8, 1.0, 0.8, 0.55, 0.3, 0.12];

    const dayIndex = Math.floor(request.turnNumber / TURNS_PER_DAY);
    const periodIndex = ((request.turnNumber % TURNS_PER_DAY) + TURNS_PER_DAY) % TURNS_PER_DAY;
    const period = PERIODS[periodIndex];
    const isDaylight = periodIndex >= 1 && periodIndex <= 4; // morning → evening

    // --- Resolve the current in-world date ---
    const start = new Date(`${controlValues.startDate ?? '2026-06-01'}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + dayIndex);
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth(); // 0–11
    const dom = start.getUTCDate();
    const isoDate = start.toISOString().slice(0, 10);
    const dateLabel = start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

    // --- Bali (Denpasar) monthly climate normals, °F + daily precip probability ---
    // Note: Temperatures in Bali remain relatively constant year-round.
    // The main variance is in precipitation (Wet season: Oct-Apr, Dry season: May-Sep).
    const MONTHLY = [
      { hi: 88, lo: 79, precip: 0.65 }, // Jan
      { hi: 88, lo: 79, precip: 0.6 }, // Feb
      { hi: 89, lo: 78, precip: 0.5 }, // Mar
      { hi: 90, lo: 78, precip: 0.35 }, // Apr
      { hi: 89, lo: 77, precip: 0.25 }, // May
      { hi: 87, lo: 76, precip: 0.15 }, // Jun
      { hi: 85, lo: 75, precip: 0.15 }, // Jul
      { hi: 85, lo: 75, precip: 0.1 }, // Aug
      { hi: 87, lo: 75, precip: 0.15 }, // Sep
      { hi: 89, lo: 77, precip: 0.3 }, // Oct
      { hi: 90, lo: 78, precip: 0.45 }, // Nov
      { hi: 89, lo: 78, precip: 0.55 }, // Dec
    ];
    const { hi: monthlyHi, lo: monthlyLo, precip: precipChance } = MONTHLY[month]!;

    // --- Deterministic per-month extreme-event scheduler ---
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthlyEvent = (
      type: string,
      cfg: { months: number[]; chance: number; minDur: number; maxDur: number }
    ) => {
      if (!cfg.months.includes(month)) return null;
      const r = helpers.createSeededRandom(`${year}-${month}-${type}`);
      if (r() >= cfg.chance) return null;
      const duration = cfg.minDur + Math.floor(r() * (cfg.maxDur - cfg.minDur + 1));
      const latestStart = Math.max(1, daysInMonth - duration);
      const startDom = 1 + Math.floor(r() * latestStart);
      return dom >= startDom && dom < startDom + duration;
    };

    // Extreme weather tailored to tropical Indonesia
    const monsoonSquall = monthlyEvent('monsoon', {
      months: [10, 11, 0, 1, 2, 3],
      chance: 0.35,
      minDur: 1,
      maxDur: 3,
    });
    const tropicalCyclone = monthlyEvent('cyclone', {
      months: [0, 1, 2, 3],
      chance: 0.1,
      minDur: 1,
      maxDur: 2,
    });
    const extremeHeat = monthlyEvent('heatwave', {
      months: [9, 10, 3, 4],
      chance: 0.25,
      minDur: 2,
      maxDur: 5,
    });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(isoDate);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (tropicalCyclone) {
      // Cyclones bring massive cloud cover, lowering temps slightly but bringing intense weather
      hi = 82 + Math.round(d() * 4);
      lo = hi - (3 + Math.round(d() * 3));
      cond = 'Tropical Cyclone';
      emoji = '🌀';
      blurb = 'violent winds, torrential downpours, and dangerous swells';
      alert = '🌀 TROPICAL CYCLONE WARNING';
    } else if (monsoonSquall) {
      hi = 84 + Math.round(d() * 5);
      lo = 76 + Math.round(d() * 2);
      cond = 'Monsoon Squall';
      emoji = '⛈️';
      blurb = 'heavy, relentless tropical rain causing localized flooding';
      alert = '⚠️ MONSOON SQUALL WARNING';
    } else if (extremeHeat) {
      hi = 93 + Math.round(d() * 5); // 93–98
      lo = 80 + Math.round(d() * 3);
      cond = 'Extreme Heat';
      emoji = '🥵';
      blurb = 'oppressive, humid heat with a high UV index';
      alert = '🔥 EXTREME HEAT ADVISORY';
    } else {
      // Ordinary tropical day: shift the whole day slightly warmer or cooler.
      // Variance is much smaller in Bali than in NYC (±4°F instead of ±10°F).
      const shift = Math.round((d() * 2 - 1) * 4);
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;

      if (d() < precipChance) {
        if (d() < 0.4) {
          cond = 'Thunderstorms';
          emoji = '🌩️';
          blurb = 'cracking thunderstorms and brief, intense showers';
        } else {
          cond = 'Tropical Rain';
          emoji = '🌧️';
          blurb = 'warm, steady tropical rain';
        }
      } else {
        const sky = d();
        if (sky < 0.45) {
          cond = 'Clear';
          emoji = isDaylight ? '☀️' : '🌙';
          blurb = isDaylight ? 'clear skies and strong sun' : 'clear and balmy';
        } else if (sky < 0.8) {
          cond = 'Partly cloudy';
          emoji = isDaylight ? '⛅' : '☁️';
          blurb = 'a mix of tropical sun and scattered clouds';
        } else {
          cond = 'Overcast';
          emoji = '☁️';
          blurb = 'grey and overcast but still humid';
        }
      }
    }

    // Temperature for this period via the diurnal curve.
    const tempF = Math.round(lo + (hi - lo) * TEMP_FRAC[periodIndex]!);

    const useC = (controlValues.units ?? 'C') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    // Tropical feel scale
    let feel;
    if (tempF >= 90) feel = 'sweltering and humid';
    else if (tempF >= 82) feel = 'hot and muggy';
    else if (tempF >= 75) feel = 'warm and balmy';
    else feel = 'pleasantly mild'; // Rarely drops below 70 in Bali

    // --- Build outputs ---
    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${period}. Weather: ${temp} (${feel}), ${cond.toLowerCase()} — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-bali')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await baliTemporalScript.getTemporalContext({ startDate }, { turnNumber }, {
          createSeededRandom,
        } as Partial<SettingsScriptHelpers> as any)
      ).plainText
    );
  }
}
