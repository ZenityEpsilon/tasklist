<script setup>
import { computed, ref, watch } from 'vue';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import ProgramSettings from './components/ProgramSettings.vue';
import EmptyState from './components/EmptyState.vue';
import GameTabs from './components/GameTabs.vue';
import OrderForm from './components/OrderForm.vue';
import OrdersList from './components/OrdersList.vue';

const STORAGE_KEY = 'stream-orders-v7';
const STORAGE_CHANNEL = 'stream-orders-sync-v1';
const USER_SESSION_STORAGE_KEY = 'stream-orders-user-session-v1';
const SYNC_POLL_INTERVAL = 1000;
const SERVER_HEALTH_POLL_INTERVAL = 1000;
const SERVER_PUSH_DELAY = 120;
const YOUTUBE_CHANNEL_REFRESH_INTERVAL = 60000;
const OVERLAY_COMPLETE_ANIMATION_FALLBACK_MS = 700;
const TAB_ID = createId();
const SERVER_SYNC_ENABLED = location.protocol === 'http:' || location.protocol === 'https:';
const LOCAL_TAB_SYNC_ENABLED = !SERVER_SYNC_ENABLED;
const SERVER_STATE_URL = new URL('./api/state', location.href).toString();
const SERVER_EVENTS_URL = new URL('./api/events', location.href).toString();
const SERVER_CHAT_STATE_URL = new URL('./api/chat-state', location.href).toString();
const SERVER_CHAT_EVENTS_URL = new URL('./api/chat-events', location.href).toString();
const DESKTOP_API = globalThis.tasklistDesktop || null;
const isDesktopMode = Boolean(DESKTOP_API);
const params = new URLSearchParams(location.search);
const viewMode = params.get('view') || params.get('mode') || '';
const normalizedPathname = location.pathname.replace(/\/$/, '');
const isTasksOverlayMode = viewMode === 'obs'
  || viewMode === 'overlay'
  || normalizedPathname.endsWith('/obs');
const isChatOverlayMode = viewMode === 'chat'
  || normalizedPathname.endsWith('/chat');
const isOverlayMode = isTasksOverlayMode || isChatOverlayMode;
const tasksOverlayUrl = DESKTOP_API?.obsUrl || new URL('./obs', location.href).toString();
const chatOverlayUrl = DESKTOP_API?.chatUrl || new URL('./chat', location.href).toString();
const AUTHOR_NAME = 'Зеновий Крупский';
const CONTACT_URL = 'https://t.me/zenoviyKrupskyi';

const ICONS = [
  { id: 'RU_MECH', label: 'RU Механизированная', file: 'SPEC_RU_Mechanized.png' },
  { id: 'RU_MORSKAYA', label: 'RU Морская', file: 'SPEC_RU_Morskaya.png' },
  { id: 'RU_MOTOSTRELKI', label: 'RU Мотострелки', file: 'SPEC_RU_Motostrelki.png' },
  { id: 'RU_TANK', label: 'RU Танк', file: 'SPEC_RU_Tank.png' },
  { id: 'RU_VDV', label: 'RU ВДВ', file: 'SPEC_RU_VDV.png' },
  { id: 'US_AIRMOBILE', label: 'US Airmobile', file: 'SPEC_US_Airmobile.png' },
  { id: 'US_ARMORED', label: 'US Armored', file: 'SPEC_US_Armored.png' },
  { id: 'US_CAVALRY', label: 'US Cavalry', file: 'SPEC_US_Cavalry.png' },
  { id: 'US_MARINES', label: 'US Marines', file: 'SPEC_US_Marines.png' },
  { id: 'US_SOF', label: 'US SOF', file: 'SPEC_US_SOF.png' },
  { id: 'DLC2_BALTIC', label: 'DLC2 Baltic', file: 'SPEC_DLC2_Baltic.png' }
];

const ICON_BY_ID = Object.fromEntries(ICONS.map(icon => [icon.id, icon]));

