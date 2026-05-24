import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';
import { REVENUE_SHARE } from '../../shared/constants';

const GOLD   = '#D4A853';
const SERIF  = '"Playfair Display", serif';
const MONO   = '"DM Mono", monospace';
const GREEN  = '#4CAF50';
const BLUE   = '#4A90E2';
const PURPLE = '#9C27B0';
const CARD   = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

const ORG_PCT  = REVENUE_SHARE.organiserPercent / 100;
const PLAT_PCT = 1 - ORG_PCT;

type Period = '7d' | '30d' | '90d' | '12m' | 'all';
type GeoFilter = { country: string; state: string; city: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}`; }

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function shortMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short' });
}

function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) +
         String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65);
}

function periodStart(p: Period): Date {
  const now = new Date();
  if (p === '7d')  { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (p === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (p === '90d') { const d = new Date(now); d.setDate(d.getDate() - 90); return d; }
  if (p === '12m') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
  return new Date('2020-01-01');
}

function groupByMonth<T>(items: T[], getDate: (t: T) => string) {
  const map: Record<string, T[]> = {};
  items.forEach(t => {
    const k = monthLabel(getDate(t));
    if (!map[k]) map[k] = [];
    map[k].push(t);
  });
  return map;
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_FULL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── SVG Chart Components ──────────────────────────────────────────────────────

function SvgBarChart({ data, color = GOLD, height = 100, fmtVal }: {
  data: { label: string; value: number; color?: string }[];
  color?: string; height?: number;
  fmtVal?: (v: number) => string;
}) {
  if (!data.length) return <div style={{ color: '#bbb', fontSize: '12px', padding: '20px 0', textAlign: 'center', fontFamily: MONO }}>No data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const bW  = Math.max(20, Math.min(56, 560 / data.length));
  const gW  = 6;
  const tW  = data.length * (bW + gW);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${tW} ${height + 34}`} style={{ width: '100%', minWidth: Math.min(tW, 300) }}>
        {[0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1={0} y1={height * (1 - p)} x2={tW} y2={height * (1 - p)} stroke="#F0EDE8" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * height, 2);
          const x = i * (bW + gW);
          const c = d.color ?? color;
          return (
            <g key={i}>
              {fmtVal && d.value > 0 && <text x={x + bW / 2} y={height - h - 3} textAnchor="middle" fontSize={8} fill="#aaa">{fmtVal(d.value)}</text>}
              <rect x={x} y={height - h} width={bW} height={h} fill={c} rx={3} />
              <text x={x + bW / 2} y={height + 14} textAnchor="middle" fontSize={9} fill="#888">{d.label}</text>
            </g>
          );
        })}
        <line x1={0} y1={height} x2={tW} y2={height} stroke="#E8E3DC" strokeWidth={1} />
      </svg>
    </div>
  );
}

function SvgStackedBarChart({ data, colors, height = 100 }: {
  data: { label: string; values: number[] }[];
  colors: string[];
  height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.values.reduce((s, v) => s + v, 0)), 1);
  const bW  = Math.max(20, Math.min(56, 560 / data.length));
  const gW  = 6;
  const tW  = data.length * (bW + gW);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${tW} ${height + 34}`} style={{ width: '100%', minWidth: Math.min(tW, 300) }}>
        {data.map((d, i) => {
          const total = d.values.reduce((s, v) => s + v, 0);
          const x = i * (bW + gW);
          let curY = height;
          return (
            <g key={i}>
              {d.values.map((v, vi) => {
                const h = Math.max((v / max) * height, v > 0 ? 2 : 0);
                curY -= h;
                return <rect key={vi} x={x} y={curY} width={bW} height={h} fill={colors[vi] ?? GOLD} rx={vi === d.values.length - 1 ? 3 : 0} />;
              })}
              <text x={x + bW / 2} y={height + 14} textAnchor="middle" fontSize={9} fill="#888">{d.label}</text>
            </g>
          );
        })}
        <line x1={0} y1={height} x2={tW} y2={height} stroke="#E8E3DC" strokeWidth={1} />
      </svg>
    </div>
  );
}

function SvgLineChart({ datasets, labels, height = 140, fmtVal }: {
  datasets: { label: string; values: number[]; color: string }[];
  labels: string[];
  height?: number;
  fmtVal?: (v: number) => string;
}) {
  const n = labels.length;
  if (!n) return null;
  const allVals = datasets.flatMap(d => d.values);
  const max = Math.max(...allVals, 1);
  const W = 640; const padL = 44; const padR = 10;
  const chartW = W - padL - padR;
  const stepX = n > 1 ? chartW / (n - 1) : 0;

  const pts = (vals: number[]) =>
    vals.map((v, i) => `${padL + i * stepX},${height - (v / max) * height}`).join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${height + 28}`} style={{ width: '100%' }}>
      {yTicks.map(p => {
        const ty = height - p * height;
        return (
          <g key={p}>
            <line x1={padL} y1={ty} x2={W - padR} y2={ty} stroke="#F0EDE8" strokeWidth={1} />
            <text x={padL - 4} y={ty + 3} textAnchor="end" fontSize={8} fill="#ccc">
              {fmtVal ? fmtVal(Math.round(max * p)) : Math.round(max * p)}
            </text>
          </g>
        );
      })}
      {datasets.map((ds, di) => (
        <polyline key={di} points={pts(ds.values)} fill="none" stroke={ds.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={padL + i * stepX} y={height + 16} textAnchor="middle" fontSize={9} fill="#888">{l}</text>
      ))}
    </svg>
  );
}

