import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router";
import { useBranding } from "@/lib/useBranding";
import { useMe } from "@/hooks/useMe";

// Layouts and route guards stay eager — they wrap every route and are tiny.
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import CustomerRoute from "./components/CustomerRoute";
import SupervisorRoute from "./components/SupervisorRoute";
import PermissionRoute from "./components/PermissionRoute";
import Layout from "./components/Layout";
import PortalLayout from "./components/PortalLayout";
import HelpLayout from "./components/HelpLayout";

// LoginPage and HomePage stay eager so the most common first paints
// (anonymous → /login, authenticated → /) don't wait on a chunk fetch.
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";

// ── Lazy pages ────────────────────────────────────────────────────────────────
//
// Vite splits each `import()` into its own chunk. Modules grouped here are
// kept on a single line where they're route-siblings (same product area)
// so the developer can see at a glance which routes share a chunk.

const UsersPage                 = lazy(() => import("./pages/UsersPage"));
const RolesPage                 = lazy(() => import("./pages/RolesPage"));
const MacrosPage                = lazy(() => import("./pages/MacrosPage"));
const TemplatesPage             = lazy(() => import("./pages/TemplatesPage"));
const FormBuilderPage           = lazy(() => import("./pages/FormBuilderPage"));
const CabGroupsPage             = lazy(() => import("./pages/CabGroupsPage"));
const TicketTypesPage           = lazy(() => import("./pages/TicketTypesPage"));
const TicketStatusConfigsPage   = lazy(() => import("./pages/TicketStatusConfigsPage"));
const KbPage                    = lazy(() => import("./pages/KbPage"));
const KbArticleFormPage         = lazy(() => import("./pages/KbArticleFormPage"));
const TeamsPage                 = lazy(() => import("./pages/TeamsPage"));
const TicketsPage               = lazy(() => import("./pages/TicketsPage"));
const TicketDetailPage          = lazy(() => import("./pages/TicketDetailPage"));
const ApprovalsPage             = lazy(() => import("./pages/ApprovalsPage"));
const IncidentsPage             = lazy(() => import("./pages/IncidentsPage"));
const IncidentDetailPage        = lazy(() => import("./pages/IncidentDetailPage"));
const NewIncidentPage           = lazy(() => import("./pages/NewIncidentPage"));
const RequestsPage              = lazy(() => import("./pages/RequestsPage"));
const RequestDetailPage         = lazy(() => import("./pages/RequestDetailPage"));
const ProblemsPage              = lazy(() => import("./pages/ProblemsPage"));
const ProblemDetailPage         = lazy(() => import("./pages/ProblemDetailPage"));
const ProfilePage               = lazy(() => import("./pages/ProfilePage"));
const SettingsPage              = lazy(() => import("./pages/SettingsPage"));
const ScenariosPage             = lazy(() => import("./pages/ScenariosPage"));
const AutomationPlatformPage    = lazy(() => import("./pages/automations/AutomationPlatformPage"));
const AutomationRuleFormPage    = lazy(() => import("./pages/automations/AutomationRuleFormPage"));
const AutomationExecutionsPage  = lazy(() => import("./pages/automations/AutomationExecutionsPage"));
const OutboundWebhooksPage      = lazy(() => import("./pages/automations/OutboundWebhooksPage"));
const RoutingConfigPage         = lazy(() => import("./pages/automations/RoutingConfigPage"));
const ChangesPage               = lazy(() => import("./pages/ChangesPage"));
const ChangeDetailPage          = lazy(() => import("./pages/ChangeDetailPage"));
const NewChangePage             = lazy(() => import("./pages/NewChangePage"));
const NewTicketPage             = lazy(() => import("./pages/NewTicketPage"));
const NewProblemPage            = lazy(() => import("./pages/NewProblemPage"));
const NewRequestPage            = lazy(() => import("./pages/NewRequestPage"));
const PortalLoginPage           = lazy(() => import("./pages/portal/PortalLoginPage"));
const PortalRegisterPage        = lazy(() => import("./pages/portal/PortalRegisterPage"));
const PortalTicketsPage         = lazy(() => import("./pages/portal/PortalTicketsPage"));
const PortalTicketDetailPage    = lazy(() => import("./pages/portal/PortalTicketDetailPage"));
const PortalNewTicketPage       = lazy(() => import("./pages/portal/PortalNewTicketPage"));
const PortalRequestsPage        = lazy(() => import("./pages/portal/PortalRequestsPage"));
const PortalRequestDetailPage   = lazy(() => import("./pages/portal/PortalRequestDetailPage"));
const PortalNewRequestPage      = lazy(() => import("./pages/portal/PortalNewRequestPage"));
const PortalAccountPage         = lazy(() => import("./pages/portal/PortalAccountPage"));
const NotificationsPage         = lazy(() => import("./pages/NotificationsPage"));
const CmdbPage                  = lazy(() => import("./pages/CmdbPage"));
const CmdbDetailPage            = lazy(() => import("./pages/CmdbDetailPage"));
const AssetsPage                = lazy(() => import("./pages/AssetsPage"));
const AssetDetailPage           = lazy(() => import("./pages/AssetDetailPage"));
const InventoryLocationsPage    = lazy(() => import("./pages/InventoryLocationsPage"));
const ContractsPage             = lazy(() => import("./pages/ContractsPage"));
const SoftwareLicensesPage      = lazy(() => import("./pages/SoftwareLicensesPage"));
const SoftwareLicenseDetailPage = lazy(() => import("./pages/SoftwareLicenseDetailPage"));
const SaaSSubscriptionsPage     = lazy(() => import("./pages/SaaSSubscriptionsPage"));
const SaaSSubscriptionDetailPage = lazy(() => import("./pages/SaaSSubscriptionDetailPage"));
const DiscoveryPage             = lazy(() => import("./pages/DiscoveryPage"));
const DiscoverySyncRunPage      = lazy(() => import("./pages/DiscoverySyncRunPage"));
const CatalogPage               = lazy(() => import("./pages/CatalogPage"));
const CatalogItemPage           = lazy(() => import("./pages/CatalogItemPage"));
const CatalogAdminPage          = lazy(() => import("./pages/CatalogAdminPage"));
const PortalCatalogPage         = lazy(() => import("./pages/portal/PortalCatalogPage"));
const PortalCatalogItemPage     = lazy(() => import("./pages/portal/PortalCatalogItemPage"));
const HelpCenterPage            = lazy(() => import("./pages/help/HelpCenterPage"));
const HelpArticlePage           = lazy(() => import("./pages/help/HelpArticlePage"));
const CustomersPage             = lazy(() => import("./pages/CustomersPage"));
const CustomerDetailPage        = lazy(() => import("./pages/CustomerDetailPage"));
const OrganizationsPage         = lazy(() => import("./pages/OrganizationsPage"));
const OrganizationDetailPage    = lazy(() => import("./pages/OrganizationDetailPage"));

