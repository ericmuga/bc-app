<template>
  <div class="help-page">
    <aside class="help-sidebar">
      <div class="help-search">
        <i class="pi pi-search" />
        <input
          v-model="query"
          type="text"
          placeholder="Search help…"
          aria-label="Search help"
          @keydown.escape="query = ''"
        />
        <button v-if="query" class="clear-btn" aria-label="Clear" @click="query = ''">
          <i class="pi pi-times" />
        </button>
      </div>

      <p class="help-hint" v-if="!query">{{ filteredCount }} topics · type to search</p>
      <p class="help-hint" v-else>{{ filteredCount }} match{{ filteredCount === 1 ? '' : 'es' }}</p>

      <nav class="help-nav">
        <template v-for="section in groupedSections" :key="section.key">
          <div v-if="section.topics.length" class="help-section">
            <div class="section-title">{{ section.label }}</div>
            <button
              v-for="t in section.topics"
              :key="t.id"
              class="help-topic-btn"
              :class="{ active: t.id === activeId }"
              @click="select(t.id)"
            >
              <span class="topic-title" v-html="highlight(t.title)"></span>
              <span class="role-badges">
                <span v-for="r in t.roles" :key="r" class="role-badge" :class="`role-${r}`">{{ r }}</span>
              </span>
            </button>
          </div>
        </template>
        <p v-if="filteredCount === 0" class="no-results">No topics match "{{ query }}".</p>
      </nav>
    </aside>

    <article class="help-content" ref="contentRef">
      <div v-if="active" class="topic-card">
        <div class="topic-header">
          <h2 v-html="highlight(active.title)"></h2>
          <div class="role-badges">
            <span v-for="r in active.roles" :key="r" class="role-badge" :class="`role-${r}`">{{ r }}</span>
          </div>
        </div>
        <div class="topic-body" v-html="renderedBody"></div>
      </div>
      <div v-else class="topic-empty">
        <i class="pi pi-book" />
        <p>Pick a topic from the left, or type to search.</p>
      </div>
    </article>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HELP_TOPICS, SECTIONS, scoreTopic } from '@/data/helpTopics.js'

const route   = useRoute()
const router  = useRouter()
const query   = ref('')
const activeId = ref('')
const contentRef = ref(null)

