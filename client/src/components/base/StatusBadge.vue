<template>
  <span class="badge" :class="cls">
    <i v-if="icon" :class="`pi ${icon}`" style="font-size:10px" />
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ status: String })

const map = {
  Open:      { label: 'Open',      cls: 'badge-open',      icon: 'pi-clock' },
  Confirmed: { label: 'Confirmed', cls: 'badge-confirmed', icon: 'pi-check-circle' },
  Invoiced:  { label: 'Invoiced',  cls: 'badge-invoiced',  icon: 'pi-file-check' },
}

const entry = computed(() => map[props.status] ?? { label: props.status, cls: 'badge-open', icon: '' })
const label = computed(() => entry.value.label)
const cls   = computed(() => entry.value.cls)
const icon  = computed(() => entry.value.icon)
</script>
