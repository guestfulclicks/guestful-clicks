import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser, type AdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';
import { logAdminActivity } from '../lib/admin-activity';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlatformSettings {
  platform_name:          string;
  support_email:          string;
  max_photos_per_event:   number;
  default_shot_private:   number;
  reveal_delay_public_h:  number;
  maintenance_mode:       boolean;
  maintenance_message:    string;
  min_app_version:        string;
  allow_guest_signup:     boolean;
  allow_organiser_signup: boolean;
}

interface KycSettings {
  auto_approve_threshold: number;
  fraud_flag_threshold:   number;
  required_documents:     string[];
}

interface TdsRow {
  country: string;
  tds:     number;
  gst:     number;
  notes:   string;
}

interface PayoutSettings {
  payout_delay_days: number;
  payout_max_days:   number;
  tds_rate_india:    number;
  tds_rates:         TdsRow[];
}

interface DisclaimerVersion {
  text:       string;
  saved_by:   string;
  saved_at:   string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultPlatform(): PlatformSettings {
  return {
    platform_name:          'CANDID Clicks',
    support_email:          'guest@candidclicks.life',
    max_photos_per_event:   500,
    default_shot_private:   30,
    reveal_delay_public_h:  2,
    maintenance_mode:       false,
    maintenance_message:    "We're making some improvements. Back shortly!",
    min_app_version:        '1.0.0',
    allow_guest_signup:     true,
    allow_organiser_signup: true,
  };
}

function defaultKyc(): KycSettings {
  return {
    auto_approve_threshold: 85,
    fraud_flag_threshold:   30,
    required_documents: ['pan_scan', 'aadhaar_front', 'aadhaar_back', 'selfie', 'company_cert'],
  };
}

function defaultPayout(): PayoutSettings {
  return {
    payout_delay_days: 36,
    payout_max_days:   50,
    tds_rate_india:    10,
    tds_rates: [
      { country: 'IN', tds: 10, gst: 18, notes: 'Section 194H' },
    ],
  };
}

const ALL_DOCS = [
  { key: 'pan_scan',      label: 'PAN Card' },
  { key: 'aadhaar_front', label: 'Aadhaar Front' },
  { key: 'aadhaar_back',  label: 'Aadhaar Back' },
  { key: 'selfie',        label: 'Selfie with ID' },
  { key: 'company_cert',  label: 'Company Certificate' },
  { key: 'gst_cert',      label: 'GST Certificate' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0', fontFamily: MONO }}>{sub}</p>}
    </div>
  );
}

function Toggle({ value, disabled, onChange }: { value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => !disabled && onChange(!value)}
      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer', backgroundColor: value ? GOLD : '#DDD', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#FFF', position: 'absolute', top: '3px', left: value ? '23px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', padding: '14px 0', borderBottom: '1px solid #F5F3EF' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0C0904', fontFamily: MONO }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', fontFamily: MONO }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ── Disclaimer Editor ──────────────────────────────────────────────────────────

function DisclaimerEditor({ settingKey, title, sub, adminName }: { settingKey: string; title: string; sub: string; adminName: string }) {
  const [text,        setText]        = useState('');
  const [history,     setHistory]     = useState<DisclaimerVersion[]>([]);
  const [editing,     setEditing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [preview,     setPreview]     = useState(false);
  const [savedMsg,    setSavedMsg]    = useState('');
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    supabase.from('admin_settings').select('value').eq('key', settingKey).single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === 'object') {
          const obj = data.value as { text: string; history: DisclaimerVersion[] };
          setText(obj.text ?? '');
          setHistory(obj.history ?? []);
        } else if (typeof data?.value === 'string') {
          setText(data.value);
        }
        setLoading(false);
      });
  }, [settingKey]);

  const handleSave = async () => {
    setSaving(true);
    const newEntry: DisclaimerVersion = { text, saved_by: adminName, saved_at: new Date().toISOString() };
    const newHistory = [newEntry, ...history].slice(0, 5);
    await supabase.from('admin_settings').upsert({ key: settingKey, value: { text, history: newHistory } }, { onConflict: 'key' });
    setHistory(newHistory);
    setEditing(false);
    setSaving(false);
    setSavedMsg('Saved.'); setTimeout(() => setSavedMsg(''), 3000);
  };

  if (loading) return <div style={CARD}><div style={{ color: '#bbb', fontFamily: MONO, fontSize: '12px' }}>Loading…</div></div>;

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <SectionTitle title={title} sub={sub} />
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setPreview(p => !p)} style={{ padding: '7px 14px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO }}>
            {preview ? 'Hide Preview' : 'Preview'}
          </button>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{ padding: '7px 14px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>Edit</button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} style={{ padding: '7px 12px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '7px 14px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {savedMsg && <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: '#E6F9EE', border: '1px solid #B2DFCC', borderRadius: '6px', fontSize: '12px', color: '#1A7A40', fontFamily: MONO }}>{savedMsg}</div>}

      {editing ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ width: '100%', minHeight: '140px', padding: '12px 14px', border: '1px solid #D4A853', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, color: '#0C0904', boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#aaa', fontFamily: MONO, marginTop: '4px' }}>{text.length} characters</div>
        </>
      ) : (
        <div style={{ fontSize: '13px', color: '#444', fontFamily: MONO, lineHeight: 1.6, padding: '12px 14px', backgroundColor: '#F5F3EF', borderRadius: '8px' }}>
          {text || <span style={{ color: '#bbb' }}>No disclaimer text set.</span>}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#0C0904', borderRadius: '12px' }}>
          <div style={{ fontSize: '11px', color: GOLD, fontFamily: MONO, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>App Preview</div>
          <div style={{ fontSize: '13px', color: 'rgba(240,232,213,0.8)', fontFamily: MONO, lineHeight: 1.6 }}>{text || '—'}</div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Version History</div>
          {history.slice(0, 3).map((v, i) => (
            <div key={i} style={{ padding: '10px 12px', backgroundColor: '#F5F3EF', borderRadius: '8px', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '4px' }}>
                {v.saved_by} · {new Date(v.saved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: '12px', color: '#555', fontFamily: MONO, lineHeight: 1.4, overflow: 'hidden', maxHeight: '48px', textOverflow: 'ellipsis' }}>{v.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const [admin,       setAdmin]       = useState<AdminUser | null>(null);
  const [canEdit,     setCanEdit]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [savedMsg,    setSavedMsg]    = useState('');

  // Platform settings
  const [platEdit,    setPlatEdit]    = useState(false);
  const [platSaving,  setPlatSaving]  = useState(false);
  const [platform,    setPlatform]    = useState<PlatformSettings>(defaultPlatform());
  const [platDraft,   setPlatDraft]   = useState<PlatformSettings>(defaultPlatform());

  // KYC settings
  const [kycEdit,     setKycEdit]     = useState(false);
  const [kycSaving,   setKycSaving]   = useState(false);
  const [kyc,         setKyc]         = useState<KycSettings>(defaultKyc());
  const [kycDraft,    setKycDraft]    = useState<KycSettings>(defaultKyc());

  // Payout settings
  const [payEdit,     setPayEdit]     = useState(false);
  const [paySaving,   setPaySaving]   = useState(false);
  const [payout,      setPayout]      = useState<PayoutSettings>(defaultPayout());
  const [payDraft,    setPayDraft]    = useState<PayoutSettings>(defaultPayout());

  // New TDS row form
  const [newTds, setNewTds] = useState<TdsRow>({ country: '', tds: 0, gst: 0, notes: '' });

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #D4A853', borderRadius: '4px',
    fontSize: '12px', fontFamily: MONO, color: '#0C0904', backgroundColor: '#FDFCFA',
  };
  const readStyle: React.CSSProperties = { fontSize: '13px', color: '#333', fontFamily: MONO };

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setAdmin(user);
      setCanEdit(user.permissions.canEditSettings);

      const [{ data: platData }, { data: kycData }, { data: payData }] = await Promise.all([
        supabase.from('admin_settings').select('value').eq('key', 'platform_settings').single(),
        supabase.from('admin_settings').select('value').eq('key', 'kyc_settings').single(),
        supabase.from('admin_settings').select('value').eq('key', 'payout_settings').single(),
      ]);

      const p = platData?.value ? (platData.value as PlatformSettings) : defaultPlatform();
      setPlatform(p); setPlatDraft(p);

      const k = kycData?.value ? (kycData.value as KycSettings) : defaultKyc();
      setKyc(k); setKycDraft(k);

      const py = payData?.value ? (payData.value as PayoutSettings) : defaultPayout();
      setPayout(py); setPayDraft(py);

      setLoading(false);
    };
    init();
  }, [navigate]);

  const savePlatform = async () => {
    if (!admin) return;
    setPlatSaving(true);
    const { error } = await supabase.from('admin_settings').upsert({ key: 'platform_settings', value: platDraft }, { onConflict: 'key' });
    if (!error) {
      setPlatform(platDraft);
      setPlatEdit(false);
      setSavedMsg('Platform settings saved.');
      setTimeout(() => setSavedMsg(''), 3000);
      logAdminActivity(admin.id, 'settings_changed', 'platform_settings');
    }
    setPlatSaving(false);
  };

  const saveKyc = async () => {
    if (!admin) return;
    setKycSaving(true);
    const { error } = await supabase.from('admin_settings').upsert({ key: 'kyc_settings', value: kycDraft }, { onConflict: 'key' });
    if (!error) {
      setKyc(kycDraft);
      setKycEdit(false);
      setSavedMsg('KYC settings saved.');
      setTimeout(() => setSavedMsg(''), 3000);
      logAdminActivity(admin.id, 'settings_changed', 'kyc_settings');
    }
    setKycSaving(false);
  };

  const savePayout = async () => {
    if (!admin) return;
    setPaySaving(true);
    const { error } = await supabase.from('admin_settings').upsert({ key: 'payout_settings', value: payDraft }, { onConflict: 'key' });
    if (!error) {
      setPayout(payDraft);
      setPayEdit(false);
      setSavedMsg('Payout settings saved.');
      setTimeout(() => setSavedMsg(''), 3000);
      logAdminActivity(admin.id, 'settings_changed', 'payout_settings');
    }
    setPaySaving(false);
  };

  const addTdsRow = () => {
    if (!newTds.country.trim()) return;
    setPayDraft(d => ({ ...d, tds_rates: [...d.tds_rates, { ...newTds }] }));
    setNewTds({ country: '', tds: 0, gst: 0, notes: '' });
  };

  const removeTdsRow = (i: number) =>
    setPayDraft(d => ({ ...d, tds_rates: d.tds_rates.filter((_, idx) => idx !== i) }));

  const toggleDoc = (docKey: string) => {
    setKycDraft(d => ({
      ...d,
      required_documents: d.required_documents.includes(docKey)
        ? d.required_documents.filter(k => k !== docKey)
        : [...d.required_documents, docKey],
    }));
  };

  if (loading) return <AdminLayout pageTitle="Settings">Loading…</AdminLayout>;

  const ps = platEdit ? platDraft : platform;
  const ks = kycEdit  ? kycDraft  : kyc;
  const py = payEdit  ? payDraft  : payout;

  const thS: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase', backgroundColor: '#F5F3EF' };
  const tdS: React.CSSProperties = { padding: '9px 12px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  return (
    <AdminLayout pageTitle="Settings">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Platform Settings</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>Global configuration for the CANDID Clicks platform.</p>
        </div>
      </div>

      {savedMsg && (
        <div style={{ marginBottom: '16px', padding: '10px 16px', backgroundColor: '#E6F9EE', border: '1px solid #B2DFCC', borderRadius: '6px', fontSize: '13px', color: '#1A7A40', fontFamily: MONO }}>
          {savedMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ── Organiser Disclaimer ── */}
        {admin && (
          <DisclaimerEditor
            settingKey="organiser_disclaimer"
            title="Organiser Disclaimer"
            sub="Shown on the KYC signup screen before submission."
            adminName={admin.full_name || admin.email}
          />
        )}

        {/* ── Payout Disclaimer ── */}
        {admin && (
          <DisclaimerEditor
            settingKey="payout_disclaimer"
            title="Payout Policy Disclaimer"
            sub="Shown in Step 5 of the organiser signup flow."
            adminName={admin.full_name || admin.email}
          />
        )}

        {/* ── Platform Settings ── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <SectionTitle title="Platform Settings" sub="Core app configuration, access controls, and limits." />
            {canEdit && !platEdit && (
              <button onClick={() => { setPlatDraft(JSON.parse(JSON.stringify(platform))); setPlatEdit(true); }}
                style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
                Edit
              </button>
            )}
            {platEdit && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setPlatEdit(false)} style={{ padding: '7px 12px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
                <button onClick={savePlatform} disabled={platSaving} style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                  {platSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {ps.maintenance_mode && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#FFF3CD', border: '1px solid #FFCC02', borderRadius: '6px', fontSize: '12px', color: '#7A5200', fontFamily: MONO }}>
              ⚠ Maintenance mode is <strong>ON</strong>. Users cannot access the app.
            </div>
          )}

          <SettingRow label="Maintenance Mode" sub="Blocks the app for all users when enabled">
            <Toggle value={ps.maintenance_mode} disabled={!platEdit} onChange={v => setPlatDraft(d => ({ ...d, maintenance_mode: v }))} />
          </SettingRow>
          <SettingRow label="Maintenance Message" sub="Shown to users when maintenance mode is active">
            {platEdit
              ? <input type="text" value={platDraft.maintenance_message} onChange={e => setPlatDraft(d => ({ ...d, maintenance_message: e.target.value }))} style={{ ...inputStyle, width: '280px' }} />
              : <span style={readStyle}>{ps.maintenance_message}</span>}
          </SettingRow>
          <SettingRow label="Guest Signups" sub="Allow new users to register as event guests">
            <Toggle value={ps.allow_guest_signup} disabled={!platEdit} onChange={v => setPlatDraft(d => ({ ...d, allow_guest_signup: v }))} />
          </SettingRow>
          <SettingRow label="Organiser Signups" sub="Allow new organiser KYC applications">
            <Toggle value={ps.allow_organiser_signup} disabled={!platEdit} onChange={v => setPlatDraft(d => ({ ...d, allow_organiser_signup: v }))} />
          </SettingRow>
          <SettingRow label="Platform Name" sub="Displayed in emails, push notifications, and receipts">
            {platEdit
              ? <input type="text" value={platDraft.platform_name} onChange={e => setPlatDraft(d => ({ ...d, platform_name: e.target.value }))} style={{ ...inputStyle, width: '200px' }} />
              : <span style={readStyle}>{ps.platform_name}</span>}
          </SettingRow>
          <SettingRow label="Support Email" sub="Displayed to users in error messages and help screens">
            {platEdit
              ? <input type="email" value={platDraft.support_email} onChange={e => setPlatDraft(d => ({ ...d, support_email: e.target.value }))} style={{ ...inputStyle, width: '220px' }} />
              : <span style={readStyle}>{ps.support_email}</span>}
          </SettingRow>
          <SettingRow label="Max Photos per Event" sub="Hard cap on total photos for any single event">
            {platEdit
              ? <input type="number" value={platDraft.max_photos_per_event} min={1} onChange={e => setPlatDraft(d => ({ ...d, max_photos_per_event: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
              : <span style={readStyle}>{ps.max_photos_per_event.toLocaleString('en-IN')}</span>}
          </SettingRow>
          <SettingRow label="Default Shot Limit (Private)" sub="Default shots per guest for private events">
            {platEdit
              ? <input type="number" value={platDraft.default_shot_private} min={1} onChange={e => setPlatDraft(d => ({ ...d, default_shot_private: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
              : <span style={readStyle}>{ps.default_shot_private} shots</span>}
          </SettingRow>
          <SettingRow label="Reveal Delay Public (hours)" sub="Auto-reveal delay after event ends for public events">
            {platEdit
              ? <input type="number" value={platDraft.reveal_delay_public_h} min={0} onChange={e => setPlatDraft(d => ({ ...d, reveal_delay_public_h: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
              : <span style={readStyle}>{ps.reveal_delay_public_h}h</span>}
          </SettingRow>
          <SettingRow label="Minimum App Version" sub="Users on older versions are prompted to update">
            {platEdit
              ? <input type="text" value={platDraft.min_app_version} onChange={e => setPlatDraft(d => ({ ...d, min_app_version: e.target.value }))} style={{ ...inputStyle, width: '100px' }} placeholder="1.0.0" />
              : <span style={readStyle}>{ps.min_app_version}</span>}
          </SettingRow>
        </div>

        {/* ── KYC Settings ── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <SectionTitle title="KYC Settings" sub="Thresholds and required documents for organiser verification." />
            {canEdit && !kycEdit && (
              <button onClick={() => { setKycDraft(JSON.parse(JSON.stringify(kyc))); setKycEdit(true); }}
                style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
                Edit
              </button>
            )}
            {kycEdit && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setKycEdit(false)} style={{ padding: '7px 12px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
                <button onClick={saveKyc} disabled={kycSaving} style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                  {kycSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <SettingRow label="Auto-Approve Threshold" sub="AI score ≥ this value triggers automatic approval">
            {kycEdit
              ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" value={kycDraft.auto_approve_threshold} min={0} max={100} onChange={e => setKycDraft(d => ({ ...d, auto_approve_threshold: Number(e.target.value) }))} style={{ ...inputStyle, width: '70px' }} />
                  <span style={{ color: '#888', fontFamily: MONO, fontSize: '12px' }}>/ 100</span>
                </div>
              : <span style={readStyle}>{ks.auto_approve_threshold} / 100</span>}
          </SettingRow>
          <SettingRow label="Fraud Flag Threshold" sub="Risk score ≥ this value triggers a fraud flag">
            {kycEdit
              ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" value={kycDraft.fraud_flag_threshold} min={0} max={100} onChange={e => setKycDraft(d => ({ ...d, fraud_flag_threshold: Number(e.target.value) }))} style={{ ...inputStyle, width: '70px' }} />
                  <span style={{ color: '#888', fontFamily: MONO, fontSize: '12px' }}>/ 100</span>
                </div>
              : <span style={readStyle}>{ks.fraud_flag_threshold} / 100</span>}
          </SettingRow>

          <div style={{ padding: '14px 0', borderBottom: '1px solid #F5F3EF' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, marginBottom: '10px' }}>Required Documents</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ALL_DOCS.map(doc => {
                const isRequired = ks.required_documents.includes(doc.key);
                return (
                  <button key={doc.key}
                    onClick={() => kycEdit && toggleDoc(doc.key)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontFamily: MONO, fontWeight: '600',
                      border: isRequired ? 'none' : '1px solid #DDD',
                      backgroundColor: isRequired ? GOLD : '#F5F3EF',
                      color: isRequired ? '#0C0904' : '#888',
                      cursor: kycEdit ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                    }}>
                    {isRequired ? '✓ ' : ''}{doc.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Payout Settings ── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <SectionTitle title="Payout Settings" sub="TDS rates, processing windows, and per-country tax rules." />
            {canEdit && !payEdit && (
              <button onClick={() => { setPayDraft(JSON.parse(JSON.stringify(payout))); setPayEdit(true); }}
                style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
                Edit
              </button>
            )}
            {payEdit && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setPayEdit(false)} style={{ padding: '7px 12px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
                <button onClick={savePayout} disabled={paySaving} style={{ padding: '7px 16px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                  {paySaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <SettingRow label="Payout Delay Days" sub="Days after event before payout is eligible">
            {payEdit
              ? <input type="number" value={payDraft.payout_delay_days} min={0} onChange={e => setPayDraft(d => ({ ...d, payout_delay_days: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
              : <span style={readStyle}>{py.payout_delay_days} days</span>}
          </SettingRow>
          <SettingRow label="Payout Max Days" sub="Deadline day by which payout must be processed">
            {payEdit
              ? <input type="number" value={payDraft.payout_max_days} min={0} onChange={e => setPayDraft(d => ({ ...d, payout_max_days: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
              : <span style={readStyle}>{py.payout_max_days} days</span>}
          </SettingRow>
          <SettingRow label="TDS Rate India %" sub="Default TDS deduction for Indian organisers (Section 194H)">
            {payEdit
              ? <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="number" value={payDraft.tds_rate_india} min={0} max={100} onChange={e => setPayDraft(d => ({ ...d, tds_rate_india: Number(e.target.value) }))} style={{ ...inputStyle, width: '70px' }} />
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#888' }}>%</span>
                </div>
              : <span style={readStyle}>{py.tds_rate_india}%</span>}
          </SettingRow>

          {/* TDS per country table */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, marginBottom: '12px' }}>TDS / GST by Country</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Country', 'TDS %', 'GST %', 'Notes', payEdit ? 'Remove' : ''].filter(Boolean).map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {py.tds_rates.map((row, i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, fontWeight: '600' }}>{row.country}</td>
                      <td style={tdS}>
                        {payEdit ? <input type="number" value={payDraft.tds_rates[i]?.tds ?? 0} min={0} max={100} onChange={e => setPayDraft(d => ({ ...d, tds_rates: d.tds_rates.map((r, ri) => ri === i ? { ...r, tds: Number(e.target.value) } : r) }))} style={{ ...inputStyle, width: '60px' }} /> : `${row.tds}%`}
                      </td>
                      <td style={tdS}>
                        {payEdit ? <input type="number" value={payDraft.tds_rates[i]?.gst ?? 0} min={0} max={100} onChange={e => setPayDraft(d => ({ ...d, tds_rates: d.tds_rates.map((r, ri) => ri === i ? { ...r, gst: Number(e.target.value) } : r) }))} style={{ ...inputStyle, width: '60px' }} /> : `${row.gst}%`}
                      </td>
                      <td style={{ ...tdS, color: '#888' }}>
                        {payEdit ? <input type="text" value={payDraft.tds_rates[i]?.notes ?? ''} onChange={e => setPayDraft(d => ({ ...d, tds_rates: d.tds_rates.map((r, ri) => ri === i ? { ...r, notes: e.target.value } : r) }))} style={{ ...inputStyle, width: '140px' }} /> : row.notes}
                      </td>
                      {payEdit && (
                        <td style={tdS}>
                          <button onClick={() => removeTdsRow(i)} style={{ background: 'none', border: 'none', color: '#FF6B6B', cursor: 'pointer', fontSize: '14px', fontFamily: MONO }}>✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {payEdit && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Country code (e.g. AE)" value={newTds.country} maxLength={3} onChange={e => setNewTds(d => ({ ...d, country: e.target.value.toUpperCase() }))} style={{ ...inputStyle, width: '120px' }} />
                <input type="number" placeholder="TDS %" value={newTds.tds || ''} min={0} max={100} onChange={e => setNewTds(d => ({ ...d, tds: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
                <input type="number" placeholder="GST %" value={newTds.gst || ''} min={0} max={100} onChange={e => setNewTds(d => ({ ...d, gst: Number(e.target.value) }))} style={{ ...inputStyle, width: '80px' }} />
                <input type="text" placeholder="Notes" value={newTds.notes} onChange={e => setNewTds(d => ({ ...d, notes: e.target.value }))} style={{ ...inputStyle, width: '160px' }} />
                <button onClick={addTdsRow} disabled={!newTds.country.trim()} style={{ padding: '7px 14px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: newTds.country.trim() ? 'pointer' : 'default', opacity: newTds.country.trim() ? 1 : 0.5, fontFamily: MONO }}>
                  Add Row
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Session info */}
        <div style={CARD}>
          <SectionTitle title="Your Session" sub="Information about the currently authenticated admin." />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            {[
              { label: 'Logged in as',      value: admin?.email ?? '—' },
              { label: 'Admin role',         value: admin?.role.replace(/_/g, ' ') ?? '—' },
              { label: 'Can edit settings',  value: canEdit ? 'Yes' : 'No' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, minWidth: '160px', backgroundColor: '#F5F3EF', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: MONO, marginBottom: '6px' }}>{item.label}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, textTransform: 'capitalize' as const }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
