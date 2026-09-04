import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/shared/constants';
import type { AppConfig, NoteAppearance, SettingsSnapshot } from '../../../src/shared/domain';
import type { ConfigService } from '../../../src/main/services/configService';
import { SettingsService } from '../../../src/main/services/settingsService';

const makeRuntime = () => ({
  previewAppearance: vi.fn<(appearance: NoteAppearance) => void>(),
  applySettings: vi.fn<(snapshot: SettingsSnapshot) => void>(),
  broadcastSettingsChanged: vi.fn<(snapshot: SettingsSnapshot) => void>(),
});

const makeConfig = () => {
  let config: AppConfig = { ...DEFAULT_CONFIG, future_setting: { enabled: true } };
  return {
    get: vi.fn(() => structuredClone(config)),
    commit: vi.fn(async (patch) => {
      config = { ...config, ...patch };
      return structuredClone(config);
    }),
  } satisfies Pick<ConfigService, 'get' | 'commit'>;
};

describe('SettingsService', () => {
  it('previews without persisting and commits a public snapshot', async () => {
    const config = makeConfig();
    const runtime = makeRuntime();
    const service = new SettingsService({ config, dataDirectory: '/safe/data', runtime });

    service.previewAppearance({ noteOpacity: 0.8 });
    expect(runtime.previewAppearance).toHaveBeenCalledWith({
      noteColor: '#FFF8E7',
      noteOpacity: 0.8,
    });
    expect(config.commit).not.toHaveBeenCalled();

    const snapshot = await service.update({
      noteColor: '#E0F2FE',
      alwaysOnTop: false,
      showOnFullScreen: true,
      edgeAutoHideEnabled: true,
    });
    expect(snapshot).toEqual({
      noteColor: '#E0F2FE',
      noteOpacity: 1,
      alwaysOnTop: false,
      showOnFullScreen: false,
      edgeAutoHideEnabled: true,
      completedExpanded: false,
      addedDateDisplay: 'hover',
      dataDirectory: '/safe/data',
    });
    expect(runtime.applySettings).toHaveBeenCalledWith(snapshot);
    expect(runtime.broadcastSettingsChanged).toHaveBeenCalledWith(snapshot);
    expect(config.commit).toHaveBeenLastCalledWith({
      note_color: '#E0F2FE',
      always_on_top: false,
      show_on_fullscreen: false,
      edge_auto_hide: true,
    });
  });

  it('restores the last successful appearance after persistence fails', async () => {
    const config = makeConfig();
    config.commit.mockRejectedValueOnce(new Error('disk full'));
    const runtime = makeRuntime();
    const service = new SettingsService({ config, dataDirectory: '/safe/data', runtime });

    service.previewAppearance({ noteColor: '#111827', noteOpacity: 0.65 });
    await expect(service.update({ noteColor: '#111827', noteOpacity: 0.65 })).rejects.toMatchObject(
      {
        code: 'IO_ERROR',
      },
    );
    expect(runtime.previewAppearance).toHaveBeenLastCalledWith({
      noteColor: '#FFF8E7',
      noteOpacity: 1,
    });
    expect(runtime.applySettings).not.toHaveBeenCalled();
  });
});
