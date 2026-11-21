import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import SettingFieldLabel from '../settings/ui/SettingFieldLabel.js';
import { settingsDangerousHtmlTooltips } from '../settings/settings_tooltips.js';
import { useSettingsStore } from '../../state/settings_store.js';
import type { SpeakerSelectionMode } from '../../state/settings_store.js';
import { useTurnMachineStore, useChatRootLocation } from '../../state/turn_machine_store.js';
import { ChatCoordinator } from '../../engine/chat/chat_coordinator.js';
import InfoTooltip from '../ui/InfoTooltip.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';
import type { ChangeEvent } from 'react';
import { useUserCanInputChat } from '../../state/chat_state.js';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';

export default function ChatSettings() {
  const { open, closeModal } = useModalQueryParam('chatsettings');
  const speakerSelectionMode = useSettingsStore((s) => s.speakerSelectionMode);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const chatState = useTurnMachineStore((s) => s.chatState);
  const chatInstructions = useTurnMachineStore((s) => s.chatInstructions);
  const initiatorLocation = useChatRootLocation();
  const submitChatRequestEnd = useScenarioLoopStateStore((state) => state.submitChatRequestEnd);
  const canEndChat = useUserCanInputChat();

  const updateSpeakerSelectionMode = (nextMode: SpeakerSelectionMode) => {
    setSettings({ speakerSelectionMode: nextMode });
  };

  if (!open || chatState !== 'active' || !initiatorLocation) {
    return undefined;
  }

  return (
    <RoutedModalFrame queryParam="chatsettings" onClose={closeModal} maxWidthClassName="max-w-2xl">
      <h3 className="text-lg font-semibold">Chat Settings</h3>

      <div className="space-y-2">
        <SettingFieldLabel
          text="Next Speaker Selection Mode"
          htmlFor="chat-next-speaker-selection-mode"
          tooltipDangerousHtml={settingsDangerousHtmlTooltips['speakerSelectionMode']}
        />
        <select
          id="chat-next-speaker-selection-mode"
          value={speakerSelectionMode}
          onChange={(event) => updateSpeakerSelectionMode(event.target.value as SpeakerSelectionMode)}
          className="rounded-input bg-inset"
        >
          <option value="round_robin">Round Robin</option>
          <option value="intelligent">Intelligent</option>
        </select>
      </div>

      <div className="space-y-2">
        <SettingFieldLabel
          text="Chat instructions"
          htmlFor="chat-instructions"
          tooltip="Anything you enter here will be included in the system prompt for all characters in this chat. Use it to steer the whole conversation (e.g. tone, topic, or scenario constraints). Applies only to this chat."
        />
        <textarea
          id="chat-instructions"
          value={chatInstructions}
          onChange={(event) => ChatCoordinator.setChatInstructions(event.target.value)}
          rows={4}
          className="w-full border rounded-sm p-2 bg-inset"
          placeholder="Instructions for every character in this chat"
        />
      </div>

      <label className="block space-y-2">
        <SettingFieldLabel
          text="Location Name"
          htmlFor="chat-location-name"
          tooltip="Override the location name used in prompts for this chat. If characters are in different locations, changing this (or description) will cause them all to consider themselves to be in the updated location."
        />
        <input
          id="chat-location-name"
          value={initiatorLocation.name}
          onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
            ChatCoordinator.setEphemeralLocation((prevLocation) => ({
              ...prevLocation,
              name: event.target.value,
            }));
          }}
          className="w-full border rounded-sm p-2 bg-inset"
          placeholder="Name this location"
        />
      </label>

      <label className="block space-y-2">
        <SettingFieldLabel
          text="Location Description"
          htmlFor="chat-location-description"
          tooltip="Override the location description used in prompts for this chat."
        />
        <textarea
          id="chat-location-description"
          value={initiatorLocation.description}
          onChange={(event) => {
            ChatCoordinator.setEphemeralLocation((prevLocation) => ({
              ...prevLocation,
              description: event.target.value,
            }));
          }}
          rows={5}
          className="w-full border rounded-sm p-2 bg-inset"
          placeholder="Describe the location for scene image prompts"
        />
      </label>

      <label className="gap-3">
        <button
          onClick={() => {
            submitChatRequestEnd({ forceNoEffect: true });
            closeModal();
          }}
          disabled={!canEndChat}
          className="mr-3"
        >
          End chat without memories
        </button>
        <InfoTooltip
          label="End chat immediately"
          value="End the chat immediately without generating memory updates or saving the conversation log."
        />
      </label>
    </RoutedModalFrame>
  );
}