const DEFAULT_GAME_NAME = 'Игра';
const DEFAULT_COLOR_PROFILES = [
  {
    id: 'default-cyan',
    name: 'Стандартная',
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
const LEGACY_DEFAULT_CHAT_COLORS = {
  backgroundFrom: 'rgba(10, 80, 115, 0.16)',
  backgroundTo: 'rgba(6, 10, 18, 0.24)',
  border: 'rgba(56, 213, 255, 0.08)',
  author: '#a7f3d0',
  text: '#f8fbff'
};
const TASK_DEFAULT_CHAT_COLORS = {
  backgroundFrom: 'rgba(10, 80, 115, 0.58)',
  backgroundTo: 'rgba(6, 10, 18, 0.74)',
  border: 'rgba(255, 255, 255, 0.18)',
  author: '#a7f3d0',
  text: '#ffffff'
};
const PALETTE_FIELDS = [
  { key: 'panel', label: 'Панель' },
  { key: 'panelStrong', label: 'Панель активная' },
  { key: 'panelSoft', label: 'Панель мягкая' },
  { key: 'line', label: 'Линии' },
  { key: 'lineStrong', label: 'Линии активные' },
  { key: 'text', label: 'Текст' },
  { key: 'muted', label: 'Приглушенный текст' },
  { key: 'shadow', label: 'Тень' },
  { key: 'accent', label: 'Акцент' },
  { key: 'accent2', label: 'Второй акцент' },
  { key: 'danger', label: 'Удаление' },
  { key: 'done', label: 'Готово' }
];
const defaultOrders = [
  { title: 'Тестовая задача x1', qty: 1, icons: ['RU_MECH', 'US_SOF'] },
  { title: 'Пример заказа x2', qty: 2, icons: ['RU_VDV', 'RU_MORSKAYA'] }
];
const hasStoredState = Boolean(localStorage.getItem(STORAGE_KEY));
const input = ref('');
const qtyInput = ref(1);
const gameInput = ref('');
const filter = ref('all');
const adminPage = ref('home');
const loginUsername = ref('');
const loginPassword = ref('');
const loginStatus = ref('');
const loginError = ref('');
const isLoginSubmitting = ref(false);
const userSession = ref(loadUserSession());
const youtubeChannel = ref(null);
const youtubeChannelError = ref('');
const isYoutubeChannelLoading = ref(false);
const currentYoutubeLiveStream = ref(null);
const backendChatMessages = ref([]);
const backendChatConnected = ref(false);
const backendChatError = ref('');
const legacyJsonInput = ref(null);
const obsSyncRunning = ref(isDesktopMode);
const openedPicker = ref(null);
const draggedId = ref(null);
const dragOverId = ref(null);
const draggedSourceGameId = ref(null);
const dragOverGameId = ref(null);
const loadedState = load();
const games = ref(loadedState.games);
const activeGameId = ref(loadedState.activeGameId);
const appSettings = ref(loadedState.appSettings);
const selectedGameId = ref(loadedState.activeGameId);
const completingOverlayIds = ref(new Set());
let lastRevision = loadedState.revision;
let isApplyingRemoteState = false;
let lastRawStorage = localStorage.getItem(STORAGE_KEY) || '';
let syncChannel = null;
let serverPushTimer = null;
let serverSyncAvailable = false;
let serverSyncInFlight = false;
let serverEvents = null;
let desktopSyncStatusTimer = null;
let desktopSyncStatusFailures = 0;
let desktopInitialStatePulled = false;
let desktopInitialPushDone = false;
let youtubeChannelRefreshTimer = null;
let serverChatEvents = null;
let lastDesktopChatParserKey = '';
const overlayCompletionTimers = new Map();

const activeGame = computed(() => {
  return games.value.find(game => game.id === activeGameId.value) || games.value[0] || null;
});
const selectedGame = computed(() => {
  return games.value.find(game => game.id === selectedGameId.value) || activeGame.value || games.value[0] || null;
});
const currentGame = computed(() => {
  return isOverlayMode ? activeGame.value : selectedGame.value;
});
const currentGameSettings = computed(() => currentGame.value?.settings || makeDefaultGameSettings());
const obsColorProfile = computed(() => {
  const pinnedProfileId = currentGameSettings.value.colorProfileId;

  return appSettings.value.colorProfiles.find(profile => profile.id === pinnedProfileId)
    || appSettings.value.colorProfiles.find(profile => profile.id === appSettings.value.activeColorProfileId)
    || appSettings.value.colorProfiles[0]
    || makeDefaultColorProfile();
});
const adminColorProfile = computed(() => {
  return appSettings.value.colorProfiles.find(profile => profile.id === appSettings.value.adminColorProfileId)
    || makeDefaultColorProfile();
});
const activeColorProfile = computed(() => (isOverlayMode ? obsColorProfile.value : adminColorProfile.value));
const paletteCssVars = computed(() => makePaletteCssVars(activeColorProfile.value));
const orders = computed({
  get() {
    return currentGame.value?.orders || [];
  },
  set(value) {
    if (currentGame.value) {
      currentGame.value.orders = value;
    }
  }
});
const visibleOrders = computed(() => {
  if (filter.value === 'active') return orders.value.filter(order => !order.done);
  if (filter.value === 'done') return orders.value.filter(order => order.done);
  return orders.value;
});
const displayOrders = computed(() => {
  if (!isTasksOverlayMode) return visibleOrders.value;

  return orders.value.filter(order => !order.done || completingOverlayIds.value.has(order.id));
});

const totalCount = computed(() => orders.value.length);
const activeCount = computed(() => orders.value.filter(order => !order.done).length);
const qtyCount = computed(() => {
  return orders.value.reduce((sum, order) => sum + normalizeQty(order.qty), 0);
});
const userProfile = computed(() => {
  const session = userSession.value;
  const entry = Array.isArray(session) ? session[0] : session;
  return entry?.result && typeof entry.result === 'object' ? entry.result : null;
});
const youtubeHandle = computed(() => String(userProfile.value?.yt_user || '').trim());
const isYoutubeChannelBound = computed(() => Boolean(youtubeHandle.value));
const isYoutubeChannelReady = computed(() => Boolean(isYoutubeChannelBound.value && youtubeChannel.value?.url));
const isYoutubeChannelBootstrapLoading = computed(() => Boolean(isYoutubeChannelBound.value && isYoutubeChannelLoading.value && !youtubeChannel.value));
const chatMessages = computed(() => backendChatMessages.value.map(normalizeChatMessage));
const chatHasLiveStream = computed(() => backendChatConnected.value || chatMessages.value.length > 0);
function normalizeChatErrorMessage(input, fallback = 'Подключение к чату...') {
  const raw = String(input?.message || input?.error || input || '').trim();
  if (!raw) return fallback;

  const text = raw
    .replace(/^\s+|\s+$/g, '')
    .replace(/^Error:\s*/i, '');

  if (/YouTube не привязан|yt_user|handle is required/i.test(text)) return 'YouTube не привязан в профиле';
  if (/Стрим ещё не начат|stream not started|no live stream|not live/i.test(text)) return 'Стрим ещё не начат';
  if (/слишком много запросов|rate limit|too many requests|429/i.test(text)) return 'Слишком много запросов к чату';
  if (/нет доступа|forbidden|unauthorized|403/i.test(text)) return 'Нет доступа к чату';
  if (/не найден|not found|404/i.test(text)) return 'Чат не найден';
  if (/timeout|timed out|failed to fetch|net::err|network/i.test(text)) return 'Не удалось подключиться к YouTube';
  if (/json|parse|unexpected|malformed/i.test(text)) return 'YouTube вернул неожиданный ответ';
  return text;
}

function normalizeChatMessage(message) {
  const parts = Array.isArray(message?.parts)
    ? message.parts.map(normalizeChatMessagePart).filter(Boolean)
    : [];
  const fallbackText = String(message?.message || '').trim();

  return {
    ...message,
    message: fallbackText,
    parts: parts.length > 0 ? parts : [{ type: 'text', text: fallbackText }]
  };
}

function normalizeChatMessagePart(part) {
  if (!part || typeof part !== 'object') return null;

  if (part.type === 'emoji') {
    const url = String(part.url || '').trim();
    if (!url) return null;

    return {
      type: 'emoji',
      url,
      alt: String(part.alt || 'emoji').trim() || 'emoji'
    };
  }

  const text = String(part.text || '').replace(/\s+/g, ' ');
  return text ? { type: 'text', text } : null;
}

const chatEmptyMessage = computed(() => {
  if (!isDesktopMode) return backendChatError.value || 'Ожидание чата';
  if (!userProfile.value) return 'Дождитесь загрузки профиля';
  if (!youtubeHandle.value) return 'YouTube не привязан в профиле';
  if (!isYoutubeChannelReady.value) return 'Загрузка YouTube...';
  if (!chatHasLiveStream.value) return backendChatError.value || 'Подключение к чату...';
  if (!chatMessages.value.length) return 'Сообщения пока не поступали';
  return '';
});
let previousOverlayDone = new Map(orders.value.map(order => [order.id, Boolean(order.done)]));
let youtubeChannelRequestId = 0;
let removeYoutubeChatListener = null;

watch(
  [games, activeGameId, appSettings],
  () => {
    if (isApplyingRemoteState) return;
    persistState();
  },
  { deep: true, flush: 'sync' }
);

watch(
  orders,
  value => {
    trackOverlayCompletion(value);
  },
  { deep: true, flush: 'sync' }
);

setupCrossTabSync();
setupServerSync({ pushWhenCurrent: true });
setupDesktopSyncStatus();

watch(
  youtubeHandle,
  handle => {
    loadYoutubeChannel(handle);
    setupYoutubeChannelRefresh();
  },
  { immediate: true }
);

watch(
  [
    isChatOverlayMode,
    userSession,
    youtubeHandle,
    () => currentYoutubeLiveStream.value?.id,
    () => youtubeChannel.value?.currentLiveStream?.id
  ],
  () => {
    if (!isChatOverlayMode) {
      closeBackendChatStream();
      backendChatMessages.value = [];
      backendChatError.value = '';
      return;
    }

    void setupBackendChatStream();
  },
  { immediate: true, deep: true }
);

watch(
  [
    isDesktopMode,
    youtubeHandle,
    () => currentYoutubeLiveStream.value?.id,
    () => youtubeChannel.value?.currentLiveStream?.id
  ],
  () => {
    if (!isDesktopMode || isChatOverlayMode) return;

    const videoId = currentYoutubeLiveStream.value?.id
      || youtubeChannel.value?.currentLiveStream?.id
      || '';

    if (!videoId && !youtubeHandle.value) return;
    const parserKey = `${youtubeHandle.value || ''}|${videoId || ''}`;
    if (parserKey === lastDesktopChatParserKey) return;
    lastDesktopChatParserKey = parserKey;
    void startDesktopChatParser({ videoId });
  },
  { immediate: true }
);

watch(
  adminPage,
  () => {
    setupYoutubeChannelRefresh();
  }
);

function addOrder() {
  const parsed = parseTitle(input.value.trim());
  if (!parsed.title) return;

  orders.value.unshift(makeOrder(
    parsed.title,
    parsed.qty || qtyInput.value,
    detectIcons(parsed.title)
  ));

  input.value = '';
  qtyInput.value = 1;
}

function addGame() {
  const name = gameInput.value.trim();
  if (!name) return;

  const game = makeGame(name, []);
  games.value.push(game);
  selectedGameId.value = game.id;
  gameInput.value = '';
  resetTaskUiState();
}

function selectGame(id) {
  if (selectedGameId.value === id) return;

  selectedGameId.value = id;
  resetTaskUiState();
}

function setActiveGame(id) {
  if (activeGameId.value === id) return;

  activeGameId.value = id;
}

function setupDesktopSyncStatus() {
  if (!DESKTOP_API?.getSyncServerStatus) return;

  refreshDesktopSyncStatus();
  desktopSyncStatusTimer = setInterval(refreshDesktopSyncStatus, SERVER_HEALTH_POLL_INTERVAL);
}

async function refreshDesktopSyncStatus() {
  try {
    const status = await DESKTOP_API.getSyncServerStatus();
    const isRunning = Boolean(status?.running) || await canReachDesktopSyncServer(status?.url);

    if (isRunning) {
      desktopSyncStatusFailures = 0;
      obsSyncRunning.value = true;
    } else {
      desktopSyncStatusFailures += 1;
      if (desktopSyncStatusFailures >= 3) {
        obsSyncRunning.value = false;
      }
    }

    if (isRunning && selectedGame.value) {
      await syncDesktopServerState(status?.url);

      if (desktopInitialStatePulled && !desktopInitialPushDone) {
        desktopInitialPushDone = true;
        scheduleServerPush(makePayload(nextRevision()));
      }
    }
  } catch {
    desktopSyncStatusFailures += 1;
    if (desktopSyncStatusFailures >= 3) {
      obsSyncRunning.value = false;
    }
  }
}

async function syncDesktopServerState(serverUrl) {
  if (!serverUrl) return;

  try {
    const response = await fetch(new URL('./api/state', serverUrl).toString(), {
      cache: 'no-store'
    });

    if (!response.ok) return;

    const payload = await response.json();
    const state = normalizeStatePayload(payload);
    const shouldForceInitialState = !desktopInitialStatePulled && !hasStoredState;

    if (shouldForceInitialState || state.revision > lastRevision) {
      applyDesktopServerPayload(state);
    }
  } catch {
    return;
  } finally {
    desktopInitialStatePulled = true;
  }
}

function applyDesktopServerPayload(state) {
  lastRevision = state.revision;
  isApplyingRemoteState = true;
  appSettings.value = state.appSettings;
  games.value = state.games;
  activeGameId.value = state.activeGameId;
  selectedGameId.value = normalizeGameId(selectedGameId.value);
  isApplyingRemoteState = false;
  resetTaskUiState();
}

async function canReachDesktopSyncServer(serverUrl) {
  if (!serverUrl) return false;

  try {
    const response = await fetch(new URL('./api/state', serverUrl).toString(), {
      cache: 'no-store'
    });

    return response.ok;
  } catch {
    return false;
  }
}

function minimizeWindow() {
  DESKTOP_API?.minimizeWindow?.();
}

function toggleMaximizeWindow() {
  DESKTOP_API?.toggleMaximizeWindow?.();
}

function closeWindow() {
  DESKTOP_API?.closeWindow?.();
}

function finishGameEditing(game) {
  const name = game.name.trim();
  game.name = name || DEFAULT_GAME_NAME;
}

function removeGame(id) {
  if (games.value.length <= 1) return;

  const index = games.value.findIndex(game => game.id === id);
  if (index < 0) return;

  games.value.splice(index, 1);

  if (activeGameId.value === id) {
    activeGameId.value = games.value[Math.max(0, index - 1)]?.id || games.value[0]?.id || null;
  }

  if (selectedGameId.value === id) {
    selectedGameId.value = activeGameId.value || games.value[0]?.id || null;
    resetTaskUiState();
  }
}

function resetTaskUiState() {
  filter.value = 'all';
  selectedGameId.value = normalizeGameId(selectedGameId.value);
  activeGameId.value = normalizeGameId(activeGameId.value);
  openedPicker.value = null;
  draggedId.value = null;
  dragOverId.value = null;
  draggedSourceGameId.value = null;
  dragOverGameId.value = null;
  previousOverlayDone = new Map(orders.value.map(order => [order.id, Boolean(order.done)]));
}

function setFilter(value) {
  filter.value = value;
}

function setAdminPage(page) {
  adminPage.value = page;
  closeIconMenus();
}

async function submitLogin() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  loginStatus.value = '';
  loginError.value = '';

  if (!username || !password) {
    loginError.value = 'Введите логин и пароль';
    return;
  }

  isLoginSubmitting.value = true;

  try {
    const response = await fetch('https://obs.island-rp.in.ua/api/users', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        {
          method: 'login',
          params: {
            username,
            password
          }
        }
      ])
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    userSession.value = responseBody;
    localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(responseBody));
    loginStatus.value = 'Вход выполнен';
  } catch {
    loginError.value = 'Не удалось выполнить вход';
  } finally {
    isLoginSubmitting.value = false;
  }
}

