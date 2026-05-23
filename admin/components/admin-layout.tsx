import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOutAdmin, getAdminUser, AdminUser } from '../lib/admin-auth';

const GOLD     = '#D4A853';
const SIDEBAR  = '#0C0904';
const WW       = '#F0E8D5';

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',        icon: '📊', permission: null },
  { id: 'events',     label: 'Events',            icon: '📅', permission: 'canViewEvents' },
  { id: 'users',      label: 'Users',             icon: '👥', permission: 'canViewUsers' },
  { id: 'payouts',    label: 'Payouts',           icon: '💰', permission: 'canViewPayouts' },
  { id: 'analytics',  label: 'Analytics',         icon: '📈', permission: 'canViewAnalytics' },
  { id: 'kyc',        label: 'KYC Review',        icon: '✅', permission: 'canViewKYC' },
  { id: 'pricing',    label: 'Pricing',           icon: '🏷️', permission: 'canEditPricing' },
  { id: 'notifications', label: 'Notifications',  icon: '🔔', permission: 'canSendNotifications' },
  { id: 'settings',   label: 'Settings',          icon: '⚙️', permission: 'canEditSettings' },
  { id: 'admin-mgmt', label: 'Admin Management',  icon: '👤', permission: 'canManageAdmins' },
];

function getRolePillColor(role: string): string {
  switch (role) {
    case 'super_admin':     return GOLD;
    case 'finance_admin':   return '#4A90E2';
    case 'support_admin':   return '#50C878';
    case 'analytics_admin': return '#9B59B6';
    case 'content_admin':   return '#FF9500';
    default:                return '#808080';
  }
}

interface AdminLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  breadcrumb?: string;
}

export default function AdminLayout({ children, pageTitle, breadcrumb }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin]     = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminUser().then(user => {
      if (!user) { navigate('/admin/login'); return; }
      setAdmin(user);
      setLoading(false);
    });
  }, [navigate]);

  const handleSignOut = async () => {
    await signOutAdmin();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#F5F3EF', fontFamily: '"DM Mono", monospace', color: '#888' }}>
        Loading...
      </div>
    );
  }

  const filteredNav = NAV_ITEMS.filter(
    item => !item.permission || (admin?.permissions as any)[item.permission]
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F5F3EF', fontFamily: '"DM Mono", monospace' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: '240px',
        backgroundColor: SIDEBAR,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        overflowY: 'auto',
        zIndex: 100,
      }}>

        {/* Logo */}
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: GOLD, flexShrink: 0 }} />
            <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '13px', fontWeight: '700', color: WW, letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>
              Guestful Clicks
            </span>
          </div>
          <div style={{ fontSize: '10px', color: GOLD, letterSpacing: '2px', textTransform: 'uppercase' as const, paddingLeft: '15px' }}>
            Admin Panel
          </div>
        </div>

        {/* Admin info */}
        {admin && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: WW, marginBottom: '6px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {admin.full_name || admin.email}
            </div>
            <div style={{
              display: 'inline-block',
              fontSize: '10px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: getRolePillColor(admin.role),
              color: admin.role === 'super_admin' ? '#0C0904' : '#FFFFFF',
              fontWeight: '600',
              textTransform: 'capitalize' as const,
              letterSpacing: '0.3px',
            }}>
              {admin.role.replace(/_/g, ' ')}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {filteredNav.map(item => {
            const route   = `/admin/${item.id}`;
            const isActive = location.pathname === route;
            return (
              <button
                key={item.id}
                onClick={() => navigate(route)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '11px 24px',
                  background: isActive ? 'rgba(212,168,83,0.12)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? `3px solid ${GOLD}` : '3px solid transparent',
                  color: isActive ? GOLD : '#888',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  transition: 'all 0.15s',
                  fontFamily: '"DM Mono", monospace',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' as const }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom — logout */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {admin && (
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {admin.email}
            </div>
          )}
          <button
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: 'none',
              color: '#FF6B6B',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '0',
              fontFamily: '"DM Mono", monospace',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ↩ Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div style={{ marginLeft: '240px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <header style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E8E3DC',
          padding: '0 32px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: '700', color: '#0C0904', lineHeight: 1 }}>
              {pageTitle}
            </h1>
            {breadcrumb && <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>{breadcrumb}</div>}
          </div>
          {admin && (
            <div style={{ fontSize: '12px', color: '#888' }}>
              {admin.full_name || admin.email}
            </div>
          )}
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
