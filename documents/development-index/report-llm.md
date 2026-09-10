# 周报与远程 LLM 模块索引

## 代码入口

- `src/main/services/{reportService,reportSettingsService,reportTemplateService,credentialService}.ts`
- `src/main/agents/`、`src/main/ipc/{reportHandlers,reportSettingsHandlers}.ts`
- `src/main/platform/networkPolicy.ts`、`src/renderer/pages/{WeeklyPage,SettingsPage}.tsx`

## 关键符号

- `ReportService`、`ReportSettingsService`、`ReportTemplateService`、`CredentialService`。
- `TemplateAgent`、`OpenAICompatibleAgent`、`LlmHttpClient`、`AgentFactory`、`buildReportPrompt`、`renderProjectRecords`。
- `registerReportHandlers`、`registerReportSettingsHandlers`、`installLocalOnlyNetworkPolicy`。

## 调用关系

`WeeklyPage`/菜单 → report IPC → `ReportService.preview/generateDraft` → `WeeklyService` + 当前待办源 → Agent provider → 本地模板或 `OpenAICompatibleAgent` → 草稿预览 → `saveDraft` 仅写用户选择路径。远程预览缓存任务素材与配置指纹；生成时复核、使用同份素材，当前未完成候选默认关闭。设置流经 `ReportSettingsService`，API Key 由 `CredentialService` 按 origin 管理。

## 对应测试

- `tests/unit/agents/{templateAgent,promptBuilder,reportTemplateCustomization,llmEndpointPolicy,llmHttpClient}.test.ts`
- `tests/integration/report/{reportService,reportHandlers,networkPolicy}.test.ts`
- `tests/integration/services/{reportSettingsService,credentialService}.test.ts`
- `tests/renderer/{weekly-page,settings-page,export-result-toast}.test.tsx`

## 文档章节

- [项目管理功能设计](../项目管理功能设计-v1.0.md) §9；[项目管理开发文档](../项目管理开发文档-v1.0.md) §7、§10（项目筛选、素材投影、候选选择和隐私边界）。
- `自定义周报模板与远程LLM开发设计-v1.0.md` §4–19、§22–23。
- `自定义周报模板与远程LLM需求文档-v1.0.md` §7–13、§15。
- `开发交接文档-v1.0.md` §8.8、§13。

## 修改联动

- 周数据、待办候选或 ReportContext 变化：同步 [任务与文本数据](task-data.md) 与共享契约。
- Agent/配置/草稿契约变化：同步 [共享契约与运行时](contracts-runtime.md)、Preload、Renderer 和 mock。
- 网络、凭据或日志变化：同步安全测试与隐私文档；不得扩大 Renderer 网络权限或记录密钥/发送正文。
