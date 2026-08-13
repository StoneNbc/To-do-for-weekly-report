import { shell } from 'electron';

export interface ShellActions {
  openDataDirectory(): Promise<void>;
}

export const createShellActions = (dataDirectory: string): ShellActions => ({
  async openDataDirectory(): Promise<void> {
    const error = await shell.openPath(dataDirectory);
    if (error) {
      throw new Error(error);
    }
  },
});
