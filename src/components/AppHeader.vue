<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  activeCount: {
    type: Number,
    required: true
  },
  totalCount: {
    type: Number,
    required: true
  },
  qtyCount: {
    type: Number,
    required: true
  }
});
</script>

<template>
  <div class="top">
    <h1>{{ title }}</h1>
    <div class="counter">
      <span>{{ activeCount }}</span>/<span>{{ totalCount }}</span>
      · шт: <span>{{ qtyCount }}</span>
    </div>
  </div>
</template>
