import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('.', import.meta.url));
const defaultColorProfiles = [
  {
    id: 'default-cyan',
    name: 'РЎС‚Р°РЅРґР°СЂС‚РЅР°СЏ',
    colors: {
      panel: 'rgba(6, 10, 18, 0.74)',
      panelStrong: 'rgba(8, 13, 24, 0.9)',
      panelSoft: 'rgba(16, 24, 38, 0.72)',
      line: 'rgba(255, 255, 255, 0.18)',
      lineStrong: 'rgba(255, 255, 255, 0.28)',
      text: '#ffffff',
      muted: '#c7d2e2',
      shadow: 'rgba(0, 0, 0, 0.7)',
      accent: '#38d5ff',
      accent2: '#a7f3d0',
      danger: '#ff6b7d',
      done: '#38ef7d'
    },
    chat: {
      colors: {
        backgroundFrom: 'rgba(3, 7, 14, 0.38)',
        backgroundTo: 'rgba(3, 7, 14, 0)',
        border: 'rgba(56, 213, 255, 0)',
        author: '#a7f3d0',
        text: '#f8fbff'
      },
      fontSize: 14,
      lineSize: 20
    }
  }
];
const paletteKeys = Object.keys(defaultColorProfiles[0].colors);
const chatColorKeys = Object.keys(defaultColorProfiles[0].chat.colors);
const legacyDefaultChatColors = {
  backgroundFrom: 'rgba(10, 80, 115, 0.16)',
  backgroundTo: 'rgba(6, 10, 18, 0.24)',
  border: 'rgba(56, 213, 255, 0.08)',
  author: '#a7f3d0',
  text: '#f8fbff'
};
const taskDefaultChatColors = {
  backgroundFrom: 'rgba(10, 80, 115, 0.58)',
  backgroundTo: 'rgba(6, 10, 18, 0.74)',
  border: 'rgba(255, 255, 255, 0.18)',
  author: '#a7f3d0',
  text: '#ffffff'
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.otf': 'font/otf'
};

