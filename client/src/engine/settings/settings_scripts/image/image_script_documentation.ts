import { etaRenderSync } from '../../../../util/eta.js';
import { imageScriptDocumentationTemplate } from './image_script_documentation_template.js';
import { settingsScriptControlJSONSchema } from '../settings_script.js';
import { imageGenerationSettingsScriptJSONSchema } from './image_script_types.js';

const EXAMPLE_CUSTOM_IMAGE_SCRIPT = `({
  id: 'my-custom-provider',
  name: 'My Custom Provider',
  controls: () => [
    { id: 'url', type: 'string', label: 'API URL', width: 'full', default: 'https://api.example.com/v1/images' },
    { id: 'authToken', type: 'password', label: 'API Key', width: 'full' },
    { id: 'model', type: 'string', label: 'Model', width: 'full' },
    { id: 'width', type: 'number', label: 'Width', default: '1024' },
    { id: 'height', type: 'number', label: 'Height', default: '1024' },
    { id: 'testConnection', type: 'button', title: 'Test Connection' },
  ],
  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId === 'testConnection') {
      const response = await helpers.proxiedFetch(controlValues.url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + controlValues.authToken },
      });
      return response.ok
        ? { result: 'success', resultDescription: 'Connection OK' }
        : { result: 'failure', resultDescription: 'HTTP ' + response.status };
    }
    return { result: 'failure', resultDescription: 'Unknown button: ' + buttonId };
  },
  async generateImages(controlValues, request, helpers) {
    const response = await helpers.proxiedFetch(controlValues.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + controlValues.authToken,
      },
      body: JSON.stringify({
        model: controlValues.model,
        prompt: request.prompt,
        width: Number(controlValues.width),
        height: Number(controlValues.height),
      }),
    });
    if (!response.ok) {
      throw new Error('Image generation failed: HTTP ' + response.status);
    }

    const data = await response.json();
    // Suppose the API returns { images: ["data:image/png;base64,...."] }
    const base64 = String(data.images[0]).split(',').pop();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return [{ readableStream: new Response(bytes).body }];
  },
})`;

export function getImageScriptDocumentation(): string {
  return etaRenderSync(imageScriptDocumentationTemplate, {
    controlSchema: JSON.stringify(settingsScriptControlJSONSchema, null, 2),
    scriptSchema: JSON.stringify(imageGenerationSettingsScriptJSONSchema, null, 2),
    exampleScript: EXAMPLE_CUSTOM_IMAGE_SCRIPT,
  });
}
