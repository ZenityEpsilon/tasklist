<script setup>
import OrderItem from './OrderItem.vue';

defineProps({
  orders: {
    type: Array,
    required: true
  },
  icons: {
    type: Array,
    required: true
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
</script>

<template>
  <div class="orders">
    <OrderItem
      v-for="order in orders"
      :key="order.id"
      :order="order"
      :icons="icons"
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
  </div>
</template>
