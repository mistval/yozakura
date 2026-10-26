import type { Migration } from '../types.js';

const SETTINGS_KEY = 'settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TEMPLATE_ID_MAPPING: Record<string, { groupId: string; chainId: string }> = {
  // runtime_chat_templates
  chat_system_prompt: { groupId: 'runtime_chat_templates', chainId: 'gen_npc_response' },
  final_instructions_prompt: { groupId: 'runtime_chat_templates', chainId: 'gen_npc_response' },
  chat_system_user_nudge_prompt: { groupId: 'runtime_chat_templates', chainId: 'gen_npc_response' },
  moderation_next_speaker_system: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_intelligent_next_speaker_select',
  },
  moderation_next_speaker_user: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_intelligent_next_speaker_select',
  },
  conversation_end_judge_system: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_conversation_end_judgement',
  },
  conversation_end_judge_user: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_conversation_end_judgement',
  },
  chat_scene_image_system: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_chat_scene_image_prompt',
  },
  chat_scene_image_user: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_chat_scene_image_prompt',
  },
  memory_rag_prompt: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_memory_rag_insert_template',
  },

  // memories
  conversation_rolling_summary_system: { groupId: 'memories', chainId: 'gen_convo_summary' },
  conversation_rolling_summary_user: { groupId: 'memories', chainId: 'gen_convo_summary' },
  rolling_global_memory_rewrite_system: { groupId: 'memories', chainId: 'gen_global_memory' },
  rolling_global_memory_rewrite_user: { groupId: 'memories', chainId: 'gen_global_memory' },
  rolling_pairwise_memory_rewrite_system: { groupId: 'memories', chainId: 'gen_pairwise_memory' },
  rolling_pairwise_memory_rewrite_user: { groupId: 'memories', chainId: 'gen_pairwise_memory' },
  next_conversation_goal_updates_system: { groupId: 'memories', chainId: 'gen_convo_goal' },
  next_conversation_goal_updates_user: { groupId: 'memories', chainId: 'gen_convo_goal' },
  relationship_descriptor_update_system: { groupId: 'memories', chainId: 'gen_relationship_descriptor' },
  relationship_descriptor_update_user: { groupId: 'memories', chainId: 'gen_relationship_descriptor' },
  offscreen_memory_extraction_system: {
    groupId: 'memories',
    chainId: 'gen_offscreen_learned_information',
  },
  offscreen_memory_extraction_user: {
    groupId: 'memories',
    chainId: 'gen_offscreen_learned_information',
  },
  offscreen_memory_update_conversation_goal_system: {
    groupId: 'memories',
    chainId: 'gen_offscreen_character_binary_update_next_convo_goal',
  },
  offscreen_memory_update_conversation_goal_user: {
    groupId: 'memories',
    chainId: 'gen_offscreen_character_binary_update_next_convo_goal',
  },

  // character_generation_templates
  extract_character_description_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_extract_character_description',
  },
  extract_character_description_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_extract_character_description',
  },
  example_dialogue_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_example_dialog',
  },
  example_dialogue_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_example_dialog',
  },
  character_description_generation_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_internal_description',
  },
  character_description_generation_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_internal_description',
  },
  external_description_generation_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_external_description',
  },
  external_description_generation_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_external_description',
  },
  base_appearance_generation_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_base_appearance',
  },
  base_appearance_generation_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_base_appearance',
  },
  wardrobe_generation_system: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_wardrobe',
  },
  wardrobe_generation_user: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_wardrobe',
  },
};

