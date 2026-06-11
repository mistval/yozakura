export class InteractiveRetryError extends Error {
  public readonly originalError: unknown;

  public constructor(originalError: unknown) {
    const fallbackMessage = 'Operation failed after interactive retry handling';
    const message =
      originalError instanceof Error && typeof originalError.message === 'string'
        ? originalError.message || fallbackMessage
        : fallbackMessage;

    super(message);
    this.name = 'InteractiveRetryError';
    this.originalError = originalError;

    if (originalError instanceof Error && typeof originalError.stack === 'string') {
      this.stack = originalError.stack;
    }
  }
}
