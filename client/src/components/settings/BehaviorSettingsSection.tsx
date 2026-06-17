import {
  useSettingsStore,
  type SettingsPatch,
  type SpeakerSelectionMode,
} from '../../state/settings_store.js';
import { useEffect, useState } from 'react';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import NumericSettingRow from './ui/NumericSettingRow.js';
import RangeNumberInput from './ui/RangeNumberInput.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips, type SettingsTooltipKey } from './settings_tooltips.js';
import { clampUnitRate, enforceMin, enforceMinInt, toPercent } from '../../util/numeric.js';

export default function BehaviorSettingsSection() {
  const richNpcMessageCount = useSettingsStore((s) => s.richNpcMessageCount);
  const groupChatMessageLimit = useSettingsStore((s) => s.groupChatMessageLimit);
  const familiarityGain = useSettingsStore((s) => s.familiarityGain);
  const familiarityDecay = useSettingsStore((s) => s.familiarityDecay);
  const userFamiliarityInteractionMultiplier = useSettingsStore(
    (s) => s.userFamiliarityInteractionMultiplier
  );
  const familiarityWeightMultiplier = useSettingsStore((s) => s.familiarityWeightMultiplier);
  const userGossipChanceMultiplier = useSettingsStore((s) => s.userGossipChanceMultiplier);
  const npcOnlyChatDelay = useSettingsStore((s) => s.npcOnlyChatDelay);
  const offscreenMentionLimit = useSettingsStore((s) => s.offscreenMentionLimit);
  const npcGroupChatAdditionalParticipants = useSettingsStore((s) => s.npcGroupChatAdditionalParticipants);
  const rollingConversationSummaryLimit = useSettingsStore((s) => s.rollingConversationSummaryLimit);
  const offscreenLearnedInformationLimit = useSettingsStore((s) => s.offscreenLearnedInformationLimit);
  const richNpcInteractionRate = useSettingsStore((s) => s.richNpcInteractionRate);
  const gossipRate = useSettingsStore((s) => s.gossipRate);
  const npcChatRate = useSettingsStore((s) => s.npcChatRate);
  const npcTriggeredGroupChatRate = useSettingsStore((s) => s.npcTriggeredGroupChatRate);
  const npcRemoteChatRate = useSettingsStore((s) => s.npcRemoteChatRate);
  const freedomOfMovement = useSettingsStore((s) => s.freedomOfMovement);
  const npcGroupChatSpeakerSelectionMode = useSettingsStore((s) => s.npcGroupChatSpeakerSelectionMode);
  const userChatSpeakerSelectionMode = useSettingsStore((s) => s.userChatSpeakerSelectionMode);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [drafts, setDrafts] = useState<Record<string, number | string>>({});

  useEffect(() => {
    setDrafts({});
  }, [
    richNpcMessageCount,
    groupChatMessageLimit,
    familiarityGain,
    familiarityDecay,
    userFamiliarityInteractionMultiplier,
    familiarityWeightMultiplier,
    userGossipChanceMultiplier,
    npcOnlyChatDelay,
    offscreenMentionLimit,
    npcGroupChatAdditionalParticipants,
    rollingConversationSummaryLimit,
    offscreenLearnedInformationLimit,
    richNpcInteractionRate,
    gossipRate,
    npcChatRate,
    npcTriggeredGroupChatRate,
    npcRemoteChatRate,
    freedomOfMovement,
    npcGroupChatSpeakerSelectionMode,
    userChatSpeakerSelectionMode,
  ]);

  const numericSettingRows: Array<{
    id: string;
    label: string;
    tooltipKey: SettingsTooltipKey;
    min?: number;
    max?: number;
    step?: number;
    value: number;
    apply: (nextValue: number) => SettingsPatch;
  }> = [
    {
      id: 'npc-rich-message-count',
      label: 'Two-way NPC chat messages per NPC',
      tooltipKey: 'npc.richMessageCount',
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      step: 1,
      value: richNpcMessageCount,
      apply: (nextValue) => ({
        richNpcMessageCount: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'npc-group-chat-message-limit',
      label: 'Group NPC chat total message limit',
      tooltipKey: 'npc.groupLimit',
      min: 1,
      value: groupChatMessageLimit,
      apply: (nextValue) => ({
        groupChatMessageLimit: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'relationship-familiarity-gain',
      label: 'Familiarity gain per interaction',
      tooltipKey: 'npc.familiarityGain',
      min: 0,
      step: 1,
      value: familiarityGain,
      apply: (nextValue) => ({
        familiarityGain: enforceMinInt(nextValue, 0),
      }),
    },
    {
      id: 'relationship-familiarity-decay',
      label: 'Familiarity decay per turn',
      tooltipKey: 'npc.familiarityDecay',
      min: 0,
      step: 0.1,
      value: familiarityDecay,
      apply: (nextValue) => ({
        familiarityDecay: enforceMin(nextValue, 0),
      }),
    },
    {
      id: 'npc-user-familiarity-interaction-multiplier',
      label: 'User familiarity gain multiplier',
      tooltipKey: 'npc.userFamiliarityMultiplier',
      min: 0.1,
      step: 0.1,
      value: userFamiliarityInteractionMultiplier,
      apply: (nextValue) => ({
        userFamiliarityInteractionMultiplier: enforceMin(nextValue, 0.1),
      }),
    },
    {
      id: 'npc-familiarity-weight-multiplier',
      label: 'Familiarity weight multiplier',
      tooltipKey: 'npc.familiarityWeightMultiplier',
      min: 0,
      step: 0.1,
      value: familiarityWeightMultiplier,
      apply: (nextValue) => ({
        familiarityWeightMultiplier: enforceMin(nextValue, 0),
      }),
    },
    {
      id: 'npc-user-gossip-chance-multiplier',
      label: 'User gossip chance multiplier',
      tooltipKey: 'npc.userGossipChanceMultiplier',
      min: 0,
      step: 0.1,
      value: userGossipChanceMultiplier,
      apply: (nextValue) => ({
        userGossipChanceMultiplier: enforceMin(nextValue, 0),
      }),
    },
    {
      id: 'npc-only-chat-delay',
      label: 'NPC only chat delay',
      tooltipKey: 'npc.onlyChatDelay',
      min: 0,
      step: 0.25,
      value: npcOnlyChatDelay,
      apply: (nextValue) => ({
        npcOnlyChatDelay: enforceMin(nextValue, 0),
      }),
    },
    {
      id: 'scenario-offscreen-mention-limit',
      label: 'Offscreen mention limit',
      tooltipKey: 'npc.offscreenMentionLimit',
      min: 1,
      max: 100,
      step: 1,
      value: offscreenMentionLimit,
      apply: (nextValue) => ({
        offscreenMentionLimit: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'npc-group-chat-additional-participants',
      label: 'Group chat additional participants',
      tooltipKey: 'npc.groupAdditionalParticipants',
      min: 1,
      max: 100,
      step: 1,
      value: npcGroupChatAdditionalParticipants,
      apply: (nextValue) => ({
        npcGroupChatAdditionalParticipants: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'scenario-rolling-summary-limit',
      label: 'Conversation summary history length',
      tooltipKey: 'npc.rollingSummaryLimit',
      min: 1,
      max: 100,
      step: 1,
      value: rollingConversationSummaryLimit,
      apply: (nextValue) => ({
        rollingConversationSummaryLimit: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'scenario-offscreen-information-limit',
      label: 'Offscreen learned information kept',
      tooltipKey: 'npc.offscreenLearnedInformationLimit',
      min: 1,
      max: 100,
      step: 1,
      value: offscreenLearnedInformationLimit,
      apply: (nextValue) => ({
        offscreenLearnedInformationLimit: enforceMinInt(nextValue, 1),
      }),
    },
  ];

  const rangeSettingRows: Array<{
    id: string;
    label: string;
    tooltipKey: SettingsTooltipKey;
    ariaLabel: string;
    value: number;
    apply: (nextPercentValue: number) => SettingsPatch;
  }> = [
    {
      id: 'npc-rich-interaction-rate',
      label: 'Rich interaction rate',
      tooltipKey: 'npc.richRate',
      ariaLabel: 'Rich interaction rate value',
      value: richNpcInteractionRate,
      apply: (nextPercentValue) => ({
        richNpcInteractionRate: clampUnitRate(nextPercentValue / 100),
      }),
    },
    {
      id: 'npc-gossip-rate',
      label: 'Gossip rate',
      tooltipKey: 'npc.gossipRate',
      ariaLabel: 'Gossip rate value',
      value: gossipRate,
      apply: (nextPercentValue) => ({
        gossipRate: clampUnitRate(nextPercentValue / 100),
      }),
    },
    {
      id: 'npc-chat-rate',
      label: 'NPC chat rate',
      tooltipKey: 'npc.singleChatRate',
      ariaLabel: 'NPC chat rate value',
      value: npcChatRate,
      apply: (nextPercentValue) => ({
        npcChatRate: clampUnitRate(nextPercentValue / 100),
      }),
    },
    {
      id: 'npc-triggered-group-rate',
      label: 'NPC group chat rate',
      tooltipKey: 'npc.triggeredGroupRate',
      ariaLabel: 'NPC triggered group chat rate value',
      value: npcTriggeredGroupChatRate,
      apply: (nextPercentValue) => ({
        npcTriggeredGroupChatRate: clampUnitRate(nextPercentValue / 100),
      }),
    },
    {
      id: 'npc-remote-rate',
      label: 'NPC remote chat rate',
      tooltipKey: 'npc.npcTextRate',
      ariaLabel: 'NPC remote chat rate value',
      value: npcRemoteChatRate,
      apply: (nextPercentValue) => ({
        npcRemoteChatRate: clampUnitRate(nextPercentValue / 100),
      }),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Behavior Settings</h2>
      </div>
      <div className="rounded-lg border p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-soft">
        <div className="space-y-2">
          <SettingFieldLabel
            text="NPC group chat speaker selection mode"
            htmlFor="npc-group-chat-speaker-selection-mode"
            tooltipHtml={settingsTooltips['npc.groupSpeakerSelectionMode']}
          />
          <select
            id="npc-group-chat-speaker-selection-mode"
            value={npcGroupChatSpeakerSelectionMode}
            onChange={(event) =>
              setSettings({
                npcGroupChatSpeakerSelectionMode: event.target.value as SpeakerSelectionMode,
              })
            }
            className="rounded-input"
          >
            <option value="round_robin">Round Robin</option>
            <option value="intelligent">Intelligent</option>
          </select>
        </div>

        <div className="space-y-2">
          <SettingFieldLabel
            text="User chat speaker selection mode"
            htmlFor="user-chat-speaker-selection-mode"
            tooltipHtml={settingsTooltips['user.speakerSelectionMode']}
          />
          <select
            id="user-chat-speaker-selection-mode"
            value={userChatSpeakerSelectionMode}
            onChange={(event) =>
              setSettings({
                userChatSpeakerSelectionMode: event.target.value as SpeakerSelectionMode,
              })
            }
            className="rounded-input"
          >
            <option value="round_robin">Round Robin</option>
            <option value="manual">Manual</option>
            <option value="intelligent">Intelligent</option>
          </select>
        </div>

        <CheckboxSettingRow
          id="scenario-freedom-of-movement"
          label="Freedom of movement"
          tooltipHtml={settingsTooltips['npc.freedomOfMovement']}
          checked={freedomOfMovement}
          onChange={(nextChecked) => setSettings({ freedomOfMovement: nextChecked })}
        />

        {rangeSettingRows.map((setting) => (
          <div key={setting.id}>
            <SettingFieldLabel
              text={`${setting.label} (${toPercent(setting.value)}%)`}
              htmlFor={setting.id}
              tooltipHtml={settingsTooltips[setting.tooltipKey]}
            />
            <RangeNumberInput
              id={setting.id}
              min={0}
              max={100}
              step={1}
              value={toPercent(setting.value)}
              ariaLabel={setting.ariaLabel}
              onChange={(next) => {
                setSettings(setting.apply(next));
              }}
            />
          </div>
        ))}

        {numericSettingRows.map((setting) => {
          const displayValue = drafts.hasOwnProperty(setting.id) ? Number(drafts[setting.id]) : setting.value;

          return (
            <NumericSettingRow
              key={setting.id}
              id={setting.id}
              label={setting.label}
              tooltipHtml={settingsTooltips[setting.tooltipKey]}
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={displayValue}
              onChange={(nextValue) => {
                setDrafts((prev) => ({ ...prev, [setting.id]: nextValue }));
              }}
              onBlur={() => {
                const raw = drafts.hasOwnProperty(setting.id) ? Number(drafts[setting.id]) : setting.value;
                setSettings(setting.apply(raw));
                setDrafts((prev) => {
                  const copy = { ...prev, [setting.id]: raw };
                  return copy;
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
