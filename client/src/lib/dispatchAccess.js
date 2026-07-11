/**
 * lib/dispatchAccess.js
 * Dispatch / pick-and-pack role helpers (extends base access.js without editing it).
 * `dispatch` (BC order scanning) is a DIFFERENT role — these are the fulfilment roles.
 */
import { normalizeRole } from './access.js'

export const DISPATCH_ROLES = ['admin', 'dispatch-supervisor', 'dispatch-registry', 'packer', 'checker', 'loader']

const has = (list, role) => list.includes(normalizeRole(role))

export const canAccessDispatch    = (role) => has(DISPATCH_ROLES, role)
export const canDispatchRegistry  = (role) => has(['admin', 'dispatch-supervisor', 'dispatch-registry'], role)
export const canDispatchAssign    = (role) => has(['admin', 'dispatch-supervisor'], role)
export const canDispatchAssemble  = (role) => has(['admin', 'dispatch-supervisor', 'packer'], role)
export const canDispatchPack      = (role) => has(['admin', 'dispatch-supervisor', 'packer', 'checker'], role)
export const canDispatchLoad      = (role) => has(['admin', 'dispatch-supervisor', 'loader'], role)
