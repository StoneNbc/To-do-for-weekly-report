// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import './setup';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';
import { WeeklyPage } from '../../src/renderer/pages/WeeklyPage';
import { ElectronAPIProvider } from '../../src/renderer/state/providers';

function renderPage(scenario: Parameters<typeof createMockElectronAPI>[0] = 'default') {
  const controller = createMockElectronAPI(scenario);
  render(
    <ElectronAPIProvider api={controller.api}>
      <WeeklyPage />
    </ElectronAPIProvider>,
  );
  return controller;
}

describe('WeeklyPage', () => {
  it('按日分组展示重复任务和实际总数', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '周三' })).toBeInTheDocument();
    expect(screen.getAllByText('重复记录')).toHaveLength(2);
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看上一周' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '一键导出周报 TXT' })).toBeEnabled();
  });

  it('空周显示空状态', async () => {
    renderPage('empty-week');
    expect(await screen.findByText('本周暂无完成记录')).toBeInTheDocument();
    expect(screen.getByText('0', { selector: 'strong' })).toBeInTheDocument();
  });

  it('导出取消是正常状态，不展示失败', async () => {
    renderPage('export-cancelled');
    const button = await screen.findByRole('button', { name: '一键导出周报 TXT' });
    fireEvent.click(button);

    expect(await screen.findByText('已取消导出。')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('IO_ERROR 显示错误和重试入口', async () => {
    renderPage('io-error');
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
