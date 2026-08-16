import type { ApiErrorCode } from '../../shared/results';

/** 将 Main 内部的远程调用失败限制为 Renderer 可以安全展示的错误码和文案。 */
export class LlmError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
