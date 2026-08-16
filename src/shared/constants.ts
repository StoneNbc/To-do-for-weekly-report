/** 窗口、产品名和默认配置的单一事实来源。 */
export const APP_NAME = '悬浮便利贴';
export const DEFAULT_NOTE_WIDTH = 320;
export const DEFAULT_NOTE_HEIGHT = 400;
export const MIN_NOTE_WIDTH = 280;
export const MIN_NOTE_HEIGHT = 280;
export const DEFAULT_NOTE_COLOR = '#FFF8E7';
export const DEFAULT_NOTE_OPACITY = 1;
export const MIN_NOTE_OPACITY = 0.6;
export const NOTE_OPACITY_STEP = 0.05;

export const DEFAULT_REPORT_TEMPLATE = `=======================
周报 | {{iso_year}}年第{{iso_week}}周
{{week_start}} - {{week_end}}
=======================

【本周完成工作】
{{tasks}}

【工作总结】
（此处留白，供你手动填写）

【下周计划】
（此处留白，供你手动填写）
`;

export const DEFAULT_REMOTE_REPORT_TEMPLATE = `# 周报模板

=======================
周报 | {{iso_year}}年第{{iso_week}}周
{{week_start}} - {{week_end}}
=======================

【工作记录】
{{tasks}}

【收获与成长】


【不足与反思】


【下周计划】

`;

export const DEFAULT_REPORT_PROMPT = `请根据本地 TXT 工作记录、当前未完成待办和完整周报模板，生成一份可直接提交的中文周报。

要求：
1. 工作记录必须忠于原始事实，不得虚构项目、数据或成果。
2. 收获与成长应从已完成事项中归纳具体能力、方法或认知提升。
3. 不足与反思应客观、建设性，不编造事故或负面事实。
4. 下周计划优先采用当前未完成待办；若没有候选事项，明确写“暂无明确计划”，不要虚构。
5. 保持完整周报模板的标题和章节结构，只输出最终周报，不输出分析过程或代码围栏。`;

export const DEFAULT_LLM_SETTINGS = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.3,
  maxTokens: 2_000,
  timeoutMs: 60_000,
  allowInsecureHttp: false,
} as const;

export const DEFAULT_CONFIG = {
  schema_version: 2,
  cleanup_time: '00:00',
  agent: 'template',
  template_path: null,
  remote_template_path: null,
  report_prompt_path: null,
  llm: DEFAULT_LLM_SETTINGS,
  remote_consent_confirmed: false,
  always_on_top: true,
  window_bounds: null,
  completed_expanded: false,
  note_color: DEFAULT_NOTE_COLOR,
  note_opacity: DEFAULT_NOTE_OPACITY,
} as const;