export function startTasklistServer(options = {}) {
  const root = options.root || defaultRoot;
  const statePath = options.statePath || join(root, 'sync-state.json');
  const port = Number(options.port || process.env.PORT || 8080);
  const launcherPid = Number(options.launcherPid || 0);
  const clients = new Set();
  const chatClients = new Set();
  let state = loadState(statePath);
  let chatState = {
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

  if (options.initialState) {
    state = parsePayload(options.initialState);
    saveState(statePath, state);
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname === '/api/state') {
      handleState(request, response);
      return;
    }

    if (url.pathname === '/api/events') {
      handleEvents(request, response);
      return;
    }

    if (url.pathname === '/api/chat-state') {
      handleChatState(request, response);
      return;
    }

    if (url.pathname === '/api/chat-events') {
      handleChatEvents(request, response);
      return;
    }

    if (url.pathname === '/api/youtube-channel') {
      handleYoutubeChannel(request, response, url);
      return;
    }

    if (url.pathname === '/api/youtube-live-chat') {
      handleYoutubeLiveChat(request, response, url);
      return;
    }

    if (url.pathname === '/obs/') {
      response.writeHead(302, { Location: '/obs' });
      response.end();
      return;
    }

    if (url.pathname === '/chat/') {
      response.writeHead(302, { Location: '/chat' });
      response.end();
      return;
    }

    serveStatic(root, url.pathname, response);
  });

  const listenPromise = new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  let launcherWatch = null;

  if (launcherPid > 0) {
    launcherWatch = setInterval(() => {
      try {
        process.kill(launcherPid, 0);
      } catch {
        shutdown(0);
      }
    }, 1500);
    launcherWatch.unref();
  }

  function shutdown(exitCode = 0) {
    clients.forEach(client => client.end());
    chatClients.forEach(client => client.end());
    clearInterval(launcherWatch);
    server.close(() => {
      if (options.exitOnClose) {
        process.exit(exitCode);
      }
    });

    if (options.exitOnClose) {
      setTimeout(() => {
        process.exit(exitCode);
      }, 1000).unref();
    }
  }

  function handleState(request, response) {
    if (request.method === 'GET') {
      sendJson(response, state);
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'GET, POST' });
      response.end();
      return;
    }

    readBody(request)
      .then(body => {
        const payload = parsePayload(JSON.parse(body));

        if (payload.revision >= state.revision) {
          payload.revision = Math.max(payload.revision, state.revision + 1);
          state = payload;
          saveState(statePath, state);
          broadcastState(clients, state);
        }

        sendJson(response, state);
      })
      .catch(error => {
        sendJson(response, { error: error.message }, 400);
      });
  }

  function handleEvents(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    clients.add(response);
    writeEvent(response, state);

    const keepAlive = setInterval(() => {
      response.write(': keep-alive\n\n');
    }, 25000);

    request.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(response);
    });
  }

  function handleChatState(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    sendJson(response, chatState);
  }

  function handleChatEvents(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    chatClients.add(response);
    writeChatEvent(response, chatState);

    const keepAlive = setInterval(() => {
      response.write(': keep-alive\n\n');
    }, 25000);

    request.on('close', () => {
      clearInterval(keepAlive);
      chatClients.delete(response);
    });
  }

  function handleYoutubeChannel(request, response, url) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    getYoutubeChannelInfo(url.searchParams.get('handle') || '')
      .then(channel => sendJson(response, channel))
      .catch(error => sendJson(response, { error: error.message }, 400));
  }

  async function handleYoutubeLiveChat(request, response, url) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    try {
      const explicitVideoId = String(url.searchParams.get('videoId') || '').trim();
      const channel = explicitVideoId ? null : await getYoutubeChannelInfo(url.searchParams.get('handle') || '');
      const stream = explicitVideoId
        ? await getYoutubeStreamInfoByVideoId(explicitVideoId)
        : (channel.currentLiveStream || channel.lastStream || null);
      const continuation = String(url.searchParams.get('continuation') || '').trim();

      if (!stream?.id) {
        sendJson(response, {
          live: Boolean(stream?.isLive),
          messages: [],
          stream
        });
        return;
      }

      const liveState = await getYoutubeVideoLiveState(stream.id).catch(() => null);
      const chat = await fetchYoutubeLiveChat(
        stream.id,
        continuation || stream.chatContinuation || liveState?.chatContinuation || '',
        stream.chatContext || liveState?.chatContext || {}
      );

      sendJson(response, {
        live: Boolean(liveState?.isLive || stream?.isLive || chat.messages.length > 0),
        messages: chat.messages,
        nextContinuation: chat.continuation,
        stream: {
          ...stream,
          isLive: Boolean(liveState?.isLive || stream?.isLive || chat.messages.length > 0),
          chatContinuation: chat.continuation || stream.chatContinuation || liveState?.chatContinuation || '',
          chatContext: stream.chatContext || liveState?.chatContext || {}
        }
      });
    } catch (error) {
      sendJson(response, { error: error.message }, 400);
    }
  }

  return {
    close: shutdown,
    obsUrl: `http://localhost:${port}/obs`,
    chatUrl: `http://localhost:${port}/chat`,
    port,
    ready: listenPromise,
    updateState(payload) {
      const nextState = parsePayload(payload);
      nextState.revision = Math.max(nextState.revision, state.revision + 1);
      state = nextState;
      saveState(statePath, state);
      broadcastState(clients, state);
      return state;
    },
    updateChatState(payload) {
      chatState = normalizeChatState(payload);
      broadcastChatState(chatClients, chatState);
      return chatState;
    },
    url: `http://localhost:${port}/`
  };
}