function clearLoginMessages() {
  loginStatus.value = '';
  loginError.value = '';
}

function logoutUser() {
  userSession.value = null;
  youtubeChannel.value = null;
  currentYoutubeLiveStream.value = null;
  closeBackendChatStream();
  backendChatMessages.value = [];
  backendChatConnected.value = false;
  backendChatError.value = '';
  youtubeChannelError.value = '';
  loginUsername.value = '';
  loginPassword.value = '';
  loginStatus.value = '';
  loginError.value = '';
  localStorage.removeItem(USER_SESSION_STORAGE_KEY);
}

async function loadYoutubeChannel(handle) {
  const requestId = youtubeChannelRequestId + 1;
  youtubeChannelRequestId = requestId;
  youtubeChannel.value = null;
  youtubeChannelError.value = '';
  currentYoutubeLiveStream.value = null;

  if (!handle) {
    isYoutubeChannelLoading.value = false;
    return;
  }

  isYoutubeChannelLoading.value = true;

  try {
    const channel = DESKTOP_API?.getYoutubeChannel
      ? await DESKTOP_API.getYoutubeChannel(handle)
      : await fetchYoutubeChannelFromServer(handle);

    if (requestId !== youtubeChannelRequestId) return;

    youtubeChannel.value = channel;
    currentYoutubeLiveStream.value = channel?.currentLiveStream?.id
      ? channel.currentLiveStream
      : null;
  } catch {
    if (requestId !== youtubeChannelRequestId) return;

    youtubeChannelError.value = 'Не удалось загрузить YouTube-канал';
  } finally {
    if (requestId === youtubeChannelRequestId) {
      isYoutubeChannelLoading.value = false;
    }
  }
}

function setupYoutubeChannelRefresh() {
  clearInterval(youtubeChannelRefreshTimer);
  youtubeChannelRefreshTimer = null;

  if (!youtubeHandle.value || (adminPage.value !== 'user' && !isChatOverlayMode)) return;

  youtubeChannelRefreshTimer = setInterval(() => {
    loadYoutubeChannel(youtubeHandle.value);
  }, YOUTUBE_CHANNEL_REFRESH_INTERVAL);
}

