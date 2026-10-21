<template>
  <Button label="Change passcode" icon="pi pi-key" text @click="open" />
  <Dialog v-model:visible="visible" modal header="Change subworker passcode" :style="{width:'28rem',maxWidth:'95vw'}" :closable="!busy" :closeOnEscape="!busy" @hide="clear">
    <form class="passcode-form" @submit.prevent="save">
      <p>Use 6–12 digits. After saving, sign in again with your new passcode. Your work is retained.</p>
      <label>Current passcode<InputText v-model="currentPasscode" type="password" inputmode="numeric" autocomplete="current-password" :disabled="busy" required /></label>
      <label>New passcode<InputText v-model="newPasscode" type="password" inputmode="numeric" autocomplete="new-password" minlength="6" maxlength="12" :disabled="busy" required /></label>
      <label>Confirm new passcode<InputText v-model="confirmPasscode" type="password" inputmode="numeric" autocomplete="new-password" :disabled="busy" required /></label>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <Button type="submit" label="Save and sign out" :loading="busy" />
    </form>
  </Dialog>
</template>
<script setup>
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth.js'
import api from '@/services/api.js'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
const visible=ref(false),busy=ref(false),error=ref(''),currentPasscode=ref(''),newPasscode=ref(''),confirmPasscode=ref('')
const auth=useAuthStore(),router=useRouter()
function clear(){currentPasscode.value='';newPasscode.value='';confirmPasscode.value='';error.value=''}
function open(){clear();visible.value=true}
async function save(){
 if(busy.value)return
 error.value=''
 if(!/^\d{6,12}$/.test(newPasscode.value)){error.value='Use 6–12 digits';return}
 if(newPasscode.value!==confirmPasscode.value){error.value='New passcodes do not match';return}
 busy.value=true
 try{await api.post('/dispatch/worker-passcode',{currentPasscode:currentPasscode.value,newPasscode:newPasscode.value,confirmPasscode:confirmPasscode.value});clear();visible.value=false;auth.logout();await router.replace('/login?worker=1')}
 catch(e){error.value=e.response?.data?.error||e.message}
 finally{busy.value=false;currentPasscode.value=''}
}
</script>
<style scoped>.passcode-form,.passcode-form label{display:grid;gap:.5rem}.passcode-form{gap:1rem}</style>