function HorizBar({ label, value, max, color = GOLD, prefix = '' }: { label: string; value: number; max: number; color?: string; prefix?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', fontFamily: MONO }}>
        <span style={{ color: '#555' }}>{label}</span>
        <span style={{ color, fontWeight: '600' }}>{prefix}{value.toLocaleString('en-IN')}</span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#F5F3EF', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '700', color: '#0C0904', lineHeight: 1, marginBottom: sub ? '6px' : 0 }}>{title}</h2>
      {sub && <div style={{ fontSize: '12px', color: '#888', fontFamily: MONO }}>{sub}</div>}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ ...CARD, flex: 1, minWidth: '130px' }}>
      <div style={{ fontSize: '20px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: accent ? GOLD : '#0C0904', lineHeight: 1, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

function Skeleton() {
  return <div style={{ height: '120px', backgroundColor: '#F5F3EF', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

// ── Export Helpers ────────────────────────────────────────────────────────────

function exportEventsXlsx(events: any[], participants: any[]) {
  const partsByEvent: Record<string, { count: number; gross: number }> = {};
  participants.forEach((p: any) => {
    if (!partsByEvent[p.event_id]) partsByEvent[p.event_id] = { count: 0, gross: 0 };
    partsByEvent[p.event_id].count++;
    partsByEvent[p.event_id].gross += p.amount_paid ?? 0;
  });
  const data = events.map((e: any) => ({
    'Event ID':        e.id,
    'Title':           e.title,
    'Type':            e.type,
    'Status':          e.status,
    'Date':            e.date,
    'Country':         e.country,
    'State':           e.state,
    'City':            e.city,
    'Participants':    partsByEvent[e.id]?.count ?? 0,
    'Gross Revenue':   Math.round(partsByEvent[e.id]?.gross ?? 0),
    'Organiser Share': Math.round((partsByEvent[e.id]?.gross ?? 0) * ORG_PCT),
    'Platform Share':  Math.round((partsByEvent[e.id]?.gross ?? 0) * PLAT_PCT),
    'Created At':      e.created_at,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] ?? {}).map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Events');
  XLSX.writeFile(wb, `GuestfulClicks_Events_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportUsersXlsx(users: any[]) {
  const data = users.map((u: any) => ({
    'User ID':    u.id,
    'Full Name':  u.full_name,
    'Email':      u.email,
    'Role':       u.role,
    'Country':    u.country,
    'Joined':     u.created_at,
    'Is Banned':  u.is_banned ? 'Yes' : 'No',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] ?? {}).map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.writeFile(wb, `GuestfulClicks_Users_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportRevenueXlsx(events: any[], participants: any[]) {
  const partsByEvent: Record<string, { count: number; gross: number }> = {};
  participants.forEach((p: any) => {
    if (!partsByEvent[p.event_id]) partsByEvent[p.event_id] = { count: 0, gross: 0 };
    partsByEvent[p.event_id].count++;
    partsByEvent[p.event_id].gross += p.amount_paid ?? 0;
  });
  // Group by month
  const byMonth: Record<string, { gross: number; platform: number; organiser: number; events: number }> = {};
  events.forEach((e: any) => {
    const pt = partsByEvent[e.id] ?? { count: 0, gross: 0 };
    const k = monthLabel(e.date || e.created_at);
    if (!byMonth[k]) byMonth[k] = { gross: 0, platform: 0, organiser: 0, events: 0 };
    byMonth[k].gross     += pt.gross;
    byMonth[k].platform  += pt.gross * PLAT_PCT;
    byMonth[k].organiser += pt.gross * ORG_PCT;
    byMonth[k].events++;
  });
  const data = Object.entries(byMonth).map(([month, d]) => ({
    'Month':             month,
    'Events':            d.events,
    'Gross Revenue':     Math.round(d.gross),
    'Platform Share':    Math.round(d.platform),
    'Organiser Share':   Math.round(d.organiser),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] ?? {}).map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Revenue');
  XLSX.writeFile(wb, `GuestfulClicks_Revenue_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportSummaryPdf(kpi: any, period: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 20; const R = W - L;

  doc.setFillColor(12, 9, 4); doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(212, 168, 83); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('Guestful Clicks', L, 18);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 140, 100);
  doc.text('Analytics Summary Report', L, 27);
  doc.setFontSize(9); doc.text(`Period: ${period} | Generated: ${new Date().toLocaleDateString('en-IN')}`, L, 35);

  let y = 52;
  doc.setTextColor(12, 9, 4); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Key Performance Indicators', L, y); y += 8;
  doc.setDrawColor(212, 168, 83); doc.line(L, y, R, y); y += 8;

  const kpiItems = [
    ['Total Revenue All Time',   fmtINR(kpi.totalRevenue)],
    ['Total Events',             String(kpi.totalEvents)],
    ['Total Users',              String(kpi.totalUsers)],
    ['Total Photos',             String(kpi.totalPhotos)],
    ['Avg Revenue Per Event',    fmtINR(kpi.avgRevPerEvent)],
    ['Platform Net Revenue',     fmtINR(kpi.platformNet)],
  ];

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  kpiItems.forEach(([label, val]) => {
    doc.setTextColor(100, 90, 80); doc.text(label, L, y);
    doc.setTextColor(12, 9, 4); doc.setFont('helvetica', 'bold');
    doc.text(val, R, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
  });

  y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(12, 9, 4);
  doc.text('Platform Share Breakdown', L, y); y += 8;
  doc.setDrawColor(212, 168, 83); doc.line(L, y, R, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);

  const shareItems = [
    [`Organiser Payout (${Math.round(ORG_PCT * 100)}%)`,  fmtINR(kpi.totalRevenue * ORG_PCT)],
    [`Platform Revenue (${Math.round(PLAT_PCT * 100)}%)`, fmtINR(kpi.platformNet)],
  ];
  shareItems.forEach(([label, val]) => {
    doc.setTextColor(100, 90, 80); doc.text(label, L, y);
    doc.setTextColor(12, 9, 4); doc.setFont('helvetica', 'bold');
    doc.text(val, R, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
  });

  doc.setTextColor(140, 130, 110); doc.setFontSize(8);
  doc.text('This is a computer generated analytics summary. For detailed breakdowns export individual Excel reports.', L, 270);
  doc.text('Guestful Clicks — support@guestfulclicks.com', L, 276);

  doc.save(`GuestfulClicks_Analytics_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [loading,   setLoading]   = useState(true);
  const [period,    setPeriod]    = useState<Period>('30d');
  const [geo,       setGeo]       = useState<GeoFilter>({ country: '', state: '', city: '' });

  // Raw data
  const [events,       setEvents]       = useState<any[]>([]);
  const [users,        setUsers]        = useState<any[]>([]);
  const [photos,       setPhotos]       = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [paidPayouts,  setPaidPayouts]  = useState<any[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: evData },
      { data: usData },
      { data: phData },
      { data: ptData },
      { data: poData },
    ] = await Promise.all([
      supabase.from('events').select('id, title, type, status, country, state, city, date, host_id, created_at').order('created_at'),
      supabase.from('users').select('id, full_name, email, role, country, created_at, is_banned'),
      supabase.from('photos').select('id, event_id, created_at').order('created_at'),
      supabase.from('participants').select('id, event_id, user_id, amount_paid, tier, shots_used, upload_count, joined_at'),
      supabase.from('payouts').select('id, organiser_id, event_id, amount, status').eq('status', 'paid'),
    ]);
    setEvents(evData ?? []);
    setUsers(usData ?? []);
    setPhotos(phData ?? []);
    setParticipants(ptData ?? []);
    setPaidPayouts(poData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const cutoff = periodStart(period);

  const filteredEvents = events.filter(e => {
    const d = new Date(e.date || e.created_at);
    if (d < cutoff) return false;
    if (geo.country && e.country !== geo.country) return false;
    if (geo.state   && e.state   !== geo.state)   return false;
    if (geo.city    && e.city    !== geo.city)     return false;
    return true;
  });

  const filteredEventIds = new Set(filteredEvents.map(e => e.id));
  const filteredParticipants = participants.filter(p => filteredEventIds.has(p.event_id));

  // Revenue
  const totalRevenue = participants.reduce((s: number, p: any) => s + (p.amount_paid ?? 0), 0);
  const platformNet  = totalRevenue * PLAT_PCT;

  // Participant map
  const partByEvent: Record<string, { count: number; gross: number }> = {};
  participants.forEach((p: any) => {
    if (!partByEvent[p.event_id]) partByEvent[p.event_id] = { count: 0, gross: 0 };
    partByEvent[p.event_id].count++;
    partByEvent[p.event_id].gross += p.amount_paid ?? 0;
  });

  const kpi = {
    totalRevenue,
    totalEvents: events.length,
    totalUsers:  users.length,
    totalPhotos: photos.length,
    avgRevPerEvent: events.length ? totalRevenue / events.length : 0,
    platformNet,
  };

  // Revenue trend (filtered by period)
  const revenueByMonth = (() => {
    const map: Record<string, { gross: number; net: number }> = {};
    filteredEvents.forEach(e => {
      const k = monthLabel(e.date || e.created_at);
      const pt = partByEvent[e.id] ?? { gross: 0 };
      if (!map[k]) map[k] = { gross: 0, net: 0 };
      map[k].gross += pt.gross;
      map[k].net   += pt.gross * PLAT_PCT;
    });
    return Object.entries(map).slice(-12).map(([label, d]) => ({ label, ...d }));
  })();

  // Revenue by event type
  const revenueByType = (() => {
    const map: Record<string, number> = {};
    filteredEvents.forEach(e => {
      const t = e.type ?? 'other';
      map[t] = (map[t] ?? 0) + (partByEvent[e.id]?.gross ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([type, revenue]) => ({ label: type, value: Math.round(revenue) }));
  })();

  // Revenue by country
  const revenueByCountry = (() => {
    const map: Record<string, { events: number; revenue: number; participants: number }> = {};
    filteredEvents.forEach(e => {
      const c = e.country || 'Unknown';
      const pt = partByEvent[e.id] ?? { count: 0, gross: 0 };
      if (!map[c]) map[c] = { events: 0, revenue: 0, participants: 0 };
      map[c].events++;
      map[c].revenue += pt.gross;
      map[c].participants += pt.count;
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10)
      .map(([country, d]) => ({ country, ...d }));
  })();

  // Events by month (stacked private/public)
  const eventsByMonth = (() => {
    const map: Record<string, { private_count: number; public_count: number }> = {};
    filteredEvents.forEach(e => {
      const k = monthLabel(e.date || e.created_at);
      if (!map[k]) map[k] = { private_count: 0, public_count: 0 };
      if (e.type === 'private') map[k].private_count++;
      else                      map[k].public_count++;
    });
    return Object.entries(map).slice(-12).map(([label, d]) => ({
      label,
      values: [d.private_count, d.public_count],
    }));
  })();

  // Event status
  const statusCounts = (() => {
    const map: Record<string, number> = {};
    filteredEvents.forEach(e => { map[e.status ?? 'active'] = (map[e.status ?? 'active'] ?? 0) + 1; });
    return map;
  })();

  // Top event types
  const topEventTypes = (() => {
    const map: Record<string, { count: number; totalParts: number; totalRevenue: number; totalPhotos: number }> = {};
    filteredEvents.forEach(e => {
      const t = e.type ?? 'other';
      const pt = partByEvent[e.id] ?? { count: 0, gross: 0 };
      const phCount = photos.filter(ph => ph.event_id === e.id).length;
      if (!map[t]) map[t] = { count: 0, totalParts: 0, totalRevenue: 0, totalPhotos: 0 };
      map[t].count++;
      map[t].totalParts   += pt.count;
      map[t].totalRevenue += pt.gross;
      map[t].totalPhotos  += phCount;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 6)
      .map(([type, d]) => ({
        type,
        count:           d.count,
        avgParticipants: d.count ? Math.round(d.totalParts / d.count) : 0,
        avgRevenue:      d.count ? Math.round(d.totalRevenue / d.count) : 0,
        avgPhotos:       d.count ? Math.round(d.totalPhotos / d.count) : 0,
      }));
  })();

  // User data
  const hosts      = users.filter(u => u.role === 'host');
  const organisers = users.filter(u => u.role === 'organiser');
  const guests     = users.filter(u => u.role === 'guest');
  const monthAgo   = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const newThisMonth = users.filter(u => new Date(u.created_at) >= monthAgo).length;
  const growthRate = users.length > newThisMonth ? Math.round((newThisMonth / (users.length - newThisMonth)) * 100) : 0;

  // User growth by month
  const usersByMonth = (() => {
    const map: Record<string, { h: number; o: number; g: number }> = {};
    users.forEach(u => {
      const k = monthLabel(u.created_at);
      if (!map[k]) map[k] = { h: 0, o: 0, g: 0 };
      if (u.role === 'host')      map[k].h++;
      else if (u.role === 'organiser') map[k].o++;
      else                        map[k].g++;
    });
    return Object.entries(map).slice(-12).map(([label, d]) => ({
      label, hosts: d.h, organisers: d.o, guests: d.g,
    }));
  })();

  // Top hosts (by events hosted)
  const topHosts = (() => {
    const map: Record<string, { name: string; events: number; guests: number; revenue: number; since: string }> = {};
    events.forEach(e => {
      const id = e.host_id;
      if (!id) return;
      const usr = users.find(u => u.id === id);
      if (!usr) return;
      const pt = partByEvent[e.id] ?? { count: 0, gross: 0 };
      if (!map[id]) map[id] = { name: usr.full_name ?? '—', events: 0, guests: 0, revenue: 0, since: usr.created_at };
      map[id].events++;
      map[id].guests  += pt.count;
      map[id].revenue += pt.gross;
    });
    return Object.values(map).sort((a, b) => b.events - a.events).slice(0, 5);
  })();

  // Photos by month
  const photosByMonth = (() => {
    const map: Record<string, number> = {};
    photos.filter(ph => new Date(ph.created_at) >= cutoff).forEach(ph => {
      const k = monthLabel(ph.created_at);
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).slice(-12).map(([label, value]) => ({ label, value }));
  })();

  // Top events by photos
  const topEventsByPhotos = (() => {
    const map: Record<string, number> = {};
    photos.forEach(ph => { map[ph.event_id] = (map[ph.event_id] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([eid, count]) => {
        const ev = events.find(e => e.id === eid);
        const pt = partByEvent[eid] ?? { count: 0 };
        return { title: ev?.title ?? '—', photos: count, participants: pt.count, date: ev?.date ?? '' };
      });
  })();

  // Storage estimate: avg 2MB per photo
  const storageGB = (photos.length * 2) / 1024;

  // Tier distribution
  const tierDist = (() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    filteredParticipants.forEach((p: any) => {
      const t = String(p.tier ?? 'unknown');
      if (!map[t]) map[t] = { count: 0, revenue: 0 };
      map[t].count++;
      map[t].revenue += p.amount_paid ?? 0;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count)
      .map(([tier, d]) => ({ label: `₹${tier}`, value: d.count, revenue: d.revenue }));
  })();

  const mostPopularTier = tierDist[0]?.label ?? '—';
  const avgShots = filteredParticipants.length
    ? Math.round(filteredParticipants.reduce((s: number, p: any) => s + (p.shots_used ?? 0), 0) / filteredParticipants.length)
    : 0;

  // Events by day of week
  const eventsByDay = (() => {
    const map: Record<number, number> = {};
    filteredEvents.forEach(e => {
      const d = new Date(e.date || e.created_at).getDay();
      map[d] = (map[d] ?? 0) + 1;
    });
    return DAYS.map((day, i) => ({ label: day, value: map[i] ?? 0 }));
  })();

  // Events by calendar month (seasonality)
  const eventsByCal = (() => {
    const map: Record<number, number> = {};
    events.forEach(e => {
      const m = new Date(e.date || e.created_at).getMonth();
      map[m] = (map[m] ?? 0) + 1;
    });
    return MONTHS_FULL.map((m, i) => ({ label: m, value: map[i] ?? 0 }));
  })();

  // Geography
  const allCountries = [...new Set(events.map(e => e.country).filter(Boolean))].sort();
  const allStates = [...new Set(events.filter(e => !geo.country || e.country === geo.country).map(e => e.state).filter(Boolean))].sort();
  const allCities = [...new Set(events.filter(e => !geo.state || e.state === geo.state).map(e => e.city).filter(Boolean))].sort();

  const byState = (() => {
    const map: Record<string, { events: number; revenue: number; cities: Record<string, number> }> = {};
    events.filter(e => !geo.country || e.country === geo.country).forEach(e => {
      const s = e.state || 'Unknown';
      const pt = partByEvent[e.id] ?? { gross: 0 };
      if (!map[s]) map[s] = { events: 0, revenue: 0, cities: {} };
      map[s].events++;
      map[s].revenue += pt.gross;
      if (e.city) map[s].cities[e.city] = (map[s].cities[e.city] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1].events - a[1].events).slice(0, 10)
      .map(([state, d]) => ({
        state, events: d.events, revenue: Math.round(d.revenue),
        topCity: Object.entries(d.cities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      }));
  })();

  const thS: React.CSSProperties = { padding: '10px 14px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase' as const, backgroundColor: '#F5F3EF', whiteSpace: 'nowrap' as const };
  const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  const PERIOD_BTNS: { label: string; value: Period }[] = [
    { label: '7 Days', value: '7d' }, { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' }, { label: '12 Months', value: '12m' },
    { label: 'All Time', value: 'all' },
  ];

  return (
    <AdminLayout pageTitle="Analytics">
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1,2,3,4].map(i => <Skeleton key={i} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

          {/* ── Section 1: KPI ─────────────────────────────────────────────── */}
          <section>
            <SectionHead title="Platform Overview" sub="All time cumulative metrics" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              <StatCard icon="💰" label="Total Revenue"            value={fmtINR(kpi.totalRevenue)}    accent />
              <StatCard icon="📅" label="Total Events"             value={kpi.totalEvents.toLocaleString('en-IN')} />
              <StatCard icon="👥" label="Total Users"              value={kpi.totalUsers.toLocaleString('en-IN')} />
              <StatCard icon="📷" label="Total Photos"             value={kpi.totalPhotos.toLocaleString('en-IN')} />
              <StatCard icon="📊" label="Avg Revenue / Event"      value={fmtINR(kpi.avgRevPerEvent)}  accent />
              <StatCard icon="🏦" label="Platform Net Revenue"     value={fmtINR(kpi.platformNet)}     accent />
            </div>
          </section>

          {/* ── Section 2: Revenue ─────────────────────────────────────────── */}
          <section>
            <SectionHead title="Revenue Intelligence" />
            {/* Period selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
              {PERIOD_BTNS.map(b => (
                <button key={b.value} onClick={() => setPeriod(b.value)}
                  style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${period === b.value ? GOLD : '#E8E3DC'}`, backgroundColor: period === b.value ? GOLD : 'transparent', color: period === b.value ? '#0C0904' : '#888', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, fontWeight: period === b.value ? '600' : '400', transition: 'all 0.15s' }}>
                  {b.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '16px' }}>

              {/* Revenue trend */}
              <div style={{ ...CARD, flex: 2, minWidth: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904' }}>Revenue Trend</h3>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontFamily: MONO }}>
                    <span style={{ color: GOLD }}>● Gross</span>
                    <span style={{ color: '#4A90E2' }}>● Platform Net</span>
                  </div>
                </div>
                <SvgLineChart
                  datasets={[
                    { label: 'Gross',    values: revenueByMonth.map(d => d.gross), color: GOLD  },
                    { label: 'Platform', values: revenueByMonth.map(d => d.net),   color: BLUE  },
                  ]}
                  labels={revenueByMonth.map(d => d.label)}
                  fmtVal={v => `₹${(v / 1000).toFixed(0)}k`}
                />
              </div>

              {/* Revenue by event type */}
              <div style={{ ...CARD, flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>By Event Type</h3>
                <SvgBarChart data={revenueByType} color={GOLD} fmtVal={v => `₹${(v / 1000).toFixed(0)}k`} />
              </div>
            </div>

            {/* Revenue by country */}
            <div style={{ ...CARD }}>
              <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Revenue by Country</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {revenueByCountry.length === 0
                  ? <div style={{ color: '#bbb', fontFamily: MONO, fontSize: '12px' }}>No data</div>
                  : revenueByCountry.map(d => (
                      <HorizBar key={d.country} label={`${countryFlag(d.country)} ${d.country}`} value={Math.round(d.revenue)} max={revenueByCountry[0]?.revenue ?? 1} prefix="₹" />
                    ))
                }
              </div>
            </div>
          </section>

          {/* ── Section 3: Events ──────────────────────────────────────────── */}
          <section>
            <SectionHead title="Event Intelligence" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
              <StatCard icon="🔒" label="Private Events"  value={filteredEvents.filter(e => e.type === 'private').length} />
              <StatCard icon="🌍" label="Public Events"   value={filteredEvents.filter(e => e.type === 'public').length} />
              <StatCard icon="👤" label="Avg Participants" value={filteredEvents.length ? Math.round(filteredParticipants.length / filteredEvents.length) : 0} />
              <StatCard icon="📸" label="Avg Photos/Event" value={filteredEvents.length ? Math.round(photos.length / (events.length || 1)) : 0} />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '16px' }}>
              <div style={{ ...CARD, flex: 2, minWidth: '280px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Events Created Over Time</h3>
                <div style={{ fontSize: '11px', fontFamily: MONO, marginBottom: '8px' }}>
                  <span style={{ color: BLUE }}>■ Private</span> &nbsp; <span style={{ color: GREEN }}>■ Public</span>
                </div>
                <SvgStackedBarChart data={eventsByMonth} colors={[BLUE, GREEN]} />
              </div>
              <div style={{ ...CARD, flex: 1, minWidth: '200px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Status Distribution</h3>
                {Object.entries(statusCounts).map(([s, c]) => (
                  <HorizBar key={s} label={s} value={c as number} max={Math.max(...Object.values(statusCounts) as number[], 1)} />
                ))}
              </div>
            </div>

            {/* Top event types table */}
            <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E3DC' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904' }}>Top Event Types</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead><tr>
                    {['Type', 'Events', 'Avg Guests', 'Avg Revenue', 'Avg Photos'].map(h => <th key={h} style={thS}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {topEventTypes.map(t => (
                      <tr key={t.type} onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                        <td style={{ ...tdS, fontWeight: '600', textTransform: 'capitalize' as const }}>{t.type}</td>
                        <td style={tdS}>{t.count}</td>
                        <td style={tdS}>{t.avgParticipants}</td>
                        <td style={{ ...tdS, color: GOLD, fontWeight: '600' }}>{fmtINR(t.avgRevenue)}</td>
                        <td style={tdS}>{t.avgPhotos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── Section 4: Users ───────────────────────────────────────────── */}
          <section>
            <SectionHead title="User Intelligence" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
              <StatCard icon="🏠" label="Hosts"              value={hosts.length} />
              <StatCard icon="🎪" label="Organisers"         value={organisers.length} />
              <StatCard icon="🎟️" label="Guests"             value={guests.length} />
              <StatCard icon="📈" label="Growth This Month"  value={`+${growthRate}%`} accent />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '16px' }}>
              <div style={{ ...CARD, flex: 2, minWidth: '280px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>User Growth</h3>
                <div style={{ fontSize: '11px', fontFamily: MONO, marginBottom: '8px' }}>
                  <span style={{ color: GREEN }}>● Hosts</span> &nbsp;
                  <span style={{ color: GOLD }}>● Organisers</span> &nbsp;
                  <span style={{ color: BLUE }}>● Guests</span>
                </div>
                <SvgLineChart
                  datasets={[
                    { label: 'Hosts',      values: usersByMonth.map(d => d.hosts),      color: GREEN  },
                    { label: 'Organisers', values: usersByMonth.map(d => d.organisers),  color: GOLD   },
                    { label: 'Guests',     values: usersByMonth.map(d => d.guests),      color: BLUE   },
                  ]}
                  labels={usersByMonth.map(d => d.label)}
                />
              </div>
              <div style={{ ...CARD, flex: 1, minWidth: '200px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Role Distribution</h3>
                {[['Hosts', hosts.length, GREEN], ['Organisers', organisers.length, GOLD], ['Guests', guests.length, BLUE]].map(([l, v, c]) => (
                  <HorizBar key={l as string} label={l as string} value={v as number} max={Math.max(hosts.length, organisers.length, guests.length, 1)} color={c as string} />
                ))}
              </div>
            </div>

            {/* Top hosts table */}
            {topHosts.length > 0 && (
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E3DC' }}>
                  <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904' }}>Top Hosts</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                    <thead><tr>
                      {['Host', 'Events', 'Total Guests', 'Total Revenue', 'Member Since'].map(h => <th key={h} style={thS}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {topHosts.map((h, i) => (
                        <tr key={i} onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                          <td style={{ ...tdS, fontWeight: '600' }}>{h.name}</td>
                          <td style={tdS}>{h.events}</td>
                          <td style={tdS}>{h.guests.toLocaleString('en-IN')}</td>
                          <td style={{ ...tdS, color: GOLD, fontWeight: '600' }}>{fmtINR(h.revenue)}</td>
                          <td style={{ ...tdS, color: '#888' }}>{new Date(h.since).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Section 5: Geography ───────────────────────────────────────── */}
          <section>
            <SectionHead title="Where In The World" />
            {/* Geo filter breadcrumb */}
            {(geo.country || geo.state || geo.city) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '8px 14px', backgroundColor: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: '8px', flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: '12px', fontFamily: MONO, color: '#555' }}>
                  🌍 {[geo.country, geo.state, geo.city].filter(Boolean).join(' → ')}
                </span>
                <button onClick={() => setGeo({ country: '', state: '', city: '' })} style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO }}>✕ Clear</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {/* By Country */}
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E3DC', fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904' }}>By Country</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead><tr>
                    {['Country', 'Events', 'Revenue'].map(h => <th key={h} style={{ ...thS, fontSize: '9px' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {revenueByCountry.map(d => (
                      <tr key={d.country} onClick={() => setGeo({ country: d.country, state: '', city: '' })} style={{ cursor: 'pointer', backgroundColor: geo.country === d.country ? `${GOLD}10` : 'transparent' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = geo.country === d.country ? `${GOLD}10` : 'transparent'}
                      >
                        <td style={{ ...tdS, fontSize: '11px' }}>{countryFlag(d.country)} {d.country}</td>
                        <td style={{ ...tdS, fontSize: '11px' }}>{d.events}</td>
                        <td style={{ ...tdS, fontSize: '11px', color: GOLD, fontWeight: '600' }}>{fmtINR(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* By State */}
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E3DC', fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904' }}>By State</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead><tr>
                    {['State', 'Events', 'Top City'].map(h => <th key={h} style={{ ...thS, fontSize: '9px' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {byState.map(d => (
                      <tr key={d.state} onClick={() => setGeo(g => ({ ...g, state: d.state, city: '' }))} style={{ cursor: 'pointer', backgroundColor: geo.state === d.state ? `${GOLD}10` : 'transparent' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = geo.state === d.state ? `${GOLD}10` : 'transparent'}
                      >
                        <td style={{ ...tdS, fontSize: '11px', fontWeight: '600' }}>{d.state}</td>
                        <td style={{ ...tdS, fontSize: '11px' }}>{d.events}</td>
                        <td style={{ ...tdS, fontSize: '11px', color: '#888' }}>{d.topCity}</td>
                      </tr>
                    ))}
                    {!byState.length && <tr><td colSpan={3} style={{ ...tdS, textAlign: 'center', color: '#bbb' }}>No data</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* By City */}
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E3DC', fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904' }}>By City</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead><tr>
                    {['City', 'Events', 'Revenue'].map(h => <th key={h} style={{ ...thS, fontSize: '9px' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(() => {
                      const map: Record<string, { events: number; revenue: number }> = {};
                      events.filter(e => !geo.state || e.state === geo.state).forEach(e => {
                        const c = e.city || 'Unknown';
                        const pt = partByEvent[e.id] ?? { gross: 0 };
                        if (!map[c]) map[c] = { events: 0, revenue: 0 };
                        map[c].events++;
                        map[c].revenue += pt.gross;
                      });
                      return Object.entries(map).sort((a, b) => b[1].events - a[1].events).slice(0, 8)
                        .map(([city, d]) => (
                          <tr key={city} style={{ cursor: 'default' }}>
                            <td style={{ ...tdS, fontSize: '11px', fontWeight: '600' }}>{city}</td>
                            <td style={{ ...tdS, fontSize: '11px' }}>{d.events}</td>
                            <td style={{ ...tdS, fontSize: '11px', color: GOLD }}>{fmtINR(d.revenue)}</td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── Section 6: Photos ──────────────────────────────────────────── */}
          <section>
            <SectionHead title="The Film Roll" sub="Photo upload analytics" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
              <StatCard icon="📷" label="Total Photos"        value={photos.length.toLocaleString('en-IN')} />
              <StatCard icon="🆕" label="Photos Today"        value={photos.filter(p => p.created_at?.startsWith(new Date().toISOString().split('T')[0])).length} />
              <StatCard icon="📊" label="Avg Per Event"       value={events.length ? Math.round(photos.length / events.length) : 0} />
              <StatCard icon="💾" label="Storage Used"        value={`${storageGB.toFixed(1)} GB`} />
              <StatCard icon="💸" label="Est. Storage Cost"   value={`$${(storageGB * 0.015).toFixed(2)}`} />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              <div style={{ ...CARD, flex: 2, minWidth: '280px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Photos Uploaded Over Time</h3>
                <SvgBarChart data={photosByMonth} color={PURPLE} />
              </div>

              <div style={{ ...CARD, flex: 1, minWidth: '220px', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E3DC', fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904' }}>Top Events by Photos</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead><tr>{['Event', 'Photos', 'Guests'].map(h => <th key={h} style={{ ...thS, fontSize: '9px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {topEventsByPhotos.map((e, i) => (
                      <tr key={i}>
                        <td style={{ ...tdS, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{e.title}</td>
                        <td style={{ ...tdS, fontSize: '11px', color: PURPLE, fontWeight: '600' }}>{e.photos}</td>
                        <td style={{ ...tdS, fontSize: '11px' }}>{e.participants}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── Section 7: Participant Behaviour ───────────────────────────── */}
          <section>
            <SectionHead title="How Guests Shoot" sub="Participant behaviour and tier analytics" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
              <StatCard icon="📸" label="Avg Shots Used"      value={avgShots} />
              <StatCard icon="🏆" label="Most Popular Tier"   value={mostPopularTier} accent />
              <StatCard icon="👥" label="Total Participants"  value={filteredParticipants.length.toLocaleString('en-IN')} />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              <div style={{ ...CARD, flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Tier Popularity</h3>
                <SvgBarChart data={tierDist} color={GOLD} />
              </div>

              <div style={{ ...CARD, flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Tier Revenue Contribution</h3>
                {tierDist.map(t => (
                  <HorizBar key={t.label} label={t.label} value={Math.round(t.revenue)} max={Math.max(...tierDist.map(d => d.revenue), 1)} prefix="₹" />
                ))}
              </div>
            </div>
          </section>

          {/* ── Section 8: Time Analytics ──────────────────────────────────── */}
          <section>
            <SectionHead title="When It All Happens" sub="Temporal patterns and seasonality" />

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              <div style={{ ...CARD, flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Events by Day of Week</h3>
                <SvgBarChart data={eventsByDay} color={BLUE} />
              </div>

              <div style={{ ...CARD, flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Seasonality (All Time)</h3>
                <SvgBarChart data={eventsByCal} color={GOLD} />
              </div>
            </div>
          </section>

          {/* ── Section 9: Export Center ────────────────────────────────────── */}
          <section>
            <SectionHead title="Reports" sub="Export data for analysis and accounting" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              {[
                { label: '📊 Revenue Report', desc: 'Monthly breakdown for CA', color: GOLD,   onClick: () => exportRevenueXlsx(events, participants) },
                { label: '📅 Event Report',   desc: 'All events with financials', color: BLUE,  onClick: () => exportEventsXlsx(events, participants) },
                { label: '👥 User Report',    desc: 'All users with activity',    color: GREEN, onClick: () => exportUsersXlsx(users) },
                { label: '📄 Summary PDF',    desc: 'Executive analytics report', color: PURPLE, onClick: () => exportSummaryPdf(kpi, period) },
              ].map(b => (
                <button key={b.label} onClick={b.onClick}
                  style={{ flex: 1, minWidth: '160px', padding: '20px 16px', border: `1px solid ${b.color}33`, borderRadius: '12px', backgroundColor: `${b.color}08`, cursor: 'pointer', textAlign: 'left' as const, fontFamily: MONO }}>
                  <div style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '700', color: b.color }}>{b.label}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{b.desc}</div>
                </button>
              ))}
            </div>
          </section>

        </div>
      )}
    </AdminLayout>
  );
}
