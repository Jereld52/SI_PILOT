import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Building2,
  FileText,
  FolderKanban,
  LifeBuoy,
  MonitorSmartphone,
  Search,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SearchResponse } from "@/types/api";

const typeIcons: Record<string, LucideIcon> = {
  user: UserRound,
  agent: Users,
  asset: MonitorSmartphone,
  ticket: LifeBuoy,
  contract: FileText,
  project: FolderKanban,
  document: BookOpen,
  supplier: Building2,
};

export function GlobalSearch() {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () =>
      apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(debounced)}&limit=4`),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });

  const show = focused && value.trim().length >= 2;

  const select = (link: string) => {
    navigate(link);
    setValue("");
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-lg">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && data?.results[0]) {
            select(data.results[0].link);
          }
          if (event.key === "Escape") {
            setFocused(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Rechercher un agent, un équipement, un ticket…"
        aria-label="Recherche globale"
        className="h-9 w-full rounded-lg border border-border-soft bg-surface/70 pl-9 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-2 focus:border-primary-strong/50 focus:bg-surface focus:ring-2 focus:ring-primary-strong/10"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border-soft bg-background-soft px-1.5 py-0.5 text-[10px] text-muted-2 sm:block">
        Ctrl K
      </kbd>

      {show ? (
        <div
          className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-2xl animate-zoom-in"
          onMouseDown={(event) => event.preventDefault()}
        >
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted">
              <Spinner className="h-4 w-4" />
              Recherche…
            </div>
          ) : data && data.results.length > 0 ? (
            <div className="space-y-0.5">
              {data.results.map((result) => {
                const Icon = typeIcons[result.type] ?? Search;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => select(result.link)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-soft bg-background-soft text-muted">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {result.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted-2">
                        {result.subtitle ?? result.type}
                      </span>
                    </span>
                  </button>
                );
              })}
              <p className="px-2.5 pb-1 pt-2 text-[10px] text-muted-2">
                {data.total} résultat(s) · {data.took_ms} ms
              </p>
            </div>
          ) : (
            <p className={cn("px-3 py-4 text-xs text-muted")}>
              Aucun résultat pour « {value.trim()} ».
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
