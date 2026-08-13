// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import './setup';
import { ExportResultToast } from '../../src/renderer/components/ExportResultToast';

describe('ExportResultToast', () => {
  it('saved 提供三个键盘可聚焦操作且不自动执行任何一个', () => {
    const open = vi.fn();
    const reveal = vi.fn();
    const dismiss = vi.fn();
    render(
      <ExportResultToast
        onDismiss={dismiss}
        onOpen={open}
        onReveal={reveal}
        result={{ status: 'saved', path: '/tmp/周报.txt' }}
      />,
    );

    const actions = screen.getAllByRole('button');
    expect(actions.map((button) => button.textContent)).toEqual(['打开文件', '打开所在文件夹', '完成']);
    expect(open).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(actions[0]!, { key: 'Tab' });
    expect(actions[0]).toHaveClass('focus-visible:ring-2');
  });

  it('cancelled 和 failed 只提供关闭操作', () => {
    const dismiss = vi.fn();
    const { rerender } = render(
      <ExportResultToast
        onDismiss={dismiss}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        result={{ status: 'cancelled' }}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);

    rerender(
      <ExportResultToast
        onDismiss={dismiss}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        result={{ status: 'failed', message: '写入失败' }}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('写入失败');
  });
});
