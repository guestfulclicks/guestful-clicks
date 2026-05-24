import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser, type AdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';
import {
  getAllCountries,
  getCurrencyByCountryCode,
  getCountryFlag,
  type Country,
} from '../lib/location-api';
import { logAdminActivity } from '../lib/admin-activity';
import {
  PRIVATE_HOST_PRICING,
  PUBLIC_ORGANISER_PRICING,
  PUBLIC_PARTICIPANT_PRICING,
  SHOT_LIMITS,
  REVENUE_SHARE,
} from '../lib/constants';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricingConfig {
  private_host:        { maxGuests: number; price: number }[];
  public_organiser:    { singleEvent: number; monthlyUnlimited: number };
  public_participant:  { shots: number; price: number }[];
  shot_limits:         { privateGuest: number; public99: number; public199: number; public299: number; public499: number };
  revenue_share:       { organiserPercent: number; payoutWindowStartDay: number; payoutWindowEndDay: number };
  currency_symbol:     string;
  last_updated:        string;
  last_updated_by:     string;
}

interface ChangeEntry {
  field:        string;
  oldValue:     string;
  newValue:     string;
  changed_by:   string;
  changed_at:   string;
  country:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultConfig(sym = '₹'): PricingConfig {
  return {
    private_host: PRIVATE_HOST_PRICING.map(t => ({
      maxGuests: t.maxGuests === Infinity ? 99999 : t.maxGuests,
      price: t.price,
    })),
    public_organiser:   { singleEvent: PUBLIC_ORGANISER_PRICING.singleEvent, monthlyUnlimited: PUBLIC_ORGANISER_PRICING.monthlyUnlimited },
    public_participant: PUBLIC_PARTICIPANT_PRICING.map(t => ({ shots: t.shots, price: t.price })),
    shot_limits:        { ...SHOT_LIMITS },
    revenue_share:      { ...REVENUE_SHARE },
    currency_symbol:    sym,
    last_updated:       '',
    last_updated_by:    '',
  };
}

function fmtPrice(n: number, sym: string) {
  return `${sym}${n.toLocaleString('en-IN')}`;
}

function timeAgo(iso: string) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (d < 1) return 'Just now';
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function configKey(countryCode: string) {
  return countryCode === 'IN' ? 'pricing_config' : `pricing_config_${countryCode}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#0C0904', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0', fontFamily: MONO }}>{sub}</p>}
    </div>
  );
}

function NumInput({ value, editing, onChange }: { value: number; editing: boolean; onChange: (v: number) => void }) {
  if (!editing) return <span>{value}</span>;
  return (
    <input type="number" value={value} min={0} onChange={e => onChange(Number(e.target.value))}
      style={{ width: '80px', padding: '4px 6px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '12px' }}
    />
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate();

  const [admin,          setAdmin]         = useState<AdminUser | null>(null);
  const [canEdit,        setCanEdit]        = useState(false);
  const [editing,        setEditing]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [configLoading,  setConfigLoading]  = useState(false);

  const [allCountries,   setAllCountries]   = useState<Country[]>([]);
  const [selectedCode,   setSelectedCode]   = useState('IN');
  const [selectedName,   setSelectedName]   = useState('India');
  const [currSymbol,     setCurrSymbol]      = useState('₹');
  const [hasConfig,      setHasConfig]       = useState(true);

  const [config,         setConfig]          = useState<PricingConfig>(defaultConfig());
  const [draft,          setDraft]           = useState<PricingConfig>(defaultConfig());
  const [history,        setHistory]         = useState<ChangeEntry[]>([]);
  const [savedMsg,       setSavedMsg]        = useState('');

  // For adding a new country
  const [addMode,        setAddMode]         = useState(false);
  const [addCode,        setAddCode]         = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setAdmin(user);
      setCanEdit(user.permissions.canEditPricing);
      const countries = await getAllCountries();
      setAllCountries(countries);
      await loadConfig('IN');
      await loadHistory();
      setLoading(false);
    };
    init();
  }, [navigate]);

  const loadConfig = useCallback(async (code: string) => {
    setConfigLoading(true);
    setEditing(false);

    const currency = await getCurrencyByCountryCode(code);
    const sym = currency.symbol || (code === 'IN' ? '₹' : '');
    setCurrSymbol(sym);

    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', configKey(code))
      .single();

    if (!data?.value) {
      setHasConfig(false);
      setConfig(defaultConfig(sym));
      setDraft(defaultConfig(sym));
    } else {
      setHasConfig(true);
      const cfg = data.value as PricingConfig;
      setConfig(cfg);
      setDraft(cfg);
    }
    setConfigLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'pricing_change_history')
      .single();
    setHistory((data?.value as ChangeEntry[] | null) ?? []);
  }, []);

  const handleCountryChange = async (code: string) => {
    const country = allCountries.find(c => c.iso2 === code);
    setSelectedCode(code);
    setSelectedName(country?.name ?? code);
    await loadConfig(code);
  };

  const handleCopyFromIndia = async () => {
    const { data } = await supabase
      .from('admin_settings').select('value').eq('key', 'pricing_config').single();
    const indiaConfig = (data?.value as PricingConfig | null) ?? defaultConfig('₹');
    const newCfg: PricingConfig = {
      ...indiaConfig,
      currency_symbol: currSymbol,
      last_updated: '',
      last_updated_by: '',
    };
    setConfig(newCfg);
    setDraft(newCfg);
    setHasConfig(false);
    setEditing(true);
  };

  const handleEdit = () => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setEditing(false);
  };

  const handleSave = async () => {
    if (!admin) return;
    setSaving(true);

    // Compute diff for history
    const changes: ChangeEntry[] = [];
    const diff = (field: string, oldVal: string | number, newVal: string | number) => {
      if (String(oldVal) !== String(newVal)) {
        changes.push({ field, oldValue: String(oldVal), newValue: String(newVal), changed_by: admin.full_name || admin.email, changed_at: new Date().toISOString(), country: selectedName });
      }
    };
    config.private_host.forEach((t, i) => {
      diff(`Private Tier ${i+1} Price`, t.price, draft.private_host[i]?.price ?? t.price);
    });
    diff('Single Event Price', config.public_organiser.singleEvent, draft.public_organiser.singleEvent);
    diff('Monthly Unlimited Price', config.public_organiser.monthlyUnlimited, draft.public_organiser.monthlyUnlimited);
    diff('Organiser Share %', config.revenue_share.organiserPercent, draft.revenue_share.organiserPercent);

    const toSave: PricingConfig = {
      ...draft,
      currency_symbol: currSymbol,
      last_updated: new Date().toISOString(),
      last_updated_by: admin.full_name || admin.email,
    };

    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: configKey(selectedCode), value: toSave }, { onConflict: 'key' });

    if (!error) {
      setConfig(toSave);
      setHasConfig(true);
      setEditing(false);
      setSavedMsg('Pricing saved.');
      setTimeout(() => setSavedMsg(''), 3000);

      // Save history
      if (changes.length > 0) {
        const newHistory = [...changes, ...history].slice(0, 20);
        await supabase.from('admin_settings').upsert({ key: 'pricing_change_history', value: newHistory }, { onConflict: 'key' });
        setHistory(newHistory);
      }

      logAdminActivity(admin.id, 'pricing_updated', 'pricing', selectedCode, { country: selectedName, changes: changes.length });
    }
    setSaving(false);
  };

  const handleAddCountry = async () => {
    if (!addCode) return;
    const country = allCountries.find(c => c.iso2 === addCode);
    setSelectedCode(addCode);
    setSelectedName(country?.name ?? addCode);
    await loadConfig(addCode);
    setAddMode(false);
    setAddCode('');
    setEditing(true);
  };

  const updatePrivateTier   = (i: number, field: 'maxGuests' | 'price', val: number) =>
    setDraft(d => ({ ...d, private_host: d.private_host.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const updateParticipantTier = (i: number, field: 'shots' | 'price', val: number) =>
    setDraft(d => ({ ...d, public_participant: d.public_participant.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E8E3DC', fontFamily: MONO };
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: '13px', color: '#333', fontFamily: MONO, borderBottom: '1px solid #F5F3EF' };

  if (loading) return <AdminLayout pageTitle="Pricing">Loading…</AdminLayout>;

  const cfg = editing ? draft : config;
  const sym = currSymbol || '₹';

  const countryListItems = allCountries.filter(c => c.iso2);

  return (
    <AdminLayout pageTitle="Pricing">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Pricing Configuration</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>Country-aware pricing. Changes take effect immediately.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!addMode && (
            <button onClick={() => setAddMode(true)} style={{ padding: '9px 16px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>
              + Add Country
            </button>
          )}
          {canEdit && !editing && hasConfig && (
            <button onClick={handleEdit} style={{ padding: '9px 20px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
              Edit Pricing
            </button>
          )}
          {editing && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCancel} style={{ padding: '9px 18px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add country modal inline */}
      {addMode && (
        <div style={{ ...CARD, marginBottom: '20px', backgroundColor: `${GOLD}08`, border: `1px solid ${GOLD}44` }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904' }}>Add Country Pricing</div>
            <select
              value={addCode}
              onChange={e => setAddCode(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, color: '#333', minWidth: '220px' }}
            >
              <option value="">Select country…</option>
              {countryListItems.map(c => (
                <option key={c.iso2} value={c.iso2}>{getCountryFlag(c.iso2)} {c.name}</option>
              ))}
            </select>
            <button onClick={handleAddCountry} disabled={!addCode} style={{ padding: '8px 18px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: addCode ? 'pointer' : 'default', opacity: addCode ? 1 : 0.5, fontFamily: MONO }}>
              Continue
            </button>
            <button onClick={() => { setAddMode(false); setAddCode(''); }} style={{ padding: '8px 14px', backgroundColor: 'transparent', color: '#888', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Country selector */}
      <div style={{ ...CARD, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' as const }}>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Country</div>
          <select
            value={selectedCode}
            onChange={e => handleCountryChange(e.target.value)}
            style={{ padding: '8px 14px', border: '1px solid #E8E3DC', borderRadius: '8px', fontSize: '13px', fontFamily: MONO, color: '#333', minWidth: '220px' }}
          >
            {countryListItems.map(c => (
              <option key={c.iso2} value={c.iso2}>{getCountryFlag(c.iso2)} {c.name} ({c.currency})</option>
            ))}
          </select>
          {!configLoading && config.last_updated && (
            <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO }}>
              Last updated {timeAgo(config.last_updated)} by {config.last_updated_by}
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '20px' }}>{getCountryFlag(selectedCode)}</div>
          <div style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '700', color: '#0C0904' }}>{sym}</div>
        </div>
      </div>

      {savedMsg && (
        <div style={{ marginBottom: '16px', padding: '10px 16px', backgroundColor: '#E6F9EE', border: '1px solid #B2DFCC', borderRadius: '6px', fontSize: '13px', color: '#1A7A40', fontFamily: MONO }}>
          {savedMsg}
        </div>
      )}

      {configLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontFamily: MONO }}>Loading pricing for {selectedName}…</div>
      ) : !hasConfig ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🌍</div>
          <h2 style={{ fontFamily: SERIF, fontSize: '20px', color: '#0C0904', margin: '0 0 8px' }}>No pricing configured for {selectedName}</h2>
          <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO, marginBottom: '20px' }}>
            Copy India's pricing as a starting template and adjust amounts.
          </p>
          {canEdit && (
            <button onClick={handleCopyFromIndia} style={{ padding: '10px 24px', backgroundColor: GOLD, color: '#0C0904', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: MONO }}>
              Copy from India →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Private Host Tiers */}
          <div style={CARD}>
            <SectionTitle title="Private Event — Host Pricing" sub={`Hosts pay a one-time fee. Currency: ${sym}`} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Tier', 'Max Guests', 'Price', 'Price / Guest'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cfg.private_host.map((tier, i) => {
                  const isLast = i === cfg.private_host.length - 1;
                  return (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>Tier {i + 1}</td>
                      <td style={td}>
                        {isLast ? <span style={{ color: '#888' }}>Unlimited</span> : <NumInput value={tier.maxGuests} editing={editing} onChange={v => updatePrivateTier(i, 'maxGuests', v)} />}
                      </td>
                      <td style={td}>
                        {editing
                          ? <NumInput value={tier.price} editing onChange={v => updatePrivateTier(i, 'price', v)} />
                          : <span style={{ color: GOLD, fontWeight: '600' }}>{fmtPrice(tier.price, sym)}</span>
                        }
                      </td>
                      <td style={{ ...td, color: '#888' }}>
                        {isLast ? '—' : `~${fmtPrice(Math.round(tier.price / tier.maxGuests), sym)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Public Organiser Plans */}
          <div style={CARD}>
            <SectionTitle title="Public Event — Organiser Plans" sub="Single-event pass or monthly unlimited." />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              {([
                { label: 'Single Event', key: 'singleEvent' as const, desc: 'One-time access for a single public event' },
                { label: 'Monthly Unlimited', key: 'monthlyUnlimited' as const, desc: 'Unlimited public events within the month' },
              ] as const).map(plan => (
                <div key={plan.key} style={{ flex: 1, minWidth: '200px', border: '1px solid #E8E3DC', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO, marginBottom: '8px' }}>{plan.label}</div>
                  {editing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '18px', color: '#555', fontFamily: MONO }}>{sym}</span>
                      <input type="number" value={draft.public_organiser[plan.key]} min={0}
                        onChange={e => setDraft(d => ({ ...d, public_organiser: { ...d.public_organiser, [plan.key]: Number(e.target.value) } }))}
                        style={{ width: '100px', padding: '6px 8px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '18px', color: '#0C0904' }}
                      />
                    </div>
                  ) : (
                    <div style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: GOLD }}>{fmtPrice(cfg.public_organiser[plan.key], sym)}</div>
                  )}
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px', fontFamily: MONO }}>{plan.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Public Participant Tiers */}
          <div style={CARD}>
            <SectionTitle title="Public Event — Participant Shot Tiers" sub="Participants purchase shot quotas." />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Tier', 'Shots', 'Price', 'Price / Shot'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cfg.public_participant.map((tier, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>Tier {i + 1}</td>
                    <td style={td}><NumInput value={tier.shots} editing={editing} onChange={v => updateParticipantTier(i, 'shots', v)} /></td>
                    <td style={td}>
                      {editing
                        ? <NumInput value={tier.price} editing onChange={v => updateParticipantTier(i, 'price', v)} />
                        : <span style={{ color: GOLD, fontWeight: '600' }}>{fmtPrice(tier.price, sym)}</span>
                      }
                    </td>
                    <td style={{ ...td, color: '#888' }}>
                      {tier.shots > 0 ? `~${fmtPrice(Math.round(tier.price / tier.shots), sym)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Revenue Share */}
          <div style={CARD}>
            <SectionTitle title="Revenue Share & Payout Window" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              {([
                { label: 'Organiser Share', suffix: '%', key: 'organiserPercent' as const },
                { label: 'Payout Window Start', suffix: 'days', key: 'payoutWindowStartDay' as const },
                { label: 'Payout Window End', suffix: 'days', key: 'payoutWindowEndDay' as const },
              ] as const).map(item => (
                <div key={item.key} style={{ flex: 1, minWidth: '160px', border: '1px solid #E8E3DC', borderRadius: '8px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO, marginBottom: '8px' }}>{item.label}</div>
                  {editing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" value={draft.revenue_share[item.key]} min={0}
                        max={item.key === 'organiserPercent' ? 100 : undefined}
                        onChange={e => setDraft(d => ({ ...d, revenue_share: { ...d.revenue_share, [item.key]: Number(e.target.value) } }))}
                        style={{ width: '72px', padding: '6px 8px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '18px', color: '#0C0904' }}
                      />
                      <span style={{ fontSize: '13px', color: '#888', fontFamily: MONO }}>{item.suffix}</span>
                    </div>
                  ) : (
                    <div style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904' }}>
                      {cfg.revenue_share[item.key]}
                      <span style={{ fontSize: '14px', color: '#888', fontFamily: MONO, marginLeft: '4px' }}>{item.suffix}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Shot Limits */}
          <div style={CARD}>
            <SectionTitle title="Shot Limits" sub="Max uploads per participant per event." />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Access Type', 'Shot Limit'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {([
                  { label: 'Private Event Guest', key: 'privateGuest' as const },
                  { label: `Public ${sym}99 Tier`, key: 'public99' as const },
                  { label: `Public ${sym}199 Tier`, key: 'public199' as const },
                  { label: `Public ${sym}299 Tier`, key: 'public299' as const },
                  { label: `Public ${sym}499 Tier`, key: 'public499' as const },
                ] as const).map(row => (
                  <tr key={row.key}>
                    <td style={td}>{row.label}</td>
                    <td style={td}>
                      {editing ? (
                        <input type="number" value={draft.shot_limits[row.key]} min={1}
                          onChange={e => setDraft(d => ({ ...d, shot_limits: { ...d.shot_limits, [row.key]: Number(e.target.value) } }))}
                          style={{ width: '80px', padding: '4px 6px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '12px' }}
                        />
                      ) : (
                        <span style={{ fontWeight: '600', color: '#0C0904' }}>{cfg.shot_limits[row.key]} shots</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Change History */}
      {history.length > 0 && (
        <div style={{ ...CARD, marginTop: '28px' }}>
          <SectionTitle title="Recent Price Changes" sub="Last 5 changes across all countries" />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Field', 'Before', 'After', 'Country', 'Changed By', 'When'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {history.slice(0, 5).map((e, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>{e.field}</td>
                  <td style={{ ...td, color: '#888' }}>{e.oldValue}</td>
                  <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{e.newValue}</td>
                  <td style={td}>{e.country}</td>
                  <td style={td}>{e.changed_by}</td>
                  <td style={{ ...td, color: '#aaa' }}>{timeAgo(e.changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </AdminLayout>
  );
}
