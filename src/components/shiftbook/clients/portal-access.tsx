"use client";

// Pattern: docs/patterns/clients/[id].md, "Portal access" (slice v) — Linear's members list on a
// record (people as rows: name over email, a muted line, a "…" menu at the end; the add action at the
// section heading's right) and Stripe's "Invite" dialog; the demo shows the email as delivered.
import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPortalContactAction, revokePortalAccessAction, sendPortalLinkAction } from "@/app/[locale]/(app)/clients/[id]/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { PortalAccessRow } from "@/server/portal/service";
import { useDateTime } from "../agency-zone";
import { LinkedText } from "../linked-text";
import { Section } from "../page";

export function PortalAccess({ clientId, rows, mayChange, demo }: { clientId: string; rows: PortalAccessRow[]; mayChange: boolean; demo: boolean }) {
  const t = useTranslations("portalAccess");
  const dateTime = useDateTime();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<PortalAccessRow | null>(null);
  const [pending, start] = useTransition();
  const fail = (error: string) => toast.error(t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic"));
  const when = (d: Date) => dateTime(d, { date: "medium", time: true });
  return (
    <Section
      id="client-portal-title"
      title={t("title")}
      accessory={rows.length > 0 ? rows.length : undefined}
      testId="portal-access"
      actions={
        mayChange ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="portal-give">
            <UserPlusIcon /> {t("add")}
          </Button>
        ) : undefined
      }
    >
      <p className="text-[13px] text-muted-foreground">{mayChange ? t("description") : t("readOnly")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-3" data-testid="portal-contact">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium" aria-hidden>
                  {r.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="truncate text-muted-foreground">{r.email}</span>
                </div>
                <div className="ml-auto hidden flex-col items-end text-[13px] text-muted-foreground sm:flex">
                  <span>{r.lastVisitAt ? t("lastVisit", { when: when(r.lastVisitAt) }) : t("neverVisited")}</span>
                  <span>{r.linkExpiresAt ? t("linkUntil", { when: when(r.linkExpiresAt) }) : t("linkOff")}</span>
                </div>
                {mayChange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("actions", { name: r.name })} data-testid="portal-contact-menu" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        disabled={pending}
                        data-testid="portal-send-link"
                        onClick={() =>
                          start(async () => {
                            const res = await sendPortalLinkAction(r.id);
                            if (res.ok) {
                              toast.success(t("sent", { email: r.email }));
                              router.refresh();
                            } else fail(res.error);
                          })
                        }
                      >
                        {t("sendLink")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setRevoking(r)} data-testid="portal-revoke">
                        {t("revoke")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {demo && r.demoCopy && (
                <details className="ml-11 text-sm" data-testid="portal-demo-copy">
                  <summary className="cursor-pointer rounded-sm text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">{t("demoCopy")}</summary>
                  <div tabIndex={0} aria-label={t("demoCopy")} className="mt-2 max-h-64 overflow-auto rounded-md border p-3 whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <LinkedText text={r.demoCopy} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <GiveAccess clientId={clientId} onClose={() => setAdding(false)} />}
      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{revoking ? t("revokeTitle", { name: revoking.name }) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{t("revokeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="portal-revoke-confirm"
              onClick={() => {
                const r = revoking;
                if (!r) return;
                start(async () => {
                  const res = await revokePortalAccessAction(r.id);
                  setRevoking(null);
                  if (res.ok) {
                    toast.success(t("revoked"));
                    router.refresh();
                  } else fail(res.error);
                });
              }}
            >
              {t("revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function GiveAccess({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const t = useTranslations("portalAccess");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lang, setLang] = useState(locale === "es" ? "es" : "en");
  const [fields, setFields] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const err = (f: string) => (fields.includes(f) ? t(`fieldErrors.${f}`) : null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addPortalContactAction(clientId, { name, email, locale: lang });
              if (r.ok) {
                toast.success(t("sent", { email }));
                onClose();
                router.refresh();
              } else if (r.error === "invalid" && r.fields) setFields(r.fields);
              else toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t("name")}</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" aria-invalid={!!err("name")} aria-describedby={err("name") ? `${id}-name-error` : undefined} data-testid="portal-name" />
            {err("name") && (
              <p id={`${id}-name-error`} className="text-[13px] text-destructive">
                {err("name")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-email`}>{t("email")}</Label>
            <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" aria-invalid={!!err("email")} aria-describedby={err("email") ? `${id}-email-error` : undefined} data-testid="portal-email" />
            {err("email") && (
              <p id={`${id}-email-error`} className="text-[13px] text-destructive">
                {err("email")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-lang`}>{t("language")}</Label>
            <NativeSelect id={`${id}-lang`} value={lang} onChange={(e) => setLang(e.target.value)} data-testid="portal-language">
              <NativeSelectOption value="en">{t("english")}</NativeSelectOption>
              <NativeSelectOption value="es">{t("spanish")}</NativeSelectOption>
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={t("submit")} data-testid="portal-submit">
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
