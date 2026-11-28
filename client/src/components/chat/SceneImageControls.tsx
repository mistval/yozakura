import type { chatSceneImageTemplatesGroup } from '../../engine/prompt_templates/chat/group.js';
import ButtonOptions from '../ui/ButtonOptions.js';

type SceneImageChains = ReturnType<typeof chatSceneImageTemplatesGroup.useChains>;

export type SceneImageControlsProps = {
  canGenerateImages: boolean;
  imageRequestedRecently: boolean;
  imageGenerationJobCount: number;
  sceneImageChains: SceneImageChains;
  activeSceneImageChain: SceneImageChains[number] | undefined;
  onSelectSceneImageChain: (templateChainId: string) => void;
  onRequestLatestImage: () => void;
};

export default function SceneImageControls({
  canGenerateImages,
  imageRequestedRecently,
  imageGenerationJobCount,
  sceneImageChains,
  activeSceneImageChain,
  onSelectSceneImageChain,
  onRequestLatestImage,
}: SceneImageControlsProps) {
  return (
    <ButtonOptions
      showDropdown={sceneImageChains.length > 1}
      disabled={!canGenerateImages}
      placement="top-end"
      ariaLabel="Select image template"
      className="shrink-0"
      button={
        <button
          type="button"
          onClick={onRequestLatestImage}
          disabled={!canGenerateImages}
          title={
            activeSceneImageChain
              ? `Generate image (${activeSceneImageChain.settingsBridge.get().title})`
              : 'Generate image'
          }
          aria-label="Generate image"
          className={`px-2! min-w-9 flex items-center justify-center gap-1 ${
            imageRequestedRecently ? 'border-success-border! bg-success-bg! text-success-text!' : ''
          }`.trim()}
        >
          {imageRequestedRecently ? '✓' : '🖼️'}
          {imageGenerationJobCount > 0 && (
            <span className="text-xs font-semibold tabular-nums text-current!">
              {imageGenerationJobCount}
            </span>
          )}
        </button>
      }
    >
      <div className="w-56 space-y-2 select-none">
        <div className="pb-1.5 border-b border-border-default">
          <span className="text-xs font-semibold text-secondary-strong">Image Template</span>
        </div>
        <div className="space-y-1.5 pt-0.5">
          {sceneImageChains.map((chain) => {
            const chainData = chain.settingsBridge.get();
            const isSelected =
              chain.templateChainId === (activeSceneImageChain?.templateChainId ?? chain.templateChainId);
            return (
              <label
                key={chain.templateChainId}
                title={chainData.description || undefined}
                className="flex gap-2 cursor-pointer text-xs text-primary hover:text-secondary-strong"
              >
                <input
                  type="radio"
                  name="selected-scene-image-template"
                  checked={isSelected}
                  onChange={() => onSelectSceneImageChain(chain.templateChainId)}
                  className="cursor-pointer"
                />
                <span className="truncate">{chainData.title}</span>
              </label>
            );
          })}
        </div>
      </div>
    </ButtonOptions>
  );
}
