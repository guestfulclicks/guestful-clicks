import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole   = 'host' | 'organiser' | 'guest' | 'admin';
type FilterRole = UserRole | 'all' | 'banned';
type SortKey    = 'newest' | 'oldest' | 'most_events' | 'most_revenue';

interface UserRow {
  id:          string;
  full_name:   string;
  email:       string;
  mobile:      string;
  role:        UserRole;
  country:     string;
  created_at:  string;
  last_active: string;
  event_count: number;
  total_spent: number;
  is_banned:   boolean;
  kyc_status:  string | null;
  push_token:  string | null;
}

interface UserEvent {
  id:     string;
  title:  string;
  date:   string;
  type:   string;
  status: string;
  role:   'host' | 'participant';
}

interface UserPayment {
  id:          string;
  event_title: string;
  amount:      number;
  paid_at:     string;
  tier:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

function timeAgo(iso: string) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) +
         String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65);
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:     { bg: '#FFE9E9', color: '#B71C1C' },
  organiser: { bg: '#FFF7E0', color: '#7A5200' },
  host:      { bg: '#E6F9EE', color: '#1A7A40' },
  guest:     { bg: '#F0F0F0', color: '#555'    },
};

const KYC_COLORS: Record<string, string> = {
  approved:         '#4CAF50',
  pending:          '#FF9800',
  flagged:          '#F44336',
  rejected:         '#F44336',
  pending_resubmit: '#9C27B0',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD}44,${GOLD}22)`, border: `1.5px solid ${GOLD}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: '700', color: GOLD, flexShrink: 0, fontFamily: SERIF }}>
      {initials}
    </div>
  );
}

function RolePill({ role, banned }: { role: string; banned?: boolean }) {
  if (banned) return <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', backgroundColor: '#FFE9E9', color: '#B71C1C', border: '1px solid #FFB3B3' }}>Banned</span>;
  const s = ROLE_COLORS[role] ?? { bg: '#F0F0F0', color: '#666' };
  return <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', backgroundColor: s.bg, color: s.color, textTransform: 'capitalize' as const }}>{role}</span>;
}

function KycPill({ status }: { status: string | null }) {
  if (!status) return <span style={{ fontSize: '11px', color: '#bbb' }}>—</span>;
  const color = KYC_COLORS[status] ?? '#888';
  return <span style={{ fontSize: '11px', fontWeight: '600', color, textTransform: 'capitalize' as const }}>{status.replace(/_/g, ' ')}</span>;
}

function Btn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ border: `1px solid ${color}`, color: hov && !disabled ? '#fff' : color, backgroundColor: hov && !disabled ? color : 'transparent', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: disabled ? 'default' : 'pointer', fontFamily: MONO, transition: 'all 0.15s', fontWeight: '600', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' as const }}
    >
      {label}
    </button>
  );
}

// ── User Detail Panel ─────────────────────────────────────────────────────────

const DETAIL_TABS = ['Profile', 'Events', 'Payments', 'Actions'] as const;
type DetailTab = typeof DETAIL_TABS[number];

