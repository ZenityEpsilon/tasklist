const { contextBridge, ipcRenderer } = require('electron');

const port = Number(process.env.PORT || 8080);

contextBridge.exposeInMainWorld('tasklistDesktop', {
  obsUrl: `http://localhost:${port}/obs`,
  startSyncServer(payload) {
    return ipcRenderer.invoke('tasklist:start-sync-server', payload);
  },
  stopSyncServer() {
    return ipcRenderer.invoke('tasklist:stop-sync-server');
  }
});
