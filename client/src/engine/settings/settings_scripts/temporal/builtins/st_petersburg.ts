import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

export const stPetersburgTemporalScript: TemporalContextSettingsScript = {
  id: 'stpetersburg-weather',
  name: 'St. Petersburg',
  description:
    'An 8-turn-long-day weather/season simulation for St. Petersburg, Russia. Tracks calendar date, time of day, temperature, and extreme seasonal daylight shifts (from long winter nights to the summer White Nights).',

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
    // Diurnal temperature curve: Coldest at dawn (0), warmest at mid-afternoon (1).
    const TEMP_FRAC = [0.05, 0.4, 0.8, 1.0, 0.8, 0.55, 0.3, 0.12];

    const dayIndex = Math.floor(request.turnNumber / TURNS_PER_DAY);
    const periodIndex = ((request.turnNumber % TURNS_PER_DAY) + TURNS_PER_DAY) % TURNS_PER_DAY;
    const period = PERIODS[periodIndex];

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

    // --- Dynamic Seasonal Daylight (St. Petersburg Latitude 59.9° N) ---
    const DAYLIGHT_PERIODS_BY_MONTH = [
      [2, 3], // Jan: ~6-7 hrs of light
      [2, 3, 4], // Feb: ~9 hrs
      [1, 2, 3, 4], // Mar: ~12 hrs
      [1, 2, 3, 4, 5], // Apr: ~15 hrs
      [0, 1, 2, 3, 4, 5, 6], // May: ~17 hrs
      [0, 1, 2, 3, 4, 5, 6, 7], // Jun: ~19 hrs + White Nights (all periods illuminated)
      [0, 1, 2, 3, 4, 5, 6], // Jul: ~18 hrs
      [1, 2, 3, 4, 5], // Aug: ~15 hrs
      [1, 2, 3, 4], // Sep: ~12 hrs
      [2, 3, 4], // Oct: ~10 hrs
      [2, 3], // Nov: ~7-8 hrs
      [2, 3], // Dec: ~6 hrs
    ];

    const isDaylight = DAYLIGHT_PERIODS_BY_MONTH[month]!.includes(periodIndex);
    const isWhiteNight = (month === 5 || month === 6) && (periodIndex === 6 || periodIndex === 7);

    // --- St. Petersburg monthly climate normals, °F + daily precip probability ---
    const MONTHLY = [
      { hi: 24, lo: 14, precip: 0.4 }, // Jan
      { hi: 26, lo: 13, precip: 0.35 }, // Feb
      { hi: 35, lo: 21, precip: 0.35 }, // Mar
      { hi: 48, lo: 32, precip: 0.35 }, // Apr
      { hi: 60, lo: 43, precip: 0.35 }, // May
      { hi: 68, lo: 52, precip: 0.4 }, // Jun
      { hi: 73, lo: 57, precip: 0.4 }, // Jul
      { hi: 70, lo: 55, precip: 0.45 }, // Aug
      { hi: 59, lo: 46, precip: 0.45 }, // Sep
      { hi: 46, lo: 37, precip: 0.5 }, // Oct (Very gloomy)
      { hi: 35, lo: 27, precip: 0.45 }, // Nov
      { hi: 28, lo: 19, precip: 0.45 }, // Dec
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

    const siberianFreeze = monthlyEvent('freeze', {
      months: [11, 0, 1, 2],
      chance: 0.2,
      minDur: 3,
      maxDur: 6,
    });
    const blizzard = monthlyEvent('blizzard', {
      months: [11, 0, 1, 2, 3],
      chance: 0.15,
      minDur: 1,
      maxDur: 2,
    });
    const summerStorm = monthlyEvent('storm', { months: [5, 6, 7], chance: 0.25, minDur: 1, maxDur: 2 });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(isoDate);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (siberianFreeze) {
      hi = 0 + Math.round(d() * 10);
      lo = hi - (10 + Math.round(d() * 5));
      cond = 'Siberian Cold';
      emoji = '🥶';
      blurb = 'dangerously bitter, bone-chilling cold from a Siberian high';
      alert = '❄️ EXTREME COLD WARNING';
    } else if (blizzard) {
      hi = 18 + Math.round(d() * 8);
      lo = hi - (6 + Math.round(d() * 4));
      cond = 'Snowstorm';
      emoji = '❄️';
      blurb = 'heavy snowfall and biting winds coming off the Gulf of Finland';
      alert = '⚠️ HEAVY SNOW WARNING';
    } else if (summerStorm) {
      hi = 75 + Math.round(d() * 10);
      lo = 60 + Math.round(d() * 5);
      cond = 'Thunderstorms';
      emoji = '⛈️';
      blurb = 'dark clouds and heavy, rolling thunderstorms disrupting the Baltic summer';
    } else {
      const shift = Math.round((d() * 2 - 1) * 8);
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;
      const avg = (hi + lo) / 2;

      if (d() < precipChance) {
        if (avg <= 33) {
          cond = 'Snow';
          emoji = '🌨️';
          blurb = 'steady, quiet snowfall';
        } else if (avg <= 38) {
          cond = 'Sleet / Wet Snow';
          emoji = '🌨️';
          blurb = 'a damp, freezing mix of sleet and wet snow';
        } else {
          cond = 'Rain';
          emoji = '🌧️';
          blurb = 'cold, steady rain';
        }
      } else {
        const sky = d();
        const overcastThreshold = month > 8 || month < 3 ? 0.4 : 0.65;

        if (sky < overcastThreshold) {
          cond = 'Clear';
          if (isWhiteNight) {
            emoji = '🌆';
            blurb = 'the surreal, luminous twilight of the White Nights';
          } else {
            emoji = isDaylight ? '☀️' : '🌙';
            blurb = isDaylight ? 'bright and clear skies' : 'clear and cold';
          }
        } else if (sky < 0.85) {
          cond = 'Partly cloudy';
          if (isWhiteNight) {
            emoji = '🌤️';
            blurb = 'a bright, pearl-grey twilight shining through passing clouds';
          } else {
            emoji = isDaylight ? '⛅' : '☁️';
            // FIX: Differentiate blurb based on daylight
            blurb = isDaylight ? 'a mix of sun and clouds' : 'stars peeking through passing clouds';
          }
        } else {
          cond = 'Overcast';
          emoji = '☁️';
          blurb = 'a thick, heavy layer of grey overcast';
        }
      }
    }

    const tempF = Math.round(lo + (hi - lo) * TEMP_FRAC[periodIndex]!);
    const useC = (controlValues.units ?? 'C') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    let feel;
    if (tempF >= 80) feel = 'unusually hot';
    else if (tempF >= 65) feel = 'warm and pleasant';
    else if (tempF >= 50) feel = 'mild';
    else if (tempF >= 32) feel = 'chilly';
    else if (tempF >= 15) feel = 'cold';
    else feel = 'bitterly cold';

    const displayPeriod = isWhiteNight ? 'White Night' : period;

    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${displayPeriod} · ${temp} · ${cond}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${displayPeriod}. Weather: ${temp}, ${cond.toLowerCase()} (${feel}) — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-st-petersburg')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await stPetersburgTemporalScript.getTemporalContext({ startDate }, { turnNumber }, {
          createSeededRandom,
        } as Partial<SettingsScriptHelpers> as any)
      ).plainText
    );
  }
}
