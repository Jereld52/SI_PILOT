import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/features/admin/AdminLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { RequirePermission } from "@/features/auth/RequirePermission";
import { ModulePlaceholder } from "@/features/placeholders/ModulePlaceholder";
import { NotFoundPage } from "@/features/placeholders/NotFoundPage";
import { modules } from "@/features/placeholders/modules";

const SetupPage = lazy(() =>
  import("@/features/setup/SetupPage").then((module) => ({ default: module.SetupPage })),
);

const AdminImportExportPage = lazy(() =>
  import("@/features/admin/AdminImportExportPage").then((module) => ({
    default: module.AdminImportExportPage,
  })),
);
const AdminSourcesPage = lazy(() =>
  import("@/features/admin/AdminSourcesPage").then((module) => ({
    default: module.AdminSourcesPage,
  })),
);
const AdminWaptPage = lazy(() =>
  import("@/features/admin/AdminWaptPage").then((module) => ({
    default: module.AdminWaptPage,
  })),
);
const AuditPage = lazy(() =>
  import("@/features/admin/AuditPage").then((module) => ({ default: module.AuditPage })),
);
const RolesPage = lazy(() =>
  import("@/features/admin/RolesPage").then((module) => ({ default: module.RolesPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/admin/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const AdminSystemPage = lazy(() =>
  import("@/features/admin/AdminSystemPage").then((module) => ({
    default: module.AdminSystemPage,
  })),
);
const UsersPage = lazy(() =>
  import("@/features/admin/UsersPage").then((module) => ({ default: module.UsersPage })),
);
const AgentsPage = lazy(() =>
  import("@/features/agents/AgentsPage").then((module) => ({ default: module.AgentsPage })),
);
const AssetsPage = lazy(() =>
  import("@/features/assets/AssetsPage").then((module) => ({ default: module.AssetsPage })),
);
const BudgetPage = lazy(() =>
  import("@/features/budget/BudgetPage").then((module) => ({ default: module.BudgetPage })),
);
const CalendarPage = lazy(() =>
  import("@/features/calendar/CalendarPage").then((module) => ({
    default: module.CalendarPage,
  })),
);
const CommunicationLayout = lazy(() =>
  import("@/features/communication/CommunicationLayout").then((module) => ({
    default: module.CommunicationLayout,
  })),
);
const CommunicationsPage = lazy(() =>
  import("@/features/communication/CommunicationsPage").then((module) => ({
    default: module.CommunicationsPage,
  })),
);
const MeetingsPage = lazy(() =>
  import("@/features/communication/MeetingsPage").then((module) => ({
    default: module.MeetingsPage,
  })),
);
const ManagerPointsPage = lazy(() =>
  import("@/features/communication/ManagerPointsPage").then((module) => ({
    default: module.ManagerPointsPage,
  })),
);
const TrainingsPage = lazy(() =>
  import("@/features/communication/TrainingsPage").then((module) => ({
    default: module.TrainingsPage,
  })),
);
const ContractsPage = lazy(() =>
  import("@/features/contracts/ContractsPage").then((module) => ({
    default: module.ContractsPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const DocumentsPage = lazy(() =>
  import("@/features/documents/DocumentsPage").then((module) => ({
    default: module.DocumentsPage,
  })),
);
const ExportsPage = lazy(() =>
  import("@/features/exports/ExportsPage").then((module) => ({
    default: module.ExportsPage,
  })),
);
const InfrastructurePage = lazy(() =>
  import("@/features/infrastructure/InfrastructurePage").then((module) => ({
    default: module.InfrastructurePage,
  })),
);
const MobileLinesPage = lazy(() =>
  import("@/features/mobile/MobileLinesPage").then((module) => ({
    default: module.MobileLinesPage,
  })),
);
const HelpPage = lazy(() =>
  import("@/features/help/HelpPage").then((module) => ({ default: module.HelpPage })),
);
const NetworkSharesPage = lazy(() =>
  import("@/features/infrastructure/NetworkSharesPage").then((module) => ({
    default: module.NetworkSharesPage,
  })),
);
const ReferentialsPage = lazy(() =>
  import("@/features/referentials/ReferentialsPage").then((module) => ({
    default: module.ReferentialsPage,
  })),
);
const ReservationsPage = lazy(() =>
  import("@/features/reservations/ReservationsPage").then((module) => ({
    default: module.ReservationsPage,
  })),
);
const ProjectsPage = lazy(() =>
  import("@/features/projects/ProjectsPage").then((module) => ({
    default: module.ProjectsPage,
  })),
);
const RgpdPage = lazy(() =>
  import("@/features/rgpd/RgpdPage").then((module) => ({ default: module.RgpdPage })),
);
const SecurityPage = lazy(() =>
  import("@/features/security/SecurityPage").then((module) => ({
    default: module.SecurityPage,
  })),
);
const StatisticsPage = lazy(() =>
  import("@/features/statistics/StatisticsPage").then((module) => ({
    default: module.StatisticsPage,
  })),
);
const SoftwarePage = lazy(() =>
  import("@/features/software/SoftwarePage").then((module) => ({
    default: module.SoftwarePage,
  })),
);
const StockPage = lazy(() =>
  import("@/features/stock/StockPage").then((module) => ({ default: module.StockPage })),
);
const SupervisionPage = lazy(() =>
  import("@/features/supervision/SupervisionPage").then((module) => ({
    default: module.SupervisionPage,
  })),
);
const SuppliersPage = lazy(() =>
  import("@/features/suppliers/SuppliersPage").then((module) => ({
    default: module.SuppliersPage,
  })),
);
const TicketsPage = lazy(() =>
  import("@/features/tickets/TicketsPage").then((module) => ({
    default: module.TicketsPage,
  })),
);

const implementedModules = new Set([
  "agents",
  "parc",
  "demandes",
  "rgpd",
  "contrats",
  "budget",
  "infrastructure",
  "supervision",
  "reservations",
  "cybersecurite",
  "projets",
  "documentation",
  "calendrier",
]);
const pendingModules = modules.filter((module) => !implementedModules.has(module.path));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/setup"
        element={
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center px-4">
                <div className="h-64 w-full max-w-xl animate-pulse rounded-xl bg-surface-2" />
              </div>
            }
          >
            <SetupPage />
          </Suspense>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <RequirePermission permission="dashboard.read">
                <DashboardPage />
              </RequirePermission>
            }
          />

          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route
              path="users"
              element={
                <RequirePermission permission="admin.users.read">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="roles"
              element={
                <RequirePermission permission="admin.roles.read">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="audit"
              element={
                <RequirePermission permission="audit.read">
                  <AuditPage />
                </RequirePermission>
              }
            />
            <Route
              path="referentials"
              element={
                <RequirePermission permission="referentials.read">
                  <ReferentialsPage />
                </RequirePermission>
              }
            />
            <Route
              path="sources"
              element={
                <RequirePermission permission="admin.settings.read">
                  <AdminSourcesPage />
                </RequirePermission>
              }
            />
            <Route
              path="wapt"
              element={
                <RequirePermission permission="admin.settings.read">
                  <AdminWaptPage />
                </RequirePermission>
              }
            />
            <Route
              path="import-export"
              element={
                <RequirePermission permission="imports.preview">
                  <AdminImportExportPage />
                </RequirePermission>
              }
            />
            <Route
              path="settings"
              element={
                <RequirePermission permission="admin.settings.read">
                  <SettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="system"
              element={
                <RequirePermission permission="admin.settings.read">
                  <AdminSystemPage />
                </RequirePermission>
              }
            />
          </Route>

          <Route
            path="agents"
            element={
              <RequirePermission permission="agents.read">
                <AgentsPage />
              </RequirePermission>
            }
          />

          <Route
            path="parc"
            element={
              <RequirePermission permission="assets.read">
                <AssetsPage />
              </RequirePermission>
            }
          />

          <Route
            path="logiciels"
            element={
              <RequirePermission permission="assets.read">
                <SoftwarePage />
              </RequirePermission>
            }
          />

          <Route
            path="telephonie"
            element={
              <RequirePermission permission="mobile_lines.read">
                <MobileLinesPage />
              </RequirePermission>
            }
          />

          <Route
            path="statistiques"
            element={
              <RequirePermission permission="statistics.read">
                <StatisticsPage />
              </RequirePermission>
            }
          />

          <Route
            path="exports"
            element={
              <RequirePermission permission="exports.run">
                <ExportsPage />
              </RequirePermission>
            }
          />

          <Route
            path="demandes"
            element={
              <RequirePermission permission="tickets.read">
                <TicketsPage />
              </RequirePermission>
            }
          />

          <Route
            path="fournisseurs"
            element={
              <RequirePermission permission="suppliers.read">
                <SuppliersPage />
              </RequirePermission>
            }
          />

          <Route
            path="stock"
            element={
              <RequirePermission permission="stock.read">
                <StockPage />
              </RequirePermission>
            }
          />

          <Route
            path="reservations"
            element={
              <RequirePermission permission="reservations.read">
                <ReservationsPage />
              </RequirePermission>
            }
          />

          <Route
            path="rgpd"
            element={
              <RequirePermission permission="rgpd.read">
                <RgpdPage />
              </RequirePermission>
            }
          />

          <Route
            path="contrats"
            element={
              <RequirePermission permission="contracts.read">
                <ContractsPage />
              </RequirePermission>
            }
          />
          <Route
            path="contrats/:contractId"
            element={
              <RequirePermission permission="contracts.read">
                <ContractsPage />
              </RequirePermission>
            }
          />

          <Route
            path="budget"
            element={
              <RequirePermission permission="budget.read">
                <BudgetPage />
              </RequirePermission>
            }
          />

          <Route
            path="infrastructure"
            element={
              <RequirePermission permission="infrastructure.read">
                <InfrastructurePage />
              </RequirePermission>
            }
          />

          <Route
            path="supervision"
            element={
              <RequirePermission permission="infrastructure.topology">
                <SupervisionPage />
              </RequirePermission>
            }
          />

          <Route
            path="partages-reseau"
            element={
              <RequirePermission permission="infrastructure.read">
                <NetworkSharesPage />
              </RequirePermission>
            }
          />

          <Route
            path="cybersecurite"
            element={
              <RequirePermission permission="security.read">
                <SecurityPage />
              </RequirePermission>
            }
          />

          <Route
            path="projets"
            element={
              <RequirePermission permission="projects.read">
                <ProjectsPage />
              </RequirePermission>
            }
          />

          <Route
            path="documentation"
            element={
              <RequirePermission permission="documents.read">
                <DocumentsPage />
              </RequirePermission>
            }
          />

          <Route
            path="calendrier"
            element={
              <RequirePermission permission="calendar.read">
                <CalendarPage />
              </RequirePermission>
            }
          />

          <Route path="communication" element={<CommunicationLayout />}>
            <Route index element={<Navigate to="/communication/communications" replace />} />
            <Route
              path="communications"
              element={
                <RequirePermission permission="communications.read">
                  <CommunicationsPage />
                </RequirePermission>
              }
            />
            <Route
              path="reunions"
              element={
                <RequirePermission permission="meetings.read">
                  <MeetingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="formations"
              element={
                <RequirePermission permission="trainings.read">
                  <TrainingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="points"
              element={
                <RequirePermission permission="manager_points.read">
                  <ManagerPointsPage />
                </RequirePermission>
              }
            />
          </Route>

          <Route path="aide" element={<HelpPage />} />
          <Route path="aide/:slug" element={<HelpPage />} />

          <Route path="imports" element={<Navigate to="/admin/import-export" replace />} />

          {pendingModules.map((module) => (
            <Route
              key={module.path}
              path={module.path}
              element={
                <RequirePermission permission={module.permission}>
                  <ModulePlaceholder
                    title={module.title}
                    description={module.description}
                    phase={module.phase}
                    icon={module.icon}
                    features={module.features}
                  />
                </RequirePermission>
              }
            />
          ))}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      </Routes>
  );
}
