import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminRole = 
  | 'super_admin' 
  | 'finance_admin' 
  | 'support_admin' 
  | 'analytics_admin' 
  | 'content_admin';

export interface Permissions {
  canViewEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canViewUsers: boolean;
  canEditUsers: boolean;
  canViewPayouts: boolean;
  canApprovePayouts: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
  canSendNotifications: boolean;
  canEditPricing: boolean;
  canEditSettings: boolean;
  canManageAdmins: boolean;
  canViewKYC: boolean;
  canApproveKYC: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: Permissions;
}

// ── Permission matrix ─────────────────────────────────────────────────────────

export function getPermissionsByRole(role: AdminRole): Permissions {
  const basePermissions: Permissions = {
    canViewEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canViewUsers: false,
    canEditUsers: false,
    canViewPayouts: false,
    canApprovePayouts: false,
    canViewAnalytics: false,
    canExportData: false,
    canSendNotifications: false,
    canEditPricing: false,
    canEditSettings: false,
    canManageAdmins: false,
    canViewKYC: false,
    canApproveKYC: false,
  };

  switch (role) {
    case 'super_admin':
      return {
        ...basePermissions,
        canViewEvents: true,
        canEditEvents: true,
        canDeleteEvents: true,
        canViewUsers: true,
        canEditUsers: true,
        canViewPayouts: true,
        canApprovePayouts: true,
        canViewAnalytics: true,
        canExportData: true,
        canSendNotifications: true,
        canEditPricing: true,
        canEditSettings: true,
        canManageAdmins: true,
        canViewKYC: true,
        canApproveKYC: true,
      };

    case 'finance_admin':
      return {
        ...basePermissions,
        canViewPayouts: true,
        canApprovePayouts: true,
        canViewAnalytics: true,
        canExportData: true,
      };

    case 'support_admin':
      return {
        ...basePermissions,
        canViewEvents: true,
        canViewUsers: true,
        canEditUsers: true,
        canViewKYC: true,
        canApproveKYC: true,
      };

    case 'analytics_admin':
      return {
        ...basePermissions,
        canViewAnalytics: true,
        canExportData: true,
      };

    case 'content_admin':
      return {
        ...basePermissions,
        canSendNotifications: true,
        canEditSettings: true,
      };

    default:
      return basePermissions;
  }
}

// ── signInAdmin ───────────────────────────────────────────────────────────────
// Sign in using email/password and verify admin role.

export async function signInAdmin(email: string, password: string): Promise<AdminUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error('Invalid email or password.');
  }

  if (!data.user) {
    throw new Error('Sign in failed.');
  }

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('id', data.user.id)
    .single();

  if (userError || !userData) {
    await supabase.auth.signOut();
    throw new Error('User record not found.');
  }

  if (userData.role !== 'admin') {
    await supabase.auth.signOut();
    throw new Error('This account does not have admin access.');
  }

  // Get admin role and permissions
  const permissions = await getAdminPermissions(data.user.id);
  const { data: adminData } = await supabase
    .from('admin_permissions')
    .select('admin_role')
    .eq('user_id', data.user.id)
    .single();

  const adminRole = (adminData?.admin_role as AdminRole) || 'support_admin';

  return {
    id: data.user.id,
    email: userData.email,
    name: userData.name,
    role: adminRole,
    permissions,
  };
}

// ── getAdminPermissions ───────────────────────────────────────────────────────
// Fetch admin permissions from database.

export async function getAdminPermissions(userId: string): Promise<Permissions> {
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('admin_role, permissions')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return getPermissionsByRole('support_admin');
  }

  // Return stored permissions or generate from role
  if (data.permissions && typeof data.permissions === 'object') {
    return data.permissions as Permissions;
  }

  return getPermissionsByRole(data.admin_role as AdminRole);
}

// ── signOutAdmin ──────────────────────────────────────────────────────────────
// Sign out and clear local storage.

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
  localStorage.removeItem('admin_user');
  localStorage.removeItem('admin_permissions');
}

// ── isAuthenticated ───────────────────────────────────────────────────────────
// Check if user is authenticated as admin.

export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return false;
  }

  const { data: userData, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error || !userData || userData.role !== 'admin') {
    return false;
  }

  return true;
}

// ── getAdminUser ──────────────────────────────────────────────────────────────
// Get current admin user from session.

export async function getAdminUser(): Promise<AdminUser | null> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return null;
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('id', session.user.id)
    .single();

  if (userError || !userData || userData.role !== 'admin') {
    return null;
  }

  const { data: adminData } = await supabase
    .from('admin_permissions')
    .select('admin_role')
    .eq('user_id', session.user.id)
    .single();

  const permissions = await getAdminPermissions(session.user.id);
  const adminRole = (adminData?.admin_role as AdminRole) || 'support_admin';

  return {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    role: adminRole,
    permissions,
  };
}
