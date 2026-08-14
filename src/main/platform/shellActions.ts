import { shell } from 'electron';

export interface ShellActions {
  openDataDirectory(): Promise<void>;
}

export const createShellActions = (dataDirectory: string): ShellActions => ({
  async openDataDirectory(): Promise<void> {
    // 路径由 Main 启动时解析，Renderer 不能传入任意文件系统目标。
    const error = await shell.openPath(dataDirectory);
    if (error) {
      throw new Error(error);
    }
  },
});
