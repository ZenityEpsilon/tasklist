<script setup>
import { computed, ref, watch } from 'vue';
import ColorPicker from './ColorPicker.vue';

const props = defineProps({
  settings: {
    type: Object,
    required: true
  },
  colorFields: {
    type: Array,
    required: true
  },
  baseProfile: {
    type: Object,
    required: true
  },
  embedded: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'save-settings'
]);

const isOpen = ref(false);
const expandedProfileIds = ref(new Set());
const selectedProfileId = ref(props.settings.activeColorProfileId);
const draftSettings = ref(cloneSettings(props.settings));
const isSavingDraft = ref(false);
const isDirty = computed(() => {
  return JSON.stringify(draftSettings.value) !== JSON.stringify(props.settings);
});
function profileHasChanges(profile) {
  if (!profile) return false;

  const savedProfile = props.settings.colorProfiles.find(item => item.id === profile.id);
  const defaultProfileChanged = draftSettings.value.activeColorProfileId !== props.settings.activeColorProfileId
    && (draftSettings.value.activeColorProfileId === profile.id || props.settings.activeColorProfileId === profile.id);
  const adminProfileChanged = draftSettings.value.adminColorProfileId !== props.settings.adminColorProfileId
    && (draftSettings.value.adminColorProfileId === profile.id || props.settings.adminColorProfileId === profile.id);

  return defaultProfileChanged || adminProfileChanged || JSON.stringify(profile) !== JSON.stringify(savedProfile || null);
}
const activeProfile = computed(() => {
  return draftSettings.value.colorProfiles.find(profile => profile.id === selectedProfileId.value)
    || draftSettings.value.colorProfiles[0]
    || null;
});

watch(
  () => props.settings,
  value => {
    if (isSavingDraft.value || !isDirty.value) {
      draftSettings.value = cloneSettings(value);
      selectedProfileId.value = value.activeColorProfileId;
      isSavingDraft.value = false;
    }
  },
  { deep: true }
);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function isProfileExpanded(id) {
  return expandedProfileIds.value.has(id);
}

