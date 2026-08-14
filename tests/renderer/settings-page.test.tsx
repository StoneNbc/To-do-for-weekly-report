// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import './setup';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';
import { SettingsPage } from '../../src/renderer/pages/SettingsPage';
import { ElectronAPIProvider } from '../../src/renderer/state/providers';

const renderPage = (scenario: Parameters<typeof createMockElectronAPI>[0] = 'default') => {
  const controller = createMockElectronAPI(scenario);
  render(
    <ElectronAPIProvider api={controller.api}>
      <SettingsPage />
    </ElectronAPIProvider>,
  );
  return controller;
};

describe('SettingsPage', () => {
  it('loads the saved settings and exposes accessible appearance controls', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择米黄便利贴' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('slider', { name: '便利贴不透明度' })).toHaveValue('1');
    expect(screen.getByText('/本机/悬浮便利贴/data')).toBeInTheDocument();
  });

  it('commits preset colors and previews then persists the final opacity', async () => {
    const controller = renderPage();
    const update = vi.spyOn(controller.api.settings, 'update');
    const preview = vi.spyOn(controller.api.settings, 'previewAppearance');
    await screen.findByRole('heading', { name: '设置' });

    fireEvent.click(screen.getByRole('button', { name: '选择天蓝便利贴' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ noteColor: '#E0F2FE' }));
    expect(await screen.findByText('已保存')).toBeInTheDocument();

    const slider = screen.getByRole('slider', { name: '便利贴不透明度' });
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(preview).toHaveBeenCalledWith({ noteOpacity: 0.8 });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ noteOpacity: 0.8 }));
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('updates general preferences and runs safe diagnostics', async () => {
    const controller = renderPage();
    const update = vi.spyOn(controller.api.settings, 'update');
    const openLogs = vi.spyOn(controller.api.settings, 'openLogsFolder');
    const copyPath = vi.spyOn(controller.api.settings, 'copyDataPath');
    await screen.findByRole('heading', { name: '设置' });

    fireEvent.click(screen.getByRole('checkbox', { name: /保持置顶/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ alwaysOnTop: false }));

    fireEvent.click(screen.getByRole('button', { name: '复制路径' }));
    await waitFor(() => expect(copyPath).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '打开日志文件夹' }));
    await waitFor(() => expect(openLogs).toHaveBeenCalled());
  });

  it('shows a retry state when settings cannot be read', async () => {
    renderPage('io-error');
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
