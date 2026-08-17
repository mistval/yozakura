import { useMemo, type ChangeEvent, type ReactNode } from 'react';
import { useDraft } from '../../hooks/useDraft.js';
import type { Character, Wardrobe } from '../../engine/types.js';
import { createWardrobe } from '../../engine/wardrobes.js';
import InfoTooltip from '../ui/InfoTooltip.js';
import { assertNonNullish } from '../../errors/application_error.js';

type ImplicitWardrobeEditorProps = {
  character: Character;
  onChange: (nextWardrobes: Character['wardrobes']) => void;
  actionRowElements?: (params: {
    index: number;
    wardrobe: Character['wardrobes'][number];
    hasText: boolean;
    disabled: boolean;
  }) => ReactNode;
  disabled?: boolean;
  showEnabledToggle?: boolean;
  className?: string;
};

function sanitizeDraftRows(wardrobes: Wardrobe[]) {
  return wardrobes.filter((w) => w.text.trim() !== '');
}

export default function ImplicitWardrobeEditor({
  character,
  onChange,
  actionRowElements,
  disabled = false,
  className = 'space-y-3',
  showEnabledToggle = true,
}: ImplicitWardrobeEditorProps) {
  const sanitizedSource = useMemo(() => sanitizeDraftRows(character.wardrobes), [character.wardrobes]);
  const [sanitizedDraftRows, setSanitizedDraftRows] = useDraft(sanitizedSource, { refreshFromSourceTrigger: character.id });

  const displayRows = useMemo(() => {
    return sanitizedDraftRows.concat(createWardrobe('', sanitizedDraftRows.length === 0 ? 'default' : ''));
  }, [sanitizedDraftRows]);

  const applyDraftRows = (updater: (prev: Character['wardrobes']) => Character['wardrobes']) => {
    setSanitizedDraftRows((prev) => {
      const next = updater(prev);
      const sanitized = sanitizeDraftRows(next);
      onChange(sanitized);
      return sanitized;
    });
  };

  const handleTextChange = (index: number, event: ChangeEvent<HTMLTextAreaElement>) => {
    if (event.target.value[0] === ' ' && new Set([...event.target.value]).size === 1) {
      return;
    }

    applyDraftRows((prev) => {
      const updated = [...prev];
      const updatedRow = updated[index];

      if (updatedRow) {
        updated[index] = {
          ...updatedRow,
          text: event.target.value,
        };
      } else {
        updated.push(createWardrobe(event.target.value, index === 0 ? 'default' : ''));
      }

      return updated;
    });
  };

  const handleToggleEnabled = (index: number, enabled: boolean) => {
    applyDraftRows((prev) => {
      const updated = [...prev];
      const row = updated[index];
      assertNonNullish(row, `Row at index ${index} should exist when toggling enabled`);

      updated[index] = {
        ...row,
        enabled,
      };

      return updated;
    });
  };

  const handleAutoSelectGroupChange = (index: number, value: string) => {
    applyDraftRows((prev) => {
      const updated = [...prev];
      const row = updated[index];
      assertNonNullish(row, `Row at index ${index} should exist when changing auto select group`);

      updated[index] = {
        ...row,
        autoSelectGroup: value,
      };

      return updated;
    });
  };

  const handleToggleAutoRevert = (index: number, autoRevert: boolean) => {
    applyDraftRows((prev) => {
      const updated = [...prev];
      const row = updated[index];
      assertNonNullish(row, `Row at index ${index} should exist when toggling auto revert`);

      updated[index] = {
        ...row,
        autoRevert,
      };

      return updated;
    });
  };

  return (
    <div className={className}>
      {displayRows.map((wardrobe, index) => {
        const hasText = Boolean(wardrobe.text.trim());

        return (
          <div key={`implicit-wardrobe-${wardrobe.id}`} className="block border rounded-sm p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2">
                {hasText && showEnabledToggle && (
                  <input
                    type="checkbox"
                    checked={wardrobe.enabled}
                    disabled={disabled}
                    onChange={(event) => handleToggleEnabled(index, event.target.checked)}
                  />
                )}

                <span className="font-medium">Wardrobe {index + 1}</span>
              </label>

              <div className="flex items-center gap-2">
                {actionRowElements &&
                  actionRowElements({
                    index,
                    wardrobe,
                    hasText,
                    disabled,
                  })}
              </div>
            </div>

            <textarea
              value={wardrobe.text}
              onChange={(event) => handleTextChange(index, event)}
              rows={3}
              className="w-full border rounded-sm p-2 bg-inset text-sm"
              disabled={disabled}
            />

            {hasText && (
              <div className="flex justify-between">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-secondary whitespace-nowrap">
                    <span>Autoselect group</span>
                    <InfoTooltip
                      label="Autoselect group"
                      html="If non-empty, this wardrobe will be included in the named group. At the start of each scenario day, one wardrobe from each group is randomly selected and enabled; all others in the group are disabled. Leave empty to opt out of daily autoselection. This feature allows characters to spontaneously change appearance multidimensionally between days."
                    />
                  </label>
                  <input
                    type="text"
                    value={wardrobe.autoSelectGroup}
                    onChange={(event) => handleAutoSelectGroupChange(index, event.target.value)}
                    placeholder="e.g. hat, shoes, expression…"
                    className="flex-1 border rounded-sm px-2 py-1 bg-inset text-xs"
                    disabled={disabled}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-secondary">
                  <input
                    type="checkbox"
                    checked={wardrobe.autoRevert}
                    disabled={disabled}
                    onChange={(event) => handleToggleAutoRevert(index, event.target.checked)}
                  />
                  <span>Auto revert</span>
                  <InfoTooltip
                    label="Auto revert"
                    html='If auto revert is enabled, changes to the enabled state of this wardrobe during a chat will be reverted after the chat ends. This is useful for temporary states like "surprised expression" that should be turned off again after the conversation.'
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
