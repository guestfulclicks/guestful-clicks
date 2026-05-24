import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';
import { REVENUE_SHARE } from '../../shared/constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px' };
const PAGE_SIZE = 20;
const PLATFORM_SHARE = (100 - REVENUE_SHARE.organiserPercent) / 100;
const ORG_SHARE      = REVENUE_SHARE.organiserPercent / 100;

// ── Types ─────────────────────────────────────────────────────────────────────

type EventStatus = 'active' | 'revealed' | 'archived' | 'suspended';
type EventType   = 'private' | 'public';

interface EventRow {
  id:          string;
  title:       string;
  type:        EventType;
  status:      EventStatus;
  date:        string;
  end_time:    string | null;
  host_id:     string;
  host_name:   string;
  host_email:  string;
  country:     string | null;
  city:        string | null;
  state:       string | null;
  share_code:  string | null;
  reveal_time: string | null;
  shot_limit:  number;
  aesthetic:   string | null;
  cover_image: string | null;
  guest_count: number;
  photo_count: number;
  revenue:     number;
  created_at:  string;
}

interface Filters {
  search: string; status: string; type: string;
  dateFrom: string; dateTo: string; country: string;
  revenueMin: string; revenueMax: string;
  participantsMin: string; participantsMax: string;
}

interface Participant {
  id: string; user_id: string | null; name: string; tier: string;
  shots_used: number; upload_count: number; amount_paid: number;
  joined_at: string; qr_token: string;
}

interface Photo {
  id: string; url: string; uploaded_at: string;
  is_revealed: boolean; uploader_name: string;
}

interface PayoutInfo {
  id: string; total_collected: number; status: string; scheduled_date: string | null;
}

interface EventDetail {
  participants: Participant[];
  photos:       Photo[];
  payout:       PayoutInfo | null;
}

const EMPTY_FILTERS: Filters = {
  search: '', status: 'all', type: 'all',
  dateFrom: '', dateTo: '', country: '',
  revenueMin: '', revenueMax: '',
  participantsMin: '', participantsMax: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number)    { return `₹${n.toLocaleString('en-IN')}`; }
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '';
  return Array.from(code.toUpperCase())
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('');
}
function tierLabel(t: string): string {
  const m: Record<string, string> = {
    free:'Free', '99':'₹99', '199':'₹199', '299':'₹299', '499':'₹499',
    tier_99:'₹99', tier_199:'₹199', tier_299:'₹299', tier_499:'₹499',
  };
  return m[t] ?? m[t?.replace('tier_','')] ?? (t ?? 'Free');
}
function tierBg(t: string): string {
  if (t.includes('499')) return '#E8F0FE';
  if (t.includes('299')) return '#FDF4FF';
  if (t.includes('199')) return '#FFF7E0';
  if (t.includes('99'))  return '#E6F9EE';
  return '#F0F0F0';
}
function tierFg(t: string): string {
  if (t.includes('499')) return '#1A56DB';
  if (t.includes('299')) return '#9333EA';
  if (t.includes('199')) return '#7A5200';
  if (t.includes('99'))  return '#1A7A40';
  return '#666';
}
function copy(s: string) { navigator.clipboard.writeText(s).catch(() => {}); }
function todayISO()      { return new Date().toISOString().split('T')[0]; }

// ── Exports ───────────────────────────────────────────────────────────────────

function exportCSV(rows: EventRow[]) {
  const h = ['ID','Name','Type','Host','Country','Date','Participants','Photos','Revenue','Status','ShareCode','RevealTime'];
  const d = rows.map(ev => [
    ev.id, ev.title, ev.type, ev.host_name, ev.country ?? '', ev.date,
    ev.guest_count, ev.photo_count, ev.revenue, ev.status,
    ev.share_code ?? '', ev.reveal_time ?? '',
  ]);
  const csv = [h, ...d].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `events_${todayISO()}.csv`;
  a.click();
}

async function exportPDF(rows: EventRow[]) {
  const { jsPDF } = await import('jspdf');
  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const cols = [
    { l:'EVENT NAME', w:55 }, { l:'TYPE', w:18 }, { l:'HOST', w:42 },
    { l:'CO', w:12 },  { l:'DATE', w:23 }, { l:'GUESTS', w:18 },
    { l:'PHOTOS', w:18 }, { l:'REVENUE', w:26 }, { l:'STATUS', w:22 },
  ];
  const ROW_H = 7.5;
  const SX    = 14;
  const today = new Date().toLocaleDateString('en-IN');

  const drawPageHeader = () => {
    doc.setFillColor(12, 9, 4);          doc.rect(0, 0, W, 22, 'F');
    doc.setFontSize(15); doc.setTextColor(212, 168, 83);
    doc.text('Guestful Clicks', SX, 10);
    doc.setFontSize(9);  doc.setTextColor(200, 190, 170);
    doc.text('Event Management Report', SX, 17);
    doc.setTextColor(120, 120, 120);
    doc.text(`${today}  ·  ${rows.length} events`, W - SX, 17, { align: 'right' });
  };

  const drawTableHead = (y: number) => {
    doc.setFillColor(230, 224, 212); doc.rect(SX, y, W - 28, ROW_H, 'F');
    doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
    let x = SX + 2;
    cols.forEach(c => { doc.text(c.l, x, y + 5); x += c.w; });
    return y + ROW_H;
  };

  drawPageHeader();
  // Summary strip
  doc.setFillColor(245, 243, 239); doc.rect(0, 22, W, 14, 'F');
  doc.setFontSize(8);  doc.setTextColor(80, 80, 80);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  [
    `Total Events: ${rows.length}`,
    `Active: ${rows.filter(r => r.status === 'active').length}`,
    `Revealed: ${rows.filter(r => r.status === 'revealed').length}`,
    `Total Revenue: ₹${totalRev.toLocaleString('en-IN')}`,
  ].forEach((s, i) => doc.text(s, SX + i * 64, 31));

  let y = drawTableHead(40);

  rows.forEach((ev, i) => {
    if (y + ROW_H > H - 12) {
      doc.addPage(); drawPageHeader(); y = drawTableHead(26);
    }
    if (i % 2 === 0) { doc.setFillColor(250, 249, 247); doc.rect(SX, y, W - 28, ROW_H, 'F'); }
    doc.setFontSize(7);
    const vals = [
      ev.title.slice(0, 32) + (ev.title.length > 32 ? '…' : ''),
      ev.type, ev.host_name.slice(0, 22) + (ev.host_name.length > 22 ? '…' : ''),
      ev.country ?? '—', ev.date,
      String(ev.guest_count), String(ev.photo_count),
      `₹${ev.revenue.toLocaleString('en-IN')}`, ev.status.toUpperCase(),
    ];
    let x = SX + 2;
    vals.forEach((v, j) => {
      doc.setTextColor(j === 7 ? 180 : 30, j === 7 ? 120 : 30, j === 7 ? 40 : 30);
      doc.text(v, x, y + 5); x += cols[j].w;
    });
    y += ROW_H;
  });

  const np = doc.getNumberOfPages();
  for (let p = 1; p <= np; p++) {
    doc.setPage(p); doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text('Guestful Clicks — Confidential', SX, H - 5);
    doc.text(`Page ${p} of ${np}`, W - SX, H - 5, { align: 'right' });
  }
  doc.save(`events_report_${todayISO()}.pdf`);
}

