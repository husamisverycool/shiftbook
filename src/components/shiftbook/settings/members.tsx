"use client";

// Pattern: docs/patterns/settings/members.md — Linear Members (the search, Filters and Invite on one line
// over the rows; each row the person's initials, name over email, their role and status, the overflow
// menu: Change role…, Suspend…; Invite: email, "Invite as…", Send); Stripe Add member (what each role can
// do; invites expire after 10 days); GitHub's two-factor filter and invitations sent again or cancelled.
// The page's frame and the Roles panel: docs/patterns/_components/settings.md.
import { ListFilterIcon, MoreHorizontalIcon, PlusIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelInviteAction, changeRoleAction, inviteAction, resendInviteAction, setSuspendedAction, type MemberResult } from "@/app/[locale]/(app)/settings/members/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { fewerRights, ROLES, type Role } from "@/server/permissions";
import { useConfirmed } from "../auth/confirm-access";
import { LinkedText } from "../linked-text";
import { Status, type Tone } from "../status";
import { useDateTime } from "../agency-zone";
import { EmptyState } from "../empty-state";
import { PersonAvatar } from "../person";
import { SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  hasAuthenticator: boolean;
  lastSeenAt: string | null;
  inviteExpiresAt: string | null;
  demoCopy: string | null;
}

type Pending = { kind: "role" | "suspend" | "cancel" | "copy"; member: MemberRow } | null;
const NEEDS_APP: Role[] = ["owner", "coordinator"];
/** One status language (_components/status.md): active is in good standing, an invite waits on the person, suspended has lost access. */
const STATUS_TONE: Record<MemberRow["status"], Tone> = { active: "success", invited: "info", suspended: "critical" };

/**
 * `paused` (decision 0036): the agency's changes are paused; only what takes access away is offered —
 * suspend, cancel an invite, a role with fewer rights (security review).
 */
