import { clipboard, shell } from 'electron';

export interface ShellActions {
  openDataDirectory(): Promise<void>;
  openLogsDirectory(): Promise<void>;
  copyDataDirectoryPath(): void;
}

const openKnownDirectory = async (directory: string): Promise<void> => {
  const error = await shell.openPath(directory);
  if (error) throw Object.assign(new Error(error), { code: 'IO_ERROR' as const });
};

export const createShellActions = (dataDirectory: string, logsDirectory: string): ShellActions => ({
  async openDataDirectory(): Promise<void> {
    // 路径由 Main 启动时解析，Renderer 不能传入任意文件系统目标。
    await openKnownDirectory(dataDirectory);
  },
  async openLogsDirectory(): Promise<void> {
    await openKnownDirectory(logsDirectory);
  },
  copyDataDirectoryPath(): void {
    // 不接受 Renderer 文本，剪贴板内容只能是启动时解析的已知数据目录。
    clipboard.writeText(dataDirectory);
  },
});
