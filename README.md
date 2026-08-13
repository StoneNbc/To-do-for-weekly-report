<div align="center">

# 悬浮便利贴 & 一键周报

**贴在桌面上的本地任务清单：随手记录，自动归档，一键生成 TXT 周报。**

![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=20232A)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)
![Local First](https://img.shields.io/badge/Local--first-零网络依赖-3A7D44)

[功能亮点](#功能亮点) · [快速开始](#快速开始) · [数据设计](#数据设计) · [开发文档](#开发文档)

</div>

---

## 项目介绍

悬浮便利贴是一款完全本地运行的 Electron 桌面工具，适合需要随手记录每日任务、又不想使用复杂项目管理软件的人。

它会把今日已完成事项按完成日期归档到周记，并在需要时通过系统保存对话框导出一份可以直接编辑和发送的纯文本周报。数据始终保存在本机的 TXT 文件中，不依赖账号、云服务或网络连接。

```text
记录今日任务  →  勾选完成  →  每日零点自动归档  →  查看周记  →  导出 TXT 周报
```

## 功能亮点

| 能力          | 说明                                                      |
| ------------- | --------------------------------------------------------- |
| 🗒️ 桌面悬浮   | 无边框便利贴窗口、始终置顶、拖动和尺寸记忆                |
| ✅ 今日任务   | 添加、完成、撤销、内联编辑、删除，完成时自动记录时间      |
| 📅 自动周记   | 每日零点归档，启动、系统唤醒和操作前均有补偿检查          |
| 🕰️ 历史补录   | 查看历史日期，并为过去某天补录、编辑或删除完成事项        |
| 📖 周视图     | 查看当前周或历史周，当前周实时合并当天尚未归档的数据      |
| 📄 一键导出   | 通过系统对话框选择保存位置，生成结构清晰的 TXT 周报       |
| 🔄 外部同步   | 手动编辑 TXT 后自动刷新界面，无法识别的行会保留并记录日志 |
| 🧩 Agent 预留 | 内置 TemplateAgent，后续可扩展本地 Ollama 等报告生成方式  |
| 🔒 本地优先   | 无账号、无遥测、无云同步；生产环境主动阻止网络请求        |

其他桌面能力包括：

- 系统托盘与关闭后隐藏。
- 单实例运行。
- 悬浮窗置顶切换。
- 点击菜单外部或按 `Esc` 自动关闭菜单。
- UTF-8、LF/CRLF 和文件末尾换行保真。
- 支持完全相同的重复任务，按所在行精确操作。

## 当前状态

核心功能已完成，项目目前适合源码运行、继续开发和本地构建。

| 项目                           | 状态                                  |
| ------------------------------ | ------------------------------------- |
| 今日任务、历史补录、周记、归档 | ✅ 已实现                             |
| TXT 周报导出                   | ✅ 已实现                             |
| macOS Apple Silicon 本地构建   | ✅ 已完成冒烟验证                     |
| Windows 安装包                 | 🧪 已配置 NSIS，尚待 Windows 实机验收 |
| macOS 签名与公证               | ⏳ 尚未配置                           |
| 正式应用图标                   | ⏳ 尚未配置                           |
| AI 润色周报                    | 🧭 仅预留接口，当前不包含 AI 调用     |

> 当前 macOS 构建未进行 Apple Developer ID 签名和公证，首次打开时可能出现系统安全提示。正式发布安装包前需要完成签名、公证和图标配置。

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- pnpm 11.19.0
- macOS 11+ 或 Windows 10+

如果尚未安装 pnpm：

```bash
npm install -g pnpm@11.19.0
```

也可以通过 Corepack 启用：

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

### 获取并运行

```bash
git clone https://github.com/StoneNbc/-.git sticky-weekly
cd sticky-weekly
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动 Vite、Main/Preload 增量构建和 Electron。停止运行时在终端按 `Control + C`。

### 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

当前测试基线为 **26 个测试文件、114 个测试通过**，覆盖文本解析、Repository、归档、IPC、文件监听、周报导出和 Renderer 交互。

## 使用方式

### 今日便利贴

1. 在底部输入任务并按回车或点击“添加”。
2. 点击复选框完成任务，应用会记录本机完成时间。
3. 再次点击可撤销完成；双击任务文本可以编辑。
4. 已完成事项保留至下一个零点，然后归档到对应周文件。

未完成任务会一直顺延，直到被完成或删除；顺延不会记录最初创建日期。

### 历史补录

使用顶部日期箭头进入过去日期，即可补录实际在那一天完成、但当时忘记记录的事项。历史补录按选择的完成日期写入对应周文件。

### 导出周报

从悬浮窗菜单或周记窗口点击导出，系统会弹出保存位置选择框。确认后生成 TXT 文件；取消选择不会创建任何文件，应用也不会额外保留内部副本。

## 数据设计

所有业务数据均为人可以直接阅读和修改的纯文本：

```text
data/
├── today.txt
├── weeks/
│   └── week-2026-W33.txt
├── config.json
└── logs/
    └── app.log
```

开发环境数据位于项目根目录的 `data/`。打包应用数据位于 Electron 的 `userData/data/`；macOS 默认通常为：

```text
~/Library/Application Support/sticky-weekly/data
```

`today.txt` 示例：

```markdown
# 2026-08-13

- [ ] 准备周会材料
- [x] 回复客户邮件 @14:20
```

周文件示例：

```markdown
# 第33周 (2026-08-10 ~ 2026-08-16)

## 周四 08-13

- 回复客户邮件 @14:20
```

应用允许直接用文本编辑器修改这些文件：

- 合法任务会自动显示到界面。
- 完全相同的任务不会被去重。
- 无法识别的行原样保留，但不会作为任务展示。
- 文件发生外部变化时，应用会刷新数据并保护用户免受旧版本覆盖。

## 技术架构

```mermaid
flowchart LR
    UI["React Renderer"] -->|"类型化 ElectronAPI"| Preload["Preload / contextBridge"]
    Preload -->|"IPC + Zod 校验"| Main["Electron Main"]
    Main --> Services["Task / Weekly / Archive / Report Services"]
    Services --> Repositories["Repositories + 保真解析器"]
    Repositories --> Files["本地 TXT 文件"]
    Watcher["File Watcher"] --> Main
    Scheduler["00:00 / 启动 / 唤醒补偿"] --> Services
```

主要技术栈：

- Electron 37
- React 18 + TypeScript 5
- Tailwind CSS 3
- Zod IPC 校验
- chokidar 文件监听
- node-cron 定时任务
- fs-extra 原子写入
- Vitest + Testing Library
- Vite + tsup + electron-builder

Renderer 不直接读取文件系统，所有业务读写通过 Preload 暴露的冻结 API 进入 Main Process。Repository 使用文件 revision 和行号定位任务，以正确支持重复内容和外部编辑冲突。

## 项目结构

```text
src/
├── main/
│   ├── agents/          # ReportAgent 与 TemplateAgent
│   ├── ipc/             # IPC 通道、Schema 与处理器
│   ├── parsers/         # today/week 文本保真解析
│   ├── repositories/    # 原子读写与 revision 冲突保护
│   ├── services/        # 任务、归档、周记、监听、导出
│   └── platform/        # 路径、显示器、网络与 Shell 能力
├── preload/             # contextBridge 安全 API
├── renderer/            # React 页面、组件、状态与 Gateway
└── shared/              # 领域类型、日期与校验

tests/
├── unit/
├── integration/
└── renderer/

documents/               # PRD、开发设计、交接与协作说明
```

## 开发命令

| 命令              | 用途                                          |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | 启动 Renderer、Main/Preload watch 和 Electron |
| `pnpm typecheck`  | TypeScript 全量类型检查                       |
| `pnpm lint`       | ESLint 全量检查                               |
| `pnpm test`       | 运行全部 Vitest 测试                          |
| `pnpm test:watch` | 监听模式运行测试                              |
| `pnpm build`      | 构建 Renderer、Main 和 Preload                |
| `pnpm package`    | 构建目录形式的本地应用包                      |
| `pnpm dist`       | 构建平台分发包                                |
| `pnpm format`     | 使用 Prettier 格式化项目                      |

## 构建应用

本机目录包：

```bash
pnpm package
```

平台分发包：

```bash
pnpm dist
```

输出目录为 `release/`。构建配置当前包含：

- macOS：DMG 与 ZIP。
- Windows：NSIS 安装包。

构建 Windows 安装包建议在 Windows 环境或对应 CI Runner 中执行并完成实机验收。

## 开发文档

- [开发交接文档](./documents/开发交接文档-v1.0.md)：环境、架构、模块职责、调试和已知风险。
- [产品需求文档](./documents/产品需求文档-悬浮便利贴与一键周报-v3.1.md)：完整产品规则和验收标准。
- [开发设计文档](./documents/开发设计文档-悬浮便利贴与一键周报-v1.0.md)：技术方案、数据流与模块设计。
- [多 Agent 并行开发策略](./documents/多Agent并行开发策略-v1.0.md)：并行开发边界和交付要求。
- [Agent 协作约束](./documents/AGENTS.md)：修改代码前必须遵守的核心约束。

## 路线图

- [ ] 正式应用图标和托盘图标。
- [ ] macOS Developer ID 签名与公证。
- [ ] Windows 10/11 实机打包与验收。
- [ ] Electron GUI 自动化测试。
- [ ] 设置页与自定义周报模板。
- [ ] 可选的本地 OllamaAgent 周报润色。

## 参与开发

欢迎通过 Issue 提交问题或建议，也欢迎提交 Pull Request。开始修改前请先阅读[开发交接文档](./documents/开发交接文档-v1.0.md)和 [Agent 协作约束](./documents/AGENTS.md)。

提交变更前至少运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

请勿提交本机的 `data/`、`release/`、日志文件或个人周报。

## 隐私说明

- 应用不要求登录，不包含遥测和分析代码。
- 任务、周记和报告均保存在用户本机。
- 当前 TemplateAgent 只进行本地模板拼接，不调用任何 AI 服务。
- 未来增加网络 Agent 时，必须由用户主动启用并明确提示数据边界。

## License

当前仓库尚未添加开源许可证。除非项目所有者另行授权，仓库内容默认保留全部权利。

---

<div align="center">

如果这个项目对你有帮助，欢迎点一个 Star ⭐

</div>
