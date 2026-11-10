import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { findModuleKeyForPath } from "@/components/layout/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import type { ModuleStatus } from "@/types/api";

interface ModulesContextValue {
  disabled: string[];
  isEnabled: (key?: string | null) => boolean;
  isPathEnabled: (pathname: string) => boolean;
  refresh: () => void;
}

const ModulesContext = createContext<ModulesContextValue>({
  disabled: [],
  isEnabled: () => true,
  isPathEnabled: () => true,
  refresh: () => undefined,
});

export function ModulesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["modules", "status"],
    queryFn: () => apiFetch<ModuleStatus>("/modules/status"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const disabled = useMemo(() => query.data?.disabled ?? [], [query.data]);

  const isEnabled = useCallback(
    (key?: string | null) => !key || !disabled.includes(key),
    [disabled],
  );

  const isPathEnabled = useCallback(
    (pathname: string) => {
      const key = findModuleKeyForPath(pathname);
      return !key || !disabled.includes(key);
    },
    [disabled],
  );

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const value = useMemo<ModulesContextValue>(
    () => ({ disabled, isEnabled, isPathEnabled, refresh }),
    [disabled, isEnabled, isPathEnabled, refresh],
  );

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesContextValue {
  return useContext(ModulesContext);
}
