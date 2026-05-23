import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser, AdminRole, getPermissionsByRole, Permissions } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  heading: {
    fontSize: '28px',
    fontFamily: '"Playfair Display", serif',
    color: '#0C0904',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subheading: {
    fontSize: '14px',
    color: '#808080',
    margin: 0,
  },
  createButton: {
    padding: '10px 20px',
    backgroundColor: '#D4A853',
    color: '#0C0904',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: '"DM Mono", monospace',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: '#FFFFFF',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  thead: {
    backgroundColor: '#F5F5F5',
    borderBottom: '1px solid #E0E0E0',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: '600',
    color: '#0C0904',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  td: {
    padding: '16px',
    borderBottom: '1px solid #E0E0E0',
    fontSize: '13px',
    color: '#333',
  },
  rolePill: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'capitalize' as const,
  },
  statusActive: {
    color: '#50C878',
    fontWeight: '600',
  },
  statusInactive: {
    color: '#FF5252',
    fontWeight: '600',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #DDD',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: '"DM Mono", monospace',
  },
  actionButtonDelete: {
    borderColor: '#FF5252',
    color: '#FF5252',
  },
  toggleSwitch: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    padding: '32px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  },
  modalHeader: {
    marginBottom: '24px',
  },
  modalTitle: {
    fontSize: '24px',
    fontFamily: '"Playfair Display", serif',
    fontWeight: '700',
    color: '#0C0904',
    margin: 0,
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#0C0904',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #E0D8CC',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: '"DM Mono", monospace',
    color: '#1A1208',
    boxSizing: 'border-box' as const,
  },
  inputFocus: {
    borderColor: '#D4A853',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #E0D8CC',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: '"DM Mono", monospace',
    color: '#1A1208',
    boxSizing: 'border-box' as const,
  },
  permissionsList: {
    backgroundColor: '#F5F5F5',
    padding: '12px',
    borderRadius: '4px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  permissionItem: {
    fontSize: '12px',
    padding: '6px 0',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  modalButton: {
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: '"DM Mono", monospace',
  },
  primaryButton: {
    backgroundColor: '#D4A853',
    color: '#0C0904',
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    color: '#0C0904',
    border: '1px solid #DDD',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 32px',
    color: '#808080',
  },
};

interface AdminListItem {
  id: string;
  name: string;
  email: string;
  admin_role: AdminRole;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface CreateAdminForm {
  email: string;
  role: AdminRole;
}

export default function AdminManagement() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [admins, setAdmins] = useState<AdminListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateAdminForm>({ email: '', role: 'support_admin' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await getAdminUser();
      if (!user) {
        navigate('/admin/login');
        return;
      }
      if (user.role !== 'super_admin') {
        navigate('/admin/kyc');
        return;
      }
      setAdmin(user);
      loadAdmins();
    };

    checkAdmin();
  }, [navigate]);

  const loadAdmins = async () => {
    const { data, error: err } = await supabase
      .from('admin_permissions')
      .select(`
        id,
        user_id,
        admin_role,
        is_active,
        created_at,
        users(id, full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (!err && data) {
      const adminList = (data as any[]).map((item) => ({
        id: item.user_id,
        name: item.users?.full_name || 'Unknown',
        email: item.users?.email || 'Unknown',
        admin_role: item.admin_role,
        is_active: item.is_active,
        created_at: item.created_at,
        last_login: null,
      }));
      setAdmins(adminList);
    }
    setLoading(false);
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: Math.random().toString(36).slice(-12),
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Failed to create user.');
      }

      // Update users table role
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'admin' })
        .eq('id', authData.user.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Create admin_permissions record
      const permissions = getPermissionsByRole(form.role);
      const { error: permError } = await supabase
        .from('admin_permissions')
        .insert({
          user_id: authData.user.id,
          admin_role: form.role,
          permissions,
          created_by: admin.id,
          is_active: true,
        });

      if (permError) {
        throw new Error(permError.message);
      }

      // Reload admin list
      setShowModal(false);
      setForm({ email: '', role: 'support_admin' });
      await loadAdmins();
    } catch (err: any) {
      setError(err.message || 'Failed to create admin.');
    } finally {
      setCreating(false);
    }
  };

  const getRolePillColor = (role: string): string => {
    switch (role) {
      case 'super_admin': return '#D4A853';
      case 'finance_admin': return '#4A90E2';
      case 'support_admin': return '#50C878';
      case 'analytics_admin': return '#9B59B6';
      case 'content_admin': return '#FF9500';
      default: return '#808080';
    }
  };

  const handleToggleActive = async (adminId: string, isActive: boolean) => {
    const { error } = await supabase
      .from('admin_permissions')
      .update({ is_active: !isActive })
      .eq('user_id', adminId);

    if (!error) {
      await loadAdmins();
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!window.confirm('Are you sure? This action cannot be undone.')) {
      return;
    }

    const { error } = await supabase
      .from('admin_permissions')
      .delete()
      .eq('user_id', adminId);

    if (!error) {
      await loadAdmins();
    }
  };

  const permissions = getPermissionsByRole(form.role);

  if (!admin || loading) {
    return <AdminLayout pageTitle="Admin Management">Loading...</AdminLayout>;
  }

  return (
    <AdminLayout pageTitle="Admin Management">
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Admin Management</h1>
          <p style={styles.subheading}>
            Create and manage admin accounts. Each admin only sees what they need to.
          </p>
        </div>
        <button style={styles.createButton} onClick={() => setShowModal(true)}>
          + Create Admin
        </button>
      </div>

      {admins.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No admins yet. Create one to get started.</p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Last Login</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td style={styles.td}>{a.name}</td>
                <td style={styles.td}>{a.email}</td>
                <td style={styles.td}>
                  <div
                    style={{
                      ...styles.rolePill,
                      backgroundColor: getRolePillColor(a.admin_role),
                      color: a.admin_role === 'super_admin' ? '#0C0904' : '#FFFFFF',
                    }}
                  >
                    {a.admin_role.replace(/_/g, ' ')}
                  </div>
                </td>
                <td style={styles.td}>
                  <span style={a.is_active ? styles.statusActive : styles.statusInactive}>
                    {a.is_active ? '● Active' : '● Inactive'}
                  </span>
                </td>
                <td style={styles.td}>{new Date(a.created_at).toLocaleDateString()}</td>
                <td style={styles.td}>{a.last_login ? new Date(a.last_login).toLocaleDateString() : '—'}</td>
                <td style={styles.td}>
                  <div style={styles.actionButtons}>
                    <button style={styles.actionButton}>Edit</button>
                    <label style={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={a.is_active}
                        onChange={() => handleToggleActive(a.id, a.is_active)}
                        style={styles.checkbox}
                      />
                      {a.is_active ? 'Active' : 'Inactive'}
                    </label>
                    <button
                      style={{ ...styles.actionButton, ...styles.actionButtonDelete }}
                      onClick={() => handleDeleteAdmin(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create Admin Modal */}
      {showModal && (
        <div style={styles.modal} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Admin</h2>
            </div>

            <form onSubmit={handleCreateAdmin}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  style={{ ...styles.input, ...(emailFocused ? styles.inputFocus : {}) }}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Admin Role</label>
                <select
                  style={styles.select}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
                >
                  <option value="finance_admin">Finance Admin</option>
                  <option value="support_admin">Support Admin</option>
                  <option value="analytics_admin">Analytics Admin</option>
                  <option value="content_admin">Content Admin</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Permissions</label>
                <div style={styles.permissionsList}>
                  {Object.entries(permissions).map(([key, value]) => (
                    <div key={key} style={styles.permissionItem}>
                      <span>{value ? '✓' : '✗'}</span>
                      <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div style={{ color: '#FF5252', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}

              <div style={styles.buttonGroup}>
                <button
                  type="button"
                  style={{ ...styles.modalButton, ...styles.secondaryButton }}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...styles.modalButton, ...styles.primaryButton }}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
