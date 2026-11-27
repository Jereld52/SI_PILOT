import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { apiFetch } from "@/lib/api";
import type { DashboardToday, DayPlanItem } from "@/types/api";

export function useTodayPlan(refetchInterval = 5 * 60_000) {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const allowed = hasPermission("dashboard.read");

  const query = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => apiFetch<DashboardToday>("/dashboard/today"),
    refetchInterval,
    enabled: allowed,
  });

  const items = useMemo(
    () =>
      (query.data?.plan?.items ?? []).filter((item: DayPlanItem) => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.module_key && !isEnabled(item.module_key)) return false;
        return true;
      }),
    [query.data, hasPermission, isEnabled],
  );

  return {
    allowed,
    query,
    data: query.data,
    items,
  };
}
