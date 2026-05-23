import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutAdmin, getAdminUser, AdminUser } from '../lib/admin-auth';

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#F5F5F5',
    fontFamily: '"DM Mono", monospace',
  },
  sidebar: {
    width: '240px',
    backgroundColor: '#0C0904',
    borderRight: '2px solid #D4A853',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '24px',
    color: '#F0E8D5',
    position: 'fixed' as const,
    height: '100vh',
    overflowY: 'auto' as const,
  },
  sidebarTop: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #333',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  logoDot: {
    width: '6px',
    height: '6px',
    backgroundColor: '#D4A853',
    borderRadius: '50%',
  },
  logoText: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#D4A853',
    letterSpacing: '1px',
    fontFamily: '"Playfair Display", serif',
  },
  adminLabel: {
    fontSize: '10px',
    color: '#D4A853',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    marginBottom: '12px',
  },
  adminInfo: {
    marginTop: '12px',
  },
  adminName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#F0E8D5',
    marginBottom: '4px',
  },
  adminRolePill: {
    display: 'inline-block',
    fontSize: '10px',
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: '#D4A853',
    color: '#0C0904',
    fontWeight: '600',
    textTransform: 'capitalize' as const,
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  navItem: {
    padding: '12px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#A0A0A0',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    borderLeft: '3px solid transparent',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navItemActive: {
    backgroundColor: 'rgba(212, 168, 83, 0.1)',
    borderLeftColor: '#D4A853',
    color: '#D4A853',
  },
  sidebarBottom: {
    marginTop: 'auto',
    paddingTop: '24px',
    borderTop: '1px solid #333',
  },
  adminEmail: {
    fontSize: '11px',
    color: '#808080',
    marginBottom: '12px',
  },
  signOutButton: {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #FF5252',
    color: '#FF5252',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  main: {
    marginLeft: '240px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E0E0E0',
    padding: '20px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '600',
    fontFamily: '"Playfair Display", serif',
    color: '#0C0904',
  },
  breadcrumb: {
    fontSize: '12px',
    color: '#808080',
  },
  content: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto' as const,
  },
};

interface AdminLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  breadcrumb?: string;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', permission: null },
  { id: 'events', label: 'Events', icon: '📅', permission: 'canViewEvents' },
  { id: 'users', label: 'Users', icon: '👥', permission: 'canViewUsers' },
  { id: 'kyc', label: 'KYC Review', icon: '✅', permission: 'canViewKYC' },
  { id: 'payouts', label: 'Payouts', icon: '💰', permission: 'canViewPayouts' },
  { id: 'analytics', label: 'Analytics', icon: '📈', permission: 'canViewAnalytics' },
  { id: 'pricing', label: 'Pricing', icon: '🏷️', permission: 'canEditPricing' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', permission: 'canSendNotifications' },
  { id: 'settings', label: 'Settings', icon: '⚙️', permission: 'canEditSettings' },
  { id: 'admin-mgmt', label: 'Admin Management', icon: '👤', permission: 'canManageAdmins' },
];

export default function AdminLayout({ children, pageTitle, breadcrumb }: AdminLayoutProps) {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('');

  useEffect(() => {
    const loadAdmin = async () => {
      const user = await getAdminUser();
      if (!user) {
        navigate('/admin/login');
        return;
      }
      setAdmin(user);
      setLoading(false);
    };

    loadAdmin();
  }, [navigate]);

  const handleSignOut = async () => {
    await signOutAdmin();
    navigate('/admin/login');
  };

  if (loading) {
    return <div style={{ ...styles.container, alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.permission || (admin?.permissions as any)[item.permission]
  );

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

  return (
    <div style={styles.container}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.logoRow}>
            <div style={styles.logoDot} />
            <span style={styles.logoText}>GC</span>
          </div>
          <div style={styles.adminLabel}>Admin Panel</div>
          {admin && (
            <div style={styles.adminInfo}>
              <div style={styles.adminName}>{admin.name}</div>
              <div
                style={{
                  ...styles.adminRolePill,
                  backgroundColor: getRolePillColor(admin.role),
                }}
              >
                {admin.role.replace(/_/g, ' ')}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={styles.nav}>
          {filteredNav.map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.navItem,
                ...(activeNav === item.id ? styles.navItemActive : {}),
              }}
              onClick={() => {
                setActiveNav(item.id);
                navigate(`/admin/${item.id === 'dashboard' ? 'dashboard' : item.id}`);
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div style={styles.sidebarBottom}>
          {admin && <div style={styles.adminEmail}>{admin.email}</div>}
          <button style={styles.signOutButton} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div style={styles.main}>
        <div style={styles.topBar}>
          <div style={styles.pageInfo}>
            <h1 style={styles.pageTitle}>{pageTitle}</h1>
            {breadcrumb && <div style={styles.breadcrumb}>{breadcrumb}</div>}
          </div>
        </div>
        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}
