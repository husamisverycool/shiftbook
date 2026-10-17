"use client";

// Pattern: docs/patterns/_components/command-menu.md (decision 0038) — GitHub's command palette:
// the scope at the input's left, suggestions for where you are, recent items (Linear), pages and
// verb-first actions; records searched on the server; GitHub's prefixes and keys; cmdk's list.
import { ArrowRightIcon, BriefcaseIcon, Building2Icon, CalendarDaysIcon, ContactRoundIcon, CornerDownLeftIcon, FileUpIcon, KeyboardIcon, LandmarkIcon, LanguagesIcon, LogOutIcon, PlusIcon, ReceiptTextIcon, UserPlusIcon, UsersIcon, XIcon, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { signOutAction } from "@/app/[locale]/(auth)/actions";
import { searchRecordsAction } from "@/app/[locale]/(app)/search-actions";
import { CommandDialog, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Ability } from "@/server/permissions";
import type { FoundRecord, RecordKind, Scope } from "@/server/search/records";
import { useCan } from "./abilities";
import { parseCommandQuery, type CommandMode } from "./command-query";
import { money } from "./format";

export interface CommandPage {
  href: string;
  label: string;
  icon: LucideIcon;
  /** A single-letter jump shown at the right (the sidebar's G-then-letter keys). */
  jump?: string;
}

interface Recent {
  href: string;
  title: string;
  kind: RecordKind | "page";
}

const RECENT_KEY = "granite.command-menu.recent";
const RECENT_MAX = 5;
const KIND_ICON: Record<RecordKind, LucideIcon> = { worker: ContactRoundIcon, client: Building2Icon, invoice: ReceiptTextIcon, jobOrder: BriefcaseIcon, assignment: UsersIcon };
const KIND_ORDER: RecordKind[] = ["worker", "client", "invoice", "jobOrder", "assignment"];

function readRecent(): Recent[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Recent[]).filter((r) => typeof r?.href === "string" && typeof r?.title === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function remember(item: Recent) {
  try {
    const next = [item, ...readRecent().filter((r) => r.href !== item.href)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A browser that keeps nothing just shows no recent items.
  }
}

/** The typed text marked inside a title (Linear: "The search term will be highlighted if it's in the title"). */
function Marked({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-transparent font-semibold text-foreground">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

const matches = (term: string, ...texts: string[]) => term === "" || texts.some((x) => x.toLowerCase().includes(term.toLowerCase()));

/** Where the menu was opened, as GitHub's scope: a client's or a worker's page. */
function scopeFromPath(pathname: string): Scope | null {
  const m = /^\/(clients|workers)\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname);
  if (!m) return null;
  return { kind: m[1] === "clients" ? "client" : "worker", id: m[2]! };
}

export function CommandMenu({ open, onOpenChange, pages, onShortcuts }: { open: boolean; onOpenChange: (open: boolean) => void; pages: CommandPage[]; onShortcuts: () => void }) {
  const t = useTranslations("commandMenu");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<(Scope & { name: string }) | null>(null);
  const [found, setFound] = useState<FoundRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [selected, setSelected] = useState("");
  const [, leave] = useTransition();
  const asked = useRef(0);

  const { mode, term } = parseCommandQuery(text);

  // Each time it opens: empty text, the page's own scope (GitHub), recent items.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setFound([]);
      const here = scopeFromPath(pathname);
      const remembered = typeof window !== "undefined" ? readRecent() : [];
      // The record's own name: as remembered when it was opened from here, else the page's title.
      const name = here ? (remembered.find((r) => r.href === pathname)?.title ?? (typeof document !== "undefined" ? (document.querySelector("h1")?.textContent ?? "").trim() : "")) : "";
      setScope(here && name ? { ...here, name } : null);
      setRecent(remembered);
    }
  }

  // Records come from the server, a moment after typing stops.
  useEffect(() => {
    if (!open || mode === "actions" || mode === "help") return;
    const set = mode === "work" ? "work" : mode === "people" ? "people" : "all";
    if (term === "" && !scope) return;
    const n = ++asked.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchRecordsAction({ term, set, scope: scope ? { kind: scope.kind, id: scope.id } : null }).then((rows) => {
        if (n !== asked.current) return;
        setFound(rows);
        setSearching(false);
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, mode, term, scope]);

  const recordsAsked = !(mode === "actions" || mode === "help" || (term === "" && !scope));
  const shownFound = recordsAsked ? found : [];
  const loadingShown = searching && recordsAsked;

  const go = useCallback(
    (href: string, item: Recent, newTab = false) => {
      remember(item);
      onOpenChange(false);
      if (newTab) window.open(`/${locale}${href}`, "_blank", "noopener");
      else router.push(href);
    },
    [locale, onOpenChange, router],
  );

  const actions = useMemo(() => {
    const all: { key: string; icon: LucideIcon; ability?: Ability; run: () => void }[] = [
      { key: "createJobOrder", icon: PlusIcon, ability: "placements", run: () => go("/job-orders?new=1", { href: "/job-orders", title: t("actions.createJobOrder"), kind: "page" }) },
      { key: "payWeek", icon: FileUpIcon, ability: "hours", run: () => go("/convert", { href: "/convert", title: t("actions.payWeek"), kind: "page" }) },
      { key: "importPlacements", icon: UsersIcon, ability: "placements", run: () => go("/assignments/import", { href: "/assignments/import", title: t("actions.importPlacements"), kind: "page" }) },
      { key: "publishSchedule", icon: CalendarDaysIcon, ability: "placements", run: () => go("/schedule?publish=1", { href: "/schedule", title: t("actions.publishSchedule"), kind: "page" }) },
      { key: "importBank", icon: LandmarkIcon, ability: "cash", run: () => go("/bank/import", { href: "/bank/import", title: t("actions.importBank"), kind: "page" }) },
      { key: "inviteMember", icon: UserPlusIcon, ability: "members", run: () => go("/settings/members", { href: "/settings/members", title: t("actions.inviteMember"), kind: "page" }) },
      {
        key: "switchLanguage",
        icon: LanguagesIcon,
        run: () => {
          onOpenChange(false);
          router.replace(pathname, { locale: locale === "es" ? "en" : "es" });
        },
      },
      {
        key: "shortcuts",
        icon: KeyboardIcon,
        run: () => {
          onOpenChange(false);
          onShortcuts();
        },
      },
      {
        key: "signOut",
        icon: LogOutIcon,
        run: () => {
          onOpenChange(false);
          leave(() => signOutAction());
        },
      },
    ];
    return all.filter((a) => !a.ability || can(a.ability));
  }, [can, go, locale, onOpenChange, onShortcuts, pathname, router, t]);

  const showStatic = (m: CommandMode) => mode === m || mode === "all";
  // cmdk's ranking: a match at the start of a word beats one elsewhere; the whole label best of all.
  const rank = (label: string) => {
    const l = label.toLowerCase();
    const q = term.toLowerCase();
    return l === q ? 0 : l.startsWith(q) ? 1 : l.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : 3;
  };
  const byRank = <T,>(items: T[], label: (x: T) => string) => (term === "" ? items : items.map((x, i) => ({ x, i, r: rank(label(x)) })).sort((a, b) => a.r - b.r || a.i - b.i).map((e) => e.x));
  const shownPages = showStatic("all") && mode === "all" ? byRank(pages.filter((p) => matches(term, p.label)), (p) => p.label) : [];
  const shownActions = showStatic("actions") ? byRank(actions.filter((a) => matches(term, t(`actions.${a.key}`))), (a) => t(`actions.${a.key}`)) : [];
  const shownRecent = mode === "all" && term === "" ? recent : [];
  const scopeSuggestions = mode === "all" && term === "" && scope ? shownFound : [];
  const searched = scopeSuggestions.length > 0 ? [] : shownFound;
  const total = shownPages.length + shownActions.length + shownRecent.length + scopeSuggestions.length + searched.length + (mode === "help" ? 1 : 0);

  const recordLine = (r: FoundRecord): string => {
    const c = r.context;
    const status = c.status ? t(`status.${c.status}` as "status.active") : null;
    if (r.kind === "invoice") return [c.client, c.totalCents !== undefined ? money(c.totalCents, locale) : null, status].filter(Boolean).join(" · ");
    if (r.kind === "jobOrder") return [c.client, c.worksite].filter(Boolean).join(" · ");
    if (r.kind === "assignment") return [c.position, c.client, status].filter(Boolean).join(" · ");
    if (r.kind === "worker") return status ?? "";
    return "";
  };

  const recordItem = (r: FoundRecord, prefix: string): ReactNode => {
    const Icon = KIND_ICON[r.kind];
    const line = recordLine(r);
    return (
      <CommandItem key={`${prefix}-${r.kind}-${r.id}`} value={`${prefix}-${r.kind}-${r.id}`} onSelect={() => go(r.href, { href: r.href, title: r.title, kind: r.kind })} data-href={r.href} data-scope={r.kind === "client" || r.kind === "worker" ? `${r.kind}:${r.id}` : undefined} data-name={r.title}>
        <Icon />
        <span className="min-w-0 truncate">
          <Marked text={r.title} term={term} />
        </span>
        {line && <span className="min-w-0 truncate text-muted-foreground">{line}</span>}
        {r.exact && (
          <CommandShortcut>
            <CornerDownLeftIcon className="size-3.5" aria-hidden />
          </CommandShortcut>
        )}
      </CommandItem>
    );
  };

  const highlighted = (): HTMLElement | null => document.querySelector<HTMLElement>(`[cmdk-item][data-selected="true"]`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = highlighted();
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Tab" && !e.shiftKey && el?.dataset.scope) {
      // GitHub: "highlight a repository then use Tab to add it to the scope".
      e.preventDefault();
      const [kind, id] = el.dataset.scope.split(":") as ["client" | "worker", string];
      setScope({ kind, id, name: el.dataset.name ?? "" });
      setText("");
      setFound([]);
      return;
    }
    if (e.key === "Backspace" && text === "" && scope) {
      // GitHub: remove the scope with Backspace; Ctrl+Backspace / Cmd+Delete clears scope and text.
      e.preventDefault();
      setScope(null);
      setFound([]);
      return;
    }
    if (mod && e.key === "Backspace") {
      e.preventDefault();
      setScope(null);
      setText("");
      setFound([]);
      return;
    }
    if (mod && e.key === "Enter" && el?.dataset.href) {
      // GitHub: Ctrl/Command + Enter opens the highlighted result in a new tab.
      e.preventDefault();
      go(el.dataset.href, { href: el.dataset.href, title: el.dataset.name ?? el.textContent ?? "", kind: "page" }, true);
      return;
    }
    if (mod && e.key.toLowerCase() === "c" && el?.dataset.href && window.getSelection()?.toString() === "") {
      // GitHub: Ctrl/Command + C copies the highlighted result's address.
      e.preventDefault();
      void navigator.clipboard?.writeText(`${window.location.origin}/${locale}${el.dataset.href}`).then(() => toast.success(t("copied")));
    }
  };

  // Groups part with a hairline when nothing is typed (cmdk: separators show "when the search query is
  // empty"); drawn as the group's border, since a listbox holds only groups and options (axe).
  const groups: ReactNode[] = [];
  const hairline = () => (groups.length > 0 && term === "" ? "-mx-1 border-t px-2" : undefined);

  if (mode === "help") {
    groups.push(
      <CommandGroup key="help" heading={t("groups.help")}>
        {(
          [
            [">", "actions"],
            ["#", "work"],
            ["@", "people"],
          ] as const
        ).map(([key, what]) => (
          <CommandItem key={key} value={`help-${key}`} onSelect={() => setText(`${key} `)}>
            <kbd className="flex size-5 items-center justify-center rounded border font-mono text-xs">{key}</kbd>
            <span>{t(`help.${what}`)}</span>
          </CommandItem>
        ))}
        {(
          [
            ["Tab", "tab"],
            ["⌘ ↵", "newTab"],
            ["⌘ C", "copy"],
          ] as const
        ).map(([key, what]) => (
          <CommandItem key={key} value={`help-${what}`} disabled>
            <kbd className="rounded border px-1 font-mono text-xs">{key}</kbd>
            <span>{t(`help.${what}`)}</span>
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }
  if (scopeSuggestions.length > 0)
    groups.push(
      <CommandGroup key="suggestions" heading={t("groups.suggestions")}>
        {scopeSuggestions.map((r) => recordItem(r, "suggest"))}
      </CommandGroup>,
    );
  if (shownRecent.length > 0) {
    groups.push(
      <CommandGroup key="recent" heading={t("groups.recent")} className={hairline()}>
        {shownRecent.map((r) => {
          const Icon = r.kind === "page" ? ArrowRightIcon : KIND_ICON[r.kind];
          return (
            <CommandItem key={`recent-${r.href}`} value={`recent-${r.href}`} onSelect={() => go(r.href, r)} data-href={r.href} data-name={r.title}>
              <Icon />
              <span className="truncate">{r.title}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>,
    );
  }
  // An invoice number typed exactly comes first, so Enter opens it (Stripe: identifiers go straight to the record).
  const order = searched.some((r) => r.exact) ? (["invoice", ...KIND_ORDER.filter((k) => k !== "invoice")] as RecordKind[]) : KIND_ORDER;
  for (const kind of order) {
    const rows = searched.filter((r) => r.kind === kind).sort((a, b) => Number(b.exact ?? false) - Number(a.exact ?? false));
    if (rows.length === 0) continue;
    groups.push(
      <CommandGroup key={kind} heading={t(`groups.${kind}`)}>
        {rows.map((r) => recordItem(r, "found"))}
      </CommandGroup>,
    );
  }
  if (shownPages.length > 0) {
    groups.push(
      <CommandGroup key="pages" heading={t("groups.pages")} className={hairline()}>
        {shownPages.map((p) => (
          <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href, { href: p.href, title: p.label, kind: "page" })} data-href={p.href} data-name={p.label}>
            <p.icon />
            <span>
              <Marked text={p.label} term={term} />
            </span>
            {p.jump && (
              <CommandShortcut>
                G {p.jump.toUpperCase()}
              </CommandShortcut>
            )}
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }
  if (shownActions.length > 0) {
    groups.push(
      <CommandGroup key="actions" heading={t("groups.actions")} className={hairline()}>
        {shownActions.map((a) => (
          <CommandItem key={a.key} value={`action-${a.key}`} onSelect={a.run} data-testid={`command-${a.key}`}>
            <a.icon />
            <span>
              <Marked text={t(`actions.${a.key}`)} term={term} />
            </span>
            {a.key === "shortcuts" && <CommandShortcut>?</CommandShortcut>}
          </CommandItem>
        ))}
      </CommandGroup>,
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("title")} description={t("description")}>
      <Command shouldFilter={false} value={selected} onValueChange={setSelected} onKeyDown={onKeyDown} label={t("title")} data-testid="command-menu">
        <CommandInput
          value={text}
          onValueChange={setText}
          placeholder={scope ? t("scopedPlaceholder", { name: scope.name }) : t("placeholder")}
          before={
            scope && (
              <span className="inline-flex max-w-48 shrink-0 items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium" data-testid="command-scope">
                {scope.kind === "client" ? <Building2Icon className="size-3.5 text-muted-foreground" aria-hidden /> : <ContactRoundIcon className="size-3.5 text-muted-foreground" aria-hidden />}
                <span className="truncate">{scope.name}</span>
                <button type="button" className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={t("removeScope", { name: scope.name })} onClick={() => setScope(null)}>
                  <XIcon className="size-3" />
                </button>
              </span>
            )
          }
        />
        {/* While records arrive (cmdk's Loading row; kept outside the listbox, which holds only groups and options). */}
        {loadingShown && <div className="px-4 pt-2 text-sm text-muted-foreground">{t("loading")}</div>}
        <CommandList>
          {!loadingShown && total === 0 &&<CommandEmpty>{t("empty", { text: term || text })}</CommandEmpty>}
          {groups}
        </CommandList>
        <span role="status" className="sr-only">
          {term ? t("count", { count: total }) : ""}
        </span>
      </Command>
    </CommandDialog>
  );
}
