<script setup>
import { ref } from 'vue';

defineProps({
  filter: {
    type: String,
    required: true
  },
  overlayUrl: {
    type: String,
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  contactUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['clear-done', 'load-json', 'save-json', 'set-filter']);
const fileInput = ref(null);

function openFileDialog() {
  fileInput.value?.click();
}
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
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="emit('load-json', $event)"
      />
      <button class="file-btn" type="button" @click="openFileDialog">Загрузить JSON</button>
      <button class="file-btn" type="button" @click="emit('save-json')">Сохранить JSON</button>
      <a class="file-btn" :href="overlayUrl" target="_blank" rel="noreferrer">OBS</a>
      <a class="contact-link" :href="contactUrl" target="_blank" rel="noreferrer">
        {{ authorName }}
      </a>
    </div>
  </div>
</template>
