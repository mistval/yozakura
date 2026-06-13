import { safeParseJson } from '../util/json';

enum ErrorCode {
  NotFound = 'NotFound',
  NonNullAssertion = 'NonNullAssertion',
  Unknown = 'Unknown',
}

export class ApplicationError extends Error {
  public readonly errorCode: ErrorCode;

  constructor(message: string, errorCode: ErrorCode) {
    super(message);
    this.errorCode = errorCode;
  }

  static async fromFetchResponse(response: Response): Promise<ApplicationError> {
    const responseText = await response.text();
    const responseJson = safeParseJson(responseText);

    const errorMessage = responseJson ? ((responseJson as any).error ?? responseText) : responseText;

    switch (response.status) {
      case 404:
        return new ApplicationError(`Resource not found: ${response.url}`, ErrorCode.NotFound);
      default:
        return new ApplicationError(
          `HTTP Error ${response.status} ${response.statusText}: ${errorMessage}`,
          ErrorCode.Unknown
        );
    }
  }
}

export function assertNonNullish<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new ApplicationError(message || 'Value is null or undefined', ErrorCode.NonNullAssertion);
  }
}

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new ApplicationError(message || 'Assertion failed', ErrorCode.Unknown);
  }
}
