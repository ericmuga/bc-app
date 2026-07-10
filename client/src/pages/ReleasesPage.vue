<template>
  <div class="rel-page">
    <header class="page-head">
      <h2><i class="pi pi-tag" /> Releases</h2>
      <p class="text-muted text-sm">Change history for the app. The badge below is the build currently running.</p>
    </header>

    <section v-if="build" class="build-card">
      <div class="bc-row">
        <span class="bc-label">Running build</span>
        <span class="bc-commit">{{ build.shortCommit || '—' }}</span>
        <span v-if="build.branch" class="bc-branch">{{ build.branch }}</span>
        <span v-if="build.version" class="bc-ver">v{{ build.version }}</span>
      </div>
      <div class="bc-msg text-muted text-sm">{{ build.message || '' }}</div>
      <div class="bc-time text-muted text-sm">
        Committed: {{ fmt(build.committedAt) }} · Server up since: {{ fmt(build.startedAt) }}
      </div>
    </section>

    <section class="timeline">
      <article v-for="(r, i) in releases" :key="i" class="rel">
        <div class="rel-head">
          <span class="rel-ver">{{ r.version }}</span>
          <span class="rel-title">{{ r.title }}</span>
          <span class="rel-meta text-muted text-sm">{{ r.date }} · {{ r.commit }}</span>
        </div>
        <ul class="rel-items">
          <li v-for="(it, j) in r.items" :key="j">{{ it }}</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '@/services/api.js'
import { releases } from '@/data/releases.js'

const build = ref(null)
function fmt(v) { return v ? new Date(v).toLocaleString('en-KE') : '—' }
onMounted(async () => {
  try { build.value = (await api.get('/system/release')).data } catch { /* non-fatal */ }
})
</script>

<style scoped>
.rel-page { padding: 4px 0 24px; max-width: 900px; }
.page-head h2 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.build-card { background: var(--bc-surface-card); border: 1px solid var(--bc-border); border-radius: 10px;
  padding: 14px 16px; margin: 10px 0 18px; }
.bc-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bc-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--bc-text-muted); }
.bc-commit { font-family: var(--bc-mono, monospace); font-weight: 700; background: var(--bc-surface-raised);
  padding: 2px 8px; border-radius: 6px; }
.bc-branch, .bc-ver { font-size: 12px; color: #93c5fd; background: rgba(59,130,246,.15); padding: 2px 8px; border-radius: 6px; }
.bc-msg, .bc-time { margin-top: 6px; }
.timeline { display: flex; flex-direction: column; gap: 16px; }
.rel { border-left: 2px solid var(--bc-border); padding: 0 0 4px 16px; position: relative; }
.rel::before { content: ''; position: absolute; left: -6px; top: 4px; width: 10px; height: 10px;
  border-radius: 50%; background: var(--bc-primary); }
.rel-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.rel-ver { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  color: #fff; background: var(--bc-primary); padding: 1px 8px; border-radius: 6px; }
.rel-title { font-weight: 700; }
.rel-items { margin: 6px 0 0; padding-left: 18px; }
.rel-items li { margin: 3px 0; color: var(--bc-text); }
</style>
