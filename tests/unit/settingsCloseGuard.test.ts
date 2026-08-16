import { describe, expect, it } from 'vitest';
import { SettingsCloseGuard } from '../../src/main/services/settingsCloseGuard';

describe('SettingsCloseGuard', () => {
  it('只拦截存在未保存修改的普通关闭请求', () => {
    const guard = new SettingsCloseGuard();

    expect(guard.shouldPreventClose(false)).toBe(false);
    guard.setDirty(true);
    expect(guard.shouldPreventClose(false)).toBe(true);
    expect(guard.shouldPreventClose(true)).toBe(false);
  });

  it('用户确认放弃后只放行一次关闭，并可在新窗口重置', () => {
    const guard = new SettingsCloseGuard();
    guard.setDirty(true);
    guard.allowDiscardOnce();

    expect(guard.shouldPreventClose(false)).toBe(false);
    expect(guard.shouldPreventClose(false)).toBe(true);
    guard.reset();
    expect(guard.shouldPreventClose(false)).toBe(false);
  });
});
