import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type {
  LlmProviderId,
  ReportSettingsPatch,
  ReportSettingsSnapshot,
  SettingsPatch,
  SettingsSnapshot,
} from '../../shared/domain';
import type { ApiResult } from '../../shared/results';
import { DEFAULT_NOTE_COLOR, DEFAULT_NOTE_OPACITY } from '../../shared/constants';
import { PROVIDER_PRESETS } from '../../shared/providerPresets';
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

        <ReportGenerationSettings />

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
          设置与 API Key 保存在本机；仅在你选择远程生成时发送当前周内容。
          {saving ? ' 正在保存…' : ''}
        </p>
      </div>
    </main>
  );
}

function ReportGenerationSettings() {
  const api = useElectronAPI();
  const [saved, setSaved] = useState<ReportSettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<ReportSettingsPatch | null>(null);
  const [recordPreview, setRecordPreview] = useState('');
  const [remotePreview, setRemotePreview] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordTemplateDraft = draft?.recordTemplate;
  const remoteTemplateDraft = draft?.remoteTemplate;

  useEffect(() => {
    void api.reportSettings.get().then((result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(result.data);
      setDraft({
        mode: result.data.mode,
        recordTemplate: result.data.recordTemplate,
        remoteTemplate: result.data.remoteTemplate,
        prompt: result.data.prompt,
        llm: result.data.llm,
      });
    });
  }, [api]);

  useEffect(() => {
    if (recordTemplateDraft === undefined) return;
    const timer = window.setTimeout(() => {
      void api.reportSettings.preview(recordTemplateDraft).then((result) => {
        if (result.ok) {
          setRecordPreview(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [api, recordTemplateDraft]);

  useEffect(() => {
    if (remoteTemplateDraft === undefined) return;
    const timer = window.setTimeout(() => {
      void api.reportSettings.preview(remoteTemplateDraft).then((result) => {
        if (result.ok) setRemotePreview(result.data);
        else setError(result.error.message);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [api, remoteTemplateDraft]);

  if (!draft) {
    return (
      <SettingsCard title="周报生成" description="正在读取模板与模型配置…">
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </SettingsCard>
    );
  }

  const insecureRemoteHttp = isNonLoopbackHttpUrl(draft.llm.baseUrl);

  const request = (): ReportSettingsPatch => ({
    ...draft,
    ...(clearApiKey ? { apiKey: '' } : apiKey ? { apiKey } : {}),
  });

  const updateLlm = (patch: Partial<ReportSettingsPatch['llm']>) =>
    setDraft((current) => (current ? { ...current, llm: { ...current.llm, ...patch } } : current));

  const save = async () => {
    setBusy('save');
    setError(null);
    setMessage(null);
    const result = await api.reportSettings.save(request());
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSaved(result.data);
    setDraft({
      mode: result.data.mode,
      recordTemplate: result.data.recordTemplate,
      remoteTemplate: result.data.remoteTemplate,
      prompt: result.data.prompt,
      llm: result.data.llm,
    });
    setApiKey('');
    setClearApiKey(false);
    setMessage('周报设置已保存');
  };

  const testConnection = async () => {
    setBusy('test');
    setError(null);
    setMessage(null);
    const result = await api.reportSettings.testConnection(request());
    setBusy(null);
    if (result.ok) setMessage(result.data);
    else setError(result.error.message);
  };

  return (
    <SettingsCard
      title="周报模板与生成方式"
      description="本地模式只生成 TXT 工作记录；远程模式会结合完整模板和提示词生成完整周报。"
    >
      <div className="space-y-5">
        <fieldset disabled={busy !== null}>
          <legend className="text-sm font-medium">生成方式</legend>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={draft.mode === 'local-template'}
                name="report-mode"
                onChange={() => setDraft({ ...draft, mode: 'local-template' })}
                type="radio"
              />
              本地模板（不联网）
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={draft.mode === 'remote-llm'}
                name="report-mode"
                onChange={() => setDraft({ ...draft, mode: 'remote-llm' })}
                type="radio"
              />
              远程大模型
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium" htmlFor="report-template">
          本地 TXT 工作记录模板
        </label>
        <textarea
          className="mt-[-12px] min-h-48 w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
          id="report-template"
          onChange={(event) => setDraft({ ...draft, recordTemplate: event.target.value })}
          spellCheck={false}
          value={draft.recordTemplate}
        />
        <p className="mt-[-12px] text-xs text-stone-500">
          可用变量：{'{{iso_year}}'}、{'{{iso_week}}'}、{'{{week_start}}'}、{'{{week_end}}'}、
          {'{{tasks}}'}（必需）
        </p>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">本地预览</span>
            <button
              className="text-xs text-amber-800 hover:underline"
              onClick={() =>
                void api.reportSettings.getDefaultText('record-template').then((result) => {
                  if (result.ok) setDraft({ ...draft, recordTemplate: result.data });
                })
              }
              type="button"
            >
              恢复默认模板
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-100 p-3 text-xs text-stone-700">
            {recordPreview || '模板有效后将在这里显示预览'}
          </pre>
        </div>

        {draft.mode === 'remote-llm' ? (
          <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor="remote-report-template">
                  远程完整周报模板
                </label>
                <div className="flex gap-3 text-xs">
                  <label className="cursor-pointer text-amber-800 hover:underline">
                    导入 TXT / Markdown
                    <input
                      accept=".txt,.md,text/plain,text/markdown"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 100_000) {
                          setError('完整周报模板文件不能超过 100 KB');
                          return;
                        }
                        setError(null);
                        void file
                          .text()
                          .then((text) =>
                            setDraft((current) =>
                              current ? { ...current, remoteTemplate: text } : current,
                            ),
                          )
                          .catch(() => setError('无法读取完整周报模板文件'));
                        event.target.value = '';
                      }}
                      type="file"
                    />
                  </label>
                  <button
                    className="text-amber-800 hover:underline"
                    onClick={() =>
                      void api.reportSettings.getDefaultText('remote-template').then((result) => {
                        if (result.ok) setDraft({ ...draft, remoteTemplate: result.data });
                      })
                    }
                    type="button"
                  >
                    恢复默认
                  </button>
                </div>
              </div>
              <textarea
                className="mt-2 min-h-64 w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs outline-none focus:border-amber-600"
                id="remote-report-template"
                onChange={(event) => setDraft({ ...draft, remoteTemplate: event.target.value })}
                spellCheck={false}
                value={draft.remoteTemplate}
              />
              <p className="mt-2 text-xs text-stone-600">
                模型会保持此结构，并结合本地工作记录填充“收获与成长”“不足与反思”和“下周计划”。
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-xs text-stone-700">
                {remotePreview || '完整模板有效后将在这里显示示例预览'}
              </pre>
            </div>

            <label className="block text-sm font-medium" htmlFor="report-prompt">
              远程写作提示词
              <textarea
                className="mt-2 min-h-40 w-full rounded-xl border border-stone-300 bg-white p-3 text-xs leading-5 outline-none focus:border-amber-600"
                id="report-prompt"
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                value={draft.prompt}
              />
            </label>
            <div className="mt-[-8px] flex items-center justify-between gap-3 text-xs text-stone-600">
              <span>本地记录、完整模板和未完成待办会由应用自动附加，无需复制进提示词。</span>
              <button
                className="shrink-0 text-amber-800 hover:underline"
                onClick={() =>
                  void api.reportSettings.getDefaultText('prompt').then((result) => {
                    if (result.ok) setDraft({ ...draft, prompt: result.data });
                  })
                }
                type="button"
              >
                恢复默认提示词
              </button>
            </div>

            <label className="block text-sm font-medium">
              服务商
              <select
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
                onChange={(event) => {
                  const provider = event.target.value as LlmProviderId;
                  const preset = PROVIDER_PRESETS.find((item) => item.id === provider);
                  setDraft({
                    ...draft,
                    llm: {
                      ...draft.llm,
                      provider,
                      ...(preset && provider !== 'custom'
                        ? { baseUrl: preset.baseUrl, model: preset.model }
                        : {}),
                      allowInsecureHttp: false,
                    },
                  });
                }}
                value={draft.llm.provider}
              >
                {PROVIDER_PRESETS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Base URL
              <input
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs"
                onChange={(event) =>
                  updateLlm({ baseUrl: event.target.value, allowInsecureHttp: false })
                }
                value={draft.llm.baseUrl}
              />
            </label>
            {insecureRemoteHttp ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-900">
                <label className="flex items-start gap-2 font-medium">
                  <input
                    checked={draft.llm.allowInsecureHttp}
                    className="mt-1"
                    onChange={(event) => updateLlm({ allowInsecureHttp: event.target.checked })}
                    type="checkbox"
                  />
                  <span>
                    我了解 API Key、两份模板、提示词和周报内容将通过明文 HTTP 传输，仍允许连接此地址。
                  </span>
                </label>
                {!draft.llm.allowInsecureHttp ? (
                  <p className="mt-2">勾选后才能保存设置、测试连接或生成周报。</p>
                ) : null}
              </div>
            ) : null}
            <label className="block text-sm font-medium">
              模型 ID
              <input
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs"
                onChange={(event) => updateLlm({ model: event.target.value })}
                value={draft.llm.model}
              />
            </label>
            <label className="block text-sm font-medium">
              API Key
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs"
                disabled={clearApiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setClearApiKey(false);
                }}
                placeholder={
                  saved?.apiKeyMask ??
                  (draft.llm.provider === 'local' ? '本地服务可留空' : '输入后加密保存在本机')
                }
                type="password"
                value={apiKey}
              />
            </label>
            {saved?.hasApiKey ? (
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <input
                  checked={clearApiKey}
                  onChange={(event) => {
                    setClearApiKey(event.target.checked);
                    if (event.target.checked) setApiKey('');
                  }}
                  type="checkbox"
                />
                保存时删除已存 API Key
              </label>
            ) : null}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">高级参数</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label>
                  Temperature
                  <input
                    className="mt-1 w-full rounded border p-2"
                    max="2"
                    min="0"
                    onChange={(event) => updateLlm({ temperature: Number(event.target.value) })}
                    step="0.1"
                    type="number"
                    value={draft.llm.temperature}
                  />
                </label>
                <label>
                  最大 Tokens
                  <input
                    className="mt-1 w-full rounded border p-2"
                    min="1"
                    onChange={(event) => updateLlm({ maxTokens: Number(event.target.value) })}
                    type="number"
                    value={draft.llm.maxTokens}
                  />
                </label>
                <label>
                  超时（毫秒）
                  <input
                    className="mt-1 w-full rounded border p-2"
                    min="1000"
                    onChange={(event) => updateLlm({ timeoutMs: Number(event.target.value) })}
                    step="1000"
                    type="number"
                    value={draft.llm.timeoutMs}
                  />
                </label>
              </div>
            </details>
            <button
              className="settings-secondary-button"
              disabled={busy !== null}
              onClick={() => void testConnection()}
              type="button"
            >
              {busy === 'test' ? '正在测试…' : '测试连接'}
            </button>
          </div>
        ) : null}

        {error || message ? (
          <p
            className={`text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`}
            role={error ? 'alert' : 'status'}
          >
            {error ?? message}
          </p>
        ) : null}
        <button
          className="settings-primary-button"
          disabled={busy !== null}
          onClick={() => void save()}
          type="button"
        >
          {busy === 'save' ? '正在保存…' : '保存周报设置'}
        </button>
      </div>
    </SettingsCard>
  );
}

const isNonLoopbackHttpUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const loopback =
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '0:0:0:0:0:0:0:1' ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);
    return url.protocol === 'http:' && !loopback;
  } catch {
    return false;
  }
};

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