function closeBackendChatStream() {
  if (typeof removeYoutubeChatListener === 'function') {
    removeYoutubeChatListener();
    removeYoutubeChatListener = null;
  }

  if (serverChatEvents) {
    serverChatEvents.close();
    serverChatEvents = null;
  }

  if (isDesktopMode && isChatOverlayMode && DESKTOP_API?.stopYoutubeChatStream) {
    void DESKTOP_API.stopYoutubeChatStream();
  }

  backendChatConnected.value = false;
}

function applyChatState(payload = {}) {
  backendChatConnected.value = Boolean(payload?.connected);
  backendChatError.value = normalizeChatErrorMessage(payload?.error, payload?.connected ? '' : 'Подключение к чату...');
  backendChatMessages.value = Array.isArray(payload?.messages) ? payload.messages : [];
}

async function refreshServerChatState() {
  try {
    const response = await fetch(SERVER_CHAT_STATE_URL);
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    applyChatState(payload);
  } catch (error) {
    backendChatConnected.value = false;
    backendChatError.value = normalizeChatErrorMessage(error, 'Не удалось получить состояние чата');
  }
}

function setupServerChatEvents() {
  if (serverChatEvents) return;
  if (typeof EventSource === 'undefined') return;

  serverChatEvents = new EventSource(SERVER_CHAT_EVENTS_URL);
  serverChatEvents.addEventListener('chat', event => {
    try {
      applyChatState(JSON.parse(event.data));
    } catch (error) {
      backendChatError.value = normalizeChatErrorMessage(error, 'Не удалось прочитать событие чата');
    }
  });
  serverChatEvents.onerror = () => {
    backendChatConnected.value = false;
    backendChatError.value = 'Ожидание локального сервера чата';
  };
}

async function setupBackendChatStream() {
  closeBackendChatStream();

  if (!isChatOverlayMode) {
    backendChatMessages.value = [];
    backendChatError.value = '';
    return;
  }

  if (!isDesktopMode) {
    backendChatConnected.value = false;
    backendChatError.value = '';
    backendChatMessages.value = [];
    setupServerChatEvents();
    await refreshServerChatState();
    return;
  }

  if (!youtubeHandle.value) {
    backendChatConnected.value = false;
    backendChatMessages.value = [];
    backendChatError.value = userProfile.value
      ? 'YouTube не привязан в профиле'
      : 'Дождитесь загрузки профиля';
    return;
  }

  if (!youtubeChannel.value && isYoutubeChannelLoading.value) {
    backendChatConnected.value = false;
    backendChatMessages.value = [];
    backendChatError.value = 'Загрузка YouTube...';
    return;
  }

  backendChatConnected.value = false;
  backendChatError.value = '';
  backendChatMessages.value = [];

  if (DESKTOP_API?.onYoutubeChatUpdate) {
    removeYoutubeChatListener = DESKTOP_API.onYoutubeChatUpdate(payload => {
      backendChatConnected.value = Boolean(payload?.connected);
      backendChatError.value = normalizeChatErrorMessage(payload?.error, payload?.connected ? '' : 'Подключение к чату...');
      backendChatMessages.value = Array.isArray(payload?.messages) ? payload.messages : [];
    });
  }

  if (!DESKTOP_API?.startYoutubeChatStream) {
    backendChatError.value = 'Локальный парсер чата недоступен';
    return;
  }

  const videoId = currentYoutubeLiveStream.value?.id
    || youtubeChannel.value?.currentLiveStream?.id
    || '';

  try {
    const state = await startDesktopChatParser({ videoId });

    backendChatConnected.value = Boolean(state?.connected);
    backendChatError.value = normalizeChatErrorMessage(state?.error, state?.connected ? '' : 'Подключение к чату...');
    backendChatMessages.value = Array.isArray(state?.messages) ? state.messages : [];
  } catch (error) {
    backendChatConnected.value = false;
    backendChatError.value = normalizeChatErrorMessage(error, 'Не удалось подключиться к чату');
  }
}

async function startDesktopChatParser({ videoId = '' } = {}) {
  if (!DESKTOP_API?.startYoutubeChatStream) {
    throw new Error('Локальный парсер чата недоступен');
  }

  return DESKTOP_API.startYoutubeChatStream({
    handle: youtubeHandle.value,
    videoId
  });
}

async function fetchYoutubeChannelFromServer(handle) {
  const url = new URL('./api/youtube-channel', location.href);
  url.searchParams.set('handle', handle);

  const response = await fetch(url);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }

  return body;
}

function mergeChatMessages(currentMessages, nextMessages) {
  const seen = new Set();
  const merged = [];

  for (const message of [...nextMessages, ...currentMessages]) {
    if (!message || !message.id || seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }

  return merged.slice(0, 50);
}

function loadUserSession() {
  try {
    const saved = localStorage.getItem(USER_SESSION_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function clearDone() {
  orders.value = orders.value.filter(order => !order.done);
}

function removeOrder(id) {
  orders.value = orders.value.filter(order => order.id !== id);
}

function toggleDone(order) {
  order.done = !order.done;
}

function trackOverlayCompletion(value) {
  if (!isTasksOverlayMode) {
    previousOverlayDone = new Map(value.map(order => [order.id, Boolean(order.done)]));
    return;
  }

  const currentIds = new Set(value.map(order => order.id));

  overlayCompletionTimers.forEach((timer, id) => {
    if (!currentIds.has(id)) {
      clearTimeout(timer);
      overlayCompletionTimers.delete(id);
      setOverlayCompletion(id, false);
    }
  });

  value.forEach(order => {
    const wasDone = previousOverlayDone.get(order.id) === true;

    if (order.done && !wasDone) {
      markOverlayOrderComplete(order.id);
    }

    if (!order.done && completingOverlayIds.value.has(order.id)) {
      clearOverlayCompletion(order.id);
    }
  });

  previousOverlayDone = new Map(value.map(order => [order.id, Boolean(order.done)]));
}

function markOverlayOrderComplete(id) {
  setOverlayCompletion(id, true);
  clearTimeout(overlayCompletionTimers.get(id));

  overlayCompletionTimers.set(id, setTimeout(() => {
    finishOverlayCompletion(id);
  }, OVERLAY_COMPLETE_ANIMATION_FALLBACK_MS));
}

function clearOverlayCompletion(id) {
  clearTimeout(overlayCompletionTimers.get(id));
  overlayCompletionTimers.delete(id);
  setOverlayCompletion(id, false);
}

function finishOverlayCompletion(id) {
  clearTimeout(overlayCompletionTimers.get(id));
  overlayCompletionTimers.delete(id);
  setOverlayCompletion(id, false);
}

function onOverlayAnimationEnd(order, event) {
  if (!isTasksOverlayMode || event.target !== event.currentTarget || event.animationName !== 'obsTaskComplete') {
    return;
  }

  finishOverlayCompletion(order.id);
}

function setOverlayCompletion(id, isCompleting) {
  const next = new Set(completingOverlayIds.value);

  if (isCompleting) {
    next.add(id);
  } else {
    next.delete(id);
  }

  completingOverlayIds.value = next;
}

function updateQty(order) {
  order.qty = normalizeQty(order.qty);
}

function finishEditing(order) {
  const parsed = parseTitle(order.title.trim());

  if (!parsed.title) {
    removeOrder(order.id);
    return;
  }

  order.title = parsed.title;

  if (parsed.qty) {
    order.qty = parsed.qty;
  }
}

function togglePicker(orderId, index) {
  const next = `${orderId}:${index}`;
  openedPicker.value = openedPicker.value === next ? null : next;
}

function setIcon(order, index, iconId) {
  order.icons[index] = iconId;
  openedPicker.value = null;
}

function closeIconMenus() {
  openedPicker.value = null;
}

function iconPath(iconId) {
  return `${import.meta.env.BASE_URL}icons/${getIcon(iconId).file}`;
}

function openLegacyJsonImport() {
  legacyJsonInput.value?.click();
}

function importLegacyJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const importedState = parseStoredState(reader.result);

      appSettings.value = importedState.appSettings;
      games.value = importedState.games;
      activeGameId.value = importedState.activeGameId;
      selectedGameId.value = normalizeGameId(selectedGameId.value);
      resetTaskUiState();
    } catch {
      alert('Не удалось перенести старый JSON');
    }
  };

  reader.readAsText(file, 'UTF-8');
}

function persistState() {
  const payload = makePayload(nextRevision());

  lastRawStorage = JSON.stringify(payload);
  const plainPayload = JSON.parse(lastRawStorage);

  lastRevision = plainPayload.revision;
  localStorage.setItem(STORAGE_KEY, lastRawStorage);
  if (LOCAL_TAB_SYNC_ENABLED) {
    syncChannel?.postMessage(plainPayload);
  }
  scheduleServerPush(plainPayload);
}

function makePayload(revision) {
  return {
    version: 4,
    sourceId: TAB_ID,
    revision,
    appSettings: appSettings.value,
    games: games.value,
    activeGameId: activeGameId.value
  };
}

function nextRevision() {
  return Math.max(Date.now(), lastRevision + 1);
}

function setupCrossTabSync() {
  if (!LOCAL_TAB_SYNC_ENABLED) return;

  if ('BroadcastChannel' in globalThis) {
    syncChannel = new BroadcastChannel(STORAGE_CHANNEL);
    syncChannel.addEventListener('message', event => {
      applyRemotePayload(event.data);
    });
  }

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    lastRawStorage = event.newValue;
    try {
      applyRemotePayload(parseStoredState(event.newValue));
    } catch {}
  });

  window.addEventListener('focus', syncFromLocalStorage);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      syncFromLocalStorage();
    }
  });

  setInterval(syncFromLocalStorage, SYNC_POLL_INTERVAL);
}

function syncFromLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEY) || '';
  if (!raw || raw === lastRawStorage) return;

  lastRawStorage = raw;
  try {
    applyRemotePayload(parseStoredState(raw));
  } catch {}
}

function applyRemotePayload(payload) {
  const state = normalizeStatePayload(payload);

  if (
    !state ||
    state.sourceId === TAB_ID ||
    state.revision <= lastRevision
  ) {
    return;
  }

  lastRevision = state.revision;
  isApplyingRemoteState = true;
  appSettings.value = state.appSettings;
  games.value = state.games;
  activeGameId.value = state.activeGameId;
  selectedGameId.value = normalizeGameId(selectedGameId.value);
  isApplyingRemoteState = false;
  resetTaskUiState();
}

function setupServerSync(options = {}) {
  if (!SERVER_SYNC_ENABLED) return;
  if (serverSyncInFlight) return;

  serverSyncInFlight = true;
  fetch(SERVER_STATE_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error('Sync server is not available');
      }

      serverSyncAvailable = true;
      return response.json();
    })
    .then(payload => {
      if (payload.revision > lastRevision) {
        applyRemotePayload(payload);
      } else if (options.pushWhenCurrent && !isTasksOverlayMode) {
        scheduleServerPush(makePayload(lastRevision));
      }

      setupServerEvents();
    })
    .catch(() => {
      serverSyncAvailable = false;
      closeServerEvents();
    })
    .finally(() => {
      serverSyncInFlight = false;
    });
}

function setupServerEvents() {
  if (!serverSyncAvailable || !('EventSource' in globalThis)) return;
  if (serverEvents) return;

  serverEvents = new EventSource(SERVER_EVENTS_URL);

  serverEvents.addEventListener('state', event => {
    try {
      applyRemotePayload(JSON.parse(event.data));
    } catch {}
  });

  serverEvents.onerror = () => {
    serverSyncAvailable = false;
    closeServerEvents();
    setTimeout(setupServerSync, 1500);
  };
}

function closeServerEvents() {
  serverEvents?.close();
  serverEvents = null;
}

if (SERVER_SYNC_ENABLED) {
  setInterval(() => setupServerSync(), SERVER_HEALTH_POLL_INTERVAL);
}

function scheduleServerPush(payload) {
  const canUseDesktopSync = Boolean(DESKTOP_API?.startSyncServer && obsSyncRunning.value);

  if (!SERVER_SYNC_ENABLED && !canUseDesktopSync) return;

  clearTimeout(serverPushTimer);
  serverPushTimer = setTimeout(() => {
    if (SERVER_SYNC_ENABLED) {
      pushToServer(payload);
    } else {
      pushToDesktopServer(payload);
    }
  }, SERVER_PUSH_DELAY);
}

async function pushToDesktopServer(payload) {
  try {
    await DESKTOP_API.startSyncServer(payload);
    obsSyncRunning.value = true;
  } catch {
    obsSyncRunning.value = false;
  }
}

async function pushToServer(payload) {
  try {
    const response = await fetch(SERVER_STATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Sync server rejected state');
    }

    serverSyncAvailable = true;
  } catch {
    serverSyncAvailable = false;
  }
}

function onDragStart(order) {
  draggedId.value = order.id;
  draggedSourceGameId.value = currentGame.value?.id || null;
  closeIconMenus();
}

function onDragEnter(order) {
  if (draggedId.value && draggedId.value !== order.id) {
    dragOverId.value = order.id;
  }
}

function onDrop(targetOrder) {
  const fromId = draggedId.value;
  draggedId.value = null;
  dragOverId.value = null;
  draggedSourceGameId.value = null;
  dragOverGameId.value = null;

  if (!fromId || fromId === targetOrder.id) return;

  const current = orders.value.slice();
  const fromIndex = current.findIndex(order => order.id === fromId);
  const toIndex = current.findIndex(order => order.id === targetOrder.id);

  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  orders.value = current;
}

function onGameDragEnter(game) {
  if (!draggedId.value || game.id === draggedSourceGameId.value) {
    dragOverGameId.value = null;
    return;
  }

  dragOverGameId.value = game.id;
}

function onGameDrop(targetGame) {
  const orderId = draggedId.value;
  const sourceGameId = draggedSourceGameId.value;

  draggedId.value = null;
  dragOverId.value = null;
  draggedSourceGameId.value = null;
  dragOverGameId.value = null;

  if (!orderId || !sourceGameId || targetGame.id === sourceGameId) return;

  const sourceGame = games.value.find(game => game.id === sourceGameId);
  if (!sourceGame) return;

  const sourceIndex = sourceGame.orders.findIndex(order => order.id === orderId);
  if (sourceIndex < 0) return;

  const [movedOrder] = sourceGame.orders.splice(sourceIndex, 1);
  targetGame.orders.unshift(movedOrder);
}

