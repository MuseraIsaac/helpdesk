import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useBranding } from "@/lib/useBranding";
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
import TemplatesPage from "./pages/TemplatesPage";
import FormBuilderPage from "./pages/FormBuilderPage";
import CabGroupsPage from "./pages/CabGroupsPage";
import TicketTypesPage from "./pages/TicketTypesPage";
import TicketStatusConfigsPage from "./pages/TicketStatusConfigsPage";
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
import ProblemsPage from "./pages/ProblemsPage";
import ProblemDetailPage from "./pages/ProblemDetailPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import ScenariosPage from "./pages/ScenariosPage";
import ChangesPage from "./pages/ChangesPage";
import ChangeDetailPage from "./pages/ChangeDetailPage";
import NewChangePage from "./pages/NewChangePage";
import NewTicketPage from "./pages/NewTicketPage";
import NewProblemPage from "./pages/NewProblemPage";
import NewRequestPage from "./pages/NewRequestPage";
import PortalLoginPage from "./pages/portal/PortalLoginPage";
import PortalRegisterPage from "./pages/portal/PortalRegisterPage";
import PortalTicketsPage from "./pages/portal/PortalTicketsPage";
import PortalTicketDetailPage from "./pages/portal/PortalTicketDetailPage";
import PortalNewTicketPage from "./pages/portal/PortalNewTicketPage";
import PortalRequestsPage from "./pages/portal/PortalRequestsPage";
import PortalRequestDetailPage from "./pages/portal/PortalRequestDetailPage";
import PortalNewRequestPage from "./pages/portal/PortalNewRequestPage";
import NotificationsPage from "./pages/NotificationsPage";
import CmdbPage from "./pages/CmdbPage";
import CmdbDetailPage from "./pages/CmdbDetailPage";
import CatalogPage from "./pages/CatalogPage";
import CatalogItemPage from "./pages/CatalogItemPage";
import CatalogAdminPage from "./pages/CatalogAdminPage";
import PortalCatalogPage from "./pages/portal/PortalCatalogPage";
import PortalCatalogItemPage from "./pages/portal/PortalCatalogItemPage";
import HelpCenterPage from "./pages/help/HelpCenterPage";
import HelpArticlePage from "./pages/help/HelpArticlePage";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import OrganizationsPage from "./pages/OrganizationsPage";
import OrganizationDetailPage from "./pages/OrganizationDetailPage";

/** Applies the uploaded logo as the browser favicon whenever branding changes. */
function FaviconEffect() {
  const { data: branding } = useBranding();
  useEffect(() => {
    const dataUrl = branding?.logoDataUrl;
    if (!dataUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = dataUrl.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
    link.href = dataUrl;
  }, [branding?.logoDataUrl]);
  return null;
}

function App() {
  return (
    <>
      <FaviconEffect />
      <Routes>
      {/* ── Agent / admin ───────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          {/* ITSM modules */}
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/new" element={<NewRequestPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/new" element={<NewProblemPage />} />
          <Route path="/problems/:id" element={<ProblemDetailPage />} />
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/changes/new" element={<NewChangePage />} />
          <Route path="/changes/:id" element={<ChangeDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/cmdb" element={<CmdbPage />} />
          <Route path="/cmdb/:id" element={<CmdbDetailPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:id" element={<CatalogItemPage />} />
          <Route path="/assets" element={<PlaceholderPage title="Assets" description="IT asset management and CMDB integration is coming soon." />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          {/* Contacts */}
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
          {/* /settings redirects non-admins to home; admin sub-routes below */}
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />

          <Route element={<AdminRoute />}>
            <Route path="/settings/:section" element={<SettingsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/macros" element={<MacrosPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/admin/forms" element={<FormBuilderPage />} />
            <Route path="/admin/cab-groups" element={<CabGroupsPage />} />
            <Route path="/admin/ticket-types" element={<TicketTypesPage />} />
            <Route path="/admin/ticket-statuses" element={<TicketStatusConfigsPage />} />
            <Route path="/automations" element={<ScenariosPage />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Advanced reporting and analytics is coming soon." />} />
            <Route path="/catalog/admin" element={<CatalogAdminPage />} />
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
          <Route path="/portal/requests" element={<PortalRequestsPage />} />
          <Route path="/portal/requests/:id" element={<PortalRequestDetailPage />} />
          <Route path="/portal/new-request" element={<PortalNewRequestPage />} />
          <Route path="/portal/catalog" element={<PortalCatalogPage />} />
          <Route path="/portal/catalog/:id" element={<PortalCatalogItemPage />} />
        </Route>
      </Route>

      {/* ── Public help center ──────────────────────────────────────────────── */}
      <Route element={<HelpLayout />}>
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/help/articles/:slug" element={<HelpArticlePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default App;
