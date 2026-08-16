// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import './setup';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';
import { WeeklyPage } from '../../src/renderer/pages/WeeklyPage';
import { ElectronAPIProvider } from '../../src/renderer/state/providers';

function renderPage(scenario: Parameters<typeof createMockElectronAPI>[0] = 'default') {
  const controller = createMockElectronAPI(scenario);
  const renderResult = render(
    <ElectronAPIProvider api={controller.api}>
      <WeeklyPage />
    </ElectronAPIProvider>,
  );
  return { ...controller, ...renderResult };
}

describe('WeeklyPage', () => {
  it('按日分组展示重复任务和实际总数', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '周三' })).toBeInTheDocument();
    expect(screen.getAllByText('重复记录')).toHaveLength(2);
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看上一周' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '生成周报草稿' })).toBeEnabled();
  });

  it('空周显示空状态', async () => {
    renderPage('empty-week');
    expect(await screen.findByText('本周暂无完成记录')).toBeInTheDocument();
    expect(screen.getByText('0', { selector: 'strong' })).toBeInTheDocument();
  });

  it('导出取消是正常状态，不展示失败', async () => {
    renderPage('export-cancelled');
    const button = await screen.findByRole('button', { name: '生成周报草稿' });
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole('button', { name: '选择位置并保存' }));

    expect(await screen.findByLabelText('导出已取消')).toHaveTextContent('未创建任何文件');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.queryByLabelText('导出已取消')).not.toBeInTheDocument();
  });

  it('切换历史周后只响应所选周事件，忽略 today 与其他周事件', async () => {
    const controller = renderPage();
    const getWeek = vi.spyOn(controller.api.week, 'get');
    await screen.findByRole('heading', { name: '周三' });
    fireEvent.click(screen.getByRole('button', { name: '查看上一周' }));
    await screen.findByRole('heading', { name: /2026 年第 32 周/ });
    const callsAfterNavigation = getWeek.mock.calls.length;

    controller.emit({ scope: 'today', reason: 'external-edit' });
    controller.emit({ scope: 'config', reason: 'external-edit' });
    controller.emit({ scope: 'week', isoYear: 2026, isoWeek: 33, reason: 'external-edit' });
    await Promise.resolve();
    expect(getWeek).toHaveBeenCalledTimes(callsAfterNavigation);

    controller.emit({ scope: 'week', isoYear: 2026, isoWeek: 32, reason: 'external-edit' });
    await screen.findByRole('heading', { name: /2026 年第 32 周/ });
    expect(getWeek).toHaveBeenCalledTimes(callsAfterNavigation + 1);
  });

  it('当前周响应 today 变化，并合并 watcher 事件风暴', async () => {
    const controller = renderPage();
    const getWeek = vi.spyOn(controller.api.week, 'get');
    await screen.findByRole('heading', { name: '周三' });
    const initialCalls = getWeek.mock.calls.length;
    for (let index = 0; index < 8; index += 1) {
      controller.emit({ scope: 'today', reason: 'app-write' });
    }
    await screen.findByRole('heading', { name: '周三' });
    await Promise.resolve();
    expect(getWeek.mock.calls.length).toBeGreaterThan(initialCalls);
    expect(getWeek.mock.calls.length).toBeLessThanOrEqual(initialCalls + 2);
  });

  it('导出成功后可打开文件、定位文件并关闭结果', async () => {
    const controller = renderPage();
    const generateReport = vi.spyOn(controller.api.report, 'generate');
    const saveDraft = vi.spyOn(controller.api.report, 'saveDraft');
    const openLast = vi.spyOn(controller.api.report, 'openLast');
    const revealLast = vi.spyOn(controller.api.report, 'revealLast');
    const button = await screen.findByRole('button', { name: '生成周报草稿' });
    fireEvent.click(button);
    expect(await screen.findByLabelText('周报草稿内容')).toHaveValue('模拟生成的周报内容');
    fireEvent.click(screen.getByRole('button', { name: '选择位置并保存' }));

    expect(await screen.findByLabelText('导出成功')).toHaveTextContent('周报-2026年第33周.txt');
    expect(screen.getByLabelText('导出成功')).toHaveTextContent('文件不会自动打开');
    expect(generateReport).toHaveBeenCalledWith(
      expect.objectContaining({ isoYear: 2026, isoWeek: 33 }),
    );
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ content: '模拟生成的周报内容' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }));
    fireEvent.click(screen.getByRole('button', { name: '打开所在文件夹' }));
    expect(openLast).toHaveBeenCalledOnce();
    expect(revealLast).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.queryByLabelText('导出成功')).not.toBeInTheDocument();
  });

  it('IO_ERROR 显示错误和重试入口', async () => {
    renderPage('io-error');
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读写本地文件');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('导出 failed 显示明确错误但不出现打开操作', async () => {
    const controller = renderPage();
    controller.api.report.saveDraft = vi.fn().mockResolvedValue({
      status: 'failed',
      message: '保存位置不可写',
    });
    const button = await screen.findByRole('button', { name: '生成周报草稿' });
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole('button', { name: '选择位置并保存' }));

    expect(await screen.findByLabelText('导出失败')).toHaveTextContent('保存位置不可写');
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开所在文件夹' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByLabelText('导出失败')).not.toBeInTheDocument();
  });

  it('窄窗口布局使用可收缩容器且主要图标按钮都有中文标签', async () => {
    const { container } = renderPage();
    await screen.findByRole('heading', { name: '周三' });

    expect(container.firstElementChild).toHaveClass('min-w-0', 'overflow-x-hidden');
    expect(screen.getByRole('button', { name: '查看上一周' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看下一周' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成周报草稿' })).toBeInTheDocument();
  });
});
