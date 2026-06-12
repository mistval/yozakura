import { create } from 'zustand';
import z from 'zod';
import {
  applyOverrides,
  applyPatch,
  computeOverrides,
  isRecord,
  loadStoredRecord,
  type DeepPartial,
} from '../util/settings_merge';
import {
  imageApiShapeSchema,
  automatic1111SettingsSchema,
  openaiSettingsSchema,
  imageApiShapes,
  type ImageApiShape,
} from '../engine/settings/image_api.js';
import {
  llmConfigSchema,
  DEFAULT_LLM_CONFIGS,
  type LLMConfig,
} from '../engine/settings/cascading_llm_configs.js';
import _ from 'lodash';

export type { ImageApiShape, LLMConfig as LLMOptionsGroup };
export { imageApiShapes };

const STORAGE_KEY = 'yozakura_settings';

export type PromptTemplateOverride = {
  templateString?: string | undefined;
};

const speakerSelectionModeSchema = z.enum(['round_robin', 'manual', 'intelligent']);
export type SpeakerSelectionMode = z.infer<typeof speakerSelectionModeSchema>;
const chatPaneWidthSchema = z.enum(['narrow', 'medium', 'wide', 'extra_wide', 'unconstrained']);
export type ChatPaneWidth = z.infer<typeof chatPaneWidthSchema>;

const promptTemplateOverrideSchema = z.object({
  templateString: z.string().optional(),
});

const promptParserOverrideSchema = z.object({
  source: z.string(),
});

const settingsSchema = z.object({
  llmConfigs: z.record(z.string(), llmConfigSchema),
  richNpcInteractionRate: z.number(),
  richNpcMessageCount: z.number(),
  userFamiliarityInteractionMultiplier: z.number(),
  gossipRate: z.number(),
  userGossipChanceMultiplier: z.number(),
  familiarityWeightMultiplier: z.number(),
  familiarityGain: z.number(),
  familiarityDecay: z.number(),
  npcRemoteChatRate: z.number(),
  npcTriggeredGroupChatRate: z.number(),
  npcGroupChatAdditionalParticipants: z.number(),
  npcChatRate: z.number(),
  userChatSpeakerSelectionMode: speakerSelectionModeSchema,
  npcGroupChatSpeakerSelectionMode: speakerSelectionModeSchema,
  chatPaneWidth: chatPaneWidthSchema,
  conversationLogWidth: chatPaneWidthSchema,
  freedomOfMovement: z.boolean(),
  npcOnlyChatDelay: z.number(),
  imagePromptPrefix: z.string(),
  imageApiShape: imageApiShapeSchema,
  imageSettingsForShape: z.object({
    automatic1111: automatic1111SettingsSchema,
    openai: openaiSettingsSchema,
  }),
  editImagePromptsBeforeDispatch: z.boolean(),
  autoImageRate: z.number(),
  autoImageNpcOnly: z.boolean(),
  groupChatMessageLimit: z.number(),
  offscreenMentionLimit: z.number(),
  rollingConversationSummaryLimit: z.number(),
  offscreenLearnedInformationLimit: z.number(),
  tokenStreamingEnabled: z.boolean(),
  showTemplatePasteSafetyWarning: z.boolean(),
  theme: z.enum([
    'system',
    'light',
    'dark',
    'black',
    'firmament',
    'tempest',
    'neon',
    'stormy',
    'oceanic',
    'littoral',
    'winnipesaukee',
    'christmas',
    'smokies',
    'sakura',
    'agape',
    'yozakura',
    'mpk',
    'mercurial',
  ]),
  mainMenuFtueSeen: z.boolean(),
  promptTemplateOverrides: z.record(z.string(), promptTemplateOverrideSchema.or(z.null())),
  promptParserOverrides: z.record(z.string(), promptParserOverrideSchema.or(z.null())),
});

export type Settings = z.infer<typeof settingsSchema>;

