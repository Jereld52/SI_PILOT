import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import type { NotificationItem, Page } from "@/types/api";

const severityDot: Record<string, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
  danger: "bg-danger",
};

export function NotificationsMenu() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "menu"],
    queryFn: () => apiFetch<Page<NotificationItem>>("/notifications?page_size=6"),
    refetchInterval: 60_000,
  });

  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiFetch<{ unread: number; total: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast.success("Notifications marquées comme lues.");
    },
  });

  const unread = countQuery.data?.unread ?? 0;
  const items = notificationsQuery.data?.items ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:border-border-soft hover:bg-surface-2 hover:text-foreground"
          aria-label={`Notifications${unread ? `, ${unread} non lue(s)` : ""}`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border-soft px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-foreground">Notifications</p>
            <p className="text-[10px] text-muted-2">
              {unread > 0 ? `${unread} non lue(s)` : "Tout est à jour"}
            </p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" />
              Tout lire
            </button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {notificationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <Inbox className="mb-2 h-6 w-6 text-muted-2" aria-hidden="true" />
              <p className="text-xs text-muted">Aucune notification.</p>
              <p className="mt-1 text-[10px] text-muted-2">
                Les alertes de contrats, tickets et échéances apparaîtront ici.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.read_at) markRead.mutate(item.id);
                  if (item.link) navigate(item.link);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
                  !item.read_at && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    severityDot[item.severity] ?? "bg-muted-2",
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {item.title}
                  </span>
                  {item.body ? (
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-[10px] text-muted-2">
                    {formatRelative(item.created_at)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
