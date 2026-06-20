export const imageScriptDocumentationTemplate = `# Yozakura Custom Image Generation Script

You are being provided this document because the user needs your help writing or editing a Yozakura **custom image generation settings script**.

Yozakura is an LLM-powered social simulation. It can generate images (in-chat "scene" images and character "card" portraits) by calling an image generation API. A settings script describes, entirely as data + a couple of functions, how to render the provider's settings UI and how to perform a generation request. Built-in providers (AUTOMATIC1111, OpenRouter) are themselves settings scripts; a "Custom" script lets the user support any other provider.

The script runs **inside the user's web browser**. To avoid CORS issues, do not call \`fetch\` directly against the provider — use the \`proxiedFetch\` helper described below, which tunnels the request through Yozakura's backend and returns a normal \`Response\`.

## What you must produce

A single JavaScript **object expression** (the whole thing wrapped in parentheses, e.g. \`({ ... })\`) that conforms to the schema below. It must have at least \`id\`, \`name\`, and an async \`generateImages\` function. \`controls\` (a function \`(context) => controls[]\` returning the controls to render) and \`buttonHandler\` are optional.

### Script object schema
<schema>
<%= it.scriptSchema %>
</schema>

### Control schema (each entry returned by the \`controls\` function)
<schema>
<%= it.controlSchema %>
</schema>

## Key contracts

- **Control values are always strings.** \`number\` controls give you a numeric *string* — parse with \`Number(...)\`. \`json\` controls give you a JSON *string* — parse with \`JSON.parse(...)\`. \`dropdown_select\` gives the selected option's \`value\`.
- **\`generateImages(controlValues, request, helpers)\`** must perform the request(s) and return an array of \`{ readableStream }\` objects, where \`readableStream\` is a web \`ReadableStream\` of the image bytes. Only the first result is used currently.
  - \`controlValues\`: \`{ [controlId]: string }\` for the controls you declared.
  - \`request\`: \`{ prompt, context }\` — \`prompt\` is the full image prompt string; \`context.promptType\` is \`"scene"\` or \`"character_card"\` (use it to pick chat-size vs card-size controls).
  - \`helpers\`: \`{ proxiedFetch, abortSignal, loadUserTextFile }\`. \`proxiedFetch(url, init)\` is fetch-shaped (\`init\` = \`{ method, headers, body }\`, body a string) and returns a \`Response\` mirroring the upstream status/content-type/body. Call it as many times as you need (e.g. to download an image URL the API returns, or to poll a long-running job). It is already wired to \`abortSignal\`.
- **\`buttonHandler(buttonId, controlValues, helpers)\`** is called when a \`button\` control is clicked. Return \`{ result: "success" | "failure", resultDescription: "<message shown to the user>", data?: <anything> }\`. Use it for things like a "Test Connection" button; the optional \`data\` is fed back to your \`controls\` function (see Advanced).
- Saved images are assumed to be PNG.

## Advanced

- **Populating controls from a button.** \`controls\` is a function \`(context) => controls[]\` where \`context\` is \`{ controlValues, buttonData }\`. \`buttonData[buttonId]\` holds the \`data\` a button handler returned, so a "Connect"-style button can load choices and populate \`dropdown_select\` controls — e.g. the handler returns \`{ result: "success", resultDescription: "…", data: { models: [{ name, value }] } }\` and \`controls\` reads \`buttonData.connect?.models\` as a dropdown's \`options\`.
- **User-editable files.** A \`text_file_list\` control lets the user keep named text files (e.g. ComfyUI workflows) that are too large for ordinary settings. Its stored value is the selected file's **id**; load the content at run time with \`await helpers.loadUserTextFile(controlId, fileId)\`.

## Worked example

<example>
<%= it.exampleScript %>
</example>

## Your instructions

1. Output the **entire** script object expression so the user can paste it directly into the Custom script textarea (don't output a diff).
2. Use \`helpers.proxiedFetch\` for all network calls; never call \`fetch\` directly.
3. Make sure \`generateImages\` returns \`[{ readableStream }]\` with a real \`ReadableStream\` of image bytes. If the API returns base64, decode it; if it returns a URL, download it with \`proxiedFetch\` and return \`response.body\`.
4. Declare a control for every value the user should be able to configure (URL, auth token, model, sizes, etc.), and read those via \`controlValues\`.
5. Remind the user to click Save after pasting.`;