// Reports — shipped as their own chunks so users who never open Reports
// don't pay the cost of charting libraries and complex visual builders.
const ReportsLayout             = lazy(() => import("./pages/reports/ReportsLayout"));
const OverviewReport            = lazy(() => import("./pages/reports/OverviewReport"));
const TicketsReport             = lazy(() => import("./pages/reports/TicketsReport"));
const SlaReport                 = lazy(() => import("./pages/reports/SlaReport"));
const IncidentsReport           = lazy(() => import("./pages/reports/IncidentsReport"));
const CsatReport                = lazy(() => import("./pages/reports/CsatReport"));
const AgentReport               = lazy(() => import("./pages/reports/AgentReport"));
const TeamReport                = lazy(() => import("./pages/reports/TeamReport"));
const KbReport                  = lazy(() => import("./pages/reports/KbReport"));
const RealtimeReport            = lazy(() => import("./pages/reports/RealtimeReport"));
const CustomReportPage          = lazy(() => import("./pages/reports/CustomReportPage"));
const ReportLibraryPage         = lazy(() => import("./pages/reports/ReportLibraryPage"));
const RequestsReport            = lazy(() => import("./pages/reports/RequestsReport"));
const ProblemsReport            = lazy(() => import("./pages/reports/ProblemsReport"));
const ApprovalsReport           = lazy(() => import("./pages/reports/ApprovalsReport"));
const ChangesReport             = lazy(() => import("./pages/reports/ChangesReport"));
const AssetsReport              = lazy(() => import("./pages/reports/AssetsReport"));
const InsightsReport            = lazy(() => import("./pages/reports/InsightsReport"));