export async function getYoutubeChannelInfo(rawHandle) {
  const handle = normalizeYoutubeHandle(rawHandle);

  if (!handle) {
    throw new Error('YouTube handle is required');
  }

  const youtubeUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
  const response = await fetch(youtubeUrl, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube responded with HTTP ${response.status}`);
  }

  const html = await response.text();
  const data = parseYoutubeInitialData(html);
  const metadata = findFirst(data, value => value?.channelMetadataRenderer)?.channelMetadataRenderer || null;
  const subscriberCount = findChannelSubscriberText(data);
  const title = metadata?.title
    || textFrom(findFirst(data, value => value?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title)?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title)
    || extractMetaContent(html, 'og:title')
    || `@${handle}`;
  const avatar = lastThumbnail(metadata?.avatar?.thumbnails)
    || findAvatarUrl(data)
    || extractMetaContent(html, 'og:image');
  const currentLiveStream = await getYoutubeCurrentLiveStreamInfo(handle).catch(() => null);
  const lastStream = await getYoutubeLastStreamInfo(handle).catch(() => null);

  return {
    handle,
    url: youtubeUrl,
    title,
    avatar,
    subscribers: subscriberCount || '',
    currentLiveStream,
    lastStream
  };
}

async function getYoutubeCurrentLiveStreamInfo(handle) {
  const liveUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}/live`;
  const response = await fetch(liveUrl, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube live responded with HTTP ${response.status}`);
  }

  const finalUrl = response.url || liveUrl;
  const html = await response.text();
  const videoMatch = finalUrl.match(/[?&]v=([^&#]+)/i);
  const htmlVideoMatch = html.match(/"videoId":"([^"]+)"/i);
  const videoId = decodeURIComponent(videoMatch?.[1] || htmlVideoMatch?.[1] || '');

  if (!videoId) {
    return null;
  }

  const liveState = await getYoutubeVideoLiveState(videoId).catch(() => null);
  const chatContinuation = extractLiveChatContinuation(html) || liveState?.chatContinuation || '';
  const chatContext = extractLiveChatRequestContext(html) || liveState?.chatContext || {};

  return {
    id: videoId,
    title: liveState?.title || '',
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    liveChatUrl: `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=localhost&dark_theme=1`,
    chatContinuation,
    chatContext,
    isLive: true
  };
}

async function getYoutubeStreamInfoByVideoId(videoId) {
  const liveState = await getYoutubeVideoLiveState(videoId).catch(() => null);
  return {
    id: videoId,
    title: liveState?.title || '',
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    liveChatUrl: `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=localhost&dark_theme=1`,
    chatContinuation: liveState?.chatContinuation || '',
    chatContext: liveState?.chatContext || {},
    isLive: Boolean(liveState?.isLive)
  };
}

async function getYoutubeLastStreamInfo(handle) {
  const streamsUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}/streams`;
  const response = await fetch(streamsUrl, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube streams responded with HTTP ${response.status}`);
  }

  const html = await response.text();
  const data = parseYoutubeInitialData(html);
  const videos = findAll(data, value => {
    return value?.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'
      && value.lockupViewModel.contentId;
  }).map(value => value.lockupViewModel);

  if (videos.length === 0) {
    return null;
  }

  const decoratedVideos = videos.map(video => {
    const metadataParts = video.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows
      ?.flatMap(row => row.metadataParts || [])
      ?.map(part => textFrom(part.text))
      ?.filter(Boolean) || [];
    const viewCount = metadataParts.find(part => /\bviews?\b/i.test(part))
      || textFrom(findFirst(video, value => value?.videoViewCountRenderer?.viewCountText)?.videoViewCountRenderer?.viewCountText)
      || textFrom(findFirst(video, value => value?.viewCountText)?.viewCountText)
      || '';
    const streamedAt = metadataParts.find(part => /\b(streamed|live|premiered)\b/i.test(part)) || metadataParts[0] || '';
    const thumbnail = lastThumbnail(video.contentImage?.thumbnailViewModel?.image?.sources);
    const badgeInfo = extractVideoBadgeInfo(video);
    const badgeText = badgeInfo.text;
    const isLive = badgeInfo.isLive
      || isLiveBadgeText(badgeText)
      || isLiveBadgeText(streamedAt)
      || isLiveBadgeText(video.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.title?.content || '');

    return {
      video,
      viewCount,
      streamedAt,
      thumbnail,
      badgeText,
      isLive
    };
  });

  const liveChecks = await Promise.all(decoratedVideos.map(async item => {
    const liveState = await getYoutubeVideoLiveState(item.video.contentId).catch(() => null);

    return {
      ...item,
      liveState,
      isLive: item.isLive || Boolean(liveState?.isLive)
    };
  }));

  let selected = liveChecks.find(item => item.isLive) || liveChecks[0];

  return {
    id: selected.video.contentId,
    title: selected.video.metadata?.lockupMetadataViewModel?.title?.content || '',
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(selected.video.contentId)}`,
    thumbnail: selected.thumbnail,
    viewCount: selected.viewCount,
    streamedAt: selected.streamedAt,
    duration: selected.isLive ? '' : selected.badgeText,
    isLive: selected.isLive,
    liveChatUrl: selected.isLive ? `https://www.youtube.com/live_chat?v=${encodeURIComponent(selected.video.contentId)}&embed_domain=localhost&dark_theme=1` : '',
    statusLabel: selected.isLive ? '\u0412 \u044d\u0444\u0438\u0440\u0435' : selected.streamedAt
  };
}

function extractVideoBadgeText(video) {
  return extractVideoBadgeInfo(video).text;
}

function extractVideoBadgeInfo(video) {
  const candidates = [
    findFirst(video, value => value?.thumbnailBadgeViewModel)?.thumbnailBadgeViewModel,
    findFirst(video, value => value?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer,
    findFirst(video, value => value?.thumbnailOverlayBadgeViewModel)?.thumbnailOverlayBadgeViewModel,
    findFirst(video, value => typeof value?.simpleText === 'string' && /live/i.test(value.simpleText))
  ];

  for (const candidate of candidates) {
    const text = textFrom(candidate?.text || candidate?.simpleText || candidate?.label || candidate).trim();
    const style = String(candidate?.style || candidate?.badgeStyle || '').trim();
    const isLive = isLiveBadgeText(text) || isLiveBadgeText(style);

    if (text || isLive) {
      return { text, isLive };
    }
  }

  return { text: '', isLive: false };
}

function isLiveBadgeText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /\blive\b/i.test(text) || /в эфире/i.test(text) || /прям[а-я]* эфир/i.test(text);
}

async function getYoutubeVideoLiveState(videoId) {
  if (!videoId) return { isLive: false };

  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube watch responded with HTTP ${response.status}`);
  }

  const html = await response.text();
  const playerResponse = parseYouTubePlayerResponse(html);
  const videoDetails = playerResponse?.videoDetails || {};
  const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
  const title = videoDetails.title
    || microformat.title?.simpleText
    || textFrom(findFirst(playerResponse, value => value?.title?.simpleText)?.title)
    || '';
  const chatContinuation = extractLiveChatContinuation(html) || extractLiveChatContinuation(JSON.stringify(playerResponse || {}));
  const chatContext = extractLiveChatRequestContext(html);
  const liveMarkers = [
    videoDetails.isLiveContent,
    videoDetails.isLive,
    videoDetails.liveBroadcastDetails?.isLiveNow,
    microformat.liveBroadcastDetails?.isLiveNow,
    /"isLiveContent":true/i.test(html),
    /"isLiveNow":true/i.test(html),
    /\blive chat\b/i.test(html) && /"videoId":"[^"]+"/i.test(html)
  ];

  return {
    isLive: liveMarkers.some(Boolean),
    title,
    videoId: videoDetails.videoId || videoId,
    chatContinuation,
    chatContext
  };
}

function parseYouTubePlayerResponse(html) {
  const match = html.match(/(?:var\s+)?ytInitialPlayerResponse\s*=\s*/i);

  if (!match) {
    return null;
  }

  const jsonStart = html.indexOf('{', match.index);
  if (jsonStart < 0) {
    return null;
  }

  const jsonText = readBalancedJson(html, jsonStart);

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function extractLiveChatContinuation(source) {
  if (!source) return '';

  const match = String(source).match(/"continuation"\s*:\s*"([A-Za-z0-9_\-=%]+)"/i);
  if (match) {
    return match[1];
  }

  const data = (() => {
    try {
      return typeof source === 'string' && source.trim().startsWith('{') ? JSON.parse(source) : null;
    } catch {
      return null;
    }
  })();

  if (!data) return '';

  const candidates = findAll(data, value => {
    return typeof value?.continuation === 'string'
      && value.continuation.length > 12;
  })
    .map(value => value.continuation)
    .filter(Boolean);

  return candidates[0] || '';
}

function extractLiveChatRequestContext(html) {
  if (!html) return null;

  const visitorData = firstMatch(html, /"visitorData"\s*:\s*"([^"]+)"/i);
  const clientVersion = firstMatch(html, /"clientVersion"\s*:\s*"([^"]+)"/i);
  const browserVersion = firstMatch(html, /"browserVersion"\s*:\s*"([^"]+)"/i) || clientVersion || '120.0.0.0';
  const appInstallData = firstMatch(html, /"appInstallData"\s*:\s*"([^"]+)"/i);
  const rolloutToken = firstMatch(html, /"rolloutToken"\s*:\s*"([^"]+)"/i);
  const deviceExperimentId = firstMatch(html, /"deviceExperimentId"\s*:\s*"([^"]+)"/i);
  const timeZone = firstMatch(html, /"timeZone"\s*:\s*"([^"]+)"/i) || 'Europe/Kiev';
  const screenWidthPoints = Number(firstMatch(html, /"screenWidthPoints"\s*:\s*(\d+)/i) || 0);
  const screenHeightPoints = Number(firstMatch(html, /"screenHeightPoints"\s*:\s*(\d+)/i) || 0);
  const screenPixelDensity = Number(firstMatch(html, /"screenPixelDensity"\s*:\s*([\d.]+)/i) || 0);
  const screenDensityFloat = Number(firstMatch(html, /"screenDensityFloat"\s*:\s*([\d.]+)/i) || 0);
  const utcOffsetMinutes = Number(firstMatch(html, /"utcOffsetMinutes"\s*:\s*(-?\d+)/i) || 0);
  const connectionType = firstMatch(html, /"connectionType"\s*:\s*"([^"]+)"/i);
  const memoryTotalKbytes = firstMatch(html, /"memoryTotalKbytes"\s*:\s*"([^"]+)"/i);
  const isWebNativeShareAvailable = /"isWebNativeShareAvailable"\s*:\s*true/i.test(html);
  const webDisplayMode = firstMatch(html, /"webDisplayMode"\s*:\s*"([^"]+)"/i) || 'WEB_DISPLAY_MODE_BROWSER';
  const browserName = firstMatch(html, /"browserName"\s*:\s*"([^"]+)"/i) || 'Chrome';
  const browserVersionValue = firstMatch(html, /"browserVersion"\s*:\s*"([^"]+)"/i) || clientVersion || '120.0.0.0';
  const remoteHost = firstMatch(html, /"remoteHost"\s*:\s*"([^"]+)"/i);
  const acceptHeader = firstMatch(html, /"acceptHeader"\s*:\s*"([^"]+)"/i)
    || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

  if (!visitorData && !clientVersion && !appInstallData) {
    return null;
  }

  return {
    visitorData,
    clientVersion: clientVersion || '2.20260518.01.00',
    browserVersion,
    appInstallData,
    rolloutToken,
    deviceExperimentId,
    timeZone,
    acceptHeader,
    screenWidthPoints,
    screenHeightPoints,
    screenPixelDensity,
    screenDensityFloat,
    utcOffsetMinutes,
    connectionType,
    memoryTotalKbytes,
    isWebNativeShareAvailable,
    webDisplayMode,
    browserName,
    browserVersionValue,
    remoteHost
  };
}

function firstMatch(source, regexp) {
  const match = String(source || '').match(regexp);
  return match?.[1] || '';
}

async function fetchYoutubeLiveChat(videoId, continuation, chatContext = {}) {
  if (!videoId || !continuation) return { messages: [], continuation: '' };

  const url = 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false';
  const clientVersion = chatContext.clientVersion || '2.20260518.01.00';
  const browserVersion = chatContext.browserVersion || '120.0.0.0';
  const screenWidthPoints = chatContext.screenWidthPoints || 400;
  const screenHeightPoints = chatContext.screenHeightPoints || 1704;
  const screenPixelDensity = chatContext.screenPixelDensity || 1;
  const screenDensityFloat = chatContext.screenDensityFloat || 1;
  const utcOffsetMinutes = chatContext.utcOffsetMinutes || 180;
  const connectionType = chatContext.connectionType || 'CONN_CELLULAR_4G';
  const memoryTotalKbytes = chatContext.memoryTotalKbytes || '32000000';
  const webDisplayMode = chatContext.webDisplayMode || 'WEB_DISPLAY_MODE_BROWSER';
  const browserName = chatContext.browserName || 'Chrome';
  const browserVersionValue = chatContext.browserVersionValue || browserVersion;
  const remoteHost = chatContext.remoteHost || '127.0.0.1';
  const acceptHeader = chatContext.acceptHeader || '*/*';
  const userAgent = chatContext.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  const body = {
    context: {
      client: {
        hl: 'uk',
        gl: 'UA',
        remoteHost,
        deviceMake: '',
        deviceModel: '',
        visitorData: chatContext.visitorData || '',
        userAgent,
        clientName: 'WEB',
        clientVersion,
        osName: 'Windows',
        osVersion: '10.0',
        platform: 'DESKTOP',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
        configInfo: chatContext.appInstallData ? { appInstallData: chatContext.appInstallData } : undefined,
        userInterfaceTheme: 'USER_INTERFACE_THEME_DARK',
        timeZone: chatContext.timeZone || 'Europe/Kiev',
        browserName,
        browserVersion: browserVersionValue,
        acceptHeader,
        deviceExperimentId: chatContext.deviceExperimentId || '',
        rolloutToken: chatContext.rolloutToken || '',
        screenWidthPoints,
        screenHeightPoints,
        screenPixelDensity,
        screenDensityFloat,
        utcOffsetMinutes,
        connectionType,
        memoryTotalKbytes,
        mainAppWebInfo: {
          graftUrl: `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(continuation)}&dark_theme=true&authuser=0&pageId=${encodeURIComponent(videoId)}`,
          webDisplayMode,
          isWebNativeShareAvailable: chatContext.isWebNativeShareAvailable ?? true
        },
        originalUrl: `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(continuation)}&dark_theme=true&authuser=0&pageId=${encodeURIComponent(videoId)}`
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
        { key: 'u_tz', value: String(utcOffsetMinutes) },
        { key: 'u_his', value: '2' },
        { key: 'u_h', value: '1920' },
        { key: 'u_w', value: '1080' },
        { key: 'u_ah', value: '1872' },
        { key: 'u_aw', value: '1080' },
        { key: 'u_cd', value: '32' },
        { key: 'bc', value: '31' },
        { key: 'bih', value: String(screenHeightPoints || 1762) },
        { key: 'biw', value: String(screenWidthPoints || 400) },
        { key: 'brdim', value: '-1080,-260,-1080,-260,1080,-260,1080,1872,400,1704' },
        { key: 'vis', value: '1' },
        { key: 'wgl', value: 'true' },
        { key: 'ca_type', value: 'image' }
      ]
    },
    invalidationPayloadLastPublishAtUsec: String(chatContext.invalidationPayloadLastPublishAtUsec || '')
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
      'Origin': 'https://www.youtube.com',
      'Referer': `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(continuation)}&dark_theme=true&authuser=0&pageId=${encodeURIComponent(videoId)}`,
      'User-Agent': userAgent,
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': clientVersion,
      'X-Goog-Visitor-Id': chatContext.visitorData || ''
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`YouTube live chat responded with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const liveChatContinuation = payload?.continuationContents?.liveChatContinuation || null;
  const messages = extractLiveChatMessages(liveChatContinuation);
  const nextContinuation = extractNextLiveChatContinuation(liveChatContinuation);

  return {
    messages,
    continuation: nextContinuation
  };
}

