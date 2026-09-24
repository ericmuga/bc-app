<template>
  <aside class="translation" aria-live="polite">
    <template v-if="unit?.KgPerUom>0">
      <strong>BC unit translation</strong>
      <span>1 {{ line.Uom }} = {{ format(unit.KgPerUom) }} kg</span>
      <span v-if="piece?.KgPerUom>0">1 PC = {{ format(piece.KgPerUom) }} kg · 1 kg = {{ format(1/piece.KgPerUom) }} PC</span>
      <span v-if="!weighted && line.Uom?.toUpperCase()==='PC' && pieces!=null">{{ pieces }} PC ≈ {{ format(pieces*unit.KgPerUom) }} kg ({{ tonnes(pieces*unit.KgPerUom) }} tonnes)</span>
      <template v-if="weighted && piece?.KgPerUom>0">
        <span v-if="weight!=null">{{ weight }} {{ line.Uom }} ≈ {{ format(weight*unit.KgPerUom/piece.KgPerUom) }} PC</span>
        <Button v-if="pieces>0" label="Fill weight from pieces" size="small" severity="secondary" @click="$emit('weight',Math.round(pieces*piece.KgPerUom/unit.KgPerUom*10000)/10000)" />
      </template>
      <small>Standard BC conversion; confirm actual measured weight and whole-piece count.</small>
    </template>
    <span v-else>No BC KG conversion cached for this item/UOM. Refresh BC unit conversions in Dispatch Admin.</span>
  </aside>
</template>
<script setup>
import {computed} from 'vue'
import Button from 'primevue/button'
const props=defineProps({line:Object,pieces:Number,weight:Number,weighted:Boolean})
defineEmits(['weight'])
const unit=computed(()=>props.line?.UnitConversions?.find(u=>u.Uom.trim().toUpperCase()===String(props.line.Uom).trim().toUpperCase()))
const piece=computed(()=>props.line?.UnitConversions?.find(u=>u.Uom.trim().toUpperCase()==='PC'))
const format=v=>Number(v).toLocaleString('en-KE',{maximumFractionDigits:4})
const tonnes=kg=>(Number(kg)/1000).toLocaleString('en-KE',{maximumFractionDigits:6})
</script>
<style scoped>.translation{display:grid;gap:.4rem;padding:.8rem;border:1px solid var(--bc-border);border-radius:8px;background:var(--bc-surface-card);color:var(--bc-text)}small{color:var(--bc-text-muted)}</style>
