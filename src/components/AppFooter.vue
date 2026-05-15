<script setup>
defineProps({
  filter: {
    type: String,
    required: true
  },
  overlayUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['clear-done', 'set-filter']);
</script>

<template>
  <div class="footer">
    <div>
      <button
        class="filter"
        :class="{ active: filter === 'all' }"
        type="button"
        @click="emit('set-filter', 'all')"
      >
        Все
      </button>
      <button
        class="filter"
        :class="{ active: filter === 'active' }"
        type="button"
        @click="emit('set-filter', 'active')"
      >
        Актив
      </button>
      <button
        class="filter"
        :class="{ active: filter === 'done' }"
        type="button"
        @click="emit('set-filter', 'done')"
      >
        Готово
      </button>
    </div>

    <button class="clear" type="button" @click="emit('clear-done')">Очистить</button>

    <div class="file-actions">
      <a class="file-btn" :href="overlayUrl" target="_blank" rel="noreferrer">OBS</a>
    </div>
  </div>
</template>
