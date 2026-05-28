// admin_activity_log table required in Supabase — see admin/lib/admin-activity.ts

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOutAdmin, getAdminUser, type AdminUser } from '../lib/admin-auth';
import { logAdminActivity } from '../lib/admin-activity';
import { supabase } from '../lib/supabase';

const GOLD    = '#D4A853';
const SIDEBAR = '#0C0904';
const WW      = '#F0E8D5';
const MONO    = '"DM Mono", monospace';
const SERIF   = '"Playfair Display", serif';

const NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',       icon: '📊', permission: null              },
  { id: 'events',        label: 'Events',           icon: '📅', permission: 'canViewEvents'   },
  { id: 'users',         label: 'Users',            icon: '👥', permission: 'canViewUsers'    },
  { id: 'payouts',       label: 'Payouts',          icon: '💰', permission: 'canViewPayouts'  },
  { id: 'analytics',     label: 'Analytics',        icon: '📈', permission: 'canViewAnalytics'},
  { id: 'kyc',           label: 'KYC Review',       icon: '✅', permission: 'canViewKYC'      },
  { id: 'pricing',       label: 'Pricing',          icon: '🏷️', permission: 'canEditPricing'  },
  { id: 'packages',      label: 'Packages',         icon: '📦', permission: 'canEditPricing'  },
  { id: 'notifications', label: 'Notifications',    icon: '🔔', permission: 'canSendNotifications' },
  { id: 'settings',      label: 'Settings',         icon: '⚙️', permission: 'canEditSettings' },
  { id: 'admin-mgmt',    label: 'Admin Management', icon: '👤', permission: 'canManageAdmins' },
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

