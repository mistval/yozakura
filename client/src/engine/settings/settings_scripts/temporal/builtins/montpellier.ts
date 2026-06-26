import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import { resolveTemporalBasics, temporalControls, type TemporalDefaults } from '../builtin_utility.js';
import type { TemporalContext, TemporalContextBuiltInSettingsScript } from '../temporal_script_types.js';

const TEMPORAL_DEFAULTS: TemporalDefaults = { tempFrac: [0.05, 0.4, 0.8, 1.0, 0.8, 0.55, 0.3, 0.12] };

export const montpellierTemporalScript: TemporalContextBuiltInSettingsScript = {
  id: 'montpellier-weather',
  name: 'Montpellier',
  description:
    'An 8-turn-long-day weather/season simulation for Montpellier, France. Tracks calendar date, time of day, temperature, and Mediterranean climate events like the summer Canicule and autumn Épisodes Cévenols.',

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
      periodIndex,
      isDaylight,
      dayIndex,
      year,
      month,
      dom,
      daysInMonth,
      isoDate,
      dateLabel,
      tempFrac,
      tempFracAtPeriod,
    } = resolveTemporalBasics(controlValues, request.scenario.turnNumber, TEMPORAL_DEFAULTS);

    // Coldest part of the day (≈ pre-dawn) from the temperature curve — when calm,
    // clear nights leave radiation fog on the plain. Derived from the curve so it
    // tracks whatever periods the user configures rather than fixed indices.
    const peakIndex = tempFrac.indexOf(Math.max(...tempFrac));

    // --- Montpellier Mediterranean monthly climate normals, °F + daily precip probability ---
    // Mild winters, hot and very dry summers.
    const MONTHLY = [
      { hi: 53, lo: 37, precip: 0.2 }, // Jan
      { hi: 55, lo: 38, precip: 0.18 }, // Feb
      { hi: 61, lo: 43, precip: 0.18 }, // Mar
      { hi: 66, lo: 48, precip: 0.22 }, // Apr
      { hi: 73, lo: 55, precip: 0.18 }, // May
      { hi: 81, lo: 62, precip: 0.12 }, // Jun
      { hi: 86, lo: 66, precip: 0.05 }, // Jul
      { hi: 86, lo: 66, precip: 0.08 }, // Aug
      { hi: 79, lo: 60, precip: 0.18 }, // Sep
      { hi: 70, lo: 54, precip: 0.25 }, // Oct
      { hi: 60, lo: 45, precip: 0.22 }, // Nov
      { hi: 54, lo: 39, precip: 0.2 }, // Dec
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

    // Extreme weather tailored to southern France
    const canicule = monthlyEvent('canicule', { months: [5, 6, 7], chance: 0.35, minDur: 3, maxDur: 8 });
    const cevenol = monthlyEvent('cevenol', { months: [8, 9, 10], chance: 0.2, minDur: 1, maxDur: 3 });
    const tramontane = monthlyEvent('tramontane', {
      months: [11, 0, 1, 2],
      chance: 0.3,
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

    if (canicule) {
      hi = 95 + Math.round(d() * 9); // 95-104°F (35-40°C)
      lo = 73 + Math.round(d() * 6); // Warm, stagnant nights
      cond = 'Canicule (Heatwave)';
      emoji = '🥵';
      // FIX: Differentiate blurb based on daylight
      blurb = isDaylight
        ? 'blistering, stagnant heat under a relentless Mediterranean sun'
        : 'stifling, stagnant heat with no relief even after dark';
      alert = '🔥 CANICULE (HEATWAVE) ALERT - ALERTE ROUGE';
    } else if (cevenol) {
      hi = monthlyHi - 3;
      lo = monthlyLo + 5;
      cond = 'Mediterranean Storm';
      emoji = '⛈️';
      blurb = 'torrential, stationary thunderstorms bringing extreme rainfall';
      alert = '⚠️ ÉPISODE CÉVENOL: FLASH FLOOD WARNING';
    } else if (tramontane) {
      hi = monthlyHi - (3 + Math.round(d() * 4));
      lo = monthlyLo - (4 + Math.round(d() * 5));
      cond = 'Tramontane Winds';
      emoji = '🌬️';
      blurb = 'fierce, biting northwesterly winds sweeping beneath crystal-clear skies';
      alert = '⚠️ STRONG WIND WARNING (TRAMONTANE)';
    } else {
      // Ordinary day
      const shift = Math.round((d() * 2 - 1) * 7); // ±7°F variance
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;
      const avg = (hi + lo) / 2;

      if (d() < precipChance) {
        if (avg <= 34) {
          // Snow is exceptionally rare in Montpellier, but possible in dead of winter
          cond = 'Sleet / Snow mix';
          emoji = '🌨️';
          blurb = 'a rare, wet wintry mix';
        } else {
          cond = 'Rain';
          emoji = '🌧️';
          blurb = 'steady showers';
        }
      } else {
        const sky = d();
        // Calm, clear autumn/winter nights leave radiation fog pooling over the
        // Languedoc plain in the cold early hours, which then burns off to sun. The
        // "early, still-cold" window is read off the temperature curve (rising limb,
        // well below the day's peak) so it holds for any configured period scheme.
        const coldEarly = periodIndex < peakIndex && tempFracAtPeriod < 0.45;
        const foggyMorning = (month >= 9 || month <= 1) && coldEarly && sky < 0.55;
        // The Mediterranean climate is famous for its sunshine
        if (foggyMorning) {
          cond = 'Morning fog';
          emoji = '🌫️';
          blurb = 'a still, grey radiation fog pooled over the plain, waiting for the sun to burn it off';
        } else if (sky < 0.65) {
          cond = 'Clear';
          emoji = isDaylight ? '☀️' : '🌙';
          blurb = isDaylight ? 'brilliantly sunny skies' : 'clear, starry and calm';
        } else if (sky < 0.85) {
          cond = 'Partly cloudy';
          emoji = isDaylight ? '⛅' : '☁️';
          // FIX: Differentiate blurb based on daylight
          blurb = isDaylight
            ? 'sunshine mixed with a few passing clouds'
            : 'stars peeking through a few passing clouds';
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
    if (tempF >= 90) feel = 'sweltering';
    else if (tempF >= 78) feel = 'hot';
    else if (tempF >= 65) feel = 'warm';
    else if (tempF >= 55) feel = 'mild';
    else if (tempF >= 42) feel = 'cool';
    else feel = 'cold';

    // --- Build outputs ---
    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}<br>${blurb}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText = `${dateLabel}, ${period}. Weather: ${temp} (${feel}), ${cond.toLowerCase()} — ${blurb}.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-montpellier')) {
  const startDate = '2025-01-01';
  const totalTurns = 365 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await montpellierTemporalScript.getTemporalContext(
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
