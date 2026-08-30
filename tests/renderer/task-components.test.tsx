// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import './setup';
import { CompletedSection } from '../../src/renderer/components/CompletedSection';
import { TaskItem } from '../../src/renderer/components/TaskItem';
import { mockTodaySnapshot } from '../../src/renderer/dev/mockElectronAPI';

describe('TaskItem', () => {
  it('支持通过 F2 内联编辑，并用 revision + line 提交特定重复任务', async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const duplicate = mockTodaySnapshot.tasks[3]!;

    render(
      <TaskItem
        completed
        completedAt={duplicate.completedAt}
        content={duplicate.content}
        details={duplicate.details}
        locator={duplicate.locator}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: '任务内容：重复记录' }), { key: 'F2' });
    const input = screen.getByRole('textbox', { name: '编辑任务：重复记录' });
    fireEvent.change(input, { target: { value: '只编辑第二条重复记录' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        { line: 4, revision: 'today-r1' },
        '只编辑第二条重复记录',
        '',
        '09:30',
      ),
    );
  });

  it('Esc 取消编辑且不会提交', () => {
    const onEdit = vi.fn();
    render(
      <TaskItem
        completed={false}
        content="准备周会"
        details=""
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
      />,
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: '任务内容：准备周会' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '编辑任务：准备周会' }), {
      key: 'Escape',
    });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('有详情时可独立展开和收起，并按纯文本保留换行', () => {
    render(
      <TaskItem
        completed={false}
        content="带说明的任务"
        details={'第一行\n- [ ] 只是说明'}
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.queryByRole('region', { name: '任务详情：带说明的任务' })).toBeNull();
    const toggle = screen.getByRole('button', { name: '展开任务详情：带说明的任务' });
    const collapsedIconPath = toggle.querySelector('path')?.getAttribute('d');
    expect(toggle.querySelector('svg')).not.toHaveClass('rotate-180');
    fireEvent.click(toggle);
    const expandedToggle = screen.getByRole('button', { name: '收起任务详情：带说明的任务' });
    expect(expandedToggle.querySelector('path')?.getAttribute('d')).toBe(collapsedIconPath);
    expect(expandedToggle.querySelector('svg')).toHaveClass('h-4', 'w-4', 'rotate-180');
    expect(screen.getByRole('region', { name: '任务详情：带说明的任务' })).toHaveTextContent(
      '第一行 - [ ] 只是说明',
    );
    fireEvent.click(expandedToggle);
    expect(screen.queryByRole('region', { name: '任务详情：带说明的任务' })).toBeNull();
  });

  it('支持用 Ctrl+Enter 保存多行详情并清空已有详情', async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    render(
      <TaskItem
        completed={false}
        content="编辑说明"
        details="原说明"
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: '任务内容：编辑说明' }));
    const detailsInput = screen.getByRole('textbox', { name: '编辑任务详情：编辑说明' });
    fireEvent.change(detailsInput, { target: { value: '第一行\n\n1. 普通文本' } });
    fireEvent.keyDown(detailsInput, { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        { line: 1, revision: 'r1' },
        '编辑说明',
        '第一行\n\n1. 普通文本',
        undefined,
      ),
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: '任务内容：编辑说明' }));
    fireEvent.change(screen.getByRole('textbox', { name: '编辑任务详情：编辑说明' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(onEdit).toHaveBeenLastCalledWith(
        { line: 1, revision: 'r1' },
        '编辑说明',
        '',
        undefined,
      ),
    );
  });

  it('按设置常显添加日期，并为旧任务显示未知日期', () => {
    const { rerender } = render(
      <TaskItem
        addedDate="2026-08-10"
        addedDateDisplay="always"
        completed={false}
        content="有日期"
        details=""
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('添加 08-10')).toBeVisible();

    rerender(
      <TaskItem
        addedDateDisplay="always"
        completed={false}
        content="旧任务"
        details=""
        locator={{ line: 2, revision: 'r2' }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('添加日期未知')).toBeVisible();
  });

  it('悬停模式使用浅色行内占位，不以绝对定位覆盖编辑框', () => {
    render(
      <TaskItem
        addedDate="2026-08-10"
        completed={false}
        content="可编辑任务"
        details=""
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const addedDate = screen.getByText('添加 08-10');
    expect(addedDate).toHaveClass('added-date', 'invisible', 'group-hover:visible');
    expect(addedDate).not.toHaveClass('absolute', 'bg-stone-800', 'text-white');

    fireEvent.doubleClick(screen.getByRole('button', { name: '任务内容：可编辑任务' }));
    expect(screen.getByRole('checkbox', { name: '完成任务：可编辑任务' })).toHaveClass('mt-7');
    expect(screen.getByRole('textbox', { name: '编辑任务：可编辑任务' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '编辑任务详情：可编辑任务' })).toBeInTheDocument();
  });
});

describe('CompletedSection', () => {
  it('折叠时最多显示三项，展开后显示全部', () => {
    const completed = mockTodaySnapshot.tasks.filter((task) => task.completed);
    const props = {
      tasks: completed,
      disabled: false,
      onToggleExpanded: vi.fn(),
      onToggle: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    };
    const { rerender } = render(<CompletedSection {...props} expanded={false} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('另有 2 项已折叠')).toBeInTheDocument();
    expect(screen.queryByText('补充测试场景')).not.toBeInTheDocument();

    rerender(<CompletedSection {...props} expanded />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('补充测试场景')).toBeInTheDocument();
  });
});
