# Agent 协作约束

所有 Agent 开始工作前必须完整阅读：

- `产品需求文档-悬浮便利贴与一键周报-v3.1.md`
- `开发设计文档-悬浮便利贴与一键周报-v1.0.md`
- `多Agent并行开发策略-v1.0.md`

核心约束：

- TXT 是任务数据的唯一事实来源。
- 允许内容和完成时间完全相同的重复任务，禁止按正文去重。
- 未知行必须原样保留，不得静默删除。
- 任务的会话定位使用 `revision + line`，不写入持久化任务 ID。
- 归档先写周文件，成功后再写 `today.txt`；v1.0 不实现严格幂等。
- 周报只写用户选择的位置，不创建内部副本，不实现导出提醒。
- Renderer 不得直接访问文件系统或 import Main 模块。
- Main/Preload/Renderer 共享契约由集成协调者持有；需要修改时先提交契约变更请求。
- 不配置远程 Git，不上传代码。

Wave 1 文件所有权：

- A1：`src/shared/dateUtils.ts`、`src/shared/validation.ts`、`src/main/parsers/**`、`src/main/repositories/**` 及对应测试。
- A2：`src/renderer/**`、`tests/renderer/**`。
- A3：Electron 生命周期、窗口、托盘、配置、路径、日志、Preload 壳及对应平台测试。
- A0：构建配置、依赖、共享领域类型、IPC channels/schema、ElectronAPI 类型。

Agent 不得修改未授权文件，不得执行全仓库机械格式化，不得修改其他 Agent 的分支。
