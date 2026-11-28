import { useState } from 'react';
import type { LLMConfig } from '../engine/settings/cascading_llm_configs.js';
import { useStateRef } from './useStateRef.js';
import { testLlmGenerateText } from '../util/llm_connection_test.js';

function formatResponsePreview(responseText: string): string {
  const collapsed = responseText.replace(/\s+/g, ' ').trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
}

export function useLlmConnectionTest() {
  const [loading, setLoading, loadingRef] = useStateRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [responseText, setResponseText] = useState('');

  const testGenerateText = async (configsOverride: readonly LLMConfig[]) => {
    if (loadingRef.current) return;
    setLoading(true);
    setError('');
    setSuccess(false);
    setResponseText('');

    const result = await testLlmGenerateText(configsOverride);
    if (result.ok) {
      setResponseText(result.responseText);
      setSuccess(true);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return {
    loading,
    error,
    success,
    responseText,
    responsePreview: responseText ? formatResponsePreview(responseText) : '',
    testGenerateText,
  };
}
