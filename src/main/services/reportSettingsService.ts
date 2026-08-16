import path from 'node:path';
import type {
  LlmConnectionSettings,
  ReportContext,
  ReportSettingsPatch,
  ReportSettingsSnapshot,
  WeeklyTask,
} from '../../shared/domain';
import { renderTemplateReport, validateReportTemplate } from '../agents/reportTemplate';
import { normalizeLlmBaseUrl, getLlmCredentialOrigin } from '../agents/llmEndpointPolicy';
import { OpenAICompatibleAgent } from '../agents/openAICompatibleAgent';
import type { ConfigService } from './configService';
import { llmConnectionSettingsSchema } from './configService';
import { CredentialService, maskApiKey } from './credentialService';
import { ReportTemplateService } from './reportTemplateService';

export interface ReportSettingsServiceOptions {
  config: ConfigService;
  recordTemplates: ReportTemplateService;
  remoteTemplates: ReportTemplateService;
  prompts: ReportTemplateService;
  credentials: CredentialService;
}

const SAMPLE_CONTEXT: ReportContext = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
};
const SAMPLE_TASKS: WeeklyTask[] = [
  { date: '2026-08-10', content: '完成项目阶段性方案' },
  { date: '2026-08-12', content: '同步本周进展与风险', time: '18:30' },
];

export class ReportSettingsService {
  readonly #config: ConfigService;
  readonly #recordTemplates: ReportTemplateService;
  readonly #remoteTemplates: ReportTemplateService;
  readonly #prompts: ReportTemplateService;
  readonly #credentials: CredentialService;

  constructor({
    config,
    recordTemplates,
    remoteTemplates,
    prompts,
    credentials,
  }: ReportSettingsServiceOptions) {
    this.#config = config;
    this.#recordTemplates = recordTemplates;
    this.#remoteTemplates = remoteTemplates;
    this.#prompts = prompts;
    this.#credentials = credentials;
  }

  async get(): Promise<ReportSettingsSnapshot> {
    const config = this.#config.get();
    const recordTemplate = await this.#recordTemplates.read(config.template_path);
    const remoteTemplate = await this.#remoteTemplates.read(config.remote_template_path);
    const prompt = await this.#prompts.read(config.report_prompt_path);
    const credential = await this.#getCredential(config.llm);
    return {
      mode: config.agent === 'openai-compatible' ? 'remote-llm' : 'local-template',
      recordTemplate,
      remoteTemplate,
      prompt,
      llm: { ...config.llm },
      hasApiKey: credential !== null,
      apiKeyMask: credential ? maskApiKey(credential.apiKey) : null,
      remoteConsentConfirmed: config.remote_consent_confirmed,
    };
  }

  preview(template: string): string {
    return renderTemplateReport(SAMPLE_TASKS, SAMPLE_CONTEXT, template);
  }

  getDefaultText(kind: 'record-template' | 'remote-template' | 'prompt'): string {
    if (kind === 'remote-template') return this.#remoteTemplates.getDefault();
    if (kind === 'prompt') return this.#prompts.getDefault();
    return this.#recordTemplates.getDefault();
  }

  async save(patch: ReportSettingsPatch): Promise<ReportSettingsSnapshot> {
    validateReportTemplate(patch.recordTemplate);
    validateReportTemplate(patch.remoteTemplate);
    const llm = this.#normalizeSettings(patch.llm);
    const origin = getLlmCredentialOrigin(llm.baseUrl, llm.allowInsecureHttp);

    if (patch.apiKey === '') await this.#credentials.clear();
    else if (patch.apiKey !== undefined) await this.#credentials.save(origin, patch.apiKey);

    await Promise.all([
      this.#recordTemplates.save(patch.recordTemplate),
      this.#remoteTemplates.save(patch.remoteTemplate),
      this.#prompts.save(patch.prompt),
    ]);
    await this.#config.commit({
      agent: patch.mode === 'remote-llm' ? 'openai-compatible' : 'template',
      template_path: path.basename(this.#recordTemplates.getControlledPath()),
      remote_template_path: path.basename(this.#remoteTemplates.getControlledPath()),
      report_prompt_path: path.basename(this.#prompts.getControlledPath()),
      llm,
    });
    return this.get();
  }

  async confirmRemoteConsent(): Promise<ReportSettingsSnapshot> {
    await this.#config.commit({ remote_consent_confirmed: true });
    return this.get();
  }

  async testConnection(patch: ReportSettingsPatch): Promise<string> {
    const settings = this.#normalizeSettings(patch.llm);
    const origin = getLlmCredentialOrigin(settings.baseUrl, settings.allowInsecureHttp);
    const apiKey =
      patch.apiKey === ''
        ? null
        : patch.apiKey?.trim() || (await this.#credentials.get(origin))?.apiKey || null;
    const agent = new OpenAICompatibleAgent({
      settings,
      recordTemplate: this.#recordTemplates.getDefault(),
      remoteTemplate: this.#remoteTemplates.getDefault(),
      prompt: this.#prompts.getDefault(),
      apiKey,
    });
    await agent.generateReport(
      [{ date: SAMPLE_CONTEXT.weekStart, content: '连接测试：仅需回复可用' }],
      SAMPLE_CONTEXT,
    );
    return '连接成功';
  }

  #normalizeSettings(settings: LlmConnectionSettings): LlmConnectionSettings {
    const parsed = llmConnectionSettingsSchema.parse(settings);
    return {
      ...parsed,
      baseUrl: normalizeLlmBaseUrl(parsed.baseUrl, parsed.allowInsecureHttp),
    };
  }

  async #getCredential(settings: LlmConnectionSettings) {
    try {
      return await this.#credentials.get(
        getLlmCredentialOrigin(settings.baseUrl, settings.allowInsecureHttp),
      );
    } catch {
      return null;
    }
  }
}
