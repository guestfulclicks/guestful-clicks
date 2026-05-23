import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'active' | 'revealed' | 'archived';
type FilterType   = 'all' | 'private' | 'public';

interface EventRow {
  id:          string;
  title:       string;
  type:        'private' | 'public';
  status:      'active' | 'revealed' | 'archived';
  date:        string;
  host_name:   string;
  guest_count: number;
  photo_count: number;
  revenue:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active:   { bg: '#E6F9EE', color: '#1A7A40' },
    revealed: { bg: '#FFF3CD', color: '#856404' },
    archived: { bg: '#F0F0F0', color: '#666' },
  };
  const s = map[status] ?? { bg: '#F0F0F0', color: '#666' };
  return <span style={{ ...s, fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' as const }}>{status}</span>;
}

function TypePill({ type }: { type: string }) {
  const isPublic = type === 'public';
  return <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', backgroundColor: isPublic ? '#EEF4FF' : '#F5F3EF', color: isPublic ? '#4A90E2' : '#666', textTransform: 'capitalize' as const }}>{type}</span>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents]                 = useState<EventRow[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter]         = useState<FilterType>('all');
  const [totalRevenue, setTotalRevenue]     = useState(0);
  const [activeCount, setActiveCount]       = useState(0);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data: evs } = await supabase
      .from('events')
      .select('id, title, type, status, date, host_id, guest_count')
      .order('date', { ascending: false });

    if (!evs?.length) { setEvents([]); setLoading(false); return; }

    const rows: EventRow[] = await Promise.all(
      evs.map(async (ev: any) => {
        const [{ data: host }, { count: pc }, { data: paid }] = await Promise.all([
          supabase.from('users').select('full_name').eq('id', ev.host_id).single(),
          supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('participants').select('amount_paid').eq('event_id', ev.id),
        ]);
        const revenue = (paid ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0);
        return {
          id:          ev.id,
          title:       ev.title,
          type:        ev.type,
          status:      ev.status,
          date:        ev.date,
          host_name:   (host as any)?.full_name ?? '—',
          guest_count: ev.guest_count ?? 0,
          photo_count: pc ?? 0,
          revenue,
        };
      })
    );

    setEvents(rows);
    setTotalRevenue(rows.reduce((s, r) => s + r.revenue, 0));
    setActiveCount(rows.filter(r => r.status === 'active').length);
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const filtered = events.filter(ev => {
    if (statusFilter !== 'all' && ev.status !== statusFilter) return false;
    if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
    if (search && !ev.title.toLowerCase().includes(search.toLowerCase()) && !ev.host_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleReveal = async (id: string) => {
    if (!window.confirm('Reveal this event now?')) return;
    await supabase.from('events').update({ status: 'revealed' }).eq('id', id);
    loadEvents();
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archive this event?')) return;
    await supabase.from('events').update({ status: 'archived' }).eq('id', id);
    loadEvents();
  };

  const selectStyle = {
    padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px',
    fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#FFFFFF', cursor: 'pointer',
  };

  return (
    <AdminLayout pageTitle="Events">

      {/* Summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Total Events', value: events.length },
          { label: 'Active Now',   value: activeCount },
          { label: 'Total Revenue',value: fmtINR(totalRevenue) },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '140px' }}>
            <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: '#0C0904' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...CARD, marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <input
          style={{ ...selectStyle, flex: 1, minWidth: '180px' }}
          placeholder="Search events or hosts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value as FilterStatus)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="revealed">Revealed</option>
          <option value="archived">Archived</option>
        </select>
        <select style={selectStyle} value={typeFilter} onChange={e => setTypeFilter(e.target.value as FilterType)}>
          <option value="all">All Types</option>
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
        <button onClick={loadEvents} style={{ ...selectStyle, backgroundColor: GOLD, color: '#0C0904', border: 'none', fontWeight: '600' }}>
          Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>Loading events…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>No events found.</div>
        ) : (
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px', fontFamily: MONO }}>
              <thead style={{ backgroundColor: '#F5F3EF', borderBottom: '1px solid #E8E3DC' }}>
                <tr>
                  {['Event', 'Host', 'Type', 'Date', 'Guests', 'Photos', 'Revenue', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left' as const, padding: '12px 16px', fontWeight: '600', color: '#555', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(ev => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #F5F3EF' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0C0904', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{ev.title}</td>
                    <td style={{ padding: '14px 16px', color: '#555' }}>{ev.host_name}</td>
                    <td style={{ padding: '14px 16px' }}><TypePill type={ev.type} /></td>
                    <td style={{ padding: '14px 16px', color: '#555', whiteSpace: 'nowrap' as const }}>{fmtDate(ev.date)}</td>
                    <td style={{ padding: '14px 16px', color: '#555' }}>{ev.guest_count}</td>
                    <td style={{ padding: '14px 16px', color: '#555' }}>{ev.photo_count}</td>
                    <td style={{ padding: '14px 16px', color: GOLD, fontWeight: '600' }}>{fmtINR(ev.revenue)}</td>
                    <td style={{ padding: '14px 16px' }}><StatusPill status={ev.status} /></td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' as const }}>
                      {ev.status === 'active' && (
                        <button onClick={() => handleReveal(ev.id)} style={{ marginRight: '6px', padding: '5px 10px', fontSize: '11px', border: `1px solid ${GOLD}`, color: GOLD, backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', fontFamily: MONO }}>
                          Reveal
                        </button>
                      )}
                      {ev.status !== 'archived' && (
                        <button onClick={() => handleArchive(ev.id)} style={{ padding: '5px 10px', fontSize: '11px', border: '1px solid #DDD', color: '#888', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', fontFamily: MONO }}>
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
