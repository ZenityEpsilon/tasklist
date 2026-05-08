<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue';

const props = defineProps({
  games: {
    type: Array,
    required: true
  },
  activeGameId: {
    type: String,
    default: null
  },
  selectedGameId: {
    type: String,
    default: null
  },
  draggedId: {
    type: String,
    default: null
  },
  draggedSourceGameId: {
    type: String,
    default: null
  },
  dragOverGameId: {
    type: String,
    default: null
  },
  gameInput: {
    type: String,
    default: ''
  }
});

const emit = defineEmits([
  'add-game',
  'drag-enter-game',
  'drop-game',
  'finish-game-editing',
  'remove-game',
  'select-game',
  'set-active-game',
  'update:game-input'
]);

const gamesList = ref(null);
const gameInputElement = ref(null);
const isGameFormOpen = ref(false);
const isSettingsOpen = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const selectedGame = computed(() => {
  return props.games.find(game => game.id === props.selectedGameId) || props.games[0] || null;
});
const scrollClass = computed(() => ({
  'can-scroll-left': canScrollLeft.value,
  'can-scroll-right': canScrollRight.value
}));

function ensureGameSettings(game) {
  if (!game.settings) {
    game.settings = {};
  }

  if (typeof game.settings.showIcons !== 'boolean') {
    game.settings.showIcons = false;
  }

  return game.settings;
}

function toggleSettings() {
  isSettingsOpen.value = !isSettingsOpen.value;
}

function updateShowIcons(event) {
  const game = selectedGame.value;
  if (!game) return;

  ensureGameSettings(game).showIcons = event.target.checked;
}

function updateGameInput(event) {
  emit('update:game-input', event.target.value);
}

function openGameForm() {
  isGameFormOpen.value = true;
  nextTick(() => {
    gameInputElement.value?.focus();
  });
}

function closeGameForm() {
  isGameFormOpen.value = false;
}

function submitGameForm() {
  if (!isGameFormOpen.value) {
    openGameForm();
    return;
  }

  if (gameInputElement.value?.value.trim()) {
    emit('add-game');
  }

  closeGameForm();
}

function commitOnEnter(event) {
  event.preventDefault();
  event.currentTarget.blur();
}

function updateScrollState() {
  const element = gamesList.value;
  if (!element) return;

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  canScrollLeft.value = element.scrollLeft > 1;
  canScrollRight.value = element.scrollLeft < maxScrollLeft - 1;
}

function onWheel(event) {
  const element = gamesList.value;
  if (!element) return;

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  if (maxScrollLeft <= 0) return;

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (delta === 0) return;

  event.preventDefault();
  element.scrollLeft += delta;
  updateScrollState();
}

onMounted(() => {
  nextTick(updateScrollState);
  window.addEventListener('resize', updateScrollState);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScrollState);
});

onUpdated(() => {
  nextTick(updateScrollState);
});
</script>

<template>
  <section class="games-panel" @click.stop>
    <div
      ref="gamesList"
      class="games-list"
      :class="scrollClass"
      @scroll="updateScrollState"
      @wheel="onWheel"
    >
      <article
        v-for="game in games"
        :key="game.id"
        class="game-item"
        :class="{
          active: game.id === activeGameId,
          selected: game.id === selectedGameId,
          'drop-ready': draggedId && game.id !== draggedSourceGameId,
          'drop-over': dragOverGameId === game.id
        }"
        @dragenter.prevent="emit('drag-enter-game', game)"
        @dragover.prevent="emit('drag-enter-game', game)"
        @drop.prevent="emit('drop-game', game)"
        @click="emit('select-game', game.id)"
      >
          <input
            v-model="game.name"
            class="game-name"
            :style="{ '--game-name-length': Math.max(4, game.name?.length || 0) }"
            type="text"
          spellcheck="false"
          @blur="emit('finish-game-editing', game)"
          @keydown.enter="commitOnEnter"
        />
        <button
          class="game-activate"
          type="button"
          :disabled="game.id === activeGameId"
          @click.stop="emit('set-active-game', game.id)"
        >
          {{ game.id === activeGameId ? 'Активно' : 'Выбрать' }}
        </button>
        <button
          class="game-delete"
          type="button"
          title="Удалить игру"
          :disabled="games.length <= 1"
          @click.stop="emit('remove-game', game.id)"
        >
          ×
        </button>
      </article>
    </div>

    <form
      class="game-form"
      :class="{ open: isGameFormOpen }"
      @submit.prevent="submitGameForm"
    >
      <input
        ref="gameInputElement"
        :value="gameInput"
        class="game-input"
        type="text"
        placeholder="Новая игра"
        autocomplete="off"
        @input="updateGameInput"
      />
      <button class="game-add" type="button" @click="submitGameForm">+</button>
    </form>

    <div class="game-settings-shell">
      <button
        class="game-settings-toggle"
        :class="{ open: isSettingsOpen }"
        type="button"
        :aria-expanded="isSettingsOpen"
        title="Настройки игры"
        @click="toggleSettings"
      >
        <span class="game-settings-toggle-text">Настройки игры</span>
        <span></span>
      </button>

      <div v-if="isSettingsOpen && selectedGame" class="game-settings">
        <label class="game-setting">
          <input
            type="checkbox"
            :checked="Boolean(selectedGame.settings?.showIcons)"
            @change="updateShowIcons"
          />
          <span>Показывать иконки</span>
          <span class="setting-info" title="Иконки Brocken Arrow">i</span>
        </label>
      </div>
    </div>
  </section>
</template>
