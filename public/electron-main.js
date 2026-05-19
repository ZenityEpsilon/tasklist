import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getYoutubeChannelInfo, startTasklistServer } from './server-core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);
const statePath = () => {
  const currentPath = join(app.getPath('userData'), 'sync-state.json');
  const legacyPath = join(app.getPath('appData'), 'Electron', 'sync-state.json');

  try {
    if (shouldUseLegacyState(currentPath, legacyPath)) {
      copyFileSync(legacyPath, currentPath);
      writeLog(`migrated legacy sync state from ${legacyPath}`);
    }
  } catch (error) {
    writeLog(`legacy sync state migration failed ${error?.stack || error}`);
  }

  return currentPath;
};
let mainWindow = null;
let server = null;
let youtubeChatScraperWindow = null;
let youtubeChatScraperTimer = null;
let youtubeChatScraperState = {
  connected: false,
  error: '',
  handle: '',
  live: false,
  messages: [],
  nextContinuation: '',
  title: '',
  url: '',
  videoId: ''
};

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');

function writeLog(message) {
  try {
    appendFileSync(join(app.getPath('userData'), 'main.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

function textFrom(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    if (typeof value.simpleText === 'string') return value.simpleText.trim();
    if (Array.isArray(value.runs)) return textFromRuns(value.runs);
    if (typeof value.content === 'string') return value.content.trim();
  }
  return '';
}

function textFromRuns(runs) {
  if (!Array.isArray(runs)) return '';
  return runs.map(run => run?.text || '').join('').trim();
}

function partsFromRuns(runs) {
  if (!Array.isArray(runs)) return [];

  return runs.map(run => {
    if (typeof run?.text === 'string') {
      return { type: 'text', text: run.text };
    }

    const emoji = run?.emoji || null;
    const url = lastThumbnail(emoji?.image?.thumbnails);
    const alt = textFrom(emoji?.shortcuts?.[0]) || textFrom(emoji?.searchTerms?.[0]) || textFrom(emoji?.emojiId) || 'emoji';

    return url ? { type: 'emoji', url, alt } : null;
  }).filter(Boolean);
}

function textFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.map(part => part?.type === 'emoji' ? (part.alt || '') : (part?.text || '')).join('').trim();
}

function firstNonEmptyParts(...candidates) {
  return candidates.find(parts => Array.isArray(parts) && parts.length > 0) || [];
}

function lastThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
  const last = thumbnails[thumbnails.length - 1];
  return String(last?.url || '').trim();
}

function broadcastYoutubeChatState() {
  if (server?.updateChatState) {
    try {
      server.updateChatState(youtubeChatScraperState);
    } catch (error) {
      writeLog(`updateChatState failed ${error?.stack || error}`);
    }
  }

  for (const targetWindow of [mainWindow]) {
    if (!targetWindow || targetWindow.isDestroyed()) continue;
    targetWindow.webContents.send('tasklist:youtube-chat-update', youtubeChatScraperState);
  }
}

function updateYoutubeChatState(patch) {
  youtubeChatScraperState = {
    ...youtubeChatScraperState,
    ...patch,
    messages: Array.isArray(patch?.messages) ? patch.messages : youtubeChatScraperState.messages
  };
  broadcastYoutubeChatState();
}

function closeYoutubeChatScraper() {
  if (youtubeChatScraperTimer) {
    clearInterval(youtubeChatScraperTimer);
    youtubeChatScraperTimer = null;
  }

  if (youtubeChatScraperWindow) {
    try {
      youtubeChatScraperWindow.destroy();
    } catch {}
    youtubeChatScraperWindow = null;
  }

  youtubeChatScraperState = {
    connected: false,
    error: '',
    handle: '',
    live: false,
    messages: [],
    title: '',
    url: '',
    videoId: ''
  };
  broadcastYoutubeChatState();
}

function parseYoutubeLiveChatItem(item) {
  const author = textFrom(item?.liveChatTextMessageRenderer?.authorName?.simpleText)
    || textFrom(item?.liveChatPaidMessageRenderer?.authorName?.simpleText)
    || textFrom(item?.liveChatMembershipItemRenderer?.authorName?.simpleText)
    || 'User';
  const parts = firstNonEmptyParts(
    partsFromRuns(item?.liveChatTextMessageRenderer?.message?.runs),
    partsFromRuns(item?.liveChatPaidMessageRenderer?.message?.runs),
    partsFromRuns(item?.liveChatMembershipItemRenderer?.headerSubtext?.runs)
  );
  const message = textFromParts(parts);
  const timestampUsec = Number(item?.liveChatTextMessageRenderer?.timestampUsec
    || item?.liveChatPaidMessageRenderer?.timestampUsec
    || item?.liveChatMembershipItemRenderer?.timestampUsec
    || 0);
  const avatar = lastThumbnail(item?.liveChatTextMessageRenderer?.authorPhoto?.thumbnails)
    || lastThumbnail(item?.liveChatPaidMessageRenderer?.authorPhoto?.thumbnails)
    || '';

  if (!message) return null;

  return {
    id: item?.liveChatTextMessageRenderer?.id
      || item?.liveChatPaidMessageRenderer?.id
      || item?.liveChatMembershipItemRenderer?.id
      || `${author}-${timestampUsec || Date.now()}`,
    author,
    message,
    parts,
    avatar,
    timestampUsec
  };
}

function extractYoutubeLiveChatItems(payload) {
  const liveChatContinuation = payload?.continuationContents?.liveChatContinuation || null;
  const actions = liveChatContinuation?.actions || [];
  const items = [];

  for (const action of actions) {
    const parsed = parseYoutubeLiveChatItem(action?.addChatItemAction?.item);
    if (parsed) items.push(parsed);
  }

  const continuationItem = liveChatContinuation?.continuations?.[0] || null;
  const nextContinuation = continuationItem?.invalidationContinuationData?.continuation
    || continuationItem?.timedContinuationData?.continuation
    || continuationItem?.reloadContinuationData?.continuation
    || continuationItem?.playerSeekContinuationData?.continuation
    || '';

  return {
    items,
    nextContinuation
  };
}

async function startYoutubeChatScraper(options = {}) {
  const handle = String(options.handle || '').trim();
  const explicitVideoId = String(options.videoId || '').trim();

  if (!handle && !explicitVideoId) {
    throw new Error('YouTube handle or videoId is required');
  }

  closeYoutubeChatScraper();

  const channel = handle ? await getYoutubeChannelInfo(handle).catch(() => null) : null;
  const channelStream = channel?.currentLiveStream?.id === explicitVideoId
    ? channel.currentLiveStream
    : null;
  const stream = explicitVideoId
    ? (channelStream || { id: explicitVideoId, title: '' })
    : (channel?.currentLiveStream || null);

  if (!stream?.id) {
    updateYoutubeChatState({
      connected: false,
      error: 'Стрим ещё не начат',
      handle,
      live: false,
      messages: [],
      title: '',
      url: '',
      videoId: ''
    });
    return youtubeChatScraperState;
  }

  const chatContinuation = stream.chatContinuation || '';
  const chatContext = stream.chatContext || {};
  const chatUrl = chatContinuation
    ? `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(chatContinuation)}&dark_theme=true&authuser=0&pageId=${encodeURIComponent(stream.id)}`
    : `https://www.youtube.com/live_chat?v=${encodeURIComponent(stream.id)}&embed_domain=localhost&dark_theme=1`;
  let currentContinuation = chatContinuation;

  youtubeChatScraperWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  youtubeChatScraperWindow.on('closed', () => {
    youtubeChatScraperWindow = null;
  });

  await youtubeChatScraperWindow.loadURL(chatUrl);

  const scrapeOnce = async () => {
    if (!youtubeChatScraperWindow || youtubeChatScraperWindow.isDestroyed()) return;

    try {
      const domMessages = await youtubeChatScraperWindow.webContents.executeJavaScript(`(() => {
        const text = node => (node?.textContent || '').replace(/\\s+/g, ' ').trim();
        const messageParts = node => {
          if (!node) return [];

          const output = [];
          const appendText = value => {
            const textValue = String(value || '').replace(/\\s+/g, ' ');
            if (textValue.trim()) output.push({ type: 'text', text: textValue });
          };
          const walk = item => {
            if (!item) return;

            if (item.nodeType === Node.TEXT_NODE) {
              appendText(item.textContent);
              return;
            }

            if (item.nodeType !== Node.ELEMENT_NODE) return;

            if (item.tagName === 'IMG') {
              const url = item.currentSrc || item.src || '';
              const alt = item.alt || item.getAttribute('shared-tooltip-text') || 'emoji';
              if (url) output.push({ type: 'emoji', url, alt });
              return;
            }

            item.childNodes.forEach(walk);
          };

          node.childNodes.forEach(walk);
          return output;
        };
        const textFromParts = parts => parts.map(part => part.type === 'emoji' ? (part.alt || '') : (part.text || '')).join('').replace(/\\s+/g, ' ').trim();
        const nodes = Array.from(document.querySelectorAll(
          'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer'
        ));

        return nodes.map((node, index) => {
          const escapeRegExp = value => String(value || '').replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
          const cleanAuthor = value => String(value || '')
            .replace(/^\\s*\\d{1,2}:\\d{2}(?::\\d{2})?\\s*/, '')
            .replace(/^\\s*\\d+\\s+/, '')
            .trim();
          const fullText = text(node);
          const authorNode = node.querySelector('#author-name, yt-live-chat-author-chip #author-name');
          const baseAuthor = cleanAuthor(text(authorNode))
            || 'User';
          const authorBadge = fullText.match(/#\\d+/)?.[0] || '';
          const author = authorBadge && !baseAuthor.includes(authorBadge)
            ? [baseAuthor, authorBadge].join(' ')
            : baseAuthor;
          const messageNode = node.querySelector('#message')
            || node.querySelector('yt-formatted-string#message')
            || node.querySelector('#header-subtext');
          const parts = messageParts(messageNode);
          const rawMessage = textFromParts(parts)
            || fullText;
          const message = rawMessage
            .replace(new RegExp('^' + escapeRegExp(baseAuthor) + '\\\\s*', 'u'), '')
            .replace(/^\\d{1,2}:\\d{2}(?:\\s?[AP]M)?\\s*/iu, '')
            .replace(new RegExp('^' + escapeRegExp(baseAuthor) + '\\\\s*', 'u'), '')
            .replace(/^#\\d+\\s*/, '')
            .trim();
          const timestamp = text(node.querySelector('#timestamp'));
          const avatar = node.querySelector('#author-photo img, img#img')?.src || '';
          const id = node.id || node.getAttribute('data-id') || [author, message, timestamp, index].join('-');

          return {
            id,
            author,
            message,
            parts: parts.length > 0 ? parts : [{ type: 'text', text: message }],
            avatar,
            timestampUsec: Date.now() * 1000
          };
        }).filter(item => item.message);
      })()`, true).catch(() => []);

      if (Array.isArray(domMessages) && domMessages.length > 0) {
        const currentMessages = Array.isArray(youtubeChatScraperState.messages) ? youtubeChatScraperState.messages : [];
        const merged = [];
        const seen = new Set();

        for (const message of [...currentMessages, ...domMessages]) {
          if (!message || !message.id || seen.has(message.id)) continue;
          seen.add(message.id);
          merged.push(message);
        }

        youtubeChatScraperState = {
          connected: true,
          error: '',
          handle,
          live: true,
          messages: merged.slice(-80),
          nextContinuation: currentContinuation,
          title: stream.title || '',
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(stream.id)}`,
          videoId: stream.id
        };
        broadcastYoutubeChatState();
        return;
      }

      const payload = await youtubeChatScraperWindow.webContents.executeJavaScript(`(async () => {
        let continuation = ${JSON.stringify(currentContinuation)};
        const videoId = ${JSON.stringify(stream.id)};
        const context = ${JSON.stringify(chatContext)};
        const clientVersion = context.clientVersion || '2.20260518.01.00';
        const browserVersion = context.browserVersion || '120.0.0.0';
        const readContinuation = value => {
          if (!value || typeof value !== 'object') return '';

          if (typeof value.continuation === 'string' && value.continuation.length > 20) {
            return value.continuation;
          }

          for (const item of Array.isArray(value) ? value : Object.values(value)) {
            const found = readContinuation(item);
            if (found) return found;
          }

          return '';
        };

        if (!continuation) {
          continuation = readContinuation(window.ytInitialData)
            || readContinuation(window.ytInitialPlayerResponse)
            || '';
        }

        if (!continuation) {
          return {
            ok: false,
            status: 404,
            statusText: 'Chat continuation not found',
            data: null
          };
        }

        const body = {
          context: {
            client: {
              hl: 'uk',
              gl: 'UA',
              remoteHost: context.remoteHost || '127.0.0.1',
              deviceMake: '',
              deviceModel: '',
              visitorData: context.visitorData || '',
              userAgent: context.userAgent || navigator.userAgent,
              clientName: 'WEB',
              clientVersion,
              osName: 'Windows',
              osVersion: '10.0',
              platform: 'DESKTOP',
              clientFormFactor: 'UNKNOWN_FORM_FACTOR',
              configInfo: context.appInstallData ? { appInstallData: context.appInstallData } : undefined,
              userInterfaceTheme: 'USER_INTERFACE_THEME_DARK',
              timeZone: context.timeZone || 'Europe/Kiev',
              browserName: context.browserName || 'Chrome',
              browserVersion,
              acceptHeader: context.acceptHeader || '*/*',
              deviceExperimentId: context.deviceExperimentId || '',
              rolloutToken: context.rolloutToken || '',
              screenWidthPoints: context.screenWidthPoints || 400,
              screenHeightPoints: context.screenHeightPoints || 1704,
              screenPixelDensity: context.screenPixelDensity || 1,
              screenDensityFloat: context.screenDensityFloat || 1,
              utcOffsetMinutes: context.utcOffsetMinutes || 180,
              connectionType: context.connectionType || 'CONN_CELLULAR_4G',
              memoryTotalKbytes: context.memoryTotalKbytes || '32000000',
              mainAppWebInfo: {
                graftUrl: 'https://www.youtube.com/live_chat?continuation=' + encodeURIComponent(continuation) + '&dark_theme=true&authuser=0&pageId=' + encodeURIComponent(videoId),
                webDisplayMode: context.webDisplayMode || 'WEB_DISPLAY_MODE_BROWSER',
                isWebNativeShareAvailable: context.isWebNativeShareAvailable ?? true
              },
              originalUrl: 'https://www.youtube.com/live_chat?continuation=' + encodeURIComponent(continuation) + '&dark_theme=true&authuser=0&pageId=' + encodeURIComponent(videoId)
            }
          },
          continuation,
          request: {
            useSsl: true,
            internalExperimentFlags: [],
            consistencyTokenJars: []
          },
          webClientInfo: {
            isDocumentHidden: false
          },
          adSignalsInfo: {
            params: [
              { key: 'dt', value: String(Date.now()) },
              { key: 'flash', value: '0' },
              { key: 'frm', value: '1' },
              { key: 'u_tz', value: String(context.utcOffsetMinutes || 180) },
              { key: 'u_his', value: '2' },
              { key: 'u_h', value: '1920' },
              { key: 'u_w', value: '1080' },
              { key: 'u_ah', value: '1872' },
              { key: 'u_aw', value: '1080' },
              { key: 'u_cd', value: '32' },
              { key: 'bc', value: '31' },
              { key: 'bih', value: String(context.screenHeightPoints || 1762) },
              { key: 'biw', value: String(context.screenWidthPoints || 400) },
              { key: 'brdim', value: '-1080,-260,-1080,-260,1080,-260,1080,1872,400,1704' },
              { key: 'vis', value: '1' },
              { key: 'wgl', value: 'true' },
              { key: 'ca_type', value: 'image' }
            ]
          },
          invalidationPayloadLastPublishAtUsec: String(context.invalidationPayloadLastPublishAtUsec || '')
        };
        const response = await fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/live_chat?continuation=' + encodeURIComponent(continuation) + '&dark_theme=true&authuser=0&pageId=' + encodeURIComponent(videoId),
            'User-Agent': context.userAgent || navigator.userAgent,
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': clientVersion,
            'X-Goog-Visitor-Id': context.visitorData || ''
          },
          body: JSON.stringify(body)
        });
        const text = await response.text();
        let data = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch (parseError) {
          return {
            ok: false,
            status: response.status,
            statusText: response.statusText,
            __error: 'YouTube вернул невалидный JSON: ' + (parseError?.message || 'parse error'),
            __raw: text.slice(0, 500)
          };
        }

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data
        };
      })()`, true);

      if (!payload || payload.__error) {
        throw new Error(payload?.__error || 'YouTube вернул пустой ответ');
      }

      if (!payload.ok) {
        const reason = payload?.data?.error?.message || payload?.statusText || `HTTP ${payload.status}`;
        throw new Error(reason);
      }

      const extracted = extractYoutubeLiveChatItems(payload?.data || payload);
      const nextMessages = extracted.items;
      const currentMessages = Array.isArray(youtubeChatScraperState.messages) ? youtubeChatScraperState.messages : [];
      const merged = [];
      const seen = new Set();

      for (const message of [...currentMessages, ...nextMessages]) {
        if (!message || !message.id || seen.has(message.id)) continue;
        seen.add(message.id);
        merged.push(message);
      }

      const nextContinuation = extracted.nextContinuation || currentContinuation;
      youtubeChatScraperState = {
        connected: true,
        error: '',
        handle,
        live: true,
        messages: merged.slice(-80),
        nextContinuation,
        title: stream.title || '',
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(stream.id)}`,
        videoId: stream.id
      };
      broadcastYoutubeChatState();
      if (nextContinuation && nextContinuation !== currentContinuation) {
        currentContinuation = nextContinuation;
      }
      } catch (error) {
      const errorText = String(error?.message || error || '').trim();
      let normalizedError = errorText || 'Не удалось прочитать чат';

      if (/invalid json/i.test(errorText)) {
        normalizedError = 'YouTube вернул невалидный JSON';
      } else if (/429|rate limit|too many requests/i.test(errorText)) {
        normalizedError = 'Слишком много запросов к YouTube';
      } else if (/403|forbidden|unauthorized/i.test(errorText)) {
        normalizedError = 'Нет доступа к чату';
      } else if (/404|not found/i.test(errorText)) {
        normalizedError = 'Чат не найден';
      } else if (/failed to fetch|net::err|network/i.test(errorText)) {
        normalizedError = 'Сетевая ошибка при загрузке чата';
      } else if (/stream not started|no live stream/i.test(errorText)) {
        normalizedError = 'Стрим ещё не начат';
      }

      youtubeChatScraperState = {
        ...youtubeChatScraperState,
        connected: false,
        error: normalizedError
      };
      broadcastYoutubeChatState();
    }
  };

  await scrapeOnce();
  youtubeChatScraperTimer = setInterval(scrapeOnce, 1000);

  youtubeChatScraperState = {
    connected: true,
    error: '',
    handle,
    live: Boolean(stream?.isLive || chatContinuation),
    messages: youtubeChatScraperState.messages || [],
    nextContinuation: currentContinuation,
    title: stream.title || '',
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(stream.id)}`,
    videoId: stream.id
  };
  broadcastYoutubeChatState();

  return youtubeChatScraperState;
}

function getYoutubeChatState() {
  return youtubeChatScraperState;
}

function shouldUseLegacyState(currentPath, legacyPath) {
  if (!existsSync(legacyPath)) return false;
  if (!existsSync(currentPath)) return true;

  try {
    const current = JSON.parse(readFileSync(currentPath, 'utf8'));
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
    const currentRevision = Number(current?.revision) || 0;
    const legacyRevision = Number(legacy?.revision) || 0;

    return legacyRevision > currentRevision;
  } catch {
    return false;
  }
}

process.on('uncaughtException', error => {
  writeLog(`uncaughtException ${error?.stack || error}`);
});

process.on('unhandledRejection', error => {
  writeLog(`unhandledRejection ${error?.stack || error}`);
});

async function createWindow() {
  writeLog(`createWindow root=${root}`);
  writeLog(`versions electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node}`);
  writeLog(`platform ${process.platform} ${process.arch} os=${os.release()}`);
  mainWindow = new BrowserWindow({
    width: 560,
    height: 860,
    minWidth: 420,
    minHeight: 520,
    title: 'Tasklist Admin',
    backgroundColor: '#050914',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(root, 'preload.cjs'),
      sandbox: false
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

async function ensureSyncServer(payload = null) {
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
    chatUrl: server.chatUrl,
    obsUrl: server.obsUrl,
    running: true,
    url: server.url
  };
}

ipcMain.handle('tasklist:start-sync-server', async (_event, payload) => {
  return ensureSyncServer(payload);
});

ipcMain.handle('tasklist:get-sync-server-status', async () => {
  try {
    return await ensureSyncServer();
  } catch {
    return {
      chatUrl: `http://localhost:${port}/chat`,
      obsUrl: `http://localhost:${port}/obs`,
      running: false,
      url: `http://localhost:${port}/`
    };
  }
});

ipcMain.handle('tasklist:get-youtube-channel', async (_event, handle) => {
  return getYoutubeChannelInfo(handle);
});

ipcMain.handle('tasklist:start-youtube-chat-stream', async (_event, payload) => {
  return startYoutubeChatScraper(payload);
});

ipcMain.handle('tasklist:stop-youtube-chat-stream', async () => {
  closeYoutubeChatScraper();
  return getYoutubeChatState();
});

ipcMain.handle('tasklist:get-youtube-chat-state', async () => {
  return getYoutubeChatState();
});

ipcMain.handle('tasklist:minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.handle('tasklist:toggle-maximize-window', () => {
  if (!mainWindow) return { maximized: false };

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }

  return { maximized: mainWindow.isMaximized() };
});

ipcMain.handle('tasklist:close-window', () => {
  mainWindow?.close();
});

app.whenReady().then(() => {
  writeLog('app ready');
  return ensureSyncServer();
}).then(() => {
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
  closeYoutubeChatScraper();
  server?.close();
});

app.on('window-all-closed', () => {
  writeLog('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
