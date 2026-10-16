"use client";

// Pattern: docs/patterns/settings/members.md — Linear Members (filters by role and status, a row's
// overflow menu: Change role…, Suspend…; Invite: email, "Invite as…", Send); Stripe Add member (what each
// role can do; invites expire after 10 days); GitHub's two-factor filter and invitations sent again or
// cancelled.
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelInviteAction, changeRoleAction, inviteAction, resendInviteAction, setSuspendedAction, type MemberResult } from "@/app/[locale]/(app)/settings/members/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { ROLES, type Role } from "@/server/permissions";
import { useConfirmed } from "../auth/confirm-access";
import { LinkedText } from "../linked-text";

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

export function MembersView({ members, me, canManage, now }: { members: MemberRow[]; me: string; canManage: boolean; now: string }) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
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

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

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

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
        </div>
        {canManage && (
          <Button onClick={() => setInviting(true)} data-testid="invite-member">
            <PlusIcon />
            {t("invite")}
          </Button>
        )}
      </header>

      <section aria-labelledby={`${id}-roles`} className="flex flex-col gap-2">
        <h2 id={`${id}-roles`} className="sr-only">
          {t("rolesTitle")}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {ROLES.map((r) => (
            <div key={r} className="contents">
              <dt className="font-medium">{tr(`${r}.name`)}</dt>
              <dd className="text-muted-foreground">{tr(`${r}.line`)}</dd>
            </div>
          ))}
        </dl>
        {!canManage && <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-role`}>{t("role")}</Label>
          <NativeSelect id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value as Role | "all")} data-testid="filter-role">
            <NativeSelectOption value="all">{t("all")}</NativeSelectOption>
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {tr(`${r}.name`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-status`}>{t("status")}</Label>
          <NativeSelect id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as MemberRow["status"] | "all")} data-testid="filter-status">
            <NativeSelectOption value="all">{t("all")}</NativeSelectOption>
            {(["active", "invited", "suspended"] as const).map((s) => (
              <NativeSelectOption key={s} value={s}>
                {t(`statusLabels.${s}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Input type="search" aria-label={t("search")} placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" data-testid="member-search" />
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: shown.length })}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-6">
          <p className="text-sm">{t("noMatch")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRole("all");
              setStatus("all");
              setSearch("");
            }}
          >
            {t("clear")}
          </Button>
        </div>
      ) : (
        <div className="min-w-0">
          <Table data-testid="members">
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.authenticator")}</TableHead>
                <TableHead>{t("columns.lastSeen")}</TableHead>
                {canManage && <TableHead className="w-12">{<span className="sr-only">{t("columns.actions")}</span>}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => {
                const lapsed = m.status === "invited" && (!m.inviteExpiresAt || m.inviteExpiresAt < now);
                const needed = NEEDS_APP.includes(m.role) && !m.hasAuthenticator;
                return (
                  <TableRow key={m.id} data-testid="member" data-email={m.email}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {m.name}
                          {m.id === me && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("you")}</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">{m.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{tr(`${m.role}.name`)}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={m.status === "active" ? "secondary" : m.status === "suspended" ? "destructive" : "outline"} data-testid="member-status">
                          {t(`statusLabels.${m.status}`)}
                        </Badge>
                        {m.status === "invited" && <span className="text-xs text-muted-foreground">{lapsed ? t("inviteLapsed") : t("expires", { date: date(m.inviteExpiresAt!) })}</span>}
                      </span>
                    </TableCell>
                    <TableCell>{m.hasAuthenticator ? t("auth.on") : needed && m.status !== "invited" ? <span className="text-destructive">{t("auth.needed")}</span> : <span className="text-muted-foreground">{t("auth.off")}</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{m.lastSeenAt ? dateTime(m.lastSeenAt) : t("never")}</TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("menu", { name: m.name })} disabled={busy} data-testid="member-menu" />}>
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {m.status === "invited" ? (
                              <>
                                <DropdownMenuItem onClick={() => run(() => resendInviteAction(m.id, m.email), t("resent", { email: m.email }), (r) => r.demoCopy && setCopy({ email: m.email, text: r.demoCopy }))}>{t("resend")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPending({ kind: "cancel", member: m })}>{t("cancelInvite")}</DropdownMenuItem>
                                {m.demoCopy && (
                                  <DropdownMenuItem onClick={() => setCopy({ email: m.email, text: m.demoCopy! })} data-testid="open-invite">
                                    {t("openInvite")}
                                  </DropdownMenuItem>
                                )}
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => setPending({ kind: "role", member: m })} data-testid="change-role">
                                  {t("changeRole")}
                                </DropdownMenuItem>
                                {m.id !== me &&
                                  (m.status === "suspended" ? (
                                    <DropdownMenuItem onClick={() => run(() => setSuspendedAction(m.id, false), t("restored", { name: m.name }))}>{t("restore")}</DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => setPending({ kind: "suspend", member: m })} data-testid="suspend">
                                      {t("suspend")}
                                    </DropdownMenuItem>
                                  ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
      {pending?.kind === "role" && <RoleDialog member={pending.member} busy={busy} onClose={() => setPending(null)} onSave={(r) => run(() => changeRoleAction(pending.member.id, r), t("roleChanged", { name: pending.member.name, role: tr(`${r}.name`) }))} />}
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
    </div>
  );
}

function RoleChoices({ value, onChange, name }: { value: Role; onChange: (r: Role) => void; name: string }) {
  const tr = useTranslations("roles");
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {ROLES.map((r) => (
        <label key={r} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary">
          <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="mt-1 size-4 accent-primary" data-testid={`role-${r}`} />
          <span className="flex flex-col">
            <span className="font-medium">{tr(`${r}.name`)}</span>
            <span className="text-sm text-muted-foreground">{tr(`${r}.line`)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function RoleDialog({ member, busy, onClose, onSave }: { member: MemberRow; busy: boolean; onClose: () => void; onSave: (r: Role) => void }) {
  const t = useTranslations("members");
  const [role, setRole] = useState<Role>(member.role);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeRoleTitle", { name: member.name })}</DialogTitle>
        </DialogHeader>
        <RoleChoices value={role} onChange={setRole} name="change-role" />
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
