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
        locator={duplicate.locator}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: '编辑任务：重复记录' }), { key: 'F2' });
    const input = screen.getByRole('textbox', { name: '编辑任务：重复记录' });
    fireEvent.change(input, { target: { value: '只编辑第二条重复记录' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(
      { line: 4, revision: 'today-r1' },
      '只编辑第二条重复记录',
      '09:30',
    ));
  });

  it('Esc 取消编辑且不会提交', () => {
    const onEdit = vi.fn();
    render(
      <TaskItem
        completed={false}
        content="准备周会"
        locator={{ line: 1, revision: 'r1' }}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
      />,
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: '编辑任务：准备周会' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onEdit).not.toHaveBeenCalled();
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
