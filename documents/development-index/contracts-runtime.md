# 共享契约与运行时模块索引

## 代码入口

- `src/shared/{domain,projects,results,constants,validation,dateUtils,providerPresets}.ts`
- `src/main/ipc/{channels,schemas,projectSchemas,projectHandlers,registerHandlers,reportHandlers,reportSettingsHandlers,settingsHandlers}.ts`
- `src/preload/{apiTypes,index}.ts`、`src/main/{index,appLifecycle}.ts`
- `src/main/services/{fileWatcher,scheduler}.ts`

## 关键符号

- 契约：`IPC`、`ElectronAPI`、`TaskLocator`、各 Snapshot/Patch/Result/Event 类型与 Zod schema。
- 组合根：`AppLifecycle`、`registerBusinessHandlers`、`registerPlatformHandlers` 及各专用 handler 注册函数。
- 后台：`registerProjectHandlers`、`BusinessCoordinator`、`FileWatcherService`、`ArchiveScheduler`、`DataChangedEvent`。

## 调用关系

`src/main/index.ts` 组合 Repository/Service/Window/后台服务并先注册 IPC 后加载窗口；Renderer → `ElectronAPI` → Preload `ipcRenderer.invoke/on` → Main handler/schema → Service。写入成功由 watcher 标记 app-write 并通过 `WindowManager.broadcastDataChanged` 通知页面；退出由 `AppLifecycle` 排空配置、文本和报告写入。

## 对应测试

- `tests/unit/contracts.test.ts`、`tests/unit/date/dateUtils.test.ts`
- `tests/integration/ipc/{registerHandlers,settingsHandlers,projectHandlers}.test.ts`
- `tests/integration/report/reportHandlers.test.ts`
- `tests/integration/{watcher/fileWatcher,scheduler/scheduler,platform/appLifecycle}.test.ts`
- `tests/renderer/app-router-contract.test.tsx`、`tests/renderer/mock-electron-api.test.ts`

## 文档章节

- [项目管理开发文档](../项目管理开发文档-v1.0.md) §2、§4–6、§10（领域契约、写入协调、启动恢复与项目 IPC）。
- `开发交接文档-v1.0.md` §5、§8.6–8.9、§11、§13。
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md` §6–7、§16–17、§20–23。
- 具体业务契约再读对应功能设计的“共享契约 / IPC / Preload”章节。

## 修改联动

- 通道、参数、结果或事件变化：Shared → schema/handler → `ElectronAPI` → Preload → Renderer/mock → 契约测试整链同步。
- 启动顺序、监听或退出变化：组合根、生命周期/调度测试和 `PROJECT_STATE.md` 风险状态同步。
- 不在共享层实现业务规则；规则变更回到对应业务模块索引。
