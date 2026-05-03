<script setup>
defineProps({
  input: {
    type: String,
    default: ''
  },
  qtyInput: {
    type: Number,
    default: 1
  }
});

const emit = defineEmits(['add-order', 'update:input', 'update:qty-input']);

function updateInput(event) {
  emit('update:input', event.target.value);
}

function updateQtyInput(event) {
  emit('update:qty-input', Number(event.target.value));
}
</script>

<template>
  <form class="form" @submit.prevent="emit('add-order')">
    <input
      :value="input"
      class="input"
      type="text"
      placeholder="Новый заказ"
      autocomplete="off"
      @input="updateInput"
    />
    <input
      :value="qtyInput"
      class="qty-input"
      type="number"
      min="1"
      step="1"
      title="Количество"
      @input="updateQtyInput"
    />
    <button class="add" type="submit">+</button>
  </form>
</template>
