import React from 'react';
import AdminLayout from '../components/admin-layout';

const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';

export default function Notifications() {
  return (
    <AdminLayout pageTitle="Notifications">
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '48px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔔</div>
        <h2 style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: '#0C0904', marginBottom: '8px' }}>Notifications</h2>
        <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>
          Send push notifications and broadcast messages to users.
        </p>
      </div>
    </AdminLayout>
  );
}
