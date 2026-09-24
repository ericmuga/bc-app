<template>
  <div>
    <h2>Reporting &amp; Analytics</h2>
    <p class="text-muted">Reports available for your role, grouped by business area.</p>
    <div class="report-groups">
      <section v-for="group in groups" :key="group.key" class="bc-card">
        <h3>{{ group.label }}</h3>
        <RouterLink v-for="report in group.reports" :key="report.path" :to="report.path" class="report-link">
          <i :class="report.icon" /> {{ report.label }} <i class="pi pi-angle-right" />
        </RouterLink>
      </section>
    </div>
    <p v-if="!groups.length" class="text-muted">No reports are assigned to your role.</p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { reportGroupsForRole } from '../../../shared/reportAccess.mjs'
const auth = useAuthStore()
const groups = computed(() => reportGroupsForRole(auth.effectiveRole))
</script>
<style scoped>
.report-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; margin-top: 22px; }
h3 { margin-bottom: 10px; }
.report-link { display: flex; align-items: center; gap: 10px; padding: 12px 0; color: var(--bc-text); text-decoration: none; }
.report-link:hover { color: var(--bc-primary-light); }
.report-link .pi-angle-right { margin-left: auto; }
</style>