function UserDetailPanel({ user, onClose, onRefresh }: { user: UserRow; onClose: () => void; onRefresh: () => void }) {
  const [tab,      setTab]      = useState<DetailTab>('Profile');
  const [events,   setEvents]   = useState<UserEvent[]>([]);
  const [payments, setPayments] = useState<UserPayment[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [msg,      setMsg]      = useState('');
  const [isError,  setIsError]  = useState(false);

  // Action state
  const [editRole,    setEditRole]    = useState<UserRole>(user.role);
  const [banReason,   setBanReason]   = useState('');
  const [pushTitle,   setPushTitle]   = useState('');
  const [pushBody,    setPushBody]    = useState('');
  const [delConfirm,  setDelConfirm]  = useState('');
  const [showDelBox,  setShowDelBox]  = useState(false);

  useEffect(() => {
    if (tab === 'Events')   loadEvents();
    if (tab === 'Payments') loadPayments();
  }, [tab]);

  const loadEvents = async () => {
    const [{ data: hosted }, { data: joined }] = await Promise.all([
      supabase.from('events').select('id, title, date, type, status').eq('host_id', user.id).order('date', { ascending: false }).limit(20),
      supabase.from('participants').select('event_id, events(id, title, date, type, status)').eq('user_id', user.id).limit(20),
    ]);
    const rows: UserEvent[] = [];
    for (const e of (hosted ?? []) as any[]) {
      rows.push({ id: e.id, title: e.title ?? '—', date: e.date ?? '', type: e.type ?? '', status: e.status ?? '', role: 'host' });
    }
    for (const p of (joined ?? []) as any[]) {
      const ev = p.events;
      if (ev) rows.push({ id: ev.id, title: ev.title ?? '—', date: ev.date ?? '', type: ev.type ?? '', status: ev.status ?? '', role: 'participant' });
    }
    setEvents(rows);
  };

  const loadPayments = async () => {
    const { data } = await supabase
      .from('participants').select('id, amount_paid, joined_at, tier, events(title)')
      .eq('user_id', user.id).order('joined_at', { ascending: false }).limit(30);
    setPayments((data ?? []).map((p: any) => ({
      id: p.id, event_title: p.events?.title ?? '—', amount: p.amount_paid ?? 0, paid_at: p.joined_at ?? '', tier: p.tier ?? '—',
    })));
  };

  const flash = (m: string, error = false) => { setMsg(m); setIsError(error); setTimeout(() => setMsg(''), 3500); };

  const saveRole = async () => {
    setBusy(true);
    const { error } = await supabase.from('users').update({ role: editRole }).eq('id', user.id);
    flash(error ? `Error: ${error.message}` : 'Role updated.', !!error);
    if (!error) onRefresh();
    setBusy(false);
  };

  const toggleBan = async () => {
    setBusy(true);
    const newBanned = !user.is_banned;
    const { error } = await supabase.from('users').update({ is_banned: newBanned, ban_reason: newBanned ? (banReason || null) : null }).eq('id', user.id);
    if (!error && newBanned && user.push_token) {
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.push_token, title: 'Account Suspended', body: banReason || 'Your account has been suspended.', sound: 'default' }),
      }).catch(() => {});
    }
    flash(error ? `Error: ${error.message}` : newBanned ? 'User banned.' : 'User unbanned.', !!error);
    if (!error) onRefresh();
    setBusy(false);
  };

  const sendPush = async () => {
    if (!user.push_token || !pushTitle.trim()) { flash('Title required.', true); return; }
    setBusy(true);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.push_token, title: pushTitle, body: pushBody, sound: 'default' }),
    }).catch(() => {});
    setPushTitle(''); setPushBody('');
    flash('Push notification sent.');
    setBusy(false);
  };

  const deleteAccount = async () => {
    if (delConfirm !== user.email) { flash('Email does not match.', true); return; }
    setBusy(true);
    await supabase.from('users').delete().eq('id', user.id);
    onClose(); onRefresh();
    setBusy(false);
  };

  const thS: React.CSSProperties = { padding: '8px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '1px', color: '#888', backgroundColor: '#F5F3EF', textAlign: 'left' as const };
  const tdS: React.CSSProperties = { padding: '10px 12px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', backgroundColor: '#fff', boxShadow: '-4px 0 28px rgba(0,0,0,0.14)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8E3DC', display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0 }}>
        <Avatar name={user.full_name} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '700', color: '#0C0904', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>{user.full_name}</div>
          <div style={{ fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#bbb', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E3DC', backgroundColor: '#FAFAF8', flexShrink: 0 }}>
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '11px 4px', background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t ? GOLD : '#888', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, fontWeight: tab === t ? '600' : '400', marginBottom: '-1px', transition: 'color 0.15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {msg && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, backgroundColor: isError ? '#FFE9E9' : '#E6F9EE', color: isError ? '#B71C1C' : '#1A7A40', border: `1px solid ${isError ? '#FFB3B3' : '#A5D6A7'}` }}>
            {msg}
          </div>
        )}

        {/* Profile */}
        {tab === 'Profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {([
              ['Role',        <RolePill role={user.role} banned={user.is_banned} />],
              ['Mobile',      user.mobile || '—'],
              ['Country',     user.country ? `${countryFlag(user.country)} ${user.country}` : '—'],
              ['Joined',      fmtDate(user.created_at)],
              ['Last Active', timeAgo(user.last_active)],
              ['Events',      String(user.event_count)],
              ['Total Spent', user.total_spent > 0 ? fmtINR(user.total_spent) : '₹0'],
              ['KYC Status',  <KycPill status={user.kyc_status} />],
              ['Push Token',  user.push_token ? <span style={{ color: '#4CAF50', fontSize: '12px' }}>Active</span> : <span style={{ color: '#bbb', fontSize: '12px' }}>None</span>],
            ] as [string, React.ReactNode][]).map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F5F3EF' }}>
                <span style={{ fontSize: '12px', color: '#888', fontFamily: MONO }}>{label}</span>
                <span style={{ fontSize: '12px', color: '#0C0904', fontFamily: MONO, fontWeight: '500', textAlign: 'right' as const }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Events */}
        {tab === 'Events' && (
          events.length === 0
            ? <div style={{ textAlign: 'center', color: '#bbb', fontSize: '13px', padding: '32px 0', fontFamily: MONO }}>No events found.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr>{['Title', 'Date', 'Role', 'Status'].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={`${e.id}-${i}`}>
                      <td style={{ ...tdS, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                      <td style={tdS}><span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: e.role === 'host' ? '#E6F9EE' : '#F0F0F0', color: e.role === 'host' ? '#1A7A40' : '#666', fontWeight: '600', textTransform: 'capitalize' as const }}>{e.role}</span></td>
                      <td style={{ ...tdS, color: '#888', textTransform: 'capitalize' as const }}>{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}

        {/* Payments */}
        {tab === 'Payments' && (
          payments.length === 0
            ? <div style={{ textAlign: 'center', color: '#bbb', fontSize: '13px', padding: '32px 0', fontFamily: MONO }}>No payments found.</div>
            : <>
                <div style={{ marginBottom: '14px', fontFamily: MONO, fontSize: '13px', color: '#555' }}>
                  Total: <strong style={{ color: GOLD }}>{fmtINR(payments.reduce((s, p) => s + p.amount, 0))}</strong>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr>{['Event', 'Tier', 'Amount', 'Date'].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...tdS, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.event_title}</td>
                        <td style={tdS}>{p.tier}</td>
                        <td style={{ ...tdS, color: GOLD, fontWeight: '600' }}>{fmtINR(p.amount)}</td>
                        <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDate(p.paid_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
        )}

        {/* Actions */}
        {tab === 'Actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Edit Role */}
            <div style={{ ...CARD, padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Edit Role</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff' }}>
                  {(['host', 'organiser', 'guest', 'admin'] as UserRole[]).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <Btn label={busy ? '…' : 'Save'} color={GOLD} onClick={saveRole} disabled={busy} />
              </div>
            </div>

            {/* Ban / Unban */}
            <div style={{ ...CARD, padding: '16px', borderColor: user.is_banned ? '#A5D6A7' : '#FFB3B3' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: user.is_banned ? '#1A7A40' : '#B71C1C', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>
                {user.is_banned ? 'Unban User' : 'Ban User'}
              </div>
              {!user.is_banned && (
                <textarea placeholder="Reason for ban (sent via push notification)…" value={banReason} onChange={e => setBanReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, resize: 'vertical' as const, minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box', color: '#333' }} />
              )}
              <Btn label={busy ? '…' : user.is_banned ? 'Unban User' : 'Ban User'} color={user.is_banned ? '#4CAF50' : '#F44336'} onClick={toggleBan} disabled={busy} />
            </div>

            {/* Push Notification */}
            <div style={{ ...CARD, padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Send Push Notification</div>
              {user.push_token ? (
                <>
                  <input placeholder="Title" value={pushTitle} onChange={e => setPushTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, marginBottom: '8px', boxSizing: 'border-box', color: '#333' }} />
                  <textarea placeholder="Message body…" value={pushBody} onChange={e => setPushBody(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, resize: 'vertical' as const, minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box', color: '#333' }} />
                  <Btn label={busy ? '…' : 'Send Push'} color="#4A90E2" onClick={sendPush} disabled={busy} />
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#bbb', fontFamily: MONO }}>No push token — user has not enabled notifications.</div>
              )}
            </div>

            {/* Delete Account */}
            <div style={{ ...CARD, padding: '16px', borderColor: '#FFB3B3' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#B71C1C', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Delete Account</div>
              {!showDelBox
                ? <Btn label="Delete Account" color="#F44336" onClick={() => setShowDelBox(true)} />
                : <>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '8px', fontFamily: MONO }}>Type <strong>{user.email}</strong> to confirm:</div>
                    <input placeholder={user.email} value={delConfirm} onChange={e => setDelConfirm(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #F44336', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, marginBottom: '10px', boxSizing: 'border-box', color: '#333' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Btn label={busy ? '…' : 'Confirm Delete'} color="#F44336" onClick={deleteAccount} disabled={busy || delConfirm !== user.email} />
                      <Btn label="Cancel" color="#888" onClick={() => { setShowDelBox(false); setDelConfirm(''); }} />
                    </div>
                  </>
              }
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);

  const [search,        setSearch]        = useState('');
  const [roleFilter,    setRoleFilter]    = useState<FilterRole>('all');
  const [countryFilter, setCountryFilter] = useState('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [sortKey,       setSortKey]       = useState<SortKey>('newest');
  const [countries,     setCountries]     = useState<string[]>([]);
  const [newToday,      setNewToday]      = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);

    const { data: us } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at, country, mobile, is_banned, push_token, last_active')
      .order('created_at', { ascending: false });

    if (!us?.length) { setUsers([]); setLoading(false); return; }

    const rows: UserRow[] = await Promise.all(
      us.map(async (u: any) => {
        const [{ count: ec }, { data: spent }, { data: kyc }] = await Promise.all([
          supabase.from('events').select('*', { count: 'exact', head: true }).eq('host_id', u.id),
          supabase.from('participants').select('amount_paid').eq('user_id', u.id),
          u.role === 'organiser'
            ? supabase.from('organiser_kyc').select('verification_status').eq('organiser_id', u.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return {
          id:          u.id,
          full_name:   u.full_name ?? '—',
          email:       u.email ?? '',
          mobile:      u.mobile ?? '',
          role:        (u.role ?? 'guest') as UserRole,
          country:     u.country ?? '',
          created_at:  u.created_at ?? '',
          last_active: u.last_active ?? '',
          event_count: ec ?? 0,
          total_spent: (spent ?? []).reduce((s: number, p: any) => s + (p.amount_paid ?? 0), 0),
          is_banned:   u.is_banned ?? false,
          kyc_status:  (kyc as any)?.verification_status ?? null,
          push_token:  u.push_token ?? null,
        };
      })
    );

    const todayPfx = new Date().toISOString().split('T')[0];
    setNewToday(rows.filter(r => r.created_at.startsWith(todayPfx)).length);
    setCountries([...new Set(rows.map(r => r.country).filter(Boolean))].sort());
    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleRefresh = () => { setSelected(null); loadUsers(); };

  const filtered = users
    .filter(u => {
      if (roleFilter === 'banned' && !u.is_banned) return false;
      if (roleFilter !== 'all' && roleFilter !== 'banned' && u.role !== roleFilter) return false;
      if (countryFilter && u.country !== countryFilter) return false;
      if (dateFrom && u.created_at < dateFrom) return false;
      if (dateTo   && u.created_at > dateTo + 'T23:59:59') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) && !u.mobile.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'newest')       return b.created_at.localeCompare(a.created_at);
      if (sortKey === 'oldest')       return a.created_at.localeCompare(b.created_at);
      if (sortKey === 'most_events')  return b.event_count - a.event_count;
      if (sortKey === 'most_revenue') return b.total_spent - a.total_spent;
      return 0;
    });

  const hasFilters = search || roleFilter !== 'all' || countryFilter || dateFrom || dateTo;

  const ROLE_PILLS: { label: string; value: FilterRole }[] = [
    { label: 'All',        value: 'all'       },
    { label: 'Hosts',      value: 'host'      },
    { label: 'Organisers', value: 'organiser' },
    { label: 'Guests',     value: 'guest'     },
    { label: 'Admins',     value: 'admin'     },
    { label: 'Banned',     value: 'banned'    },
  ];

  const inputS: React.CSSProperties = { padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff' };
  const thS: React.CSSProperties    = { padding: '10px 14px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', letterSpacing: '1.2px', color: '#888', textTransform: 'uppercase' as const, backgroundColor: '#F5F3EF', whiteSpace: 'nowrap' as const };
  const tdS: React.CSSProperties    = { padding: '12px 14px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  return (
    <AdminLayout pageTitle="Users">

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { icon: '👥', label: 'Total Users',      value: users.length },
          { icon: '🆕', label: 'New Today',         value: newToday },
          { icon: '🏠', label: 'Active Hosts',      value: users.filter(u => u.role === 'host' && !u.is_banned).length },
          { icon: '🎪', label: 'Active Organisers', value: users.filter(u => u.role === 'organiser' && !u.is_banned).length },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '130px' }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>{s.icon}</div>
            <div style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', color: '#0C0904', lineHeight: 1, marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...CARD, marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: '12px' }}>
          <input style={{ ...inputS, flex: 1, minWidth: '220px' }} placeholder="Search by name, email or mobile…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={inputS} value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{countryFlag(c)} {c}</option>)}
          </select>
          <input type="date" style={inputS} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Joined from" />
          <input type="date" style={inputS} value={dateTo}   onChange={e => setDateTo(e.target.value)}   title="Joined to" />
          <select style={inputS} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="most_events">Most Events</option>
            <option value="most_revenue">Most Revenue</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setRoleFilter('all'); setCountryFilter(''); setDateFrom(''); setDateTo(''); }}
              style={{ ...inputS, cursor: 'pointer', color: '#888', backgroundColor: '#F5F3EF' }}>
              Clear
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          {ROLE_PILLS.map(p => (
            <button key={p.value} onClick={() => setRoleFilter(p.value)}
              style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${roleFilter === p.value ? GOLD : '#E8E3DC'}`, backgroundColor: roleFilter === p.value ? GOLD : 'transparent', color: roleFilter === p.value ? '#0C0904' : '#666', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, fontWeight: roleFilter === p.value ? '600' : '400', transition: 'all 0.15s' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px', fontFamily: MONO }}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px', fontFamily: MONO }}>No users found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['User', 'Email', 'Mobile', 'Role', 'Country', 'Joined', 'Events', 'Spent', 'KYC', 'Last Active', ''].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <td style={tdS}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={u.full_name} size={32} />
                        <span style={{ fontWeight: '600', color: '#0C0904', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{u.full_name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdS, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{u.email}</td>
                    <td style={tdS}>{u.mobile || '—'}</td>
                    <td style={tdS}><RolePill role={u.role} banned={u.is_banned} /></td>
                    <td style={tdS}>{u.country ? `${countryFlag(u.country)} ${u.country}` : '—'}</td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' as const }}>{fmtDate(u.created_at)}</td>
                    <td style={{ ...tdS, textAlign: 'center' as const }}>{u.event_count}</td>
                    <td style={{ ...tdS, color: u.total_spent > 0 ? GOLD : '#bbb', fontWeight: u.total_spent > 0 ? '600' : '400' }}>{u.total_spent > 0 ? fmtINR(u.total_spent) : '—'}</td>
                    <td style={tdS}><KycPill status={u.kyc_status} /></td>
                    <td style={{ ...tdS, color: '#aaa', whiteSpace: 'nowrap' as const }}>{timeAgo(u.last_active)}</td>
                    <td style={tdS}>
                      <button onClick={e => { e.stopPropagation(); setSelected(u); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', color: '#888' }} title="View">👁</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overlay + panel */}
      {selected && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setSelected(null)} />
          <UserDetailPanel user={selected} onClose={() => setSelected(null)} onRefresh={handleRefresh} />
        </>
      )}
    </AdminLayout>
  );
}
