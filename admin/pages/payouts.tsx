import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'failed';

interface PayoutRow {
  id:             string;
  event_title:    string;
  organiser_name: string;
  amount:         number;
  status:         PayoutStatus;
  scheduled_date: string;
  event_date:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#FFF7E0', color: '#7A5200' },
  scheduled: { bg: '#EEF4FF', color: '#1E3A8A' },
  paid:      { bg: '#E6F9EE', color: '#1A7A40' },
  failed:    { bg: '#FFE9E9', color: '#B71C1C' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#F0F0F0', color: '#666' };
  return <span style={{ ...s, fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' as const }}>{status}</span>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [payouts, setPayouts]           = useState<PayoutRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | 'all'>('all');
  const [scheduleId, setScheduleId]     = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(todayISO());
  const [totalPending, setTotalPending]     = useState(0);
  const [totalScheduled, setTotalScheduled] = useState(0);
  const [totalPaid, setTotalPaid]           = useState(0);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    const { data: pos } = await supabase
      .from('payouts')
      .select('id, event_id, organiser_id, amount, status, scheduled_date')
      .order('scheduled_date', { ascending: false });

    if (!pos?.length) { setPayouts([]); setLoading(false); return; }

    const rows: PayoutRow[] = await Promise.all(
      pos.map(async (po: any) => {
        const [{ data: ev }, { data: org }] = await Promise.all([
          supabase.from('events').select('title, date').eq('id', po.event_id).single(),
          supabase.from('users').select('full_name').eq('id', po.organiser_id).single(),
        ]);
        return {
          id:             po.id,
          event_title:    (ev as any)?.title     ?? '—',
          organiser_name: (org as any)?.full_name ?? '—',
          amount:         po.amount,
          status:         po.status as PayoutStatus,
          scheduled_date: po.scheduled_date ?? '',
          event_date:     (ev as any)?.date ?? '',
        };
      })
    );

    setPayouts(rows);
    setTotalPending(rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0));
    setTotalScheduled(rows.filter(r => r.status === 'scheduled').reduce((s, r) => s + r.amount, 0));
    setTotalPaid(rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0));
    setLoading(false);
  }, []);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const handleSchedule = async () => {
    if (!scheduleId) return;
    await supabase.from('payouts').update({ status: 'scheduled', scheduled_date: scheduleDate }).eq('id', scheduleId);
    setScheduleId(null);
    loadPayouts();
  };

  const handleMarkPaid = async (id: string) => {
    if (!window.confirm('Mark this payout as paid?')) return;
    await supabase.from('payouts').update({ status: 'paid' }).eq('id', id);
    loadPayouts();
  };

  const filtered = statusFilter === 'all' ? payouts : payouts.filter(p => p.status === statusFilter);

  const selectStyle = {
    padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px',
    fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#FFFFFF', cursor: 'pointer',
  };

  return (
    <AdminLayout pageTitle="Payouts">

      {/* Summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Pending',   value: fmtINR(totalPending),   accent: true },
          { label: 'Scheduled', value: fmtINR(totalScheduled) },
          { label: 'Paid Out',  value: fmtINR(totalPaid) },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '140px' }}>
            <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: s.accent ? GOLD : '#0C0904' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ ...CARD, marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="scheduled">Scheduled</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
        <button onClick={loadPayouts} style={{ ...selectStyle, backgroundColor: GOLD, color: '#0C0904', border: 'none', fontWeight: '600' }}>
          Refresh
        </button>
      </div>

      {/* Schedule modal */}
      {scheduleId && (
        <div style={{ position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setScheduleId(null)}>
          <div style={{ backgroundColor: '#FFF', borderRadius: '12px', padding: '32px', minWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: SERIF, fontSize: '20px', marginBottom: '20px', color: '#0C0904' }}>Schedule Payout</h3>
            <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Payment Date</label>
            <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
              style={{ ...selectStyle, width: '100%', marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSchedule} style={{ flex: 1, padding: '10px', backgroundColor: GOLD, border: 'none', borderRadius: '8px', color: '#0C0904', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                Confirm
              </button>
              <button onClick={() => setScheduleId(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#F5F3EF', border: 'none', borderRadius: '8px', color: '#555', cursor: 'pointer', fontFamily: MONO }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>Loading payouts…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>No payouts found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px', fontFamily: MONO }}>
            <thead style={{ backgroundColor: '#F5F3EF', borderBottom: '1px solid #E8E3DC' }}>
              <tr>
                {['Event', 'Organiser', 'Amount', 'Status', 'Event Date', 'Scheduled', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left' as const, padding: '12px 16px', fontWeight: '600', color: '#555', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F5F3EF' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0C0904', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.event_title}</td>
                  <td style={{ padding: '14px 16px', color: '#555' }}>{p.organiser_name}</td>
                  <td style={{ padding: '14px 16px', color: GOLD, fontWeight: '600' }}>{fmtINR(p.amount)}</td>
                  <td style={{ padding: '14px 16px' }}><StatusPill status={p.status} /></td>
                  <td style={{ padding: '14px 16px', color: '#888', whiteSpace: 'nowrap' as const }}>{fmtDate(p.event_date)}</td>
                  <td style={{ padding: '14px 16px', color: '#888', whiteSpace: 'nowrap' as const }}>{fmtDate(p.scheduled_date)}</td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' as const }}>
                    {p.status === 'pending' && (
                      <button onClick={() => setScheduleId(p.id)} style={{ marginRight: '6px', padding: '5px 10px', fontSize: '11px', border: '1px solid #4A90E2', color: '#4A90E2', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', fontFamily: MONO }}>
                        Schedule
                      </button>
                    )}
                    {p.status === 'scheduled' && (
                      <button onClick={() => handleMarkPaid(p.id)} style={{ padding: '5px 10px', fontSize: '11px', border: '1px solid #50C878', color: '#50C878', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', fontFamily: MONO }}>
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
