import { Navigate, Outlet, useLocation } from "react-router-dom";

import { BrandMark } from "@/components/layout/BrandMark";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/AuthProvider";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <BrandMark className="scale-110" />
        <Spinner />
        <p className="text-xs text-muted">Vérification de la session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
