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
  return parseColor(props.modelValue).hex;
});
const alphaValue = computed(() => {
  return Math.round(parseColor(props.modelValue).alpha * 100);
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

function hexToRgb(value) {
  const hex = expandHex(value).replace('#', '');

  return {
    red: parseInt(hex.slice(0, 2), 16),
    green: parseInt(hex.slice(2, 4), 16),
    blue: parseInt(hex.slice(4, 6), 16)
  };
}

function parseColor(value) {
  const raw = String(value || '').trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    return {
      hex: expandHex(raw),
      alpha: 1
    };
  }

  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?/i);
  if (rgb) {
    return {
      hex: rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])),
      alpha: clampAlpha(rgb[4] === undefined ? 1 : Number(rgb[4]))
    };
  }

  return {
    hex: '#ffffff',
    alpha: 1
  };
}

function clampAlpha(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function formatColor(hex, alpha) {
  const normalizedAlpha = clampAlpha(alpha);

  if (normalizedAlpha >= 1) {
    return expandHex(hex);
  }

  const { red, green, blue } = hexToRgb(hex);
  const alphaText = Number(normalizedAlpha.toFixed(2)).toString();

  return `rgba(${red}, ${green}, ${blue}, ${alphaText})`;
}

function updateFromNative(event) {
  emit('update:modelValue', formatColor(event.target.value, parseColor(props.modelValue).alpha));
}

function updateFromText(event) {
  emit('update:modelValue', event.target.value);
}

function updateFromAlpha(event) {
  emit('update:modelValue', formatColor(nativeColor.value, Number(event.target.value) / 100));
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
    <span class="color-picker-alpha">
      <input
        class="color-picker-alpha-range"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="alphaValue"
        :aria-label="`${label}: прозрачность`"
        @input="updateFromAlpha"
      />
      <span class="color-picker-alpha-value">{{ alphaValue }}%</span>
    </span>
  </label>
</template>
