const { contextBridge, ipcRenderer } = require('electron');

const port = Number(process.env.PORT || 8080);

contextBridge.exposeInMainWorld('tasklistDesktop', {
  chatUrl: `http://localhost:${port}/chat`,
  obsUrl: `http://localhost:${port}/obs`,
  startYoutubeChatStream(payload) {
    return ipcRenderer.invoke('tasklist:start-youtube-chat-stream', payload);
  },
  stopYoutubeChatStream() {
    return ipcRenderer.invoke('tasklist:stop-youtube-chat-stream');
  },
  getYoutubeChatState() {
    return ipcRenderer.invoke('tasklist:get-youtube-chat-state');
  },
  onYoutubeChatUpdate(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tasklist:youtube-chat-update', listener);
    return () => ipcRenderer.removeListener('tasklist:youtube-chat-update', listener);
  },
  startSyncServer(payload) {
    return ipcRenderer.invoke('tasklist:start-sync-server', payload);
  },
  getSyncServerStatus() {
    return ipcRenderer.invoke('tasklist:get-sync-server-status');
  },
  getYoutubeChannel(handle) {
    return ipcRenderer.invoke('tasklist:get-youtube-channel', handle);
  },
  minimizeWindow() {
    return ipcRenderer.invoke('tasklist:minimize-window');
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke('tasklist:toggle-maximize-window');
  },
  closeWindow() {
    return ipcRenderer.invoke('tasklist:close-window');
  }
});
