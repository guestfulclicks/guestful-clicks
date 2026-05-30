import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';
import { REVENUE_SHARE } from '../lib/constants';
import {
  getAllCountries,
  getStatesByCountry,
  getCitiesByState,
  getCurrencyByCountryCode,
  getCountryFlag,
  type Country,
} from '../lib/location-api';
import { logAdminActivity } from '../lib/admin-activity';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const GREEN = '#4CAF50';
const RED   = '#F44336';
const BLUE  = '#4A90E2';
const AMBER = '#FF9800';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

const ORG_PCT  = REVENUE_SHARE.organiserPercent / 100;     // 0.25
const PLAT_PCT = 1 - ORG_PCT;                              // 0.75

function tdsRate(country: string) { return country === 'IN' ? 0.10 : 0; }

// ── Types ─────────────────────────────────────────────────────────────────────

type PayoutStatus = 'pending' | 'paid' | 'held' | 'failed';
type PayMode      = 'UPI' | 'NEFT';
type StatusFilter = PayoutStatus | 'all';

interface PayoutRow {
  id:                   string;
  organiser_id:         string;
  event_id:             string;
  organiser_name:       string;
  company_name:         string;
  organiser_email:      string;
  pan_number:           string;
  upi_id:               string;
  bank_account:         string;
  account_holder_name:  string;
  ifsc_code:            string;
  country:              string;
  state:                string;
  city:                 string;
  event_title:          string;
  event_date:           string;
  participants_count:   number;
  gross_collected:      number;
  platform_share:       number;
  organiser_gross:      number;
  tds_rate:             number;
  tds_amount:           number;
  net_payable:          number;
  payment_mode:         PayMode;
  utr_reference:        string;
  payment_date:         string;
  status:               PayoutStatus;
  hold_reason:          string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}`; }

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_META: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#FFF7E0', color: '#7A5200'  },
  paid:    { bg: '#E6F9EE', color: '#1A7A40'  },
  held:    { bg: '#FEEBEE', color: '#B71C1C'  },
  failed:  { bg: '#FFE9E9', color: '#B71C1C'  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { bg: '#F0F0F0', color: '#666' };
  return <span style={{ ...s, fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', textTransform: 'capitalize' as const }}>{status}</span>;
}

function Btn({ label, color, onClick, disabled, small }: { label: string; color: string; onClick: () => void; disabled?: boolean; small?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ border: `1px solid ${color}`, color: hov && !disabled ? '#fff' : color, backgroundColor: hov && !disabled ? color : 'transparent', borderRadius: '8px', padding: small ? '4px 10px' : '8px 16px', fontSize: small ? '11px' : '12px', cursor: disabled ? 'default' : 'pointer', fontFamily: MONO, transition: 'all 0.15s', fontWeight: '600', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' as const }}>
      {label}
    </button>
  );
}

// ── PDF Statement ─────────────────────────────────────────────────────────────

function generateStatement(row: PayoutRow, monthLabel: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 20; const R = W - L;

  // Header band
  doc.setFillColor(12, 9, 4);
  doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(212, 168, 83);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('CANDID Clicks', L, 16);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 160, 120);
  doc.text('123, Tech Park, Bangalore - 560001 | GST: 29XXXXX0000X1ZX | guest@candidclicks.life', L, 25);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(212, 168, 83);
  doc.text('PAYOUT STATEMENT', L, 33);

  // Statement period + number
  let y = 48;
  doc.setTextColor(80, 80, 80); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Statement Period: ${monthLabel}`, L, y);
  doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, R, y, { align: 'right' });

  // Divider
  y += 6; doc.setDrawColor(220, 210, 195); doc.line(L, y, R, y);

  // Organiser box
  y += 8;
  doc.setFillColor(250, 248, 244); doc.rect(L, y, R - L, 30, 'F');
  doc.setTextColor(140, 130, 110); doc.setFontSize(8); doc.text('ORGANISER DETAILS', L + 4, y + 6);
  doc.setTextColor(12, 9, 4); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(row.organiser_name, L + 4, y + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text(`Company: ${row.company_name || '—'}`, L + 4, y + 18);
  doc.text(`PAN: ${row.pan_number || '—'}`, L + 4, y + 23);
  doc.text(`Email: ${row.organiser_email}`, L + 4, y + 28);

  // Event table
  y += 38;
  doc.setFillColor(12, 9, 4);
  doc.rect(L, y, R - L, 7, 'F');
  doc.setTextColor(212, 168, 83); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  const cols = [L + 2, 80, 110, 130, 148, 168];
  ['Event', 'Date', 'Guests', 'Gross', 'TDS', 'Net'].forEach((h, i) => doc.text(h, cols[i], y + 5));

  y += 9;
  doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setFillColor(252, 250, 247); doc.rect(L, y, R - L, 7, 'F');
  const truncTitle = row.event_title.length > 28 ? row.event_title.substring(0, 27) + '…' : row.event_title;
  doc.text(truncTitle, cols[0], y + 5);
  doc.text(fmtDate(row.event_date), cols[1], y + 5);
  doc.text(String(row.participants_count), cols[2], y + 5);
  doc.text(fmtINR(row.gross_collected), cols[3], y + 5);
  doc.text(fmtINR(row.tds_amount), cols[4], y + 5);
  doc.text(fmtINR(row.net_payable), cols[5], y + 5);

  // Summary box
  y += 18;
  doc.setFillColor(250, 248, 244); doc.rect(L, y, R - L, 50, 'F');
  doc.setTextColor(140, 130, 110); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT SUMMARY', L + 4, y + 6);

  const sumRows: [string, string][] = [
    ['Gross Revenue',       fmtINR(row.gross_collected)],
    [`Candid Platform Share (${Math.round(PLAT_PCT * 100)}%)`, fmtINR(row.platform_share)],
    [`Organiser Gross (${Math.round(ORG_PCT * 100)}%)`,          fmtINR(row.organiser_gross)],
    [`TDS Deducted (${Math.round(row.tds_rate * 100)}%)`,        fmtINR(row.tds_amount)],
    ['Net Payable',         fmtINR(row.net_payable)],
    ['UTR Reference',       row.utr_reference || '—'],
    ['Payment Date',        fmtDate(row.payment_date)],
    ['Payment Mode',        row.payment_mode || '—'],
  ];

  sumRows.forEach(([label, val], i) => {
    const sy = y + 12 + i * 5;
    const bold = i === 4;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(80, 80, 80); doc.setFontSize(9); doc.text(label, L + 4, sy);
    doc.setTextColor(bold ? 12 : 60, bold ? 9 : 60, bold ? 4 : 60); doc.text(val, R - 4, sy, { align: 'right' });
  });

  // Footer
  y = 260;
  doc.setDrawColor(220, 210, 195); doc.line(L, y, R, y);
  doc.setTextColor(140, 130, 110); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('This is a computer generated statement.', L, y + 6);
  doc.text('TDS certificate will be issued quarterly as per statutory requirements.', L, y + 11);
  doc.text('For queries: guest@candidclicks.life', L, y + 16);

  doc.save(`CandidClicks_Statement_${row.event_title.replace(/\s+/g,'_')}.pdf`);
}

