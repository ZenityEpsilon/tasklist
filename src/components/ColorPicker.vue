<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);

const nativeColor = computed(() => {
  const value = String(props.modelValue || '').trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    return expandHex(value);
  }

  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  return '#ffffff';
});

function expandHex(value) {
  const normalized = value.toLowerCase();

  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return normalized;
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function updateFromNative(event) {
  emit('update:modelValue', event.target.value);
}

function updateFromText(event) {
  emit('update:modelValue', event.target.value);
}
</script>

<template>
  <label class="color-picker">
    <span class="color-picker-label">{{ label }}</span>
    <span class="color-picker-control">
      <span class="color-picker-swatch" :style="{ background: modelValue }"></span>
      <input
        class="color-picker-native"
        type="color"
        :value="nativeColor"
        :title="label"
        @input="updateFromNative"
      />
      <input
        class="color-picker-value"
        type="text"
        :value="modelValue"
        spellcheck="false"
        @change="updateFromText"
        @keydown.enter.prevent="$event.currentTarget.blur()"
      />
    </span>
  </label>
</template>
