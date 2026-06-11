import { useState } from 'react';
import { useStateRef } from './useStateRef.js';
import { testLlmConnection } from '../util/llm_connection_test.js';

export function useLlmConnectionTest() {
  const [loading, setLoading, loadingRef] = useStateRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const testConnection = async (url: string, authToken: string) => {
    if (loadingRef.current) return;
    setLoading(true);
    setError('');
    setSuccess(false);

    const result = await testLlmConnection(url, authToken);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return { loading, error, success, testConnection };
}
