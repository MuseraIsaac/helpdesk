import { Navigate, Route, Routes } from "react-router";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import CustomerRoute from "./components/CustomerRoute";
import Layout from "./components/Layout";
import PortalLayout from "./components/PortalLayout";
import HelpLayout from "./components/HelpLayout";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import UsersPage from "./pages/UsersPage";
import MacrosPage from "./pages/MacrosPage";
import KbPage from "./pages/KbPage";
import KbArticleFormPage from "./pages/KbArticleFormPage";
import TeamsPage from "./pages/TeamsPage";
import SupervisorRoute from "./components/SupervisorRoute";
import TicketsPage from "./pages/TicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import IncidentsPage from "./pages/IncidentsPage";
import IncidentDetailPage from "./pages/IncidentDetailPage";
import RequestsPage from "./pages/RequestsPage";
import RequestDetailPage from "./pages/RequestDetailPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import PortalLoginPage from "./pages/portal/PortalLoginPage";
import PortalRegisterPage from "./pages/portal/PortalRegisterPage";
import PortalTicketsPage from "./pages/portal/PortalTicketsPage";
import PortalTicketDetailPage from "./pages/portal/PortalTicketDetailPage";
import PortalNewTicketPage from "./pages/portal/PortalNewTicketPage";
import HelpCenterPage from "./pages/help/HelpCenterPage";
import HelpArticlePage from "./pages/help/HelpArticlePage";

function App() {
  return (
    <Routes>
      {/* ── Agent / admin ───────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          {/* ITSM modules */}
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/problems" element={<PlaceholderPage title="Problems" description="Problem management and root cause analysis is coming soon." />} />
          <Route path="/changes" element={<PlaceholderPage title="Change Requests" description="Change advisory board and change management is coming soon." />} />
          <Route path="/assets" element={<PlaceholderPage title="Assets" description="IT asset management and CMDB integration is coming soon." />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          {/* /settings redirects non-admins to home; admin sub-routes below */}
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />

          <Route element={<AdminRoute />}>
            <Route path="/settings/:section" element={<SettingsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/macros" element={<MacrosPage />} />
            <Route path="/templates" element={<PlaceholderPage title="Templates" description="Response templates will be available here." />} />
            <Route path="/automations" element={<PlaceholderPage title="Automations" description="Scenario automations and rule management is coming soon." />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Advanced reporting and analytics is coming soon." />} />
          </Route>
          <Route element={<SupervisorRoute />}>
            <Route path="/kb" element={<KbPage />} />
            <Route path="/kb/articles/new" element={<KbArticleFormPage />} />
            <Route path="/kb/articles/:id/edit" element={<KbArticleFormPage />} />
          </Route>
        </Route>
      </Route>

      {/* ── Customer portal ─────────────────────────────────────────────── */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal/register" element={<PortalRegisterPage />} />
      <Route element={<CustomerRoute />}>
        <Route element={<PortalLayout />}>
          <Route path="/portal/tickets" element={<PortalTicketsPage />} />
          <Route path="/portal/tickets/:id" element={<PortalTicketDetailPage />} />
          <Route path="/portal/new-ticket" element={<PortalNewTicketPage />} />
        </Route>
      </Route>

      {/* ── Public help center ──────────────────────────────────────────────── */}
      <Route element={<HelpLayout />}>
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/help/articles/:slug" element={<HelpArticlePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
