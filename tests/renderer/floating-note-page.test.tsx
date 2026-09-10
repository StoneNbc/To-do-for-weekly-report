// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('隐藏时只显示边缘提示条，鼠标进入后请求恢复', async () => {
    const controller = renderPage();
    await screen.findByRole('list', { name: '待完成事项' });

    act(() => controller.emitNoteDockState({ edge: 'left', phase: 'hidden' }));
    expect(screen.getByRole('main')).toHaveStyle({
      '--note-edge-reveal-size': '2px',
      '--note-edge-reveal-color': '#92400E',
    });
    expect(screen.getByTestId('note-edge-reveal')).toHaveClass('note-edge-reveal-left');
    expect(screen.queryByRole('list', { name: '待完成事项' })).toBeNull();

    fireEvent.pointerEnter(screen.getByRole('main'));
    await waitFor(() =>
      expect(controller.getLastNoteInteractionState()).toEqual({
        pointerInside: true,
        autoHideBlocked: false,
      }),
    );
  });

  it('菜单和文本输入期间阻止贴边自动隐藏', async () => {
    const controller = renderPage();
    const input = await screen.findByRole('textbox', { name: '添加待办' });

    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    await waitFor(() =>
      expect(controller.getLastNoteInteractionState().autoHideBlocked).toBe(true),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.focus(input);
    await waitFor(() =>
      expect(controller.getLastNoteInteractionState().autoHideBlocked).toBe(true),
    );

    fireEvent.blur(input);
    await waitFor(() =>
      expect(controller.getLastNoteInteractionState().autoHideBlocked).toBe(false),
    );
  });

  it('收起时只保留标题栏，并可恢复完整便利贴', async () => {
    const controller = renderPage();
    const setNoteCollapsed = vi.spyOn(controller.api.window, 'setNoteCollapsed');
    await screen.findByRole('list', { name: '待完成事项' });
    const note = screen.getByRole('main');
    expect(note).toHaveClass('p-3');

    fireEvent.click(screen.getByRole('button', { name: '收起便利贴' }));
    await waitFor(() => expect(setNoteCollapsed).toHaveBeenCalledWith(true));
    expect(note).toHaveClass('p-3');
    expect(screen.queryByRole('list', { name: '待完成事项' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: '添加待办' })).toBeNull();
    expect(screen.getByRole('button', { name: '打开便利贴菜单' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开便利贴' }));
    await waitFor(() => expect(setNoteCollapsed).toHaveBeenLastCalledWith(false));
    expect(await screen.findByRole('list', { name: '待完成事项' })).toBeInTheDocument();
  });

  it('收起后保留菜单按钮，点击时恢复窗口并打开菜单', async () => {
    const controller = renderPage();
    const setNoteCollapsed = vi.spyOn(controller.api.window, 'setNoteCollapsed');
    await screen.findByRole('list', { name: '待完成事项' });

    fireEvent.click(screen.getByRole('button', { name: '收起便利贴' }));
    await screen.findByRole('button', { name: '展开便利贴' });
    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));

    await waitFor(() => expect(setNoteCollapsed).toHaveBeenLastCalledWith(false));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起便利贴' })).toBeInTheDocument();
  });

  it('opens the settings window from the enabled note menu', async () => {
    const controller = renderPage();
    const openSettings = vi.spyOn(controller.api.window, 'openSettings');
    await screen.findByRole('list', { name: '待完成事项' });

    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '设置' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('按今日待办与已完成分区展示，并保留完全相同的两条任务', async () => {
    renderPage();

    expect(await screen.findByRole('list', { name: '待完成事项' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: '待完成事项' })).getByText('准备周会材料'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('重复记录')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /已完成（5）/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('添加任务后使用 API 返回快照更新页面', async () => {
    const controller = renderPage();
    const add = vi.spyOn(controller.api.today, 'add');
    const input = await screen.findByRole('textbox', { name: '添加待办' });
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
    await screen.findByRole('list', { name: '待完成事项' });

    fireEvent.click(screen.getByRole('checkbox', { name: '完成任务：准备周会材料' }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith({ line: 1, revision: 'today-r1' }));
    expect(await screen.findByRole('checkbox', { name: '撤销完成：准备周会材料' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /已完成（6）/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：回复客户邮件' }), {
      key: 'F2',
    });
    const editing = screen.getByRole('textbox', { name: '编辑任务：回复客户邮件' });
    fireEvent.change(editing, { target: { value: '回复重点客户邮件' } });
    fireEvent.keyDown(editing, { key: 'Enter' });
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith({
        locator: expect.objectContaining({ line: 2 }),
        content: '回复重点客户邮件',
        details: '',
        completedAt: '14:20',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: '删除任务：回复重点客户邮件' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(expect.objectContaining({ line: 2 })));
    expect(screen.queryByText('回复重点客户邮件')).not.toBeInTheDocument();
  });

  it('同一时间只保留一个任务编辑器', async () => {
    renderPage();
    await screen.findByRole('list', { name: '待完成事项' });

    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：准备周会材料' }), {
      key: 'F2',
    });
    expect(screen.getByRole('textbox', { name: '编辑任务：准备周会材料' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /已完成（5）/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：回复客户邮件' }), {
      key: 'F2',
    });
    expect(screen.queryByRole('textbox', { name: '编辑任务：准备周会材料' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '编辑任务：回复客户邮件' })).toBeInTheDocument();
  });

  it('变更成功后抑制一次自身 app-write watcher 回声', async () => {
    const controller = renderPage();
    const getToday = vi.spyOn(controller.api.today, 'get');
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.change(screen.getByRole('textbox', { name: '添加待办' }), {
      target: { value: '验证 watcher 回声' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));
    await screen.findByText('验证 watcher 回声');
    const callsAfterMutation = getToday.mock.calls.length;

    controller.emit({ scope: 'today', reason: 'app-write' });
    await Promise.resolve();
    expect(getToday).toHaveBeenCalledTimes(callsAfterMutation);
  });

  it('历史模式显示全局待办、完成记录和普通新增入口', async () => {
    renderPage();
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));

    expect(await screen.findByRole('status', { name: '当前正在查看历史记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回今天' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '添加待办' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '完成任务：准备周会材料' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '撤销完成：完成界面原型' })).toBeInTheDocument();
  });

  it('历史新增进入全局待办，历史记录仍支持带时间编辑和永久删除', async () => {
    const controller = renderPage();
    const add = vi.spyOn(controller.api.history, 'addPending');
    const edit = vi.spyOn(controller.api.history, 'edit');
    const remove = vi.spyOn(controller.api.history, 'delete');
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));
    await screen.findByRole('list', { name: '历史完成记录' });

    fireEvent.change(screen.getByRole('textbox', { name: '添加待办' }), {
      target: { value: '今天录入的新待办' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({ date: '2026-08-12', content: '今天录入的新待办' }),
    );
    expect(screen.getByText('今天录入的新待办')).toBeInTheDocument();
    expect(screen.getByText('已添加到全局待办')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回今天' }));
    expect(await screen.findByText('今天录入的新待办')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));
    await screen.findByRole('list', { name: '历史完成记录' });

    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：完成界面原型' }), {
      key: 'F2',
    });
    fireEvent.change(screen.getByRole('textbox', { name: '编辑任务：完成界面原型' }), {
      target: { value: '完成最终界面原型' },
    });
    const timeInput = screen.getByLabelText('编辑完成时间：完成界面原型');
    fireEvent.change(timeInput, { target: { value: '16:45' } });
    fireEvent.keyDown(timeInput, { key: 'Enter' });
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith({
        date: '2026-08-12',
        locator: expect.objectContaining({ line: 4 }),
        content: '完成最终界面原型',
        details: '核对最小窗口布局',
        completedAt: '16:45',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: '删除任务：完成最终界面原型' }));
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith({
        date: '2026-08-12',
        locator: expect.objectContaining({ line: 4 }),
      }),
    );
  });

  it('可在历史日期完成待办并撤销历史完成', async () => {
    const controller = renderPage();
    const complete = vi.spyOn(controller.api.history, 'completePending');
    const reopen = vi.spyOn(controller.api.history, 'reopenCompleted');
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: '完成任务：准备周会材料' }));
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith({
        date: '2026-08-12',
        locator: expect.objectContaining({ line: 1 }),
      }),
    );
    expect(
      screen.queryByRole('checkbox', { name: '完成任务：准备周会材料' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '撤销完成：完成界面原型' }));
    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith({
        date: '2026-08-12',
        locator: expect.objectContaining({ line: 4 }),
      }),
    );
    expect(
      await screen.findByRole('checkbox', { name: '完成任务：完成界面原型' }),
    ).toBeInTheDocument();
  });

  it('FILE_CHANGED 时载入最新快照并提示用户重新操作', async () => {
    renderPage('file-changed');
    const checkbox = await screen.findByRole('checkbox', { name: '完成任务：准备周会材料' });
    fireEvent.click(checkbox);

    expect(
      await screen.findByText('数据文件已更新，已载入最新内容，请重新操作'),
    ).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('IO_ERROR 显示可重试的持久错误', async () => {
    renderPage('io-error');

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('历史跨文件 IO_ERROR 后刷新组合快照并保留部分失败提示', async () => {
    const controller = renderPage();
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.click(screen.getByRole('button', { name: '查看前一天' }));
    await screen.findByRole('list', { name: '历史完成记录' });

    vi.spyOn(controller.api.history, 'completePending').mockResolvedValueOnce({
      ok: false,
      error: { code: 'IO_ERROR', message: '数据可能重复，请刷新检查' },
    });
    const getView = vi.spyOn(controller.api.history, 'getView').mockResolvedValueOnce({
      ok: true,
      data: {
        date: '2026-08-12',
        backlog: {
          fileDate: '2026-08-13',
          currentDate: '2026-08-13',
          revision: 'today-after-partial-failure',
          tasks: [
            {
              locator: { line: 7, revision: 'today-after-partial-failure' },
              content: '磁盘刷新后的待办',
              details: '',
              completed: false,
              addedDate: '2026-08-10',
            },
          ],
          warnings: [],
        },
        completed: {
          date: '2026-08-12',
          revision: 'week-after-partial-failure',
          tasks: [],
          warnings: [],
        },
      },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '完成任务：准备周会材料' }));

    expect(await screen.findByText('磁盘刷新后的待办')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('数据可能重复，请刷新检查');
    expect(getView).toHaveBeenCalledWith('2026-08-12');
  });

  it('FILE_CHANGED 之外也可响应外部文件变化事件', async () => {
    const controller = renderPage();
    const getToday = vi.spyOn(controller.api.today, 'get');
    await screen.findByRole('list', { name: '待完成事项' });
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
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getToday = vi.spyOn(controller.api.today, 'get').mockImplementation(async () => {
      await gate;
      return originalGet();
    });

    release?.();
    await screen.findByRole('list', { name: '待完成事项' });
    getToday.mockClear();
    for (let index = 0; index < 8; index += 1) {
      controller.emit({ scope: 'today', reason: 'external-edit' });
    }
    await waitFor(() => expect(getToday.mock.calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(getToday.mock.calls.length).toBeLessThanOrEqual(2));
  });

  it('菜单周报入口打开统一生成流程，不绕过预览和远程发送确认', async () => {
    const controller = renderPage();
    const generateCurrentWeekReport = vi.spyOn(controller.api.window, 'generateCurrentWeekReport');
    const exportReport = vi.spyOn(controller.api.report, 'export');
    await screen.findByRole('list', { name: '待完成事项' });
    const menuButton = screen.getByRole('button', { name: '打开便利贴菜单' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: '关闭便利贴菜单' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitem', { name: '导出本周周报' }));

    await waitFor(() => expect(generateCurrentWeekReport).toHaveBeenCalledOnce());
    expect(exportReport).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('点击菜单外空白区域或按 Esc 会关闭菜单，点击菜单内部不会误关闭', async () => {
    renderPage();
    await screen.findByRole('list', { name: '待完成事项' });

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

  it('统一周报窗口请求失败时给出明确错误', async () => {
    const controller = renderPage();
    controller.api.window.generateCurrentWeekReport = vi
      .fn()
      .mockRejectedValue(new Error('无法打开周记窗口'));
    await screen.findByRole('list', { name: '待完成事项' });
    fireEvent.click(screen.getByRole('button', { name: '打开便利贴菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '导出本周周报' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法打开周记窗口');
  });

  it('280px 最小窗口所需控件采用可收缩/滚动布局，并具备图标中文标签', async () => {
    const { container } = render(
      <ElectronAPIProvider api={createMockElectronAPI().api}>
        <FloatingNotePage />
      </ElectronAPIProvider>,
    );
    await screen.findByRole('list', { name: '待完成事项' });
    expect(container.firstElementChild).toHaveClass('min-h-[280px]', 'overflow-hidden');
    expect(screen.getByRole('button', { name: '查看前一天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看后一天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开便利贴菜单' })).toBeInTheDocument();
  });
  it('creates a project, selects it, and adds a task with its project name', async () => {
    const controller = renderPage();
    const add = vi.spyOn(controller.api.today, 'add');
    await screen.findByRole('textbox', { name: '添加待办' });
    const open = vi.spyOn(controller.api.window, 'openProjectCreate');
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(screen.queryByRole('textbox', { name: '新项目名称' })).toBeNull();
    const snapshot = await controller.api.projects.get();
    if (!snapshot.ok) throw new Error('snapshot unavailable');
    await act(async () => {
      await controller.api.projects.create({
        name: '客户交付',
        expectedRevision: snapshot.data.revision,
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '项目管理' })).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '选择项目' })).toHaveValue(
        JSON.stringify(['客户交付']),
      ),
    );
    const input = screen.getByRole('textbox', { name: '添加待办' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '准备验收资料' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalledWith('准备验收资料', '客户交付'));
    expect(await screen.findByText('准备验收资料')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '选择项目' }), {
      target: { value: 'none' },
    });
    await waitFor(() => expect(screen.queryByText('准备验收资料')).toBeNull());
  });
  it('keeps zero-task active projects and lets their plus button select and focus without losing input', async () => {
    const controller = createMockElectronAPI();
    let snapshot = await controller.api.projects.get();
    if (!snapshot.ok) throw new Error('snapshot unavailable');
    await controller.api.projects.create({
      name: '项目2',
      expectedRevision: snapshot.data.revision,
    });
    snapshot = await controller.api.projects.get();
    if (!snapshot.ok) throw new Error('snapshot unavailable');
    await controller.api.projects.create({
      name: '已归档空项目',
      expectedRevision: snapshot.data.revision,
    });
    snapshot = await controller.api.projects.get();
    if (!snapshot.ok) throw new Error('snapshot unavailable');
    await controller.api.projects.update({
      name: '已归档空项目',
      status: 'archived',
      expectedRevision: snapshot.data.revision,
    });
    render(
      <ElectronAPIProvider api={controller.api}>
        <FloatingNotePage />
      </ElectronAPIProvider>,
    );
    const plus = await screen.findByRole('button', { name: '添加待办到：项目2' });
    const list = screen.getByRole('list', { name: '待完成事项' });
    expect(within(list).getByRole('button', { name: /项目2.*0/ })).toBeInTheDocument();
    expect(within(list).queryByText('已归档空项目')).toBeNull();
    expect(screen.queryByRole('button', { name: '整理' })).toBeNull();
    const input = screen.getByRole('textbox', { name: '添加待办' });
    fireEvent.change(input, { target: { value: '未提交的标题' } });
    fireEvent.click(plus);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('未提交的标题');
    expect(screen.getByRole('combobox', { name: '选择项目' })).toHaveValue(
      JSON.stringify(['项目2']),
    );
    const add = vi.spyOn(controller.api.today, 'add');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalledWith('未提交的标题', '项目2'));
  });
});
