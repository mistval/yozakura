import {
  useSettingsStore,
  type NpcChatEndMode,
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

type NumericSettingRowConfig = {
  id: string;
  label: string;
  tooltipKey: SettingsTooltipKey;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  apply: (nextValue: number) => SettingsPatch;
};

function TwoColGrid({ children, colSpan = 1 }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <div
      className={`rounded-lg border p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-soft col-span-${colSpan}`}
    >
      {children}
    </div>
  );
}

export default function BehaviorSettingsSection() {
  const richNpcMessageCount = useSettingsStore((s) => s.richNpcMessageCount);
  const groupChatMessageLimit = useSettingsStore((s) => s.groupChatMessageLimit);
  const npcChatEndMode = useSettingsStore((s) => s.npcChatEndMode);
  const intelligentChatEndMinLength = useSettingsStore((s) => s.intelligentChatEndMinLength);
  const intelligentChatEndMaxLength = useSettingsStore((s) => s.intelligentChatEndMaxLength);
  const intelligentChatEndTargetLength = useSettingsStore((s) => s.intelligentChatEndTargetLength);
  const intelligentChatEndGroupTargetLength = useSettingsStore((s) => s.intelligentChatEndGroupTargetLength);
  const intelligentChatEndJudgementInterval = useSettingsStore((s) => s.intelligentChatEndJudgementInterval);
  const intelligentChatEndJudgeHistoryLength = useSettingsStore(
    (s) => s.intelligentChatEndJudgeHistoryLength
  );
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
  const speakerSelectionMode = useSettingsStore((s) => s.speakerSelectionMode);
  const pauseAtNpcChatStart = useSettingsStore((s) => s.pauseAtNpcChatStart);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [drafts, setDrafts] = useState<Record<string, number | string>>({});

  useEffect(() => {
    setDrafts({});
  }, [
    richNpcMessageCount,
    groupChatMessageLimit,
    npcChatEndMode,
    intelligentChatEndMinLength,
    intelligentChatEndMaxLength,
    intelligentChatEndTargetLength,
    intelligentChatEndGroupTargetLength,
    intelligentChatEndJudgementInterval,
    intelligentChatEndJudgeHistoryLength,
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
    speakerSelectionMode,
    pauseAtNpcChatStart,
  ]);

  const numericSettingRows: NumericSettingRowConfig[] = [
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

  const fixedChatEndRows: NumericSettingRowConfig[] = [
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
      step: 1,
      value: groupChatMessageLimit,
      apply: (nextValue) => ({
        groupChatMessageLimit: enforceMinInt(nextValue, 1),
      }),
    },
  ];

  const intelligentChatEndRows: NumericSettingRowConfig[] = [
    {
      id: 'intelligent-chat-end-min-length',
      label: 'Min length',
      tooltipKey: 'npc.intelligentMinLength',
      min: 1,
      step: 1,
      value: intelligentChatEndMinLength,
      apply: (nextValue) => ({
        intelligentChatEndMinLength: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'intelligent-chat-end-max-length',
      label: 'Max length',
      tooltipKey: 'npc.intelligentMaxLength',
      min: 1,
      step: 1,
      value: intelligentChatEndMaxLength,
      apply: (nextValue) => ({
        intelligentChatEndMaxLength: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'intelligent-chat-end-target-length',
      label: 'Target length (one-on-one chat)',
      tooltipKey: 'npc.intelligentTargetLength',
      min: 1,
      step: 1,
      value: intelligentChatEndTargetLength,
      apply: (nextValue) => ({
        intelligentChatEndTargetLength: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'intelligent-chat-end-group-target-length',
      label: 'Target length (group chat)',
      tooltipKey: 'npc.intelligentGroupTargetLength',
      min: 1,
      step: 1,
      value: intelligentChatEndGroupTargetLength,
      apply: (nextValue) => ({
        intelligentChatEndGroupTargetLength: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'intelligent-chat-end-judgement-interval',
      label: 'Judgement interval',
      tooltipKey: 'npc.intelligentJudgementInterval',
      min: 1,
      step: 1,
      value: intelligentChatEndJudgementInterval,
      apply: (nextValue) => ({
        intelligentChatEndJudgementInterval: enforceMinInt(nextValue, 1),
      }),
    },
    {
      id: 'intelligent-chat-end-judge-history-length',
      label: 'Judge message history length',
      tooltipKey: 'npc.intelligentJudgeHistoryLength',
      min: 1,
      step: 1,
      value: intelligentChatEndJudgeHistoryLength,
      apply: (nextValue) => ({
        intelligentChatEndJudgeHistoryLength: enforceMinInt(nextValue, 1),
      }),
    },
  ];

  const chatEndRows = npcChatEndMode === 'fixed' ? fixedChatEndRows : intelligentChatEndRows;

  const renderNumericSettingRow = (setting: NumericSettingRowConfig) => {
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
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Behavior Settings</h2>
      </div>
      <TwoColGrid>
        <div className="space-y-2">
          <SettingFieldLabel
            text="Speaker selection mode"
            htmlFor="speaker-selection-mode"
            tooltipHtml={settingsTooltips['speakerSelectionMode']}
          />
          <select
            id="speaker-selection-mode"
            value={speakerSelectionMode}
            onChange={(event) => {
              const nextMode = event.target.value as SpeakerSelectionMode;
              setSettings({ speakerSelectionMode: nextMode });
            }}
            className="rounded-input"
          >
            <option value="round_robin">Round Robin</option>
            <option value="intelligent">Intelligent</option>
          </select>
        </div>

        <CheckboxSettingRow
          id="scenario-pause-at-npc-chat-start"
          label="Pause at NPC chat start"
          tooltipHtml={settingsTooltips['behavior.pauseAtNpcChatStart']}
          checked={pauseAtNpcChatStart}
          onChange={(nextChecked) => setSettings({ pauseAtNpcChatStart: nextChecked })}
        />

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

        {numericSettingRows.map(renderNumericSettingRow)}

        <TwoColGrid colSpan={2}>
          <div className="space-y-2 col-span-2">
            <SettingFieldLabel
              text="NPC chat end mode"
              htmlFor="npc-chat-end-mode"
              tooltipHtml={settingsTooltips['npc.chatEndMode']}
            />
            <select
              id="npc-chat-end-mode"
              value={npcChatEndMode}
              onChange={(event) => {
                setSettings({ npcChatEndMode: event.target.value as NpcChatEndMode });
              }}
              className="rounded-input"
            >
              <option value="fixed">Fixed length</option>
              <option value="intelligent">Intelligent</option>
            </select>
          </div>

          {chatEndRows.map(renderNumericSettingRow)}
        </TwoColGrid>
      </TwoColGrid>
    </div>
  );
}