function extractLiveChatMessages(liveChatContinuation) {
  const actions = liveChatContinuation?.actions || [];
  const messages = [];

  for (const action of actions) {
    const item = action?.addChatItemAction?.item || action?.replayChatItemAction?.videoOffsetTimeMsec || null;
    if (!action?.addChatItemAction?.item) continue;
    const parsed = parseLiveChatItem(action.addChatItemAction.item);
    if (parsed) messages.push(parsed);
  }

  return messages;
}

function parseLiveChatItem(item) {
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

function extractNextLiveChatContinuation(liveChatContinuation) {
  const continuationItem = liveChatContinuation?.continuations?.[0] || null;
  const token = continuationItem?.invalidationContinuationData?.continuation
    || continuationItem?.timedContinuationData?.continuation
    || continuationItem?.reloadContinuationData?.continuation
    || continuationItem?.playerSeekContinuationData?.continuation
    || '';

  return token;
}

function normalizeYoutubeHandle(rawHandle) {
  const value = String(rawHandle || '').trim();

  if (!value) return '';

  const urlMatch = value.match(/youtube\.com\/@([^/?#]+)/i);
  const handle = urlMatch ? urlMatch[1] : value.replace(/^@/, '');

  return handle.replace(/[/?#].*$/, '').trim();
}

function parseYoutubeInitialData(html) {
  const marker = 'var ytInitialData = ';
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error('YouTube page data was not found');
  }

  const jsonStart = html.indexOf('{', markerIndex);
  const jsonText = readBalancedJson(html, jsonStart);

  return JSON.parse(jsonText);
}

function readBalancedJson(source, start) {
  if (start < 0) {
    throw new Error('YouTube page data is invalid');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error('YouTube page data is incomplete');
}

function findFirst(value, predicate) {
  if (!value || typeof value !== 'object') return null;
  if (predicate(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const item of Object.values(value)) {
    const found = findFirst(item, predicate);
    if (found) return found;
  }

  return null;
}

function findAll(value, predicate, results = []) {
  if (!value || typeof value !== 'object') return results;
  if (predicate(value)) results.push(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      findAll(item, predicate, results);
    }
    return results;
  }

  for (const item of Object.values(value)) {
    findAll(item, predicate, results);
  }

  return results;
}

function textFrom(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.content === 'string') return value.content;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map(run => run.text || '').join('').trim();
  }

  return '';
}

function findChannelSubscriberText(data) {
  const pageHeader = findFirst(data, value => value?.pageHeaderRenderer)?.pageHeaderRenderer || null;
  const c4Header = findFirst(data, value => value?.c4TabbedHeaderRenderer)?.c4TabbedHeaderRenderer || null;
  const carouselHeader = findFirst(data, value => value?.carouselHeaderRenderer)?.carouselHeaderRenderer || null;

  return findSubscriberText(pageHeader)
    || textFrom(c4Header?.subscriberCountText)
    || findSubscriberText(c4Header)
    || textFrom(carouselHeader?.subscriberCountText)
    || findSubscriberText(carouselHeader)
    || '';
}

function findSubscriberText(data) {
  if (!data) return '';

  const candidates = [];
  collectStrings(data, candidates);

  for (const candidate of candidates) {
    const subscriberText = extractSubscriberText(candidate);
    if (subscriberText) return subscriberText;
  }

  return '';
}

function extractSubscriberText(value) {
  const normalized = String(value || '')
    .replace(/[\u200e\u200f\u2068\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const parts = normalized.split(/\s*[•|]\s*/).map(part => part.trim()).filter(Boolean);

  for (const part of parts) {
    const match = part.match(/((?:no|\d[\d\s.,]*(?:\s*(?:[KMB]|thousand|million|billion|тис\.?|тыс\.?|млн\.?|млрд\.?))?)\s+(?:subscribers?|\u043f\u0456\u0434\u043f\u0438\u0441\u043d\S*|\u043f\u043e\u0434\u043f\u0438\u0441\u0447\S*))/iu);

    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

function collectStrings(value, output) {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }

  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach(item => collectStrings(item, output));
    return;
  }

  Object.values(value).forEach(item => collectStrings(item, output));
}

function lastThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
  return thumbnails[thumbnails.length - 1]?.url || '';
}

function findAvatarUrl(data) {
  const owner = findFirst(data, value => Array.isArray(value?.avatar?.thumbnails));
  return lastThumbnail(owner?.avatar?.thumbnails);
}

function extractMetaContent(html, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexp = new RegExp(`<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["']`, 'i');
  const match = html.match(regexp);

  return match ? decodeHtml(match[1]) : '';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function serveStatic(root, pathname, response) {
  const requestedPath = pathname === '/' || pathname === '/obs' || pathname === '/chat'
    ? '/index.html'
    : decodeURIComponent(pathname);
  const filePath = normalize(resolve(root, `.${requestedPath}`));

  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });

  createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        rejectBody(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function parsePayload(payload) {
  if (!payload) {
    throw new Error('Payload must contain state');
  }

  if (Array.isArray(payload.games)) {
    const games = payload.games
      .filter(game => game && typeof game === 'object')
      .map((game, index) => ({
        id: game.id || `game-${index + 1}`,
        name: String(game.name || `Game ${index + 1}`),
        settings: normalizeGameSettings(game.settings),
        orders: Array.isArray(game.orders) ? game.orders : []
      }));

    if (games.length === 0) {
      throw new Error('Payload must contain at least one game');
    }

    return {
      version: 4,
      sourceId: payload.sourceId || 'server',
      revision: Number(payload.revision) || Date.now(),
      appSettings: normalizeAppSettings(payload.appSettings),
      games,
      activeGameId: games.some(game => game.id === payload.activeGameId)
        ? payload.activeGameId
        : games[0].id
    };
  }

  if (!Array.isArray(payload.orders)) {
    throw new Error('Payload must contain games or orders array');
  }

  return {
    version: 4,
    sourceId: payload.sourceId || 'server',
    revision: Number(payload.revision) || Date.now(),
    appSettings: normalizeAppSettings(payload.appSettings),
    games: [
      {
        id: 'default-game',
        name: 'РРіСЂР°',
        settings: normalizeGameSettings(),
        orders: payload.orders
      }
    ],
    activeGameId: 'default-game'
  };
}

function loadState(statePath) {
  try {
    if (existsSync(statePath)) {
      return parsePayload(JSON.parse(readFileSync(statePath, 'utf8')));
    }
  } catch {}

  return {
    version: 4,
    sourceId: 'server',
    revision: 0,
    appSettings: normalizeAppSettings(),
    games: [
      {
        id: 'default-game',
        name: 'РРіСЂР°',
        settings: normalizeGameSettings(),
        orders: []
      }
    ],
    activeGameId: 'default-game'
  };
}

function normalizeGameSettings(settings = {}) {
  const colorProfileId = typeof settings?.colorProfileId === 'string' ? settings.colorProfileId : '';

  return {
    colorProfileId,
    showIcons: Boolean(settings?.showIcons)
  };
}

function normalizeAppSettings(settings = {}) {
  const defaults = makeDefaultAppSettings();
  const profiles = Array.isArray(settings?.colorProfiles)
    ? settings.colorProfiles.map(normalizeColorProfile).filter(profile => profile.name)
    : [];
  const colorProfiles = profiles.length > 0 ? profiles : defaults.colorProfiles;
  const activeColorProfileId = colorProfiles.some(profile => profile.id === settings?.activeColorProfileId)
    ? settings.activeColorProfileId
    : colorProfiles[0].id;
  const adminColorProfileId = colorProfiles.some(profile => profile.id === settings?.adminColorProfileId)
    ? settings.adminColorProfileId
    : '';

  return {
    activeColorProfileId,
    adminColorProfileId,
    colorProfiles
  };
}

function makeDefaultAppSettings() {
  const colorProfiles = defaultColorProfiles.map(normalizeColorProfile);

  return {
    activeColorProfileId: colorProfiles[0].id,
    adminColorProfileId: '',
    colorProfiles
  };
}

function normalizeColorProfile(profile = {}, index = 0) {
  const fallback = defaultColorProfiles[0];
  const sourceColors = profile.colors && typeof profile.colors === 'object' ? profile.colors : {};
  const sourceChat = profile.chat && typeof profile.chat === 'object' ? profile.chat : {};
  const sourceChatColors = sourceChat.colors && typeof sourceChat.colors === 'object' ? sourceChat.colors : {};
  const colors = {};
  const chatColors = {};

  paletteKeys.forEach(key => {
    colors[key] = String(sourceColors[key] || fallback.colors[key] || '').trim();
  });

  chatColorKeys.forEach(key => {
    const sourceColor = String(sourceChatColors[key] || fallback.chat.colors[key] || '').trim();
    chatColors[key] = sourceColor === legacyDefaultChatColors[key] || sourceColor === taskDefaultChatColors[key]
      ? fallback.chat.colors[key]
      : sourceColor;
  });

  return {
    id: profile.id || `profile-${Date.now()}-${index}`,
    name: String(profile.name || fallback.name || 'РџР°Р»РёС‚СЂР°').trim(),
    colors,
    chat: {
      colors: chatColors,
      fontSize: normalizePixelSize(sourceChat.fontSize, fallback.chat.fontSize),
      lineSize: normalizePixelSize(sourceChat.lineSize, fallback.chat.lineSize)
    }
  };
}

function normalizePixelSize(value, fallback) {
  const size = Number(value);

  if (!Number.isFinite(size)) return fallback;

  return Math.min(24, Math.max(12, Math.round(size)));
}

function saveState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function broadcastState(clients, state) {
  clients.forEach(client => writeEvent(client, state));
}

function broadcastChatState(clients, state) {
  clients.forEach(client => writeChatEvent(client, state));
}

function writeEvent(response, payload) {
  response.write(`event: state\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeChatEvent(response, payload) {
  response.write(`event: chat\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeChatState(payload = {}) {
  return {
    connected: Boolean(payload.connected),
    error: String(payload.error || ''),
    handle: String(payload.handle || ''),
    live: Boolean(payload.live),
    messages: Array.isArray(payload.messages) ? payload.messages.slice(0, 100) : [],
    nextContinuation: String(payload.nextContinuation || ''),
    title: String(payload.title || ''),
    url: String(payload.url || ''),
    videoId: String(payload.videoId || '')
  };
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  response.end(JSON.stringify(payload));
}
