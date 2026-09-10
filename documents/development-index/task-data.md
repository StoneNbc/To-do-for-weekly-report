# 任务与文本数据模块索引

## 代码入口

- `src/main/parsers/{todayParser,weekParser,taskDetails,lineEndings,projectField,projectParser}.ts`
- `src/main/repositories/{textFileStore,todayRepository,weekRepository,projectRepository,projectFormatUpgrade}.ts`
- `src/main/services/{taskService,weeklyService,archiveService,projectService,projectRenameService,businessCoordinator}.ts`

## 关键符号

- Parser：`parseToday`、`serializeToday`、`parseWeek`、`serializeWeek`、任务块详情辅助函数。
- Repository：`TextFileStore`、`TodayRepository`、`WeekRepository`、`TaskLineNotFoundError`、`ProjectRepository`、`upgradeProjectFormat`。
- Service：`TaskService`、`WeeklyService`、`ArchiveService`、`ArchivePartialFailureError`、`HistoryTransferPartialFailureError`、`ProjectService`、`ProjectRenameService`、`BusinessCoordinator`。

## 调用关系

`FloatingNotePage/WeeklyPage` → `ElectronAPI.today/history/week` → `registerBusinessHandlers` → `TaskService/WeeklyService` → `ArchiveService`（变更前跨日补偿）→ Repository → Parser + `TextFileStore` → TXT。`ArchiveService` 固定先写周文件，再滚动 `today.txt`。

项目操作经 `registerProjectHandlers` → `ProjectService` → 项目目录及任务引用扫描；改名由 `ProjectRenameService` 管理预览／备份／恢复。Main 组合根使用 `BusinessCoordinator` 串行化业务写入并在启动时恢复。

## 对应测试

- `tests/unit/parser/{todayParser,weekParser}.test.ts`
- `tests/integration/repositories/repositories.test.ts`
- `tests/integration/services/{taskWeeklyService,archiveService,projectService,businessCoordinator}.test.ts`
- `tests/integration/ipc/registerHandlers.test.ts`
- `tests/renderer/{floating-note-page,task-components,weekly-page}.test.tsx`

## 文档章节

- [项目管理功能设计](../项目管理功能设计-v1.0.md) §3、§5–8、§10–11；[项目管理开发文档](../项目管理开发文档-v1.0.md) §2–5、§8–10（项目目录、字段语法、改名与恢复方案）。
- `开发交接文档-v1.0.md` §6、§7、§8.1–8.5、§14.1–14.3。
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md` §8–14。
- `待办详情编辑与展开功能设计开发文档-v1.0.md` §6–13、§15–17、§20。

## 修改联动

- 任务字段、定位或返回快照变化：同步 [共享契约与运行时](contracts-runtime.md) 与 [Renderer 界面与状态](renderer-ui.md)。
- 周报投影或待办候选变化：同步 [周报与远程 LLM](report-llm.md)；详情默认不得进入周报。
- 文件格式变化：Parser、两个 Repository、迁移/兼容测试及对应设计章节必须同改。
