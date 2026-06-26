import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import { resolveTemporalBasics, temporalControls, type TemporalDefaults } from '../builtin_utility.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

const TEMPORAL_DEFAULTS: TemporalDefaults = { tempFrac: [0.05, 0.4, 0.8, 1.0, 0.8, 0.55, 0.3, 0.12] };

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
    ...temporalControls(TEMPORAL_DEFAULTS),
  ]) as SettingsScriptControlsDefinition,

  async getTemporalContext(controlValues, request, helpers): Promise<TemporalContext> {
    const {
      period,
      periodIndex,
      turnsPerDay,
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

    // Locate the day's heat peak (≈ mid-afternoon) from the temperature curve.
    // Using the curve rather than fixed period indices keeps the diurnal weather
    // correct no matter how many time periods the user configures.
    const peakIndex = tempFrac.indexOf(Math.max(...tempFrac));
    const stormSpan = Math.max(1, Math.round(turnsPerDay / 4));

    // --- Bali (Denpasar) monthly climate normals, °F + daily precip probability ---
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

    const d = helpers.createSeededRandom(`${request.scenario.id}-${isoDate}`);

    let hi,
      lo,
      cond,
      emoji,
      blurb,
      alert = null;

    if (tropicalCyclone) {
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
      hi = 93 + Math.round(d() * 5);
      lo = 80 + Math.round(d() * 3);
      cond = 'Extreme Heat';
      emoji = '🥵';
      blurb = isDaylight
        ? 'oppressive, humid heat with a high UV index'
        : 'stifling, humid heat with no relief after dark';
      alert = '🔥 EXTREME HEAT ADVISORY';
    } else {
      const shift = Math.round((d() * 2 - 1) * 4);
      hi = monthlyHi + shift;
      lo = monthlyLo + shift;

      // Tropical sea-breeze convection drives Bali's daily rhythm: humid clear
      // mornings, cumulus towering up toward the heat of the day, storms breaking
      // around and just after the peak, then easing overnight. So a "rain day" is
      // really an afternoon-storm day, not all-day rain.
      const convectiveDay = d() < precipChance;
      const heavy = d() < 0.4; // thunderstorm vs. steady rain when the storm breaks
      const sky = d();

      const building = periodIndex < peakIndex; // warming toward the heat of the day
      const storming = periodIndex >= peakIndex && periodIndex <= peakIndex + stormSpan;

      if (convectiveDay && building && tempFracAtPeriod < 0.6) {
        // Early, still-cool part of the day — calm before the build-up
        cond = 'Humid & hazy';
        emoji = '🌥️';
        blurb = 'a warm, hazy morning with cumulus already piling up over the interior hills';
      } else if (convectiveDay && building) {
        // Heating up fast toward the peak — towers building
        cond = 'Building storms';
        emoji = '🌦️';
        blurb = 'a sticky build-up with thunderheads boiling over the volcanic spine of the island';
      } else if (convectiveDay && storming) {
        // At and just past the heat peak — the storm breaks
        cond = heavy ? 'Thunderstorms' : 'Tropical Rain';
        emoji = heavy ? '⛈️' : '🌧️';
        blurb = heavy
          ? 'a heavy afternoon thunderstorm cracking over the island, warm rain drenching everything'
          : 'warm, heavy tropical rain pouring straight down in dense sheets';
      } else if (convectiveDay) {
        // Late, after the storm window — showers trailing off
        cond = 'Easing Showers';
        emoji = '🌧️';
        blurb = 'the last of the day’s showers trailing off into a steamy, dripping night';
      } else if (sky < 0.45) {
        cond = 'Clear';
        emoji = isDaylight ? '☀️' : '🌙';
        blurb = isDaylight ? 'clear skies and strong tropical sun' : 'clear and balmy under the stars';
      } else if (sky < 0.8) {
        cond = 'Partly cloudy';
        emoji = isDaylight ? '⛅' : '☁️';
        blurb = isDaylight
          ? 'a mix of tropical sun and scattered clouds'
          : 'scattered clouds drifting in the warm night air';
      } else {
        cond = 'Overcast';
        emoji = '☁️';
        blurb = 'grey and overcast but still humid';
      }
    }

    const tempF = Math.round(lo + (hi - lo) * tempFracAtPeriod);
    const useC = (controlValues.units ?? 'C') === 'C';
    const temp = `${useC ? Math.round(((tempF - 32) * 5) / 9) : tempF}${useC ? '°C' : '°F'}`;

    let feel;
    if (tempF >= 90) feel = 'sweltering and humid';
    else if (tempF >= 82) feel = 'hot and muggy';
    else if (tempF >= 75) feel = 'warm and balmy';
    else feel = 'pleasantly mild';

    let displayHtml = `<b>${dateLabel}</b><br>${emoji} ${period} · ${temp} · ${cond}<br>${blurb}`;
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
        await baliTemporalScript.getTemporalContext(
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
