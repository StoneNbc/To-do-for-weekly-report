# 设置与外观模块索引

## 代码入口

- `src/main/services/{configService,settingsService,settingsCloseGuard}.ts`
- `src/main/ipc/settingsHandlers.ts`、`src/renderer/pages/SettingsPage.tsx`
- `src/shared/noteAppearance.ts`、`resources/default-config.json`

## 关键符号

- `ConfigService`、`parseConfig`、`SettingsService`、`SettingsRuntimeTarget`。
- `SettingsPage`、`getNoteTheme`、`normalizeNoteColor`、`isValidNoteColor`、`isValidNoteOpacity`。
- IPC：`registerSettingsHandlers`；契约：`SettingsSnapshot`、`SettingsPatch`、`AppearancePreview`、`NoteAppearance`。

## 调用关系

`SettingsPage` → `ElectronAPI.settings` → `registerSettingsHandlers` → `SettingsService` → `ConfigService.commit`；预览/提交通过 `SettingsRuntimeTarget` → `WindowManager.previewAppearance/applySettings` → 广播设置和外观事件。配置文件是 Main 的权威来源。

## 对应测试

- `tests/unit/appearance/noteAppearance.test.ts`、`tests/unit/settingsCloseGuard.test.ts`
- `tests/integration/platform/configService.test.ts`
- `tests/integration/services/settingsService.test.ts`
- `tests/integration/ipc/settingsHandlers.test.ts`
- `tests/renderer/settings-page.test.tsx`

## 文档章节

- `设置功能需求文档-v1.0.md` §6–9、§11–12。
- `设置功能开发策略-v1.0.md` §2–5、§8–9。
- `贴边自动隐藏功能设计开发文档-v1.0.md` §3.3–3.4、§12、§14.3、§17.4。

## 修改联动

- 新设置字段：默认配置、`AppConfig`、Config schema/迁移、公开 Settings 契约、IPC schema、页面、mock 和测试同改。
- 运行时窗口效果：同步 [窗口与桌面集成](window-desktop.md)；通道或类型变化同步 [共享契约与运行时](contracts-runtime.md)。
- 周报专属设置不放入本模块，转到 [周报与远程 LLM](report-llm.md)。
