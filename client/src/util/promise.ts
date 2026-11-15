export function wait(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (abortSignal?.aborted) {
    return Promise.reject(abortSignal.reason);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timerId);
      reject(abortSignal?.reason);
    };

    const timerId = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function raceWithAbort<T>(promise: Promise<T>, abortSignal: AbortSignal): Promise<T> {
  if (abortSignal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortSignal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortSignal.reason);
    };

    abortSignal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        abortSignal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        abortSignal.removeEventListener('abort', onAbort);
        if (!abortSignal.aborted) {
          reject(error);
        }
      }
    );
  });
}
