import type { AdminCapability, AdminRole } from '#/types/database.types'

/**
 * Single source of truth for what each admin sub-role can do in the app
 * layer. This mirrors public.has_admin_capability() in
 * supabase/migrations/0003_admin_roles.sql exactly — the SQL function is
 * what actually enforces access via RLS, this is what drives which routes
 * and nav items the UI exposes. Keep the two in sync.
 */
const CAPABILITY_MATRIX: Record<AdminRole, ReadonlyArray<AdminCapability>> = {
  super_admin: [
    'manage_users',
    'approve_admins',
    'financial_records',
    'withdraw_funds',
    'statistics',
    'presence',
    'player_chat',
  ],
  support: ['statistics', 'presence', 'player_chat'],
  finance_manager: ['statistics', 'financial_records'],
}

export function adminCan(
  adminRole: AdminRole | null | undefined,
  capability: AdminCapability,
): boolean {
  if (!adminRole) return false
  return CAPABILITY_MATRIX[adminRole].includes(capability)
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  support: 'Support',
  finance_manager: 'Finance manager',
}
