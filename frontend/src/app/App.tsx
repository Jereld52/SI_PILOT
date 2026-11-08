import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/features/admin/AdminLayout";
import { AuditPage } from "@/features/admin/AuditPage";
import { RolesPage } from "@/features/admin/RolesPage";
import { SettingsPage } from "@/features/admin/SettingsPage";
import { UsersPage } from "@/features/admin/UsersPage";
import { AgentsPage } from "@/features/agents/AgentsPage";
import { AssetsPage } from "@/features/assets/AssetsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { RequirePermission } from "@/features/auth/RequirePermission";
import { BudgetPage } from "@/features/budget/BudgetPage";
import { ContractsPage } from "@/features/contracts/ContractsPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { InfrastructurePage } from "@/features/infrastructure/InfrastructurePage";
import { MobileLinesPage } from "@/features/mobile/MobileLinesPage";
import { ModulePlaceholder } from "@/features/placeholders/ModulePlaceholder";
import { NotFoundPage } from "@/features/placeholders/NotFoundPage";
import { modules } from "@/features/placeholders/modules";
import { ReferentialsPage } from "@/features/referentials/ReferentialsPage";
import { RgpdPage } from "@/features/rgpd/RgpdPage";
import { SecurityPage } from "@/features/security/SecurityPage";
import { SuppliersPage } from "@/features/suppliers/SuppliersPage";
import { TicketsPage } from "@/features/tickets/TicketsPage";

const implementedModules = new Set([
  "agents",
  "parc",
  "demandes",
  "rgpd",
  "contrats",
  "budget",
  "infrastructure",
  "cybersecurite",
]);
const pendingModules = modules.filter((module) => !implementedModules.has(module.path));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
              path="settings"
              element={
                <RequirePermission permission="admin.settings.read">
                  <SettingsPage />
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
            path="telephonie"
            element={
              <RequirePermission permission="mobile_lines.read">
                <MobileLinesPage />
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
            path="cybersecurite"
            element={
              <RequirePermission permission="security.read">
                <SecurityPage />
              </RequirePermission>
            }
          />

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
