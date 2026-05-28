import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/admin-layout';
import { supabase } from '../lib/supabase';
import { getAdminUser, type AdminUser } from '../lib/admin-auth';
import { logAdminActivity } from '../lib/admin-activity';
import { getAllCountries, getCountryFlag, type Country } from '../lib/location-api';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' } as React.CSSProperties;
const INPUT = { width: '100%', padding: '10px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, color: '#0C0904', outline: 'none', backgroundColor: '#FAFAF8', boxSizing: 'border-box' } as React.CSSProperties;
const SELECT = { ...INPUT, cursor: 'pointer' } as React.CSSProperties;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Package {
  id: string;
  name: string;
  description: string | null;
  shots: number;
  price_per_person: number;
  is_featured: boolean;
  is_active: boolean;
  event_type: string;
  country_code: string;
  user_type: string | null;
  valid_from: string | null;
  valid_to: string | null;
  sort_order: number;
  created_at: string;
}

type FormState = Omit<Package, 'id' | 'created_at'>;

interface Filters {
  country:   string;
  userType:  string;
  eventType: string;
  status:    string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  name: '', description: '', shots: 10, price_per_person: 149,
  is_featured: false, is_active: true, event_type: 'travel',
  country_code: 'IN', user_type: null, valid_from: null, valid_to: null, sort_order: 0,
};

const USER_TYPE_LABELS: Record<string, string> = {
  '':             'All Users',
  host:           'Host',
  organiser:      'Event Organiser',
  travel_agent:   'Travel Agent',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  private: 'Private',
  public:  'Public',
  travel:  'Travel',
  both:    'Both',
};

const USER_TYPE_COLORS: Record<string, string> = {
  host:         '#5B8AF0',
  organiser:    '#9B59B6',
  travel_agent: GOLD,
  '':           '#888',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  private: '#5B8AF0',
  public:  '#4CAF50',
  travel:  GOLD,
  both:    '#FF9800',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[m - 1]} ${y}`;
}

function seasonalStatus(pkg: Package): { label: string; color: string } {
  const now = Date.now();
  if (pkg.valid_from) {
    const from = new Date(pkg.valid_from).getTime();
    if (from > now) {
      const days = Math.ceil((from - now) / 86400000);
      return { label: `Active in ${days}d`, color: '#5B8AF0' };
    }
  }
  if (pkg.valid_to) {
    const to = new Date(pkg.valid_to).getTime();
    if (to < now) return { label: 'Expired', color: '#999' };
    const days = Math.ceil((to - now) / 86400000);
    return { label: `Expires in ${days}d`, color: '#FF9800' };
  }
  return { label: 'Active', color: '#4CAF50' };
}

// ── Pill ───────────────────────────────────────────────────────────────────────

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: '11px', fontFamily: MONO, color, border: `1px solid ${color}60`, borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{ width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer', backgroundColor: checked ? '#4CAF50' : '#ccc', position: 'relative', transition: 'background 0.2s', opacity: disabled ? 0.5 : 1, flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: '3px', left: checked ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

// ── Form field helpers ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '11px', fontFamily: MONO, color: '#888', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Package Form Modal ─────────────────────────────────────────────────────────

interface PackageFormModalProps {
  initial:   FormState | null;
  countries: Country[];
  onSave:    (form: FormState) => Promise<void>;
  onClose:   () => void;
  saving:    boolean;
}

function PackageFormModal({ initial, countries, onSave, onClose, saving }: PackageFormModalProps) {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ backgroundColor: '#0C0904', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#F0E8D5', margin: 0 }}>
            {initial ? 'Edit Package' : 'New Package'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          <Field label="Package Name *">
            <input style={INPUT} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Explorer" maxLength={80} />
          </Field>

          <Field label="Description">
            <textarea style={{ ...INPUT, minHeight: '72px', resize: 'vertical' } as React.CSSProperties}
              value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)}
              placeholder="Great for weekend getaways and short tours." />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field label="Shots per person *">
              <input style={INPUT} type="number" required min={1} max={9999} value={form.shots}
                onChange={(e) => set('shots', parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label="Price (₹) *">
              <input style={INPUT} type="number" required min={0} value={form.price_per_person}
                onChange={(e) => set('price_per_person', parseInt(e.target.value, 10) || 0)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field label="Country *">
              <select style={SELECT} required value={form.country_code} onChange={(e) => set('country_code', e.target.value)}>
                {countries.map((c) => (
                  <option key={c.iso2} value={c.iso2}>{getCountryFlag(c.iso2)} {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Event Type *">
              <select style={SELECT} required value={form.event_type} onChange={(e) => set('event_type', e.target.value)}>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="User Type">
            <select style={SELECT} value={form.user_type ?? ''} onChange={(e) => set('user_type', e.target.value || null)}>
              {Object.entries(USER_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field label="Valid From (optional)">
              <input style={INPUT} type="date" value={form.valid_from ?? ''}
                onChange={(e) => set('valid_from', e.target.value || null)} />
            </Field>
            <Field label="Valid To (optional)">
              <input style={INPUT} type="date" value={form.valid_to ?? ''}
                onChange={(e) => set('valid_to', e.target.value || null)} />
            </Field>
          </div>

          <Field label="Sort Order">
            <input style={INPUT} type="number" min={0} value={form.sort_order}
              onChange={(e) => set('sort_order', parseInt(e.target.value, 10) || 0)} />
          </Field>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <Toggle checked={form.is_featured} onChange={() => set('is_featured', !form.is_featured)} />
              <span style={{ fontFamily: MONO, fontSize: '13px', color: '#0C0904' }}>⭐ Featured (POPULAR badge)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <Toggle checked={form.is_active} onChange={() => set('is_active', !form.is_active)} />
              <span style={{ fontFamily: MONO, fontSize: '13px', color: '#0C0904' }}>Active</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #E8E3DC' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #E8E3DC', borderRadius: '8px', background: '#fff', fontSize: '13px', fontFamily: MONO, cursor: 'pointer', color: '#666' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', backgroundColor: saving ? '#e0c47a' : GOLD, border: 'none', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, fontWeight: '600', cursor: saving ? 'default' : 'pointer', color: '#0C0904' }}>
              {saving ? 'Saving…' : 'Save Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────

function DeleteModal({ pkg, adminRole, onSoftDelete, onHardDelete, onClose, saving }: {
  pkg: Package; adminRole: string;
  onSoftDelete: () => void; onHardDelete: () => void;
  onClose: () => void; saving: boolean;
}) {
  const [typed, setTyped] = useState('');
  const confirmed = typed === pkg.name;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}>

        <div style={{ backgroundColor: '#FEF2F2', padding: '20px 24px', borderBottom: '1px solid #FECACA' }}>
          <h3 style={{ fontFamily: SERIF, fontSize: '18px', color: '#991B1B', margin: '0 0 4px' }}>Delete Package</h3>
          <p style={{ fontFamily: MONO, fontSize: '12px', color: '#666', margin: 0 }}>This action affects all travel agents using this package.</p>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontFamily: MONO, fontSize: '13px', color: '#0C0904', margin: 0 }}>
            Type <strong>{pkg.name}</strong> to confirm:
          </p>
          <input style={INPUT} value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={pkg.name} autoFocus />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button disabled={!confirmed || saving} onClick={onSoftDelete}
              style={{ padding: '11px', backgroundColor: confirmed ? '#FF9800' : '#F5F5F5', border: 'none', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, fontWeight: '600', cursor: confirmed && !saving ? 'pointer' : 'default', color: confirmed ? '#fff' : '#bbb', transition: 'background 0.15s' }}>
              🔒 Deactivate (Soft Delete)
            </button>
            {adminRole === 'super_admin' && (
              <button disabled={!confirmed || saving} onClick={onHardDelete}
                style={{ padding: '11px', backgroundColor: confirmed ? '#DC2626' : '#F5F5F5', border: 'none', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, fontWeight: '600', cursor: confirmed && !saving ? 'pointer' : 'default', color: confirmed ? '#fff' : '#bbb', transition: 'background 0.15s' }}>
                🗑 Permanently Delete (Super Admin)
              </button>
            )}
            <button onClick={onClose} style={{ padding: '11px', backgroundColor: '#fff', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, cursor: 'pointer', color: '#666' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Seasonal Section ───────────────────────────────────────────────────────────

function SeasonalSection({ packages, canEdit, onToggle }: {
  packages: Package[]; canEdit: boolean; onToggle: (pkg: Package) => void;
}) {
  const seasonal = [...packages]
    .filter((p) => p.valid_from || p.valid_to)
    .sort((a, b) => (a.valid_from ?? '').localeCompare(b.valid_from ?? ''));

  if (seasonal.length === 0) return null;

  return (
    <div style={{ ...CARD, marginTop: '24px' }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: '0 0 4px' }}>
        Seasonal & Festive Packages
      </h3>
      <p style={{ fontFamily: MONO, fontSize: '12px', color: '#888', margin: '0 0 20px' }}>
        Packages with a validity window. Sorted by start date.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {seasonal.map((pkg) => {
          const ss = seasonalStatus(pkg);
          return (
            <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', border: '1px solid #E8E3DC', borderRadius: '10px', backgroundColor: '#FAFAF8', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: '700', color: '#0C0904', marginBottom: '3px' }}>
                  {pkg.is_featured && <span style={{ marginRight: '5px' }}>⭐</span>}{pkg.name}
                </div>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#888' }}>
                  {fmtDate(pkg.valid_from)} → {fmtDate(pkg.valid_to)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: GOLD, fontWeight: '600' }}>
                  📷 {pkg.shots} shots · ₹{pkg.price_per_person}
                </span>
                <span style={{ fontSize: '12px', fontFamily: MONO, color: ss.color, fontWeight: '600', backgroundColor: `${ss.color}18`, borderRadius: '20px', padding: '3px 10px', border: `1px solid ${ss.color}40` }}>
                  {ss.label}
                </span>
                {canEdit && (
                  <Toggle checked={pkg.is_active} onChange={() => onToggle(pkg)} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const [admin,     setAdmin]     = useState<AdminUser | null>(null);
  const [packages,  setPackages]  = useState<Package[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [filters, setFilters] = useState<Filters>({ country: '', userType: '', eventType: '', status: '' });

  const [modalOpen,   setModalOpen]   = useState(false);
  const [editPkg,     setEditPkg]     = useState<Package | null>(null);
  const [deletePkg,   setDeletePkg]   = useState<Package | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadPackages = useCallback(async () => {
    const { data } = await supabase
      .from('packages')
      .select('id, name, description, shots, price_per_person, is_featured, is_active, event_type, country_code, user_type, valid_from, valid_to, sort_order, created_at')
      .order('sort_order', { ascending: true });
    setPackages((data ?? []) as Package[]);
  }, []);

  useEffect(() => {
    (async () => {
      const [user, ctries] = await Promise.all([getAdminUser(), getAllCountries()]);
      setAdmin(user);
      // Always put IN first
      const sorted = [
        ...(ctries.filter((c) => c.iso2 === 'IN')),
        ...(ctries.filter((c) => c.iso2 !== 'IN').sort((a, b) => a.name.localeCompare(b.name))),
      ];
      setCountries(sorted);
      await loadPackages();
      setLoading(false);
    })();
  }, [loadPackages]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = packages.filter((pkg) => {
    if (filters.country   && pkg.country_code !== filters.country)   return false;
    if (filters.userType  && pkg.user_type !== filters.userType)      return false;
    if (filters.eventType && pkg.event_type !== filters.eventType)    return false;
    if (filters.status === 'active'   && !pkg.is_active)             return false;
    if (filters.status === 'inactive' &&  pkg.is_active)             return false;
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    totalActive:  packages.filter((p) => p.is_active).length,
    travel:       packages.filter((p) => p.is_active && p.event_type === 'travel').length,
    public:       packages.filter((p) => p.is_active && p.event_type === 'public').length,
    seasonal:     packages.filter((p) => p.is_active && (p.valid_from || p.valid_to)).length,
  };

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const canEdit = !!(admin?.permissions as any)?.canEditPricing;

  const handleSave = async (form: FormState) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editPkg) {
        const { error } = await supabase.from('packages').update(form).eq('id', editPkg.id);
        if (error) throw error;
        logAdminActivity(admin!.id, 'update_package', 'package', editPkg.id, { name: form.name });
      } else {
        const { error } = await supabase.from('packages').insert(form);
        if (error) throw error;
        logAdminActivity(admin!.id, 'create_package', 'package', undefined, { name: form.name });
      }
      await loadPackages();
      setModalOpen(false);
      setEditPkg(null);
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (pkg: Package) => {
    await supabase.from('packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id);
    logAdminActivity(admin!.id, pkg.is_active ? 'deactivate_package' : 'activate_package', 'package', pkg.id);
    setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, is_active: !p.is_active } : p));
  };

  const handleSoftDelete = async () => {
    if (!deletePkg) return;
    setSaving(true);
    await supabase.from('packages').update({ is_active: false }).eq('id', deletePkg.id);
    logAdminActivity(admin!.id, 'soft_delete_package', 'package', deletePkg.id, { name: deletePkg.name });
    await loadPackages();
    setDeletePkg(null);
    setSaving(false);
  };

  const handleHardDelete = async () => {
    if (!deletePkg) return;
    setSaving(true);
    await supabase.from('packages').delete().eq('id', deletePkg.id);
    logAdminActivity(admin!.id, 'hard_delete_package', 'package', deletePkg.id, { name: deletePkg.name });
    await loadPackages();
    setDeletePkg(null);
    setSaving(false);
  };

  // ── Table styles ──────────────────────────────────────────────────────────

  const thS: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase', backgroundColor: '#F5F3EF', fontFamily: MONO, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const tdS: React.CSSProperties = { padding: '11px 14px', fontSize: '13px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', verticalAlign: 'middle' };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout pageTitle="Packages & Tiers" breadcrumb="Pricing → Packages">

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: MONO, fontSize: '13px', color: '#888', margin: '0 0 4px' }}>
            Manage shot packages per country. Control pricing for all user types.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditPkg(null); setSaveError(null); setModalOpen(true); }}
            style={{ padding: '10px 20px', backgroundColor: GOLD, border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: MONO, fontWeight: '600', cursor: 'pointer', color: '#0C0904', whiteSpace: 'nowrap' }}>
            ＋ New Package
          </button>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Active Packages',          value: stats.totalActive,  icon: '📦' },
          { label: 'Travel Agent Packages',     value: stats.travel,       icon: '✈️' },
          { label: 'Public Event Packages',     value: stats.public,       icon: '🎪' },
          { label: 'Seasonal / Festive',        value: stats.seasonal,     icon: '🎉' },
        ].map((s) => (
          <div key={s.label} style={{ ...CARD, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '20px' }}>{s.icon}</span>
            <span style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: GOLD, lineHeight: 1 }}>{s.value}</span>
            <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888', letterSpacing: '0.3px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ ...CARD, padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...SELECT, width: '160px' }} value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}>
          <option value="">🌍 All Countries</option>
          {countries.map((c) => <option key={c.iso2} value={c.iso2}>{getCountryFlag(c.iso2)} {c.iso2}</option>)}
        </select>

        <select style={{ ...SELECT, width: '160px' }} value={filters.userType} onChange={(e) => setFilters((f) => ({ ...f, userType: e.target.value }))}>
          <option value="">👤 All User Types</option>
          {Object.entries(USER_TYPE_LABELS).filter(([k]) => k !== '').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select style={{ ...SELECT, width: '150px' }} value={filters.eventType} onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}>
          <option value="">📂 All Event Types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select style={{ ...SELECT, width: '130px' }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">⬤ All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {hasFilters && (
          <button onClick={() => setFilters({ country: '', userType: '', eventType: '', status: '' })}
            style={{ padding: '9px 14px', border: '1px solid #E8E3DC', borderRadius: '8px', background: '#fff', fontSize: '12px', fontFamily: MONO, cursor: 'pointer', color: '#666', whiteSpace: 'nowrap' }}>
            Clear filters ×
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '12px', color: '#888' }}>
          {filtered.length} of {packages.length} packages
        </span>
      </div>

      {/* Packages table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', fontFamily: MONO, color: '#888' }}>Loading packages…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
            <div style={{ fontFamily: MONO, color: '#888', fontSize: '13px' }}>
              {hasFilters ? 'No packages match the current filters.' : 'No packages yet. Create your first package.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  {['Package', 'User Type', 'Event Type', 'Shots', 'Price', 'Country', 'Valid Period', 'Active', 'Actions'].map((h) => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((pkg) => (
                  <tr key={pkg.id}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>

                    {/* Name */}
                    <td style={tdS}>
                      <div style={{ fontFamily: SERIF, fontWeight: '700', color: '#0C0904', fontSize: '14px' }}>
                        {pkg.is_featured && <span title="Popular" style={{ marginRight: '4px' }}>⭐</span>}
                        {pkg.name}
                      </div>
                      {pkg.description && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pkg.description}
                        </div>
                      )}
                    </td>

                    {/* User type */}
                    <td style={tdS}>
                      <Pill
                        label={USER_TYPE_LABELS[pkg.user_type ?? ''] ?? pkg.user_type ?? 'All'}
                        color={USER_TYPE_COLORS[pkg.user_type ?? ''] ?? '#888'}
                      />
                    </td>

                    {/* Event type */}
                    <td style={tdS}>
                      <Pill
                        label={EVENT_TYPE_LABELS[pkg.event_type] ?? pkg.event_type}
                        color={EVENT_TYPE_COLORS[pkg.event_type] ?? '#888'}
                      />
                    </td>

                    {/* Shots */}
                    <td style={{ ...tdS, color: GOLD, fontWeight: '700' }}>📷 {pkg.shots}</td>

                    {/* Price */}
                    <td style={{ ...tdS, color: GOLD, fontWeight: '700' }}>₹{pkg.price_per_person.toLocaleString('en-IN')}</td>

                    {/* Country */}
                    <td style={tdS}>
                      <span style={{ fontSize: '16px', marginRight: '4px' }}>{getCountryFlag(pkg.country_code)}</span>
                      <span style={{ fontFamily: MONO, fontSize: '12px', color: '#555' }}>{pkg.country_code}</span>
                    </td>

                    {/* Valid period */}
                    <td style={{ ...tdS, fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>
                      {pkg.valid_from || pkg.valid_to
                        ? <>{fmtDate(pkg.valid_from)} → {fmtDate(pkg.valid_to)}</>
                        : <span style={{ color: '#ccc' }}>Always active</span>
                      }
                    </td>

                    {/* Status toggle */}
                    <td style={tdS}>
                      <Toggle checked={pkg.is_active} onChange={() => canEdit && handleToggleActive(pkg)} disabled={!canEdit} />
                    </td>

                    {/* Actions */}
                    <td style={tdS}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => { setEditPkg(pkg); setSaveError(null); setModalOpen(true); }}
                              title="Edit"
                              style={{ background: 'none', border: '1px solid #E8E3DC', borderRadius: '6px', padding: '5px 9px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>
                              ✏️
                            </button>
                            <button
                              onClick={() => setDeletePkg(pkg)}
                              title="Delete"
                              style={{ background: 'none', border: '1px solid #FECACA', borderRadius: '6px', padding: '5px 9px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>
                              🗑
                            </button>
                          </>
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

      {/* Seasonal section */}
      <SeasonalSection packages={packages} canEdit={canEdit} onToggle={handleToggleActive} />

      {/* Save error */}
      {saveError && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 18px', fontFamily: MONO, fontSize: '13px', color: '#991B1B', zIndex: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: '340px' }}>
          ⚠ {saveError}
          <button onClick={() => setSaveError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Package form modal */}
      {modalOpen && (
        <PackageFormModal
          initial={editPkg ? { name: editPkg.name, description: editPkg.description, shots: editPkg.shots, price_per_person: editPkg.price_per_person, is_featured: editPkg.is_featured, is_active: editPkg.is_active, event_type: editPkg.event_type, country_code: editPkg.country_code, user_type: editPkg.user_type, valid_from: editPkg.valid_from, valid_to: editPkg.valid_to, sort_order: editPkg.sort_order } : null}
          countries={countries}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditPkg(null); }}
          saving={saving}
        />
      )}

      {/* Delete modal */}
      {deletePkg && (
        <DeleteModal
          pkg={deletePkg}
          adminRole={admin?.role ?? ''}
          onSoftDelete={handleSoftDelete}
          onHardDelete={handleHardDelete}
          onClose={() => setDeletePkg(null)}
          saving={saving}
        />
      )}

    </AdminLayout>
  );
}
