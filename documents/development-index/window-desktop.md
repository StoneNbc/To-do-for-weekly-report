# 窗口与桌面集成模块索引

## 代码入口

- `src/main/windowManager.ts`、`src/main/platform/{noteAutoHide,displayBounds}.ts`
- `src/main/{trayManager,menuFactory}.ts`、`src/main/index.ts` 的 `registerPlatformHandlers`
- `src/renderer/pages/FloatingNotePage.tsx` 的停靠状态与交互上报

## 关键符号

- `WindowManager`：`createFloatingNote`、`openProjectCreate`、`closeProjectCreate`、`notifyProjectCreated`、`showFloatingNote`、`setNoteInteractionState`、`setFloatingNoteCollapsed`、`applySettings`、`saveCurrentBounds`。
- 边界算法：`detectNoteDockCandidate`、`restoreNoteDockCandidate`、`snapNoteToEdge`、`getHiddenNoteBounds`、`isExternalNoteEdge`。
- 桌面入口：`TrayManager`、`MenuFactory`、`DesktopCommands`、`NoteDockSnapshot`。

## 调用关系

窗口 move/resize 与指针轮询 → `WindowManager` 停靠状态机 → `noteAutoHide` 纯边界计算 → BrowserWindow bounds/level/Spaces 行为 → `noteDockStateChanged` 广播 → `FloatingNotePage` 提示条。托盘/菜单通过 `DesktopCommands` 调用同一 `WindowManager`。

显示器增删或布局变化 → 300ms 尾部防抖（最长 1500ms）→ `WindowManager` 使用事件批次前的稳定停靠快照 → 原屏有效则保持、原屏移除则迁到主屏同侧 → 边缘成为接缝时恢复可见并取消停靠。

新建项目通过 `window.openProjectCreate` 打开父窗口为便利贴的单实例创建窗，复用 `#loadView` 安全配置。创建窗存续时阻止自动隐藏；创建完成事件只接受该窗 sender id 并发送给便利贴。

## 对应测试

- `tests/integration/platform/{noteAutoHide,windowManagerAutoHide,displayBounds}.test.ts`
- `tests/renderer/floating-note-page.test.tsx`
- `tests/integration/platform/appLifecycle.test.ts`

## 文档章节

- `项目管理功能设计-v1.0.md` §4；`项目管理开发文档-v1.0.md` §6。
- `贴边自动隐藏功能设计开发文档-v1.0.md` §6–11、§15–18、§21–23。
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md` §18。
- `开发交接文档-v1.0.md` §8.10、§10.5、§14.4。

## 修改联动

- 停靠类型、配置或 IPC 变化：同步 [共享契约与运行时](contracts-runtime.md)、[设置与外观](settings-appearance.md) 和 Renderer mock。
- BrowserWindow 创建参数、退出/隐藏语义变化：同步生命周期、托盘测试与平台手工验收。
- 边界常量或算法变化：纯函数测试与多显示器、顶部、全屏 Space 手工用例同改。
