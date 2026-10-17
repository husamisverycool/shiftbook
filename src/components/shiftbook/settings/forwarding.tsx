"use client";

// Pattern: docs/patterns/settings/connections.md › Forwarding address — Ramp's "Receipt forwarding"
// (the address to forward to, with the senders it accepts as a list and a plus to add one) and
// Expensify's receipts address; each email that arrived as a row with what happened to its files
// (decision 0042). Linear's settings look.
import { CheckIcon, CopyIcon, MailIcon, PlusIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fileHeldEmailAction, rotateForwardingAction, sendDemoEmailAction, setSendersAction } from "@/app/[locale]/(app)/settings/connections/forwarding-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import type { ForwardingView } from "@/server/inbound/service";
import { useDateTime } from "../agency-zone";
import { longDate } from "../format";
import { SettingsEmpty, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";
import { Status } from "../status";
import { Tip } from "../tip";
import { useCopied } from "../use-copied";

export interface OpenWeek {
  id: string;
  startsOn: string;
}

/** The address with a copy button (Primer ClipboardCopy: the check for a moment after copying). */
export function CopyAddress({ address, testId = "forwarding-address" }: { address: string; testId?: string }) {
  const t = useTranslations("forwarding");
  const [copied, mark] = useCopied();
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <code className="truncate rounded-md bg-muted px-2 py-1 font-mono text-[13px] text-foreground" data-testid={testId}>
        {address}
      </code>
      <Tip label={t("copy")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("copy")}
          data-testid={`${testId}-copy`}
          onClick={() =>
            navigator.clipboard?.writeText(address).then(() => {
              mark();
              toast.success(t("copied"));
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </Tip>
    </span>
  );
}

export function ForwardingSettings({ view, weeks, canManage, canFile, demo }: { view: ForwardingView; weeks: OpenWeek[]; canManage: boolean; canFile: boolean; demo: boolean }) {
  const t = useTranslations("forwarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const [rotating, rotate] = useTransition();
  const [sending, send] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-12" id="forwarding">
      <SettingsSection
        title={t("title")}
        description={t("description")}
        testId="forwarding"
        action={
          demo && canFile && view.address ? (
            <Button
              variant="outline"
              size="sm"
              loading={sending}
              loadingLabel={t("demo.sending")}
              data-testid="forwarding-test-email"
              onClick={() =>
                send(async () => {
                  const r = await sendDemoEmailAction();
                  if (!r.ok) toast.error(t("errors.generic"));
                  else if (r.status === "filed") toast.success(t("demo.sent", { count: r.filed }));
                  else if (r.status === "held") toast.info(t("demo.heldNotice"));
                  else toast.warning(t("demo.refusedNotice"));
                  router.refresh();
                })
              }
            >
              <MailIcon />
              {t("demo.send")}
            </Button>
          ) : undefined
        }
      >
        <SettingsRows>
          <SettingsRow
            leading={
              <SettingsTile>
                <MailIcon aria-hidden />
              </SettingsTile>
            }
            label={view.address ? <CopyAddress address={view.address} /> : t("notSetUp")}
            description={demo ? t("demo.note") : undefined}
            control={
              canManage && view.address ? (
                <Button variant="outline" size="sm" loading={rotating} loadingLabel={t("rotate")} onClick={() => setConfirm(true)} data-testid="forwarding-rotate">
                  {t("rotate")}
                </Button>
              ) : undefined
            }
          />
        </SettingsRows>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("rotateTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("rotateBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                data-testid="forwarding-rotate-confirm"
                onClick={() =>
                  rotate(async () => {
                    await rotateForwardingAction();
                    toast.success(t("rotated"));
                    setConfirm(false);
                    router.refresh();
                  })
                }
              >
                {t("rotateConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsSection>
      <Senders senders={view.senders} canManage={canManage} />
      <RecentEmails emails={view.emails} weeks={weeks} canFile={canFile} />
    </div>
  );
}

/** Ramp's list of forwarding senders: each a row with remove; a plus opens one field to add. */
function Senders({ senders, canManage }: { senders: string[]; canManage: boolean }) {
  const t = useTranslations("forwarding.senders");
  const tc = useTranslations("common");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, save] = useTransition();
  const commit = (next: string[]) =>
    save(async () => {
      const r = await setSendersAction(next);
      if (r.ok) {
        toast.success(t("saved"));
        setValue("");
        setAdding(false);
        setProblem(null);
      } else if (r.error === "invalid") setProblem(t("invalid", { value: r.value }));
      else if (r.error === "too_many") setProblem(t("tooMany"));
      router.refresh();
    });
  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      testId="forwarding-senders"
      action={
        canManage && !adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="forwarding-sender-add">
            <PlusIcon />
            {t("add")}
          </Button>
        ) : undefined
      }
    >
      <SettingsRows as="ul">
        {senders.length === 0 && !adding && <SettingsEmpty as="li">{t("anyone")}</SettingsEmpty>}
        {senders.map((s) => (
          <SettingsRow
            as="li"
            key={s}
            label={<span className="font-mono text-[13px]">{s}</span>}
            control={
              canManage ? (
                <Tip label={t("remove", { sender: s })}>
                  <Button variant="ghost" size="icon-sm" aria-label={t("remove", { sender: s })} loading={saving} onClick={() => commit(senders.filter((x) => x !== s))}>
                    <XIcon />
                  </Button>
                </Tip>
              ) : undefined
            }
          />
        ))}
        {adding && (
          <li className="flex flex-col gap-2 py-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                commit([...senders, value]);
              }}
            >
              <Input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("add")}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "forwarding-sender-problem" : undefined}
                className="h-8 max-w-sm"
                data-testid="forwarding-sender-input"
              />
              <Button type="submit" size="sm" loading={saving} disabled={value.trim() === ""} data-testid="forwarding-sender-save">
                {t("add")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setProblem(null);
                }}
              >
                {tc("cancel")}
              </Button>
            </form>
            {problem && (
              <p id="forwarding-sender-problem" className="text-sm text-destructive" role="alert">
                {problem}
              </p>
            )}
          </li>
        )}
      </SettingsRows>
    </SettingsSection>
  );
}

