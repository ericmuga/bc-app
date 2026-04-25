<template>
  <div class="shell" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <!-- Mobile top-bar -->
    <header class="mobile-topbar">
      <button class="hamburger" @click="sidebarOpen = !sidebarOpen" aria-label="Toggle sidebar">
        <i :class="sidebarOpen ? 'pi pi-times' : 'pi pi-bars'" />
      </button>
      <span class="mobile-brand">BC Console</span>
      <div class="mobile-avatar">{{ userInitial }}</div>
    </header>

    <!-- Overlay backdrop (mobile only) -->
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-brand">
        <span class="brand-icon">⬡</span>
        <span class="brand-name">BC Console</span>
        <button class="sidebar-collapse-btn" @click="sidebarOpen = false" aria-label="Collapse sidebar">
          <i class="pi pi-chevron-left" />
        </button>
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
          <RouterLink v-if="canViewOrders" to="/orders/scan" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-qrcode" />
            <span>Scan / Search</span>
          </RouterLink>
          <RouterLink v-if="canViewOrders" to="/orders" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-list" />
            <span>All Orders</span>
          </RouterLink>
        </div>

        <div class="nav-section">
          <span class="section-label">Invoices</span>
          <RouterLink v-if="canViewInvoices" to="/invoices/scan" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-qrcode" />
            <span>Scan / Search</span>
          </RouterLink>
          <RouterLink v-if="canViewInvoices" to="/invoices" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-file-check" />
            <span>All Invoices</span>
          </RouterLink>
        </div>

        <div class="nav-section">
          <span class="section-label">Analytics</span>
          <RouterLink v-if="canViewReports" to="/reports" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-chart-bar" />
            <span>Reports</span>
          </RouterLink>
          <RouterLink v-if="canViewReports" to="/bc-reports" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-database" />
            <span>Sales Reports</span>
          </RouterLink>
          <RouterLink v-if="canViewFinance" to="/finance" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-money-bill" />
            <span>Finance Reports</span>
          </RouterLink>
          <RouterLink v-if="isAdmin" to="/admin/setup" class="nav-item" active-class="active" @click="closeSidebarOnMobile">
            <i class="pi pi-cog" />
            <span>Admin Setup</span>
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

    <!-- Desktop re-open tab -->
    <button v-if="!sidebarOpen" class="sidebar-reopen-btn" @click="sidebarOpen = true" aria-label="Open sidebar">
      <i class="pi pi-bars" />
    </button>

    <!-- Main content -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth.js'
import { useCompanyStore } from '@/stores/company.js'
import { companiesApi } from '@/services/api.js'
import { canAccessInvoices, canAccessOrders, canAccessReports, ROLES } from '@/lib/access.js'
import { canAccessFinance } from '@/lib/financeAccess.js'

const auth    = useAuthStore()
const company = useCompanyStore()
const router  = useRouter()

const sidebarOpen = ref(window.innerWidth >= 768)
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768 && !sidebarOpen.value) sidebarOpen.value = true
})

const userInitial    = computed(() => auth.user?.userName?.[0]?.toUpperCase() ?? 'U')
const isAdmin = computed(() => auth.user?.role === ROLES.ADMIN)
const canViewOrders = computed(() => canAccessOrders(auth.user?.role))
const canViewInvoices = computed(() => canAccessInvoices(auth.user?.role))
const canViewReports = computed(() => canAccessReports(auth.user?.role))
const canViewFinance = computed(() => canAccessFinance(auth.user?.role))

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

function closeSidebarOnMobile() {
  if (window.innerWidth < 768) sidebarOpen.value = false
}
</script>

<style scoped>
/* ── Shell layout ───────────────────────────────────────────── */
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Mobile top-bar (hidden on desktop) ─────────────────────── */
.mobile-topbar {
  display: none;
}

/* ── Sidebar ────────────────────────────────────────────────── */
.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bc-surface-card);
  border-right: 1px solid var(--bc-border);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.25s ease, min-width 0.25s ease;
  flex-shrink: 0;
}

.sidebar-collapsed .sidebar {
  width: 0;
  min-width: 0;
  border-right: none;
}

/* Backdrop (mobile only) */
.sidebar-backdrop { display: none; }

/* Desktop re-open button */
.sidebar-reopen-btn {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  background: var(--bc-surface-card);
  border: 1px solid var(--bc-border);
  border-left: none;
  border-radius: 0 8px 8px 0;
  padding: 10px 8px;
  cursor: pointer;
  color: var(--bc-text-muted);
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}
.sidebar-reopen-btn:hover { color: var(--bc-text); background: var(--bc-surface-raised); }

/* ── Sidebar internals ──────────────────────────────────────── */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--bc-border);
  flex-shrink: 0;
}
.brand-icon {
  font-size: 22px;
  color: var(--bc-primary-light);
  line-height: 1;
  flex-shrink: 0;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--bc-text);
  flex: 1;
  white-space: nowrap;
}
.sidebar-collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--bc-text-muted);
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.sidebar-collapse-btn:hover { color: var(--bc-text); background: var(--bc-surface-raised); }

.company-switcher {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--bc-border);
  flex-shrink: 0;
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
  white-space: nowrap;
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
  white-space: nowrap;
}
.nav-item:hover { background: var(--bc-surface-raised); color: var(--bc-text); }
.nav-item.active { background: rgba(15,113,115,0.2); color: var(--bc-primary-light); }
.nav-item .pi { font-size: 14px; width: 16px; flex-shrink: 0; }

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--bc-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
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

/* ── Main content ───────────────────────────────────────────── */
.main-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bc-surface);
  padding: 24px 28px;
  min-width: 0;
  transition: padding 0.25s ease;
}

/* BC Reports page manages its own internal layout — remove shell padding */
.main-content:has(.bc-reports-layout) {
  padding: 0;
  overflow: hidden;
}

/* ── Mobile breakpoint ──────────────────────────────────────── */
@media (max-width: 767px) {
  /* Show top-bar */
  .mobile-topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 48px;
    z-index: 150;
    background: var(--bc-surface-card);
    border-bottom: 1px solid var(--bc-border);
    padding: 0 12px;
  }
  .mobile-brand {
    flex: 1;
    font-size: 15px;
    font-weight: 700;
    color: var(--bc-text);
  }
  .mobile-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--bc-primary) 0%, var(--bc-primary-light) 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff;
  }
  .hamburger {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--bc-text-muted);
    font-size: 18px;
    padding: 4px;
    display: flex; align-items: center;
  }

  /* Sidebar becomes fixed overlay */
  .sidebar {
    position: fixed;
    top: 48px;
    left: 0;
    height: calc(100vh - 48px);
    width: 260px !important;
    min-width: 260px !important;
    z-index: 140;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    border-right: 1px solid var(--bc-border) !important;
    overflow-y: auto;
  }
  .sidebar.open {
    transform: translateX(0);
  }

  /* Backdrop */
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 130;
  }

  /* Hide desktop re-open and collapse buttons on mobile */
  .sidebar-reopen-btn { display: none; }
  .sidebar-collapse-btn { display: none; }
  .sidebar-collapsed .sidebar { width: 260px !important; min-width: 260px !important; }

  /* Main content: push down for topbar */
  .main-content {
    padding: 60px 12px 16px !important;
    overflow-y: auto;
  }
  .main-content:has(.bc-reports-layout) {
    padding: 48px 0 0 !important;
    overflow: hidden;
  }
}
</style>
