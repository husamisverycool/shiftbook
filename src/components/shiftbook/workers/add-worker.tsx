"use client";

// Pattern: docs/patterns/workers.md — Add worker (Toast's Add employee): first and last name,
// preferred language, hire date; Save opens the new profile.
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { createWorkerAction } from "@/app/[locale]/(app)/workers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { FieldError, useWorkerFailure } from "./results";

export function AddWorkerDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const t = useTranslations("workers");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [language, setLanguage] = useState("en");
  const [hireDate, setHireDate] = useState(today);
  const [field, setField] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const invalid = (name: string) => (field === name ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` } : {});

  const save = () =>
    start(async () => {
      const r = await createWorkerAction({ firstName, lastName, preferredLanguage: language, hireDate: hireDate === "" ? null : hireDate });
      if (r.ok && "id" in r) {
        toast.success(t("new.added", { name: `${firstName.trim()} ${lastName.trim()}` }));
        router.push(`/workers/${r.id}`);
        return;
      }
      if (!r.ok && r.error === "invalid" && "field" in r) setField(r.field);
      else failure(r);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new.title")}</DialogTitle>
          <DialogDescription>{t("new.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-first`}>{t("new.firstName")}</Label>
              <Input id={`${id}-first`} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" autoFocus maxLength={100} {...invalid("firstName")} data-testid="new-first-name" />
              {field === "firstName" && <FieldError id={`${id}-firstName-error`} text={t("fields.firstName")} />}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-last`}>{t("new.lastName")}</Label>
              <Input id={`${id}-last`} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" maxLength={100} {...invalid("lastName")} data-testid="new-last-name" />
              {field === "lastName" && <FieldError id={`${id}-lastName-error`} text={t("fields.lastName")} />}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-language`}>{t("new.language")}</Label>
              <NativeSelect className="w-full" id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value)} {...invalid("preferredLanguage")} data-testid="new-language">
                <NativeSelectOption value="en">{t("language.en")}</NativeSelectOption>
                <NativeSelectOption value="es">{t("language.es")}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-hired`}>{t("new.hireDate")}</Label>
              <Input id={`${id}-hired`} type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} {...invalid("hireDate")} data-testid="new-hire-date" />
              {field === "hireDate" && <FieldError id={`${id}-hireDate-error`} text={t("fields.hireDate")} />}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("profile.cancel")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="save-new-worker">
              {t("new.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