const TONE = { filed: "success", held: "warning", refused: "neutral" } as const;

/** Each email that arrived, newest first (Stripe's log of customer emails): from, when, its files. */
function RecentEmails({ emails, weeks, canFile }: { emails: ForwardingView["emails"]; weeks: OpenWeek[]; canFile: boolean }) {
  const t = useTranslations("forwarding.recent");
  const when = useDateTime();
  return (
    <SettingsSection title={t("title")} testId="forwarding-emails">
      <SettingsRows as="ul">
        {emails.length === 0 && <SettingsEmpty as="li">{t("empty")}</SettingsEmpty>}
        {emails.map((e) => (
          <SettingsRow
            as="li"
            key={e.id}
            testId="forwarding-email"
            label={e.subject || t("noSubject")}
            description={
              <span className="flex flex-col gap-1">
                <span>
                  {t("from", { from: e.from })} · {t("received", { date: when(e.receivedAt) })}
                </span>
                {e.status === "refused" && e.refusedReason && <span>{t(`refused.${e.refusedReason}`)}</span>}
                {e.files.length > 0 && (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {e.files.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="truncate">{f.filename}</span>
                        <span className="text-muted-foreground">· {t(`outcome.${f.outcome}`)}</span>
                      </span>
                    ))}
                  </span>
                )}
                {e.status === "held" && canFile && <FileHeld emailId={e.id} weeks={weeks} />}
              </span>
            }
            control={
              <span className="flex items-center gap-2">
                {e.status === "filed" && e.payPeriodId && (
                  <Link href={`/convert?period=${e.payPeriodId}`} className="text-sm underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50">
                    {t("openWeek")}
                  </Link>
                )}
                <Status tone={TONE[e.status]} data-testid="forwarding-email-status">
                  {t(`status.${e.status}`)}
                </Status>
              </span>
            }
          />
        ))}
      </SettingsRows>
    </SettingsSection>
  );
}

function FileHeld({ emailId, weeks }: { emailId: string; weeks: OpenWeek[] }) {
  const t = useTranslations("forwarding");
  const locale = useLocale();
  const router = useRouter();
  const [week, setWeek] = useState("");
  const [filing, file] = useTransition();
  return (
    <span className="mt-1 flex flex-col gap-2">
      <span>{t("recent.heldHelp")}</span>
      <span className="flex flex-wrap items-center gap-2">
        <NativeSelect value={week} onChange={(e) => setWeek(e.target.value)} aria-label={t("recent.chooseWeek")} className="h-8" data-testid="forwarding-week">
          <NativeSelectOption value="">{t("recent.chooseWeek")}</NativeSelectOption>
          {weeks.map((w) => (
            <NativeSelectOption key={w.id} value={w.id}>
              {t("recent.week", { start: longDate(w.startsOn, locale) })}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          variant="outline"
          disabled={week === ""}
          loading={filing}
          data-testid="forwarding-file"
          onClick={() =>
            file(async () => {
              const r = await fileHeldEmailAction(emailId, week);
              if (r.ok) toast.success(t("recent.filed"));
              else toast.error(t(`errors.${r.error}`));
              router.refresh();
            })
          }
        >
          {t("recent.file")}
        </Button>
      </span>
    </span>
  );
}
