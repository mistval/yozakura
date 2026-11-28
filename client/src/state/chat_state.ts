import { ChatJobTags } from '../engine/parallelization/yozakura_job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { UserAbortCurrentGenerationSignalException } from '../engine/scenario_loop/flow_control.js';
import { useJobsWithTags } from './parallel_job_manager_store';
import { useScenarioStore } from './scenario_store.js';
import { useSettingsStore } from './settings_store';
import { useTurnMachineStore } from './turn_machine_store.js';

export { ChatJobTags };

export function abortCurrentChatGeneration() {
  globalParallelJobManager.cancelJobsByTag(
    ChatJobTags.chatJob,
    new UserAbortCurrentGenerationSignalException()
  );
}

export function cancelParallelJob(jobId: string) {
  globalParallelJobManager.cancelJobById(jobId, new UserAbortCurrentGenerationSignalException());
}

export function useChatJobs() {
  return useJobsWithTags(ChatJobTags.chatJob);
}

export function useImageGenerationJobs() {
  return useJobsWithTags([ChatJobTags.generatingImage, ChatJobTags.generatingImagePrompt]);
}

export function useMemoryGenerationJobs() {
  return useJobsWithTags(ChatJobTags.processingMemories);
}

export function useIsChatFinalizing() {
  return useJobsWithTags([ChatJobTags.processingMemories, ChatJobTags.finalizingChat]).length > 0;
}

export function useJobWithTagExists(tag: string) {
  return useJobsWithTags(tag).length > 0;
}

export function useUserCanInputChat() {
  const generateImagesInParallelWithText = useSettingsStore((s) => s.generateImagesInParallelWithText);
  const userCharacterId = useScenarioStore((s) => s.activeScenario?.userCharacterId);
  const inChatTurnForCharacterId = useTurnMachineStore((s) => s.inChatTurnForCharacterId);
  const imageGenerationJobs = useImageGenerationJobs();

  const negativeConditions = [
    useIsChatFinalizing(),
    useJobWithTagExists(ChatJobTags.waitingBetweenMessages),
    useJobWithTagExists(ChatJobTags.characterIsSpeaking),
    useJobWithTagExists(ChatJobTags.selectingSpeaker),
    useJobWithTagExists(ChatJobTags.judgingConversationEnd),
    imageGenerationJobs.length > 0 && !generateImagesInParallelWithText,
    !userCharacterId || inChatTurnForCharacterId !== userCharacterId,
  ];

  return !negativeConditions.includes(true);
}
