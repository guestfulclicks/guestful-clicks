import React from 'react';

const GOLD  = '#D4A853';
const GREEN = '#4CAF50';
const BLUE  = '#5B8AF0';
const RED   = '#FF5252';
const MONO  = '"DM Mono", monospace';

export type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'failed';

export interface PayoutTableRow {
  id: string;
  event_title: string;
  organiser_name: string;
  amount: number;
  status: PayoutStatus;
  scheduled_date: string;
  event_date: string;
}

interface PayoutTableProps {
  payouts: PayoutTableRow[];
  loading?: boolean;
  onSchedule?:  (id: string) => void;
  onMarkPaid?:  (id: string) => void;
  onMarkFailed?: (id: string) => void;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function statusMeta(s: PayoutStatus): { label: string; color: string } {
  switch (s) {
    case 'pending':   return { label: 'Pending',   color: GOLD  };
    case 'scheduled': return { label: 'Scheduled', color: BLUE  };
    case 'paid':      return { label: 'Paid',       color: GREEN };
    case 'failed':    return { label: 'Failed',     color: RED   };
  }
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600',
  letterSpacing: '1.5px', color: 'rgba(240,232,213,0.5)', backgroundColor: '#141210',
  fontFamily: MONO, whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '12px 14px', fontSize: '13px', color: '#F0E8D5',
  fontFamily: MONO, borderBottom: '1px solid rgba(240,232,213,0.1)', whiteSpace: 'nowrap',
};

export function PayoutTable({ payouts, loading, onSchedule, onMarkPaid, onMarkFailed }: PayoutTableProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '24px', color: 'rgba(240,232,213,0.5)', fontFamily: MONO, fontSize: '13px' }}>
        <div style={{ width: '16px', height: '16px', border: `2px solid ${GOLD}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading payouts…
      </div>
    );
  }

  if (!payouts.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(240,232,213,0.5)', fontFamily: MONO, fontSize: '14px' }}>
        No payouts found.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO }}>
        <thead>
          <tr>
            {['Event', 'Organiser', 'Amount', 'Status', 'Event Date', 'Sched. Date', 'Actions'].map(h => (
              <th key={h} style={th}>{h.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payouts.map((po, idx) => {
            const meta = statusMeta(po.status);
            return (
              <tr key={po.id} style={{ backgroundColor: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{po.event_title}</td>
                <td style={{ ...td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{po.organiser_name}</td>
                <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{fmtINR(po.amount)}</td>

                <td style={td}>
                  <span style={{
                    border: `1px solid ${meta.color}`, color: meta.color,
                    fontSize: '10px', letterSpacing: '0.6px', fontWeight: '600',
                    padding: '3px 10px', borderRadius: '20px',
                  }}>
                    {meta.label}
                  </span>
                </td>

                <td style={td}>{fmtDate(po.event_date)}</td>
                <td style={td}>{fmtDate(po.scheduled_date)}</td>

                <td style={td}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {po.status === 'pending' && onSchedule && (
                      <button onClick={() => onSchedule(po.id)} style={{ border: `1px solid ${BLUE}`, color: BLUE, backgroundColor: 'transparent', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO }}>
                        Schedule
                      </button>
                    )}
                    {(po.status === 'pending' || po.status === 'scheduled') && onMarkPaid && (
                      <button onClick={() => onMarkPaid(po.id)} style={{ border: `1px solid ${GREEN}`, color: GREEN, backgroundColor: 'transparent', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO }}>
                        Mark Paid
                      </button>
                    )}
                    {po.status !== 'paid' && po.status !== 'failed' && onMarkFailed && (
                      <button onClick={() => onMarkFailed(po.id)} style={{ border: `1px solid ${RED}`, color: RED, backgroundColor: 'transparent', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO }}>
                        Failed
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
