import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "@/components/layouts/AdminLayout";
import { AuthLayout } from "@/components/layouts/AuthLayout";
import { MainLayout } from "@/components/layouts/MainLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineOverlay } from "@/components/shared/OfflineOverlay";
import { FullPageSpinner } from "@/components/shared/LoadingSpinner";
import { Toaster } from "@/components/ui/toaster";
import { ServerErrorPage } from "@/pages/ServerErrorPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const LandingPage = lazy(() => import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const AuthCallbackPage = lazy(() => import("@/pages/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("@/pages/TermsPage").then((m) => ({ default: m.TermsPage })));
const ForbiddenPage = lazy(() => import("@/pages/ForbiddenPage").then((m) => ({ default: m.ForbiddenPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

const Dashboard = lazy(() => import("@/pages/admin/Dashboard").then((m) => ({ default: m.Dashboard })));
const Users = lazy(() => import("@/pages/admin/Users").then((m) => ({ default: m.Users })));
const Chats = lazy(() => import("@/pages/admin/Chats").then((m) => ({ default: m.Chats })));
const AISettings = lazy(() => import("@/pages/admin/AISettings").then((m) => ({ default: m.AISettings })));
const Settings = lazy(() => import("@/pages/admin/Settings").then((m) => ({ default: m.Settings })));
const AuditLogsPage = lazy(() => import("@/pages/admin/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary fallback={<ServerErrorPage />}>
          <Suspense fallback={<FullPageSpinner label="Loading..." />}>
            <Routes>
              {/* Public landing */}
              <Route path="/" element={<LandingPage />} />

              {/* Public info pages — with shared nav + footer */}
              <Route element={<PublicLayout />}>
                <Route path="/about" element={<AboutPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
              </Route>

              {/* Public — auth layout */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* Protected — main layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/analysis/:id" element={<AnalysisPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Admin — standalone with admin sidebar only (no MainLayout) */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="users" element={<Users />} />
                <Route path="chats" element={<Chats />} />
                <Route path="ai-settings" element={<AISettings />} />
                <Route path="settings" element={<Settings />} />
                <Route path="audit" element={<AuditLogsPage />} />
              </Route>

              <Route path="/403" element={<ForbiddenPage />} />
              <Route path="/500" element={<ServerErrorPage />} />
              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        <OfflineOverlay />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
