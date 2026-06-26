import { createSeededRandom } from '../../seeded_random.js';
import type { SettingsScriptControlsDefinition, SettingsScriptHelpers } from '../../settings_script.js';
import type { TemporalContext, TemporalContextSettingsScript } from '../temporal_script_types.js';

export const titanTemporalScript: TemporalContextSettingsScript = {
  id: 'titan-weather',
  name: 'Titan',
  description:
    "A weather/season simulation for the Huygens landing site on Saturn's moon Titan — the only spot in the outer solar system with in-situ ground truth. Tracks Titan sols, the 29.5-year seasonal cycle, the cryogenic ~94 K surface, and the rare methane-cycle weather of the equatorial dune plains.",

  controls: (() => [
    { id: 'startDate', type: 'calendar', label: 'Start date (Earth)', default: '2026-06-01', width: 'full' },
    {
      id: 'units',
      type: 'dropdown_select',
      label: 'Temperature units',
      default: 'K',
      options: [
        { name: 'K (Kelvin)', value: 'K' },
        { name: '°C (Celsius)', value: 'C' },
        { name: '°F (Fahrenheit)', value: 'F' },
      ],
    },
  ]) as SettingsScriptControlsDefinition,

  async getTemporalContext(controlValues, request, helpers): Promise<TemporalContext> {
    // --- Titan time model -----------------------------------------------------
    // Titan is tidally locked to Saturn, so a Titan solar day ("sol") equals its
    // orbital period: ~15.945 Earth days. We map one in-world day = one sol = 8
    // turns, so each period below is ~2 Earth days long. At the near-equatorial
    // Huygens site (~10°S) the sun is above the horizon ~half the sol year-round,
    // so day/night is a clean 4/4 split. The thick haze means the sun is never a
    // visible disc — "day" is just a dim, smog-orange glow ~1000x fainter than
    // Earth noon, and night is near-total darkness (the haze hides stars/Saturn).
    const TURNS_PER_SOL = 8;
    const PERIODS = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Evening', 'Deep Night', 'Pre-Dawn'];
    const EARTH_DAYS_PER_SOL = 15.945; // Titan rotation = orbit about Saturn
    const TITAN_YEAR_DAYS = 10759.22; // Saturn's orbital period in Earth days = one Titan year
    const DAY_MS = 86_400_000;
    // Saturn/Titan northern spring equinox, Lₛ 0°. Real ephemeris anchor so the
    // displayed season is astronomically correct for the displayed Earth date.
    const EQUINOX_EPOCH_MS = Date.UTC(2009, 7, 11);

    const solIndex = Math.floor(request.scenario.turnNumber / TURNS_PER_SOL);
    const periodIndex = ((request.scenario.turnNumber % TURNS_PER_SOL) + TURNS_PER_SOL) % TURNS_PER_SOL;
    const period = PERIODS[periodIndex]!;
    const phase = periodIndex === 0 || periodIndex === 4 ? 'twilight' : periodIndex < 4 ? 'day' : 'night';

    // --- Resolve absolute time, Earth date, and Titan season (Lₛ) -------------
    const startMs = Date.parse(`${controlValues.startDate ?? '2026-06-01'}T00:00:00Z`);
    const nowMs = startMs + solIndex * EARTH_DAYS_PER_SOL * DAY_MS;
    const earthLabel = new Date(nowMs).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

    const daysSinceEquinox = (nowMs - EQUINOX_EPOCH_MS) / DAY_MS;
    // Linear solar longitude. (Saturn's 0.056 eccentricity makes the real seasons
    // slightly unequal in length — southern summers shorter and a touch warmer —
    // but a linear Lₛ is plenty for the scene-setting here.)
    let Ls = ((daysSinceEquinox / TITAN_YEAR_DAYS) * 360) % 360;
    if (Ls < 0) Ls += 360;
    const LsRounded = Math.round(Ls);
    const SEASONS = ['Northern Spring', 'Northern Summer', 'Northern Autumn', 'Northern Winter'];
    const season = SEASONS[Math.floor(Ls / 90) % 4]!;

    // Equatorial weather is driven by the equinoxes: clouds and the methane
    // cycle concentrate at the summer pole, but as the sub-solar point crosses
    // the equator (Lₛ 0° / 180°) convective methane clouds and rare storms reach
    // the equator — exactly as Cassini observed around the 2009–2010 equinox.
    const angDist = (a: number, b: number) => {
      const diff = Math.abs(a - b) % 360;
      return diff > 180 ? 360 - diff : diff;
    };
    const distToEquinox = Math.min(angDist(Ls, 0), angDist(Ls, 180));
    const cloudActivity = Math.max(0, 1 - distToEquinox / 45); // 1 at equinox → 0 by 45° away

    // --- Rare multi-sol events, scheduled once per equinox passage ------------
    const equinoxPass = Math.round(daysSinceEquinox / (TITAN_YEAR_DAYS / 2));
    const nearestEquinoxMs = EQUINOX_EPOCH_MS + equinoxPass * (TITAN_YEAR_DAYS / 2) * DAY_MS;
    const nearestEquinoxSol = Math.round((nearestEquinoxMs - startMs) / (EARTH_DAYS_PER_SOL * DAY_MS));
    const equinoxEvent = (
      type: string,
      prob: number,
      maxOffsetSols: number,
      minDur: number,
      maxDur: number
    ) => {
      const r = helpers.createSeededRandom(`${request.scenario.id}-titan-${type}-${equinoxPass}`);
      if (r() >= prob) return false;
      const startSol = nearestEquinoxSol + Math.round((r() * 2 - 1) * maxOffsetSols);
      const duration = minDur + Math.floor(r() * (maxDur - minDur + 1));
      return solIndex >= startSol && solIndex < startSol + duration;
    };
    const cloudburst = equinoxEvent('cloudburst', 0.7, 12, 1, 3);
    const windstorm = !cloudburst && equinoxEvent('windstorm', 0.5, 18, 1, 2);

    // --- Per-sol weather, stable for a given scenario + sol -------------------
    const d = helpers.createSeededRandom(`${request.scenario.id}-titan-sol-${solIndex}`);

    // Surface temperature in Kelvin. Huygens measured 93.7 K at the surface, and
    // Titan's enormous atmospheric heat capacity damps all variation to a fraction
    // of a kelvin — the near-constancy is the point. Equator is warmest near the
    // equinoxes (peak insolation overhead), faintly cooler at the solstices.
    const TITAN_BASE_K = 93.7;
    const DIURNAL_K = [-0.2, 0.1, 0.4, 0.45, 0.2, -0.1, -0.3, -0.35]; // ~0.8 K peak-to-peak
    const seasonalK = 0.5 * Math.cos((2 * Ls * Math.PI) / 180); // +0.5 at equinox, −0.5 at solstice
    let tempK = TITAN_BASE_K + seasonalK + DIURNAL_K[periodIndex]! + (d() * 2 - 1) * 0.3;

    let cond, emoji, blurb;
    let alert: string | undefined;

    if (cloudburst) {
      tempK -= 0.9;
      cond = 'Methane Cloudburst';
      emoji = '⛈️';
      // Low gravity (0.14 g) + dense air → fat ~1 cm methane drops that drift down slowly.
      blurb =
        'a rare equatorial methane storm — fat, slow drops drumming the dunes and braiding fresh runoff down the long-dry channels';
      alert = '⛈️ METHANE RAINSTORM · FLASH RUNOFF IN THE CHANNELS';
    } else if (windstorm) {
      tempK -= 0.2;
      cond = 'Dune Windstorm';
      emoji = '🌬️';
      blurb =
        'strengthening equinox winds peeling dark hydrocarbon sand off the dune crests, dimming the orange sky to a murky brown';
      alert = '🌬️ HIGH WINDS · LIFTED HYDROCARBON SAND';
    } else {
      const roll = d();
      const drizzleChance = 0.15 * cloudActivity;
      const cloudChance = 0.05 + 0.45 * cloudActivity;
      const mistChance = (phase === 'night' ? 0.18 : 0.06) + 0.1 * cloudActivity;

      if (roll < drizzleChance) {
        tempK -= 0.4;
        cond = 'Methane Drizzle';
        emoji = '🌧️';
        blurb = 'a faint, oily methane drizzle beading on the frigid ice-and-sand ground';
      } else if (roll < drizzleChance + cloudChance) {
        tempK -= 0.3;
        cond = 'Methane Clouds';
        emoji = '☁️';
        blurb =
          phase === 'night'
            ? 'unseen methane clouds thickening the blackness overhead'
            : 'ragged methane clouds drifting through the orange haze';
      } else if (roll < drizzleChance + cloudChance + mistChance) {
        cond = 'Methane Mist';
        emoji = '🌫️';
        blurb =
          'a low methane mist clinging to the cold dune plains, the near-surface air close to its dewpoint';
      } else if (phase === 'night') {
        cond = 'Clear Haze';
        emoji = '🌑';
        blurb =
          'profound darkness — the haze swallows the stars and Saturn alike while the ground radiates its faint cold';
      } else if (phase === 'twilight') {
        cond = 'Hazy';
        emoji = '🟤';
        blurb =
          periodIndex === 0
            ? 'the slow brightening of dawn, the haze warming from brown to dull orange'
            : 'the long fade of dusk, the orange glow draining toward brown';
      } else {
        cond = 'Hazy';
        emoji = '🟠';
        blurb =
          'the usual dim, smog-orange daylight — roughly a thousand times fainter than Earth noon — over still, dry dunes';
      }
    }

    const useUnit = (controlValues.units ?? 'K') as 'K' | 'C' | 'F';
    const tempC = tempK - 273.15;
    const tempF = (tempC * 9) / 5 + 32;
    const temp =
      useUnit === 'C'
        ? `${tempC.toFixed(1)} °C (${tempK.toFixed(1)} K)`
        : useUnit === 'F'
          ? `${tempF.toFixed(1)} °F (${tempK.toFixed(1)} K)`
          : `${tempK.toFixed(1)} K (${tempC.toFixed(1)} °C)`;

    const condLower = cond.toLowerCase();

    let displayHtml =
      `<b>${season} · Lₛ ${LsRounded}°</b><br>` +
      `${emoji} ${period} · ${temp} · ${cond}<br>` +
      `Titan · Sol ${solIndex + 1} · ≈ ${earthLabel}`;
    if (alert) displayHtml += `<br><b>${alert}</b>`;

    let plainText =
      `Titan — Huygens landing site, the equatorial Shangri-La dune plains. ` +
      `${season}, Lₛ ${LsRounded}°. Sol ${solIndex + 1}, ${period} (≈ ${earthLabel} Earth). ` +
      `${temp}: ${condLower} — ${blurb}. ` +
      `Atmosphere: dense nitrogen–methane haze, ~1.47 bar, gravity 0.14 g; unprotected human exposure is instantly fatal.`;
    if (alert) plainText += ' A severe weather alert is in effect.';

    return { displayHtml, plainText, dayIndex: solIndex };
  },
};

if ((globalThis as any)?.process?.argv.includes('--simulate-weather-titan')) {
  const startDate = '2024-05-01';
  const totalTurns = 400 * 8;

  for (let turnNumber = 0; turnNumber < totalTurns; ++turnNumber) {
    console.log(
      (
        await titanTemporalScript.getTemporalContext(
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
