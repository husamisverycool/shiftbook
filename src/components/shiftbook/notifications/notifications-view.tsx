"use client";

// Pattern: docs/patterns/notifications.md — Linear's Inbox: rows newest first, an unread dot, the
// kind's icon, what happened and to what, the time; J/K move, U read or unread, Alt+U all read,
// Backspace deletes, Shift+Backspace deletes the read ones, Enter opens.
import { BellIcon, CalendarClockIcon, CircleAlertIcon, ClipboardCheckIcon, ClipboardXIcon, HandCoinsIcon, MessageCircleIcon, ReceiptTextIcon, ShieldAlertIcon, UserCheckIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAction, deleteReadAction, markAllReadAction, markReadAction } from "@/app/[locale]/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { NotificationKind } from "@/server/db/schema";
import { cn } from "@/lib/utils";
import { useDateTime } from "../agency-zone";
import { typing } from "../app-sidebar";
import { EmptyState } from "../empty-state";
import { Page, PageHeader, PageTabs } from "../page";

export interface InboxRow {
  id: string;
  kind: NotificationKind;
  href: string;
  read: boolean;
  at: string;
  title: string;
  line: string;
}

const ICONS: Record<NotificationKind, LucideIcon> = {
  approval_returned: ClipboardCheckIcon,
  approval_disputed: ClipboardXIcon,
  run_blocked: CircleAlertIcon,
  obligation_due_soon: CalendarClockIcon,
  obligation_overdue: ShieldAlertIcon,
  invoice_overdue: ReceiptTextIcon,
  promise_broken: HandCoinsIcon,
  shift_confirmed: UserCheckIcon,
  staff_requested: UsersIcon,
  worker_message: MessageCircleIcon,
};

export function NotificationsView({ rows, show }: { rows: InboxRow[]; show: "unread" | "all" }) {
  const t = useTranslations("notify");
  const router = useRouter();
  const when = useDateTime();
  const [pending, start] = useTransition();
  // Read and deleted changes show at once; the server's answer follows.
  const [local, setLocal] = useState<Record<string, "read" | "unread" | "deleted">>({});
  const all = useMemo(() => rows.filter((r) => local[r.id] !== "deleted").map((r) => ({ ...r, read: local[r.id] ? local[r.id] === "read" : r.read })), [rows, local]);
  const shown = show === "unread" ? all.filter((r) => !r.read || local[r.id] === "read") : all;
  const unread = all.filter((r) => !r.read).length;
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const current = shown[Math.min(selected, shown.length - 1)];

  const setRead = useCallback(
    (ids: string[], read: boolean) => {
      setLocal((l) => ({ ...l, ...Object.fromEntries(ids.map((id) => [id, read ? "read" : "unread"])) }));
      start(async () => void (await markReadAction(ids, read)));
    },
    [start],
  );
  const remove = useCallback(
    (id: string) => {
      setLocal((l) => ({ ...l, [id]: "deleted" }));
      start(async () => {
        await deleteAction([id]);
        toast.success(t("deleted"));
      });
    },
    [start, t],
  );
  const allRead = useCallback(() => {
    setLocal((l) => ({ ...l, ...Object.fromEntries(all.map((r) => [r.id, "read"])) }));
    start(async () => {
      await markAllReadAction();
      toast.success(t("markedAllRead"));
    });
  }, [all, start, t]);
  const removeRead = useCallback(() => {
    setLocal((l) => ({ ...l, ...Object.fromEntries(all.filter((r) => r.read).map((r) => [r.id, "deleted"])) }));
    start(async () => {
      await deleteReadAction();
      toast.success(t("deletedRead"));
    });
  }, [all, start, t]);
  const open = useCallback(
    (row: InboxRow) => {
      if (!row.read) setRead([row.id], true);
      router.push(row.href);
    },
    [router, setRead],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || typing(e.target) || document.querySelector("[role=dialog]")) return;
      const key = e.key.toLowerCase();
      if (e.altKey && key === "u") {
        e.preventDefault();
        allRead();
        return;
      }
      if (e.altKey) return;
      if (e.shiftKey && e.key === "Backspace") {
        e.preventDefault();
        removeRead();
        return;
      }
      if (shown.length === 0) return;
      const move = (to: number) => {
        e.preventDefault();
        const next = Math.max(0, Math.min(shown.length - 1, to));
        setSelected(next);
        rowRefs.current[next]?.focus();
      };
      if (key === "j" || e.key === "ArrowDown") move(selected + 1);
      else if (key === "k" || e.key === "ArrowUp") move(selected - 1);
      else if (key === "u" && current) {
        e.preventDefault();
        setRead([current.id], !current.read);
      } else if (e.key === "Backspace" && current) {
        e.preventDefault();
        remove(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selected, current, allRead, removeRead, remove, setRead]);

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button variant="outline" onClick={removeRead} disabled={pending || !all.some((r) => r.read)} data-testid="delete-read">
              {t("deleteRead")}
            </Button>
            <Button variant="outline" onClick={allRead} disabled={pending || unread === 0} data-testid="mark-all-read">
              {t("markAllRead")}
            </Button>
          </>
        }
        tabs={
          <PageTabs
            label={t("tabsLabel")}
            current={show}
            tabs={[
              { key: "unread", label: t("tabs.unread"), href: { pathname: "/notifications" }, count: unread, testId: "tab-unread" },
              { key: "all", label: t("tabs.all"), href: { pathname: "/notifications", query: { show: "all" } }, testId: "tab-all" },
            ]}
          />
        }
      />
      {shown.length === 0 ? (
        <EmptyState icon={BellIcon} title={show === "unread" && all.length > 0 ? t("emptyUnread") : t("empty")} description={t("emptyBody")} testId="notifications-empty" />
      ) : (
        <div className="flex flex-col gap-2">
          <ul aria-label={t("listLabel")} className="flex flex-col" data-testid="notifications">
            {shown.map((row, i) => {
              const Icon = ICONS[row.kind];
              return (
                <li key={row.id} className="border-b last:border-b-0">
                  <a
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    href={row.href}
                    onClick={(e) => {
                      e.preventDefault();
                      open(row);
                    }}
                    onFocus={() => setSelected(i)}
                    onMouseEnter={() => setSelected(i)}
                    data-testid="notification"
                    data-kind={row.kind}
                    data-read={row.read || undefined}
                    className={cn("group relative flex items-start gap-3 px-3 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", i === selected && "bg-muted/40")}
                  >
                    {/* Linear marks unread with a dot at the row's edge. */}
                    <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full transition-opacity motion-state", row.read ? "opacity-0" : "bg-primary")} />
                    <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("text-sm", row.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                        {row.title}
                        {!row.read && <span className="sr-only"> · {t("unread")}</span>}
                      </span>
                      <span className="text-sm text-muted-foreground">{row.line}</span>
                    </span>
                    <time dateTime={row.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {when(row.at, { date: "medium", time: true })}
                    </time>
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t("keys")}</p>
        </div>
      )}
    </Page>
  );
}
