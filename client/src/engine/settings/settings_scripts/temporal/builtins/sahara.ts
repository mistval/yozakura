import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import { resolveTemporalBasics, temporalControls, type TemporalDefaults } from '../builtin_utility.js';
import type { TemporalContext, TemporalContextBuiltInSettingsScript } from '../temporal_script_types.js';

const TEMPORAL_DEFAULTS: TemporalDefaults = { tempFrac: [0.0, 0.45, 0.85, 1.0, 0.75, 0.45, 0.2, 0.05] };

export const saharaTemporalScript: TemporalContextBuiltInSettingsScript = {
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

    // --- Central Sahara monthly climate normals, °F + daily precip probability ---
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

    const sandstorm = monthlyEvent('sandstorm', {
      months: [2, 3, 4, 5, 6, 7],
      chance: 0.25,
      minDur: 1,
      maxDur: 3,
    });
    const extremeHeat = monthlyEvent('heatwave', { months: [5, 6, 7, 8], chance: 0.4, minDur: 3, maxDur: 8 });
    const desertFreeze = monthlyEvent('freeze', { months: [11, 0, 1], chance: 0.15, minDur: 2, maxDur: 4 });
    // The Harmattan: a dry, dust-laden north-easterly that hazes over the desert
    // through the winter, suppressing daytime highs and smothering the horizon.
    const harmattan = monthlyEvent('harmattan', {
      months: [10, 11, 0, 1, 2],
      chance: 0.35,
      minDur: 2,
      maxDur: 5,
    });

    // --- Per-day randomness, stable for a given calendar date ---
    const d = helpers.createSeededRandom(`${request.scenario.id}-${isoDate}`);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (sandstorm) {
      hi = monthlyHi - 5;
      lo = monthlyLo + 5;
      cond = 'Sandstorm';
      emoji = '🌪️';
      blurb = 'howling winds whipping up a blinding wall of sand and dust';
      alert = '⚠️ SEVERE SANDSTORM WARNING (HABOOB)';
    } else if (extremeHeat) {
      hi = 118 + Math.round(d() * 8);
      lo = 88 + Math.round(d() * 6);
      cond = 'Extreme Heat';
      emoji = '🔥';
      // FIX: Differentiate blurb based on daylight
      blurb = isDaylight
        ? 'lethal, blistering heat with relentless sun baking the dunes'
        : 'oppressive, stagnant heat holding onto the day’s warmth';
      alert = '🔥 EXTREME HEAT WARNING';
    } else if (desertFreeze) {
      hi = 60 + Math.round(d() * 5);
      lo = 28 + Math.round(d() * 5);
      cond = 'Cold Snap';
      emoji = '🥶';
      blurb = 'bitterly cold winds sweeping across the desert floor';
      alert = '❄️ FREEZE WARNING FOR NIGHTFALL';
    } else if (harmattan) {
      hi = monthlyHi - (4 + Math.round(d() * 4)); // dust dims the sun, holding the high down
      lo = monthlyLo - Math.round(d() * 3); // dry, cool nights under the dust pall
      cond = 'Harmattan Haze';
      emoji = '🌫️';
      blurb = isDaylight
        ? 'a thick, dust-laden Harmattan wind off the deep desert, blotting the sun to a pale, sickly disc'
        : 'a dry, dusty Harmattan hissing through the dark, the stars smothered behind suspended dust';
      alert = '⚠️ HARMATTAN: REDUCED VISIBILITY IN BLOWING DUST';
    } else {
      const shift = Math.round((d() * 2 - 1) * 6);
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
          // FIX: Differentiate blurb based on daylight
          blurb = isDaylight
            ? 'thin, wispy clouds providing no relief from the sun'
            : 'wispy clouds drifting over the cooling dunes';
        }
      }
    }

    const tempF = Math.round(lo + (hi - lo) * tempFracAtPeriod);
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

    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}<br>${blurb}`;
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
        await saharaTemporalScript.getTemporalContext(
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
