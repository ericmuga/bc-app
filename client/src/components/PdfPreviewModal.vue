<template>
  <Dialog
    v-model:visible="visibleProxy"
    :header="header"
    :modal="true"
    :closable="!loading"
    :style="{ width: '780px', height: '85vh' }"
    content-class="pdf-preview-content"
  >
    <div v-if="loading" class="pdf-loading">
      <i class="pi pi-spin pi-spinner" /> Loading PDF…
    </div>
    <div v-else-if="error" class="pdf-error">
      <i class="pi pi-exclamation-triangle" />
      <span>{{ error }}</span>
    </div>
    <iframe v-else-if="objectUrl" :src="objectUrl" class="pdf-frame" />

    <template #footer>
      <Button label="Close" text @click="visibleProxy = false" />
      <Button v-if="objectUrl" label="Open in new tab" icon="pi pi-external-link"
              text @click="openExternal" />
      <Button v-if="primaryLabel"
              :label="primaryLabel"
              :icon="primaryIcon || 'pi pi-check'"
              :severity="primarySeverity || 'success'"
              :loading="primaryLoading"
              :disabled="!objectUrl"
              @click="$emit('confirm')" />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

const props = defineProps({
  visible:        { type: Boolean, default: false },
  header:         { type: String,  default: 'Preview' },
  // Either provide a function that resolves to a Blob, or a Blob directly
  fetcher:        { type: Function, default: null },
  blob:           { type: Blob,    default: null },
  // Optional confirm action (e.g. "Send to Printer")
  primaryLabel:   { type: String,  default: '' },
  primaryIcon:    { type: String,  default: '' },
  primarySeverity:{ type: String,  default: '' },
  primaryLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible', 'confirm', 'opened'])

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const loading   = ref(false)
const error     = ref('')
const objectUrl = ref('')

function revoke() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

async function load() {
  loading.value = true; error.value = ''
  revoke()
  try {
    let b = props.blob
    if (!b && props.fetcher) {
      const res = await props.fetcher()
      b = res.data || res
    }
    if (!b) throw new Error('No PDF data provided')
    objectUrl.value = URL.createObjectURL(b)
    emit('opened', objectUrl.value)
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Failed to load PDF'
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) load()
  else   revoke()
})

function openExternal() {
  if (objectUrl.value) window.open(objectUrl.value, '_blank')
}

onBeforeUnmount(revoke)
</script>

<style scoped>
.pdf-frame {
  width: 100%;
  height: calc(85vh - 130px);
  border: none;
  background: #f3f4f6;
}
.pdf-loading, .pdf-error {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; height: 200px; color: #6b7280;
}
.pdf-error { color: #b91c1c; }
:deep(.pdf-preview-content) { padding: 0; }
</style>