function onDragEnd() {
  draggedId.value = null;
  dragOverId.value = null;
  draggedSourceGameId.value = null;
  dragOverGameId.value = null;
}

function makeOrder(title, qty = 1, icons = null) {
  return {
    id: createId(),
    title,
    qty: normalizeQty(qty),
    icons: normalizeIcons(icons || detectIcons(title)),
    done: false
  };
}

function parseTitle(rawTitle) {
  const match = rawTitle.match(/\s+[xхХ](\d+)\s*$/i);

  if (!match) {
    return {
      title: rawTitle,
      qty: null
    };
  }

  return {
    title: rawTitle.replace(/\s+[xхХ]\d+\s*$/i, '').trim(),
    qty: normalizeQty(match[1])
  };
}

function normalizeQty(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function normalizeIcons(icons) {
  const normalized = Array.isArray(icons) ? icons.slice(0, 2) : [];

  while (normalized.length < 2) {
    normalized.push('RU_MECH');
  }

  return normalized.map(icon => {
    if (ICON_BY_ID[icon]) return icon;

    const found = ICONS.find(item => item.file === icon);
    return found ? found.id : 'RU_MECH';
  });
}

function getIcon(id) {
  return ICON_BY_ID[id] || ICON_BY_ID.RU_MECH;
}

function detectIcons(title) {
  const text = title.toUpperCase();
  const found = [];
  const rules = [
    [/ТАНК|ЧУГУН|ARMORED/, 'RU_TANK'],
    [/ВДВ|VDV/, 'RU_VDV'],
    [/МОРЕ|ЯКОРЬ|MORSK|NAVY/, 'RU_MORSKAYA'],
    [/ПЕХОТ|БЕРЕГ|ШИЛК|MOTO/, 'RU_MOTOSTRELKI'],
    [/АИР|AIR|MECH/, 'RU_MECH'],
    [/МАРИН|MARIN/, 'US_MARINES'],
    [/СОКОМ|SOCOM|SOF/, 'US_SOF'],
    [/БАЛТ|BALTIC/, 'DLC2_BALTIC'],
    [/CAVALRY|КАВАЛ/, 'US_CAVALRY'],
    [/AIRMOBILE|ВЕРТО/, 'US_AIRMOBILE']
  ];

  rules.forEach(([regexp, icon]) => {
    if (regexp.test(text) && !found.includes(icon)) {
      found.push(icon);
    }
  });

  while (found.length < 2) {
    found.push('RU_MECH');
  }

  return found.slice(0, 2);
}

function normalizeLoadedOrder(order) {
  if (typeof order === 'string') {
    const parsed = parseTitle(order);
    return makeOrder(parsed.title, parsed.qty || 1, detectIcons(parsed.title));
  }

  return {
    id: order.id || createId(),
    title: order.title || 'Без названия',
    qty: normalizeQty(order.qty),
    icons: normalizeIcons(order.icons || detectIcons(order.title || '')),
    done: Boolean(order.done)
  };
}

function makeGame(name = DEFAULT_GAME_NAME, orders = []) {
  return {
    id: createId(),
    name: normalizeGameName(name),
    settings: makeDefaultGameSettings(),
    orders: orders.map(normalizeLoadedOrder)
  };
}

function normalizeLoadedGame(game, index = 0) {
  return {
    id: game?.id || createId(),
    name: normalizeGameName(game?.name || (index === 0 ? DEFAULT_GAME_NAME : `Игра ${index + 1}`)),
    settings: normalizeGameSettings(game?.settings),
    orders: Array.isArray(game?.orders) ? game.orders.map(normalizeLoadedOrder) : []
  };
}

function makeDefaultGameSettings() {
  return {
    colorProfileId: '',
    showIcons: false
  };
}

function normalizeGameSettings(settings) {
  const colorProfileId = typeof settings?.colorProfileId === 'string' ? settings.colorProfileId : '';

  return {
    ...makeDefaultGameSettings(),
    ...(settings && typeof settings === 'object' ? settings : {}),
    colorProfileId,
    showIcons: Boolean(settings?.showIcons)
  };
}

function makeDefaultColorProfile() {
  return normalizeColorProfile(DEFAULT_COLOR_PROFILES[0]);
}

function makeDefaultAppSettings() {
  const colorProfiles = DEFAULT_COLOR_PROFILES.map(normalizeColorProfile);

  return {
    activeColorProfileId: colorProfiles[0].id,
    adminColorProfileId: '',
    colorProfiles
  };
}

function normalizeAppSettings(settings) {
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

function normalizeColorProfile(profile) {
  const fallback = DEFAULT_COLOR_PROFILES[0];
  const sourceColors = profile?.colors && typeof profile.colors === 'object' ? profile.colors : {};
  const sourceChat = profile?.chat && typeof profile.chat === 'object' ? profile.chat : {};
  const sourceChatColors = sourceChat.colors && typeof sourceChat.colors === 'object' ? sourceChat.colors : {};
  const colors = {};
  const chatColors = {};

  PALETTE_FIELDS.forEach(field => {
    const fallbackColor = fallback.colors[field.key];
    colors[field.key] = normalizeCssColor(sourceColors[field.key], fallbackColor);
  });

  Object.keys(fallback.chat.colors).forEach(key => {
    const sourceColor = normalizeCssColor(sourceChatColors[key], fallback.chat.colors[key]);
    chatColors[key] = sourceColor === LEGACY_DEFAULT_CHAT_COLORS[key] || sourceColor === TASK_DEFAULT_CHAT_COLORS[key]
      ? fallback.chat.colors[key]
      : sourceColor;
  });

  return {
    id: profile?.id || createId(),
    name: normalizeProfileName(profile?.name || fallback.name),
    colors,
    chat: {
      colors: chatColors,
      fontSize: normalizePixelSize(sourceChat.fontSize, fallback.chat.fontSize),
      lineSize: normalizePixelSize(sourceChat.lineSize, fallback.chat.lineSize)
    }
  };
}

function normalizeProfileName(name) {
  return String(name || '').trim() || 'Палитра';
}

function normalizeCssColor(value, fallback) {
  const color = String(value || '').trim();
  return color ? color : fallback;
}

function normalizePixelSize(value, fallback) {
  const size = Number(value);

  if (!Number.isFinite(size)) return fallback;

  return Math.min(24, Math.max(12, Math.round(size)));
}

function makePaletteCssVars(profile) {
  const colors = profile.colors;
  const chat = profile.chat || makeDefaultColorProfile().chat;
  const chatColors = chat.colors;

  return {
    '--panel': colors.panel,
    '--panel-strong': colors.panelStrong,
    '--panel-soft': colors.panelSoft,
    '--line': colors.line,
    '--line-strong': colors.lineStrong,
    '--text': colors.text,
    '--muted': colors.muted,
    '--shadow': colors.shadow,
    '--accent': colors.accent,
    '--accent-2': colors.accent2,
    '--danger': colors.danger,
    '--done': colors.done,
    '--chat-bg-from': chatColors.backgroundFrom,
    '--chat-bg-to': chatColors.backgroundTo,
    '--chat-border': chatColors.border,
    '--chat-author': chatColors.author,
    '--chat-text': chatColors.text,
    '--chat-font-size': `${chat.fontSize}px`,
    '--chat-line-size': `${chat.lineSize}px`
  };
}

function saveAppSettings(settings) {
  appSettings.value = normalizeAppSettings(settings);
}

function normalizeGameName(name) {
  const normalized = String(name || '').trim();
  return normalized || DEFAULT_GAME_NAME;
}

function normalizeGameId(id) {
  return games.value.some(game => game.id === id) ? id : games.value[0]?.id || null;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      return parseStoredState(saved);
    }
  } catch {}

  return makeDefaultState();
}

