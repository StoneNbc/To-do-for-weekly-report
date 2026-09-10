# Renderer 界面与状态模块索引

## 代码入口

- `src/renderer/AppRouter.tsx`、`src/renderer/pages/{FloatingNotePage,WeeklyPage,SettingsPage,CreateProjectPage}.tsx`
- `src/renderer/components/`、`src/renderer/state/`、`src/renderer/hooks/`
- `src/renderer/gateway/electronGateway.ts`、`src/renderer/styles/globals.css`

## 关键符号

- 页面：`AppRouter`、`FloatingNotePage`、`WeeklyPage`、`SettingsPage`、`CreateProjectPage`。
- 状态：`noteReducer`、`weeklyReducer`、`createInitialNoteState`、`createInitialWeeklyState`。
- 桥接：`getElectronAPI`、`useElectronAPI`、`useElectronEvents`、`useRefreshQueue`、`useProjects`、`createMockProjectAPI`。
- 任务组件：`TaskList`、`TaskItem`、`CompletedSection`、`TitleBar`、`AddTaskInput`、`ProjectSelect`、`ProjectManager`、`ProjectTaskGroups`。

## 调用关系

`AppRouter` 按窗口路由装配页面 → 页面从 Provider/gateway 取得 `ElectronAPI` → reducer 管理页面快照 → hooks 订阅 Main 广播并合并刷新 → 组件通过 locator 发起操作；Renderer 不直接访问文件、Electron 或 Main 模块。

创建项目独立窗口：`CreateProjectPage` → `projects.create` → Main `projectCreated` → 便利贴刷新项目、选中并聚焦；`ProjectTaskGroups` 在待办列表补齐空项目并提供快捷添加。

## 对应测试

- `tests/renderer/{app-router-contract,floating-note-page,create-project-page,weekly-page,settings-page}.test.tsx`
- `tests/renderer/{task-components,export-result-toast}.test.tsx`
- `tests/renderer/{reducers,mock-electron-api}.test.ts`、`tests/unit/contracts.test.ts`

## 文档章节

- [项目管理功能设计](../项目管理功能设计-v1.0.md) §4–5、§8–11；[项目管理开发文档](../项目管理开发文档-v1.0.md) §6–7、§10（项目选择、管理、归类与生成流程）。
- `开发交接文档-v1.0.md` §5.3、§8.10、§10.1、§10.5。
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md` §19。
- `待办详情编辑与展开功能设计开发文档-v1.0.md` §5、§12、§15.5。

## 修改联动

- API 参数、结果或事件变化：同步 [共享契约与运行时](contracts-runtime.md)、Preload mock 与契约测试。
- 任务语义变化：同步 [任务与文本数据](task-data.md)；设置控件变化同步 [设置与外观](settings-appearance.md)。
- 窗口尺寸、收起或贴边交互变化：同步 [窗口与桌面集成](window-desktop.md)，保留紧凑态控件占位与菜单恢复。
