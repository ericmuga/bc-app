<template>
 <details class="worker-setup" @toggle="toggle"><summary>Casual workers / sub-users</summary>
 <p>Create a worker without a full login account. Set their permitted stages and a 6–12 digit passcode. Edits/reset/deactivation revoke existing delegated access; historical work is retained.</p>
 <Message v-if="error" severity="error">{{ error }}</Message>
 <div class="worker-form">
  <label>Worker code<InputText v-model="form.code" maxlength="30" :disabled="!!form.workerId" /></label><label>Name<InputText v-model="form.name" maxlength="150" /></label>
  <label>{{ form.workerId?'New passcode (blank keeps existing)':'Passcode' }}<InputText v-model="form.passcode" type="password" inputmode="numeric" autocomplete="new-password" /></label>
  <label v-for="stage in ['assembly','packing','loading']" :key="stage"><input type="checkbox" v-model="form[stage]" /> {{ stage }}</label>
  <label><input type="checkbox" v-model="form.active" /> Active</label>
  <Button label="Save worker" :loading="busy" @click="save" /><Button label="New worker" text @click="form=blank()" />
 </div>
 <InputText v-model="search" placeholder="Find worker by code or name" />
 <DataTable :value="filtered" paginator :rows="10" scrollable><Column field="Code" header="Code" /><Column field="Name" header="Name" /><Column field="Active" header="Active" /><Column field="Assembly" header="Assembly" /><Column field="Packing" header="Packing" /><Column field="Loading" header="Loading" /><Column><template #body="{data}"><Button label="Edit / reset passcode" text @click="edit(data)" /></template></Column></DataTable>
 <h4>Delegation history (latest 500)</h4><Button label="Refresh" :loading="busy" @click="load" />
 <DataTable :value="history" paginator :rows="10" scrollable><Column field="WorkerCode" header="Worker code" /><Column field="WorkerName" header="Worker" /><Column field="ParentName" header="Main account" /><Column field="Stage" header="Stage" /><Column field="StartedAt" header="Started (UTC)" /><Column field="ExpiresAt" header="Expires (UTC)" /><Column field="EndedAt" header="Ended (UTC)" /></DataTable>
 </details>
</template>
<script setup>
import {ref,computed} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
const blank=()=>({code:'',name:'',passcode:'',assembly:true,packing:false,loading:false,active:true})
const form=ref(blank()),rows=ref([]),history=ref([]),busy=ref(false),error=ref(''),search=ref('')
const filtered=computed(()=>rows.value.filter(r=>`${r.Code} ${r.Name}`.toLowerCase().includes(search.value.toLowerCase())))
async function load(){busy.value=true;error.value='';try{const [workers,events]=await Promise.all([dispatchApi.workers(),dispatchApi.workerHistory()]);rows.value=workers.data;history.value=events.data}catch(e){error.value=e.response?.data?.error||e.message}finally{busy.value=false}}
function toggle(e){if(e.target.open)load()}
function edit(r){form.value={workerId:r.WorkerId,code:r.Code,name:r.Name,passcode:'',assembly:!!r.Assembly,packing:!!r.Packing,loading:!!r.Loading,active:!!r.Active}}
async function save(){busy.value=true;error.value='';try{await dispatchApi.saveWorker(form.value);form.value=blank();await load()}catch(e){error.value=e.response?.data?.error||e.message}finally{busy.value=false;form.value.passcode=''}}
</script>
<style scoped>.worker-setup{padding:1rem;border:1px solid var(--bc-border);border-radius:10px}.worker-form{display:flex;flex-wrap:wrap;gap:.8rem;align-items:end;margin:1rem 0}label{display:grid;gap:.3rem}summary{cursor:pointer;font-weight:600}</style>
