import React from 'react';

const GOLD  = '#D4A853';
const GREEN = '#4CAF50';
const MONO  = '"DM Mono", monospace';

export interface EventTableRow {
  id: string;
  title: string;
  type: 'private' | 'public';
  status: 'active' | 'revealed' | 'archived';
  date: string;
  host_name: string;
  guest_count: number;
  photo_count: number;
  revenue: number;
}

interface EventTableProps {
  events: EventTableRow[];
  loading?: boolean;
  onReveal?:  (id: string) => void;
  onArchive?: (id: string) => void;
  onView?:    (row: EventTableRow) => void;
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

function statusColor(s: string): string {
  if (s === 'active')   return GREEN;
  if (s === 'revealed') return GOLD;
  return '#888';
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

export function EventTable({ events, loading, onReveal, onArchive, onView }: EventTableProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '24px', color: 'rgba(240,232,213,0.5)', fontFamily: MONO, fontSize: '13px' }}>
        <div style={{ width: '16px', height: '16px', border: `2px solid ${GOLD}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading events…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(240,232,213,0.5)', fontFamily: MONO, fontSize: '14px' }}>
        No events found.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO }}>
        <thead>
          <tr>
            {['Event', 'Type', 'Date', 'Host', 'Status', 'Guests', 'Photos', 'Revenue', 'Actions'].map(h => (
              <th key={h} style={th}>{h.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((ev, idx) => (
            <tr key={ev.id} style={{ backgroundColor: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              <td style={td}>
                <span
                  onClick={() => onView?.(ev)}
                  style={{ fontWeight: '600', cursor: onView ? 'pointer' : 'default', color: '#F0E8D5' }}
                >
                  {ev.title}
                </span>
              </td>

              <td style={td}>
                <span style={{
                  border: `1px solid ${ev.type === 'public' ? GOLD : 'rgba(240,232,213,0.5)'}`,
                  color: ev.type === 'public' ? GOLD : 'rgba(240,232,213,0.5)',
                  fontSize: '9px', letterSpacing: '0.8px', fontWeight: '600',
                  padding: '2px 7px', borderRadius: '4px',
                }}>
                  {ev.type.toUpperCase()}
                </span>
              </td>

              <td style={td}>{fmtDate(ev.date)}</td>
              <td style={{ ...td, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.host_name}</td>

              <td style={td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusColor(ev.status), display: 'inline-block' }} />
                  <span style={{ color: statusColor(ev.status) }}>
                    {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                  </span>
                </span>
              </td>

              <td style={{ ...td, textAlign: 'right' }}>{ev.guest_count}</td>
              <td style={{ ...td, textAlign: 'right' }}>{ev.photo_count}</td>
              <td style={{ ...td, textAlign: 'right', color: GOLD, fontWeight: '600' }}>{fmtINR(ev.revenue)}</td>

              <td style={td}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {ev.status === 'active' && onReveal && (
                    <button onClick={() => onReveal(ev.id)} style={{ border: `1px solid ${GOLD}`, color: GOLD, backgroundColor: 'transparent', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.5px' }}>
                      Reveal
                    </button>
                  )}
                  {ev.status !== 'archived' && onArchive && (
                    <button onClick={() => onArchive(ev.id)} style={{ border: '1px solid #888', color: '#888', backgroundColor: 'transparent', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.5px' }}>
                      Archive
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
