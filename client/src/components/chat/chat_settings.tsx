import Modal from '../ui/Modal.js';
import SettingFieldLabel from '../settings/ui/SettingFieldLabel.js';
import { settingsTooltips } from '../settings/settings_tooltips.js';
import { useSettingsStore } from '../../state/settings_store.js';
import type { ChatPaneWidth, SpeakerSelectionMode } from '../../state/settings_store.js';
import { useTurnMachineStore, useChatUserLocation } from '../../state/turn_machine_store.js';
import { ChatCoordinator } from '../../engine/chat/chat_coordinator.js';
import InfoTooltip from '../ui/InfoTooltip.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';

interface ChatSettingsProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatSettings({ open, onClose }: ChatSettingsProps) {
  const speakerSelectionMode = useSettingsStore((s) => s.speakerSelectionMode);
  const chatPaneWidth = useSettingsStore((s) => s.chatPaneWidth);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const chatInstructions = useTurnMachineStore((s) => s.chatInstructions);
  const userLocation = useChatUserLocation();
  const submitChatRequestEnd = useScenarioLoopStateStore((state) => state.submitChatRequestEnd);
  const canEndChat = useTurnMachineStore((state) => state.chatState === 'awaiting_user_input');

  const updateSpeakerSelectionMode = (nextMode: SpeakerSelectionMode) => {
    setSettings({ speakerSelectionMode: nextMode });
  };

  const updateChatPaneWidth = (nextWidth: ChatPaneWidth) => {
    setSettings({ chatPaneWidth: nextWidth });
  };

  if (!userLocation) {
    return undefined;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-emphasized rounded-sm p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Chat Settings</h3>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="space-y-2">
            <SettingFieldLabel
              text="Next Speaker Selection Mode"
              htmlFor="chat-next-speaker-selection-mode"
              tooltipHtml={settingsTooltips['speakerSelectionMode']}
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
              text="Chat Pane Width"
              htmlFor="chat-pane-width"
              tooltipHtml={settingsTooltips['chat.paneWidth']}
            />
            <select
              id="chat-pane-width"
              value={chatPaneWidth}
              onChange={(event) => updateChatPaneWidth(event.target.value as ChatPaneWidth)}
              className="rounded-input bg-inset"
            >
              <option value="narrow">Narrow</option>
              <option value="medium">Medium</option>
              <option value="wide">Wide</option>
              <option value="extra_wide">Extra Wide</option>
              <option value="unconstrained">Limit Breaker</option>
            </select>
          </div>

          <div className="space-y-2">
            <SettingFieldLabel
              text="Chat instructions"
              htmlFor="chat-instructions"
              tooltipHtml="Anything you enter here will be included in the system prompt for all characters in this chat. Use it to steer the whole conversation (e.g. tone, topic, or scenario constraints). Applies only to this chat."
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
              tooltipHtml="Override the location name used in prompts for this chat. If characters are in different locations, changing this (or description) will cause them all to consider themselves to be in the updated location."
            />
            <input
              id="chat-location-name"
              value={userLocation.name}
              onChange={(event) => {
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
              tooltipHtml="Override the location description used in prompts for this chat."
            />
            <textarea
              id="chat-location-description"
              value={userLocation.description}
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
              onClick={() => submitChatRequestEnd({ forceNoEffect: true })}
              disabled={!canEndChat}
              className="mr-3"
            >
              End chat without memories
            </button>
            <InfoTooltip
              label="End chat immediately"
              html="End the chat immediately without generating memory updates or saving the conversation log."
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
