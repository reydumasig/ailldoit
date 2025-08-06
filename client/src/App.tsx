import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CampaignForm from "@/pages/campaign-form";
import AIGenerator from "@/pages/ai-generator";
import Publishing from "@/pages/publishing";
import PublishingResults from "@/pages/publishing-results";
import OAuthConnections from "@/pages/oauth-connections-enhanced";
import TestLearning from "@/pages/test-learning";
import SuperAdminDashboard from "@/pages/SuperAdminDashboard";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Sidebar from "@/components/sidebar";

function AuthenticatedRouter() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/campaigns" component={Dashboard} />
          <Route path="/campaign/new" component={CampaignForm} />
          <Route path="/campaign/:id/generate" component={AIGenerator} />
          <Route path="/campaign/:id/publish" component={Publishing} />
          <Route path="/campaign/:id/results" component={PublishingResults} />
          <Route path="/connections" component={OAuthConnections} />
          <Route path="/test-learning" component={TestLearning} />
          <Route path="/superadmin" component={SuperAdminDashboard} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route path="/" component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  return <AuthenticatedRouter />;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
