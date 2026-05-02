<script setup>
import { computed, ref, watch } from 'vue';

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

const defaultOrders = [
  { title: 'АирСоком Wise Forest', qty: 1, icons: ['RU_MECH', 'US_SOF'] },
  { title: 'Freimann Береги+Шилки', qty: 1, icons: ['RU_MOTOSTRELKI', 'RU_MECH'] },
  { title: 'F1reRain VDV', qty: 2, icons: ['RU_VDV', 'RU_MECH'] },
  { title: 'Марин+Соком Mirror', qty: 1, icons: ['US_MARINES', 'US_SOF'] },
  { title: 'ТанкВДВЧугун', qty: 2, icons: ['RU_TANK', 'RU_VDV'] },
  { title: 'ЯкорьВДВ Вертораш', qty: 2, icons: ['RU_VDV', 'RU_MORSKAYA'] },
  { title: 'Пехотная РФ', qty: 2, icons: ['RU_MOTOSTRELKI', 'RU_MECH'] },
  { title: 'ВДВ+Море Mirror', qty: 1, icons: ['RU_VDV', 'RU_MORSKAYA'] },
  { title: 'Балтиец эйфория', qty: 2, icons: ['RU_MECH', 'RU_MECH'] }
];

const input = ref('');
const qtyInput = ref(1);
const filter = ref('all');
const openedPicker = ref(null);
const draggedId = ref(null);
const dragOverId = ref(null);
const fileInput = ref(null);
const loadedState = load();
const orders = ref(loadedState.orders);
const completingOverlayIds = ref(new Set());
let lastRevision = loadedState.revision;
let isApplyingRemoteState = false;
let lastRawStorage = localStorage.getItem(STORAGE_KEY) || '';
let syncChannel = null;
let serverPushTimer = null;
let serverSyncAvailable = false;
let previousOverlayDone = new Map(orders.value.map(order => [order.id, Boolean(order.done)]));
const overlayCompletionTimers = new Map();

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

watch(
  orders,
  value => {
    if (isApplyingRemoteState) return;
    persistOrders(value);
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

function commitOnEnter(event) {
  event.preventDefault();
  event.currentTarget.blur();
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

function openFileDialog() {
  fileInput.value?.click();
}

function loadJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (!Array.isArray(data)) {
        throw new Error('JSON должен быть массивом');
      }

      orders.value = data.map(normalizeLoadedOrder);
    } catch {
      alert('Не удалось загрузить JSON');
    }
  };

  reader.readAsText(file, 'UTF-8');
}

function persistOrders(value) {
  const payload = {
    version: 2,
    sourceId: TAB_ID,
    revision: Date.now(),
    orders: value
  };

  lastRawStorage = JSON.stringify(payload);
  const plainPayload = JSON.parse(lastRawStorage);

  lastRevision = plainPayload.revision;
  localStorage.setItem(STORAGE_KEY, lastRawStorage);
  if (LOCAL_TAB_SYNC_ENABLED) {
    syncChannel?.postMessage(plainPayload);
  }
  scheduleServerPush(plainPayload);
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
  if (
    !payload ||
    payload.sourceId === TAB_ID ||
    payload.revision <= lastRevision ||
    !Array.isArray(payload.orders)
  ) {
    return;
  }

  lastRevision = payload.revision;
  isApplyingRemoteState = true;
  orders.value = payload.orders.map(normalizeLoadedOrder);
  isApplyingRemoteState = false;
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
        scheduleServerPush({
          version: 2,
          sourceId: TAB_ID,
          revision: lastRevision,
          orders: orders.value
        });
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
    const json = JSON.stringify(orders.value, null, 2);

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

  if (!fromId || fromId === targetOrder.id) return;

  const current = orders.value.slice();
  const fromIndex = current.findIndex(order => order.id === fromId);
  const toIndex = current.findIndex(order => order.id === targetOrder.id);

  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  orders.value = current;
}

function onDragEnd() {
  draggedId.value = null;
  dragOverId.value = null;
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

  return {
    revision: 0,
    orders: defaultOrders.map(order => makeOrder(order.title, order.qty, order.icons))
  };
}

function parseStoredState(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (Array.isArray(data)) {
    return {
      revision: 0,
      sourceId: null,
      orders: data.map(normalizeLoadedOrder)
    };
  }

  if (Array.isArray(data?.orders)) {
    return {
      revision: Number(data.revision) || 0,
      sourceId: data.sourceId || null,
      orders: data.orders.map(normalizeLoadedOrder)
    };
  }

  throw new Error('Invalid stored orders payload');
}