export type SettingsPatch = DeepPartial<Settings>;
type SettingsOverrides = DeepPartial<Settings>;

type SettingsUpdate = SettingsPatch | ((previous: Settings) => SettingsPatch);

type SettingsStoreState = Settings & {
  setSettings: (update: SettingsUpdate) => void;
  resetSettings: () => void;
};

const DEFAULT_SETTINGS: Settings = {
  llmConfigs: DEFAULT_LLM_CONFIGS,
  richNpcInteractionRate: 0.3,
  richNpcMessageCount: 6,
  userFamiliarityInteractionMultiplier: 1,
  gossipRate: 0.25,
  userGossipChanceMultiplier: 1,
  familiarityWeightMultiplier: 1,
  familiarityGain: 10,
  familiarityDecay: 0.5,
  npcRemoteChatRate: 0.15,
  npcTriggeredGroupChatRate: 0.07,
  npcGroupChatAdditionalParticipants: 2,
  npcChatRate: 0.5,
  userChatSpeakerSelectionMode: 'round_robin',
  npcGroupChatSpeakerSelectionMode: 'round_robin',
  chatPaneWidth: 'medium',
  conversationLogWidth: 'medium',
  freedomOfMovement: false,
  npcOnlyChatDelay: 0,
  imagePromptPrefix: 'masterpiece, best quality, amazing quality, absurdres',
  imageSettingsForShape: Object.fromEntries(
    imageApiShapes.map((shape) => [shape.shape, shape.defaultSettings])
  ) as {
    [K in ImageApiShape]: K extends (typeof imageApiShapes)[number]['shape']
      ? ((typeof imageApiShapes)[number] & { shape: K })['defaultSettings']
      : never;
  },
  imageApiShape: 'automatic1111',
  editImagePromptsBeforeDispatch: false,
  autoImageRate: 0,
  autoImageNpcOnly: false,
  groupChatMessageLimit: 25,
  offscreenMentionLimit: 2,
  rollingConversationSummaryLimit: 10,
  offscreenLearnedInformationLimit: 10,
  tokenStreamingEnabled: true,
  showTemplatePasteSafetyWarning: true,
  theme: 'yozakura',
  mainMenuFtueSeen: false,
  promptTemplateOverrides: {},
  promptParserOverrides: {},
};

function computeSettingsOverrides(settings: Settings): SettingsOverrides {
  return computeOverrides(DEFAULT_SETTINGS, settings);
}

function applySettingsOverrides(overrides: SettingsOverrides): Settings {
  return applyOverrides(DEFAULT_SETTINGS, overrides);
}

function sanitizedSettings(input: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const parsed = settingsSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  return fallback;
}

function loadStoredOverrides(): SettingsOverrides {
  return loadStoredRecord(STORAGE_KEY) as SettingsOverrides;
}

function loadInitialSettings(): Settings {
  return sanitizedSettings(applySettingsOverrides(loadStoredOverrides()));
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...loadInitialSettings(),
  setSettings: (update) => {
    const nextValue = typeof update === 'function' ? update(get()) : update;
    const safePatch = isRecord(nextValue) ? (nextValue as SettingsPatch) : {};
    const mergedSettings = applyPatch(get(), safePatch);
    const nextSettings = sanitizedSettings(mergedSettings, get());
    const nextOverrides = computeSettingsOverrides(nextSettings);
    const stateApply = _.pickBy(nextSettings, (_, key) => key in safePatch);

    set(stateApply);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOverrides));
  },
  resetSettings: () => {
    localStorage.removeItem(STORAGE_KEY);
    set(DEFAULT_SETTINGS);
  },
}));

export const settingsStore = {
  setSettings: (update: SettingsUpdate) => useSettingsStore.getState().setSettings(update),
  resetSettings: () => useSettingsStore.getState().resetSettings(),
};

export function useSetting(key: keyof Settings) {
  const setting = useSettingsStore((state) => state[key]);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);

  return { setting, setSettings, resetSettings };
}
