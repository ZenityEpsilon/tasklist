<script setup>
defineProps({
  filter: {
    type: String,
    required: true
  },
  chatLoading: {
    type: Boolean,
    default: false
  },
  chatReady: {
    type: Boolean,
    default: false
  },
  tasksUrl: {
    type: String,
    required: true
  },
  chatUrl: {
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
      <div class="file-btn-stack">
        <a
          v-if="chatReady"
          class="file-btn"
          :href="chatUrl"
          target="_blank"
          rel="noreferrer"
        >
          Чат
        </a>
        <button
          v-else
          class="file-btn is-disabled"
          type="button"
          disabled
        >
          Чат
        </button>
        <div class="file-btn-progress" :class="{ active: chatLoading }" aria-hidden="true">
          <span></span>
        </div>
      </div>
      <a class="file-btn" :href="tasksUrl" target="_blank" rel="noreferrer">Задачи</a>
    </div>
  </div>
</template>
