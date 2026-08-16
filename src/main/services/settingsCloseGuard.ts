/**
 * 保存设置窗口的关闭状态，保证 Renderer 不能自行绕过未保存修改提醒。
 * 真正退出应用时不拦截，由 AppLifecycle 统一排空写入并关闭窗口。
 */
export class SettingsCloseGuard {
  #dirty = false;
  #discardOnce = false;

  setDirty(dirty: boolean): void {
    this.#dirty = dirty;
  }

  shouldPreventClose(isQuitting: boolean): boolean {
    if (isQuitting || !this.#dirty) return false;
    if (this.#discardOnce) {
      this.#discardOnce = false;
      return false;
    }
    return true;
  }

  allowDiscardOnce(): void {
    this.#discardOnce = true;
  }

  reset(): void {
    this.#dirty = false;
    this.#discardOnce = false;
  }
}
