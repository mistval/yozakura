import type { Migration } from '../types.js';

/**
 * Rewrites persisted settings from the legacy hardcoded image-generation shape
 * (`imageApiShape` + `imageSettingsForShape`) into the new data-driven
 * `settingsScripts.imageGeneration` shape. The settings row stores only the diff
 * vs defaults, so this just reshapes whatever keys the user actually changed.
 */

const SETTINGS_KEY = 'settings';
const IMAGE_GENERATION_SECTION_ID = 'imageGeneration';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeParseJSON(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function toControlValuesForShape(shapeSettings: unknown): Record<string, string> {
  const controlValues: Record<string, string> = {};
  if (!isRecord(shapeSettings)) {
    return controlValues;
  }

  if (typeof shapeSettings.url === 'string') {
    controlValues.url = shapeSettings.url;
  }

  if (typeof shapeSettings.authToken === 'string') {
    controlValues.authToken = shapeSettings.authToken;
  }

  if (typeof shapeSettings.metaOptions === 'string') {
    let metaOptions = shapeSettings.metaOptions;
    const parsed: unknown = safeParseJSON(metaOptions);
    if (isRecord(parsed)) {
      if (typeof parsed.model === 'string' && parsed.model) {
        controlValues.model = parsed.model;
      }
      const { model: _model, ...rest } = parsed;
      metaOptions = JSON.stringify(rest, null, 2);
    }

    controlValues.metaOptions = metaOptions;
  }

  if (isRecord(shapeSettings.sizeOptions)) {
    for (const [key, value] of Object.entries(shapeSettings.sizeOptions)) {
      if (value !== undefined && value !== null) {
        controlValues[key] = String(value);
      }
    }
  }

  return controlValues;
}

function migrateOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  const { imageApiShape, imageSettingsForShape, ...rest } = overrides;

  const controlValues: Record<string, Record<string, string>> = {};
  for (const [shape, shapeSettings] of Object.entries(imageSettingsForShape ?? {})) {
    const shapeControlValues = toControlValuesForShape(shapeSettings);
    if (Object.keys(shapeControlValues).length > 0) {
      controlValues[shape] = shapeControlValues;
    }
  }

  const imageSection: Record<string, unknown> = {};
  if (imageApiShape) {
    imageSection.selectedScriptId = imageApiShape;
  }

  if (Object.keys(controlValues).length > 0) {
    imageSection.controlValues = controlValues;
  }

  if (Object.keys(imageSection).length === 0) {
    return rest;
  }

  const existingSettingsScripts = isRecord(rest.settingsScripts) ? rest.settingsScripts : {};
  const existingImageSection = isRecord(existingSettingsScripts[IMAGE_GENERATION_SECTION_ID])
    ? (existingSettingsScripts[IMAGE_GENERATION_SECTION_ID] as Record<string, unknown>)
    : {};

  return {
    ...rest,
    settingsScripts: {
      ...existingSettingsScripts,
      [IMAGE_GENERATION_SECTION_ID]: {
        ...existingImageSection,
        ...imageSection,
      },
    },
  };
}

export const migration: Migration = {
  doMigration(db) {
    const row = db.prepare(`SELECT data FROM key_value WHERE key = ? LIMIT 1`).get(SETTINGS_KEY) as
      | { data: string }
      | undefined;

    if (!row) {
      return;
    }

    const parsed = JSON.parse(row.data);
    const migrated = migrateOverrides(parsed);

    db.prepare(`UPDATE key_value SET data = ?, updated_at = CONCAT(datetime('now'), 'Z') WHERE key = ?`).run(
      JSON.stringify(migrated),
      SETTINGS_KEY
    );
  },
};