function timeAgo(iso: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Notification Bell ──────────────────────────────────────────────────────────

interface AdminNotif {
  id:          string;
  type:        string;
  message:     string;
  is_read:     boolean;
  created_at:  string;
  organiser_id: string | null;
}

const NOTIF_ICON: Record<string, string> = {
  kyc_flagged:      '🔍',
  kyc_approved:     '✅',
  kyc_rejected:     '❌',
  payout_requested: '💰',
  fraud_alert:      '⚠️',
  new_organiser:    '🆕',
  default:          '🔔',
};

function NotificationBell() {
  const navigate   = useNavigate();
  const [notifs,   setNotifs]   = useState<AdminNotif[]>([]);
  const [open,     setOpen]     = useState(false);
  const [unread,   setUnread]   = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  const loadNotifs = async () => {
    const { data } = await supabase
      .from('admin_notifications')
      .select('id, type, message, is_read, created_at, organiser_id')
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (data ?? []) as AdminNotif[];
    setNotifs(rows);
    setUnread(rows.filter(n => !n.is_read).length);
  };

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async () => {
    await supabase.from('admin_notifications').update({ is_read: true }).eq('is_read', false);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const handleNotifClick = async (n: AdminNotif) => {
    if (!n.is_read) {
      await supabase.from('admin_notifications').update({ is_read: true }).eq('id', n.id);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    if (n.type?.includes('kyc'))    { navigate('/admin/kyc');     setOpen(false); }
    else if (n.type?.includes('payout')) { navigate('/admin/payouts'); setOpen(false); }
  };

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: '8px', transition: 'background 0.15s', backgroundColor: open ? 'rgba(0,0,0,0.06)' : 'transparent' }}
        title="Notifications"
      >
        <span style={{ fontSize: '20px', lineHeight: 1 }}>🔔</span>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: '2px', right: '2px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: '#F44336', color: '#fff', fontSize: '10px', fontWeight: '700', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '340px', backgroundColor: '#fff', border: '1px solid #E8E3DC', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 300, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #E8E3DC' }}>
            <span style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', fontSize: '11px', color: GOLD, cursor: 'pointer', fontFamily: MONO, fontWeight: '600', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifs.slice(0, 5).length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#bbb', fontSize: '12px', fontFamily: MONO }}>No notifications</div>
            ) : (
              notifs.slice(0, 5).map(n => (
                <div key={n.id} onClick={() => handleNotifClick(n)}
                  style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 16px', borderBottom: '1px solid #F5F3EF', cursor: 'pointer', backgroundColor: n.is_read ? 'transparent' : `${GOLD}10`, transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = n.is_read ? 'transparent' : `${GOLD}10`}
                >
                  <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>{NOTIF_ICON[n.type] ?? NOTIF_ICON.default}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#0C0904', fontFamily: MONO, lineHeight: '1.4', marginBottom: '3px', wordBreak: 'break-word' }}>{n.message}</div>
                    <div style={{ fontSize: '10px', color: '#bbb', fontFamily: MONO }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: GOLD, flexShrink: 0, marginTop: '5px' }} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick Stats ────────────────────────────────────────────────────────────────

interface QuickStats {
  activeEvents:    number;
  pendingKyc:      number;
  pendingPayouts:  number;
}

function SidebarQuickStats() {
  const [stats, setStats] = useState<QuickStats>({ activeEvents: 0, pendingKyc: 0, pendingPayouts: 0 });

  const load = async () => {
    try {
      const [{ count: ev }, { count: kyc }, { count: pay }] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('organiser_kyc').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      setStats({ activeEvents: ev ?? 0, pendingKyc: kyc ?? 0, pendingPayouts: pay ?? 0 });
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '4px' }}>
      <div style={{ fontSize: '9px', color: '#444', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '8px' }}>Live Stats</div>
      {[
        { label: 'Active Events',    value: stats.activeEvents,   amber: false },
        { label: 'Pending KYC',      value: stats.pendingKyc,     amber: stats.pendingKyc > 0 },
        { label: 'Pending Payouts',  value: stats.pendingPayouts, amber: false },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: '#666', fontFamily: MONO }}>{s.label}</span>
          <span style={{ fontSize: '12px', fontWeight: '700', color: s.amber ? '#FF9800' : '#888', fontFamily: MONO, minWidth: '24px', textAlign: 'right' }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── System Status ──────────────────────────────────────────────────────────────

function SystemStatus() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { error } = await supabase.from('admin_settings').select('key').limit(1);
        setOk(!error);
      } catch { setOk(false); }
    };
    check();
    const t = setInterval(check, 120_000);
    return () => clearInterval(t);
  }, []);

  const color  = ok === null ? '#666' : ok ? '#4CAF50' : '#F44336';
  const label  = ok === null ? 'Checking…' : ok ? 'All Systems Operational' : 'Database Issue Detected';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0', marginBottom: '6px' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: ok ? `0 0 6px ${color}` : 'none' }} />
      <span style={{ fontSize: '10px', color: '#555', fontFamily: MONO, lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

// ── Activity Log Modal ─────────────────────────────────────────────────────────

interface ActivityEntry {
  id:          string;
  admin_id:    string;
  action:      string;
  entity_type: string | null;
  entity_id:   string | null;
  details:     Record<string, unknown>;
  created_at:  string;
  admin?:      { full_name: string; email: string } | null;
}

function ActivityLogModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('admin_activity_log')
          .select('*, admin:admin_id(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(100);
        setEntries((data ?? []) as ActivityEntry[]);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const thS: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase', backgroundColor: '#F5F3EF', fontFamily: MONO, whiteSpace: 'nowrap' };
  const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '900px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E3DC', backgroundColor: '#0C0904' }}>
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: WW, margin: '0 0 2px' }}>Admin Activity Log</h2>
            <div style={{ fontSize: '11px', color: '#666', fontFamily: MONO }}>Last 100 actions</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666', lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontFamily: MONO }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#bbb', fontFamily: MONO, fontSize: '13px' }}>No activity logged yet.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  {['Admin', 'Action', 'Entity Type', 'Entity', 'Time'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}
                    onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                    <td style={{ ...tdS, fontWeight: '600', color: '#0C0904' }}>
                      {(e.admin as any)?.full_name || (e.admin as any)?.email || '—'}
                    </td>
                    <td style={{ ...tdS, color: GOLD }}>{e.action.replace(/_/g, ' ')}</td>
                    <td style={{ ...tdS, color: '#888' }}>{e.entity_type ?? '—'}</td>
                    <td style={{ ...tdS, fontSize: '11px', color: '#aaa', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.entity_id ?? '—'}</td>
                    <td style={{ ...tdS, color: '#888', whiteSpace: 'nowrap' }}>{timeAgo(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface AdminLayoutProps {
  children:   React.ReactNode;
  pageTitle:  string;
  breadcrumb?: string;
}

export default function AdminLayout({ children, pageTitle, breadcrumb }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin,       setAdmin]       = useState<AdminUser | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [activityLog, setActivityLog] = useState(false);

  useEffect(() => {
    getAdminUser().then(user => {
      if (!user) { navigate('/admin/login'); return; }
      setAdmin(user);
      setLoading(false);
      logAdminActivity(user.id, 'page_view', 'page', location.pathname);
    });
  }, [navigate, location.pathname]);

  const handleSignOut = async () => {
    if (admin) logAdminActivity(admin.id, 'admin_logout');
    await signOutAdmin();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#F5F3EF', fontFamily: MONO, color: '#888' }}>
        Loading...
      </div>
    );
  }

  const filteredNav = NAV_ITEMS.filter(
    item => !item.permission || (admin?.permissions as any)[item.permission]
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F5F3EF', fontFamily: MONO }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: '240px', backgroundColor: SIDEBAR, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto', zIndex: 100 }}>

        {/* Logo */}
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: GOLD, flexShrink: 0 }} />
            <span style={{ fontFamily: SERIF, fontSize: '13px', fontWeight: '700', color: WW, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Guestful Clicks</span>
          </div>
          <div style={{ fontSize: '10px', color: GOLD, letterSpacing: '2px', textTransform: 'uppercase', paddingLeft: '15px' }}>Admin Panel</div>
        </div>

        {/* Admin info */}
        {admin && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: WW, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {admin.full_name || admin.email}
            </div>
            <div style={{ display: 'inline-block', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', backgroundColor: getRolePillColor(admin.role), color: admin.role === 'super_admin' ? '#0C0904' : '#FFFFFF', fontWeight: '600', textTransform: 'capitalize', letterSpacing: '0.3px' }}>
              {admin.role.replace(/_/g, ' ')}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {filteredNav.map(item => {
            const route    = `/admin/${item.id}`;
            const isActive = location.pathname === route;
            return (
              <button key={item.id} onClick={() => navigate(route)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 24px', background: isActive ? 'rgba(212,168,83,0.12)' : 'transparent', border: 'none', borderLeft: isActive ? `3px solid ${GOLD}` : '3px solid transparent', color: isActive ? GOLD : '#888', fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: MONO }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quick stats */}
        <SidebarQuickStats />

        {/* Logout + system status + activity log */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {admin && (
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin.email}</div>
          )}

          <SystemStatus />

          <button onClick={() => setActivityLog(true)}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: '11px', cursor: 'pointer', padding: '0', fontFamily: MONO, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
            📋 View Activity Log
          </button>

          <button onClick={handleSignOut} style={{ background: 'none', border: 'none', color: '#FF6B6B', fontSize: '13px', cursor: 'pointer', padding: '0', fontFamily: MONO, display: 'flex', alignItems: 'center', gap: '6px' }}>
            ↩ Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ marginLeft: '240px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <header style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8E3DC', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div>
            <h1 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '700', color: '#0C0904', lineHeight: 1 }}>{pageTitle}</h1>
            {breadcrumb && <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>{breadcrumb}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <NotificationBell />
            {admin && <div style={{ fontSize: '12px', color: '#888', fontFamily: MONO }}>{admin.full_name || admin.email}</div>}
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      {/* Activity Log Modal */}
      {activityLog && <ActivityLogModal onClose={() => setActivityLog(false)} />}
    </div>
  );
}
