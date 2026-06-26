import { settingsScriptControlJSONSchema } from '../settings_script.js';
import { temporalContextSettingsScriptJSONSchema } from './temporal_script_types.js';

const EXAMPLE_CUSTOM_TEMPORAL_SCRIPT = `({
  name: 'My Calendar',
  description: 'A simple calendar and weather example.',
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

export function getTemporalScriptDocumentation(currentScriptSource: string): string {
  return `# Custom Temporal Context Script

You are being provided this document because the user needs your help customizing the temporal context in their Yozakura scenario.

Yozakura is an LLM-powered social simulation in which characters travel around a map and have conversations with each other via LLM completions. Each turn, every character gets to make a move. A "scenario" is the overall context that this happens in and is analogous to a save slot in a video game. Users can have multiple scenarios, but world state is completely separate between them.

The "temporal context" encapsulates diverse concepts including "date", "day of the week", "weather", and can also include more human elements, such economic conditions, wars breaking out, etc. Basically any scenario-wide state that changes over time (independently of the rest of the state) can be modeled as part of the temporal context. Date and weather are just the most obvious ones.

To achieve that level of customization, the user can provide a custom JavaScript script, which is what this document covers. The custom script receives the current turn number and returns a string shown in the scenario header and injected into AI character prompts, so AI characters are aware of the current state.

## Shape

A single JavaScript object expression (wrapped in parentheses, e.g. \`({ ... })\`) with:

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

${
  currentScriptSource
    ? `## Current Value

This is the current value of the script that the user wants your help editing. Keep in mind that it isn't necessarily correct or finished, it's just what's currently entered in the custom script input field.

\`\`\`js
${currentScriptSource}
\`\`\`

`
    : ''
}

## Instructions

- The script runs in a browser so you may use browser APIs such as fetch, and localStorage for caching. localStorage cannot be expected to persist between application sessions, but it's generally okay if results are only deterministic within sessions, not between them.
- You can use the latest JavaScript features and don't need to worry about supporting old browsers.
- You can expect the script to execute roughly once per minute on average.
- While the example script above is purposefully kept simple, most users will expect a bit more color, including temperatures, occasional extreme weather events, or similar. The script should help make the scenario feel alive.
- Assume the user is non-technical. No need to explain technical details unless they ask.
- Where there's a fitting emoji, use emojis in the displayHtml for added color.
- Write the script as the user asks, but if you think they might be missing out on opportunities for more colorful behavior, let them know at the end.
- Don't make anything configurable beyond the start date, unless the user asks you to, as this can create unnecessary complication. Feel free to suggest customization options to the user *after* you follow their instructions and write the initial script. It can be an iterative process.
- Assuming the user wants to have a concept of "days" (which isn't strictly necessary), double check with them how many turns per day they want and what the sub-day time periods should be called. Note that it's also technically possible to have days of varying length (might make sense in arctic scenarios or such).
- The overall workflow should be: follow the user's instructions and get something into their hands, then suggest improvements, then iterate together with the user if they wish to go further.
`;
}
