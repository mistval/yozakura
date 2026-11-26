import { useCallback, useMemo } from 'react';
import { ChatCoordinator } from '../../../engine/chat/chat_coordinator.js';
import { chatSceneImageTemplatesGroup } from '../../../engine/prompt_templates/chat/group.js';
import { useTemporaryFlag } from '../../../hooks/use_temporary_flag.js';
import { ChatJobTags, useImageGenerationJobs } from '../../../state/chat_state.js';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store.js';
import { useSettingsStore } from '../../../state/settings_store.js';

export function useSceneImageCapability({ isFinalizingChat }: { isFinalizingChat: boolean }) {
  const selectedSceneImageTemplateChainId = useSettingsStore((s) => s.selectedSceneImageTemplateChainId);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const sceneImageChains = chatSceneImageTemplatesGroup.useChains();
  const imageGenerationJobs = useImageGenerationJobs();
  const { active: imageRequestedRecently, trigger: triggerImageRequestFeedback } = useTemporaryFlag(800);

  const pendingImagePromptEdit = useScenarioLoopStateStore((state) => state.pendingImagePromptEdit);
  const setPendingImagePromptEdit = useScenarioLoopStateStore((state) => state.setPendingImagePromptEdit);

  const isGeneratingImagePrompt = imageGenerationJobs.some((job) =>
    job.tags?.includes(ChatJobTags.generatingImagePrompt)
  );
  const canGenerateImages =
    !isFinalizingChat &&
    !(editImagePromptsBeforeDispatch && (isGeneratingImagePrompt || Boolean(pendingImagePromptEdit)));

  const activeSceneImageChain = useMemo(() => {
    return (
      sceneImageChains.find((c) => c.templateChainId === selectedSceneImageTemplateChainId) ??
      sceneImageChains[0]
    );
  }, [sceneImageChains, selectedSceneImageTemplateChainId]);

  const requestSceneImage = useCallback(
    (afterMessageId: string | undefined) => {
      triggerImageRequestFeedback();
      void ChatCoordinator.requestSceneImage(afterMessageId);
    },
    [triggerImageRequestFeedback]
  );

  const confirmImagePrompt = useCallback(() => {
    if (!pendingImagePromptEdit) {
      return;
    }

    const { prompt, afterMessageId } = pendingImagePromptEdit;
    void ChatCoordinator.confirmSceneImagePrompt(prompt, afterMessageId);
  }, [pendingImagePromptEdit]);

  const selectSceneImageChain = useCallback(
    (templateChainId: string) => {
      setSettings({ selectedSceneImageTemplateChainId: templateChainId });
    },
    [setSettings]
  );

  return {
    requestSceneImage,
    canGenerateImages,
    controlsProps: {
      canGenerateImages,
      imageRequestedRecently,
      imageGenerationJobCount: imageGenerationJobs.length,
      sceneImageChains,
      activeSceneImageChain,
      onSelectSceneImageChain: selectSceneImageChain,
    },
    modalProps: {
      open: Boolean(pendingImagePromptEdit),
      prompt: pendingImagePromptEdit?.prompt ?? '',
      onChange: (prompt: string) =>
        setPendingImagePromptEdit(pendingImagePromptEdit ? { ...pendingImagePromptEdit, prompt } : undefined),
      onCancel: () => setPendingImagePromptEdit(undefined),
      onConfirm: confirmImagePrompt,
    },
  };
}