// ── Excel Export ──────────────────────────────────────────────────────────────

function exportExcel(rows: PayoutRow[], month: number, year: number) {
  const data = rows.map(r => ({
    'Country':               r.country,
    'State':                 r.state,
    'City':                  r.city,
    'Organiser Name':        r.organiser_name,
    'Company Name':          r.company_name,
    'PAN Number':            r.pan_number,
    'Event Name':            r.event_title,
    'Event Date':            r.event_date,
    'Participants Count':    r.participants_count,
    'Gross Collected (INR)': Math.round(r.gross_collected),
    'Candid Share 75%':      Math.round(r.platform_share),
    'Organiser Gross 25%':   Math.round(r.organiser_gross),
    'TDS Rate (%)':          Math.round(r.tds_rate * 100),
    'TDS Amount (INR)':      Math.round(r.tds_amount),
    'GST Component':         0,
    'Net Payable (INR)':     Math.round(r.net_payable),
    'Payment Mode':          r.payment_mode,
    'Payment Status':        r.status.toUpperCase(),
    'UTR Reference':         r.utr_reference,
    'Payment Date':          r.payment_date,
    'Notes':                 r.hold_reason,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] || {}).map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Payouts');
  XLSX.writeFile(wb, `CandidClicks_Payouts_${MONTHS[month - 1]}_${year}.xlsx`);
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({ row, adminId, onClose, onPaid }: { row: PayoutRow; adminId: string; onClose: () => void; onPaid: () => void }) {
  const [mode,          setMode]         = useState<PayMode>(row.upi_id ? 'UPI' : 'NEFT');
  const [utr,           setUtr]          = useState('');
  const [payDate,       setPayDate]      = useState(new Date().toISOString().split('T')[0]);
  const [confirmed,     setConfirmed]    = useState(false);
  const [busy,          setBusy]         = useState(false);
  const [copied,        setCopied]       = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleConfirm = async () => {
    if (!utr.trim()) return;
    setBusy(true);
    await supabase.from('payouts').update({
      status: 'paid',
      utr_reference: utr,
      payment_date: payDate,
      payment_mode: mode,
      paid_at: new Date().toISOString(),
    }).eq('id', row.id);
    await supabase.from('organiser_notifications').insert({
      organiser_id: row.organiser_id,
      type: 'payout_completed',
      title: '💰 Payment Received',
      message: `Your payout of ${fmtINR(row.net_payable)} for ${row.event_title} has been transferred. UTR: ${utr}`,
      is_read: false,
    });
    generateStatement({ ...row, utr_reference: utr, payment_date: payDate, payment_mode: mode }, `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`);
    logAdminActivity(adminId, 'payout_paid', 'payout', row.id, { organiser: row.organiser_name, amount: row.net_payable, utr });
    setBusy(false);
    onPaid();
  };

  const inputS: React.CSSProperties = { padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px 32px', width: '480px', maxWidth: '95vw', boxShadow: '0 16px 56px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#0C0904' }}>Pay Now</div>
            <div style={{ fontSize: '12px', color: '#888', fontFamily: MONO, marginTop: '2px' }}>{row.organiser_name} · {row.company_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#bbb' }}>×</button>
        </div>

        {/* Amount breakdown */}
        <div style={{ backgroundColor: '#F5F3EF', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          {[
            ['Gross Revenue',             fmtINR(row.gross_collected), '#555'],
            [`Platform Share (${Math.round(PLAT_PCT*100)}%)`, `− ${fmtINR(row.platform_share)}`, '#888'],
            [`Organiser Gross (${Math.round(ORG_PCT*100)}%)`, fmtINR(row.organiser_gross), '#333'],
            [`TDS (${Math.round(row.tds_rate*100)}%)`,        `− ${fmtINR(row.tds_amount)}`, RED],
          ].map(([label, val, color]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: MONO, marginBottom: '6px' }}>
              <span style={{ color: '#888' }}>{label}</span>
              <span style={{ color: color as string }}>{val}</span>
            </div>
          ))}
          <div style={{ height: '1px', backgroundColor: '#E8E3DC', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0C0904' }}>Net Payable</span>
            <span style={{ fontSize: '16px', fontWeight: '700', color: GOLD }}>{fmtINR(row.net_payable)}</span>
          </div>
        </div>

        {/* Payment method toggle */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: '8px' }}>Payment Method</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['UPI', 'NEFT'] as PayMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px', border: `1px solid ${mode === m ? GOLD : '#E8E3DC'}`, borderRadius: '8px', backgroundColor: mode === m ? `${GOLD}18` : '#fff', color: mode === m ? GOLD : '#888', fontSize: '12px', fontWeight: mode === m ? '600' : '400', cursor: 'pointer', fontFamily: MONO }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Payment details */}
        {mode === 'UPI' && row.upi_id ? (
          <div style={{ marginBottom: '16px', padding: '12px 16px', border: '1px solid #E8E3DC', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '4px' }}>UPI ID</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', fontFamily: MONO, color: '#0C0904' }}>{row.upi_id}</span>
              <button onClick={() => copy(row.upi_id, 'upi')} style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${BLUE}`, borderRadius: '6px', color: BLUE, backgroundColor: 'transparent', cursor: 'pointer', fontFamily: MONO }}>
                {copied === 'upi' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '16px', padding: '12px 16px', border: '1px solid #E8E3DC', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '8px' }}>Bank Details</div>
            {[['Account Holder', row.account_holder_name], ['Account Number', row.bank_account], ['IFSC Code', row.ifsc_code]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: MONO, marginBottom: '4px' }}>
                <span style={{ color: '#888' }}>{l}</span>
                <span style={{ color: '#0C0904', fontWeight: '600' }}>{v || '—'}</span>
              </div>
            ))}
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => copy(`${row.account_holder_name} | ${row.bank_account} | ${row.ifsc_code}`, 'bank')} style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${BLUE}`, borderRadius: '6px', color: BLUE, backgroundColor: 'transparent', cursor: 'pointer', fontFamily: MONO }}>
                {copied === 'bank' ? '✓ Copied' : 'Copy Account Details'}
              </button>
            </div>
          </div>
        )}

        {/* Confirm transfer */}
        {!confirmed ? (
          <button onClick={() => setConfirmed(true)} style={{ width: '100%', padding: '12px', backgroundColor: '#0C0904', border: 'none', borderRadius: '10px', color: GOLD, fontFamily: MONO, fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
            I have made the transfer →
          </button>
        ) : (
          <div style={{ borderTop: '1px solid #E8E3DC', paddingTop: '16px' }}>
            <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: '8px' }}>Enter UTR / Transaction Reference</div>
            <input style={{ ...inputS, marginBottom: '10px' }} placeholder="UTR number or transaction ID" value={utr} onChange={e => setUtr(e.target.value)} />
            <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: '8px' }}>Date of Transfer</div>
            <input type="date" style={{ ...inputS, marginBottom: '16px' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
            <button onClick={handleConfirm} disabled={!utr.trim() || busy} style={{ width: '100%', padding: '12px', backgroundColor: GOLD, border: 'none', borderRadius: '10px', color: '#0C0904', fontFamily: MONO, fontWeight: '700', fontSize: '13px', cursor: utr.trim() ? 'pointer' : 'default', opacity: utr.trim() ? 1 : 0.5 }}>
              {busy ? 'Processing…' : 'Confirm Payment — Generate Statement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hold Modal ────────────────────────────────────────────────────────────────

function HoldModal({ row, adminId, onClose, onHeld }: { row: PayoutRow; adminId: string; onClose: () => void; onHeld: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleHold = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await supabase.from('payouts').update({ status: 'held', hold_reason: reason }).eq('id', row.id);
    await supabase.from('organiser_notifications').insert({
      organiser_id: row.organiser_id,
      type: 'payout_held',
      title: '⏸ Payout On Hold',
      message: `Your payout for ${row.event_title} is currently on hold. Reason: ${reason}. Contact guest@candidclicks.life`,
      is_read: false,
    });
    logAdminActivity(adminId, 'payout_held', 'payout', row.id, { organiser: row.organiser_name, reason });
    setBusy(false);
    onHeld();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px 32px', width: '420px', boxShadow: '0 16px 56px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#0C0904', marginBottom: '6px' }}>Hold Payout</div>
        <div style={{ fontSize: '12px', color: '#888', fontFamily: MONO, marginBottom: '20px' }}>{row.organiser_name} · {row.event_title}</div>
        <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: '8px' }}>Reason for Hold *</div>
        <textarea placeholder="Explain why this payout is being held…" value={reason} onChange={e => setReason(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, resize: 'vertical' as const, minHeight: '80px', marginBottom: '16px', boxSizing: 'border-box', color: '#333' }} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleHold} disabled={!reason.trim() || busy}
            style={{ flex: 1, padding: '10px', backgroundColor: RED, border: 'none', borderRadius: '8px', color: '#fff', fontFamily: MONO, fontWeight: '600', fontSize: '12px', cursor: reason.trim() ? 'pointer' : 'default', opacity: reason.trim() ? 1 : 0.5 }}>
            {busy ? 'Holding…' : '⏸ Hold Payout'}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', backgroundColor: '#F5F3EF', border: 'none', borderRadius: '8px', color: '#555', fontFamily: MONO, fontSize: '12px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const now = new Date();
  const [month,        setMonth]        = useState(now.getMonth() + 1);
  const [year,         setYear]         = useState(now.getFullYear());
  const [rows,         setRows]         = useState<PayoutRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [countryFilter,setCountryFilter]= useState('');
  const [stateFilter,  setStateFilter]  = useState('');
  const [cityFilter,   setCityFilter]   = useState('');
  const [orgSearch,    setOrgSearch]    = useState('');
  const [payModal,     setPayModal]     = useState<PayoutRow | null>(null);
  const [holdModal,    setHoldModal]    = useState<PayoutRow | null>(null);
  const [adminId,      setAdminId]      = useState('');

  const [allCountries, setAllCountries] = useState<Country[]>([]);
  const [allStates,    setAllStates]    = useState<string[]>([]);
  const [allCities,    setAllCities]    = useState<string[]>([]);
  const [currSymbol,   setCurrSymbol]   = useState('₹');

  // Load country list + admin id once
  useEffect(() => {
    getAllCountries().then(setAllCountries);
    import('../lib/admin-auth').then(({ getAdminUser }) => getAdminUser().then(u => { if (u) setAdminId(u.id); }));
  }, []);

  // Load states when country filter changes
  useEffect(() => {
    setStateFilter(''); setCityFilter(''); setAllStates([]); setAllCities([]);
    if (!countryFilter) { setCurrSymbol('₹'); return; }
    getStatesByCountry(countryFilter).then(setAllStates);
    getCurrencyByCountryCode(countryFilter).then(c => { if (c.symbol) setCurrSymbol(c.symbol); });
  }, [countryFilter]);

  // Load cities when state filter changes
  useEffect(() => {
    setCityFilter(''); setAllCities([]);
    if (!stateFilter) return;
    getCitiesByState(countryFilter, stateFilter).then(setAllCities);
  }, [stateFilter, countryFilter]);

  const FILTER_STATUSES: { label: string; value: StatusFilter }[] = [
    { label: 'All',     value: 'all'     },
    { label: 'Pending', value: 'pending' },
    { label: 'Paid',    value: 'paid'    },
    { label: 'Held',    value: 'held'    },
    { label: 'Failed',  value: 'failed'  },
  ];

  const loadPayouts = useCallback(async () => {
    setLoading(true);

    // Load all payouts
    const { data: pos } = await supabase
      .from('payouts')
      .select('id, event_id, organiser_id, amount, status, scheduled_date, utr_reference, payment_mode, hold_reason, paid_at, payment_date')
      .order('created_at', { ascending: false });

    if (!pos?.length) { setRows([]); setLoading(false); return; }

    const eventIds     = [...new Set(pos.map((p: any) => p.event_id).filter(Boolean))];
    const organiserIds = [...new Set(pos.map((p: any) => p.organiser_id).filter(Boolean))];

    // Batch queries
    const [{ data: events }, { data: users }, { data: kycs }, { data: parts }] = await Promise.all([
      supabase.from('events').select('id, title, date, country, state, city').in('id', eventIds),
      supabase.from('users').select('id, full_name, email').in('id', organiserIds),
      supabase.from('organiser_kyc').select('organiser_id, company_name, pan_number, upi_id, bank_account, account_holder_name, ifsc_code').in('organiser_id', organiserIds),
      supabase.from('participants').select('event_id, amount_paid').in('event_id', eventIds),
    ]);

    // Build lookup maps
    const eventMap: Record<string, any>  = {};
    (events ?? []).forEach((e: any) => { eventMap[e.id] = e; });

    const userMap: Record<string, any> = {};
    (users ?? []).forEach((u: any) => { userMap[u.id] = u; });

    const kycMap: Record<string, any> = {};
    (kycs ?? []).forEach((k: any) => { kycMap[k.organiser_id] = k; });

    const partsByEvent: Record<string, { count: number; gross: number }> = {};
    (parts ?? []).forEach((p: any) => {
      if (!partsByEvent[p.event_id]) partsByEvent[p.event_id] = { count: 0, gross: 0 };
      partsByEvent[p.event_id].count++;
      partsByEvent[p.event_id].gross += p.amount_paid ?? 0;
    });

    // Build rows
    const result: PayoutRow[] = pos.map((po: any) => {
      const ev  = eventMap[po.event_id]  ?? {};
      const usr = userMap[po.organiser_id] ?? {};
      const kyc = kycMap[po.organiser_id]  ?? {};
      const pt  = partsByEvent[po.event_id] ?? { count: 0, gross: 0 };

      const gross         = pt.gross;
      const orgGross      = gross * ORG_PCT;
      const platShare     = gross * PLAT_PCT;
      const tds           = tdsRate(ev.country ?? '');
      const tdsAmt        = orgGross * tds;
      const netPay        = orgGross - tdsAmt;
      const country       = ev.country ?? '';

      return {
        id:                   po.id,
        organiser_id:         po.organiser_id,
        event_id:             po.event_id,
        organiser_name:       usr.full_name ?? '—',
        company_name:         kyc.company_name ?? '—',
        organiser_email:      usr.email ?? '',
        pan_number:           kyc.pan_number ?? '',
        upi_id:               kyc.upi_id ?? '',
        bank_account:         kyc.bank_account ?? '',
        account_holder_name:  kyc.account_holder_name ?? '',
        ifsc_code:            kyc.ifsc_code ?? '',
        country,
        state:                ev.state ?? '',
        city:                 ev.city  ?? '',
        event_title:          ev.title ?? '—',
        event_date:           ev.date  ?? '',
        participants_count:   pt.count,
        gross_collected:      gross,
        platform_share:       platShare,
        organiser_gross:      orgGross,
        tds_rate:             tds,
        tds_amount:           tdsAmt,
        net_payable:          netPay,
        payment_mode:         (po.payment_mode ?? 'UPI') as PayMode,
        utr_reference:        po.utr_reference ?? '',
        payment_date:         po.payment_date ?? po.paid_at ?? '',
        status:               (po.status ?? 'pending') as PayoutStatus,
        hold_reason:          po.hold_reason ?? '',
      };
    });

    // Filter by month/year based on event_date
    const filtered = result.filter(r => {
      if (!r.event_date) return false;
      const d = new Date(r.event_date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });

    setRows(filtered);
    setLoading(false);
  }, [month, year]);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const handleRefresh = () => { setPayModal(null); setHoldModal(null); loadPayouts(); };

  // Filtered + searched view
  const visible = rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (countryFilter && r.country !== countryFilter) return false;
    if (stateFilter   && r.state   !== stateFilter)   return false;
    if (cityFilter    && r.city    !== cityFilter)     return false;
    if (orgSearch) {
      const q = orgSearch.toLowerCase();
      if (!r.organiser_name.toLowerCase().includes(q) && !r.company_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Monthly summary
  const totalGross  = visible.reduce((s, r) => s + r.gross_collected, 0);
  const totalOrgPay = visible.reduce((s, r) => s + r.organiser_gross, 0);
  const totalTDS    = visible.reduce((s, r) => s + r.tds_amount, 0);
  const totalNet    = visible.reduce((s, r) => s + r.net_payable, 0);

  const countriesInRows = [...new Set(rows.map(r => r.country).filter(Boolean))].sort();

  const inputS: React.CSSProperties = { padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff' };
  const thS: React.CSSProperties   = { padding: '10px 14px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase' as const, backgroundColor: '#F5F3EF', whiteSpace: 'nowrap' as const };
  const tdS: React.CSSProperties   = { padding: '11px 14px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle', whiteSpace: 'nowrap' as const };

  return (
    <AdminLayout pageTitle="Payouts" breadcrumb={`${MONTHS[month - 1]} ${year}`}>

      {/* Monthly summary cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { icon: '💰', label: 'Total Collected',         value: fmtINR(totalGross),  accent: true },
          { icon: '🤝', label: 'Total Payable to Org.',   value: fmtINR(totalOrgPay), accent: false },
          { icon: '🏛️', label: 'TDS to Hold',             value: fmtINR(totalTDS),    accent: false },
          { icon: '✅', label: 'Net to Transfer',          value: fmtINR(totalNet),    accent: true },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '160px' }}>
            <div style={{ fontSize: '22px', marginBottom: '10px' }}>{s.icon}</div>
            <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: s.accent ? GOLD : '#0C0904', lineHeight: 1, marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ ...CARD, marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: '12px' }}>
          {/* Month/year */}
          <select style={inputS} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select style={inputS} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Country */}
          <select style={inputS} value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">All Countries</option>
            {(allCountries.length > 0 ? allCountries.map(c => c.name) : countriesInRows).map(c => (
              <option key={c} value={c}>{getCountryFlag(allCountries.find(x => x.name === c)?.iso2 ?? '')} {c}</option>
            ))}
          </select>
          {/* State */}
          {allStates.length > 0 && (
            <select style={inputS} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="">All States</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* City */}
          {allCities.length > 0 && (
            <select style={inputS} value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
              <option value="">All Cities</option>
              {allCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* Org search */}
          <input style={{ ...inputS, flex: 1, minWidth: '180px' }} placeholder="Search organiser or company…" value={orgSearch} onChange={e => setOrgSearch(e.target.value)} />
          {/* Excel export */}
          <button onClick={() => exportExcel(visible, month, year)} style={{ ...inputS, backgroundColor: '#E6F9EE', color: '#1A7A40', border: '1px solid #A5D6A7', cursor: 'pointer', fontWeight: '600' }}>
            📊 Export for CA
          </button>
        </div>
        {/* Status pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          {FILTER_STATUSES.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${statusFilter === f.value ? GOLD : '#E8E3DC'}`, backgroundColor: statusFilter === f.value ? GOLD : 'transparent', color: statusFilter === f.value ? '#0C0904' : '#666', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, fontWeight: statusFilter === f.value ? '600' : '400', transition: 'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontFamily: MONO, fontSize: '13px' }}>Loading payouts…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' as const }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>💸</div>
            <div style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>No payouts found for {MONTHS[month - 1]} {year}.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Organiser', 'Location', 'Event', 'Date', 'Guests', 'Gross', 'Org 25%', 'TDS', 'Net', 'Mode', 'UTR', 'Status', 'Actions'].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <td style={tdS}>
                      <div style={{ fontWeight: '600', color: '#0C0904', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.organiser_name}</div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.company_name}</div>
                    </td>
                    <td style={tdS}>
                      <div style={{ fontSize: '11px', color: '#555' }}>{r.country}</div>
                      <div style={{ fontSize: '10px', color: '#aaa' }}>{r.city}</div>
                    </td>
                    <td style={{ ...tdS, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.event_title}</td>
                    <td style={tdS}>{fmtDate(r.event_date)}</td>
                    <td style={{ ...tdS, textAlign: 'center' as const }}>{r.participants_count}</td>
                    <td style={{ ...tdS, color: GOLD, fontWeight: '600' }}>{fmtINR(r.gross_collected)}</td>
                    <td style={tdS}>{fmtINR(r.organiser_gross)}</td>
                    <td style={{ ...tdS, color: '#888' }}>{r.tds_amount > 0 ? fmtINR(r.tds_amount) : '—'}</td>
                    <td style={{ ...tdS, color: GREEN, fontWeight: '600' }}>{fmtINR(r.net_payable)}</td>
                    <td style={tdS}>{r.payment_mode || '—'}</td>
                    <td style={{ ...tdS, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px', color: '#888' }}>{r.utr_reference || '—'}</td>
                    <td style={tdS}><StatusPill status={r.status} /></td>
                    <td style={tdS}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
                        {r.status === 'pending' && (
                          <Btn label="💰 Pay" color={GREEN} onClick={() => setPayModal(r)} small />
                        )}
                        {r.status === 'pending' && (
                          <Btn label="⏸ Hold" color={AMBER} onClick={() => setHoldModal(r)} small />
                        )}
                        {r.status === 'paid' && (
                          <Btn label="📄 Statement" color={BLUE} onClick={() => generateStatement(r, `${MONTHS[month - 1]} ${year}`)} small />
                        )}
                        {r.status === 'paid' && (
                          <Btn label="✅ Paid" color={GREEN} onClick={() => {}} small disabled />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {payModal  && <PaymentModal row={payModal}  adminId={adminId} onClose={() => setPayModal(null)}  onPaid={handleRefresh}  />}
      {holdModal && <HoldModal    row={holdModal} adminId={adminId} onClose={() => setHoldModal(null)} onHeld={handleRefresh} />}
    </AdminLayout>
  );
}