// ── Pills & tiny components ───────────────────────────────────────────────────

function StatusPill({ status }: { status: EventStatus }) {
  const m: Record<EventStatus, [string, string, string, boolean]> = {
    active:    ['#E6F9EE', '#1A7A40', 'LIVE',      true],
    revealed:  ['#FFF7E0', '#7A5200', 'REVEALED',  false],
    archived:  ['#F0F0F0', '#666666', 'ARCHIVED',  false],
    suspended: ['#FFE9E9', '#B71C1C', 'SUSPENDED', false],
  };
  const [bg, fg, label, pulse] = m[status] ?? ['#F0F0F0', '#666', status.toUpperCase(), false];
  return (
    <span style={{ backgroundColor: bg, color: fg, display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px', fontFamily: MONO }}>
      {pulse && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: fg, display: 'inline-block', animation: 'gcPulse 1.5s ease-in-out infinite' }} />}
      {label}
    </span>
  );
}

function TypePill({ type }: { type: EventType }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px', fontFamily: MONO, backgroundColor: type === 'public' ? '#EEF9EE' : '#EEF4FF', color: type === 'public' ? '#1A7A40' : '#1A56DB' }}>
      {type === 'public' ? 'PUBLIC' : 'PRIVATE'}
    </span>
  );
}

function TierPill({ tier }: { tier: string }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 7px', borderRadius: '4px', fontFamily: MONO, backgroundColor: tierBg(tier), color: tierFg(tier) }}>
      {tierLabel(tier)}
    </span>
  );
}

function Btn({ children, onClick, color = GOLD, outline = false, size = 'md', disabled = false, style: sx }: {
  children: React.ReactNode; onClick?: () => void; color?: string;
  outline?: boolean; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; style?: React.CSSProperties;
}) {
  const pad = size === 'sm' ? '5px 10px' : size === 'lg' ? '11px 22px' : '8px 16px';
  const fs  = size === 'sm' ? '11px' : size === 'lg' ? '14px' : '12px';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: pad, fontSize: fs, fontFamily: MONO, fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
        border: outline ? `1px solid ${color}` : 'none', borderRadius: '6px',
        backgroundColor: disabled ? '#DDD' : outline ? 'transparent' : color,
        color: disabled ? '#AAA' : outline ? color : color === GOLD ? '#0C0904' : '#FFF',
        opacity: disabled ? 0.6 : 1, ...sx,
      }}
    >
      {children}
    </button>
  );
}

// ── Event detail panel ────────────────────────────────────────────────────────

type TabId = 'overview' | 'participants' | 'photos' | 'financials' | 'actions';

