// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const controller = renderPage();
    const add = vi.spyOn(controller.api.today, 'add');
    const input = await screen.findByRole('textbox', { name: '添加今日任务' });
    fireEvent.change(input, { target: { value: '  新增本地任务  ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));

    expect(await screen.findByText('新增本地任务')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(add).toHaveBeenCalledWith('新增本地任务');
  });

  it('完成、编辑和删除均用 locator 调用真实契约', async () => {
    const controller = renderPage();
    const toggle = vi.spyOn(controller.api.today, 'toggle');
    const edit = vi.spyOn(controller.api.today, 'edit');
    const remove = vi.spyOn(controller.api.today, 'delete');
    await screen.findByRole('list', { name: '今日待办' });

    fireEvent.click(screen.getByRole('checkbox', { name: '完成任务：准备周会材料' }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith({ line: 1, revision: 'today-r1' }));
    expect(await screen.findByRole('checkbox', { name: '撤销完成：准备周会材料' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /已完成（6）/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：回复客户邮件' }), { key: 'F2' });
    const editing = screen.getByRole('textbox', { name: '编辑任务：回复客户邮件' });
    fireEvent.change(editing, { target: { value: '回复重点客户邮件' } });
    fireEvent.keyDown(editing, { key: 'Enter' });
    await waitFor(() => expect(edit).toHaveBeenCalledWith({
      locator: expect.objectContaining({ line: 2 }),
      content: '回复重点客户邮件',
      completedAt: '14:20',
    }));

    fireEvent.click(await screen.findByRole('button', { name: '删除任务：回复重点客户邮件' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(expect.objectContaining({ line: 2 })));
    expect(screen.queryByText('回复重点客户邮件')).not.toBeInTheDocument();
  });

  it('变更成功后抑制一次自身 app-write watcher 回声', async () => {
    const controller = renderPage();
    const getToday = vi.spyOn(controller.api.today, 'get');
    await screen.findByRole('list', { name: '今日待办' });
    fireEvent.change(screen.getByRole('textbox', { name: '添加今日任务' }), {
      target: { value: '验证 watcher 回声' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));
    await screen.findByText('验证 watcher 回声');
    const callsAfterMutation = getToday.mock.calls.length;

    controller.emit({ scope: 'today', reason: 'app-write' });
    await Promise.resolve();
    expect(getToday).toHaveBeenCalledTimes(callsAfterMutation);
  });

  it('历史模式有明确标识和补录入口，不出现未完成任务语义', async () => {
    renderPage();
    await screen.findByRole('list', { name: '今日待办' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));

    expect(await screen.findByRole('status', { name: '当前正在查看历史记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回今天' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '补录已完成事项' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '添加今日任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('历史补录、带时间编辑和删除使用所选日期与 locator', async () => {
    const controller = renderPage();
    const add = vi.spyOn(controller.api.history, 'add');
    const edit = vi.spyOn(controller.api.history, 'edit');
    const remove = vi.spyOn(controller.api.history, 'delete');
    await screen.findByRole('list', { name: '今日待办' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));
    await screen.findByRole('list', { name: '历史完成记录' });

    fireEvent.change(screen.getByRole('textbox', { name: '补录已完成事项' }), {
      target: { value: '补录昨日评审' },
    });
    fireEvent.change(screen.getByLabelText('完成时间（可选）'), { target: { value: '20:15' } });
    fireEvent.click(screen.getByRole('button', { name: '补录完成事项' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith({
      date: '2026-08-12',
      content: '补录昨日评审',
      completedAt: '20:15',
    }));

    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：完成界面原型' }), { key: 'F2' });
    fireEvent.change(screen.getByRole('textbox', { name: '编辑任务：完成界面原型' }), {
      target: { value: '完成最终界面原型' },
    });
    const timeInput = screen.getByLabelText('编辑完成时间：完成界面原型');
    fireEvent.change(timeInput, { target: { value: '16:45' } });
    fireEvent.keyDown(timeInput, { key: 'Enter' });
    await waitFor(() => expect(edit).toHaveBeenCalledWith({
      date: '2026-08-12',
      locator: expect.objectContaining({ line: 4 }),
      content: '完成最终界面原型',
      completedAt: '16:45',
    }));

    fireEvent.click(await screen.findByRole('button', { name: '删除任务：完成最终界面原型' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({
      date: '2026-08-12',
      locator: expect.objectContaining({ line: 4 }),
    }));
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
    const getToday = vi.spyOn(controller.api.today, 'get');
    await screen.findByRole('list', { name: '今日待办' });
    const initialCalls = getToday.mock.calls.length;
    controller.emit({ scope: 'week', isoYear: 2026, isoWeek: 33, reason: 'external-edit' });
    await Promise.resolve();
    expect(getToday).toHaveBeenCalledTimes(initialCalls);

    controller.emit({ scope: 'today', reason: 'external-edit' });
    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(initialCalls + 1));
  });

  it('将文件监听事件风暴合并为一个进行中请求和最多一个尾随请求', async () => {
    const controller = renderPage();
    const originalGet = controller.api.today.get.bind(controller.api.today);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const getToday = vi.spyOn(controller.api.today, 'get').mockImplementation(async () => {
      await gate;
      return originalGet();
    });

    release?.();
    await screen.findByRole('list', { name: '今日待办' });
    getToday.mockClear();
    for (let index = 0; index < 8; index += 1) {
      controller.emit({ scope: 'today', reason: 'external-edit' });
    }
    await waitFor(() => expect(getToday.mock.calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(getToday.mock.calls.length).toBeLessThanOrEqual(2));
  });

  it('菜单导出成功后显示路径、打开操作和“不自动打开”说明', async () => {
    const controller = renderPage();
    const exportReport = vi.spyOn(controller.api.report, 'export');
    const openLast = vi.spyOn(controller.api.report, 'openLast');
    const revealLast = vi.spyOn(controller.api.report, 'revealLast');
    await screen.findByRole('list', { name: '今日待办' });
    const menuButton = screen.getByRole('button', { name: '打开便利贴菜单' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: '关闭便利贴菜单' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: '导出本周周报' }));

    expect(await screen.findByLabelText('导出成功')).toHaveTextContent('周报-2026年第33周.txt');
    expect(screen.getByLabelText('导出成功')).toHaveTextContent('文件不会自动打开');
    expect(exportReport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }));
    fireEvent.click(screen.getByRole('button', { name: '打开所在文件夹' }));
    expect(openLast).toHaveBeenCalledOnce();
    expect(revealLast).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.queryByLabelText('导出成功')).not.toBeInTheDocument();
  });

  it('点击菜单外空白区域或按 Esc 会关闭菜单，点击菜单内部不会误关闭', async () => {
    renderPage();
    await screen.findByRole('list', { name: '今日待办' });

    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    const menu = screen.getByRole('menu');
    fireEvent.pointerDown(menu);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('main'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开便利贴菜单' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('菜单导出取消不报错且 failed 有明确错误', async () => {
    const cancelled = renderPage('export-cancelled');
    await screen.findByRole('list', { name: '今日待办' });
    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '导出本周周报' }));
    expect(await screen.findByLabelText('导出已取消')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    cancelled.api.report.export = vi.fn().mockResolvedValue({ status: 'failed', message: '磁盘空间不足' });
    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '导出本周周报' }));
    expect(await screen.findByLabelText('导出失败')).toHaveTextContent('磁盘空间不足');
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument();
  });

  it('280px 最小窗口所需控件采用可收缩/滚动布局，并具备图标中文标签', async () => {
    const { container } = render(
      <ElectronAPIProvider api={createMockElectronAPI().api}>
        <FloatingNotePage />
      </ElectronAPIProvider>,
    );
    await screen.findByRole('list', { name: '今日待办' });
    expect(container.firstElementChild).toHaveClass('min-h-[280px]', 'overflow-hidden');
    expect(screen.getByRole('button', { name: '查看前一天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看后一天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开便利贴菜单' })).toBeInTheDocument();
  });
});
