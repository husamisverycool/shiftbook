"use client";

// Pattern: docs/patterns/convert.md — "Start a pay period" at the list heading's right: a small dialog
// with a date; the earlier week that contains it is added (completeness audit G1).
import { CalendarPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startPayPeriodAction } from "@/app/[locale]/(app)/convert/period-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";

export function StartPeriodButton({ today }: { today: string }) {
  const t = useTranslations("periodSetup");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await startPayPeriodAction(date);
      if (r.ok) {
        toast.success(t("started"));
        setOpen(false);
        router.push({ pathname: "/convert", query: { period: r.id } });
      } else setProblem(t(`errors.${r.error}` as never));
    });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="start-period">
        <CalendarPlusIcon />
        {t("start")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("start")}</DialogTitle>
            <DialogDescription>{t("body")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period-date">{t("date")}</Label>
              <Input
                id="period-date"
                type="date"
                className="w-44"
                max={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "period-date-error" : undefined}
                data-testid="period-date"
              />
              {problem && (
                <p id="period-date-error" className="text-xs text-destructive">
                  {problem}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={pending} loadingLabel={tc("loading")} data-testid="period-start-save">
                {t("start")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
