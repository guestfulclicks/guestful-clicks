import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD   = '#D4A853';
const SERIF  = '"Playfair Display", serif';
const MONO   = '"DM Mono", monospace';
const GREEN  = '#4CAF50';
const RED    = '#F44336';
const AMBER  = '#FF9800';
const PURPLE = '#9C27B0';
const BLUE   = '#4A90E2';
const CARD   = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type KycStatus = 'all' | 'pending' | 'flagged' | 'approved' | 'rejected' | 'pending_resubmit';

interface KYCRow {
  id:                    string;
  organiser_id:          string;
  company_name:          string;
  company_type:          string;
  gst_number:            string;
  pan_number:            string;
  aadhaar_number:        string;
  upi_id:                string;
  bank_account:          string;
  account_holder_name:   string;
  contact_person_1_name:   string;
  contact_person_1_mobile: string;
  contact_person_1_email:  string;
  contact_person_2_name:   string;
  contact_person_2_mobile: string;
  contact_person_2_email:  string;
  contact_person_3_name:   string;
  contact_person_3_mobile: string;
  contact_person_3_email:  string;
  office_address_line_1: string;
  office_city:           string;
  office_state:          string;
  office_pincode:        string;
  ai_verification_score: number;
  ai_document_results:   any[];
  ai_fraud_flags:        string[];
  ai_fraud_risk_score:   number;
  verification_status:   string;
  submission_date:       string;
  created_at:            string;
  disclaimer_accepted:   boolean;
  digital_signature:     string;
  organiser_name:        string;
  organiser_email:       string;
  doc_count:             number;
}

