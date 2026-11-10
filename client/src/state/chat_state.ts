import type { IParallelJob } from '../engine/parallelization/job_manager_types';
import { ChatJobTags } from '../engine/parallelization/yozakura_job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { UserAbortCurrentGenerationSignalException } from '../engine/scenario_loop/flow_control.js';
import { useJobsWithTag } from './parallel_job_manager_store';
import { useSettingsStore } from './settings_store';

export { ChatJobTags };

export function abortCurrentChatGeneration() {
  globalParallelJobManager.cancelJobsByTag(
    ChatJobTags.chatJob,
    new UserAbortCurrentGenerationSignalException()
  );
}

function hasTag(job: IParallelJob<unknown>, tag: string) {
  return job.tags?.includes(tag);
}

export function useChatJobs() {
  return useJobsWithTag(ChatJobTags.chatJob);
}

export function useCurrentImageGenerationJobs() {
  const chatJobs = useChatJobs();
  return chatJobs.filter(j => hasTag(j, ChatJobTags.generatingImage) || hasTag(j, ChatJobTags.generatingImagePrompt));
}

export function useIsGeneratingMemories() {
  const chatJobs = useChatJobs();
  return chatJobs.some((j) => hasTag(j, ChatJobTags.processingMemories));
}

export function useIsAwaitingCharacterTextInput() {
  const chatJobs = useChatJobs();
  const generateImagesInParallelWithText = useSettingsStore((s) => s.generateImagesInParallelWithText);
  const isGeneratingImage = useCurrentImageGenerationJobs();
  const isGeneratingMemories = useIsGeneratingMemories();

  return (
    !isGeneratingMemories &&
    !chatJobs.some((j) => hasTag(j, ChatJobTags.characterIsSpeaking)) &&
    !chatJobs.some((j) => hasTag(j, ChatJobTags.selectingSpeaker)) &&
    !chatJobs.some((j) => hasTag(j, ChatJobTags.judgingConversationEnd)) &&
    (generateImagesInParallelWithText || !isGeneratingImage)
  );
}
