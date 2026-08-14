import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { SettingsPatch, SettingsSnapshot } from '../../shared/domain';
import type { ApiResult } from '../../shared/results';
import { DEFAULT_NOTE_COLOR, DEFAULT_NOTE_OPACITY } from '../../shared/constants';
import { useElectronAPI } from '../hooks/useElectronAPI';

const PRESET_COLORS = [
  { name: '米黄', value: '#FFF8E7' },
  { name: '樱粉', value: '#FCE7F3' },
  { name: '薄荷', value: '#DCFCE7' },
  { name: '天蓝', value: '#E0F2FE' },
  { name: '淡紫', value: '#EDE9FE' },
  { name: '雾白', value: '#F5F5F4' },
] as const;

export function SettingsPage() {
  const api = useElectronAPI();
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const savedRef = useRef<SettingsSnapshot | null>(null);
  const [opacityDraft, setOpacityDraft] = useState(DEFAULT_NOTE_OPACITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: SettingsSnapshot) => {
    savedRef.current = snapshot;
    setSettings(snapshot);
    setOpacityDraft(snapshot.noteOpacity);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.settings.get();
    setLoading(false);
    if (result.ok) applySnapshot(result.data);
    else setError(result.error.message);
  }, [api, applySnapshot]);

  useEffect(() => {
    void load();
    return api.events.onSettingsChanged((snapshot) => applySnapshot(snapshot));
  }, [api, applySnapshot, load]);

  useEffect(() => {
    document.title = '设置';
  }, []);

  const commit = useCallback(
    async (patch: SettingsPatch): Promise<boolean> => {
      const previous = savedRef.current;
      if (!previous || savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      setNotice(null);
      setSettings({
        ...previous,
        ...(patch.noteColor !== undefined ? { noteColor: patch.noteColor } : {}),
        ...(patch.noteOpacity !== undefined ? { noteOpacity: patch.noteOpacity } : {}),
        ...(patch.alwaysOnTop !== undefined ? { alwaysOnTop: patch.alwaysOnTop } : {}),
        ...(patch.completedExpanded !== undefined
          ? { completedExpanded: patch.completedExpanded }
          : {}),
      });
      const result = await api.settings.update(patch);
      savingRef.current = false;
      setSaving(false);
      if (result.ok) {
        applySnapshot(result.data);
        setNotice('已保存');
        return true;
      }
      applySnapshot(previous);
      await api.settings.previewAppearance({
        noteColor: previous.noteColor,
        noteOpacity: previous.noteOpacity,
      });
      setError(result.error.message);
      return false;
    },
    [api, applySnapshot],
  );

  const previewOpacity = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setOpacityDraft(value);
    void api.settings.previewAppearance({ noteOpacity: value });
  };

  const commitOpacity = () => {
    if (settings && opacityDraft !== savedRef.current?.noteOpacity) {
      void commit({ noteOpacity: opacityDraft });
    }
  };

  const runDiagnostic = async (
    operation: () => Promise<ApiResult<void> | void>,
    success: string,
  ) => {
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      if (!result || result.ok) setNotice(success);
      else setError(result.error.message);
    } catch {
      setError('操作失败，请稍后重试');
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 text-sm text-stone-500">
        <p role="status">正在读取本地设置…</p>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 p-6 text-stone-800">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-white p-5 text-center shadow-sm">
          <p role="alert" className="text-sm text-red-800">
            {error ?? '设置暂时无法读取'}
          </p>
          <button
            className="settings-primary-button mt-4"
            onClick={() => void load()}
            type="button"
          >
            重试
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-5 text-stone-800">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="mt-1 text-sm text-stone-500">修改会立即应用，并自动保存在本机。</p>
        </header>

        {error || notice ? (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
            }`}
            role={error ? 'alert' : 'status'}
          >
            {error ?? notice}
          </div>
        ) : null}

        <SettingsCard title="外观" description="只影响悬浮便利贴，设置窗口和周记保持不变。">
          <fieldset disabled={saving}>
            <legend className="text-sm font-medium">便利贴颜色</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {PRESET_COLORS.map((color) => {
                const selected = settings.noteColor === color.value;
                return (
                  <button
                    aria-label={`选择${color.name}便利贴`}
                    aria-pressed={selected}
                    className={`group flex w-16 flex-col items-center gap-1.5 rounded-xl p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                      selected ? 'bg-amber-50 font-semibold text-amber-900' : 'hover:bg-stone-100'
                    }`}
                    key={color.value}
                    onClick={() => void commit({ noteColor: color.value })}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-8 w-8 rounded-full border shadow-sm ${
                        selected ? 'border-amber-700 ring-2 ring-amber-200' : 'border-stone-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                    />
                    {color.name}
                  </button>
                );
              })}
              <label className="flex w-16 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-2 text-xs outline-none hover:bg-stone-100 focus-within:ring-2 focus-within:ring-amber-600">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-stone-400 bg-white text-base"
                >
                  +
                </span>
                自定义
                <input
                  aria-label="选择自定义便利贴颜色"
                  className="sr-only"
                  onChange={(event) => void commit({ noteColor: event.target.value.toUpperCase() })}
                  onInput={(event) => {
                    void api.settings.previewAppearance({
                      noteColor: event.currentTarget.value.toUpperCase(),
                    });
                  }}
                  type="color"
                  value={settings.noteColor}
                />
              </label>
            </div>
          </fieldset>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-medium" htmlFor="note-opacity">
                不透明度
              </label>
              <output className="text-sm tabular-nums text-stone-600" htmlFor="note-opacity">
                {Math.round(opacityDraft * 100)}%
              </output>
            </div>
            <input
              aria-label="便利贴不透明度"
              className="mt-3 w-full accent-amber-700"
              disabled={saving}
              id="note-opacity"
              max="1"
              min="0.6"
              onBlur={commitOpacity}
              onChange={previewOpacity}
              onKeyUp={commitOpacity}
              onPointerUp={commitOpacity}
              step="0.05"
              type="range"
              value={opacityDraft}
            />
            <div className="mt-1 flex justify-between text-xs text-stone-400">
              <span>60%</span>
              <span>100%</span>
            </div>
          </div>

          <button
            className="settings-secondary-button mt-5"
            disabled={
              saving ||
              (settings.noteColor === DEFAULT_NOTE_COLOR &&
                settings.noteOpacity === DEFAULT_NOTE_OPACITY)
            }
            onClick={async () => {
              const previous = savedRef.current;
              if (!previous || savingRef.current) return;
              savingRef.current = true;
              setSaving(true);
              setError(null);
              const result = await api.settings.resetAppearance();
              savingRef.current = false;
              setSaving(false);
              if (result.ok) {
                applySnapshot(result.data);
                setNotice('已恢复默认外观');
              } else {
                applySnapshot(previous);
                setError(result.error.message);
              }
            }}
            type="button"
          >
            恢复默认外观
          </button>
        </SettingsCard>

        <SettingsCard title="通用">
          <SettingSwitch
            checked={settings.alwaysOnTop}
            description="让便利贴保持在普通窗口上方，但不覆盖系统全屏应用。"
            disabled={saving}
            label="保持置顶"
            onChange={(checked) => void commit({ alwaysOnTop: checked })}
          />
          <SettingSwitch
            checked={settings.completedExpanded}
            description="记住便利贴中“已完成”区域最后一次展开或折叠状态。"
            disabled={saving}
            label="展开已完成区域"
            onChange={(checked) => void commit({ completedExpanded: checked })}
          />
        </SettingsCard>

        <SettingsCard title="数据与诊断" description="任务和配置始终保存在你的电脑上。">
          <p className="break-all rounded-xl bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600">
            {settings.dataDirectory}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="settings-secondary-button"
              onClick={() => void runDiagnostic(() => api.app.openDataFolder(), '已打开数据文件夹')}
              type="button"
            >
              打开数据文件夹
            </button>
            <button
              className="settings-secondary-button"
              onClick={() =>
                void runDiagnostic(() => api.settings.copyDataPath(), '数据目录路径已复制')
              }
              type="button"
            >
              复制路径
            </button>
            <button
              className="settings-secondary-button"
              onClick={() =>
                void runDiagnostic(() => api.settings.openLogsFolder(), '已打开日志文件夹')
              }
              type="button"
            >
              打开日志文件夹
            </button>
          </div>
        </SettingsCard>

        <p className="pb-3 text-center text-xs text-stone-400">
          设置仅保存在本机，不会上传。
          {saving ? ' 正在保存…' : ''}
        </p>
      </div>
    </main>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-5 border-b border-stone-100 py-3 last:border-0">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-stone-500">{description}</span>
      </span>
      <input
        checked={checked}
        className="h-5 w-5 shrink-0 accent-amber-700"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
