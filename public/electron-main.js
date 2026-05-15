import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTasklistServer } from './server-core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);
const statePath = () => join(app.getPath('userData'), 'sync-state.json');
let mainWindow = null;
let server = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 860,
    minWidth: 420,
    minHeight: 520,
    title: 'Tasklist Admin',
    backgroundColor: '#050914',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(root, 'preload.cjs'),
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadFile(join(root, 'index.html'));
}

ipcMain.handle('tasklist:start-sync-server', async (_event, payload) => {
  if (!server) {
    server = startTasklistServer({
      initialState: payload,
      port,
      root,
      statePath: statePath()
    });

    await server.ready;
  } else if (payload) {
    server.updateState(payload);
  }

  return {
    obsUrl: server.obsUrl,
    url: server.url
  };
});

ipcMain.handle('tasklist:stop-sync-server', async () => {
  if (!server) {
    return { running: false };
  }

  server.close();
  server = null;

  return { running: false };
});

app.whenReady().then(createWindow).catch(error => {
  console.error(error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  server?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
