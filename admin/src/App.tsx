import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { trpc, createTrpcClient } from "@/lib/trpc";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppProvider } from "@/lib/app-context";
import { Layout } from "@/components/layout/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { RemoteConfigPage } from "@/pages/RemoteConfigPage";
import { FeatureFlagsPage } from "@/pages/FeatureFlagsPage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { CampaignFormPage } from "@/pages/CampaignFormPage";
import { CampaignViewPage } from "@/pages/CampaignViewPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { PaywallPage } from "@/pages/PaywallPage";
import { EventsPage } from "@/pages/EventsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";

function AppRoutes() {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <LoginPage />;
  }

  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/remote-config" element={<RemoteConfigPage />} />
          <Route path="/feature-flags" element={<FeatureFlagsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/new" element={<CampaignFormPage />} />
          <Route path="/campaigns/:id" element={<CampaignViewPage />} />
          <Route path="/campaigns/:id/edit" element={<CampaignFormPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/paywall" element={<PaywallPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  }));
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename="/api/admin">
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
