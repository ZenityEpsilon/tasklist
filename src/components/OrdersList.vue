<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue';
import OrderItem from './OrderItem.vue';

const props = defineProps({
  orders: {
    type: Array,
    required: true
  },
  icons: {
    type: Array,
    required: true
  },
  showIcons: {
    type: Boolean,
    default: false
  },
  isOverlayMode: {
    type: Boolean,
    default: false
  },
  openedPicker: {
    type: String,
    default: null
  },
  completingOverlayIds: {
    type: Object,
    required: true
  },
  draggedId: {
    type: String,
    default: null
  },
  dragOverId: {
    type: String,
    default: null
  },
  iconPath: {
    type: Function,
    required: true
  }
});

const emit = defineEmits([
  'drag-end',
  'drag-enter',
  'drag-start',
  'drop',
  'finish-editing',
  'overlay-animation-end',
  'remove-order',
  'set-icon',
  'toggle-done',
  'toggle-picker',
  'update-qty'
]);

const ordersElement = ref(null);
const overlayCapacity = ref(Number.POSITIVE_INFINITY);
let resizeObserver = null;

const renderedOrders = computed(() => {
  if (!props.isOverlayMode) return props.orders;
  if (!Number.isFinite(overlayCapacity.value)) return props.orders;

  const capacity = Math.max(0, overlayCapacity.value);
  if (props.orders.length <= capacity) return props.orders;
  if (capacity <= 1) return [];

  return props.orders.slice(0, capacity - 1);
});

const hiddenOrdersCount = computed(() => {
  if (!props.isOverlayMode) return 0;
  return props.orders.length - renderedOrders.value.length;
});

watch(
  () => [props.orders.length, props.showIcons, props.isOverlayMode],
  () => scheduleOverlayCapacityUpdate(),
  { flush: 'post' }
);

onMounted(() => {
  window.addEventListener('resize', scheduleOverlayCapacityUpdate);

  if ('ResizeObserver' in globalThis) {
    resizeObserver = new ResizeObserver(scheduleOverlayCapacityUpdate);
    if (ordersElement.value) {
      resizeObserver.observe(ordersElement.value);
    }
  }

  scheduleOverlayCapacityUpdate();
});

onUpdated(() => {
  scheduleOverlayCapacityUpdate();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleOverlayCapacityUpdate);
  resizeObserver?.disconnect();
});

function scheduleOverlayCapacityUpdate() {
  if (!props.isOverlayMode) {
    overlayCapacity.value = Number.POSITIVE_INFINITY;
    return;
  }

  nextTick(updateOverlayCapacity);
}

function updateOverlayCapacity() {
  const element = ordersElement.value;
  if (!element || !props.isOverlayMode) return;

  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  const gap = Number.parseFloat(styles.rowGap || styles.gap) || 7;
  const itemHeight = measureOverlayItemHeight(element);
  const availableHeight = Math.max(0, window.innerHeight - rect.top);
  const capacity = Math.max(0, Math.floor((availableHeight + gap) / (itemHeight + gap)));

  overlayCapacity.value = capacity;
}

function measureOverlayItemHeight(element) {
  const firstOrder = element.querySelector('.order');
  if (firstOrder) {
    return firstOrder.getBoundingClientRect().height || 46;
  }

  return 46;
}
</script>

<template>
  <div ref="ordersElement" class="orders">
    <OrderItem
      v-for="order in renderedOrders"
      :key="order.id"
      :order="order"
      :icons="icons"
      :show-icons="showIcons"
      :is-overlay-mode="isOverlayMode"
      :opened-picker="openedPicker"
      :completing-overlay-ids="completingOverlayIds"
      :dragged-id="draggedId"
      :drag-over-id="dragOverId"
      :icon-path="iconPath"
      @drag-start="emit('drag-start', $event)"
      @drag-enter="emit('drag-enter', $event)"
      @drop="emit('drop', $event)"
      @drag-end="emit('drag-end')"
      @overlay-animation-end="(order, event) => emit('overlay-animation-end', order, event)"
      @toggle-done="emit('toggle-done', $event)"
      @toggle-picker="(orderId, index) => emit('toggle-picker', orderId, index)"
      @set-icon="(order, index, iconId) => emit('set-icon', order, index, iconId)"
      @finish-editing="emit('finish-editing', $event)"
      @update-qty="emit('update-qty', $event)"
      @remove-order="emit('remove-order', $event)"
    />
    <div v-if="hiddenOrdersCount > 0" class="order overlay-more">
      <span class="text text-view">И ещё {{ hiddenOrdersCount }}</span>
    </div>
  </div>
</template>
