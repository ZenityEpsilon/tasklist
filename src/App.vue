<script setup>
import { computed, ref, watch } from 'vue';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import EmptyState from './components/EmptyState.vue';
import GameTabs from './components/GameTabs.vue';
import OrderForm from './components/OrderForm.vue';
import OrdersList from './components/OrdersList.vue';

const STORAGE_KEY = 'stream-orders-v7';
const STORAGE_CHANNEL = 'stream-orders-sync-v1';
const SYNC_POLL_INTERVAL = 1000;
const SERVER_PUSH_DELAY = 120;
const OVERLAY_COMPLETE_ANIMATION_FALLBACK_MS = 700;
const TAB_ID = createId();
const SERVER_SYNC_ENABLED = location.protocol === 'http:' || location.protocol === 'https:';
const LOCAL_TAB_SYNC_ENABLED = !SERVER_SYNC_ENABLED;
const SERVER_STATE_URL = new URL('./api/state', location.href).toString();
const SERVER_EVENTS_URL = new URL('./api/events', location.href).toString();
const params = new URLSearchParams(location.search);
const viewMode = params.get('view') || params.get('mode') || '';
const isOverlayMode = viewMode === 'obs'
  || viewMode === 'overlay'
  || location.pathname.replace(/\/$/, '').endsWith('/obs');
const overlayUrl = new URL('./obs', location.href).toString();
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
const defaultOrders = [
  { title: 'Тестовая задача x1', qty: 1, icons: ['RU_MECH', 'US_SOF'] },
  { title: 'Пример заказа x2', qty: 2, icons: ['RU_VDV', 'RU_MORSKAYA'] }
];

const input = ref('');
const qtyInput = ref(1);
const gameInput = ref('');
const filter = ref('all');
const openedPicker = ref(null);
const draggedId = ref(null);
const dragOverId = ref(null);
const draggedSourceGameId = ref(null);
const dragOverGameId = ref(null);
const loadedState = load();
const games = ref(loadedState.games);
const activeGameId = ref(loadedState.activeGameId);
const selectedGameId = ref(loadedState.activeGameId);
const completingOverlayIds = ref(new Set());
let lastRevision = loadedState.revision;
let isApplyingRemoteState = false;
let lastRawStorage = localStorage.getItem(STORAGE_KEY) || '';
let syncChannel = null;
let serverPushTimer = null;
let serverSyncAvailable = false;
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
  if (!isOverlayMode) return visibleOrders.value;

  return orders.value.filter(order => !order.done || completingOverlayIds.value.has(order.id));
});

const totalCount = computed(() => orders.value.length);
const activeCount = computed(() => orders.value.filter(order => !order.done).length);
const qtyCount = computed(() => {
  return orders.value.reduce((sum, order) => sum + normalizeQty(order.qty), 0);
});
let previousOverlayDone = new Map(orders.value.map(order => [order.id, Boolean(order.done)]));

watch(
  [games, activeGameId],
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
setupServerSync();

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
  if (!isOverlayMode) {
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
  if (!isOverlayMode || event.target !== event.currentTarget || event.animationName !== 'obsTaskComplete') {
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

function loadJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      const importedState = parseStoredState(data);
      games.value = importedState.games;
      activeGameId.value = importedState.activeGameId;
      resetTaskUiState();
    } catch {
      alert('Не удалось загрузить JSON');
    }
  };

  reader.readAsText(file, 'UTF-8');
}

function persistState() {
  const payload = makePayload(Date.now());

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
    version: 3,
    sourceId: TAB_ID,
    revision,
    games: games.value,
    activeGameId: activeGameId.value
  };
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
  games.value = state.games;
  activeGameId.value = state.activeGameId;
  selectedGameId.value = normalizeGameId(selectedGameId.value);
  isApplyingRemoteState = false;
  resetTaskUiState();
}

function setupServerSync() {
  if (!SERVER_SYNC_ENABLED) return;

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
      } else {
        scheduleServerPush(makePayload(lastRevision));
      }

      setupServerEvents();
    })
    .catch(() => {
      serverSyncAvailable = false;
    });
}

function setupServerEvents() {
  if (!serverSyncAvailable || !('EventSource' in globalThis)) return;

  const events = new EventSource(SERVER_EVENTS_URL);

  events.addEventListener('state', event => {
    try {
      applyRemotePayload(JSON.parse(event.data));
    } catch {}
  });

  events.onerror = () => {
    serverSyncAvailable = false;
    events.close();
    setTimeout(setupServerSync, 1500);
  };
}

function scheduleServerPush(payload) {
  if (!SERVER_SYNC_ENABLED) return;

  clearTimeout(serverPushTimer);
  serverPushTimer = setTimeout(() => {
    pushToServer(payload);
  }, SERVER_PUSH_DELAY);
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

async function saveJson() {
  try {
    const json = JSON.stringify(makePayload(Date.now()), null, 2);

    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'tasks.json',
        types: [
          {
            description: 'JSON file',
            accept: {
              'application/json': ['.json']
            }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    }

    const blob = new Blob([json], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'tasks.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (error.name !== 'AbortError') {
      alert('Ошибка сохранения файла');
    }
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
    orders: orders.map(normalizeLoadedOrder)
  };
}

function normalizeLoadedGame(game, index = 0) {
  return {
    id: game?.id || createId(),
    name: normalizeGameName(game?.name || (index === 0 ? DEFAULT_GAME_NAME : `Игра ${index + 1}`)),
    orders: Array.isArray(game?.orders) ? game.orders.map(normalizeLoadedOrder) : []
  };
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
    games: [game],
    activeGameId: game.id
  };
}

function makeDefaultState() {
  const game = makeGame(DEFAULT_GAME_NAME, defaultOrders.map(order => makeOrder(order.title, order.qty, order.icons)));

  return {
    revision: 0,
    sourceId: null,
    games: [game],
    activeGameId: game.id
  };
}

</script>

<template>
  <main class="widget" :class="{ overlay: isOverlayMode }" @click="closeIconMenus">
    <AppHeader
      v-if="!isOverlayMode"
      :title="currentGame?.name || DEFAULT_GAME_NAME"
      :active-count="activeCount"
      :total-count="totalCount"
      :qty-count="qtyCount"
    />

    <GameTabs
      v-if="!isOverlayMode"
      :games="games"
      :active-game-id="activeGameId"
      :selected-game-id="selectedGameId"
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
      v-if="!isOverlayMode"
      v-model:input="input"
      v-model:qty-input="qtyInput"
      @add-order="addOrder"
    />

    <OrdersList
      :orders="displayOrders"
      :icons="ICONS"
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

    <EmptyState :visible="displayOrders.length === 0" />

    <AppFooter
      v-if="!isOverlayMode"
      :filter="filter"
      :overlay-url="overlayUrl"
      :author-name="AUTHOR_NAME"
      :contact-url="CONTACT_URL"
      @set-filter="setFilter"
      @clear-done="clearDone"
      @load-json="loadJson"
      @save-json="saveJson"
    />
  </main>
</template>
