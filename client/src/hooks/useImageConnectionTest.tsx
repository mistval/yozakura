import { useState } from 'react';
import { useStateRef } from './useStateRef.js';
import { testImageConnection } from '../util/image_connection_test.js';
import type { ImageApiShape } from '../state/settings_store.js';

export function useImageConnectionTest() {
  const [loading, setLoading, loadingRef] = useStateRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const testConnection = async (url: string, authToken: string, shape: ImageApiShape) => {
    if (loadingRef.current) return;
    setLoading(true);
    setError('');
    setSuccess(false);

    const result = await testImageConnection(url, authToken, shape);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const clearError = () => setError('');

  return { loading, error, success, testConnection, clearError };
}
