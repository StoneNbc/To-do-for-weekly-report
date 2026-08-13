# 悬浮便利贴 & 一键周报

完全本地运行的 Electron 桌面便利贴应用。

当前已完成：

- 今日任务添加、完成、撤销、编辑和删除
- TXT 保真读写、重复任务与未知行保留
- 历史日期查看、补录、编辑和删除
- 当前周与历史周周记
- 每日零点归档、启动与系统唤醒补偿
- 外部 TXT 修改监听
- 系统托盘、窗口置顶、单实例与窗口状态记忆
- TemplateAgent 与一键选择路径导出 TXT 周报
- macOS arm64 未签名目录包冒烟验证

## 开发命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Codex 的受限命令环境可能在执行 `pnpm <script>` 前触发额外依赖检查；这种情况下可直接运行锁定的本地工具，例如：

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint .
node_modules/.bin/vitest run
node_modules/.bin/vite build
node_modules/.bin/tsup
```

## 数据位置

- 开发环境：项目根目录下的 `data/`
- 生产环境：Electron `userData/data/`

项目使用纯本地 Git，不配置远程仓库，不上传代码。

## 当前构建产物

开发期 macOS arm64 目录包：

```text
release/mac-arm64/悬浮便利贴.app
```

该构建未进行 Apple Developer ID 签名或公证，正式分发前仍需准备应用图标、签名和公证。
