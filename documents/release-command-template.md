# 合并、推送与 GitHub 自动构建命令模板

本模板用于用户说“按发布模板给我命令”时。Codex 只做少量实时检查、填入变量并输出分段命令；所有 Git 提交、推送、打标签和发布操作仍由用户执行。

## 每次只检查这些信息

```bash
git status --short --branch
git branch --show-current
git log -3 --oneline --decorate
git remote -v
node -p "require('./package.json').version"
git tag --list --sort=-version:refname | head -10
rg -n "workflow_dispatch|push:|tags:|publish-release" .github/workflows/build-installers.yml
```

据此填入：

```text
FEATURE_BRANCH=<当前功能分支>
VERSION=<尚未使用的目标版本，不含 v>
RELEASE_DATE=<YYYY-MM-DD>
COMMIT_MESSAGE=<本次提交说明>
RELEASE_PATHS=<本次任务文件，加 package.json 和发布文档>
```

默认使用尚未占用的下一个补丁版本；用户指定版本时以用户选择为准。`package.json`、CHANGELOG 标题和 `v<VERSION>` 必须一致。

## 1. 更新远程信息并确认标签未占用

```bash
cd '/Users/nbcstone/Desktop/便利贴'
git fetch origin --prune --tags
git status --short --branch
git branch --show-current
git log -3 --oneline --decorate
git tag --list 'v<VERSION>'
git ls-remote --tags origin 'refs/tags/v<VERSION>'
```

最后两条标签查询都应为空。如果已有同名标签，停止并重新选择版本。

## 2. 更新版本并暂存

```bash
npm pkg set version=<VERSION>
perl -0pi -e 's/## 未发布/## 未发布\n\n## <VERSION> - <RELEASE_DATE>/' CHANGELOG.md
node -p "require('./package.json').version"
git diff -- package.json CHANGELOG.md

git add -- <RELEASE_PATHS>
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached
```

`git add` 必须使用明确路径。暂存差异出现无关修改、个人数据或构建产物时停止处理。已经通过且代码没有变化的检查不重复运行；纯版本和 CHANGELOG 调整后至少执行 `git diff --cached --check`。

## 3. 提交并推送功能分支

```bash
git commit -m "<COMMIT_MESSAGE>"
git status --short --branch
git log -3 --oneline --decorate
git push -u origin <FEATURE_BRANCH>
git rev-list --left-right --count origin/<FEATURE_BRANCH>...<FEATURE_BRANCH>
```

最后一条预期输出 `0 0`。

## 4. 快进合并并推送 main

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only <FEATURE_BRANCH>
git status --short --branch
node -p "require('./package.json').version"
git push origin main
git rev-list --left-right --count origin/main...main
```

拉取或合并无法快进时停止，把完整输出交给 Codex 诊断；不提供强制覆盖命令。最后一条预期输出 `0 0`。

## 5. 创建标签并触发自动构建

```bash
git tag -a v<VERSION> -m "v<VERSION>"
git show --stat --oneline v<VERSION>
git rev-parse HEAD
git rev-parse 'v<VERSION>^{}'
git push origin v<VERSION>
```

两个 `rev-parse` 输出必须相同。当前 `.github/workflows/build-installers.yml` 由 `v*` 标签推送触发；普通分支或 `main` 推送不会创建安装包 Release。

## 6. 验证 Actions 和 Release

```bash
gh run list --workflow build-installers.yml --limit 5
gh run watch <RUN_ID> --exit-status
gh release view v<VERSION>
```

最终确认 Release 包含 macOS DMG／ZIP、Windows EXE 和两份 SHA-256 校验文件。没有 `gh` 时，Codex 提供当前仓库的 Actions 与 Releases 页面链接。

## Codex 输出要求

- 把所有占位符换成实时值，不让用户手动替换。
- 保留上述六个检查点，但只解释本次状态中的异常或差异。
- 默认不给重复的原理说明；只提醒“推送标签才触发自动构建”。
- 未经用户明确要求，Codex 不执行提交、推送、标签或发布。
