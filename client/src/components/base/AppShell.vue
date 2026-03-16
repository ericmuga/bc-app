<template>
  <div class="shell">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">⬡</span>
        <span class="brand-name">BC Console</span>
      </div>

      <!-- Company switcher -->
      <div class="company-switcher">
        <label class="section-label">Company</label>
        <Select
          :model-value="company.currentCompanyId"
          :options="companyOptions"
          option-label="label"
          option-value="value"
          class="company-select"
          @update:model-value="company.switchCompany($event)"
        />
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section">
          <span class="section-label">Orders</span>
          <RouterLink to="/orders/scan" class="nav-item" active-class="active">
            <i class="pi pi-qrcode" />
            <span>Scan / Search</span>
          </RouterLink>
          <RouterLink to="/orders" class="nav-item" active-class="active">
            <i class="pi pi-list" />
            <span>All Orders</span>
          </RouterLink>
        </div>

        <div class="nav-section">
          <span class="section-label">Invoices</span>
          <RouterLink to="/invoices/scan" class="nav-item" active-class="active">
            <i class="pi pi-qrcode" />
            <span>Scan / Search</span>
          </RouterLink>
          <RouterLink to="/invoices" class="nav-item" active-class="active">
            <i class="pi pi-file-check" />
            <span>All Invoices</span>
          </RouterLink>
        </div>

        <div class="nav-section">
          <span class="section-label">Analytics</span>
          <RouterLink to="/reports" class="nav-item" active-class="active">
            <i class="pi pi-chart-bar" />
            <span>Reports</span>
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ userInitial }}</div>
          <div>
            <div class="user-name">{{ auth.user?.userName }}</div>
            <div class="user-role text-muted text-sm">{{ auth.user?.role }}</div>
          </div>
        </div>
        <Button icon="pi pi-sign-out" text rounded severity="secondary" @click="logout" v-tooltip.right="'Sign out'" />
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth.js'
import { useCompanyStore } from '@/stores/company.js'
import { companiesApi } from '@/services/api.js'

const auth    = useAuthStore()
const company = useCompanyStore()
const router  = useRouter()

const userInitial = computed(() => auth.user?.userName?.[0]?.toUpperCase() ?? 'U')

const companyOptions = computed(() =>
  company.companies.length
    ? company.companies.map(c => ({ label: c.CompanyName, value: c.CompanyId }))
    : [{ label: company.currentCompany.CompanyName, value: company.currentCompanyId }]
)

onMounted(async () => {
  try {
    const { data } = await companiesApi.list()
    if (data.length) company.setCompanies(data)
  } catch {
    // Fail silently – company switcher will use whatever is in localStorage
  }
})

function logout() { auth.logout(); router.push('/login') }
</script>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bc-surface-card);
  border-right: 1px solid var(--bc-border);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--bc-border);
}
.brand-icon {
  font-size: 22px;
  color: var(--bc-primary-light);
  line-height: 1;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--bc-text);
}

.company-switcher {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--bc-border);
}
.company-select { width: 100%; font-size: 13px; }

.section-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bc-text-muted);
  padding: 0 12px;
  margin-bottom: 4px;
}

.sidebar-nav {
  flex: 1;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-section {
  padding: 10px 0 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 6px;
  margin: 0 6px;
  color: var(--bc-text-muted);
  text-decoration: none;
  font-size: 13px;
  transition: all 0.15s;
}
.nav-item:hover { background: var(--bc-surface-raised); color: var(--bc-text); }
.nav-item.active { background: rgba(15,113,115,0.2); color: var(--bc-primary-light); }
.nav-item .pi { font-size: 14px; width: 16px; }

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--bc-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.user-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bc-primary) 0%, var(--bc-primary-light) 100%);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; flex-shrink: 0;
}
.user-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.main-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bc-surface);
  padding: 24px 28px;
}
</style>
