<template>
  <div class="viz-root">
    <!-- ── Bar: horizontal, zero-baseline, diverging by sign (in/out) ───────── -->
    <div v-if="type === 'bar'" class="chart-scroll">
      <svg :viewBox="`0 0 ${BW} ${barH}`" width="100%" :height="barH" role="img" :aria-label="`${metricLabel} by category`">
        <line :x1="bar.zeroX" y1="8" :x2="bar.zeroX" :y2="barH - 24" class="axis" />
        <g v-for="(c, i) in bar.rows" :key="i" class="bar-row">
          <text :x="LG - 8" :y="c.cy + 4" text-anchor="end" class="cat-label">{{ trunc(c.label) }}<title>{{ c.label }}</title></text>
          <rect :x="Math.min(bar.zeroX, c.x)" :y="c.cy - 8" :width="Math.abs(c.x - bar.zeroX)" height="16" rx="3"
                :fill="c.value < 0 ? NEG : POS">
            <title>{{ c.label }} — {{ metricLabel }}: {{ valueFmt(c.value) }}</title>
          </rect>
          <text :x="c.value < 0 ? c.x - 6 : c.x + 6" :y="c.cy + 4" :text-anchor="c.value < 0 ? 'end' : 'start'" class="val-label">{{ valueFmt(c.value) }}</text>
        </g>
      </svg>
      <div class="cap"><span class="sw" :style="{ background: POS }" /> Net in &nbsp;·&nbsp; <span class="sw" :style="{ background: NEG }" /> Net out — top {{ bar.rows.length }} by magnitude</div>
    </div>

    <!-- ── Line: multi-series over date buckets ─────────────────────────────── -->
    <div v-else-if="type === 'line'">
      <div v-if="!xLabels.length" class="hint">Pick a <b>date spread</b> (Day / Week / Month / Year) to plot a trend line.</div>
      <template v-else>
        <svg :viewBox="`0 0 ${W} ${H}`" width="100%" :height="H" role="img" :aria-label="`${metricLabel} over time`">
          <!-- gridlines + y ticks -->
          <g v-for="(t, i) in line.yTicks" :key="'y'+i">
            <line :x1="M.l" :y1="t.y" :x2="W - M.r" :y2="t.y" class="grid" />
            <text :x="M.l - 8" :y="t.y + 4" text-anchor="end" class="tick">{{ valueFmt(t.v) }}</text>
          </g>
          <!-- x labels (thinned) -->
          <text v-for="(lx, i) in line.xTicks" :key="'x'+i" :x="lx.x" :y="H - M.b + 18" text-anchor="middle" class="tick">{{ lx.label }}</text>
          <!-- series -->
          <g v-for="(s, si) in line.series" :key="si">
            <polyline :points="s.pts" fill="none" :stroke="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            <g v-for="(p, pi) in s.markers" :key="pi">
              <circle :cx="p.x" :cy="p.y" r="4" :fill="s.color" class="mk">
                <title>{{ s.label }} · {{ xLabels[pi] }} — {{ valueFmt(p.v) }}</title>
              </circle>
            </g>
          </g>
        </svg>
        <div class="legend">
          <span v-for="(s, i) in line.series" :key="i" class="lg"><span class="sw" :style="{ background: s.color }" />{{ s.label }}</span>
        </div>
      </template>
    </div>

    <!-- ── Donut: share of |metric| by category ─────────────────────────────── -->
    <div v-else-if="type === 'pie'" class="donut-wrap">
      <svg viewBox="0 0 300 300" width="300" height="300" role="img" :aria-label="`${metricLabel} share`">
        <g v-for="(s, i) in donut.slices" :key="i">
          <path :d="s.d" :fill="s.color" stroke="#1b2233" stroke-width="2">
            <title>{{ s.label }} — {{ valueFmt(s.value) }} ({{ s.pct }}%)</title>
          </path>
          <text v-if="s.pct >= 6" :x="s.lx" :y="s.ly" text-anchor="middle" class="slice-pct">{{ s.pct }}%</text>
        </g>
        <text x="150" y="146" text-anchor="middle" class="donut-center">{{ metricLabel }}</text>
        <text x="150" y="166" text-anchor="middle" class="donut-total">{{ valueFmt(donut.total) }}</text>
      </svg>
      <div class="legend col">
        <span v-for="(s, i) in donut.slices" :key="i" class="lg"><span class="sw" :style="{ background: s.color }" />{{ trunc(s.label, 34) }} <b>{{ s.pct }}%</b></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type:        { type: String, default: 'bar' },     // bar | line | pie
  categories:  { type: Array,  default: () => [] },   // [{label, value}] for bar/pie
  xLabels:     { type: Array,  default: () => [] },   // buckets for line
  series:      { type: Array,  default: () => [] },   // [{label, points:[]}] for line
  metricLabel: { type: String, default: 'Value' },
  valueFmt:    { type: Function, default: (n) => String(n) },
})

