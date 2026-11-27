import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const SEQUENCE_TIMEOUT_MS = 1500;

const SEQUENCE_ROUTES: Record<string, { path: string; label: string }> = {
  a: { path: "/aujourdhui", label: "Aujourd'hui" },
  p: { path: "/pilotage", label: "Mode pilotage" },
  c: { path: "/calendrier", label: "Calendrier" },
  d: { path: "/", label: "Vue générale" },
  q: { path: "/qualite-donnees", label: "Qualité des données" },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      pending.current = null;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "?") {
        event.preventDefault();
        toast("Raccourcis clavier", {
          description:
            "g puis a : Aujourd'hui · g puis p : Mode pilotage · g puis c : Calendrier · g puis d : Vue générale · g puis q : Qualité des données",
          duration: 9000,
        });
        return;
      }

      const key = event.key.toLowerCase();

      if (pending.current === "g") {
        const route = SEQUENCE_ROUTES[key];
        reset();
        if (route) {
          event.preventDefault();
          navigate(route.path);
          toast.success(route.label, { duration: 1200 });
        }
        return;
      }

      if (key === "g") {
        pending.current = "g";
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(reset, SEQUENCE_TIMEOUT_MS);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      reset();
    };
  }, [navigate]);
}
