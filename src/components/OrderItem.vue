<script setup>
defineProps({
  order: {
    type: Object,
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

function commitOnEnter(event) {
  event.preventDefault();
  event.currentTarget.blur();
}
</script>

<template>
  <article
    class="order"
    :class="{
      done: order.done,
      'menu-open': openedPicker?.startsWith(`${order.id}:`),
      'overlay-completing': completingOverlayIds.has(order.id),
      dragging: draggedId === order.id,
      'drag-over': dragOverId === order.id,
      'with-icons': showIcons,
      'without-icons': !showIcons
    }"
    :draggable="!isOverlayMode"
    @dragstart="emit('drag-start', order)"
    @dragenter.prevent="emit('drag-enter', order)"
    @dragover.prevent
    @drop.prevent="emit('drop', order)"
    @dragend="emit('drag-end')"
    @animationend="emit('overlay-animation-end', order, $event)"
  >
    <button v-if="!isOverlayMode" class="drag" type="button" title="Перетащить"></button>
    <button v-if="!isOverlayMode" class="check" type="button" @click="emit('toggle-done', order)">✓</button>

    <div v-if="showIcons" class="icons" @click.stop>
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
          @click="!isOverlayMode && emit('toggle-picker', order.id, index)"
        >
          <img :src="iconPath(iconId)" alt="" />
        </button>
        <div v-if="!isOverlayMode" class="icon-menu">
          <button
            v-for="icon in icons"
            :key="icon.id"
            class="icon-option"
            :class="{ active: icon.id === iconId }"
            type="button"
            @click="emit('set-icon', order, index, icon.id)"
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
      @blur="emit('finish-editing', order)"
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
      @change="emit('update-qty', order)"
    />
    <button v-if="!isOverlayMode" class="delete" type="button" @click="emit('remove-order', order.id)">×</button>
  </article>
</template>
