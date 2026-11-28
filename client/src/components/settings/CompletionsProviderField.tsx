import { useState } from 'react';
import SettingFieldLabel from './ui/SettingFieldLabel.js';

interface CompletionsApiProvider {
  id: string;
  label: string;
  url: string;
  aliases: readonly string[];
  tokenRecommended: boolean;
  modelRecommended: boolean;
  defaultModel?: string | undefined;
}

export const COMPLETIONS_API_PROVIDERS: readonly CompletionsApiProvider[] = [
  {
    id: 'koboldcpp',
    label: 'KoboldCpp',
    url: 'http://127.0.0.1:5001/v1/chat/completions',
    aliases: ['http://localhost:5001/v1/chat/completions'],
    tokenRecommended: false,
    modelRecommended: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    aliases: [],
    tokenRecommended: true,
    modelRecommended: true,
    defaultModel: 'deepseek/deepseek-v4.1-flash-1017',
  },
  {
    id: 'nanogpt',
    label: 'NanoGPT',
    url: 'https://api.nano-gpt.com/api/v1/chat/completions',
    aliases: ['https://nano-gpt.com/api/v1/chat/completions'],
    tokenRecommended: true,
    modelRecommended: true,
  },
  {
    id: 'featherless',
    label: 'Featherless AI',
    url: 'https://api.featherless.ai/v1/chat/completions',
    aliases: [],
    tokenRecommended: true,
    modelRecommended: true,
  },
  {
    id: 'demonroute',
    label: 'Demon Route',
    url: 'https://api.demonroute.com/v1/chat/completions',
    aliases: [],
    tokenRecommended: true,
    modelRecommended: true,
  },
  {
    id: 'chutes',
    label: 'Chutes',
    url: 'https://llm.chutes.ai/v1/chat/completions',
    aliases: [],
    tokenRecommended: true,
    modelRecommended: true,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    url: 'http://127.0.0.1:1234/v1/chat/completions',
    aliases: ['http://localhost:1234/v1/chat/completions'],
    tokenRecommended: false,
    modelRecommended: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    aliases: ['http://localhost:11434/v1/chat/completions'],
    tokenRecommended: false,
    modelRecommended: true,
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    url: 'http://127.0.0.1:8080/v1/chat/completions',
    aliases: ['http://localhost:8080/v1/chat/completions'],
    tokenRecommended: false,
    modelRecommended: false,
  },
];

function findMatchingProvider(url: string): CompletionsApiProvider | undefined {
  const trimmed = url.trim();
  return COMPLETIONS_API_PROVIDERS.find(
    (provider) => provider.url === trimmed || provider.aliases.includes(trimmed)
  );
}

export interface CompletionsProviderFieldProps {
  idPrefix: string;
  url: string;
  onUrlChange: (nextUrl: string) => void;
  authToken: string;
  onAuthTokenChange: (nextToken: string) => void;
  model: string;
  onModelChange: (nextModel: string) => void;
  onPresetSelect?: ((update: { url: string; model: string }) => void) | undefined;
  onFieldBlur?: (() => void) | undefined;
  allowInherit?: boolean | undefined;
  providerTooltip?: string | undefined;
  providerTooltipDangerousHtml?: string | undefined;
  tokenTooltip?: string | undefined;
  modelTooltip?: string | undefined;
  modelTooltipDangerousHtml?: string | undefined;
  className?: string | undefined;
  fieldWrapperClassName?: string | undefined;
  labelClassName?: string | undefined;
  labelWrapperClassName?: string | undefined;
  selectClassName?: string | undefined;
  inputClassName?: string | undefined;
  tokenToggleButtonClassName?: string | undefined;
}

