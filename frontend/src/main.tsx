import "@fontsource-variable/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { App } from "@/app/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AiAssistantProvider } from "@/features/ai/AiAssistantProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { BrandingProvider } from "@/features/branding/BrandingProvider";
import { ModulesProvider } from "@/features/modules/ModulesProvider";
import { ThemeProvider, useTheme } from "@/features/theme/ThemeProvider";
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme === "dark" ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <BrandingProvider>
            <AuthProvider>
              <ModulesProvider>
                <AiAssistantProvider>
                  <TooltipProvider delayDuration={250}>
                    <App />
                    <ThemedToaster />
                  </TooltipProvider>
                </AiAssistantProvider>
              </ModulesProvider>
            </AuthProvider>
          </BrandingProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
