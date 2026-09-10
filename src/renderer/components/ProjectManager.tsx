import { useState } from 'react';
import type { ProjectSnapshot, ProjectRenamePlan } from '../../shared/projects';
import type { ApiResult } from '../../shared/results';
import { useElectronAPI } from '../hooks/useElectronAPI';

export function ProjectManager({
  snapshot,
  onSnapshot,
  onClose,
  onRenamed,
}: {
  snapshot: ProjectSnapshot;
  onSnapshot: (snapshot: ProjectSnapshot) => void;
  onClose: () => void;
  onRenamed: (oldName: string, newName: string) => void;
}) {
  const api = useElectronAPI();
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [plan, setPlan] = useState<ProjectRenamePlan | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (
    operation: () => Promise<ApiResult<ProjectSnapshot>>,
    success?: () => void,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (result.ok) {
        onSnapshot(result.data);
        success?.();
      } else {
        setError(result.error.message);
        const latest = await api.projects.get();
        if (latest.ok) onSnapshot(latest.data);
      }
    } catch {
      setError('项目操作失败，请刷新后重试');
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || snapshot.recovery.blocked;
  const registered = snapshot.projects.filter((project) => !project.unregistered);
  const move = (name: string, offset: number) => {
    const names = registered.map((project) => project.name),
      index = names.indexOf(name),
      target = index + offset;
    if (target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target]!, names[index]!];
    void run(() => api.projects.reorder({ names, expectedRevision: snapshot.revision }));
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="项目管理"
      className="project-panel no-drag absolute inset-0 z-30 flex flex-col rounded-xl p-3 text-stone-800 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">项目管理</h2>
        <button
          className="rounded px-2 py-1 text-sm hover:bg-stone-200"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {snapshot.warnings.length > 0 && (
        <p role="alert" className="mb-2 text-xs text-amber-800">
          {snapshot.warnings[0]?.reason}。可打开数据文件夹检查。
        </p>
      )}
      {snapshot.recovery.blocked && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs" role="alert">
          <p>{snapshot.recovery.message}</p>
          <p className="mt-1 break-all">{snapshot.recovery.files.join('、')}</p>
          <div className="mt-2 flex gap-3">
            <button disabled={busy} onClick={() => void run(() => api.projects.retryRecovery())}>
              重新检查恢复
            </button>
            <button onClick={() => void api.projects.openRecoveryFolder()}>打开恢复目录</button>
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        className="settings-primary-button mb-3"
        onClick={() =>
          void api.window.openProjectCreate().catch(() => setError('无法打开新建项目窗口，请重试'))
        }
      >
        新建项目
      </button>
      <input
        aria-label="搜索项目"
        className="mb-2 rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
        placeholder="搜索项目，包括已归档"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {snapshot.projects
          .filter((project) =>
            project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )
          .map((project) => (
            <div key={project.name} className="project-manager-card rounded-xl p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: project.color ?? '#78716C' }}
                />
                <strong className="min-w-0 flex-1 truncate text-sm" title={project.name}>
                  {project.name}
                </strong>
                <span className="text-[10px] text-stone-500">
                  {project.unregistered
                    ? '未登记'
                    : project.status === 'archived'
                      ? '已归档'
                      : `${project.pendingCount ?? 0} 待办`}
                </span>
              </div>
              <div className="project-manager-actions mt-3 flex flex-wrap gap-1 text-xs text-stone-600">
                {project.unregistered ? (
                  <button
                    disabled={disabled}
                    onClick={() =>
                      void run(() =>
                        api.projects.create({
                          name: project.name,
                          expectedRevision: snapshot.revision,
                        }),
                      )
                    }
                  >
                    登记项目
                  </button>
                ) : (
                  <>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        setRenaming(project.name);
                        setNewName(project.name);
                        setPlan(null);
                        setDeleting(null);
                      }}
                    >
                      重命名
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() =>
                        void run(() =>
                          api.projects.update({
                            name: project.name,
                            status: project.status === 'active' ? 'archived' : 'active',
                            expectedRevision: snapshot.revision,
                          }),
                        )
                      }
                    >
                      {project.status === 'active' ? '归档' : '恢复'}
                    </button>
                    <button
                      aria-label={`上移项目：${project.name}`}
                      disabled={disabled || registered[0]?.name === project.name}
                      onClick={() => move(project.name, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`下移项目：${project.name}`}
                      disabled={disabled || registered.at(-1)?.name === project.name}
                      onClick={() => move(project.name, 1)}
                    >
                      ↓
                    </button>
                    <label className="flex items-center gap-1">
                      颜色
                      <input
                        aria-label={`项目颜色：${project.name}`}
                        type="color"
                        className="h-4 w-5"
                        value={project.color ?? '#78716C'}
                        disabled={disabled}
                        onChange={(event) =>
                          void run(() =>
                            api.projects.update({
                              name: project.name,
                              color: event.target.value,
                              expectedRevision: snapshot.revision,
                            }),
                          )
                        }
                      />
                    </label>
                    <button
                      className="text-red-700"
                      disabled={disabled}
                      onClick={() => {
                        setDeleting(project.name);
                        setRenaming(null);
                      }}
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
              {deleting === project.name && (
                <div className="mt-2 text-xs">
                  <p>仅能删除没有待办或历史记录引用的空项目。</p>
                  <button
                    className="mr-3 mt-2 text-red-700"
                    disabled={disabled}
                    onClick={() =>
                      void run(
                        () =>
                          api.projects.deleteEmpty({
                            name: project.name,
                            expectedRevision: snapshot.revision,
                          }),
                        () => setDeleting(null),
                      )
                    }
                  >
                    确认删除空项目
                  </button>
                  <button onClick={() => setDeleting(null)} disabled={busy}>
                    取消
                  </button>
                </div>
              )}
              {renaming === project.name && (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError(null);
                    try {
                      const result = await api.projects.previewRename({
                        oldName: project.name,
                        newName,
                        expectedRevision: snapshot.revision,
                      });
                      if (result.ok) setPlan(result.data);
                      else setError(result.error.message);
                    } catch {
                      setError('无法预览改名，请重试');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <input
                    aria-label="项目新名称"
                    className="w-full rounded border px-2 py-1 text-xs"
                    value={newName}
                    disabled={disabled}
                    onChange={(event) => {
                      setNewName(event.target.value);
                      setPlan(null);
                    }}
                  />
                  {plan ? (
                    <>
                      <p className="text-xs text-stone-600">
                        将更新 {plan.taskCount} 条任务、{plan.fileCount}{' '}
                        个文件。先备份，再统一改名；正文与详情不变。
                      </p>
                      <button
                        type="button"
                        className="rounded bg-amber-800 px-2 py-1 text-xs text-white"
                        disabled={disabled}
                        onClick={() =>
                          void run(
                            () => api.projects.rename(plan.token),
                            () => {
                              onRenamed(plan.oldName, plan.newName);
                              setPlan(null);
                              setRenaming(null);
                            },
                          )
                        }
                      >
                        备份并统一改名
                      </button>
                    </>
                  ) : (
                    <button
                      className="rounded bg-stone-800 px-2 py-1 text-xs text-white"
                      disabled={disabled || !newName.trim()}
                    >
                      预览改名影响
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-3 text-xs"
                    disabled={busy}
                    onClick={() => {
                      setRenaming(null);
                      setPlan(null);
                    }}
                  >
                    取消
                  </button>
                </form>
              )}
            </div>
          ))}
        {snapshot.projects.length === 0 && (
          <p className="py-8 text-center text-xs text-stone-500">创建第一个项目，再添加待办。</p>
        )}
      </div>
      <button
        className="mt-3 text-left text-xs text-stone-500 underline"
        onClick={() => void api.app.openDataFolder()}
      >
        打开数据文件夹
      </button>
    </section>
  );
}
