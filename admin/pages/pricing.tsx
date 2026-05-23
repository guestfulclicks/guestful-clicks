import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';
import {
  PRIVATE_HOST_PRICING,
  PUBLIC_ORGANISER_PRICING,
  PUBLIC_PARTICIPANT_PRICING,
  SHOT_LIMITS,
  REVENUE_SHARE,
} from '../../shared/constants';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

interface PricingConfig {
  private_host: { maxGuests: number; price: number }[];
  public_organiser: { singleEvent: number; monthlyUnlimited: number };
  public_participant: { shots: number; price: number }[];
  shot_limits: { privateGuest: number; public99: number; public199: number; public299: number; public499: number };
  revenue_share: { organiserPercent: number; payoutWindowStartDay: number; payoutWindowEndDay: number };
}

function defaultConfig(): PricingConfig {
  return {
    private_host: PRIVATE_HOST_PRICING.map(t => ({
      maxGuests: t.maxGuests === Infinity ? 99999 : t.maxGuests,
      price: t.price,
    })),
    public_organiser: {
      singleEvent: PUBLIC_ORGANISER_PRICING.singleEvent,
      monthlyUnlimited: PUBLIC_ORGANISER_PRICING.monthlyUnlimited,
    },
    public_participant: PUBLIC_PARTICIPANT_PRICING.map(t => ({ shots: t.shots, price: t.price })),
    shot_limits: { ...SHOT_LIMITS },
    revenue_share: { ...REVENUE_SHARE },
  };
}

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
    <input
      type="number"
      value={value}
      min={0}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '80px', padding: '4px 6px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '12px' }}
    />
  );
}