const PARSER_ID_MAPPING: Record<string, { groupId: string; chainId: string }> = {
  chat_system_prompt_parser: { groupId: 'runtime_chat_templates', chainId: 'gen_npc_response' },
  moderation_next_speaker_parser: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_intelligent_next_speaker_select',
  },
  conversation_end_judge_parser: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_conversation_end_judgement',
  },
  chat_scene_image_parser: {
    groupId: 'runtime_chat_templates',
    chainId: 'gen_chat_scene_image_prompt',
  },
  gen_convo_summary_parser: { groupId: 'memories', chainId: 'gen_convo_summary' },
  gen_global_memory: { groupId: 'memories', chainId: 'gen_global_memory' },
  gen_pairwise_memory_parser: { groupId: 'memories', chainId: 'gen_pairwise_memory' },
  next_conversation_goal_updates_parser: { groupId: 'memories', chainId: 'gen_convo_goal' },
  relationship_descriptor_update_parser: { groupId: 'memories', chainId: 'gen_relationship_descriptor' },
  offscreen_memory_extraction_parser: {
    groupId: 'memories',
    chainId: 'gen_offscreen_learned_information',
  },
  offscreen_memory_update_conversation_goal_parser: {
    groupId: 'memories',
    chainId: 'gen_offscreen_character_binary_update_next_convo_goal',
  },
  extract_character_description_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_extract_character_description',
  },
  example_dialogue_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_example_dialog',
  },
  character_description_generation_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_internal_description',
  },
  external_description_generation_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_external_description',
  },
  base_appearance_generation_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_base_appearance',
  },
  wardrobe_generation_parser: {
    groupId: 'character_generation_templates',
    chainId: 'gen_character_wardrobe',
  },
};

export function migrateSettingsOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  const { promptTemplateOverrides, promptParserOverrides, ...rest } = overrides;

  if (!isRecord(promptTemplateOverrides) && !isRecord(promptParserOverrides)) {
    return overrides;
  }

  const existingTemplateGroupData = isRecord(rest.templateGroupData)
    ? (rest.templateGroupData as Record<string, any>)
    : {};

  const migratedGroupData: Record<string, any> = { ...existingTemplateGroupData };

  const ensureChainNode = (groupId: string, chainId: string) => {
    if (!migratedGroupData[groupId]) {
      migratedGroupData[groupId] = { templateChains: {} };
    }
    if (!migratedGroupData[groupId].templateChains) {
      migratedGroupData[groupId].templateChains = {};
    }
    if (!migratedGroupData[groupId].templateChains[chainId]) {
      migratedGroupData[groupId].templateChains[chainId] = { templates: {} };
    }
    if (!migratedGroupData[groupId].templateChains[chainId].templates) {
      migratedGroupData[groupId].templateChains[chainId].templates = {};
    }
    return migratedGroupData[groupId].templateChains[chainId];
  };

  if (isRecord(promptTemplateOverrides)) {
    for (const [templateId, override] of Object.entries(promptTemplateOverrides)) {
      if (!isRecord(override) || typeof override.templateString !== 'string') {
        continue;
      }
      const mapping = TEMPLATE_ID_MAPPING[templateId];
      if (!mapping) {
        continue;
      }
      const chainNode = ensureChainNode(mapping.groupId, mapping.chainId);
      chainNode.templates[templateId] = {
        templateString: override.templateString,
      };
    }
  }

  if (isRecord(promptParserOverrides)) {
    for (const [parserId, override] of Object.entries(promptParserOverrides)) {
      if (!isRecord(override) || typeof override.source !== 'string') {
        continue;
      }
      const mapping = PARSER_ID_MAPPING[parserId];
      if (!mapping) {
        continue;
      }
      const chainNode = ensureChainNode(mapping.groupId, mapping.chainId);
      chainNode.parserSource = override.source;
    }
  }

  return {
    ...rest,
    ...(Object.keys(migratedGroupData).length > 0 ? { templateGroupData: migratedGroupData } : {}),
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      return;
    }

    if (!isRecord(parsed)) {
      return;
    }

    const migrated = migrateSettingsOverrides(parsed);

    db.prepare(`UPDATE key_value SET data = ?, updated_at = CONCAT(datetime('now'), 'Z') WHERE key = ?`).run(
      JSON.stringify(migrated),
      SETTINGS_KEY
    );
  },
};