const DemoDataPage              = lazy(() => import("./pages/DemoDataPage"));
const TrashPage                 = lazy(() => import("./pages/TrashPage"));
const AuditLogPage              = lazy(() => import("./pages/AuditLogPage"));
const DutyPlanPage              = lazy(() => import("./pages/DutyPlanPage"));
const DutyPlanTeamPage          = lazy(() => import("./pages/DutyPlanTeamPage"));
const DutyPlanDetailPage        = lazy(() => import("./pages/DutyPlanDetailPage"));

/**
 * Suspense fallback shown briefly while a route's chunk loads from the
 * server. Sized to fill the layout viewport area; deliberately quiet so
 * a 50–200 ms chunk fetch doesn't flash a giant spinner at the user.
 */
function RouteSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
    </div>
  );
}

/**
 * Redirects "/" to the user's preferred landing page.
 * Falls back to the overview/home if no preference is set or while loading.
 */
function DefaultLandingRoute() {
  const { data, isLoading } = useMe();
  if (isLoading) return null;
  const landing = data?.user?.preference?.defaultDashboard;
  if (landing === "tickets") return <Navigate to="/tickets" replace />;
  return <HomePage />;
}

/** Syncs the page title and favicon to the live branding settings. */
function BrandingEffect() {
  const { data: branding } = useBranding();

  useEffect(() => {
    if (branding?.companyName) document.title = branding.companyName;
  }, [branding?.companyName]);

  useEffect(() => {
    if (!branding?.faviconDataUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.faviconDataUrl;
  }, [branding?.faviconDataUrl]);

  return null;
}

function App() {
  return (
    <>
      <BrandingEffect />
      <Suspense fallback={<RouteSpinner />}>
      <Routes>
      {/* ── Agent / admin ───────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DefaultLandingRoute />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          {/* ITSM modules */}
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/new" element={<NewRequestPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/new" element={<NewIncidentPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/new" element={<NewProblemPage />} />
          <Route path="/problems/:id" element={<ProblemDetailPage />} />
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/changes/new" element={<NewChangePage />} />
          <Route path="/changes/:id" element={<ChangeDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          {/* Duty Plans */}
          <Route path="/duty-plans" element={<DutyPlanPage />} />
          <Route path="/duty-plans/:teamId" element={<DutyPlanTeamPage />} />
          <Route path="/duty-plans/:teamId/:planId" element={<DutyPlanDetailPage />} />
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
            <Route path="/admin/trash" element={<TrashPage />} />
            <Route path="/admin/audit-log" element={<AuditLogPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            {/* Automation Platform */}
            <Route path="/automations" element={<AutomationPlatformPage />} />
            <Route path="/automations/rules/new" element={<AutomationRuleFormPage />} />
            <Route path="/automations/rules/:id" element={<AutomationRuleFormPage />} />
            <Route path="/automations/executions" element={<AutomationExecutionsPage />} />
            <Route path="/automations/webhooks" element={<OutboundWebhooksPage />} />
            <Route path="/automations/routing" element={<RoutingConfigPage />} />
            {/* Legacy scenarios — kept for backward compatibility */}
            <Route path="/automations/scenarios" element={<ScenariosPage />} />
            <Route path="/catalog/admin" element={<CatalogAdminPage />} />
            <Route path="/demo-data" element={<DemoDataPage />} />
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
              <Route path="insights"  element={<InsightsReport />} />
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
          <Route path="/portal/account" element={<PortalAccountPage />} />
        </Route>
      </Route>

      {/* ── Public help center ──────────────────────────────────────────────── */}
      <Route element={<HelpLayout />}>
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/help/articles/:slug" element={<HelpArticlePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    <Toaster richColors closeButton position="top-right" />
    </>
  );
}

export default App;