// Validated dark categorical steps (dataviz reference palette, dark surface).
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const POS = '#3987e5'   // diverging: net-in
const NEG = '#e66767'   // diverging: net-out

const trunc = (s, n = 22) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }

// ── Bar ──────────────────────────────────────────────────────────────────────
const BW = 760
const LG = 190   // label gutter
const BAR_MAX = 20
const barH = computed(() => Math.max(80, Math.min(props.categories.length, BAR_MAX) * 26 + 34))
const bar = computed(() => {
  const rows0 = [...props.categories].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, BAR_MAX)
  const vals = rows0.map(r => Number(r.value) || 0)
  const dMin = Math.min(0, ...vals), dMax = Math.max(0, ...vals)
  const span = (dMax - dMin) || 1
  const plotW = BW - LG - 90
  const x = (v) => LG + ((v - dMin) / span) * plotW
  const rows = rows0.map((r, i) => ({ ...r, value: Number(r.value) || 0, cy: 18 + i * 26, x: x(Number(r.value) || 0) }))
  return { rows, zeroX: x(0) }
})

// ── Line ─────────────────────────────────────────────────────────────────────
const W = 760, H = 360
const M = { t: 16, r: 20, b: 46, l: 64 }
const line = computed(() => {
  const xs = props.xLabels
  const n = xs.length
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b
  const top = [...props.series]
    .map(s => ({ ...s, tot: s.points.reduce((a, v) => a + Math.abs(Number(v) || 0), 0) }))
    .sort((a, b) => b.tot - a.tot).slice(0, 8)
  let yMin = 0, yMax = 0
  for (const s of top) for (const v of s.points) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v) }
  if (yMin === yMax) yMax = yMin + 1
  const xAt = (i) => M.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (v) => M.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  const series = top.map((s, si) => {
    const color = PALETTE[si % PALETTE.length]
    const markers = s.points.map((v, i) => ({ x: xAt(i), y: yAt(Number(v) || 0), v: Number(v) || 0 }))
    return { label: s.label, color, pts: markers.map(p => `${p.x},${p.y}`).join(' '), markers }
  })
  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => { const v = yMin + (i / ticks) * (yMax - yMin); return { v, y: yAt(v) } })
  const step = Math.ceil(n / 10)
  const xTicks = xs.map((label, i) => ({ label, x: xAt(i), i })).filter((_, i) => i % step === 0)
  return { series, yTicks, xTicks }
})

// ── Donut ────────────────────────────────────────────────────────────────────
const donut = computed(() => {
  const items = props.categories.map(c => ({ label: c.label, value: Number(c.value) || 0, abs: Math.abs(Number(c.value) || 0) }))
    .sort((a, b) => b.abs - a.abs)
  const top = items.slice(0, 7)
  const restAbs = items.slice(7).reduce((a, x) => a + x.abs, 0)
  const restVal = items.slice(7).reduce((a, x) => a + x.value, 0)
  if (restAbs > 0) top.push({ label: `Other (${items.length - 7})`, value: restVal, abs: restAbs })
  const total = top.reduce((a, x) => a + x.abs, 0) || 1
  const cx = 150, cy = 150, r = 110, ir = 64
  let ang = -Math.PI / 2
  const slices = top.map((s, i) => {
    const frac = s.abs / total
    const a0 = ang, a1 = ang + frac * 2 * Math.PI; ang = a1
    const mid = (a0 + a1) / 2
    const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
    const large = (a1 - a0) > Math.PI ? 1 : 0
    const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1), [xi1, yi1] = p(ir, a1), [xi0, yi0] = p(ir, a0)
    const d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${ir},${ir} 0 ${large} 0 ${xi0},${yi0} Z`
    const [lx, ly] = p((r + ir) / 2, mid)
    return { ...s, d, color: PALETTE[i % PALETTE.length], pct: Math.round(frac * 100), lx, ly: ly + 4 }
  })
  const totVal = top.reduce((a, x) => a + x.value, 0)
  return { slices, total: totVal }
})
</script>

<style scoped>
.viz-root { --grid: #324256; --ink: #f8fafc; --muted: #94a6bf; }
.chart-scroll { overflow-x: auto; }
.axis { stroke: #55688a; stroke-width: 1; }
.grid { stroke: var(--grid); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.cat-label { fill: var(--ink); font-size: 11px; }
.val-label { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.mk { cursor: pointer; }
.hint { padding: 26px; text-align: center; color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 4px 2px; }
.legend.col { flex-direction: column; gap: 6px; padding-left: 8px; }
.lg { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink); }
.lg b { color: var(--muted); font-weight: 700; }
.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.cap { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); padding: 6px 4px; }
.donut-wrap { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; padding: 8px; }
.slice-pct { fill: #fff; font-size: 11px; font-weight: 700; }
.donut-center { fill: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.donut-total { fill: var(--ink); font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
