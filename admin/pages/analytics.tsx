import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';
import { REVENUE_SHARE } from '../lib/constants';
import { getCountryFlag, getCurrencyByCountryCode } from '../lib/location-api';

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

// ── Live Event Map ────────────────────────────────────────────────────────────

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a4a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#c8b98a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c8b98a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#b5a880' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1f1f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4a6741' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2e4a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a30' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7a7a9a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a5a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a4a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#a09870' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2e2e4a' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#b5a880' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0f1e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5a6a' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0a0f1e' }] },
];

interface PlottedEvent {
  id: string; title: string; type: string; status: string;
  country: string; state: string; city: string; date: string;
  lat: number; lng: number; participantCount: number;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mapPinColor(status: string) {
  if (status === 'active') return '#D4A853';
  if (status === 'completed') return '#AAAAAA';
  return '#FFFFFF';
}

function mapPinSvg(status: string, r: number): string {
  const color = mapPinColor(status);
  const pulse = status === 'active';
  const dim = pulse ? r * 4 : r * 2;
  const svg = pulse
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><circle cx="${dim/2}" cy="${dim/2}" r="${r*1.8}" fill="${color}" opacity="0.25"><animate attributeName="r" values="${r*1.2};${r*1.8};${r*1.2}" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="${dim/2}" cy="${dim/2}" r="${r}" fill="${color}" stroke="#000" stroke-width="1"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><circle cx="${r}" cy="${r}" r="${r-1}" fill="${color}" stroke="#000" stroke-width="1"/></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function clusterSvg(count: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#D4A853" opacity="0.2"/><circle cx="24" cy="24" r="16" fill="#D4A853" opacity="0.5"/><circle cx="24" cy="24" r="10" fill="#D4A853"/><text x="24" y="28" text-anchor="middle" fill="#0C0904" font-size="10" font-family="monospace" font-weight="bold">${count}</text></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function LiveEventMap() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mapEvents, setMapEvents] = useState<PlottedEvent[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [zoom, setZoom] = useState(4);

  const loadMapEvents = useCallback(async () => {
    const { data: evData } = await supabase
      .from('events')
      .select('id, title, type, status, country, state, city, date, latitude, longitude')
      .order('date', { ascending: false });
    if (!evData) return;

    const { data: ptData } = await supabase.from('participants').select('event_id');
    const ptCount: Record<string, number> = {};
    (ptData ?? []).forEach((p: any) => { ptCount[p.event_id] = (ptCount[p.event_id] ?? 0) + 1; });

    const toGeocode = evData.filter((e: any) => !e.latitude || !e.longitude).slice(0, 15);
    const geocoded: Record<string, { lat: number; lng: number }> = {};
    for (const e of toGeocode) {
      const addr = [e.city, e.state, e.country].filter(Boolean).join(', ');
      if (!addr) continue;
      try {
        const cacheKey = `geocode_${addr}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { value, expiry } = JSON.parse(cached);
          if (Date.now() < expiry) { geocoded[e.id] = value; continue; }
        }
        const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${MAPS_KEY}`);
        const json = await resp.json();
        if (json.results?.[0]?.geometry?.location) {
          const loc = json.results[0].geometry.location as { lat: number; lng: number };
          geocoded[e.id] = { lat: loc.lat, lng: loc.lng };
          localStorage.setItem(cacheKey, JSON.stringify({ value: { lat: loc.lat, lng: loc.lng }, expiry: Date.now() + 86400000 }));
          await supabase.from('events').update({ latitude: loc.lat, longitude: loc.lng }).eq('id', e.id);
        }
      } catch { /* ignore geocode failures */ }
    }

    const plotted: PlottedEvent[] = evData
      .map((e: any) => {
        const lat = e.latitude ?? geocoded[e.id]?.lat;
        const lng = e.longitude ?? geocoded[e.id]?.lng;
        if (!lat || !lng) return null;
        return { id: e.id, title: e.title ?? 'Untitled', type: e.type ?? '', status: e.status ?? '', country: e.country ?? '', state: e.state ?? '', city: e.city ?? '', date: e.date ?? '', lat, lng, participantCount: ptCount[e.id] ?? 0 };
      })
      .filter(Boolean) as PlottedEvent[];

    setMapEvents(plotted);
    setMapLoading(false);
  }, []);

  useEffect(() => {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if ((window as any).google?.maps) {
        clearInterval(poll);
        if (!mapDivRef.current) return;
        const map = new (window as any).google.maps.Map(mapDivRef.current, {
          center: { lat: 20, lng: 78 },
          zoom: 4,
          styles: DARK_MAP_STYLE,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          backgroundColor: '#1a1a2e',
        });
        mapInstanceRef.current = map;
        map.addListener('zoom_changed', () => setZoom(map.getZoom() ?? 4));
        infoWindowRef.current = new (window as any).google.maps.InfoWindow();
        loadMapEvents();
      } else if (attempts > 75) {
        clearInterval(poll);
        setMapError('Google Maps failed to load.');
        setMapLoading(false);
      }
    }, 200);
    return () => clearInterval(poll);
  }, [loadMapEvents]);

  useEffect(() => {
    const channel = supabase
      .channel('live_event_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadMapEvents())
      .subscribe();
    pollRef.current = setInterval(loadMapEvents, 60000);
    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMapEvents]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !(window as any).google?.maps) return;
    markersRef.current.forEach((m: any) => m.setMap(null));
    markersRef.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();

    const filtered = mapEvents.filter(e => {
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterType && e.type !== filterType) return false;
      if (filterCountry && e.country !== filterCountry) return false;
      return true;
    });

    const G = (window as any).google.maps;

    if (zoom < 4) {
      const clusters: Record<string, { lat: number; lng: number; count: number; country: string }> = {};
      filtered.forEach(e => {
        const k = e.country || 'Unknown';
        if (!clusters[k]) clusters[k] = { lat: 0, lng: 0, count: 0, country: k };
        clusters[k].lat += e.lat; clusters[k].lng += e.lng; clusters[k].count++;
      });
      Object.values(clusters).forEach(cl => {
        const lat = cl.lat / cl.count;
        const lng = cl.lng / cl.count;
        const marker = new G.Marker({
          position: { lat, lng }, map,
          icon: { url: clusterSvg(cl.count), scaledSize: new G.Size(48, 48), anchor: new G.Point(24, 24) },
          title: `${cl.country} — ${cl.count} events`,
        });
        marker.addListener('click', () => {
          infoWindowRef.current?.setContent(`<div style="font-family:monospace;padding:8px;color:#333"><strong>${escapeHtml(cl.country)}</strong><br>${cl.count} events</div>`);
          infoWindowRef.current?.open(map, marker);
        });
        markersRef.current.push(marker);
      });
    } else {
      filtered.forEach(e => {
        const r = e.participantCount > 50 ? 10 : e.participantCount > 20 ? 8 : e.participantCount > 5 ? 6 : 4;
        const iconDim = e.status === 'active' ? r * 4 : r * 2;
        const marker = new G.Marker({
          position: { lat: e.lat, lng: e.lng }, map,
          icon: { url: mapPinSvg(e.status, r), scaledSize: new G.Size(iconDim, iconDim), anchor: new G.Point(iconDim / 2, iconDim / 2) },
          title: e.title,
          zIndex: e.status === 'active' ? 10 : 1,
        });
        marker.addListener('click', () => {
          const dateStr = e.date ? new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';
          const loc = [e.city, e.state, e.country].filter(Boolean).join(', ');
          infoWindowRef.current?.setContent(`<div style="font-family:monospace;padding:8px 4px;min-width:180px;color:#333"><div style="font-weight:700;font-size:14px;margin-bottom:6px">${escapeHtml(e.title)}</div><div style="font-size:11px;color:#666;margin-bottom:4px">${escapeHtml(e.type)} &middot; ${escapeHtml(e.status)}</div><div style="font-size:11px;color:#444;margin-bottom:4px">${escapeHtml(loc)}</div><div style="font-size:11px;color:#888">Date: ${escapeHtml(dateStr)}</div><div style="font-size:11px;color:#888">Participants: ${e.participantCount}</div></div>`);
          infoWindowRef.current?.open(map, marker);
        });
        markersRef.current.push(marker);
      });
    }
  }, [mapEvents, filterStatus, filterType, filterCountry, zoom]);

  const countries = [...new Set(mapEvents.map(e => e.country).filter(Boolean))].sort();
  const eventTypes = [...new Set(mapEvents.map(e => e.type).filter(Boolean))].sort();
  const stats = {
    total: mapEvents.length,
    active: mapEvents.filter(e => e.status === 'active').length,
    countries: new Set(mapEvents.map(e => e.country).filter(Boolean)).size,
    participants: mapEvents.reduce((s, e) => s + e.participantCount, 0),
  };

  const selStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: '8px', border: '1px solid #E8E3DC', fontFamily: MONO, fontSize: '12px', backgroundColor: '#fff', color: '#333', cursor: 'pointer' };

  return (
    <section>
      <SectionHead title="Live Event Map" sub="Real-time event distribution worldwide" />
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '16px' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
          <option value="">All Types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={selStyle}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E8E3DC' }}>
        {mapLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e', zIndex: 10, color: '#D4A853', fontFamily: MONO, fontSize: '13px' }}>
            {mapError || 'Initialising map...'}
          </div>
        )}
        <div ref={mapDivRef} style={{ width: '100%', height: '480px' }} />
        <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: '20px', padding: '4px 12px', zIndex: 5 }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50', boxShadow: '0 0 6px #4CAF50' }} />
          <span style={{ color: '#fff', fontSize: '11px', fontFamily: MONO, fontWeight: '500' }}>LIVE</span>
        </div>
        <div style={{ position: 'absolute', bottom: '12px', right: '12px', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: '10px', padding: '10px 14px', zIndex: 5 }}>
          {[{ color: '#D4A853', label: 'Active' }, { color: '#FFFFFF', label: 'Upcoming' }, { color: '#AAAAAA', label: 'Completed' }].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color, border: '1px solid rgba(255,255,255,0.3)' }} />
              <span style={{ color: '#ddd', fontSize: '11px', fontFamily: MONO }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Total Pins', value: stats.total, accent: false },
          { label: 'Active Now', value: stats.active, accent: true },
          { label: 'Countries', value: stats.countries, accent: false },
          { label: 'Participants', value: stats.participants.toLocaleString('en-IN'), accent: false },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '100px', textAlign: 'center' as const, padding: '14px 16px' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.accent ? GOLD : '#333', fontFamily: SERIF }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontFamily: MONO }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [loading,    setLoading]    = useState(true);
  const [period,     setPeriod]     = useState<Period>('30d');
  const [geo,        setGeo]        = useState<GeoFilter>({ country: '', state: '', city: '' });
  const [currSymbol, setCurrSymbol] = useState('₹');

  useEffect(() => {
    if (!geo.country) { setCurrSymbol('₹'); return; }
    getCurrencyByCountryCode(geo.country).then(c => {
      if (c.symbol) setCurrSymbol(c.symbol);
    });
  }, [geo.country]);

  // Raw data
  const [events,       setEvents]       = useState<any[]>([]);
  const [users,        setUsers]        = useState<any[]>([]);
  const [photos,       setPhotos]       = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [paidPayouts,  setPaidPayouts]  = useState<any[]>([]);
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [expiringEvents, setExpiringEvents] = useState<any[]>([]);
  const [extendingId, setExtendingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: evData },
      { data: usData },
      { data: phData },
      { data: ptData },
      { data: poData },
      { data: saData },
      { data: expData },
    ] = await Promise.all([
      supabase.from('events').select('id, title, type, status, country, state, city, date, host_id, created_at, latitude, longitude').order('created_at'),
      supabase.from('users').select('id, full_name, email, role, country, created_at, is_banned'),
      supabase.from('photos').select('id, event_id, created_at').order('created_at'),
      supabase.from('participants').select('id, event_id, user_id, amount_paid, tier, shots_used, upload_count, joined_at'),
      supabase.from('payouts').select('id, organiser_id, event_id, amount, status').eq('status', 'paid'),
      supabase.from('storage_analytics').select('*').single(),
      supabase.from('events')
        .select('id, title, type, expires_at, photo_count')
        .gte('expires_at', new Date().toISOString())
        .lte('expires_at', new Date(Date.now() + 7 * 86400000).toISOString())
        .order('expires_at', { ascending: true }),
    ]);
    setEvents(evData ?? []);
    setUsers(usData ?? []);
    setPhotos(phData ?? []);
    setParticipants(ptData ?? []);
    setPaidPayouts(poData ?? []);
    setStorageStats(saData ?? null);
    setExpiringEvents(expData ?? []);
    setLoading(false);
  }, []);

  const extendExpiry = async (eventId: string, currentExpiry: string) => {
    setExtendingId(eventId);
    const newExpiry = new Date(new Date(currentExpiry).getTime() + 7 * 86400000).toISOString();
    await supabase.from('events').update({ expires_at: newExpiry }).eq('id', eventId);
    setExpiringEvents(prev => prev.map(e => e.id === eventId ? { ...e, expires_at: newExpiry } : e));
    setExtendingId(null);
  };

  const deleteEventNow = async (eventId: string) => {
    if (!window.confirm('Permanently delete this event and all its photos?')) return;
    await supabase.from('events').update({ status: 'deleted', expires_at: new Date().toISOString() }).eq('id', eventId);
    setExpiringEvents(prev => prev.filter(e => e.id !== eventId));
  };

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

          <LiveEventMap />

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
                      <HorizBar key={d.country} label={`${getCountryFlag(d.country)} ${d.country}`} value={Math.round(d.revenue)} max={revenueByCountry[0]?.revenue ?? 1} prefix="₹" />
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
                        <td style={{ ...tdS, fontSize: '11px' }}>{getCountryFlag(d.country)} {d.country}</td>
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

          {/* ── Section 9: Storage & Retention ────────────────────────────── */}
          <section>
            <SectionHead title="Storage & Retention" sub="Photo storage usage and expiry management" />

            {/* Storage stat cards */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
              {storageStats ? (
                <>
                  <StatCard icon="📷" label="Total Photos"         value={(storageStats.total_photos ?? 0).toLocaleString('en-IN')} />
                  <StatCard icon="💾" label="Est. Storage"         value={`${((storageStats.total_storage_mb ?? 0) / 1024).toFixed(2)} GB`} accent />
                  <StatCard icon="💸" label="Est. Monthly Cost"    value={`$${(storageStats.estimated_cost_usd ?? 0).toFixed(2)}`} />
                  <StatCard icon="🌍" label="Public Events"        value={`${storageStats.public_events ?? 0} (${((storageStats.public_storage_mb ?? 0) / 1024).toFixed(1)} GB)`} />
                  <StatCard icon="🔒" label="Private Events"       value={`${storageStats.private_events ?? 0} (${((storageStats.private_storage_mb ?? 0) / 1024).toFixed(1)} GB)`} />
                  <StatCard icon="📦" label="Archived Events"      value={`${storageStats.archived_events ?? 0} (${((storageStats.archived_storage_mb ?? 0) / 1024).toFixed(1)} GB)`} />
                </>
              ) : (
                <div style={{ color: '#bbb', fontFamily: MONO, fontSize: '12px', padding: '16px 0' }}>
                  No storage_analytics view data. Check if the view exists in Supabase.
                </div>
              )}
            </div>

            {/* Expiring soon table */}
            {expiringEvents.length > 0 && (
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E3DC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904' }}>
                    Expiring Soon
                  </h3>
                  <span style={{ fontSize: '12px', fontFamily: MONO, color: '#F59E0B' }}>
                    {expiringEvents.length} event{expiringEvents.length !== 1 ? 's' : ''} expire within 7 days
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                    <thead>
                      <tr>
                        {['Event', 'Type', 'Expires', 'Photos', 'Actions'].map(h => (
                          <th key={h} style={thS}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {expiringEvents.map(ev => {
                        const daysLeft = Math.ceil((new Date(ev.expires_at).getTime() - Date.now()) / 86400000);
                        return (
                          <tr key={ev.id}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                          >
                            <td style={{ ...tdS, fontWeight: '600', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {ev.title ?? '—'}
                            </td>
                            <td style={{ ...tdS, textTransform: 'capitalize' as const }}>{ev.type ?? '—'}</td>
                            <td style={{ ...tdS, color: daysLeft <= 1 ? '#EF4444' : '#F59E0B', fontWeight: '600' }}>
                              {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                            </td>
                            <td style={tdS}>{(ev.photo_count ?? 0).toLocaleString('en-IN')}</td>
                            <td style={{ ...tdS, whiteSpace: 'nowrap' as const }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => extendExpiry(ev.id, ev.expires_at)}
                                  disabled={extendingId === ev.id}
                                  style={{
                                    padding: '5px 12px', borderRadius: '6px',
                                    border: `1px solid ${GOLD}`, backgroundColor: `${GOLD}18`,
                                    color: GOLD, fontSize: '12px', fontFamily: MONO,
                                    cursor: extendingId === ev.id ? 'not-allowed' : 'pointer',
                                    opacity: extendingId === ev.id ? 0.6 : 1,
                                  }}
                                >
                                  {extendingId === ev.id ? '...' : 'Extend 7 days'}
                                </button>
                                <button
                                  onClick={() => deleteEventNow(ev.id)}
                                  style={{
                                    padding: '5px 12px', borderRadius: '6px',
                                    border: '1px solid #EF4444', backgroundColor: '#EF444418',
                                    color: '#EF4444', fontSize: '12px', fontFamily: MONO,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Delete Now
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expiringEvents.length === 0 && (
              <div style={{ color: '#bbb', fontFamily: MONO, fontSize: '12px', textAlign: 'center', padding: '24px 0' }}>
                No events expiring in the next 7 days.
              </div>
            )}
          </section>

          {/* ── Section 10: Export Center ───────────────────────────────────── */}
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