function EventDetailPanel({ ev, detail, detailLoading, onClose, onRefresh }: {
  ev: EventRow; detail: EventDetail | null; detailLoading: boolean;
  onClose: () => void; onRefresh: () => void;
}) {
  const [tab, setTab]                   = useState<TabId>('overview');
  const [busy, setBusy]                 = useState(false);
  const [msg, setMsg]                   = useState('');
  const [revealConfirm, setRevealConfirm] = useState(false);
  const [newRevealTime, setNewRevealTime] = useState(ev.reveal_time?.slice(0, 16) ?? '');
  const [newShotLimit, setNewShotLimit]   = useState(String(ev.shot_limit));
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [deleteText, setDeleteText]       = useState('');
  const [banReason, setBanReason]         = useState('');
  const [banConfirm, setBanConfirm]       = useState(false);
  const [holdReason, setHoldReason]       = useState('');
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);

  const ok  = (m: string) => { setMsg(`✓ ${m}`); setTimeout(() => setMsg(''), 4000); };
  const err = (m: string) => { setMsg(`✗ ${m}`); setTimeout(() => setMsg(''), 6000); };

  const handleRevealNow = async () => {
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from('events').update({ status: 'revealed' }).eq('id', ev.id),
      supabase.from('photos').update({ is_revealed: true }).eq('event_id', ev.id),
    ]);
    if (r1.error || r2.error) { err('Reveal failed.'); setBusy(false); return; }
    // Push notifications
    if (detail?.participants.length) {
      const ids = detail.participants.map(p => p.user_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: us } = await supabase.from('users').select('push_token').in('id', ids).not('push_token','is',null);
        const tokens = (us ?? []).map((u: any) => u.push_token).filter(Boolean);
        if (tokens.length) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokens.map((to: string) => ({
              to, title: 'Your gallery is ready 🎞',
              body: `${ev.title} — Come see what everyone captured.`,
              data: { type: 'reveal' }, sound: 'default',
            }))),
          }).catch(() => {});
        }
      }
    }
    ok('Event revealed and guests notified.');
    setRevealConfirm(false);
    setBusy(false);
    onRefresh();
  };

  const handleUpdateRevealTime = async () => {
    if (!newRevealTime) return;
    setBusy(true);
    const { error } = await supabase.from('events').update({ reveal_time: new Date(newRevealTime).toISOString() }).eq('id', ev.id);
    error ? err(error.message) : ok('Reveal time updated.');
    setBusy(false); onRefresh();
  };

  const handleUpdateShotLimit = async () => {
    const n = parseInt(newShotLimit, 10);
    if (!n || n < 1) return;
    setBusy(true);
    const { error } = await supabase.from('events').update({ shot_limit: n }).eq('id', ev.id);
    error ? err(error.message) : ok('Shot limit updated.');
    setBusy(false); onRefresh();
  };

  const handleSuspend = async () => {
    setBusy(true);
    const { error } = await supabase.from('events')
      .update({ status: 'suspended', suspension_reason: suspendReason } as any).eq('id', ev.id);
    error ? err(error.message) : ok('Event suspended.');
    setSuspendConfirm(false); setBusy(false); onRefresh();
  };

  const handleUnsuspend = async () => {
    setBusy(true);
    const { error } = await supabase.from('events').update({ status: 'active' }).eq('id', ev.id);
    error ? err(error.message) : ok('Event reactivated.');
    setBusy(false); onRefresh();
  };

  const handleHoldPayout = async () => {
    setBusy(true);
    const { error } = await supabase.from('payouts').update({ status: 'held' } as any).eq('event_id', ev.id);
    error ? err(error.message) : ok('Payout held.');
    setBusy(false); onRefresh();
  };

  const handleReleasePayout = async () => {
    setBusy(true);
    const { error } = await supabase.from('payouts')
      .update({ status: 'scheduled', scheduled_date: todayISO() }).eq('event_id', ev.id);
    error ? err(error.message) : ok('Payout released.');
    setBusy(false); onRefresh();
  };

  const handleDelete = async () => {
    if (deleteText !== ev.title) return;
    setBusy(true);
    // delete photos from storage
    if (detail?.photos.length) {
      const paths = detail.photos.map(p => {
        const m = p.url.match(/\/object\/public\/([^?]+)/);
        return m ? m[1].replace(/^[^/]+\//, '') : null;
      }).filter(Boolean) as string[];
      if (paths.length) {
        const bucket = detail.photos[0]?.url.match(/\/public\/([^/]+)\//)?.[1] ?? 'photos';
        await supabase.storage.from(bucket).remove(paths).catch(() => {});
      }
    }
    await supabase.from('photos').delete().eq('event_id', ev.id);
    await supabase.from('participants').delete().eq('event_id', ev.id);
    await supabase.from('payouts').delete().eq('event_id', ev.id);
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) { err(error.message); setBusy(false); return; }
    onRefresh(); onClose();
  };

  const handleBanUser = async () => {
    if (!banReason.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('users').update({ role: 'banned' } as any).eq('id', ev.host_id);
    error ? err(error.message) : ok('User banned.');
    setBanConfirm(false); setBusy(false); onRefresh();
  };

  const handleDownloadPhotos = async () => {
    if (!detail?.photos.length) return;
    setDownloadingPhotos(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      await Promise.all(detail.photos.map(async (p, i) => {
        try {
          const res = await fetch(p.url);
          const blob = await res.blob();
          const ext = p.url.split('.').pop()?.split('?')[0] ?? 'jpg';
          zip.file(`${String(i + 1).padStart(3, '0')}_${p.uploader_name.replace(/[^a-z0-9]/gi, '_')}.${ext}`, blob);
        } catch { /* skip */ }
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `${ev.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_photos.zip`;
      a.click();
    } finally { setDownloadingPhotos(false); }
  };

  const exportParticipantsCSV = () => {
    if (!detail?.participants.length) return;
    const h = ['Name','Tier','Shots','Amount Paid','Joined','QR Token'];
    const d = detail.participants.map(p => [p.name, tierLabel(p.tier), p.upload_count, fmtINR(p.amount_paid), fmtDateTime(p.joined_at), p.qr_token]);
    const csv = [h, ...d].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `participants_${ev.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${todayISO()}.csv`;
    a.click();
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'participants',  label: `Guests (${detail?.participants.length ?? '…'})` },
    { id: 'photos',        label: `Photos (${detail?.photos.length ?? '…'})` },
    { id: 'financials',    label: 'Financials' },
    { id: 'actions',       label: 'Actions' },
  ];

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #E0D8CC', borderRadius: '6px', fontSize: '12px', fontFamily: MONO, color: '#1A1208', backgroundColor: '#FDFCFA', width: '100%', boxSizing: 'border-box' };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F5F3EF', fontSize: '12px', fontFamily: MONO };
  const lbl: React.CSSProperties = { color: '#888', flex: '0 0 130px' };
  const val: React.CSSProperties = { color: '#0C0904', fontWeight: '600', textAlign: 'right' as const };
  const sec: React.CSSProperties = { marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #F0EDE8' };
  const sh:  React.CSSProperties = { fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', marginBottom: '12px' };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 199 }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh', backgroundColor: '#FFFFFF', boxShadow: '-4px 0 32px rgba(0,0,0,0.15)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Cover */}
        <div style={{ position: 'relative', height: '180px', backgroundColor: '#0C0904', flexShrink: 0, overflow: 'hidden' }}>
          {ev.cover_image
            ? <img src={ev.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
            : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1714,#0C0904)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>📷</div>
          }
          <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px' }}>
            <h2 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#FFFFFF', margin: '0 0 6px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{ev.title}</h2>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill status={ev.status} />
              <TypePill type={ev.type} />
              {ev.share_code && (
                <span
                  onClick={() => copy(ev.share_code!)}
                  title="Click to copy"
                  style={{ fontFamily: MONO, fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.15)', color: '#F0E8D5', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                >
                  #{ev.share_code} 📋
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Host strip */}
        <div style={{ padding: '10px 16px', backgroundColor: '#F5F3EF', borderBottom: '1px solid #E8E3DC', fontSize: '12px', fontFamily: MONO, color: '#555', display: 'flex', justifyContent: 'space-between' }}>
          <span><strong style={{ color: '#0C0904' }}>{ev.host_name}</strong></span>
          <span style={{ color: '#888' }}>{ev.host_email}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E3DC', backgroundColor: '#FFF', flexShrink: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
              color: tab === t.id ? GOLD : '#888',
              borderBottom: tab === t.id ? `2px solid ${GOLD}` : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

          {msg && (
            <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontFamily: MONO, backgroundColor: msg.startsWith('✓') ? '#E6F9EE' : '#FFE9E9', color: msg.startsWith('✓') ? '#1A7A40' : '#B71C1C' }}>
              {msg}
            </div>
          )}

          {detailLoading && <div style={{ textAlign: 'center', color: '#888', fontFamily: MONO, fontSize: '13px', padding: '40px 0' }}>Loading…</div>}

          {!detailLoading && tab === 'overview' && (
            <>
              {/* Stats row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                  { label: 'Guests',   value: ev.guest_count },
                  { label: 'Photos',   value: ev.photo_count },
                  { label: 'Revenue',  value: fmtINR(ev.revenue), gold: true },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, backgroundColor: '#F5F3EF', borderRadius: '8px', padding: '12px 10px', textAlign: 'center' as const }}>
                    <div style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: s.gold ? GOLD : '#0C0904' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Details */}
              <div style={sec}>
                <div style={sh}>Event Details</div>
                {[
                  ['Created',     fmtDate(ev.created_at)],
                  ['Event Date',  fmtDate(ev.date)],
                  ['End Time',    ev.end_time ? fmtDateTime(ev.end_time) : '—'],
                  ['Reveal Time', fmtDateTime(ev.reveal_time)],
                  ['Shot Limit',  `${ev.shot_limit} shots`],
                  ['Aesthetic',   ev.aesthetic ?? '—'],
                  ['Location',    [ev.city, ev.state, ev.country].filter(Boolean).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={row}><span style={lbl}>{k}</span><span style={val}>{v}</span></div>
                ))}
              </div>
              {/* Join URL */}
              {ev.share_code && (
                <div style={sec}>
                  <div style={sh}>Join URL</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#F5F3EF', borderRadius: '6px', padding: '10px 12px' }}>
                    <code style={{ flex: 1, fontSize: '11px', color: '#555', fontFamily: MONO, wordBreak: 'break-all' }}>
                      https://join.guestfulclicks.com/{ev.share_code}
                    </code>
                    <Btn size="sm" onClick={() => copy(`https://join.guestfulclicks.com/${ev.share_code}`)}>Copy</Btn>
                  </div>
                </div>
              )}
            </>
          )}

          {!detailLoading && tab === 'participants' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>{detail?.participants.length ?? 0} participants</span>
                <Btn size="sm" onClick={exportParticipantsCSV}>Export CSV</Btn>
              </div>
              {!detail?.participants.length
                ? <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', fontFamily: MONO, fontSize: '13px' }}>No participants yet.</div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: MONO }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F5F3EF' }}>
                        {['Name','Tier','Shots','Paid','Joined','Token'].map(h => (
                          <th key={h} style={{ padding: '8px 8px', textAlign: 'left', fontSize: '10px', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail?.participants.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #F5F3EF' }}>
                          <td style={{ padding: '9px 8px', fontWeight: '600', color: '#0C0904', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                          <td style={{ padding: '9px 8px' }}><TierPill tier={p.tier} /></td>
                          <td style={{ padding: '9px 8px', color: '#555' }}>{p.upload_count}</td>
                          <td style={{ padding: '9px 8px', color: GOLD, fontWeight: '600' }}>{p.amount_paid ? fmtINR(p.amount_paid) : '—'}</td>
                          <td style={{ padding: '9px 8px', color: '#888', whiteSpace: 'nowrap' }}>{fmtDate(p.joined_at)}</td>
                          <td style={{ padding: '9px 8px' }}>
                            <span style={{ cursor: 'pointer', color: '#555' }} onClick={() => copy(p.qr_token)} title="Click to copy">
                              {p.qr_token.slice(0, 8)}…
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </>
          )}

          {!detailLoading && tab === 'photos' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>{detail?.photos.length ?? 0} photos</span>
                <Btn size="sm" onClick={handleDownloadPhotos} disabled={downloadingPhotos || !detail?.photos.length}>
                  {downloadingPhotos ? 'Zipping…' : 'Download All'}
                </Btn>
              </div>
              {!detail?.photos.length
                ? <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', fontFamily: MONO, fontSize: '13px' }}>No photos uploaded yet.</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {detail.photos.map(p => (
                      <div key={p.id} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#F0EDE8', aspectRatio: '1', cursor: 'pointer' }} onClick={() => window.open(p.url, '_blank')}>
                        <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.75))', padding: '16px 6px 5px', fontSize: '9px', color: '#FFF', fontFamily: MONO }}>
                          <div style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.uploader_name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.65)' }}>{fmtDate(p.uploaded_at)}</div>
                        </div>
                        {p.is_revealed && (
                          <div style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: GOLD, color: '#0C0904', fontSize: '8px', fontWeight: '700', padding: '2px 5px', borderRadius: '3px', fontFamily: MONO }}>LIVE</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
            </>
          )}

          {!detailLoading && tab === 'financials' && (() => {
            const total = ev.revenue;
            const platRev = total * PLATFORM_SHARE;
            const orgRev  = total * ORG_SHARE;
            const tierGroups: Record<string, { count: number; revenue: number }> = {};
            detail?.participants.forEach(p => {
              const k = tierLabel(p.tier);
              if (!tierGroups[k]) tierGroups[k] = { count: 0, revenue: 0 };
              tierGroups[k].count++;
              tierGroups[k].revenue += p.amount_paid;
            });
            return (
              <>
                <div style={sec}>
                  <div style={sh}>Revenue Breakdown</div>
                  {[
                    { label: 'Total Collected', value: fmtINR(total), color: '#0C0904' },
                    { label: `Platform (${100 - REVENUE_SHARE.organiserPercent}%)`, value: fmtINR(platRev), color: '#4A90E2' },
                    { label: `Organiser (${REVENUE_SHARE.organiserPercent}%)`, value: fmtINR(orgRev), color: GOLD },
                  ].map(item => (
                    <div key={item.label} style={row}>
                      <span style={lbl}>{item.label}</span>
                      <span style={{ ...val, color: item.color }}>{item.value}</span>
                    </div>
                  ))}
                  {detail?.payout && (
                    <>
                      <div style={row}><span style={lbl}>Payout Status</span><span style={val}>{detail.payout.status}</span></div>
                      <div style={row}><span style={lbl}>Scheduled Date</span><span style={val}>{fmtDate(detail.payout.scheduled_date)}</span></div>
                    </>
                  )}
                </div>
                {Object.keys(tierGroups).length > 0 && (
                  <div>
                    <div style={sh}>By Tier</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: MONO }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F5F3EF' }}>
                          {['Tier','Participants','Revenue'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', color: '#888', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(tierGroups).map(([tier, g]) => (
                          <tr key={tier} style={{ borderBottom: '1px solid #F5F3EF' }}>
                            <td style={{ padding: '10px 10px' }}><TierPill tier={tier} /></td>
                            <td style={{ padding: '10px 10px', color: '#555' }}>{g.count}</td>
                            <td style={{ padding: '10px 10px', color: GOLD, fontWeight: '600' }}>{fmtINR(g.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}

          {!detailLoading && tab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Reveal controls */}
              <div style={sec}>
                <div style={sh}>Reveal Controls</div>
                {ev.status === 'active' && !revealConfirm && (
                  <Btn onClick={() => setRevealConfirm(true)} disabled={busy}>⚡ Reveal Now</Btn>
                )}
                {revealConfirm && (
                  <div style={{ backgroundColor: '#FFF7E0', border: '1px solid #FFD966', borderRadius: '8px', padding: '14px' }}>
                    <p style={{ fontFamily: MONO, fontSize: '12px', color: '#7A5200', margin: '0 0 12px' }}>
                      Reveal <strong>{ev.title}</strong> now? All {detail?.participants.length ?? 0} guests will be notified.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Btn onClick={handleRevealNow} disabled={busy}>Confirm Reveal</Btn>
                      <Btn outline color="#888" onClick={() => setRevealConfirm(false)}>Cancel</Btn>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '6px', textTransform: 'uppercase' }}>Change Reveal Time</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="datetime-local" value={newRevealTime} onChange={e => setNewRevealTime(e.target.value)} style={{ ...inp, flex: 1 }} />
                    <Btn size="sm" onClick={handleUpdateRevealTime} disabled={busy || !newRevealTime}>Update</Btn>
                  </div>
                </div>
              </div>

              {/* Shot limit */}
              <div style={sec}>
                <div style={sh}>Shot Limit</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="number" value={newShotLimit} min={1} max={200} onChange={e => setNewShotLimit(e.target.value)} style={{ ...inp, width: '90px' }} />
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>shots per guest</span>
                  <Btn size="sm" onClick={handleUpdateShotLimit} disabled={busy}>Update</Btn>
                </div>
              </div>

              {/* Suspend */}
              <div style={sec}>
                <div style={sh}>Suspension</div>
                {ev.status === 'active' && (
                  <>
                    {!suspendConfirm
                      ? <Btn outline color="#FF9500" onClick={() => setSuspendConfirm(true)}>⏸ Suspend Event</Btn>
                      : (
                        <div style={{ border: '1px solid #FF9500', borderRadius: '8px', padding: '14px' }}>
                          <textarea placeholder="Reason for suspension…" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} style={{ ...inp, minHeight: '60px', resize: 'vertical', marginBottom: '10px' }} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Btn onClick={handleSuspend} disabled={busy || !suspendReason.trim()} color="#FF9500">Confirm Suspend</Btn>
                            <Btn outline color="#888" onClick={() => setSuspendConfirm(false)}>Cancel</Btn>
                          </div>
                        </div>
                      )
                    }
                  </>
                )}
                {ev.status === 'suspended' && (
                  <Btn color="#50C878" onClick={handleUnsuspend} disabled={busy}>✓ Unsuspend Event</Btn>
                )}
                {ev.status !== 'active' && ev.status !== 'suspended' && (
                  <p style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>Suspension only available for active events.</p>
                )}
              </div>

              {/* Financial */}
              <div style={sec}>
                <div style={sh}>Financial Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ padding: '12px', backgroundColor: '#FFF7E0', borderRadius: '8px', fontFamily: MONO, fontSize: '12px', color: '#7A5200' }}>
                    ⚠ Refund All Participants requires a server-side function for Razorpay API calls.
                    <br /><span style={{ color: '#aaa', fontSize: '11px' }}>Reach your backend team to trigger this action.</span>
                  </div>
                  <Btn outline color="#FF9500" onClick={handleHoldPayout} disabled={busy}>⏸ Hold Organiser Payout</Btn>
                  <Btn outline color="#50C878" onClick={handleReleasePayout} disabled={busy}>▶ Release Payout Early</Btn>
                </div>
              </div>

              {/* Danger zone */}
              <div style={{ border: '1.5px solid #FFCCCC', borderRadius: '10px', padding: '16px' }}>
                <div style={{ ...sh, color: '#B71C1C', marginBottom: '16px' }}>⚠ Danger Zone</div>

                {/* Delete */}
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #FFE9E9' }}>
                  <p style={{ fontFamily: MONO, fontSize: '12px', color: '#B71C1C', marginBottom: '8px' }}>
                    Permanently delete this event, all photos, and all participants. Cannot be undone.
                  </p>
                  <label style={{ display: 'block', fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '6px' }}>
                    Type <strong>{ev.title}</strong> to confirm:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder={ev.title} style={{ ...inp, flex: 1 }} />
                    <Btn color="#FF5252" onClick={handleDelete} disabled={busy || deleteText !== ev.title}>🗑 Delete</Btn>
                  </div>
                </div>

                {/* Ban */}
                <div>
                  <p style={{ fontFamily: MONO, fontSize: '12px', color: '#B71C1C', marginBottom: '8px' }}>
                    Ban the host/organiser <strong>{ev.host_name}</strong> from the platform.
                  </p>
                  {!banConfirm
                    ? <Btn outline color="#B71C1C" onClick={() => setBanConfirm(true)}>Ban {ev.host_name}</Btn>
                    : (
                      <>
                        <textarea placeholder="Reason for ban…" value={banReason} onChange={e => setBanReason(e.target.value)} style={{ ...inp, minHeight: '50px', resize: 'vertical', marginBottom: '8px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Btn color="#B71C1C" onClick={handleBanUser} disabled={busy || !banReason.trim()}>Confirm Ban</Btn>
                          <Btn outline color="#888" onClick={() => setBanConfirm(false)}>Cancel</Btn>
                        </div>
                      </>
                    )
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main EventsPage ───────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents]           = useState<EventRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filters, setFilters]         = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage]               = useState(1);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [panelEvent, setPanelEvent]   = useState<EventRow | null>(null);
  const [detail, setDetail]           = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bulkDeleteText, setBulkDeleteText] = useState('');

  // Inject keyframes once
  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = '@keyframes gcPulse{0%,100%{opacity:1}50%{opacity:0.25}}';
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data: evs } = await supabase
      .from('events')
      .select('id,title,type,status,event_date,event_end_time,host_id,guest_count,share_code,reveal_time,shot_limit,aesthetic,country,city,state,cover_image,created_at')
      .order('created_at', { ascending: false });

    if (!evs?.length) { setEvents([]); setLoading(false); return; }

    const rows: EventRow[] = await Promise.all(evs.map(async (ev: any) => {
      const [{ data: host }, { count: pc }, { data: paid }] = await Promise.all([
        supabase.from('users').select('full_name,email').eq('id', ev.host_id).single(),
        supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
        supabase.from('participants').select('amount_paid').eq('event_id', ev.id),
      ]);
      return {
        id: ev.id, title: ev.title, type: ev.type, status: ev.status,
        date: ev.event_date, end_time: ev.event_end_time ?? null,
        host_id: ev.host_id,
        host_name:  (host as any)?.full_name ?? '—',
        host_email: (host as any)?.email    ?? '',
        country: ev.country ?? null, city: ev.city ?? null, state: ev.state ?? null,
        share_code: ev.share_code ?? null, reveal_time: ev.reveal_time ?? null,
        shot_limit: ev.shot_limit ?? 18, aesthetic: ev.aesthetic ?? null,
        cover_image: ev.cover_image ?? null,
        guest_count: ev.guest_count ?? 0, photo_count: pc ?? 0,
        revenue: ((paid ?? []) as any[]).reduce((s, r) => s + (r.amount_paid ?? 0), 0),
        created_at: ev.created_at,
      } as EventRow;
    }));

    setEvents(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const loadDetail = useCallback(async (eventId: string) => {
    setDetailLoading(true);
    const [
      { data: participantsRaw },
      { data: photosRaw },
      { data: payoutRaw },
    ] = await Promise.all([
      supabase.from('participants').select('id,name,tier,shots_used,upload_count,amount_paid,joined_at,qr_token,user_id').eq('event_id', eventId),
      supabase.from('photos').select('id,url,uploaded_at,is_revealed,participant_id').eq('event_id', eventId).order('uploaded_at', { ascending: false }),
      supabase.from('payouts').select('id,total_collected,status,scheduled_date').eq('event_id', eventId).maybeSingle(),
    ]);

    const pMap: Record<string, string> = {};
    (participantsRaw ?? []).forEach((p: any) => { pMap[p.id] = p.name ?? '—'; });

    setDetail({
      participants: (participantsRaw ?? []).map((p: any) => ({
        id: p.id, user_id: p.user_id ?? null, name: p.name ?? '—', tier: p.tier ?? 'free',
        shots_used: p.shots_used ?? 0, upload_count: p.upload_count ?? 0,
        amount_paid: p.amount_paid ?? 0, joined_at: p.joined_at ?? '', qr_token: p.qr_token ?? '',
      })),
      photos: (photosRaw ?? []).map((p: any) => ({
        id: p.id, url: p.url, uploaded_at: p.uploaded_at,
        is_revealed: p.is_revealed ?? false, uploader_name: pMap[p.participant_id] ?? '—',
      })),
      payout: payoutRaw as PayoutInfo | null,
    });
    setDetailLoading(false);
  }, []);

  const openPanel = (ev: EventRow) => {
    setPanelEvent(ev); setDetail(null); loadDetail(ev.id);
  };
  const closePanel = () => { setPanelEvent(null); setDetail(null); };
  const refresh    = () => { loadEvents(); if (panelEvent) loadDetail(panelEvent.id); };

  // Filters
  const filtered = useMemo(() => {
    return events.filter(ev => {
      const { search, status, type, dateFrom, dateTo, country, revenueMin, revenueMax, participantsMin, participantsMax } = filters;
      if (status  !== 'all' && ev.status !== status)           return false;
      if (type    !== 'all' && ev.type   !== type)             return false;
      if (country && ev.country !== country)                    return false;
      if (dateFrom && ev.date < dateFrom)                       return false;
      if (dateTo   && ev.date > dateTo)                         return false;
      if (revenueMin && ev.revenue < Number(revenueMin))       return false;
      if (revenueMax && ev.revenue > Number(revenueMax))       return false;
      if (participantsMin && ev.guest_count < Number(participantsMin)) return false;
      if (participantsMax && ev.guest_count > Number(participantsMax)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!ev.title.toLowerCase().includes(q) && !ev.host_name.toLowerCase().includes(q) && !(ev.share_code ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [events, filters]);

  useEffect(() => { setPage(1); }, [filters]);

  const countries = useMemo(() => [...new Set(events.map(e => e.country).filter(Boolean))].sort() as string[], [events]);
  const pageCount  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Selection
  const allPageSelected = paginated.length > 0 && paginated.every(ev => selected.has(ev.id));
  const toggleAll       = () => setSelected(prev => {
    const next = new Set(prev);
    allPageSelected ? paginated.forEach(ev => next.delete(ev.id)) : paginated.forEach(ev => next.add(ev.id));
    return next;
  });
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Bulk actions
  const bulkReveal  = async () => {
    const ids = [...selected];
    await Promise.all(ids.map(id => supabase.from('events').update({ status: 'revealed' }).eq('id', id)));
    setSelected(new Set()); loadEvents();
  };
  const bulkArchive = async () => {
    const ids = [...selected];
    await Promise.all(ids.map(id => supabase.from('events').update({ status: 'archived' }).eq('id', id)));
    setSelected(new Set()); loadEvents();
  };
  const bulkDelete  = async () => {
    if (bulkDeleteText !== 'DELETE ALL') return;
    const ids = [...selected];
    await Promise.all(ids.flatMap(id => [
      supabase.from('photos').delete().eq('event_id', id),
      supabase.from('participants').delete().eq('event_id', id),
      supabase.from('events').delete().eq('id', id),
    ]));
    setSelected(new Set()); setBulkDeleteText(''); loadEvents();
  };

  const setF = (patch: Partial<Filters>) => setFilters(prev => ({ ...prev, ...patch }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // Styles
  const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #E8E3DC', borderRadius: '6px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#FFF' };
  const th: React.CSSProperties  = { padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO, whiteSpace: 'nowrap', backgroundColor: '#F5F3EF', borderBottom: '1px solid #E8E3DC' };
  const td: React.CSSProperties  = { padding: '12px 12px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', whiteSpace: 'nowrap', verticalAlign: 'middle' };

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <AdminLayout pageTitle="Event Management">
      <style>{`@keyframes gcPulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 4px' }}>Event Management</h1>
          <span style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>{events.length} total events</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn outline color="#555" onClick={() => exportCSV(filtered)}>Export CSV</Btn>
          <Btn outline color="#555" onClick={() => exportPDF(filtered)}>Export PDF</Btn>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ ...CARD, padding: '16px', marginBottom: '12px' }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <input style={{ ...inp, flex: '2 1 200px' }} placeholder="Search events, hosts, share codes…" value={filters.search} onChange={e => setF({ search: e.target.value })} />
          <select style={{ ...inp, flex: '1 1 120px' }} value={filters.status} onChange={e => setF({ status: e.target.value })}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="revealed">Revealed</option>
            <option value="archived">Archived</option>
            <option value="suspended">Suspended</option>
          </select>
          <select style={{ ...inp, flex: '1 1 110px' }} value={filters.type} onChange={e => setF({ type: e.target.value })}>
            <option value="all">All Types</option>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <input type="date" style={{ ...inp, flex: '1 1 130px' }} value={filters.dateFrom} onChange={e => setF({ dateFrom: e.target.value })} title="From date" />
          <input type="date" style={{ ...inp, flex: '1 1 130px' }} value={filters.dateTo}   onChange={e => setF({ dateTo: e.target.value })}   title="To date" />
        </div>
        {/* Row 2 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ ...inp, flex: '1 1 100px' }} value={filters.country} onChange={e => setF({ country: e.target.value })}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{countryFlag(c)} {c}</option>)}
          </select>
          <input style={{ ...inp, flex: '1 1 90px' }}  type="number" placeholder="Min ₹" value={filters.revenueMin}      onChange={e => setF({ revenueMin: e.target.value })} />
          <input style={{ ...inp, flex: '1 1 90px' }}  type="number" placeholder="Max ₹" value={filters.revenueMax}      onChange={e => setF({ revenueMax: e.target.value })} />
          <input style={{ ...inp, flex: '1 1 80px' }}  type="number" placeholder="Min guests" value={filters.participantsMin} onChange={e => setF({ participantsMin: e.target.value })} />
          <input style={{ ...inp, flex: '1 1 80px' }}  type="number" placeholder="Max guests" value={filters.participantsMax} onChange={e => setF({ participantsMax: e.target.value })} />
          {hasFilters && <Btn outline color="#888" size="sm" onClick={clearFilters}>Clear All</Btn>}
          <Btn size="sm" onClick={loadEvents}>Refresh</Btn>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ ...CARD, padding: '12px 16px', marginBottom: '12px', backgroundColor: '#FFF7E0', border: '1px solid #FFD966', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: '600', color: '#7A5200' }}>{selected.size} events selected</span>
          <Btn size="sm" onClick={bulkReveal}>⚡ Reveal All</Btn>
          <Btn size="sm" outline color="#888" onClick={bulkArchive}>Archive All</Btn>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
            <input
              placeholder="Type DELETE ALL"
              value={bulkDeleteText}
              onChange={e => setBulkDeleteText(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #FFCCCC', borderRadius: '4px', fontSize: '11px', fontFamily: MONO, width: '130px' }}
            />
            <Btn size="sm" color="#FF5252" onClick={bulkDelete} disabled={bulkDeleteText !== 'DELETE ALL'}>🗑 Delete All</Btn>
          </div>
          <Btn size="sm" outline color="#888" onClick={() => setSelected(new Set())}>Deselect</Btn>
        </div>
      )}

      {/* Table */}
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: '0' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#888', fontFamily: MONO, fontSize: '13px' }}>Loading events…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#888', fontFamily: MONO, fontSize: '13px' }}>
            {hasFilters ? 'No events match your filters.' : 'No events yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '36px', padding: '10px 12px' }}>
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {['Event', 'Type', 'Host', 'Country', 'Date', 'Guests', 'Photos', 'Revenue', 'Status', 'Reveal Time', 'Actions'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(ev => (
                  <tr key={ev.id}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    <td style={{ ...td, width: '36px' }}>
                      <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleOne(ev.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, fontWeight: '600', color: '#0C0904', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} onClick={() => openPanel(ev)}>
                      {ev.title}
                    </td>
                    <td style={td}><TypePill type={ev.type} /></td>
                    <td style={{ ...td, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.host_name}</td>
                    <td style={td}>{ev.country ? `${countryFlag(ev.country)} ${ev.country}` : '—'}</td>
                    <td style={td}>{fmtDate(ev.date)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{ev.guest_count}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{ev.photo_count}</td>
                    <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{fmtINR(ev.revenue)}</td>
                    <td style={td}><StatusPill status={ev.status} /></td>
                    <td style={{ ...td, color: '#888' }}>{fmtDateTime(ev.reveal_time)}</td>
                    <td style={{ ...td }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button title="View" onClick={() => openPanel(ev)} style={{ background: 'none', border: '1px solid #DDD', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '13px' }}>👁</button>
                        {ev.status === 'active' && (
                          <button title="Reveal Now" onClick={async () => { if (window.confirm(`Reveal "${ev.title}" now?`)) { await supabase.from('events').update({ status: 'revealed' }).eq('id', ev.id); await supabase.from('photos').update({ is_revealed: true }).eq('event_id', ev.id); loadEvents(); } }} style={{ background: 'none', border: `1px solid ${GOLD}`, borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '13px' }}>⚡</button>
                        )}
                        {ev.status === 'active' && (
                          <button title="Suspend" onClick={() => { setPanelEvent(ev); setDetail(null); loadDetail(ev.id); }} style={{ background: 'none', border: '1px solid #FF9500', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '13px' }}>⏸</button>
                        )}
                        <button title="Delete" onClick={async () => { if (window.confirm(`Delete "${ev.title}"? This cannot be undone.`)) { await supabase.from('photos').delete().eq('event_id', ev.id); await supabase.from('participants').delete().eq('event_id', ev.id); await supabase.from('events').delete().eq('id', ev.id); loadEvents(); } }} style={{ background: 'none', border: '1px solid #FFCCCC', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '13px', color: '#FF5252' }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: '1px solid #F5F3EF', fontFamily: MONO, fontSize: '12px', color: '#888' }}>
                <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} events</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 10px', border: '1px solid #DDD', borderRadius: '4px', background: 'none', cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: MONO, fontSize: '12px', color: page === 1 ? '#CCC' : '#555' }}>← Prev</button>
                  {Array.from({ length: Math.min(7, pageCount) }, (_, i) => {
                    let p: number;
                    if (pageCount <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= pageCount - 3) p = pageCount - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)} style={{ width: '32px', padding: '5px', border: `1px solid ${p === page ? GOLD : '#DDD'}`, borderRadius: '4px', backgroundColor: p === page ? GOLD : 'transparent', color: p === page ? '#0C0904' : '#555', cursor: 'pointer', fontFamily: MONO, fontSize: '12px', fontWeight: p === page ? '600' : '400' }}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount} style={{ padding: '5px 10px', border: '1px solid #DDD', borderRadius: '4px', background: 'none', cursor: page === pageCount ? 'not-allowed' : 'pointer', fontFamily: MONO, fontSize: '12px', color: page === pageCount ? '#CCC' : '#555' }}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {panelEvent && (
        <EventDetailPanel
          ev={panelEvent}
          detail={detail}
          detailLoading={detailLoading}
          onClose={closePanel}
          onRefresh={refresh}
        />
      )}
    </AdminLayout>
  );
}
