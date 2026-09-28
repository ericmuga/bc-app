<template>
 <section class="worker-access">
  <strong>Working as: {{ worker ? `${worker.name} (${worker.code})` : auth.user?.userName || auth.user?.displayName || 'Main account' }}</strong>
  <small v-if="worker">Delegated by the logged-in account · expires {{ new Date(worker.ExpiresAt).toLocaleString() }}</small>
  <p v-if="locked">Work already recorded stays with this worker. End the session before handing it over.</p>
  <div v-if="!worker" class="controls">
   <label>Worker code<InputText v-model="code" :disabled="locked||busy" autocomplete="off" /></label>
   <label>Worker passcode<InputText v-model="passcode" type="password" inputmode="numeric" autocomplete="off" :disabled="locked||busy" @keydown.enter.prevent="activate" /></label>
   <Button label="Delegate to worker" :disabled="locked||!code||!passcode" :loading="busy" @click="activate" />
  </div>
  <div v-else class="controls">
   <label>Re-enter worker passcode<InputText v-model="passcode" type="password" inputmode="numeric" autocomplete="off" /></label>
   <Button label="Renew worker access" :disabled="!passcode" :loading="busy" @click="activate" />
   <Button label="Return to main account" severity="secondary" :loading="busy" @click="end" />
  </div>
  <Message v-if="error" severity="error">{{ error }}</Message>
 </section>
</template>
<script setup>
import {ref,computed} from 'vue'
import {useAuthStore} from '@/stores/auth.js'
import {workerFor,setWorker} from '@/lib/dispatchWorker.js'
import {dispatchApi} from '@/services/dispatch.js'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
const props=defineProps({stage:{type:String,required:true},locked:Boolean})
const auth=useAuthStore(),worker=computed(()=>workerFor(props.stage,auth.user?.userId)),code=ref(''),passcode=ref(''),busy=ref(false),error=ref('')
async function activate(){if((props.locked&&!worker.value)||busy.value)return;busy.value=true;error.value='';try{const {data}=await dispatchApi.delegateWorker({code:worker.value?.code||code.value,passcode:passcode.value,stage:props.stage});setWorker(props.stage,data,auth.user.userId);window.location.reload()}catch(e){error.value=e.response?.data?.error||e.message}finally{passcode.value='';busy.value=false}}
async function end(){busy.value=true;error.value='';try{await dispatchApi.endWorkerDelegation(worker.value.token);setWorker(props.stage,null);window.location.reload()}catch(e){error.value=e.response?.data?.error||e.message}finally{busy.value=false}}
</script>
<style scoped>.worker-access{display:grid;gap:.6rem;padding:1rem;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card);color:var(--bc-text)}.controls{display:flex;flex-wrap:wrap;gap:.6rem;align-items:end}label{display:grid;gap:.3rem}small{color:var(--bc-text-muted)}</style>
