import type { LlmConnectionSettings, LlmProviderId } from './domain';

export interface ProviderPreset {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyOptional?: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  {
    id: 'qwen',
    label: '阿里云百炼 / 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.7-plus',
  },
  {
    id: 'kimi',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.2',
  },
  {
    id: 'local',
    label: '本地 OpenAI 兼容服务',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5',
    apiKeyOptional: true,
  },
  { id: 'custom', label: '自定义服务', baseUrl: '', model: '' },
] as const;

export const getProviderPreset = (id: LlmProviderId): ProviderPreset | undefined =>
  PROVIDER_PRESETS.find((preset) => preset.id === id);

export const applyProviderPreset = (
  current: LlmConnectionSettings,
  provider: LlmProviderId,
): LlmConnectionSettings => {
  const preset = getProviderPreset(provider);
  if (!preset || provider === 'custom') return { ...current, provider };
  return { ...current, provider, baseUrl: preset.baseUrl, model: preset.model };
};
