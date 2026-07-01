import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useSettingsStore } from '../../state/settings_store';
import { useTurnMachineStore } from '../../state/turn_machine_store';
import { memoryRagPromptTemplatesGroup } from '../prompt_templates/chat/memory_rag_prompt';
import { buildMemoryRagTemplateContext } from '../prompt_templates/prompt_context_builder';
import type { TranscriptRagDeps } from './transcript';

export function buildTranscriptRagDeps(): TranscriptRagDeps {
  const getCharacter = (id: string) => useScenarioCharacterStore.getState().getRequiredCharacterById(id);

  return {
    getRagMessage: async (focusedCharacterId, mentionedCharacterId, mentionedByCharacterId) => {
      const rendered = await memoryRagPromptTemplatesGroup.render(
        await buildMemoryRagTemplateContext(
          getCharacter(focusedCharacterId),
          getCharacter(mentionedCharacterId),
          getCharacter(mentionedByCharacterId)
        )
      );

      return rendered[0]!.content;
    },
    getAllScenarioCharacters: () => useScenarioCharacterStore.getState().scenarioCharacters,
    getOffscreenMentionLimit: () => useSettingsStore.getState().offscreenMentionLimit,
    getCurrentParticipantIds: () => useTurnMachineStore.getState().participantIds,
  };
}
