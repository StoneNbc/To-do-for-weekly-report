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

  it('previews a template and saves a remote provider preset without exposing the stored key', async () => {
    const controller = renderPage();
    const save = vi.spyOn(controller.api.reportSettings, 'save');
    await screen.findByRole('heading', { name: '周报模板与生成方式' });

    expect(await screen.findByText(/示例任务/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '远程大模型' }));
    fireEvent.change(screen.getByRole('textbox', { name: '远程完整周报模板' }), {
      target: { value: '【工作记录】\n{{tasks}}\n【收获与成长】\n【不足与反思】\n【下周计划】' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '远程写作提示词' }), {
      target: { value: '使用第一人称，只依据提供的事实。' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '服务商' }), {
      target: { value: 'kimi' },
    });
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
      'https://api.moonshot.cn/v1',
    );
    expect(screen.getByRole('textbox', { name: '模型 ID' })).toHaveValue('kimi-k3');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存周报设置' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'remote-llm',
          remoteTemplate:
            '【工作记录】\n{{tasks}}\n【收获与成长】\n【不足与反思】\n【下周计划】',
          prompt: '使用第一人称，只依据提供的事实。',
          apiKey: 'sk-new-secret',
          llm: expect.objectContaining({ provider: 'kimi', model: 'kimi-k3' }),
        }),
      ),
    );
    expect(screen.queryByDisplayValue('sk-new-secret')).not.toBeInTheDocument();
  });

  it('requires explicit acknowledgement before saving a public HTTP endpoint', async () => {
    const controller = renderPage();
    const save = vi.spyOn(controller.api.reportSettings, 'save');
    await screen.findByRole('heading', { name: '周报模板与生成方式' });

    fireEvent.click(screen.getByRole('radio', { name: '远程大模型' }));
    fireEvent.change(screen.getByRole('combobox', { name: '服务商' }), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Base URL' }), {
      target: { value: 'http://221.178.103.68/v1' },
    });
    const acknowledgement = screen.getByRole('checkbox', { name: /仍允许连接此地址/ });
    expect(acknowledgement).not.toBeChecked();
    fireEvent.click(acknowledgement);
    fireEvent.change(screen.getByRole('textbox', { name: '模型 ID' }), {
      target: { value: 'self-hosted-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存周报设置' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({
            baseUrl: 'http://221.178.103.68/v1',
            allowInsecureHttp: true,
          }),
        }),
      ),
    );
  });

  it('shows a retry state when settings cannot be read', async () => {
    renderPage('io-error');
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
