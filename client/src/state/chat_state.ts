import { ChatJobTags } from '../engine/parallelization/yozakura_job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { UserAbortCurrentGenerationSignalException } from '../engine/scenario_loop/flow_control.js';
import { useJobsWithTags } from './parallel_job_manager_store';
import { useSettingsStore } from './settings_store';

export { ChatJobTags };

export function abortCurrentChatGeneration() {
  globalParallelJobManager.cancelJobsByTag(
    ChatJobTags.chatJob,
    new UserAbortCurrentGenerationSignalException()
  );
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
  const imageGenerationJobs = useImageGenerationJobs();

  const negativeConditions = [
    useIsChatFinalizing(),
    useJobWithTagExists(ChatJobTags.waitingBetweenMessages),
    useJobWithTagExists(ChatJobTags.characterIsSpeaking),
    useJobWithTagExists(ChatJobTags.selectingSpeaker),
    useJobWithTagExists(ChatJobTags.judgingConversationEnd),
    imageGenerationJobs.length > 0 && !generateImagesInParallelWithText,
  ];

  return !negativeConditions.includes(true);
}
