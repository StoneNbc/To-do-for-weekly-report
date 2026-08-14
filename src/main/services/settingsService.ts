import { DEFAULT_NOTE_COLOR, DEFAULT_NOTE_OPACITY } from '../../shared/constants';
import type {
  AppearancePreview,
  AppConfig,
  NoteAppearance,
  SettingsPatch,
  SettingsSnapshot,
} from '../../shared/domain';
import type { ConfigPatch, ConfigService } from './configService';

export interface SettingsRuntimeTarget {
  previewAppearance(appearance: NoteAppearance): void;
  applySettings(snapshot: SettingsSnapshot): void;
  broadcastSettingsChanged(snapshot: SettingsSnapshot): void;
}

export interface SettingsServiceOptions {
  config: Pick<ConfigService, 'get' | 'commit'>;
  dataDirectory: string;
  runtime: SettingsRuntimeTarget;
}

export class SettingsService {
  readonly #config: Pick<ConfigService, 'get' | 'commit'>;
  readonly #dataDirectory: string;
  readonly #runtime: SettingsRuntimeTarget;

  constructor({ config, dataDirectory, runtime }: SettingsServiceOptions) {
    this.#config = config;
    this.#dataDirectory = dataDirectory;
    this.#runtime = runtime;
  }

  get(): SettingsSnapshot {
    return this.#toSnapshot(this.#config.get());
  }

  previewAppearance(input: AppearancePreview): void {
    const current = this.get();
    this.#runtime.previewAppearance({
      noteColor: input.noteColor ?? current.noteColor,
      noteOpacity: input.noteOpacity ?? current.noteOpacity,
    });
  }

  cancelAppearancePreview(): void {
    const current = this.get();
    this.#runtime.previewAppearance({
      noteColor: current.noteColor,
      noteOpacity: current.noteOpacity,
    });
  }

  async update(patch: SettingsPatch): Promise<SettingsSnapshot> {
    const configPatch = toConfigPatch(patch);
    try {
      const config = await this.#config.commit(configPatch);
      const snapshot = this.#toSnapshot(config);
      this.#runtime.applySettings(snapshot);
      this.#runtime.broadcastSettingsChanged(snapshot);
      return snapshot;
    } catch (error) {
      this.cancelAppearancePreview();
      throw toSettingsWriteError(error);
    }
  }

  resetAppearance(): Promise<SettingsSnapshot> {
    return this.update({
      noteColor: DEFAULT_NOTE_COLOR,
      noteOpacity: DEFAULT_NOTE_OPACITY,
    });
  }

  #toSnapshot(config: AppConfig): SettingsSnapshot {
    return {
      noteColor: config.note_color,
      noteOpacity: config.note_opacity,
      alwaysOnTop: config.always_on_top,
      completedExpanded: config.completed_expanded,
      dataDirectory: this.#dataDirectory,
    };
  }
}

const toConfigPatch = (patch: SettingsPatch): ConfigPatch => {
  const configPatch: ConfigPatch = {};
  if (patch.noteColor !== undefined) configPatch.note_color = patch.noteColor;
  if (patch.noteOpacity !== undefined) configPatch.note_opacity = patch.noteOpacity;
  if (patch.alwaysOnTop !== undefined) configPatch.always_on_top = patch.alwaysOnTop;
  if (patch.completedExpanded !== undefined)
    configPatch.completed_expanded = patch.completedExpanded;
  return configPatch;
};

const toSettingsWriteError = (cause: unknown): Error & { code: 'IO_ERROR' } =>
  Object.assign(new Error('设置暂时无法保存，请稍后重试', { cause }), {
    code: 'IO_ERROR' as const,
  });