</script>

<template>
  <main class="widget" :class="{ overlay: isOverlayMode }" @click="closeIconMenus">
    <div v-if="!isOverlayMode" class="top">
      <h1>Список заказов</h1>
      <div class="counter">
        <span>{{ activeCount }}</span>/<span>{{ totalCount }}</span>
        · шт: <span>{{ qtyCount }}</span>
      </div>
    </div>

    <form v-if="!isOverlayMode" class="form" @submit.prevent="addOrder">
      <input
        v-model="input"
        class="input"
        type="text"
        placeholder="Новый заказ"
        autocomplete="off"
      />
      <input
        v-model.number="qtyInput"
        class="qty-input"
        type="number"
        min="1"
        step="1"
        title="Количество"
      />
      <button class="add" type="submit">+</button>
    </form>

    <div class="orders">
      <article
        v-for="order in displayOrders"
        :key="order.id"
        class="order"
        :class="{
          done: order.done,
          'menu-open': openedPicker?.startsWith(`${order.id}:`),
          'overlay-completing': completingOverlayIds.has(order.id),
          dragging: draggedId === order.id,
          'drag-over': dragOverId === order.id
        }"
        :draggable="!isOverlayMode"
        @dragstart="onDragStart(order)"
        @dragenter.prevent="onDragEnter(order)"
        @dragover.prevent
        @drop.prevent="onDrop(order)"
        @dragend="onDragEnd"
        @animationend="onOverlayAnimationEnd(order, $event)"
      >
        <button v-if="!isOverlayMode" class="drag" type="button" title="Перетащить"></button>
        <button v-if="!isOverlayMode" class="check" type="button" @click="toggleDone(order)">✓</button>

        <div class="icons" @click.stop>
          <div
            v-for="(iconId, index) in order.icons"
            :key="`${order.id}-${index}`"
            class="icon-picker"
            :class="{ open: openedPicker === `${order.id}:${index}` }"
          >
            <button
              class="icon-main"
              type="button"
              :disabled="isOverlayMode"
              @click="!isOverlayMode && togglePicker(order.id, index)"
            >
              <img :src="iconPath(iconId)" alt="" />
            </button>
            <div v-if="!isOverlayMode" class="icon-menu">
              <button
                v-for="icon in ICONS"
                :key="icon.id"
                class="icon-option"
                :class="{ active: icon.id === iconId }"
                type="button"
                @click="setIcon(order, index, icon.id)"
              >
                <img :src="iconPath(icon.id)" alt="" />
                <span>{{ icon.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <span v-if="isOverlayMode" class="text text-view">{{ order.title }}</span>
        <input
          v-else
          v-model="order.title"
          class="text"
          type="text"
          spellcheck="false"
          @blur="finishEditing(order)"
          @keydown.enter="commitOnEnter"
        />

        <span v-if="isOverlayMode" class="qty qty-view">{{ order.qty }}</span>
        <input
          v-else
          v-model.number="order.qty"
          class="qty"
          type="number"
          min="1"
          step="1"
          @change="updateQty(order)"
        />
        <button v-if="!isOverlayMode" class="delete" type="button" @click="removeOrder(order.id)">×</button>
      </article>
    </div>

    <div class="empty" :class="{ visible: displayOrders.length === 0 }">Пусто</div>

    <div v-if="!isOverlayMode" class="footer">
      <div>
        <button
          class="filter"
          :class="{ active: filter === 'all' }"
          type="button"
          @click="setFilter('all')"
        >
          Все
        </button>
        <button
          class="filter"
          :class="{ active: filter === 'active' }"
          type="button"
          @click="setFilter('active')"
        >
          Актив
        </button>
        <button
          class="filter"
          :class="{ active: filter === 'done' }"
          type="button"
          @click="setFilter('done')"
        >
          Готово
        </button>
      </div>

      <button class="clear" type="button" @click="clearDone">Очистить</button>

      <div class="file-actions">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".json,application/json"
          @change="loadJson"
        />
        <button class="file-btn" type="button" @click="openFileDialog">Загрузить JSON</button>
        <button class="file-btn" type="button" @click="saveJson">Сохранить JSON</button>
        <a class="file-btn" :href="overlayUrl" target="_blank" rel="noreferrer">OBS</a>
        <a class="contact-link" :href="CONTACT_URL" target="_blank" rel="noreferrer">
          {{ AUTHOR_NAME }}
        </a>
      </div>
    </div>
  </main>
</template>
