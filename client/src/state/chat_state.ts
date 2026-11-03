import type { IParallelJob } from "../engine/parallelization/job_manager_types";
import { useJobsWithTag } from "./parallel_job_manager_store";
import { useSettingsStore } from "./settings_store";

export const ChatJobTags = {
    chatJob: 'chat_job',
    processingMemories: 'processing_memories',
    characterIsSpeaking: 'character_speaking',
    selectingSpeaker: 'selecting_speaker',
    judgingConversationEnd: 'judging_conversation_end',
    generatingImage: 'generating_image',
    generatingImagePrompt: 'generating_image_prompt',
}

function hasTag(job: IParallelJob<unknown>, tag: string) {
    return job.tags?.includes(tag);
}

export function useChatJobs() {
    return useJobsWithTag(ChatJobTags.chatJob);
}

export function useIsGeneratingImageOrImagePrompt() {
    const chatJobs = useChatJobs();
    return chatJobs.some(j => hasTag(j, ChatJobTags.generatingImage)) || chatJobs.some(j => hasTag(j, ChatJobTags.generatingImagePrompt));
}

export function useIsGeneratingMemories() {
    const chatJobs = useChatJobs();
    const isGeneratingMemories = chatJobs.some(j => j.tags?.includes(ChatJobTags.processingMemories));

    return isGeneratingMemories;
}

export function useIsAwaitingCharacterTextInput() {
    const chatJobs = useChatJobs();
    const generateImagesInParallelWithText = useSettingsStore((s) => s.generateImagesInParallelWithText);
    const isGeneratingImage = useIsGeneratingImageOrImagePrompt();

    return !chatJobs.some(j => hasTag(j, ChatJobTags.characterIsSpeaking))
    && !chatJobs.some(j => hasTag(j, ChatJobTags.selectingSpeaker))
    && !chatJobs.some(j => hasTag(j, ChatJobTags.judgingConversationEnd))
    && !chatJobs.some(j => hasTag(j, ChatJobTags.processingMemories))
    && (generateImagesInParallelWithText || !isGeneratingImage)
}