function parseStoredState(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return normalizeStatePayload(data);
}

function normalizeStatePayload(data) {
  if (!data) {
    throw new Error('Invalid stored state payload');
  }

  if (Array.isArray(data)) {
    return makeStateFromOrders(data, 0, null);
  }

  if (Array.isArray(data?.games)) {
    const normalizedGames = data.games.map(normalizeLoadedGame).filter(game => game.name);
    const fallbackGames = normalizedGames.length > 0
      ? normalizedGames
      : [makeGame(DEFAULT_GAME_NAME, [])];
    const activeId = fallbackGames.some(game => game.id === data.activeGameId)
      ? data.activeGameId
      : fallbackGames[0].id;

    return {
      revision: Number(data.revision) || 0,
      sourceId: data.sourceId || null,
      appSettings: normalizeAppSettings(data.appSettings),
      games: fallbackGames,
      activeGameId: activeId
    };
  }

  if (Array.isArray(data?.orders)) {
    return makeStateFromOrders(data.orders, Number(data.revision) || 0, data.sourceId || null);
  }

  throw new Error('Invalid stored state payload');
}

function makeStateFromOrders(rawOrders, revision, sourceId) {
  const game = makeGame(DEFAULT_GAME_NAME, rawOrders);

  return {
    revision,
    sourceId,
    appSettings: makeDefaultAppSettings(),
    games: [game],
    activeGameId: game.id
  };
}

function makeDefaultState() {
  const game = makeGame(DEFAULT_GAME_NAME, defaultOrders.map(order => makeOrder(order.title, order.qty, order.icons)));

  return {
    revision: 0,
    sourceId: null,
    appSettings: makeDefaultAppSettings(),
    games: [game],
    activeGameId: game.id
  };
}

</script>

