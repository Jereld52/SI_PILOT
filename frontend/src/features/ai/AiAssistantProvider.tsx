import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useModules } from "@/features/modules/ModulesProvider";
import { AiDialog } from "@/features/ai/AiDialog";
import type { AiContextRef } from "@/types/api";

interface AiAssistantContextValue {
  open: (context?: AiContextRef | null, prompt?: string) => void;
  close: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue>({
  open: () => undefined,
  close: () => undefined,
});

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const { isEnabled } = useModules();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AiContextRef | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);

  const openAssistant = useCallback(
    (nextContext?: AiContextRef | null, prompt?: string) => {
      if (!isEnabled("ai")) return;
      setContext(nextContext ?? null);
      setInitialPrompt(prompt);
      setOpen(true);
    },
    [isEnabled],
  );

  const value = useMemo<AiAssistantContextValue>(
    () => ({ open: openAssistant, close: () => setOpen(false) }),
    [openAssistant],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
      <AiDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setInitialPrompt(undefined);
            setContext(null);
          }
        }}
        context={context}
        initialPrompt={initialPrompt}
      />
    </AiAssistantContext.Provider>
  );
}

export function useAiAssistant(): AiAssistantContextValue {
  return useContext(AiAssistantContext);
}
