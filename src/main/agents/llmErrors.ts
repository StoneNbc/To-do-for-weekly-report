import type { ApiErrorCode } from '../../shared/results';

export class LlmError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