export function MembersView({ members, me, canManage, now, paused = false }: { members: MemberRow[]; me: string; canManage: boolean; now: string; paused?: boolean }) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tl = useTranslations("list");
  const router = useRouter();
  const [role, setRole] = useState<Role | "all">("all");
  const [status, setStatus] = useState<MemberRow["status"] | "all">("all");
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [copy, setCopy] = useState<{ email: string; text: string } | null>(null);
  const [busy, start] = useTransition();
  const confirmed = useConfirmed();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => (role === "all" || m.role === role) && (status === "all" || m.status === status) && (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)));
  }, [members, role, status, search]);

  const dateTime = useDateTime();
  const date = (iso: string) => dateTime(iso, { time: false });

  const run = (fn: () => Promise<MemberResult>, success: string, after?: (r: Extract<MemberResult, { ok: true }>) => void) =>
    start(async () => {
      const r = await confirmed(fn);
      if (!r) return;
      if (r.ok) {
        toast.success(success);
        setPending(null);
        after?.(r);
      } else toast.error(t(`errors.${r.error}`));
      router.refresh();
    });

  const clearFilters = () => {
    setRole("all");
    setStatus("all");
    setSearch("");
  };
  const STATUSES = ["active", "invited", "suspended"] as const;

  return (
    <SettingsPage context={t("eyebrow")} title={t("title")} description={canManage ? (paused ? t("pausedNote") : undefined) : t("ownerOnly")}>
      <div className="flex min-w-0 flex-col gap-4">
        {/* Linear Members: the search and Filters at the left, Invite at the right, on one line. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input type="search" aria-label={t("search")} placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-64" data-testid="member-search" />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" data-testid="member-filters" />}>
              <ListFilterIcon />
              {tl("filter")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="filter-role">{t("role")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role | "all")}>
                    <DropdownMenuRadioItem value="all">{t("all")}</DropdownMenuRadioItem>
                    {ROLES.map((r) => (
                      <DropdownMenuRadioItem key={r} value={r}>
                        {tr(`${r}.name`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="filter-status">{t("status")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={status} onValueChange={(v) => setStatus(v as MemberRow["status"] | "all")}>
                    <DropdownMenuRadioItem value="all">{t("all")}</DropdownMenuRadioItem>
                    {STATUSES.map((st) => (
                      <DropdownMenuRadioItem key={st} value={st}>
                        {t(`statusLabels.${st}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Applied filters as chips (Linear), each removable. */}
          {role !== "all" && (
            <Badge variant="secondary" className="gap-1 pr-1" data-testid="chip-role">
              {t("role")}: {tr(`${role}.name`)}
              <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={tl("removeFilter", { name: t("role") })} onClick={() => setRole("all")}>
                <XIcon className="size-3" />
              </button>
            </Badge>
          )}
          {status !== "all" && (
            <Badge variant="secondary" className="gap-1 pr-1" data-testid="chip-status">
              {t("status")}: {t(`statusLabels.${status}`)}
              <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={tl("removeFilter", { name: t("status") })} onClick={() => setStatus("all")}>
                <XIcon className="size-3" />
              </button>
            </Badge>
          )}
          <p className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {t("count", { count: shown.length })}
          </p>
          {canManage && !paused && (
            <Button onClick={() => setInviting(true)} data-testid="invite-member">
              <PlusIcon />
              {t("invite")}
            </Button>
          )}
        </div>

        {shown.length === 0 ? (
          <EmptyState
            kind="filtered"
            icon={ListFilterIcon}
            title={t("noMatch")}
            className="min-h-0 py-12"
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clear")}
              </Button>
            }
          />
        ) : (
          // Linear's member rows: hairlines between them, the initials, name over email, then role and
          // status, the overflow menu at the end.
          <ul aria-label={t("title")} className="flex flex-col divide-y" data-testid="members">
            {shown.map((m) => {
              const lapsed = m.status === "invited" && (!m.inviteExpiresAt || m.inviteExpiresAt < now);
              const needed = NEEDS_APP.includes(m.role) && !m.hasAuthenticator;
              return (
                <li key={m.id} className="flex min-h-15 items-center gap-3 py-2.5" data-testid="member" data-email={m.email}>
                  <PersonAvatar name={m.name} size="default" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm leading-5 font-medium">
                      {m.name}
                      {m.id === me && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("you")}</span>}
                    </span>
                    <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                      {m.email}
                      <span className="sm:hidden"> · {tr(`${m.role}.name`)}</span>
                    </span>
                  </div>
                  <div className="hidden w-40 shrink-0 flex-col items-start gap-0.5 whitespace-nowrap sm:flex">
                    <span className="text-sm leading-5">{tr(`${m.role}.name`)}</span>
                    {m.hasAuthenticator ? (
                      <span className="text-[13px] leading-5 text-muted-foreground">{t("authLine.on")}</span>
                    ) : needed && m.status !== "invited" ? (
                      <Status tone="warning">{t("authLine.needed")}</Status>
                    ) : (
                      <span className="text-[13px] leading-5 text-muted-foreground">{t("authLine.off")}</span>
                    )}
                  </div>
                  <div className="flex w-48 shrink-0 flex-col items-start gap-0.5">
                    <Status tone={STATUS_TONE[m.status]} data-testid="member-status">
                      {t(`statusLabels.${m.status}`)}
                    </Status>
                    <span className="text-[13px] leading-5 whitespace-nowrap text-muted-foreground">
                      {m.status === "invited" ? (lapsed ? t("inviteLapsed") : t("expires", { date: date(m.inviteExpiresAt!) })) : m.lastSeenAt ? t("lastSeen", { date: dateTime(m.lastSeenAt) }) : t("neverSeen")}
                    </span>
                  </div>
                  {canManage && (
                    <div className="w-8 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("menu", { name: m.name })} disabled={busy} data-testid="member-menu" />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.status === "invited" ? (
                            <>
                              {!paused && <DropdownMenuItem onClick={() => run(() => resendInviteAction(m.id, m.email), t("resent", { email: m.email }), (r) => r.demoCopy && setCopy({ email: m.email, text: r.demoCopy }))}>{t("resend")}</DropdownMenuItem>}
                              <DropdownMenuItem onClick={() => setPending({ kind: "cancel", member: m })}>{t("cancelInvite")}</DropdownMenuItem>
                              {m.demoCopy && (
                                <DropdownMenuItem onClick={() => setCopy({ email: m.email, text: m.demoCopy! })} data-testid="open-invite">
                                  {t("openInvite")}
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : (
                            <>
                              {(!paused || ROLES.some((r) => fewerRights(m.role, r))) && (
                                <DropdownMenuItem onClick={() => setPending({ kind: "role", member: m })} data-testid="change-role">
                                  {t("changeRole")}
                                </DropdownMenuItem>
                              )}
                              {m.id !== me &&
                                (m.status === "suspended" ? (
                                  !paused && <DropdownMenuItem onClick={() => run(() => setSuspendedAction(m.id, false), t("restored", { name: m.name }))}>{t("restore")}</DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => setPending({ kind: "suspend", member: m })} data-testid="suspend">
                                    {t("suspend")}
                                  </DropdownMenuItem>
                                ))}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* What each role can do (Stripe's roles), as a panel of rows. */}
      <SettingsSection title={t("rolesTitle")}>
        <SettingsRows as="ul" aria-label={t("rolesTitle")}>
          {ROLES.map((r) => (
            <SettingsRow key={r} as="li" label={tr(`${r}.name`)} description={tr(`${r}.line`)} />
          ))}
        </SettingsRows>
      </SettingsSection>

      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onSent={(email, demoCopy) => {
            setInviting(false);
            if (demoCopy) setCopy({ email, text: demoCopy });
            router.refresh();
          }}
        />
      )}
      {pending?.kind === "role" && <RoleDialog member={pending.member} busy={busy} paused={paused} onClose={() => setPending(null)} onSave={(r) => run(() => changeRoleAction(pending.member.id, r), t("roleChanged", { name: pending.member.name, role: tr(`${r}.name`) }))} />}
      <AlertDialog open={pending?.kind === "suspend" || pending?.kind === "cancel"} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{pending.kind === "suspend" ? t("suspendTitle", { name: pending.member.name }) : t("cancelTitle", { name: pending.member.name })}</AlertDialogTitle>
                <AlertDialogDescription>{pending.kind === "suspend" ? t("suspendBody") : t("cancelBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => (pending.kind === "suspend" ? run(() => setSuspendedAction(pending.member.id, true), t("suspended", { name: pending.member.name })) : run(() => cancelInviteAction(pending.member.id), t("cancelled")))}
                  data-testid="confirm-member-action"
                >
                  {pending.kind === "suspend" ? t("suspendConfirm") : t("cancelConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={copy !== null} onOpenChange={(open) => !open && setCopy(null)}>
        <DialogContent>
          {copy && (
            <>
              <DialogHeader>
                <DialogTitle>{t("demoCopyTitle", { email: copy.email })}</DialogTitle>
                <DialogDescription>{t("demoCopyBody")}</DialogDescription>
              </DialogHeader>
              <div tabIndex={0} className="max-h-72 overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="demo-invite-copy">
                <LinkedText text={copy.text} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

function RoleChoices({ value, onChange, name, allowed }: { value: Role; onChange: (r: Role) => void; name: string; allowed?: (r: Role) => boolean }) {
  const tr = useTranslations("roles");
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {ROLES.map((r) => (
        <label key={r} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          <input type="radio" name={name} value={r} checked={value === r} disabled={allowed ? !allowed(r) : false} onChange={() => onChange(r)} className="mt-1 size-4 accent-primary" data-testid={`role-${r}`} />
          <span className="flex flex-col">
            <span className="font-medium">{tr(`${r}.name`)}</span>
            <span className="text-sm text-muted-foreground">{tr(`${r}.line`)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function RoleDialog({ member, busy, paused, onClose, onSave }: { member: MemberRow; busy: boolean; paused: boolean; onClose: () => void; onSave: (r: Role) => void }) {
  const t = useTranslations("members");
  const [role, setRole] = useState<Role>(member.role);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeRoleTitle", { name: member.name })}</DialogTitle>
        </DialogHeader>
        {paused && <p className="text-sm text-muted-foreground">{t("pausedRoles")}</p>}
        <RoleChoices value={role} onChange={setRole} name="change-role" allowed={paused ? (r) => r === member.role || fewerRights(member.role, r) : undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("keep")}
          </Button>
          <Button disabled={busy || role === member.role} onClick={() => onSave(role)} data-testid="save-role">
            {busy ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ onClose, onSent }: { onClose: () => void; onSent: (email: string, demoCopy: string | null) => void }) {
  const t = useTranslations("members");
  const locale = useLocale();
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("coordinator");
  const [language, setLanguage] = useState(locale === "es" ? "es" : "en");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmed = useConfirmed();
  const field = error === "invalid_name" ? "name" : error === "invalid_email" || error === "email_taken" ? "email" : null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await confirmed(() => inviteAction({ name, email, role, locale: language }));
              if (!r) return;
              if (r.ok) {
                toast.success(t("sent", { email: email.trim() }));
                onSent(email.trim(), r.demoCopy ?? null);
              } else setError(r.error);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-name`}>{t("name")}</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={field === "name" ? true : undefined} autoFocus data-testid="invite-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-email`}>{t("email")}</Label>
            <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-invalid={field === "email" ? true : undefined} aria-describedby={field === "email" ? `${id}-error` : undefined} data-testid="invite-email" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("role")}</legend>
            <RoleChoices value={role} onChange={setRole} name="invite-role" />
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-language`}>{t("language")}</Label>
            <NativeSelect id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value)} className="w-48">
              <NativeSelectOption value="en" lang="en">
                English
              </NativeSelectOption>
              <NativeSelectOption value="es" lang="es">
                Español
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="invite-error">
              {t(`errors.${error}` as "errors.generic")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("keep")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="send-invite">
              {pending ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
