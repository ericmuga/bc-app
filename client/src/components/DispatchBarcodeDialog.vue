<template>
  <Dialog v-model:visible="visible" modal header="Correct item barcode" :style="{width:'30rem'}" :breakpoints="{'640px':'96vw'}">
    <form class="barcode-form" @submit.prevent="save">
      <p>Select the intended item. This updates the app and the BC item master.</p>
      <label>Item<Select v-model="itemNo" :options="choices" option-label="label" option-value="ItemNo" filter placeholder="Choose item" /></label>
      <label>Barcode<InputText v-model="barcode" maxlength="50" autocomplete="off" /></label>
      <label class="check"><input type="checkbox" v-model="reassign" /> Move this barcode if it belongs to another item in this company</label>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <Button type="submit" label="Save and sync to BC" :loading="busy" :disabled="!itemNo||!barcode" />
    </form>
  </Dialog>
</template>
<script setup>
import {computed,ref,watch} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Button from 'primevue/button'
const props=defineProps({modelValue:Boolean,items:{type:Array,default:()=>[]},company:String,scanned:String})
const emit=defineEmits(['update:modelValue','saved'])
const visible=computed({get:()=>props.modelValue,set:v=>emit('update:modelValue',v)})
const choices=computed(()=>[...new Map(props.items.map(i=>[i.ItemNo,{...i,label:`${i.ItemNo} - ${i.Description}`}])).values()])
const itemNo=ref(null),barcode=ref(''),reassign=ref(false),busy=ref(false),error=ref('')
watch(()=>props.modelValue,v=>{if(v){barcode.value=props.scanned||'';error.value='';reassign.value=false;itemNo.value=null}})
async function save(){busy.value=true;error.value='';try{await dispatchApi.correctBarcode({company:choices.value.find(i=>i.ItemNo===itemNo.value)?.BarcodeCompany||props.company,itemNo:itemNo.value,barcode:barcode.value,reassign:reassign.value});visible.value=false;emit('saved')}catch(e){error.value=e.response?.data?.error||e.message}finally{busy.value=false}}
</script>
<style scoped>.barcode-form{display:grid;gap:1rem}.barcode-form label{display:grid;gap:.4rem}.barcode-form label.check{display:flex;align-items:start}.barcode-form input{font-size:16px}</style>
