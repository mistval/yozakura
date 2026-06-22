import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

export const newYorkTemporalScript: TemporalContextSettingsScript = {
  id: 'nyc-weather',
  name: 'New York City',
  description:
    'An 8-turn-long-day weather/season simulation for New York City. Tracks calendar date, time of day, temperature, and occasional severe weather events based on historical climate normals.',

  controls: (() => [
    { id: 'startDate', type: 'calendar', label: 'Start date', default: '2026-06-01', width: 'full' },
    {
      id: 'units',
      type: 'dropdown_select',
      label: 'Temperature units',
      default: 'F',
      options: [
        { name: '°F (Fahrenheit)', value: 'F' },
        { name: '°C (Celsius)', value: 'C' },
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

    // --- NYC (Central Park) monthly climate normals, °F + daily precip probability ---
    const MONTHLY = [
      { hi: 39, lo: 27, precip: 0.34 }, // Jan
      { hi: 42, lo: 29, precip: 0.32 }, // Feb
      { hi: 50, lo: 35, precip: 0.36 }, // Mar
      { hi: 61, lo: 44, precip: 0.34 }, // Apr
      { hi: 71, lo: 54, precip: 0.36 }, // May
      { hi: 79, lo: 63, precip: 0.33 }, // Jun
      { hi: 85, lo: 69, precip: 0.34 }, // Jul
      { hi: 83, lo: 68, precip: 0.35 }, // Aug
      { hi: 76, lo: 60, precip: 0.3 }, // Sep
      { hi: 65, lo: 50, precip: 0.28 }, // Oct
      { hi: 54, lo: 41, precip: 0.31 }, // Nov
      { hi: 44, lo: 33, precip: 0.34 }, // Dec
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

    const blizzard = monthlyEvent('blizzard', { months: [11, 0, 1, 2], chance: 0.22, minDur: 1, maxDur: 2 });
    const hurricane = monthlyEvent('hurricane', { months: [7, 8, 9], chance: 0.12, minDur: 1, maxDur: 2 });
    const heatWave = monthlyEvent('heatwave', { months: [5, 6, 7, 8], chance: 0.3, minDur: 3, maxDur: 6 });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(isoDate);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (blizzard) {
      hi = 22 + Math.round(d() * 8); // 22–30
      lo = hi - (8 + Math.round(d() * 6));
      cond = 'Blizzard';
      emoji = '❄️';
      blurb = 'heavy snow, howling wind and near-zero visibility';
      alert = '⚠️ BLIZZARD WARNING';
    } else if (hurricane) {
      hi = 68 + Math.round(d() * 10); // 68–78
      lo = hi - (5 + Math.round(d() * 5));
      cond = 'Hurricane';
      emoji = '🌀';
      blurb = 'torrential rain and violent wind lashing the city';
      alert = '🌀 HURRICANE WARNING';
    } else if (heatWave) {
      hi = 93 + Math.round(d() * 9); // 93–102
      lo = 74 + Math.round(d() * 8);
      cond = 'Heat wave';
      emoji = '🥵';
      // FIX: Differentiate blurb based on daylight
      blurb = isDaylight
        ? 'oppressive, hazy heat under the baking sun'
        : 'oppressive, stagnant heat with little relief even after dark';
      alert = '🔥 EXCESSIVE HEAT WARNING';
    } else {
      const shift = Math.round((d() * 2 - 1) * 10); // ±10°F
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;
      const avg = (hi + lo) / 2;

      if (d() < precipChance) {
        if (avg <= 33) {
          cond = 'Snow';
          emoji = '🌨️';
          blurb = 'snow falling steadily';
        } else if (avg <= 38) {
          cond = 'Wintry mix';
          emoji = '🌨️';
          blurb = 'a cold, sloppy wintry mix';
        } else {
          cond = 'Rain';
          emoji = '🌧️';
          blurb = 'steady rain';
        }
      } else {
        const sky = d();
        if (sky < 0.45) {
          cond = 'Clear';
          emoji = isDaylight ? '☀️' : '🌙';
          blurb = isDaylight ? 'clear skies' : 'clear and calm';
        } else if (sky < 0.78) {
          cond = 'Partly cloudy';
          emoji = isDaylight ? '⛅' : '☁️';
          // FIX: Differentiate blurb based on daylight
          blurb = isDaylight ? 'a mix of sun and clouds' : 'clouds drifting under the night sky';
        } else {
          cond = 'Overcast';
          emoji = '☁️';
          blurb = 'grey and overcast';
        }
      }
    }

    const tempF = Math.round(lo + (hi - lo) * TEMP_FRAC[periodIndex]!);
    const useC = (controlValues.units ?? 'F') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    let feel;
    if (tempF >= 90) feel = 'sweltering';
    else if (tempF >= 78) feel = 'warm';
    else if (tempF >= 60) feel = 'mild';
    else if (tempF >= 45) feel = 'cool';
    else if (tempF >= 32) feel = 'cold';
    else feel = 'frigid';

    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${period}. Weather: ${temp} (${feel}), ${cond.toLowerCase()} — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-new-york')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await newYorkTemporalScript.getTemporalContext({ startDate }, { turnNumber }, {
          createSeededRandom,
        } as Partial<SettingsScriptHelpers> as any)
      ).plainText
    );
  }
}
