import { useEffect } from "react";
import { Toaster } from "sonner";
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
import AssetsPage from "./pages/AssetsPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import InventoryLocationsPage from "./pages/InventoryLocationsPage";
import ContractsPage from "./pages/ContractsPage";
import SoftwareLicensesPage from "./pages/SoftwareLicensesPage";
import SoftwareLicenseDetailPage from "./pages/SoftwareLicenseDetailPage";
import SaaSSubscriptionsPage from "./pages/SaaSSubscriptionsPage";
import SaaSSubscriptionDetailPage from "./pages/SaaSSubscriptionDetailPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import DiscoverySyncRunPage from "./pages/DiscoverySyncRunPage";
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
import PermissionRoute from "./components/PermissionRoute";
import ReportsLayout from "./pages/reports/ReportsLayout";
import OverviewReport from "./pages/reports/OverviewReport";
import TicketsReport from "./pages/reports/TicketsReport";
import SlaReport from "./pages/reports/SlaReport";
import IncidentsReport from "./pages/reports/IncidentsReport";
import CsatReport from "./pages/reports/CsatReport";
import AgentReport from "./pages/reports/AgentReport";
import TeamReport from "./pages/reports/TeamReport";
import KbReport from "./pages/reports/KbReport";
import RealtimeReport from "./pages/reports/RealtimeReport";
import CustomReportPage from "./pages/reports/CustomReportPage";
import ReportLibraryPage from "./pages/reports/ReportLibraryPage";
import RequestsReport    from "./pages/reports/RequestsReport";
import ProblemsReport    from "./pages/reports/ProblemsReport";
import ApprovalsReport   from "./pages/reports/ApprovalsReport";
import ChangesReport     from "./pages/reports/ChangesReport";
import AssetsReport      from "./pages/reports/AssetsReport";

/**
 * Injects the browser favicon from branding settings.
 * Prefers the dedicated faviconDataUrl; falls back to logoDataUrl when no
 * separate favicon has been uploaded.
 */
function FaviconEffect() {
  const { data: branding } = useBranding();
  useEffect(() => {
    // Prefer dedicated favicon; fall back to logo
    const dataUrl = branding?.faviconDataUrl || branding?.logoDataUrl;
    if (!dataUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = dataUrl.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
    link.href = dataUrl;
  }, [branding?.faviconDataUrl, branding?.logoDataUrl]);
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
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="/inventory-locations" element={<InventoryLocationsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/discovery/:id" element={<DiscoveryPage />} />
          <Route path="/discovery/runs/:id" element={<DiscoverySyncRunPage />} />
          <Route path="/software/licenses" element={<SoftwareLicensesPage />} />
          <Route path="/software/licenses/:id" element={<SoftwareLicenseDetailPage />} />
          <Route path="/software/saas" element={<SaaSSubscriptionsPage />} />
          <Route path="/software/saas/:id" element={<SaaSSubscriptionDetailPage />} />
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
            <Route path="/catalog/admin" element={<CatalogAdminPage />} />
          </Route>
          <Route element={<SupervisorRoute />}>
            <Route path="/kb" element={<KbPage />} />
            <Route path="/kb/articles/new" element={<KbArticleFormPage />} />
            <Route path="/kb/articles/:id/edit" element={<KbArticleFormPage />} />
          </Route>

          {/* ── Standard reports with shared layout ───────────────────── */}
          <Route element={<PermissionRoute permission="reports.view" />}>
            <Route path="/reports" element={<ReportsLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview"  element={<OverviewReport />} />
              <Route path="tickets"   element={<TicketsReport />} />
              <Route path="sla"       element={<SlaReport />} />
              <Route path="agents"    element={<AgentReport />} />
              <Route path="teams"     element={<TeamReport />} />
              <Route path="incidents" element={<IncidentsReport />} />
              <Route path="csat"      element={<CsatReport />} />
              <Route path="kb"        element={<KbReport />} />
              <Route path="realtime"   element={<RealtimeReport />} />
              <Route path="requests"  element={<RequestsReport />} />
              <Route path="problems"  element={<ProblemsReport />} />
              <Route path="approvals" element={<ApprovalsReport />} />
              <Route path="changes"   element={<ChangesReport />} />
              <Route path="assets"    element={<AssetsReport />} />
              <Route path="library"   element={<ReportLibraryPage />} />
            </Route>
          </Route>
          {/* ── Custom report builder (no shared layout, own permission guard) */}
          <Route element={<PermissionRoute permission="reports.view" />}>
            <Route path="/reports/custom"     element={<CustomReportPage />} />
            <Route path="/reports/custom/:id" element={<CustomReportPage />} />
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
    <Toaster richColors closeButton position="top-right" />
    </>
  );
}

export default App;
