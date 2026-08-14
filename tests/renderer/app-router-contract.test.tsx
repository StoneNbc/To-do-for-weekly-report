// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { AppRouter } from '../../src/renderer/AppRouter';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AppRouter ElectronAPI contract', () => {
  it('不传测试属性时使用真实 window.electronAPI 进入便利贴', async () => {
    window.electronAPI = createMockElectronAPI().api;
    render(<AppRouter />);
    expect(await screen.findByRole('textbox', { name: '添加今日任务' })).toBeInTheDocument();
  });

  it('仅白名单 weekly 和 settings 进入对应页面，未知 view 回退便利贴', async () => {
    window.history.replaceState({}, '', '/?view=weekly');
    window.electronAPI = createMockElectronAPI().api;
    const { unmount } = render(<AppRouter />);
    expect(await screen.findByRole('button', { name: '一键导出周报 TXT' })).toBeInTheDocument();
    unmount();

    window.history.replaceState({}, '', '/?view=settings');
    const settingsView = render(<AppRouter />);
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    settingsView.unmount();

    window.history.replaceState({}, '', '/?view=unexpected');
    render(<AppRouter />);
    expect(await screen.findByRole('textbox', { name: '添加今日任务' })).toBeInTheDocument();
  });
});
