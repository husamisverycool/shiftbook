"use client";

/**
 * Correction actions (slice e; docs/patterns/convert.md): Start a correction on the Files step (Owner,
 * a required reason), and on the Exceptions step the fix that applies to a correction's blocking
 * rows — discard a correction in which nothing differs, or record how a worker's difference is
 * settled outside the payroll file.
 */
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { discardCorrectionAction, recordDecisionAction, removeDecisionAction, startCorrectionAction, type CorrectionActionError } from "@/app/[locale]/(app)/convert/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { money } from "../format";
import { CORRECTION_MESSAGE } from "./types";

function useRefusal() {
  const tx = useTranslations("convert");
  return (error: CorrectionActionError) => toast.error(tx(`errors.${CORRECTION_MESSAGE[error]}`));
}

export function StartCorrectionButton({ periodId, nextVersion }: { periodId: string; nextVersion: number }) {
  const t = useTranslations("convert.correction");
  const tc = useTranslations("common");
  const router = useRouter();
  const refuse = useRefusal();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await startCorrectionAction(periodId, reason);
      if (!r.ok) {
        refuse(r.error);
        router.refresh();
        return;
      }
      setOpen(false);
      router.push({ pathname: "/convert", query: { period: periodId, step: "hours" } });
    });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="start-correction">
        {t("start")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("startTitle")}</DialogTitle>
            <DialogDescription>{t("startBody", { next: nextVersion })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="correction-reason">{t("reasonLabel")}</Label>
            <Textarea id="correction-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={confirm} disabled={pending || reason.trim() === ""} data-testid="confirm-start-correction">
              {t("startConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DiscardCorrectionButton({ periodId, baseVersion }: { periodId: string; baseVersion: number }) {
  const t = useTranslations("convert.correction");
  const tc = useTranslations("common");
  const router = useRouter();
  const refuse = useRefusal();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await discardCorrectionAction(periodId);
      if (!r.ok) {
        refuse(r.error);
        router.refresh();
        return;
      }
      setOpen(false);
      router.push({ pathname: "/convert", query: { period: periodId, step: "files" } });
    });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="discard-correction">
        {t("discard")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardTitle")}</DialogTitle>
            <DialogDescription>{t("discardBody", { base: baseVersion })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending} data-testid="confirm-discard-correction">
              {t("discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const LESS = ["repaid_outside_payroll", "consent_to_deduct", "written_off"] as const;

/**
 * Less pay: the three overpayment choices (decision E3). More pay the file cannot carry: paid by hand,
 * or covered by pay the worker kept from an earlier correction (up to what they kept). A decision whose
 * difference changed can be replaced, or removed when nothing was done outside the files.
 */
export function DecisionButton(props: { periodId: string; workerId: string; name: string; netCents: number; heldCents: number; hasDecision: boolean; baseVersion: number }) {
  const { periodId, workerId, name, netCents, heldCents, hasDecision, baseVersion } = props;
  const t = useTranslations("convert.correction");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const refuse = useRefusal();
  const less = netCents < 0;
  const choices: readonly string[] = less ? LESS : netCents === 0 ? [] : heldCents > 0 && netCents <= heldCents ? ["offset_earlier_overpayment", "paid_by_hand"] : ["paid_by_hand"];
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(choices.length === 1 ? choices[0]! : "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const done = (r: { ok: true } | { ok: false; error: CorrectionActionError }) => {
    if (!r.ok) refuse(r.error);
    else {
      setOpen(false);
      setNote("");
    }
    router.refresh();
  };
  const confirm = () => start(async () => done(await recordDecisionAction(periodId, workerId, choice, note)));
  const remove = () => start(async () => done(await removeDecisionAction(periodId, workerId)));
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="record-decision">
        {t("decide")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("decideTitle", { name })}</DialogTitle>
            <DialogDescription>
              {less ? t("decideLess", { amount: money(-netCents, locale), base: baseVersion }) : netCents === 0 ? t("decideNone") : t("decideMore", { amount: money(netCents, locale) })}
              {!less && netCents > 0 && heldCents > 0 && ` ${t("decideHeld", { amount: money(heldCents, locale) })}`}
            </DialogDescription>
          </DialogHeader>
          {choices.length > 0 && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">{t("decideTitle", { name })}</legend>
                {choices.map((c) => (
                  <label key={c} className="flex items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary">
                    <input type="radio" name="decision" value={c} checked={choice === c} onChange={() => setChoice(c)} className="mt-0.5 accent-primary" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{t(`options.${c}` as "options.paid_by_hand")}</span>
                      {c === "consent_to_deduct" && <span className="text-muted-foreground">{t("consentHint")}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-2">
                <Label htmlFor="decision-note">{t("noteLabel")}</Label>
                <Textarea id="decision-note" placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </>
          )}
          <DialogFooter>
            {hasDecision && (
              <Button variant="outline" onClick={remove} disabled={pending} className="sm:mr-auto" data-testid="remove-decision">
                {t("removeDecision")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            {choices.length > 0 && (
              <Button onClick={confirm} disabled={pending || choice === "" || note.trim() === ""} data-testid="confirm-decision">
                {t("decideConfirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
