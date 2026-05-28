import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from './pages/login';
import AdminDashboard from './pages/dashboard';
import EventsPage from './pages/events';
import UsersPage from './pages/users';
import PayoutsPage from './pages/payouts';
import AnalyticsPage from './pages/analytics';
import KYCReview from './pages/kyc-review';
import AdminManagement from './pages/admin-management';
import PricingConfig from './pages/pricing';
import PackagesPage from './pages/packages';
import Notifications from './pages/notifications';
import Settings from './pages/settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login"      element={<AdminLogin />} />
        <Route path="/admin/dashboard"  element={<AdminDashboard />} />
        <Route path="/admin/events"     element={<EventsPage />} />
        <Route path="/admin/users"      element={<UsersPage />} />
        <Route path="/admin/payouts"    element={<PayoutsPage />} />
        <Route path="/admin/analytics"  element={<AnalyticsPage />} />
        <Route path="/admin/kyc"        element={<KYCReview />} />
        <Route path="/admin/admin-mgmt" element={<AdminManagement />} />
        <Route path="/admin/pricing"    element={<PricingConfig />} />
        <Route path="/admin/packages"   element={<PackagesPage />} />
        <Route path="/admin/notifications" element={<Notifications />} />
        <Route path="/admin/settings"   element={<Settings />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