// Filter + score
const ranked = computed(() => {
  const q = query.value.trim()
  if (!q) return HELP_TOPICS.map(t => ({ topic: t, score: 1 }))
  return HELP_TOPICS
    .map(topic => ({ topic, score: scoreTopic(topic, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
})

const filteredCount = computed(() => ranked.value.length)

const groupedSections = computed(() => {
  const byKey = new Map(SECTIONS.map(s => [s.key, { ...s, topics: [] }]))
  for (const { topic } of ranked.value) {
    const sec = byKey.get(topic.section)
    if (sec) sec.topics.push(topic)
  }
  return Array.from(byKey.values())
})

const active = computed(() => HELP_TOPICS.find(t => t.id === activeId.value) || null)

// Render markdown body to HTML (small-scale; same scope as docs/build-html.mjs)
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineMd(s) {
  let out = escapeHtml(s)
  out = out.replace(/`([^`]+)`/g, (_, t) => `<code>${t}</code>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  return out
}
function mdToHtml(src) {
  const lines = src.split(/\r?\n/)
  const out = []
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (/^```/.test(ln)) {
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(ln)
    if (h) { out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue }
    if (/^\|.*\|$/.test(ln) && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) {
      const head = ln.split('|').slice(1, -1).map(s => s.trim())
      const rows = []
      i += 2
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()))
        i++
      }
      out.push('<table>')
      out.push(`<thead><tr>${head.map(h => `<th>${inlineMd(h)}</th>`).join('')}</tr></thead>`)
      out.push(`<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>`)
      out.push('</table>')
      continue
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      out.push(`<ul>${items.map(x => `<li>${inlineMd(x)}</li>`).join('')}</ul>`)
      continue
    }
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push(`<ol>${items.map(x => `<li>${inlineMd(x)}</li>`).join('')}</ol>`)
      continue
    }
    if (/^\s*$/.test(ln)) { i++; continue }
    const buf = [ln]
    i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\|.*\|$/.test(lines[i]) && !/^```/.test(lines[i])) {
      buf.push(lines[i]); i++
    }
    out.push(`<p>${inlineMd(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}

// Highlight search hits in titles/body
function highlight(text) {
  const q = query.value.trim()
  if (!q) return escapeHtml(text)
  const tokens = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!tokens.length) return escapeHtml(text)
  const re = new RegExp(`(${tokens.join('|')})`, 'gi')
  return escapeHtml(text).replace(re, '<mark>$1</mark>')
}

const renderedBody = computed(() => {
  if (!active.value) return ''
  let html = mdToHtml(active.value.body)
  // Highlight matches in body too
  const q = query.value.trim()
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (tokens.length) {
      const re = new RegExp(`(${tokens.join('|')})`, 'gi')
      // Don't mark inside tags or code blocks — split and rejoin
      html = html.split(/(<[^>]+>|<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/g)
                 .map((seg, idx) => idx % 2 === 0 ? seg.replace(re, '<mark>$1</mark>') : seg)
                 .join('')
    }
  }
  return html
})

function select(id) {
  activeId.value = id
  router.replace({ query: { ...route.query, t: id } })
  nextTick(() => contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' }))
}

// On mount: pick topic from query string, or from URL hash (#topic-id),
// otherwise the first matching topic, otherwise the first topic overall.
onMounted(() => {
  const want = route.query.t || (location.hash || '').replace(/^#/, '')
  if (want && HELP_TOPICS.some(t => t.id === want)) {
    activeId.value = want
  } else {
    activeId.value = HELP_TOPICS[0]?.id || ''
  }
})

// When the search filters out the active topic, jump to the top match.
watch(ranked, (list) => {
  if (!list.length) return
  if (!list.some(x => x.topic.id === activeId.value)) {
    activeId.value = list[0].topic.id
  }
})
</script>

<style scoped>
.help-page {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: calc(100vh - 56px);
  background: #f4f6f8;
  color: #111827;
  color-scheme: light;
  padding: 16px;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.help-sidebar {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.help-search {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.help-search .pi-search {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  font-size: 14px;
}
.help-search input {
  width: 100%;
  padding: 8px 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  color: #111827;
}
.help-search input:focus {
  outline: none;
  border-color: #0f7173;
  box-shadow: 0 0 0 2px rgba(15, 113, 115, 0.15);
}
.clear-btn {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: 0;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
}
.clear-btn:hover { color: #111827; }

.help-hint {
  padding: 6px 14px;
  font-size: 11px;
  color: #6b7280;
  margin: 0;
  border-bottom: 1px solid #f3f4f6;
}

.help-nav {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 12px;
}

.help-section { margin: 8px 0 4px; }
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b7280;
  padding: 6px 14px;
}

.help-topic-btn {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  padding: 8px 14px;
  font-size: 13px;
  color: #1f2937;
  cursor: pointer;
  border-left: 3px solid transparent;
  line-height: 1.4;
}
.help-topic-btn:hover { background: #f3f4f6; }
.help-topic-btn.active {
  background: #eef2ff;
  color: #1e3a8a;
  border-left-color: #0f7173;
  font-weight: 600;
}
.topic-title :deep(mark) {
  background: #fde68a;
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.role-badges {
  display: inline-flex;
  gap: 4px;
  margin-top: 3px;
  flex-wrap: wrap;
}
.role-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: #e5e7eb;
  color: #374151;
  letter-spacing: 0.02em;
  text-transform: lowercase;
}
.role-badge.role-admin       { background: #fee2e2; color: #991b1b; }
.role-badge.role-shop-admin  { background: #fef3c7; color: #92400e; }
.role-badge.role-shop        { background: #dcfce7; color: #166534; }

.no-results { padding: 16px; color: #6b7280; font-size: 13px; }

/* ── Content ─────────────────────────────────────────────────────────────── */
.help-content {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow-y: auto;
  padding: 24px 32px;
}
.topic-card {
  max-width: 820px;
}
.topic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.topic-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}
.topic-header h2 :deep(mark) {
  background: #fde68a;
  color: inherit;
  padding: 0 3px;
  border-radius: 3px;
}

.topic-body :deep(p)  { line-height: 1.6; margin: 8px 0; }
.topic-body :deep(ul),
.topic-body :deep(ol) { padding-left: 22px; line-height: 1.7; }
.topic-body :deep(li) { margin: 4px 0; }
.topic-body :deep(code) {
  background: #f3f4f6;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, "SF Mono", Menlo, monospace;
  font-size: 0.92em;
  color: #b91c1c;
}
.topic-body :deep(pre) {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px 14px;
  overflow: auto;
  margin: 12px 0;
}
.topic-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: #1f2937;
}
.topic-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 13px;
}
.topic-body :deep(th),
.topic-body :deep(td) {
  border: 1px solid #d1d5db;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}
.topic-body :deep(th) { background: #f3f4f6; font-weight: 600; }
.topic-body :deep(mark) {
  background: #fde68a;
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.topic-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  text-align: center;
}
.topic-empty .pi-book { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }

@media (max-width: 900px) {
  .help-page { grid-template-columns: 1fr; height: auto; }
  .help-sidebar { max-height: 320px; }
}
</style>
