import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import { resolveTemporalBasics, temporalControls, type TemporalDefaults } from '../builtin_utility.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

const TEMPORAL_DEFAULTS: TemporalDefaults = { tempFrac: [0.05, 0.4, 0.8, 1.0, 0.8, 0.55, 0.3, 0.12] };

export const shizuokaTemporalScript: TemporalContextSettingsScript = {
  id: 'shizuoka-weather',
  name: 'Shizuoka',
  description:
    'An 8-turn-long-day weather/season simulation for Shizuoka, Japan. Tracks calendar date, time of day, temperature, and seasonal events like the Tsuyu (rainy season) and typhoons based on Pacific coast climate normals.',

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
    ...temporalControls(TEMPORAL_DEFAULTS),
  ]) as SettingsScriptControlsDefinition,

  async getTemporalContext(controlValues, request, helpers): Promise<TemporalContext> {
    const {
      period,
      isDaylight,
      dayIndex,
      year,
      month,
      dom,
      daysInMonth,
      isoDate,
      dateLabel,
      tempFracAtPeriod,
    } = resolveTemporalBasics(controlValues, request.scenario.turnNumber, TEMPORAL_DEFAULTS);

    // --- Shizuoka Pacific Coast monthly climate normals, °F + daily precip probability ---
    // Winters are mild and famously sunny. Summers are hot, muggy, and wet.
    const MONTHLY = [
      { hi: 52, lo: 36, precip: 0.15 }, // Jan
      { hi: 54, lo: 37, precip: 0.2 }, // Feb
      { hi: 59, lo: 44, precip: 0.3 }, // Mar
      { hi: 66, lo: 52, precip: 0.35 }, // Apr
      { hi: 73, lo: 60, precip: 0.4 }, // May
      { hi: 79, lo: 67, precip: 0.6 }, // Jun (Start of Tsuyu)
      { hi: 86, lo: 75, precip: 0.5 }, // Jul (End of Tsuyu, heat starts)
      { hi: 89, lo: 77, precip: 0.4 }, // Aug (Typhoon season)
      { hi: 83, lo: 71, precip: 0.45 }, // Sep (Typhoon season)
      { hi: 74, lo: 61, precip: 0.35 }, // Oct
      { hi: 65, lo: 50, precip: 0.25 }, // Nov
      { hi: 56, lo: 40, precip: 0.15 }, // Dec
    ];
    const { hi: monthlyHi, lo: monthlyLo, precip: precipChance } = MONTHLY[month]!;

    // --- Deterministic per-month extreme-event scheduler ---
    const monthlyEvent = (
      type: string,
      cfg: { months: number[]; chance: number; minDur: number; maxDur: number }
    ) => {
      if (!cfg.months.includes(month)) return null;
      const r = helpers.createSeededRandom(`${request.scenario.id}-${year}-${month}-${type}`);
      if (r() >= cfg.chance) return null;
      const duration = cfg.minDur + Math.floor(r() * (cfg.maxDur - cfg.minDur + 1));
      const latestStart = Math.max(1, daysInMonth - duration);
      const startDom = 1 + Math.floor(r() * latestStart);
      return dom >= startDom && dom < startDom + duration;
    };

    // Extreme/Seasonal weather tailored to Shizuoka
    const typhoon = monthlyEvent('typhoon', { months: [7, 8, 9], chance: 0.25, minDur: 1, maxDur: 2 });
    const plumRain = monthlyEvent('tsuyu', { months: [5, 6], chance: 0.6, minDur: 4, maxDur: 10 }); // Prolonged rainy season
    const extremeHeat = monthlyEvent('heatwave', { months: [6, 7, 8], chance: 0.35, minDur: 3, maxDur: 7 });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(`${request.scenario.id}-${isoDate}`);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (typhoon) {
      hi = 78 + Math.round(d() * 8);
      lo = hi - (4 + Math.round(d() * 4));
      cond = 'Typhoon';
      emoji = '🌀';
      blurb = 'howling gales and horizontal, torrential rain sweeping in off the Pacific';
      alert = '⚠️ TYPHOON WARNING (SEVERE WIND & RAIN)';
    } else if (plumRain) {
      hi = monthlyHi - (2 + Math.round(d() * 4)); // Clouds keep highs down
      lo = monthlyLo + Math.round(d() * 3); // Clouds keep lows up
      cond = 'Plum Rain (Tsuyu)';
      emoji = '🌧️';
      blurb = 'persistently damp, grey, and dripping with steady, gloomy rain';
    } else if (extremeHeat) {
      hi = 92 + Math.round(d() * 6); // 92–98
      lo = 78 + Math.round(d() * 4); // Very warm nights
      cond = 'Intense Heat';
      emoji = '🥵';
      blurb = 'dangerously hot and thick with sweltering humidity';
      alert = '🔥 HEAT STROKE ALERT';
    } else {
      // Ordinary day
      const shift = Math.round((d() * 2 - 1) * 7); // ±7°F variance
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;
      const avg = (hi + lo) / 2;

      if (d() < precipChance) {
        if (avg <= 36) {
          cond = 'Sleet / Snow mix';
          emoji = '🌨️';
          blurb = 'a rare, damp mix of cold rain and wet snow flakes';
        } else {
          cond = 'Rain';
          emoji = '🌧️';
          blurb = 'steady showers';
        }
      } else {
        const sky = d();
        if (sky < 0.5) {
          cond = 'Clear';
          emoji = isDaylight ? '☀️' : '🌙';
          // FIX: Differentiate blurb based on daylight
          blurb = isDaylight
            ? month < 3 || month > 9
              ? 'crisp, beautifully clear skies'
              : 'bright and sunny'
            : 'clear and calm';
        } else if (sky < 0.8) {
          cond = 'Partly cloudy';
          emoji = isDaylight ? '⛅' : '☁️';
          // FIX: Differentiate blurb based on daylight
          blurb = isDaylight ? 'a mix of sun and passing clouds' : 'stars peeking through passing clouds';
        } else {
          cond = 'Overcast';
          emoji = '☁️';
          blurb = 'grey and overcast';
        }
      }
    }

    const tempF = Math.round(lo + (hi - lo) * tempFracAtPeriod);

    const useC = (controlValues.units ?? 'C') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    let feel;
    if (tempF >= 90) feel = 'oppressively hot';
    else if (tempF >= 80) feel = 'hot and muggy';
    else if (tempF >= 68) feel = 'warm and pleasant';
    else if (tempF >= 55) feel = 'mild';
    else if (tempF >= 42) feel = 'cool';
    else feel = 'chilly';

    // --- Build outputs ---
    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${period}. Weather: ${temp} (${feel}), ${cond.toLowerCase()} — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-shizuoka')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await shizuokaTemporalScript.getTemporalContext(
          { startDate },
          { scenario: { turnNumber, id: 'simulate' } },
          {
            createSeededRandom,
          } as Partial<SettingsScriptHelpers> as any
        )
      ).plainText
    );
  }
}
