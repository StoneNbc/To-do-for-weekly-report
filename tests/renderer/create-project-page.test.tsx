// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import './setup';
import { CreateProjectPage } from '../../src/renderer/pages/CreateProjectPage';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';
import { ElectronAPIProvider } from '../../src/renderer/state/providers';

describe('CreateProjectPage', () => {
  it('creates through the project API and closes only after persistence succeeds', async () => {
    const { api } = createMockElectronAPI();
    const create = vi.spyOn(api.projects, 'create');
    const close = vi.spyOn(api.window, 'closeProjectCreate');
    render(
      <ElectronAPIProvider api={api}>
        <CreateProjectPage />
      </ElectronAPIProvider>,
    );
    const input = screen.getByRole('textbox', { name: '新项目名称' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '客户交付' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '创建' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith({
      name: '客户交付',
      color: '#22C55E',
      expectedRevision: expect.any(String),
    });
  });

  it('retains the name and stays open on conflict; cancelling does not create a project', async () => {
    const { api } = createMockElectronAPI();
    const create = vi
      .spyOn(api.projects, 'create')
      .mockResolvedValue({
        ok: false,
        error: { code: 'FILE_CHANGED', message: '目录已变化，请重试' },
      });
    const close = vi.spyOn(api.window, 'closeProjectCreate');
    render(
      <ElectronAPIProvider api={api}>
        <CreateProjectPage />
      </ElectronAPIProvider>,
    );
    const input = screen.getByRole('textbox', { name: '新项目名称' });
    fireEvent.change(input, { target: { value: '保留输入' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '创建' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('目录已变化');
    expect(input).toHaveValue('保留输入');
    expect(close).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(close).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });
});
