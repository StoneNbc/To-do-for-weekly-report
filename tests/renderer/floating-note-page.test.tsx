// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';
import { FloatingNotePage } from '../../src/renderer/pages/FloatingNotePage';
import { ElectronAPIProvider } from '../../src/renderer/state/providers';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

function renderPage(scenario: Parameters<typeof createMockElectronAPI>[0] = 'default') {
  const controller = createMockElectronAPI(scenario);
  render(
    <ElectronAPIProvider api={controller.api}>
      <FloatingNotePage />
    </ElectronAPIProvider>,
  );
  return controller;
}

describe('FloatingNotePage', () => {
  it('按今日待办与已完成分区展示，并保留完全相同的两条任务', async () => {
    renderPage();

    expect(await screen.findByRole('list', { name: '今日待办' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '今日待办' })).getByText('准备周会材料')).toBeInTheDocument();
    expect(screen.getAllByText('重复记录')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /已完成（5）/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('添加任务后使用 API 返回快照更新页面', async () => {
    renderPage();
    const input = await screen.findByRole('textbox', { name: '添加今日任务' });
    fireEvent.change(input, { target: { value: '  新增本地任务  ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));

    expect(await screen.findByText('新增本地任务')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('历史模式有明确标识和补录入口，不出现未完成任务语义', async () => {
    renderPage();
    await screen.findByRole('list', { name: '今日待办' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));

    expect(await screen.findByRole('button', { name: /历史记录 · 返回今天/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '补录已完成事项' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '添加今日任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('FILE_CHANGED 时载入最新快照并提示用户重新操作', async () => {
    renderPage('file-changed');
    const checkbox = await screen.findByRole('checkbox', { name: '完成任务：准备周会材料' });
    fireEvent.click(checkbox);

    expect(await screen.findByText('数据文件已更新，已载入最新内容，请重新操作')).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('IO_ERROR 显示可重试的持久错误', async () => {
    renderPage('io-error');

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('FILE_CHANGED 之外也可响应外部文件变化事件', async () => {
    const controller = renderPage();
    await screen.findByRole('list', { name: '今日待办' });
    controller.emit({ scope: 'today', reason: 'external-edit' });

    await waitFor(() => expect(screen.getByRole('list', { name: '今日待办' })).toBeInTheDocument());
  });
});
