import React from 'react';
import AdminLayout from '../components/admin-layout';

const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';

export default function Settings() {
  return (
    <AdminLayout pageTitle="Settings">
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '48px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚙️</div>
        <h2 style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: '#0C0904', marginBottom: '8px' }}>Settings</h2>
        <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>
          Platform settings and configuration options.
        </p>
      </div>
    </AdminLayout>
  );
}
