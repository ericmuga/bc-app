import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCompanyStore = defineStore('company', () => {
  // Companies are typically fetched from the server on login.
  // For now we seed from localStorage and a static default.
  const companies = ref(
    JSON.parse(localStorage.getItem('bc_companies') || '[]')
  )
  const currentCompanyId = ref(
    localStorage.getItem('bc_current_company') || (companies.value[0]?.CompanyId ?? 'FCL')
  )

  const currentCompany = computed(() =>
    companies.value.find(c => c.CompanyId === currentCompanyId.value) ?? {
      CompanyId: currentCompanyId.value,
      CompanyName: currentCompanyId.value,
    }
  )

  function setCompanies(list) {
    companies.value = list
    localStorage.setItem('bc_companies', JSON.stringify(list))
  }

  function switchCompany(id) {
    currentCompanyId.value = id
    localStorage.setItem('bc_current_company', id)
  }

  return { companies, currentCompanyId, currentCompany, setCompanies, switchCompany }
})