export default function CompletionsProviderField({
  idPrefix,
  url,
  onUrlChange,
  authToken,
  onAuthTokenChange,
  model,
  onModelChange,
  onPresetSelect,
  onFieldBlur,
  allowInherit = false,
  providerTooltip,
  providerTooltipDangerousHtml,
  tokenTooltip,
  modelTooltip,
  modelTooltipDangerousHtml,
  className = 'space-y-2',
  fieldWrapperClassName,
  labelClassName,
  labelWrapperClassName,
  selectClassName = 'rounded-input',
  inputClassName = 'rounded-input',
  tokenToggleButtonClassName = 'shrink-0 px-2 py-1 border rounded-sm',
}: CompletionsProviderFieldProps) {
  const [customForced, setCustomForced] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [modelEditedByUser, setModelEditedByUser] = useState(false);

  const matchedProvider = findMatchingProvider(url);
  const selectedOption = customForced
    ? 'custom'
    : allowInherit && !url.trim()
      ? 'inherit'
      : (matchedProvider?.id ?? 'custom');
  const activeProvider =
    selectedOption !== 'custom' && selectedOption !== 'inherit' ? matchedProvider : undefined;

  const tokenRecommended = activeProvider?.tokenRecommended ?? false;
  const modelRecommended = activeProvider?.modelRecommended ?? false;

  const urlId = `${idPrefix}-url`;
  const tokenId = `${idPrefix}-token`;
  const modelId = `${idPrefix}-model`;

  const applyModelForProviderChange = (nextDefaultModel: string | undefined): string => {
    const nextModel = modelEditedByUser ? model : (nextDefaultModel ?? '');
    if (nextModel !== model) {
      onModelChange(nextModel);
    }
    return nextModel;
  };

  const handleSelectChange = (nextOption: string) => {
    if (nextOption === 'custom') {
      setCustomForced(true);
      const nextModel = applyModelForProviderChange(undefined);
      if (nextModel !== model) {
        onPresetSelect?.({ url, model: nextModel });
      }
      return;
    }

    if (nextOption === 'inherit') {
      setCustomForced(false);
      const nextModel = applyModelForProviderChange(undefined);
      onUrlChange('');
      onPresetSelect?.({ url: '', model: nextModel });
      return;
    }

    const provider = COMPLETIONS_API_PROVIDERS.find((item) => item.id === nextOption);
    if (!provider) {
      return;
    }

    setCustomForced(false);
    const nextModel = applyModelForProviderChange(provider.defaultModel);
    onUrlChange(provider.url);
    onPresetSelect?.({ url: provider.url, model: nextModel });
  };

  return (
    <div className={className}>
      <div className={fieldWrapperClassName}>
        <SettingFieldLabel
          text="Completions API Provider"
          htmlFor={urlId}
          tooltip={providerTooltip}
          tooltipDangerousHtml={providerTooltipDangerousHtml}
          tooltipLabel="About Completions API Provider"
          className={labelClassName}
          wrapperClassName={labelWrapperClassName}
        />
        <div className="space-y-2">
          <select
            id={urlId}
            value={selectedOption}
            onChange={(event) => handleSelectChange(event.target.value)}
            className={selectClassName}
          >
            {allowInherit && <option value="inherit">(inherit)</option>}
            {COMPLETIONS_API_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>

          {selectedOption === 'custom' && (
            <input
              id={`${urlId}-custom`}
              aria-label="Custom Completions API URL"
              value={url}
              onChange={(event) => {
                setCustomForced(true);
                onUrlChange(event.target.value);
              }}
              onBlur={onFieldBlur}
              placeholder="http://127.0.0.1:5001/v1/chat/completions"
              className={inputClassName}
            />
          )}
        </div>
      </div>

      <div className={fieldWrapperClassName}>
        <SettingFieldLabel
          text={tokenRecommended ? 'Auth Token' : 'Auth Token (optional)'}
          htmlFor={tokenId}
          tooltip={tokenTooltip}
          tooltipLabel="About Auth Token"
          className={labelClassName}
          wrapperClassName={labelWrapperClassName}
        />
        <div className="flex gap-2">
          <input
            id={tokenId}
            type={showToken ? 'text' : 'password'}
            value={authToken}
            onChange={(event) => onAuthTokenChange(event.target.value)}
            onBlur={onFieldBlur}
            placeholder="Auth token"
            className={inputClassName}
          />
          <button
            type="button"
            onClick={() => setShowToken((prev) => !prev)}
            className={tokenToggleButtonClassName}
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className={fieldWrapperClassName}>
        <SettingFieldLabel
          text={modelRecommended ? 'Model' : 'Model (optional)'}
          htmlFor={modelId}
          tooltip={modelTooltip}
          tooltipDangerousHtml={modelTooltipDangerousHtml}
          tooltipLabel="About Model"
          className={labelClassName}
          wrapperClassName={labelWrapperClassName}
        />
        <input
          id={modelId}
          value={model}
          onChange={(event) => {
            setModelEditedByUser(event.target.value.trim().length > 0);
            onModelChange(event.target.value);
          }}
          onBlur={onFieldBlur}
          placeholder="deepseek/deepseek-v4.1-flash-1017"
          className={inputClassName}
        />
      </div>
    </div>
  );
}
