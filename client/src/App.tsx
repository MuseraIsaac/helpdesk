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
import TicketsPage from "./pages/TicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
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
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/macros" element={<MacrosPage />} />
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
