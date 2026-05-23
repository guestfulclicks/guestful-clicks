import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from './pages/login';
import KYCReview from './pages/kyc-review';
import AdminManagement from './pages/admin-management';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/kyc" element={<KYCReview />} />
        <Route path="/admin/admin-mgmt" element={<AdminManagement />} />
        <Route path="/admin/events" element={<Navigate to="/admin/kyc" replace />} />
        <Route path="/admin/dashboard" element={<Navigate to="/admin/kyc" replace />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