function toggleProfileExpanded(id) {
  const expandedIds = new Set(expandedProfileIds.value);

  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }

  expandedProfileIds.value = expandedIds;
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uniqueProfileName(baseName) {
  const names = new Set(draftSettings.value.colorProfiles.map(profile => profile.name));
  if (!names.has(baseName)) return baseName;

  let index = 2;
  while (names.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

function setActiveProfile(id) {
  if (draftSettings.value.colorProfiles.some(profile => profile.id === id)) {
    selectedProfileId.value = id;
  }
}

function defaultProfileFallbackId(currentId) {
  return draftSettings.value.colorProfiles.find(profile => profile.id === props.baseProfile.id)?.id
    || draftSettings.value.colorProfiles.find(profile => profile.id !== currentId)?.id
    || currentId
    || draftSettings.value.colorProfiles[0]?.id
    || null;
}

function toggleDefaultProfile(id, enabled) {
  if (!enabled) {
    if (draftSettings.value.activeColorProfileId === id) {
      draftSettings.value.activeColorProfileId = defaultProfileFallbackId(id);
    }
    return;
  }

  if (draftSettings.value.colorProfiles.some(profile => profile.id === id)) {
    draftSettings.value.activeColorProfileId = id;
  }
}

function toggleAdminProfile(id, enabled) {
  if (!enabled) {
    if (draftSettings.value.adminColorProfileId === id) {
      draftSettings.value.adminColorProfileId = '';
    }
    return;
  }

  if (draftSettings.value.colorProfiles.some(profile => profile.id === id)) {
    draftSettings.value.adminColorProfileId = id;
  }
}

function createProfile() {
  const source = props.baseProfile;
  if (!source) return;

  const profile = {
    id: createId(),
    name: uniqueProfileName('Новая палитра'),
    colors: { ...source.colors }
  };

  draftSettings.value.colorProfiles.push(profile);
  selectedProfileId.value = profile.id;
}

function duplicateProfile(id) {
  const source = draftSettings.value.colorProfiles.find(profile => profile.id === id);
  if (!source) return;

  const profile = {
    id: createId(),
    name: uniqueProfileName(`${source.name} копия`),
    colors: { ...source.colors }
  };

  draftSettings.value.colorProfiles.push(profile);
  selectedProfileId.value = profile.id;
}

function removeProfile(id) {
  const profiles = draftSettings.value.colorProfiles;
  if (profiles.length <= 1) return;

  const index = profiles.findIndex(profile => profile.id === id);
  if (index < 0) return;

  profiles.splice(index, 1);
  expandedProfileIds.value = new Set([...expandedProfileIds.value].filter(profileId => profileId !== id));

  if (selectedProfileId.value === id) {
    selectedProfileId.value = profiles[Math.max(0, index - 1)]?.id || profiles[0]?.id || null;
  }

  if (draftSettings.value.activeColorProfileId === id) {
    draftSettings.value.activeColorProfileId = profiles[Math.max(0, index - 1)]?.id || profiles[0]?.id || null;
  }

  if (draftSettings.value.adminColorProfileId === id) {
    draftSettings.value.adminColorProfileId = '';
  }
}

function updateName(profile, event) {
  profile.name = event.target.value.trim() || 'Палитра';
}

function updateColor(profile, key, value) {
  profile.colors[key] = String(value || '').trim();
}

function resetDraft() {
  draftSettings.value = cloneSettings(props.settings);
  selectedProfileId.value = props.settings.activeColorProfileId;
}

function resetProfile(profile) {
  if (!profile) return;

  const index = draftSettings.value.colorProfiles.findIndex(item => item.id === profile.id);
  if (index < 0) return;

  const savedProfile = props.settings.colorProfiles.find(item => item.id === profile.id);

  if (!savedProfile) {
    draftSettings.value.colorProfiles.splice(index, 1);
    selectedProfileId.value = draftSettings.value.colorProfiles[Math.max(0, index - 1)]?.id
      || draftSettings.value.colorProfiles[0]?.id
      || null;
  } else {
    draftSettings.value.colorProfiles[index] = cloneSettings(savedProfile);
  }

  if (
    draftSettings.value.activeColorProfileId === profile.id
    || props.settings.activeColorProfileId === profile.id
  ) {
    draftSettings.value.activeColorProfileId = props.settings.activeColorProfileId;
  }

  if (
    draftSettings.value.adminColorProfileId === profile.id
    || props.settings.adminColorProfileId === profile.id
  ) {
    draftSettings.value.adminColorProfileId = props.settings.adminColorProfileId || '';
  }
}

function saveDraft() {
  isSavingDraft.value = true;
  emit('save-settings', cloneSettings(draftSettings.value));
}
</script>

<template>
  <section class="program-settings" :class="{ embedded }" @click.stop>
    <button
      v-if="!embedded"
      class="program-settings-toggle"
      :class="{ open: isOpen }"
      type="button"
      :aria-expanded="isOpen"
      title="Настройки программы"
      @click="toggleOpen"
    >
      <span>⚙</span>
      <span>Настройки программы</span>
      <span></span>
    </button>

    <div v-if="embedded || isOpen" class="program-settings-panel">
      <div class="settings-toolbar">
        <div class="settings-title">
          <span>Палитра OBS</span>
          <strong>{{ activeProfile?.name }}</strong>
        </div>
      </div>

      <div class="settings-toolbar compact">
        <span class="settings-hint">Изменения применятся к OBS только после сохранения.</span>
        <button class="settings-action primary" type="button" @click="createProfile">
          Создать
        </button>
      </div>

      <div class="profile-list" role="list">
        <div
          v-for="profile in draftSettings.colorProfiles"
          :key="profile.id"
          class="profile-shell"
        >
          <article
            class="profile-item"
            :class="{ active: profile.id === selectedProfileId, default: profile.id === draftSettings.activeColorProfileId }"
            role="listitem"
            tabindex="0"
            @click="setActiveProfile(profile.id)"
            @keydown.enter.prevent="setActiveProfile(profile.id)"
            @keydown.space.prevent="setActiveProfile(profile.id)"
          >
            <input
              class="profile-name"
              type="text"
              :value="profile.name"
              spellcheck="false"
              @change="updateName(profile, $event)"
              @click.stop
              @keydown.enter.prevent="$event.currentTarget.blur()"
            />
            <div class="profile-preview" aria-hidden="true">
              <span
                v-for="field in colorFields.slice(0, 6)"
                :key="field.key"
                :style="{ background: profile.colors[field.key] }"
              ></span>
            </div>
            <div class="profile-save-actions">
              <button
                class="settings-action icon-only"
                type="button"
                :aria-expanded="isProfileExpanded(profile.id)"
                :aria-controls="`palette-grid-${profile.id}`"
                :title="isProfileExpanded(profile.id) ? 'Свернуть профиль' : 'Развернуть профиль'"
                :aria-label="isProfileExpanded(profile.id) ? 'Свернуть профиль' : 'Развернуть профиль'"
                @click.stop="toggleProfileExpanded(profile.id)"
              >
                <span aria-hidden="true">{{ isProfileExpanded(profile.id) ? '▴' : '▾' }}</span>
              </button>
              <button
                v-if="profileHasChanges(profile)"
                class="settings-action icon-only"
                type="button"
                title="Вернуть к исходным"
                aria-label="Вернуть к исходным"
                @click.stop="resetProfile(profile)"
              >
                <span aria-hidden="true">↺</span>
              </button>
              <button
                v-if="profileHasChanges(profile)"
                class="settings-action primary icon-only"
                type="button"
                title="Сохранить"
                aria-label="Сохранить"
                @click.stop="saveDraft"
              >
                <span aria-hidden="true">✓</span>
              </button>
            </div>
            <button class="settings-action icon-only" type="button" title="Копия" aria-label="Копия" @click.stop="duplicateProfile(profile.id)">
              <span aria-hidden="true">⧉</span>
            </button>
            <button
              class="settings-action danger icon-only"
              type="button"
              :disabled="draftSettings.colorProfiles.length <= 1"
              title="Удалить"
              aria-label="Удалить"
              @click.stop="removeProfile(profile.id)"
            >
              <span aria-hidden="true">×</span>
            </button>
          </article>

          <div v-if="isProfileExpanded(profile.id)" :id="`palette-grid-${profile.id}`" class="active-profile-settings">
            <label class="profile-default-toggle">
              <input
                type="checkbox"
                :checked="profile.id === draftSettings.activeColorProfileId"
                @change="toggleDefaultProfile(profile.id, $event.target.checked)"
              />
              <span>Использовать этот профиль по умолчанию</span>
            </label>
            <label class="profile-default-toggle">
              <input
                type="checkbox"
                :checked="profile.id === draftSettings.adminColorProfileId"
                @change="toggleAdminProfile(profile.id, $event.target.checked)"
              />
              <span>Использовать для панели администратора</span>
            </label>

            <div class="palette-grid">
              <ColorPicker
                v-for="field in colorFields"
                :key="field.key"
                :label="field.label"
                :model-value="profile.colors[field.key]"
                @update:model-value="updateColor(profile, field.key, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
