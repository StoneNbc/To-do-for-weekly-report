import type {
  LlmConnectionSettings,
  ReportAgent,
  ReportContext,
  ReportGenerationOptions,
  WeeklyTask,
} from '../../shared/domain';
import { LlmError } from './llmErrors';
import { isLoopbackLlmBaseUrl } from './llmEndpointPolicy';
import { LlmHttpClient } from './llmHttpClient';
import { buildReportPrompt } from './promptBuilder';

export interface OpenAICompatibleAgentOptions {
  settings: LlmConnectionSettings;
  recordTemplate: string;
  remoteTemplate: string;
  prompt: string;
  apiKey: string | null;
  client?: LlmHttpClient;
}

export class OpenAICompatibleAgent implements ReportAgent {
  readonly name = 'openai-compatible';
  readonly #settings: LlmConnectionSettings;
  readonly #recordTemplate: string;
  readonly #remoteTemplate: string;
  readonly #prompt: string;
  readonly #apiKey: string | null;
  readonly #client: LlmHttpClient;

  constructor({
    settings,
    recordTemplate,
    remoteTemplate,
    prompt,
    apiKey,
    client = new LlmHttpClient(),
  }: OpenAICompatibleAgentOptions) {
    this.#settings = settings;
    this.#recordTemplate = recordTemplate;
    this.#remoteTemplate = remoteTemplate;
    this.#prompt = prompt;
    this.#apiKey = apiKey;
    this.#client = client;
  }

  async isAvailable(): Promise<boolean> {
    const keyOptional = isLoopbackLlmBaseUrl(this.#settings.baseUrl);
    return Boolean(this.#settings.baseUrl && this.#settings.model && (this.#apiKey || keyOptional));
  }

  async generateReport(
    tasks: WeeklyTask[],
    context: ReportContext,
    options?: ReportGenerationOptions,
  ): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new LlmError('CREDENTIAL_UNAVAILABLE', '请先配置远程模型地址、模型 ID 和 API Key');
    }
    const content = await this.#client.complete(
      this.#settings,
      this.#apiKey,
      buildReportPrompt(tasks, context, {
        recordTemplate: this.#recordTemplate,
        remoteTemplate: this.#remoteTemplate,
        prompt: this.#prompt,
        pendingTasks: options?.pendingTasks,
      }),
      options?.signal,
    );
    if (/\{\{(?:iso_year|iso_week|week_start|week_end|tasks)\}\}/.test(content)) {
      throw new LlmError('REMOTE_RESPONSE_INVALID', '远程服务返回的周报仍包含未替换模板变量');
    }
    return content;
  }
}
