import { settingsScriptControlJSONSchema } from '../settings_script.js';
import { temporalContextSettingsScriptJSONSchema } from './temporal_script_types.js';

const EXAMPLE_CUSTOM_TEMPORAL_SCRIPT = `({
  id: 'my-calendar',
  name: 'My Calendar',
  description: 'A simple calendar and weather example. Replace this with what your script actually does.',
  controls: () => [
    { id: 'startDate', type: 'calendar', label: 'Start date', width: 'full' },
  ],
  async getTemporalContext(controlValues, request, helpers) {
    const TURNS_PER_DAY = 4;
    const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];
    const dayIndex = Math.floor(request.scenario.turnNumber / TURNS_PER_DAY);
    const period = PERIODS[request.scenario.turnNumber % TURNS_PER_DAY];

    const start = new Date((controlValues.startDate || '2026-01-01') + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() + dayIndex);
    const dateLabel = start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    // Deterministic per-day weather: same scenario+date always yields the same result.
    const random = helpers.createSeededRandom(request.scenario.id + '-' + dateLabel);
    const sunny = random() > 0.5;

    return {
      displayHtml: '<b>' + dateLabel + '</b><br>' + period + (sunny ? ' · Sunny' : ' · Cloudy'),
      plainText: dateLabel + ', ' + period + (sunny ? ', Sunny' : ', Cloudy'),
      dayIndex,
    };
  },
})`;

export function getTemporalScriptDocumentation(): string {
  return `# Custom Temporal Context Script

You are being provided this document because the user needs your help customizing the temporal context in their Yozakura scenario.

Yozakura is an LLM-powered social simulation in which characters travel around a map and have conversations with each other via LLM completions. Each turn, every character gets to make a move. A "scenario" is the overall context that this happens in and is analogous to a save slot in a video game. Users can have multiple scenarios, but world state is completely separate between them.

The "temporal context" encapsulates diverse concepts including "date", "day of the week", "weather", and can also include more human elements, such economic conditions, wars breaking out, etc. Basically any scenario-wide state that changes over time (independently of the rest of the state) can be modeled as part of the temporal context. Date and weather are just the most obvious ones.

To achieve that level of customization, the user can provide a custom JavaScript script, which is what this document covers. The custom script receives the current turn number and returns a string shown in the scenario header and injected into AI character prompts, so AI characters are aware of the current state.

## Shape

A single JavaScript object expression (wrapped in parentheses, e.g. \`({ ... })\`) with:

- \`id\` (string) — unique id.
- \`name\` (string) — display name.
- \`description\` (string, optional) — a short human-readable description of what the script does. Shown in the settings UI below the script selector.
- \`controls\` (optional) — a function \`(context) => controls[]\` returning the settings controls to render. Each control's value is passed to \`getTemporalContext\` keyed by its id (always strings). This allows the script to expose controls for the user to customize its behavior.
- \`getTemporalContext(controlValues, request, helpers)\` (async) — returns
  \`{ displayHtml, plainText, dayIndex? }\`:
  - \`displayHtml\`: shown in the header; may contain HTML such as \`<b>\` and \`<br>\`.
  - \`plainText\`: injected into prompts; no markup.
  - \`dayIndex\` (optional integer): increments once per in-world day. This is used to trigger a separate wardrobe autoselect feature which is intended to run "once per day".
  - \`request\` is \`{ scenario: { turnNumber, id } }\`. \`turnNumber\` is the current turn index. \`id\` is a unique string identifier for the scenario — include it in random seeds (e.g. \`\`\${request.scenario.id}-\${dateLabel}\`\`\`) so that two scenarios on the same date produce different weather.
  - \`helpers\` is \`{ proxiedFetch, abortSignal, createSeededRandom }\`.
    \`createSeededRandom(seed)\` returns a deterministic \`() => number\` in [0, 1) — use it (seeded on
    the scenario id + date) so the same scenario+date always yields the same weather.

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

## Instructions

- The script runs in a browser so you may use browser APIs such as fetch and localStorage, but do not expect localStorage to persist between application restarts.
- It's generally okay if it's not 100% deterministic between application restarts, so if the user wants to use live weather data, it's possible to do that and cache in localStorage while accepting the tradeoff of possible inconsistency between sessions.
- You can use the latest JavaScript features and don't need to worry about supporting old browsers.
- You can expect the script to run roughly once per minute on average, so caching isn't normally necessary, but you may cache in localStorage if you wish to.
- Write the script as the user asks, but if you think they might be missing out on some fun opportunity for more colorful customization, let them know at the end.
- Where there's a fitting emoji, use emojis in the displayHtml for added color.
- Assuming the user wants to have a concept of "days" (which isn't strictly necessary), confirm with them how many turns per day they want and what the sub-day time periods should be called. Note that it's also technically possible to have days of varying length (might make sense in arctic scenarios or such). Do NOT make number of turns per day configurable, unless the user specifically asks for that, as it can be an unwanted complication.
- Rather than making assumptions about what the user wants, ask them up front before racing off.
`;
}
