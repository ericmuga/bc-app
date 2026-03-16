<template>
  <RouterView />
  <Toast position="bottom-right" />
  <ConfirmDialog />
</template>

<script setup>
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
</script>