interface DocUrl {
  key:   string;
  label: string;
  url:   string | null;
  confidence: number;
  valid: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scoreColor(score: number) {
  if (score >= 80) return GREEN;
  if (score >= 60) return AMBER;
  return RED;
}

function riskColor(score: number) {
  if (score <= 20) return GREEN;
  if (score <= 50) return AMBER;
  return RED;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Pending',         color: AMBER,  bg: '#FFF3E0' },
  flagged:          { label: 'Flagged',         color: RED,    bg: '#FEEBEE' },
  approved:         { label: 'Approved',        color: GREEN,  bg: '#E8F5E9' },
  rejected:         { label: 'Rejected',        color: RED,    bg: '#FEEBEE' },
  pending_resubmit: { label: 'Needs Resubmit',  color: PURPLE, bg: '#F3E5F5' },
};

const DOC_KEYS = [
  { key: 'pan_scan',             label: 'PAN Card'              },
  { key: 'aadhaar_front',        label: 'Aadhaar Front'         },
  { key: 'aadhaar_back',         label: 'Aadhaar Back'          },
  { key: 'cheque',               label: 'Bank Cheque'           },
  { key: 'address_proof_front',  label: 'Address Proof Front'   },
  { key: 'address_proof_back',   label: 'Address Proof Back'    },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#888', bg: '#F0F0F0' };
  return (
    <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', backgroundColor: meta.bg, color: meta.color, textTransform: 'capitalize' as const, whiteSpace: 'nowrap' as const }}>
      {meta.label}
    </span>
  );
}

function ScoreBadge({ score, colorFn }: { score: number; colorFn: (n: number) => string }) {
  const color = colorFn(score);
  return (
    <span style={{ fontSize: '12px', fontWeight: '700', color, fontFamily: MONO, padding: '2px 8px', borderRadius: '6px', backgroundColor: color + '22', border: `1px solid ${color}55` }}>
      {score}%
    </span>
  );
}

function Btn({ label, color, onClick, disabled, small }: { label: string; color: string; onClick: () => void; disabled?: boolean; small?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ border: `1px solid ${color}`, color: hov && !disabled ? '#fff' : color, backgroundColor: hov && !disabled ? color : 'transparent', borderRadius: '8px', padding: small ? '5px 12px' : '8px 16px', fontSize: small ? '11px' : '12px', cursor: disabled ? 'default' : 'pointer', fontFamily: MONO, transition: 'all 0.15s', fontWeight: '600', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' as const }}>
      {label}
    </button>
  );
}

// ── KYC Detail Panel ──────────────────────────────────────────────────────────

const KYC_TABS = ['Comparison', 'Documents', 'Fraud Signals', 'Company Details', 'Actions'] as const;
type KycTab = typeof KYC_TABS[number];

const RESUBMIT_DOCS = [
  { key: 'pan',           label: 'PAN Card'             },
  { key: 'aadhaar',       label: 'Aadhaar (front+back)' },
  { key: 'bank',          label: 'Bank Cheque'          },
  { key: 'address_proof', label: 'Address Proof'        },
];

function KYCDetailPanel({ kyc, onClose, onRefresh }: { kyc: KYCRow; onClose: () => void; onRefresh: () => void }) {
  const [tab,     setTab]     = useState<KycTab>('Comparison');
  const [docs,    setDocs]    = useState<DocUrl[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [msg,     setMsg]     = useState('');
  const [isError, setIsError] = useState(false);

  // Resubmit state
  const [resubDocs, setResubDocs]   = useState<string[]>([]);
  const [resubNote, setResubNote]   = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const REJECT_REASONS = ['Documents unclear/unreadable', 'PAN name mismatch', 'Aadhaar details mismatch', 'Suspected fraud', 'Incomplete submission', 'Other'];

  useEffect(() => {
    if (tab === 'Documents') loadDocs();
  }, [tab]);

  const loadDocs = async () => {
    setDocsLoading(true);
    const results: DocUrl[] = await Promise.all(
      DOC_KEYS.map(async ({ key, label }) => {
        const path = `${kyc.organiser_id}/${key}.jpg`;
        const { data } = await supabase.storage.from('kyc-documents').createSignedUrl(path, 3600);
        const aiResult = (kyc.ai_document_results ?? []).find((r: any) => r.documentType === key);
        return { key, label, url: data?.signedUrl ?? null, confidence: aiResult?.confidence ?? 0, valid: aiResult?.valid ?? false };
      })
    );
    setDocs(results);
    setDocsLoading(false);
  };

  const flash = (m: string, error = false) => { setMsg(m); setIsError(error); setTimeout(() => setMsg(''), 3500); };

  const handleApprove = async () => {
    setBusy(true);
    const { error } = await supabase.from('organiser_kyc').update({ verification_status: 'approved' }).eq('id', kyc.id);
    if (!error) {
      await Promise.all([
        supabase.from('organiser_notifications').insert({ organiser_id: kyc.organiser_id, type: 'kyc_approved', title: '✅ KYC Approved', message: 'Your KYC verification is complete. You can now create events.', is_read: false }),
        supabase.from('admin_notifications').update({ is_read: true }).eq('organiser_id', kyc.organiser_id).eq('type', 'kyc_flagged'),
      ]);
      flash('KYC approved and organiser notified.');
      onRefresh();
    } else {
      flash(error.message, true);
    }
    setBusy(false);
  };

  const handleResubmit = async () => {
    if (!resubDocs.length) { flash('Select at least one document to resubmit.', true); return; }
    setBusy(true);
    const docList = resubDocs.map(d => RESUBMIT_DOCS.find(r => r.key === d)?.label).filter(Boolean).join(', ');
    const { error } = await supabase.from('organiser_kyc').update({ verification_status: 'pending_resubmit' }).eq('id', kyc.id);
    if (!error) {
      await supabase.from('organiser_notifications').insert({ organiser_id: kyc.organiser_id, type: 'kyc_resubmit_requested', title: '📋 Documents Required', message: `Please resubmit: ${docList}. ${resubNote || ''}`.trim(), is_read: false });
      flash('Resubmission requested and organiser notified.');
      onRefresh();
    } else {
      flash(error.message, true);
    }
    setBusy(false);
  };

  const handleReject = async () => {
    if (!rejectReason) { flash('Select a rejection reason.', true); return; }
    setBusy(true);
    const { error } = await supabase.from('organiser_kyc').update({ verification_status: 'rejected' }).eq('id', kyc.id);
    if (!error) {
      await supabase.from('organiser_notifications').insert({ organiser_id: kyc.organiser_id, type: 'kyc_rejected', title: '❌ KYC Rejected', message: `${rejectReason}. ${rejectNote || ''}`.trim(), is_read: false });
      flash('KYC rejected and organiser notified.');
      onRefresh();
    } else {
      flash(error.message, true);
    }
    setBusy(false);
  };

  const rowS: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #F5F3EF', gap: '12px' };
  const labelS: React.CSSProperties = { fontSize: '11px', color: '#888', fontFamily: MONO, flexShrink: 0, width: '140px', paddingTop: '1px' };
  const valS: React.CSSProperties   = { fontSize: '12px', color: '#0C0904', fontFamily: MONO, fontWeight: '500', flex: 1, wordBreak: 'break-word' as const };

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Document" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '20px', right: '24px', background: 'none', border: 'none', color: '#fff', fontSize: '32px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '600px', backgroundColor: '#fff', boxShadow: '-4px 0 32px rgba(0,0,0,0.16)', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8E3DC', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '4px' }}>{kyc.company_name || '—'}</div>
              <div style={{ fontSize: '12px', color: '#888', fontFamily: MONO }}>{kyc.organiser_name} · {kyc.organiser_email}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#bbb', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <StatusPill status={kyc.verification_status} />
            <ScoreBadge score={kyc.ai_verification_score} colorFn={scoreColor} />
            {kyc.ai_fraud_flags?.length > 0 && <span style={{ fontSize: '11px', color: RED, fontFamily: MONO }}>⚠️ {kyc.ai_fraud_flags.length} fraud flag{kyc.ai_fraud_flags.length > 1 ? 's' : ''}</span>}
            <span style={{ fontSize: '11px', color: '#888', fontFamily: MONO }}>Submitted {fmtDate(kyc.submission_date || kyc.created_at)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E3DC', backgroundColor: '#FAFAF8', flexShrink: 0, overflowX: 'auto' as const }}>
          {KYC_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '11px 14px', background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t ? GOLD : '#888', fontSize: '11px', cursor: 'pointer', fontFamily: MONO, fontWeight: tab === t ? '600' : '400', marginBottom: '-1px', whiteSpace: 'nowrap' as const, transition: 'color 0.15s', flexShrink: 0 }}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {msg && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, backgroundColor: isError ? '#FEEBEE' : '#E8F5E9', color: isError ? RED : '#1A7A40', border: `1px solid ${isError ? '#FFCDD2' : '#A5D6A7'}` }}>
              {msg}
            </div>
          )}

          {/* ── Comparison View ── */}
          {tab === 'Comparison' && (
            <div>
              {(kyc.ai_document_results ?? []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#bbb', fontSize: '13px', padding: '32px 0', fontFamily: MONO }}>No AI scan results available.</div>
              ) : (
                (kyc.ai_document_results ?? []).map((result: any, ri: number) => (
                  <div key={ri} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: `2px solid ${GOLD}33` }}>
                      <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', textTransform: 'capitalize' as const }}>{(result.documentType ?? '').replace(/_/g, ' ')}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <ScoreBadge score={result.confidence ?? 0} colorFn={scoreColor} />
                        <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', backgroundColor: result.valid ? '#E8F5E9' : '#FEEBEE', color: result.valid ? GREEN : RED }}>
                          {result.valid ? '✓ Valid' : '✗ Invalid'}
                        </span>
                      </div>
                    </div>
                    {(result.crossCheckResults ?? []).length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#bbb', fontFamily: MONO }}>No cross-check data.</div>
                    ) : (
                      (result.crossCheckResults ?? []).map((check: any, ci: number) => (
                        <div key={ci} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '8px', marginBottom: '6px', backgroundColor: check.matched ? '#E8F5E920' : '#FEEBEE20', border: `1px solid ${check.matched ? '#A5D6A755' : '#FFCDD255'}` }}>
                          <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{check.matched ? '✅' : '🔴'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.8px', fontFamily: MONO, marginBottom: '3px' }}>{check.field}</div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa', fontFamily: MONO }}>Typed</div>
                                <div style={{ fontSize: '12px', color: '#0C0904', fontFamily: MONO, fontWeight: '500' }}>{check.typed || '—'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa', fontFamily: MONO }}>Extracted</div>
                                <div style={{ fontSize: '12px', color: '#0C0904', fontFamily: MONO, fontWeight: '500' }}>{check.extracted || '—'}</div>
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: check.similarity >= 80 ? GREEN : check.similarity >= 60 ? AMBER : RED, fontFamily: MONO, flexShrink: 0 }}>
                            {check.similarity ?? 0}%
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {tab === 'Documents' && (
            docsLoading
              ? <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', fontFamily: MONO, padding: '32px 0' }}>Loading documents…</div>
              : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {docs.map(d => (
                    <div key={d.key} style={{ border: '1px solid #E8E3DC', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#FAFAF8' }}>
                      {d.url ? (
                        <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setLightbox(d.url!)}>
                          <img src={d.url} alt={d.label} style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '10px', backgroundColor: d.valid ? GREEN : RED, color: '#fff' }}>
                            {d.valid ? '✓ Valid' : '✗ Invalid'}
                          </div>
                        </div>
                      ) : (
                        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3EF', fontSize: '13px', color: '#bbb', fontFamily: MONO }}>
                          Not uploaded
                        </div>
                      )}
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, marginBottom: '4px' }}>{d.label}</div>
                        {d.confidence > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: '#888', fontFamily: MONO }}>AI confidence</span>
                            <ScoreBadge score={d.confidence} colorFn={scoreColor} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── Fraud Signals ── */}
          {tab === 'Fraud Signals' && (
            <div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
                <div style={{ ...CARD, flex: 1, minWidth: '120px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Fraud Risk Score</div>
                  <div style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', color: riskColor(kyc.ai_fraud_risk_score ?? 0) }}>{kyc.ai_fraud_risk_score ?? 0}%</div>
                </div>
                <div style={{ ...CARD, flex: 1, minWidth: '120px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Flags Detected</div>
                  <div style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', color: (kyc.ai_fraud_flags?.length ?? 0) > 0 ? RED : GREEN }}>{kyc.ai_fraud_flags?.length ?? 0}</div>
                </div>
              </div>

              {(kyc.ai_fraud_flags?.length ?? 0) === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', border: '1px solid #A5D6A7', borderRadius: '12px', backgroundColor: '#E8F5E9' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '14px', color: '#1A7A40', fontFamily: MONO, fontWeight: '600' }}>No fraud signals detected</div>
                  <div style={{ fontSize: '12px', color: '#4CAF50', fontFamily: MONO, marginTop: '4px' }}>AI verification passed all fraud checks</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {kyc.ai_fraud_flags.map((flag, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px', borderRadius: '10px', backgroundColor: '#FEEBEE', border: '1px solid #FFCDD2' }}>
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: RED, fontFamily: MONO }}>Flag #{i + 1}</div>
                        <div style={{ fontSize: '13px', color: '#B71C1C', fontFamily: MONO, marginTop: '2px' }}>{flag}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Company Details ── */}
          {tab === 'Company Details' && (
            <div>
              <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', marginBottom: '12px', paddingBottom: '8px', borderBottom: `2px solid ${GOLD}33` }}>Business Information</div>
              {([
                ['Company Name',    kyc.company_name],
                ['Company Type',    kyc.company_type],
                ['GST Number',      kyc.gst_number],
                ['PAN Number',      kyc.pan_number],
                ['Aadhaar Number',  kyc.aadhaar_number],
                ['Account Holder',  kyc.account_holder_name],
                ['Bank Account',    kyc.bank_account],
                ['UPI ID',          kyc.upi_id],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} style={rowS}>
                  <span style={labelS}>{label}</span>
                  <span style={valS}>{val || '—'}</span>
                </div>
              ))}

              <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', margin: '20px 0 12px', paddingBottom: '8px', borderBottom: `2px solid ${GOLD}33` }}>Office Address</div>
              <div style={rowS}>
                <span style={labelS}>Address</span>
                <span style={valS}>{[kyc.office_address_line_1, kyc.office_city, kyc.office_state, kyc.office_pincode].filter(Boolean).join(', ') || '—'}</span>
              </div>

              {[1, 2, 3].map(n => {
                const name   = (kyc as any)[`contact_person_${n}_name`];
                const mobile = (kyc as any)[`contact_person_${n}_mobile`];
                const email  = (kyc as any)[`contact_person_${n}_email`];
                if (!name && !mobile && !email) return null;
                return (
                  <div key={n}>
                    <div style={{ fontFamily: SERIF, fontSize: '13px', fontWeight: '700', color: '#555', margin: '20px 0 10px', paddingBottom: '6px', borderBottom: '1px solid #E8E3DC' }}>Contact Person {n}</div>
                    {([['Name', name], ['Mobile', mobile], ['Email', email]] as [string, string][]).map(([l, v]) => (
                      <div key={l} style={rowS}>
                        <span style={labelS}>{l}</span>
                        <span style={valS}>{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', margin: '20px 0 12px', paddingBottom: '8px', borderBottom: `2px solid ${GOLD}33` }}>Declaration</div>
              <div style={rowS}>
                <span style={labelS}>Disclaimer Accepted</span>
                <span style={{ ...valS, color: kyc.disclaimer_accepted ? GREEN : RED }}>{kyc.disclaimer_accepted ? 'Yes ✓' : 'No ✗'}</span>
              </div>
              <div style={rowS}>
                <span style={labelS}>Digital Signature</span>
                <span style={valS}>{kyc.digital_signature || '—'}</span>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          {tab === 'Actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Approve */}
              <div style={{ ...CARD, padding: '16px', borderColor: '#A5D6A7' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1A7A40', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Approve KYC</div>
                <div style={{ fontSize: '12px', color: '#555', fontFamily: MONO, marginBottom: '12px' }}>Approve this organiser's KYC. They will receive a push notification and can immediately start creating events.</div>
                <Btn label={busy ? '…' : '✅ Approve KYC'} color={GREEN} onClick={handleApprove} disabled={busy || kyc.verification_status === 'approved'} />
              </div>

              {/* Request Resubmission */}
              <div style={{ ...CARD, padding: '16px', borderColor: '#FFE0B2' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#E65100', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Request Resubmission</div>
                <div style={{ fontSize: '12px', color: '#555', fontFamily: MONO, marginBottom: '12px' }}>Select which documents need to be resubmitted:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {RESUBMIT_DOCS.map(d => (
                    <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px', fontFamily: MONO, color: '#333' }}>
                      <input type="checkbox" checked={resubDocs.includes(d.key)} onChange={e => setResubDocs(prev => e.target.checked ? [...prev, d.key] : prev.filter(k => k !== d.key))} style={{ width: '14px', height: '14px', accentColor: GOLD, cursor: 'pointer' }} />
                      {d.label}
                    </label>
                  ))}
                </div>
                <textarea placeholder="Additional note for organiser (optional)…" value={resubNote} onChange={e => setResubNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, resize: 'vertical' as const, minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box', color: '#333' }} />
                <Btn label={busy ? '…' : '📋 Request Resubmission'} color={AMBER} onClick={handleResubmit} disabled={busy} />
              </div>

              {/* Reject */}
              <div style={{ ...CARD, padding: '16px', borderColor: '#FFCDD2' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#B71C1C', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Reject KYC</div>
                <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #FFCDD2', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff', marginBottom: '10px', boxSizing: 'border-box' }}>
                  <option value="">Select rejection reason…</option>
                  {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <textarea placeholder="Additional note (optional)…" value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '12px', fontFamily: MONO, resize: 'vertical' as const, minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box', color: '#333' }} />
                <Btn label={busy ? '…' : '❌ Reject KYC'} color={RED} onClick={handleReject} disabled={busy} />
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function KYCReviewPage() {
  const [kycs,       setKycs]      = useState<KYCRow[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [selected,   setSelected]  = useState<KYCRow | null>(null);
  const [statusTab,  setStatusTab] = useState<KycStatus>('all');

  const STATUS_TABS: { label: string; value: KycStatus }[] = [
    { label: 'All',            value: 'all'             },
    { label: 'Pending',        value: 'pending'         },
    { label: 'Flagged',        value: 'flagged'         },
    { label: 'Approved',       value: 'approved'        },
    { label: 'Rejected',       value: 'rejected'        },
    { label: 'Needs Resubmit', value: 'pending_resubmit'},
  ];

  const loadKYCs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organiser_kyc')
      .select('*, organiser:organiser_id(full_name, email)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setKycs(data.map((k: any) => ({
        ...k,
        organiser_name:  k.organiser?.full_name ?? '—',
        organiser_email: k.organiser?.email ?? '—',
        doc_count: DOC_KEYS.length,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadKYCs(); }, [loadKYCs]);

  const handleRefresh = () => { setSelected(null); loadKYCs(); };

  const counts: Record<string, number> = { pending: 0, flagged: 0, approved: 0, rejected: 0, pending_resubmit: 0 };
  kycs.forEach(k => { if (counts[k.verification_status] !== undefined) counts[k.verification_status]++; });

  const filtered = statusTab === 'all' ? kycs : kycs.filter(k => k.verification_status === statusTab);

  const thS: React.CSSProperties = { padding: '10px 14px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', letterSpacing: '1.2px', color: '#888', textTransform: 'uppercase' as const, backgroundColor: '#F5F3EF', whiteSpace: 'nowrap' as const };
  const tdS: React.CSSProperties = { padding: '12px 14px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  return (
    <AdminLayout pageTitle="KYC Review">

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Pending',        value: counts.pending,          color: AMBER  },
          { label: 'Flagged',        value: counts.flagged,          color: RED    },
          { label: 'Approved',       value: counts.approved,         color: GREEN  },
          { label: 'Rejected',       value: counts.rejected,         color: RED    },
          { label: 'Needs Resubmit', value: counts.pending_resubmit, color: PURPLE },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, flex: 1, minWidth: '100px' }}>
            <div style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: s.color, lineHeight: 1, marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Status tab filter */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '1px solid #E8E3DC' }}>
        {STATUS_TABS.map(t => (
          <button key={t.value} onClick={() => setStatusTab(t.value)}
            style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: statusTab === t.value ? `2px solid ${GOLD}` : '2px solid transparent', color: statusTab === t.value ? GOLD : '#888', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, fontWeight: statusTab === t.value ? '600' : '400', marginBottom: '-1px', whiteSpace: 'nowrap' as const, transition: 'color 0.15s' }}>
            {t.label}
            {t.value !== 'all' && counts[t.value] > 0 && (
              <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: statusTab === t.value ? GOLD : '#E8E3DC', color: statusTab === t.value ? '#0C0904' : '#666', padding: '1px 6px', borderRadius: '10px', fontWeight: '600' }}>
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px', fontFamily: MONO }}>Loading KYC applications…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' as const }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '14px', color: '#888', fontFamily: MONO }}>No {statusTab === 'all' ? '' : statusTab} KYC applications.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Company', 'Organiser', 'Submitted', 'AI Score', 'Risk', 'Flags', 'Status', ''].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(k => (
                  <tr key={k.id}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <td style={{ ...tdS, fontWeight: '600', color: '#0C0904', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.company_name || '—'}</td>
                    <td style={tdS}>
                      <div style={{ fontWeight: '500', color: '#333' }}>{k.organiser_name}</div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{k.organiser_email}</div>
                    </td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' as const }}>{fmtDate(k.submission_date || k.created_at)}</td>
                    <td style={tdS}><ScoreBadge score={k.ai_verification_score ?? 0} colorFn={scoreColor} /></td>
                    <td style={tdS}><ScoreBadge score={k.ai_fraud_risk_score ?? 0} colorFn={riskColor} /></td>
                    <td style={{ ...tdS, color: (k.ai_fraud_flags?.length ?? 0) > 0 ? RED : '#888', fontWeight: (k.ai_fraud_flags?.length ?? 0) > 0 ? '600' : '400' }}>
                      {k.ai_fraud_flags?.length ?? 0}
                    </td>
                    <td style={tdS}><StatusPill status={k.verification_status} /></td>
                    <td style={tdS}>
                      <Btn label="Review" color={BLUE} onClick={() => setSelected(k)} small />
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
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 199 }} onClick={() => setSelected(null)} />
          <KYCDetailPanel kyc={selected} onClose={() => setSelected(null)} onRefresh={handleRefresh} />
        </>
      )}
    </AdminLayout>
  );
}
