import type { LlmConnectionSettings } from '../../shared/domain';
import { getChatCompletionsUrl } from './llmEndpointPolicy';
import { LlmError } from './llmErrors';
import type { ChatMessage } from './promptBuilder';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Main Process 专用的最小 OpenAI Chat Completions 客户端。
 * 它不接收任意 Header 或 HTTP 方法，避免 Renderer 把该能力扩展成通用网络代理。
 */
export class LlmHttpClient {
  async complete(
    settings: LlmConnectionSettings,
    apiKey: string | null,
    messages: readonly ChatMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    // 用内部 Controller 汇合用户取消与超时，并在错误映射时保留两者不同的用户语义。
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), settings.timeoutMs);
    const abortFromCaller = (): void => controller.abort('cancelled');
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const requestBody = JSON.stringify({
        model: settings.model,
        messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: false,
      });
      if (Buffer.byteLength(requestBody) > MAX_REQUEST_BYTES) {
        throw new LlmError('INVALID_INPUT', '当前周内容和模板过大，无法发送给远程服务');
      }
      const response = await fetch(
        getChatCompletionsUrl(settings.baseUrl, settings.allowInsecureHttp),
        {
          method: 'POST',
          headers,
          // 禁止自动重定向，避免 Authorization 被意外带到另一个 origin。
          redirect: 'manual',
          signal: controller.signal,
          body: requestBody,
        },
      );

      if (response.status >= 300 && response.status < 400) {
        throw new LlmError('NETWORK_POLICY_BLOCKED', '远程服务返回重定向，应用已拒绝跟随');
      }
      if (response.status === 401 || response.status === 403) {
        throw new LlmError('REMOTE_AUTH_FAILED', '认证失败，请检查 API Key 和服务地址');
      }
      if (response.status === 429) {
        throw new LlmError('REMOTE_RATE_LIMITED', '请求过于频繁或额度不足，请稍后重试');
      }
      if (!response.ok) {
        throw new LlmError('REMOTE_REQUEST_FAILED', `远程服务请求失败（HTTP ${response.status}）`);
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new LlmError('REMOTE_RESPONSE_INVALID', '远程服务返回内容过大');
      }
      const body = await readLimitedResponse(response);

      let decoded: ChatCompletionResponse;
      try {
        decoded = JSON.parse(body) as ChatCompletionResponse;
      } catch {
        throw new LlmError('REMOTE_RESPONSE_INVALID', '服务返回了无法识别的 JSON');
      }
      const content = decoded.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new LlmError('REMOTE_RESPONSE_INVALID', '服务返回了空内容或不兼容的 Chat API 响应');
      }
      return content.trim();
    } catch (error: unknown) {
      if (error instanceof LlmError) throw error;
      if (controller.signal.aborted) {
        if (signal?.aborted) throw new LlmError('CANCELLED', '已取消生成周报');
        throw new LlmError('REMOTE_TIMEOUT', '远程服务响应超时');
      }
      throw new LlmError('REMOTE_REQUEST_FAILED', '无法连接远程服务，请检查网络和 Base URL');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

/** Content-Length 可能缺失或不可信，因此读取流时再次执行硬字节上限。 */
const readLimitedResponse = async (response: Response): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new LlmError('REMOTE_RESPONSE_INVALID', '远程服务返回内容过大');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
};
