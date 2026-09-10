# 构建与发布模块索引

## 代码入口

- `package.json` 的 scripts、build、版本字段；`pnpm-lock.yaml`
- `.github/workflows/build-installers.yml`
- `build/`、`resources/default-config.json` 与 Main 中的打包资源解析

## 关键符号

- 脚本：`build`、`typecheck`、`lint`、`test`、`dist:mac`、`dist:win`。
- electron-builder：`build.appId`、`productName`、`files`、`extraResources`、`mac`、`win`。
- Workflow：`verify`、macOS/Windows 构建与 Release 资产发布作业（以当前 YAML job id 为准）。

## 调用关系

版本提交 → 推送 `v*` 标签 → GitHub Actions `verify` → 平台打包 → checksum/Release 资产。应用启动通过 `app.isPackaged` 与 `process.resourcesPath` 解析图标和数据目录；默认配置作为资源/代码默认值共同参与首次启动。

## 对应测试

- CI 门禁：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
- 路径/生命周期：`tests/integration/platform/{paths,appLifecycle}.test.ts`。
- 安装、图标、托盘、签名、公证、全屏与多显示器属于平台手工验收。

## 文档章节

- `试用版打包与分发-v1.0.md` §2–9。
- `开发交接文档-v1.0.md` §12–14。
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md` §6、§18、§22–25。

## 修改联动

- 版本发布：`package.json`、锁文件、CHANGELOG、README 下载/版本说明及发布文档同改。
- 新运行时资源/依赖：electron-builder `files/extraResources`、路径解析、平台构建和安装后验证同改。
- Workflow job、产物名或触发规则变化：发布文档、校验说明和 `PROJECT_STATE.md` 当前发布风险同改。
