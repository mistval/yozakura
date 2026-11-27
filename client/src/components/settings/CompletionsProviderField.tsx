import { useState } from 'react';

interface CompletionsApiProvider {
  id: string;
  label: string;
  url: string;
  aliases: readonly string[];
}

export const COMPLETIONS_API_PROVIDERS: readonly CompletionsApiProvider[] = [
  {
    id: 'koboldcpp',
    label: 'KoboldCpp',
    url: 'http://127.0.0.1:5001/v1/chat/completions',
    aliases: ['http://localhost:5001/v1/chat/completions'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    aliases: [],
  },
  {
    id: 'nanogpt',
    label: 'NanoGPT',
    url: 'https://api.nano-gpt.com/api/v1/chat/completions',
    aliases: ['https://nano-gpt.com/api/v1/chat/completions'],
  },
  {
    id: 'featherless',
    label: 'Featherless AI',
    url: 'https://api.featherless.ai/v1/chat/completions',
    aliases: [],
  },
  {
    id: 'demonroute',
    label: 'Demon Route',
    url: 'https://api.demonroute.com/v1/chat/completions',
    aliases: [],
  },
  {
    id: 'chutes',
    label: 'Chutes',
    url: 'https://llm.chutes.ai/v1/chat/completions',
    aliases: [],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    url: 'http://127.0.0.1:1234/v1/chat/completions',
    aliases: ['http://localhost:1234/v1/chat/completions'],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    aliases: ['http://localhost:11434/v1/chat/completions'],
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    url: 'http://127.0.0.1:8080/v1/chat/completions',
    aliases: ['http://localhost:8080/v1/chat/completions'],
  },
];

function findMatchingProvider(url: string): CompletionsApiProvider | undefined {
  const trimmed = url.trim();
  return COMPLETIONS_API_PROVIDERS.find(
    (provider) => provider.url === trimmed || provider.aliases.includes(trimmed)
  );
}

export interface CompletionsProviderFieldProps {
  id: string;
  value: string;
  onChange: (nextUrl: string) => void;
  onPresetSelect?: ((nextUrl: string) => void) | undefined;
  onCustomInputBlur?: (() => void) | undefined;
  allowInherit?: boolean | undefined;
  selectClassName?: string | undefined;
  inputClassName?: string | undefined;
}

export default function CompletionsProviderField({
  id,
  value,
  onChange,
  onPresetSelect,
  onCustomInputBlur,
  allowInherit = false,
  selectClassName = 'rounded-input',
  inputClassName = 'rounded-input',
}: CompletionsProviderFieldProps) {
  const [customForced, setCustomForced] = useState(false);

  const matchedProvider = findMatchingProvider(value);
  const selectedOption = customForced
    ? 'custom'
    : allowInherit && !value.trim()
      ? 'inherit'
      : (matchedProvider?.id ?? 'custom');

  const handleSelectChange = (nextOption: string) => {
    if (nextOption === 'custom') {
      setCustomForced(true);
      return;
    }

    if (nextOption === 'inherit') {
      setCustomForced(false);
      onChange('');
      onPresetSelect?.('');
      return;
    }

    const provider = COMPLETIONS_API_PROVIDERS.find((item) => item.id === nextOption);
    if (!provider) {
      return;
    }

    setCustomForced(false);
    onChange(provider.url);
    onPresetSelect?.(provider.url);
  };

  return (
    <div className="space-y-2">
      <select
        id={id}
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
          id={`${id}-custom`}
          aria-label="Custom Completions API URL"
          value={value}
          onChange={(event) => {
            setCustomForced(true);
            onChange(event.target.value);
          }}
          onBlur={onCustomInputBlur}
          placeholder="http://127.0.0.1:5001/v1/chat/completions"
          className={inputClassName}
        />
      )}
    </div>
  );
}
