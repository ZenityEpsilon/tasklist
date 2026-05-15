import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTasklistServer } from './server-core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);
const statePath = () => join(app.getPath('userData'), 'sync-state.json');
let mainWindow = null;
let server = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

function writeLog(message) {
  try {
    appendFileSync(join(app.getPath('userData'), 'main.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

process.on('uncaughtException', error => {
  writeLog(`uncaughtException ${error?.stack || error}`);
});

process.on('unhandledRejection', error => {
  writeLog(`unhandledRejection ${error?.stack || error}`);
});

async function createWindow() {
  writeLog(`createWindow root=${root}`);
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

  mainWindow.on('closed', () => {
    writeLog('mainWindow closed');
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    writeLog(`did-fail-load ${errorCode} ${errorDescription} ${validatedUrl}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`render-process-gone ${JSON.stringify(details)}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const indexPath = join(root, 'index.html');
  writeLog(`loadFile ${indexPath}`);
  await mainWindow.loadFile(indexPath);
  writeLog('loadFile done');
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

app.whenReady().then(() => {
  writeLog('app ready');
  return createWindow();
}).catch(error => {
  writeLog(`startup error ${error?.stack || error}`);
  console.error(error);
  app.quit();
});

app.on('activate', () => {
  writeLog('activate');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  writeLog('before-quit');
  server?.close();
});

app.on('window-all-closed', () => {
  writeLog('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
