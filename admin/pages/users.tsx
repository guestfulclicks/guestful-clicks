import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole   = 'host' | 'organiser' | 'guest' | 'admin';
type FilterRole = UserRole | 'all';

interface UserRow {
  id:          string;
  full_name:   string;
  email:       string;
  role:        UserRole;
  created_at:  string;
  event_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:     { bg: '#FFE9E9', color: '#B71C1C' },
  organiser: { bg: '#FFF7E0', color: '#7A5200' },
  host:      { bg: '#E6F9EE', color: '#1A7A40' },
  guest:     { bg: '#F0F0F0', color: '#666' },
};

function RolePill({ role }: { role: string }) {
  const s = ROLE_COLORS[role] ?? { bg: '#F0F0F0', color: '#666' };
  return <span style={{ ...s, fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' as const }}>{role}</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#E8E3DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#555', flexShrink: 0 }}>
      {initials || '?'}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState<FilterRole>('all');
  const [totalHosts, setTotalHosts] = useState(0);
  const [totalOrgs, setTotalOrgs]   = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data: us } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (!us?.length) { setUsers([]); setLoading(false); return; }

    const rows: UserRow[] = await Promise.all(
      us.map(async (u: any) => {
        const { count: ec } = await supabase
          .from('events').select('*', { count: 'exact', head: true }).eq('host_id', u.id);
        return {
          id:          u.id,
          full_name:   u.full_name ?? '—',
          email:       u.email,
          role:        u.role,
          created_at:  u.created_at,
          event_count: ec ?? 0,
        };
      })
    );

    setUsers(rows);
    setTotalHosts(rows.filter(r => r.role === 'host').length);
    setTotalOrgs(rows.filter(r => r.role === 'organiser').length);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selectStyle = {
    padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px',
    fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#FFFFFF', cursor: 'pointer',
  };

  return (
    <AdminLayout pageTitle="Users">

      {/* Summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Total Users',      value: users.length },
          { label: 'Hosts',            value: totalHosts },
          { label: 'Organisers',       value: totalOrgs },
          { label: 'Guests',           value: users.filter(u => u.role === 'guest').length },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '120px' }}>
            <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: '#0C0904' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...CARD, marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <input
          style={{ ...selectStyle, flex: 1, minWidth: '200px' }}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={selectStyle} value={roleFilter} onChange={e => setRoleFilter(e.target.value as FilterRole)}>
          <option value="all">All Roles</option>
          <option value="host">Host</option>
          <option value="organiser">Organiser</option>
          <option value="guest">Guest</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={loadUsers} style={{ ...selectStyle, backgroundColor: GOLD, color: '#0C0904', border: 'none', fontWeight: '600' }}>
          Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>No users found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px', fontFamily: MONO }}>
            <thead style={{ backgroundColor: '#F5F3EF', borderBottom: '1px solid #E8E3DC' }}>
              <tr>
                {['User', 'Email', 'Role', 'Events', 'Joined'].map(h => (
                  <th key={h} style={{ textAlign: 'left' as const, padding: '12px 16px', fontWeight: '600', color: '#555', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontSize: '11px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #F5F3EF' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={u.full_name} />
                      <span style={{ fontWeight: '600', color: '#0C0904' }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#555' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}><RolePill role={u.role} /></td>
                  <td style={{ padding: '12px 16px', color: '#555' }}>{u.event_count}</td>
                  <td style={{ padding: '12px 16px', color: '#888', whiteSpace: 'nowrap' as const }}>{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
