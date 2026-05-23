import React from 'react';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';

export default function PricingConfig() {
  return (
    <AdminLayout pageTitle="Pricing">
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '48px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏷️</div>
        <h2 style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: '#0C0904', marginBottom: '8px' }}>Pricing Configuration</h2>
        <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>
          Manage public event participant tiers and pricing here.
        </p>
      </div>
    </AdminLayout>
  );
}