export default function PricingConfig() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit]   = useState(false);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [config, setConfig]     = useState<PricingConfig>(defaultConfig());
  const [draft, setDraft]       = useState<PricingConfig>(defaultConfig());
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setCanEdit(user.permissions.canEditPricing);
      await loadConfig();
    };
    init();
  }, [navigate]);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'pricing_config')
      .single();

    const cfg: PricingConfig = data?.value ? (data.value as PricingConfig) : defaultConfig();
    setConfig(cfg);
    setDraft(cfg);
    setLoading(false);
  }, []);

  const handleEdit = () => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: 'pricing_config', value: draft }, { onConflict: 'key' });

    if (!error) {
      setConfig(draft);
      setEditing(false);
      setSavedMsg('Saved successfully.');
      setTimeout(() => setSavedMsg(''), 3000);
    }
    setSaving(false);
  };

  const updatePrivateTier = (i: number, field: 'maxGuests' | 'price', val: number) => {
    const next = { ...draft, private_host: draft.private_host.map((t, idx) => idx === i ? { ...t, [field]: val } : t) };
    setDraft(next);
  };

  const updateParticipantTier = (i: number, field: 'shots' | 'price', val: number) => {
    const next = { ...draft, public_participant: draft.public_participant.map((t, idx) => idx === i ? { ...t, [field]: val } : t) };
    setDraft(next);
  };

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: '600',
    color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid #E8E3DC', fontFamily: MONO,
  };
  const td: React.CSSProperties = {
    padding: '12px 14px', fontSize: '13px', color: '#333', fontFamily: MONO,
    borderBottom: '1px solid #F5F3EF',
  };

  if (loading) return <AdminLayout pageTitle="Pricing">Loading…</AdminLayout>;

  const cfg = editing ? draft : config;

  return (
    <AdminLayout pageTitle="Pricing">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Pricing Configuration</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>All prices in Indian Rupees (₹). Changes take effect immediately.</p>
        </div>
        {canEdit && !editing && (
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

      {savedMsg && (
        <div style={{ marginBottom: '16px', padding: '10px 16px', backgroundColor: '#E6F9EE', border: '1px solid #B2DFCC', borderRadius: '6px', fontSize: '13px', color: '#1A7A40', fontFamily: MONO }}>
          {savedMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Private Host Tiers */}
        <div style={CARD}>
          <SectionTitle title="Private Event — Host Pricing" sub="Hosts pay a one-time fee based on max guest capacity." />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Tier</th>
                <th style={th}>Max Guests</th>
                <th style={th}>Price</th>
                <th style={th}>Price / Guest</th>
              </tr>
            </thead>
            <tbody>
              {cfg.private_host.map((tier, i) => {
                const isLast = i === cfg.private_host.length - 1;
                return (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>Tier {i + 1}</td>
                    <td style={td}>
                      {isLast
                        ? <span style={{ color: '#888' }}>Unlimited</span>
                        : <NumInput value={tier.maxGuests} editing={editing} onChange={v => updatePrivateTier(i, 'maxGuests', v)} />
                      }
                    </td>
                    <td style={td}>
                      {editing
                        ? <NumInput value={tier.price} editing onChange={v => updatePrivateTier(i, 'price', v)} />
                        : <span style={{ color: GOLD, fontWeight: '600' }}>{fmtINR(tier.price)}</span>
                      }
                    </td>
                    <td style={{ ...td, color: '#888' }}>
                      {isLast ? '—' : `~${fmtINR(Math.round(tier.price / tier.maxGuests))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Public Organiser Plans */}
        <div style={CARD}>
          <SectionTitle title="Public Event — Organiser Plans" sub="Organisers choose a single-event pass or a monthly unlimited subscription." />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            {([
              { label: 'Single Event', key: 'singleEvent' as const, desc: 'One-time access for a single public event' },
              { label: 'Monthly Unlimited', key: 'monthlyUnlimited' as const, desc: 'Unlimited public events within the month' },
            ] as const).map(plan => (
              <div key={plan.key} style={{ flex: 1, minWidth: '200px', border: '1px solid #E8E3DC', borderRadius: '8px', padding: '20px' }}>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO, marginBottom: '8px' }}>{plan.label}</div>
                {editing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '18px', color: '#555', fontFamily: MONO }}>₹</span>
                    <input
                      type="number"
                      value={draft.public_organiser[plan.key]}
                      min={0}
                      onChange={e => setDraft({ ...draft, public_organiser: { ...draft.public_organiser, [plan.key]: Number(e.target.value) } })}
                      style={{ width: '100px', padding: '6px 8px', border: '1px solid #D4A853', borderRadius: '4px', fontFamily: MONO, fontSize: '18px', color: '#0C0904' }}
                    />
                  </div>
                ) : (
                  <div style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: GOLD }}>{fmtINR(cfg.public_organiser[plan.key])}</div>
                )}
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px', fontFamily: MONO }}>{plan.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Public Participant Tiers */}
        <div style={CARD}>
          <SectionTitle title="Public Event — Participant Shot Tiers" sub="Participants purchase a shot quota to upload photos at public events." />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Tier</th>
                <th style={th}>Shots Included</th>
                <th style={th}>Price</th>
                <th style={th}>Price / Shot</th>
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
                      : <span style={{ color: GOLD, fontWeight: '600' }}>{fmtINR(tier.price)}</span>
                    }
                  </td>
                  <td style={{ ...td, color: '#888' }}>
                    {tier.shots > 0 ? `~${fmtINR(Math.round(tier.price / tier.shots))}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Revenue Share */}
        <div style={CARD}>
          <SectionTitle title="Revenue Share & Payout Window" sub="How revenue is split between platform and organiser, and when organisers are paid." />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            {([
              { label: 'Organiser Share',        suffix: '%',    key: 'organiserPercent'       as const, desc: '% of participant revenue paid to organiser' },
              { label: 'Payout Window Start',    suffix: 'days', key: 'payoutWindowStartDay'   as const, desc: 'Days after event end before payout eligible' },
              { label: 'Payout Window End',      suffix: 'days', key: 'payoutWindowEndDay'     as const, desc: 'Deadline day for payout processing' },
            ] as const).map(item => (
              <div key={item.key} style={{ flex: 1, minWidth: '160px', border: '1px solid #E8E3DC', borderRadius: '8px', padding: '18px' }}>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO, marginBottom: '8px' }}>{item.label}</div>
                {editing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      value={draft.revenue_share[item.key]}
                      min={0}
                      max={item.key === 'organiserPercent' ? 100 : undefined}
                      onChange={e => setDraft({ ...draft, revenue_share: { ...draft.revenue_share, [item.key]: Number(e.target.value) } })}
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
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px', fontFamily: MONO }}>{item.desc}</div>
              </div>
            ))}
          </div>
          {!editing && (
            <div style={{ marginTop: '16px', padding: '12px 14px', backgroundColor: '#F5F3EF', borderRadius: '6px', fontSize: '12px', color: '#666', fontFamily: MONO }}>
              Platform keeps <strong style={{ color: '#0C0904' }}>{100 - cfg.revenue_share.organiserPercent}%</strong>.
              Payouts processed between day <strong style={{ color: '#0C0904' }}>{cfg.revenue_share.payoutWindowStartDay}</strong> and day <strong style={{ color: '#0C0904' }}>{cfg.revenue_share.payoutWindowEndDay}</strong> after the event.
            </div>
          )}
        </div>

        {/* Shot Limits */}
        <div style={CARD}>
          <SectionTitle title="Shot Limits" sub="Maximum uploads allowed per participant per event, by access type." />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Access Type</th>
                <th style={th}>Shot Limit</th>
              </tr>
            </thead>
            <tbody>
              {([
                { label: 'Private Event Guest', key: 'privateGuest' as const },
                { label: 'Public ₹99 Tier',    key: 'public99'     as const },
                { label: 'Public ₹199 Tier',   key: 'public199'    as const },
                { label: 'Public ₹299 Tier',   key: 'public299'    as const },
                { label: 'Public ₹499 Tier',   key: 'public499'    as const },
              ] as const).map(row => (
                <tr key={row.key}>
                  <td style={td}>{row.label}</td>
                  <td style={td}>
                    {editing ? (
                      <input
                        type="number"
                        value={draft.shot_limits[row.key]}
                        min={1}
                        onChange={e => setDraft({ ...draft, shot_limits: { ...draft.shot_limits, [row.key]: Number(e.target.value) } })}
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
    </AdminLayout>
  );
}
