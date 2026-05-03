<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <div class="empty" :class="{ visible }">Пусто</div>
</template>
