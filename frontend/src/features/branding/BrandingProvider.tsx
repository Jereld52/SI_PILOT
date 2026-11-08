import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { applyPrimaryColor } from "@/lib/colors";
import { apiFetch } from "@/lib/api";
import type { BrandingInfo } from "@/types/api";

const FALLBACK_BRANDING: BrandingInfo = {
  app_name: "SI PILOT",
  organization_name: "",
  tagline: "Cockpit du système d'information",
  description:
    "Centralisez votre parc, vos demandes, vos contrats, votre budget, vos projets et votre sécurité dans un outil unique.",
  support_email: null,
  primary_color: "#772B2F",
  logo_url: "/logoweb.png",
  logo_custom: false,
  logo_updated_at: null,
  version: "0.1.0",
};

interface BrandingContextValue extends BrandingInfo {
  refresh: () => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  ...FALLBACK_BRANDING,
  refresh: () => undefined,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["branding"],
    queryFn: () => apiFetch<BrandingInfo>("/branding"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const branding = query.data ?? FALLBACK_BRANDING;

  useEffect(() => {
    const organization = branding.organization_name.trim();
    document.title = organization
      ? `${branding.app_name} — ${organization}`
      : branding.app_name;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) {
      meta.content = organization
        ? `${branding.tagline} — ${organization}`
        : branding.tagline;
    }
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = branding.logo_custom ? branding.logo_url : "/favicon.png";
  }, [branding]);

  useEffect(() => {
    applyPrimaryColor(branding.primary_color);
  }, [branding.primary_color]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      ...branding,
      refresh: () => {
        void query.refetch();
      },
    }),
    [branding, query.refetch],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
