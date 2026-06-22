import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

export const saharaTemporalScript: TemporalContextSettingsScript = {
  id: 'sahara-weather',
  name: 'Sahara Desert',
  description:
    'An 8-turn-long-day weather/season simulation for the Sahara Desert. Tracks calendar date, time of day, extreme diurnal temperature swings, and severe events like sandstorms and extreme heat based on arid climate normals.',

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
    // Deserts heat up rapidly during the day and lose heat just as rapidly at night.
    const TEMP_FRAC = [0.0, 0.45, 0.85, 1.0, 0.75, 0.45, 0.2, 0.05];

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

    // --- Central Sahara monthly climate normals, °F + daily precip probability ---
    // Massive diurnal swings. Extremely low precipitation year-round.
    const MONTHLY = [
      { hi: 70, lo: 40, precip: 0.01 }, // Jan
      { hi: 75, lo: 45, precip: 0.01 }, // Feb
      { hi: 85, lo: 55, precip: 0.02 }, // Mar
      { hi: 96, lo: 65, precip: 0.02 }, // Apr
      { hi: 105, lo: 75, precip: 0.01 }, // May
      { hi: 112, lo: 82, precip: 0.0 }, // Jun
      { hi: 115, lo: 85, precip: 0.0 }, // Jul
      { hi: 113, lo: 84, precip: 0.01 }, // Aug
      { hi: 106, lo: 78, precip: 0.02 }, // Sep
      { hi: 95, lo: 65, precip: 0.02 }, // Oct
      { hi: 82, lo: 52, precip: 0.01 }, // Nov
      { hi: 72, lo: 42, precip: 0.01 }, // Dec
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

    // Extreme weather tailored to the Sahara
    const sandstorm = monthlyEvent('sandstorm', {
      months: [2, 3, 4, 5, 6, 7],
      chance: 0.25,
      minDur: 1,
      maxDur: 3,
    });
    const extremeHeat = monthlyEvent('heatwave', { months: [5, 6, 7, 8], chance: 0.4, minDur: 3, maxDur: 8 });
    const desertFreeze = monthlyEvent('freeze', { months: [11, 0, 1], chance: 0.15, minDur: 2, maxDur: 4 });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(isoDate);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (sandstorm) {
      hi = monthlyHi - 5; // Dust blocks out some sunlight
      lo = monthlyLo + 5; // Dust traps heat at night
      cond = 'Sandstorm';
      emoji = '🌪️';
      blurb = 'howling winds whipping up a blinding wall of sand and dust';
      alert = '⚠️ SEVERE SANDSTORM WARNING (HABOOB)';
    } else if (extremeHeat) {
      hi = 118 + Math.round(d() * 8); // 118–126
      lo = 88 + Math.round(d() * 6);
      cond = 'Extreme Heat';
      emoji = '🔥';
      blurb = 'lethal, blistering heat with relentless sun baking the dunes';
      alert = '🔥 EXTREME HEAT WARNING';
    } else if (desertFreeze) {
      hi = 60 + Math.round(d() * 5);
      lo = 28 + Math.round(d() * 5); // 28-33 (Freezing nights)
      cond = 'Cold Snap';
      emoji = '🥶';
      blurb = 'bitterly cold winds sweeping across the desert floor';
      alert = '❄️ FREEZE WARNING FOR NIGHTFALL';
    } else {
      // Ordinary desert day
      const shift = Math.round((d() * 2 - 1) * 6); // ±6°F variance
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;

      if (d() < precipChance) {
        cond = 'Desert Rain';
        emoji = '🌧️';
        blurb = 'a phenomenally rare, sudden downpour threatening flash floods';
        alert = '⚠️ FLASH FLOOD WATCH';
      } else {
        const sky = d();
        if (sky < 0.85) {
          cond = 'Clear';
          emoji = isDaylight ? '☀️' : '🌌';
          blurb = isDaylight ? 'unrelenting, cloudless skies' : 'crystal clear skies bursting with stars';
        } else if (sky < 0.95) {
          cond = 'Dusty / Hazy';
          emoji = '🌫️';
          blurb = 'a hazy sky thick with suspended sand particles';
        } else {
          cond = 'High Clouds';
          emoji = isDaylight ? '⛅' : '☁️';
          blurb = 'thin, wispy clouds providing no relief from the sun';
        }
      }
    }

    // Temperature for this period via the diurnal curve.
    const tempF = Math.round(lo + (hi - lo) * TEMP_FRAC[periodIndex]!);

    const useC = (controlValues.units ?? 'C') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    let feel;
    if (tempF >= 110) feel = 'dangerously hot';
    else if (tempF >= 95) feel = 'sweltering';
    else if (tempF >= 80) feel = 'hot';
    else if (tempF >= 65) feel = 'warm';
    else if (tempF >= 50) feel = 'mild';
    else if (tempF >= 35) feel = 'chilly';
    else feel = 'freezing cold';

    // --- Build outputs ---
    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${period}. Weather: ${temp} (${feel}), ${cond.toLowerCase()} — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-sahara')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await saharaTemporalScript.getTemporalContext({ startDate }, { turnNumber }, {
          createSeededRandom,
        } as Partial<SettingsScriptHelpers> as any)
      ).plainText
    );
  }
}