<template>
  <header v-if="!isOverlayMode && isDesktopMode" class="app-titlebar">
    <div class="app-titlebar-brand">
      <span
        class="titlebar-server-dot"
        :class="{ online: obsSyncRunning, offline: !obsSyncRunning }"
        :title="obsSyncRunning ? 'Сервер синхронизации включен' : 'Сервер синхронизации выключен'"
        aria-hidden="true"
      ></span>
      <span class="app-titlebar-title">Tasklist</span>
      <span class="app-titlebar-status">{{ obsSyncRunning ? 'Сервер включен' : 'Сервер выключен' }}</span>
    </div>

    <div class="window-controls" aria-label="Управление окном">
      <button class="window-control" type="button" title="Свернуть" aria-label="Свернуть" @click="minimizeWindow">
        <span aria-hidden="true">−</span>
      </button>
      <button class="window-control" type="button" title="Развернуть" aria-label="Развернуть" @click="toggleMaximizeWindow">
        <span aria-hidden="true">□</span>
      </button>
      <button class="window-control close" type="button" title="Закрыть" aria-label="Закрыть" @click="closeWindow">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </header>

  <main
    class="widget"
    :class="{ overlay: isOverlayMode, 'admin-shell': !isOverlayMode, 'desktop-shell': !isOverlayMode && isDesktopMode }"
    :style="paletteCssVars"
    @click="closeIconMenus"
  >
    <template v-if="!isOverlayMode && adminPage === 'home'">
      <AppHeader
      :title="currentGame?.name || DEFAULT_GAME_NAME"
      :active-count="activeCount"
      :total-count="totalCount"
      :qty-count="qtyCount"
    />

      <GameTabs
      :games="games"
      :active-game-id="activeGameId"
      :selected-game-id="selectedGameId"
      :color-profiles="appSettings.colorProfiles"
      :dragged-id="draggedId"
      :dragged-source-game-id="draggedSourceGameId"
      :drag-over-game-id="dragOverGameId"
      :game-input="gameInput"
      @update:game-input="gameInput = $event"
      @add-game="addGame"
      @select-game="selectGame"
      @set-active-game="setActiveGame"
      @finish-game-editing="finishGameEditing"
      @remove-game="removeGame"
      @drag-enter-game="onGameDragEnter"
      @drop-game="onGameDrop"
    />

      <OrderForm
      v-model:input="input"
      v-model:qty-input="qtyInput"
      @add-order="addOrder"
    />
    </template>

    <div v-if="isTasksOverlayMode" class="obs-orders-stage">
      <Transition name="obs-list-page">
        <OrdersList
          :key="currentGame?.id || 'empty-overlay-list'"
          :orders="displayOrders"
          :icons="ICONS"
          :show-icons="currentGameSettings.showIcons"
          :is-overlay-mode="isOverlayMode"
          :opened-picker="openedPicker"
          :completing-overlay-ids="completingOverlayIds"
          :dragged-id="draggedId"
          :drag-over-id="dragOverId"
          :icon-path="iconPath"
          @drag-start="onDragStart"
          @drag-enter="onDragEnter"
          @drop="onDrop"
          @drag-end="onDragEnd"
          @overlay-animation-end="onOverlayAnimationEnd"
          @toggle-done="toggleDone"
          @toggle-picker="togglePicker"
          @set-icon="setIcon"
          @finish-editing="finishEditing"
          @update-qty="updateQty"
          @remove-order="removeOrder"
        />
      </Transition>
    </div>
    <section v-else-if="isChatOverlayMode" class="chat-stage" aria-label="Чат стрима">
      <div v-if="backendChatError" class="chat-stage-empty">
        {{ backendChatError }}
      </div>

      <div v-else-if="chatMessages.length > 0" class="chat-feed chat-feed-live">
        <TransitionGroup name="chat-message" tag="div" class="chat-message-list">
          <article v-for="message in chatMessages" :key="message.id" class="chat-message">
            <span class="chat-message-author">{{ message.author }}:</span>
            <span class="chat-message-text">
              <template v-for="(part, index) in message.parts" :key="`${message.id}-part-${index}`">
                <img
                  v-if="part.type === 'emoji'"
                  class="chat-message-emoji"
                  :src="part.url"
                  :alt="part.alt"
                  loading="eager"
                />
                <span v-else>{{ part.text }}</span>
              </template>
            </span>
          </article>
        </TransitionGroup>
      </div>

      <div v-else class="chat-stage-empty">
        {{ chatEmptyMessage }}
      </div>

    </section>
    <OrdersList
      v-else-if="adminPage === 'home'"
      :orders="displayOrders"
      :icons="ICONS"
      :show-icons="currentGameSettings.showIcons"
      :is-overlay-mode="isOverlayMode"
      :opened-picker="openedPicker"
      :completing-overlay-ids="completingOverlayIds"
      :dragged-id="draggedId"
      :drag-over-id="dragOverId"
      :icon-path="iconPath"
      @drag-start="onDragStart"
      @drag-enter="onDragEnter"
      @drop="onDrop"
      @drag-end="onDragEnd"
      @overlay-animation-end="onOverlayAnimationEnd"
      @toggle-done="toggleDone"
      @toggle-picker="togglePicker"
      @set-icon="setIcon"
      @finish-editing="finishEditing"
      @update-qty="updateQty"
      @remove-order="removeOrder"
    />

    <EmptyState
      v-if="isTasksOverlayMode || (!isChatOverlayMode && adminPage === 'home')"
      :visible="displayOrders.length === 0"
    />

    <AppFooter
      v-if="!isOverlayMode && adminPage === 'home'"
      :filter="filter"
      :chat-ready="true"
      :chat-loading="isYoutubeChannelBootstrapLoading"
      :tasks-url="tasksOverlayUrl"
      :chat-url="chatOverlayUrl"
      @set-filter="setFilter"
      @clear-done="clearDone"
    />

    <section v-if="!isOverlayMode && adminPage === 'settings'" class="settings-page">
      <div class="settings-page-title">
        <span>Настройки</span>
        <strong>Профили и палитры</strong>
      </div>

      <div class="settings-page-actions">
        <input
          ref="legacyJsonInput"
          class="file-input"
          type="file"
          accept=".json,application/json"
          @change="importLegacyJson"
        />
        <button class="file-btn" type="button" @click="openLegacyJsonImport">
          Перенести старый JSON
        </button>
        <a class="contact-link" :href="CONTACT_URL" target="_blank" rel="noreferrer">
          {{ AUTHOR_NAME }}
        </a>
      </div>

      <ProgramSettings
        embedded
        :settings="appSettings"
        :color-fields="PALETTE_FIELDS"
        :base-profile="makeDefaultColorProfile()"
        @save-settings="saveAppSettings"
      />
    </section>

    <section v-if="!isOverlayMode && adminPage === 'user'" class="user-page" aria-label="Пользователь">
      <form v-if="!userProfile" class="login-form" @submit.prevent="submitLogin">
        <div class="login-field">
          <label class="login-label" for="login-username">Логин</label>
          <input
            id="login-username"
            v-model="loginUsername"
            class="login-input"
            type="text"
            autocomplete="username"
            @input="clearLoginMessages"
          />
        </div>

        <div class="login-field">
          <label class="login-label" for="login-password">Пароль</label>
          <input
            id="login-password"
            v-model="loginPassword"
            class="login-input"
            type="password"
            autocomplete="current-password"
            @input="clearLoginMessages"
          />
        </div>

        <button class="login-submit" type="submit" :disabled="isLoginSubmitting">
          {{ isLoginSubmitting ? 'Вход...' : 'Войти' }}
        </button>

        <p v-if="loginError" class="login-message error">{{ loginError }}</p>
        <p v-else-if="loginStatus" class="login-message success">{{ loginStatus }}</p>

      </form>

      <div v-else class="user-profile">
        <div class="user-profile-main">
          <span class="user-profile-kicker">Пользователь</span>
          <strong>{{ userProfile.username || 'Без логина' }}</strong>
          <span>{{ userProfile.email || 'Email не указан' }}</span>
        </div>

        <dl class="user-profile-list">
          <div class="user-profile-row">
            <dt>ID</dt>
            <dd>{{ userProfile.id ?? '-' }}</dd>
          </div>
          <div class="user-profile-row">
            <dt>Роль</dt>
            <dd>{{ userProfile.role || '-' }}</dd>
          </div>
          <div class="user-profile-row">
            <dt>Имя</dt>
            <dd>{{ userProfile.name || '-' }}</dd>
          </div>
          <div class="user-profile-row">
            <dt>YouTube</dt>
            <dd>{{ userProfile.yt_user || '-' }}</dd>
          </div>
        </dl>

        <button class="logout-submit" type="button" @click="logoutUser">
          Выйти
        </button>
      </div>

      <div v-if="youtubeHandle" class="youtube-card">
        <div v-if="isYoutubeChannelLoading" class="youtube-card-state">
          Загрузка YouTube...
        </div>
        <div v-else-if="youtubeChannel" class="youtube-card-content">
          <div class="youtube-channel-summary">
            <img
              v-if="youtubeChannel.avatar"
              class="youtube-avatar"
              :src="youtubeChannel.avatar"
              :alt="youtubeChannel.title || youtubeHandle"
            />
            <div v-else class="youtube-avatar youtube-avatar-empty" aria-hidden="true"></div>

            <div class="youtube-details">
              <span class="youtube-kicker">YouTube</span>
              <a
                class="youtube-title"
                :href="youtubeChannel.url"
                target="_blank"
                rel="noreferrer"
              >
                {{ youtubeChannel.title || `@${youtubeHandle}` }}
              </a>
              <span class="youtube-subscribers">
                {{ youtubeChannel.subscribers || 'Подписчики не указаны' }}
              </span>
            </div>
          </div>

          <a
            v-if="youtubeChannel.lastStream"
            class="youtube-stream"
            :href="youtubeChannel.lastStream.url"
            target="_blank"
            rel="noreferrer"
          >
            <img
              v-if="youtubeChannel.lastStream.thumbnail"
              class="youtube-stream-thumb"
              :src="youtubeChannel.lastStream.thumbnail"
              :alt="youtubeChannel.lastStream.title || 'Последний стрим'"
            />
            <div class="youtube-stream-info">
              <span class="youtube-kicker">Последний стрим</span>
              <strong class="youtube-stream-title">
                <span
                  v-if="youtubeChannel.lastStream.isLive"
                  class="youtube-live-badge"
                  title="Сейчас в эфире"
                  aria-label="Сейчас в эфире"
                >
                  <span aria-hidden="true"></span>
                  LIVE
                </span>
                {{ youtubeChannel.lastStream.title || 'Без названия' }}
              </strong>
              <span>
                {{ youtubeChannel.lastStream.viewCount || 'Просмотры не указаны' }}
              </span>
              <span>
                {{ youtubeChannel.lastStream.statusLabel || youtubeChannel.lastStream.streamedAt || 'Дата не указана' }}
                <template v-if="youtubeChannel.lastStream.duration">
                  · {{ youtubeChannel.lastStream.duration }}
                </template>
              </span>
            </div>
          </a>

          <div v-else class="youtube-stream-empty">
            Последний стрим не найден
          </div>
        </div>
        <div v-else class="youtube-card-state error">
          {{ youtubeChannelError }}
        </div>
      </div>
    </section>

  </main>

  <nav v-if="!isOverlayMode" class="bottom-nav" aria-label="Навигация">
    <div class="bottom-nav-group">
      <button
        class="bottom-nav-item"
        :class="{ active: adminPage === 'home' }"
        type="button"
        title="Главная"
        aria-label="Главная"
        @click="setAdminPage('home')"
      >
        <span class="bottom-nav-icon" aria-hidden="true">⌂</span>
        <span class="bottom-nav-label">Главная</span>
      </button>
      <button
        class="bottom-nav-item"
        :class="{ active: adminPage === 'user' }"
        type="button"
        title="Пользователь"
        aria-label="Пользователь"
        @click="setAdminPage('user')"
      >
        <span class="bottom-nav-icon" aria-hidden="true">👤</span>
        <span class="bottom-nav-label">Профиль</span>
      </button>
    </div>
    <div class="bottom-nav-group bottom-nav-group-right">
      <button
        class="bottom-nav-item"
        :class="{ active: adminPage === 'settings' }"
        type="button"
        title="Настройки"
        aria-label="Настройки"
        @click="setAdminPage('settings')"
      >
        <span class="bottom-nav-icon" aria-hidden="true">⚙</span>
        <span class="bottom-nav-label">Настройки</span>
      </button>
    </div>
  </nav>
</template>
