import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { IPC } from './ipc/channels';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    minWidth: 280,
    minHeight: 280,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(`${devUrl}?view=note`);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: { view: 'note' },
    });
  }
};

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(async () => {
    ipcMain.handle(IPC.healthCheck, () => ({ status: 'ok' as const }));
    await createWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

}
