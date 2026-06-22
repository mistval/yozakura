import { settingsScriptControlJSONSchema } from '../settings_script.js';
import { temporalContextSettingsScriptJSONSchema } from './temporal_script_types.js';

const EXAMPLE_CUSTOM_TEMPORAL_SCRIPT = `({
  id: 'my-calendar',
  name: 'My Calendar',
  controls: () => [
    { id: 'startDate', type: 'calendar', label: 'Start date', width: 'full' },
  ],
  async getTemporalContext(controlValues, request, helpers) {
    const TURNS_PER_DAY = 4;
    const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];
    const dayIndex = Math.floor(request.turnNumber / TURNS_PER_DAY);
    const period = PERIODS[request.turnNumber % TURNS_PER_DAY];

    const start = new Date((controlValues.startDate || '2026-01-01') + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() + dayIndex);
    const dateLabel = start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    // Deterministic per-day weather: same date always yields the same result.
    const random = helpers.createSeededRandom(dateLabel);
    const sunny = random() > 0.5;

    return {
      displayHtml: '<b>' + dateLabel + '</b><br>' + period + (sunny ? ' · Sunny' : ' · Cloudy'),
      plainText: dateLabel + ', ' + period + (sunny ? ', Sunny' : ', Cloudy'),
      dayIndex,
    };
  },
})`;

export function getTemporalScriptDocumentation(): string {
  return `# Custom Temporal / Environmental Context Script

A temporal context script controls the date, time-of-day, weather, and any other environmental
context for a scenario. It receives the current turn number and returns a string shown in the
scenario header and injected into character prompts.

## Shape

A single JavaScript object expression (wrapped in parentheses, e.g. \`({ ... })\`) with:

- \`id\` (string) — unique id.
- \`name\` (string) — display name.
- \`controls\` (optional) — a function \`(context) => controls[]\` returning the settings controls to
  render. Each control's value is passed to \`getTemporalContext\` keyed by its id (always strings).
- \`getTemporalContext(controlValues, request, helpers)\` (async) — returns
  \`{ displayHtml, plainText, dayIndex? }\`:
  - \`displayHtml\`: shown in the header; may contain HTML such as \`<b>\` and \`<br>\`.
  - \`plainText\`: injected into prompts; no markup.
  - \`dayIndex\` (optional integer): increments once per in-world day. When it changes between turns,
    characters re-roll their daily auto-select wardrobes.
  - \`request\` is \`{ turnNumber }\`.
  - \`helpers\` is \`{ proxiedFetch, abortSignal, createSeededRandom }\`.
    \`createSeededRandom(seed)\` returns a deterministic \`() => number\` in [0, 1) — use it (seeded on
    the date) so the same date always yields the same weather.

## Control schema

\`\`\`json
${JSON.stringify(settingsScriptControlJSONSchema, null, 2)}
\`\`\`

## Script schema

\`\`\`json
${JSON.stringify(temporalContextSettingsScriptJSONSchema, null, 2)}
\`\`\`

## Example

\`\`\`js
${EXAMPLE_CUSTOM_TEMPORAL_SCRIPT}
\`\`\`
`;
}
