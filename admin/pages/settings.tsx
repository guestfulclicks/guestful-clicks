import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

// ── Settings shape ─────────────────────────────────────────────────────────────

interface PlatformSettings {
  maintenance_mode: boolean;
  maintenance_message: string;
  min_app_version: string;
  reveal_private: 'host_custom' | 'auto_2h_after_end';
  reveal_public: 'host_custom' | 'auto_2h_after_end';
  allow_guest_signup: boolean;
  allow_organiser_signup: boolean;
  max_photos_per_event: number;
  support_email: string;
  platform_name: string;
}

function defaultSettings(): PlatformSettings {
  return {
    maintenance_mode: false,
    maintenance_message: 'We\'re making some improvements. Back shortly!',
    min_app_version: '1.0.0',
    reveal_private: 'host_custom',
    reveal_public: 'auto_2h_after_end',
    allow_guest_signup: true,
    allow_organiser_signup: true,
    max_photos_per_event: 500,
    support_email: 'support@guestfulclicks.com',
    platform_name: 'Guestful Clicks',
  };
}

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
    <button
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer',
        backgroundColor: value ? GOLD : '#DDD', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#FFF',
        position: 'absolute', top: '3px', left: value ? '23px' : '3px', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function SettingRow({
  label, sub, children,
}: { label: string; sub?: string; children: React.ReactNode }) {
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit]   = useState(false);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings());
  const [draft, setDraft]       = useState<PlatformSettings>(defaultSettings());
  const [savedMsg, setSavedMsg] = useState('');
  const [adminInfo, setAdminInfo] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setCanEdit(user.permissions.canEditSettings);
      setAdminInfo({ email: user.email, role: user.role });
      await loadSettings();
    };
    init();
  }, [navigate]);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'platform_settings')
      .single();

    const s: PlatformSettings = data?.value ? (data.value as PlatformSettings) : defaultSettings();
    setSettings(s);
    setDraft(s);
    setLoading(false);
  }, []);

  const handleEdit = () => {
    setDraft(JSON.parse(JSON.stringify(settings)));
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(settings)));
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: 'platform_settings', value: draft }, { onConflict: 'key' });

    if (!error) {
      setSettings(draft);
      setEditing(false);
      setSavedMsg('Settings saved.');
      setTimeout(() => setSavedMsg(''), 3000);
    }
    setSaving(false);
  };

  const set = (patch: Partial<PlatformSettings>) => setDraft(prev => ({ ...prev, ...patch }));

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #D4A853', borderRadius: '4px',
    fontSize: '12px', fontFamily: MONO, color: '#0C0904', backgroundColor: '#FDFCFA',
  };

  const readStyle: React.CSSProperties = {
    fontSize: '13px', color: '#333', fontFamily: MONO,
  };

  if (loading) return <AdminLayout pageTitle="Settings">Loading…</AdminLayout>;

  const s = editing ? draft : settings;

  return (
    <AdminLayout pageTitle="Settings">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Platform Settings</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>Global configuration for the Guestful Clicks platform.</p>
        </div>
        {canEdit && !editing && (
          <button onClick={handleEdit} style={{ padding: '9px 20px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
            Edit Settings
          </button>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCancel} style={{ padding: '9px 18px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>

      {savedMsg && (
        <div style={{ marginBottom: '16px', padding: '10px 16px', backgroundColor: '#E6F9EE', border: '1px solid #B2DFCC', borderRadius: '6px', fontSize: '13px', color: '#1A7A40', fontFamily: MONO }}>
          {savedMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Maintenance */}
        <div style={CARD}>
          <SectionTitle title="Maintenance Mode" sub="Enable to block all app traffic and show a maintenance screen to users." />

          {s.maintenance_mode && (
            <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: '#FFF3CD', border: '1px solid #FFCC02', borderRadius: '6px', fontSize: '12px', color: '#7A5200', fontFamily: MONO }}>
              ⚠ Maintenance mode is <strong>ON</strong>. Users cannot access the app.
            </div>
          )}

          <SettingRow label="Maintenance Mode" sub="Blocks the app for all users when enabled">
            <Toggle value={s.maintenance_mode} disabled={!editing} onChange={v => set({ maintenance_mode: v })} />
          </SettingRow>

          <SettingRow label="Maintenance Message" sub="Shown to users when maintenance mode is active">
            {editing ? (
              <input
                type="text"
                value={draft.maintenance_message}
                onChange={e => set({ maintenance_message: e.target.value })}
                style={{ ...inputStyle, width: '280px' }}
              />
            ) : (
              <span style={readStyle}>{s.maintenance_message}</span>
            )}
          </SettingRow>

          <SettingRow label="Minimum App Version" sub="Users on older versions are prompted to update">
            {editing ? (
              <input
                type="text"
                value={draft.min_app_version}
                onChange={e => set({ min_app_version: e.target.value })}
                style={{ ...inputStyle, width: '100px' }}
                placeholder="1.0.0"
              />
            ) : (
              <span style={readStyle}>{s.min_app_version}</span>
            )}
          </SettingRow>
        </div>

        {/* Reveal Rules */}
        <div style={CARD}>
          <SectionTitle title="Reveal Rules" sub="When are photos revealed to event guests and participants." />

          <SettingRow label="Private Event Reveal" sub="How the reveal time is determined for private (host-run) events">
            {editing ? (
              <select
                value={draft.reveal_private}
                onChange={e => set({ reveal_private: e.target.value as PlatformSettings['reveal_private'] })}
                style={inputStyle}
              >
                <option value="host_custom">Host Sets Custom Time</option>
                <option value="auto_2h_after_end">Auto 2h After Event End</option>
              </select>
            ) : (
              <span style={readStyle}>{s.reveal_private === 'host_custom' ? 'Host Sets Custom Time' : 'Auto 2h After Event End'}</span>
            )}
          </SettingRow>

          <SettingRow label="Public Event Reveal" sub="How the reveal time is determined for public (organiser-run) events">
            {editing ? (
              <select
                value={draft.reveal_public}
                onChange={e => set({ reveal_public: e.target.value as PlatformSettings['reveal_public'] })}
                style={inputStyle}
              >
                <option value="host_custom">Host Sets Custom Time</option>
                <option value="auto_2h_after_end">Auto 2h After Event End</option>
              </select>
            ) : (
              <span style={readStyle}>{s.reveal_public === 'host_custom' ? 'Host Sets Custom Time' : 'Auto 2h After Event End'}</span>
            )}
          </SettingRow>
        </div>

        {/* Signups & Limits */}
        <div style={CARD}>
          <SectionTitle title="Access & Limits" sub="Control who can sign up and what limits apply platform-wide." />

          <SettingRow label="Guest Signups" sub="Allow new users to register as event guests">
            <Toggle value={s.allow_guest_signup} disabled={!editing} onChange={v => set({ allow_guest_signup: v })} />
          </SettingRow>

          <SettingRow label="Organiser Signups" sub="Allow new organiser KYC applications">
            <Toggle value={s.allow_organiser_signup} disabled={!editing} onChange={v => set({ allow_organiser_signup: v })} />
          </SettingRow>

          <SettingRow label="Max Photos per Event" sub="Hard cap on total photos across all participants for any single event">
            {editing ? (
              <input
                type="number"
                value={draft.max_photos_per_event}
                min={1}
                onChange={e => set({ max_photos_per_event: Number(e.target.value) })}
                style={{ ...inputStyle, width: '80px' }}
              />
            ) : (
              <span style={readStyle}>{s.max_photos_per_event.toLocaleString('en-IN')}</span>
            )}
          </SettingRow>
        </div>

        {/* Platform Info */}
        <div style={CARD}>
          <SectionTitle title="Platform Info" sub="Display name and contact details used in notifications and emails." />

          <SettingRow label="Platform Name" sub="Displayed in emails, push notifications, and receipts">
            {editing ? (
              <input
                type="text"
                value={draft.platform_name}
                onChange={e => set({ platform_name: e.target.value })}
                style={{ ...inputStyle, width: '200px' }}
              />
            ) : (
              <span style={readStyle}>{s.platform_name}</span>
            )}
          </SettingRow>

          <SettingRow label="Support Email" sub="Displayed to users in error messages and help screens">
            {editing ? (
              <input
                type="email"
                value={draft.support_email}
                onChange={e => set({ support_email: e.target.value })}
                style={{ ...inputStyle, width: '220px' }}
              />
            ) : (
              <span style={readStyle}>{s.support_email}</span>
            )}
          </SettingRow>
        </div>

        {/* Session info (read-only) */}
        <div style={CARD}>
          <SectionTitle title="Your Session" sub="Information about the currently authenticated admin." />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            {[
              { label: 'Logged in as', value: adminInfo?.email ?? '—' },
              { label: 'Admin role',   value: adminInfo?.role.replace(/_/g, ' ') ?? '—' },
              { label: 'Can edit settings', value: canEdit ? 'Yes' : 'No' },
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
