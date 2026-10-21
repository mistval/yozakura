import { useMemo, type ChangeEvent, type ReactNode } from 'react';
import type { Character, Wardrobe } from '../../engine/types.js';
import {
  createWardrobe,
  DAILY_AUTOSELECT_TAG_PREFIX,
  formatPrefixedTag,
  TagView,
} from '../../engine/wardrobes.js';
import InfoTooltip from '../ui/InfoTooltip.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { useDraft } from '../../hooks/useDraft.js';

function WardrobeTagsInput({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (nextTags: string[]) => void;
  disabled?: boolean;
}) {
  const currentTagsString = useMemo(() => new TagView(tags).getAll().join(', '), [tags]);
  const [draft, setDraft] = useDraft(currentTagsString);

  const handleBlur = () => {
    const parsed = draft
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !t.includes(':'));
    onChange(new TagView(tags).replaceAll(parsed));
    setDraft(parsed.join(', '));
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={handleBlur}
      placeholder="e.g. casual_clothes, work_uniform…"
      className="flex-1 border rounded-sm px-2 py-1 bg-inset text-xs min-w-[120px]"
      disabled={disabled}
    />
  );
}

type ImplicitWardrobeEditorProps = {
  wardrobes: Character['wardrobes'];
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
  wardrobes,
  onChange,
  actionRowElements,
  disabled = false,
  className = 'space-y-3',
  showEnabledToggle = true,
}: ImplicitWardrobeEditorProps) {
  const sanitizedSource = useMemo(() => sanitizeDraftRows(wardrobes), [wardrobes]);

  const displayRows = useMemo(() => {
    return sanitizedSource.concat(
      createWardrobe(
        '',
        sanitizedSource.length === 0 ? [formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, 'default')] : []
      )
    );
  }, [sanitizedSource]);

  const applyDraftRows = (nextDraftRows: Character['wardrobes']) => {
    const sanitized = sanitizeDraftRows(nextDraftRows);
    onChange(sanitized);
  };

  const handleTextChange = (index: number, event: ChangeEvent<HTMLTextAreaElement>) => {
    if (event.target.value[0] === ' ' && new Set([...event.target.value]).size === 1) {
      return;
    }

    const updated = [...sanitizedSource];
    const updatedRow = updated[index];

    if (updatedRow) {
      updated[index] = {
        ...updatedRow,
        text: event.target.value,
      };
    } else {
      updated.push(
        createWardrobe(
          event.target.value,
          index === 0 ? [formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, 'default')] : []
        )
      );
    }

    applyDraftRows(updated);
  };

  const handleToggleEnabled = (index: number, enabled: boolean) => {
    const updated = [...sanitizedSource];
    const row = updated[index];
    assertNonNullish(row, `Row at index ${index} should exist when toggling enabled`);

    updated[index] = {
      ...row,
      enabled,
    };

    applyDraftRows(updated);
  };

  const handleAutoSelectGroupChange = (index: number, value: string) => {
    const updated = [...sanitizedSource];
    const row = updated[index];
    assertNonNullish(row, `Row at index ${index} should exist when changing auto select group`);

    updated[index] = {
      ...row,
      tags: new TagView(row.tags, DAILY_AUTOSELECT_TAG_PREFIX).replaceSingle(value),
    };

    applyDraftRows(updated);
  };

  const handleWardrobeTagsChange = (index: number, nextTags: string[]) => {
    const updated = [...sanitizedSource];
    const row = updated[index];
    assertNonNullish(row, `Row at index ${index} should exist when changing tags`);

    updated[index] = {
      ...row,
      tags: nextTags,
    };

    applyDraftRows(updated);
  };

  const handleToggleAutoRevert = (index: number, autoRevert: boolean) => {
    const updated = [...sanitizedSource];
    const row = updated[index];
    assertNonNullish(row, `Row at index ${index} should exist when toggling auto revert`);

    updated[index] = {
      ...row,
      autoRevert,
    };

    applyDraftRows(updated);
  };

  return (
    <div className={className}>
      {displayRows.map((wardrobe, index) => {
        const hasText = Boolean(wardrobe.text.trim());

        return (
          <div key={`implicit-wardrobe-${index}`} className="block border rounded-sm p-3 text-sm space-y-2">
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
              <>
              <div className="flex justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-secondary whitespace-nowrap">
                      <span>Autoselect group</span>
                      <InfoTooltip
                        label="Autoselect group"
                        html='If non-empty, this wardrobe will be included in the named group. At the start of each scenario day, one wardrobe from each group is randomly selected and enabled; all others in the group are disabled. Leave empty to opt out of daily autoselection. This feature allows characters to spontaneously change appearance multidimensionally between days. For details, see the <a href="https://mistval.github.io/yozakura/docs/wardrobes">Wardrobes documentation</a>.'
                      />
                    </label>
                    <input
                      type="text"
                      value={new TagView(wardrobe.tags, DAILY_AUTOSELECT_TAG_PREFIX).getFirst() ?? ''}
                      onChange={(event) => handleAutoSelectGroupChange(index, event.target.value)}
                      placeholder="e.g. hat, shoes, expression…"
                      className="flex-1 border rounded-sm px-2 py-1 bg-inset text-xs min-w-[120px]"
                      disabled={disabled}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-secondary whitespace-nowrap">
                      <span>Tags</span>
                      <InfoTooltip
                        label="Wardrobe tags"
                        html='Comma-separated tags for this wardrobe (e.g. casual_clothes, work_uniform). These can be targeted by Map Zone Wardrobe Triggers to automatically enable or disable outfits when entering zones. For details, see the <a href="https://mistval.github.io/yozakura/docs/wardrobes">Wardrobes documentation</a>.'
                      />
                    </label>
                    <WardrobeTagsInput
                      tags={wardrobe.tags}
                      onChange={(nextTags) => handleWardrobeTagsChange(index, nextTags)}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
