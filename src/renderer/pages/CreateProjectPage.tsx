import { useState } from 'react';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useProjects } from '../hooks/useProjects';

/** Dedicated creation window; persistence stays in Main through the shared project API. */
export function CreateProjectPage() {
  const api = useElectronAPI();
  const projects = useProjects();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#22C55E');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = saving || !projects.loaded || projects.snapshot.recovery.blocked;
  return (
    <main className="project-create-page flex min-h-screen flex-col p-6 text-stone-800">
      <h1 className="text-lg font-semibold tracking-tight">新建项目</h1>
      <form
        className="mt-5 flex flex-1 flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || !name.trim()) return;
          setSaving(true);
          setError(null);
          try {
            const result = await api.projects.create({
              name,
              color,
              expectedRevision: projects.snapshot.revision,
            });
            if (result.ok) {
              await api.window.closeProjectCreate();
            } else {
              setError(result.error.message);
              await projects.refresh();
            }
          } catch {
            setError('创建项目失败，请重试');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          项目名称
          <input
            autoFocus
            aria-label="新项目名称"
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-700"
          />
        </label>
        <label className="flex items-center gap-3 text-sm">
          项目颜色
          <input
            aria-label="新项目颜色"
            type="color"
            value={color}
            disabled={saving}
            onChange={(event) => setColor(event.target.value)}
            className="h-8 w-10 rounded border"
          />
        </label>
        {(error || projects.error || projects.snapshot.recovery.blocked) && (
          <p role="alert" className="text-sm text-red-700">
            {error || projects.error || '请先在项目管理中完成数据恢复'}
          </p>
        )}
        <div className="mt-auto flex justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void api.window.closeProjectCreate()}
            className="settings-secondary-button"
          >
            取消
          </button>
          <button disabled={disabled || !name.trim()} className="settings-primary-button">
            创建
          </button>
        </div>
      </form>
    </main>
  );
}
