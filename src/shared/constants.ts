/**
 * 窗口尺寸、产品名、便利贴外观与默认模板/配置的单一事实来源。
 * Main、Preload 与 Renderer 都从这里读取常量，避免各处硬编码不一致。
 */

/** 产品显示名称，用于窗口标题、托盘菜单等处。 */
export const APP_NAME = '悬浮便利贴';

// ---- 便利贴窗口尺寸（像素）----
export const DEFAULT_NOTE_WIDTH = 320; // 默认展开宽度
export const DEFAULT_NOTE_HEIGHT = 400; // 默认展开高度
export const MIN_NOTE_WIDTH = 280; // 可拖拽调整的最小宽度
export const MIN_NOTE_HEIGHT = 280; // 可拖拽调整的最小高度
export const COLLAPSED_NOTE_HEIGHT = 64; // 紧凑（收起）状态的高度

// ---- 贴边自动隐藏相关阈值（像素 / 毫秒）----
export const EDGE_SNAP_THRESHOLD = 12; // 距屏幕边缘多少像素内视为“贴边”
export const EDGE_REVEAL_SIZE = 2; // 贴边隐藏后露出的边缘宽度，供鼠标重新唤出
export const EDGE_HIDE_DELAY_MS = 500; // 鼠标移出后延迟多久才隐藏
export const WINDOW_MOVE_SETTLE_MS = 150; // 窗口移动停止后多久判定为“稳定”，用于贴边判定

// ---- 便利贴外观默认值 ----
export const DEFAULT_NOTE_COLOR = '#F2F3F5'; // Soft Frost 默认珍珠灰背景；已保存颜色不迁移
export const DEFAULT_EDGE_REVEAL_COLOR = '#92400E'; // 隐藏提示条默认颜色
export const DEFAULT_NOTE_OPACITY = 1; // 默认完全不透明
export const MIN_NOTE_OPACITY = 0.6; // 透明度下限
export const NOTE_OPACITY_STEP = 0.05; // 透明度滑块的步进
export const DEFAULT_ADDED_DATE_DISPLAY = 'hover' as const; // 添加日期默认悬停时显示

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

export const PROJECT_CONSENT_VERSION = 2;

export const DEFAULT_CONFIG = {
  selected_project: { kind: 'all' },
  remote_consent_origin: null,
  remote_consent_version: 0,
  schema_version: 2,
  cleanup_time: '00:00',
  agent: 'template',
  template_path: null,
  remote_template_path: null,
  report_prompt_path: null,
  llm: DEFAULT_LLM_SETTINGS,
  remote_consent_confirmed: false,
  always_on_top: true,
  show_on_fullscreen: true,
  edge_auto_hide: false,
  edge_reveal_color: DEFAULT_EDGE_REVEAL_COLOR,
  window_bounds: null,
  completed_expanded: false,
  added_date_display: DEFAULT_ADDED_DATE_DISPLAY,
  note_color: DEFAULT_NOTE_COLOR,
  note_opacity: DEFAULT_NOTE_OPACITY,
} as const;
