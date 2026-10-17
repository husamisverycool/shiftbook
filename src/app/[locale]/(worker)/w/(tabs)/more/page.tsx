// Pattern: docs/patterns/w/more.md — the Gusto mobile app's More and Profile: who is signed in, the
// signed documents, onboarding, the language, sign out.
import { DownloadIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { setWorkerLanguageAction, workerSignOutAction } from "@/app/[locale]/(worker)/w/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { longDate } from "@/components/shiftbook/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import * as s from "@/server/db/schema";
import { agencyToday, dateIn } from "@/server/settings";
import { maskPhone } from "@/server/worker-app/phone";
import { onboardingOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

const FORMS = ["w4", "i9", "deposit"] as const;

export default async function WorkerMore(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const t = await getTranslations("workerApp.more");
  const { phone, onboarding } = await asWorker(w, async (tx) => {
    const [row] = await tx.select({ phone: s.workers.phone }).from(s.workers).where(eq(s.workers.id, w.workerId));
    return { phone: row?.phone ?? null, onboarding: await onboardingOf(tx, w.workerId, await agencyToday(tx)) };
  });
  const signed = onboarding.signedAt;
  const forms = signed ? FORMS.filter((f) => f !== "deposit" || onboarding.paymentKind === "direct_deposit") : [];
  const section = "flex flex-col gap-2";
  const heading = "border-b pb-2 text-sm font-semibold";
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {w.firstName} {w.lastName}
        </h1>
        {phone && <p className="text-sm text-muted-foreground tabular-nums">{maskPhone(phone)}</p>}
      </div>
      <section className={section} aria-labelledby="more-docs">
        <h2 id="more-docs" className={heading}>
          {t("documents")}
        </h2>
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("documentsEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {forms.map((f) => (
              <li key={f} className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0">
                <span className="flex-1">{t(`forms.${f}`)}</span>
                <a href={`/api/w/forms/${f}?locale=${locale}`} download className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid={`worker-form-${f}`}>
                  <DownloadIcon />
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={section} aria-labelledby="more-onboarding">
        <h2 id="more-onboarding" className={heading}>
          {t("onboarding")}
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex-1">{signed ? t("onboardingDone", { date: longDate(dateIn("UTC", signed), locale) }) : t("onboardingLeft", { done: onboarding.progress.done, total: onboarding.progress.total })}</span>
          {!signed && (
            <Link href="/w/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("continue")}
            </Link>
          )}
        </div>
      </section>
      <section className={section} aria-labelledby="more-language">
        <h2 id="more-language" className={heading}>
          {t("language")}
        </h2>
        <div className="flex gap-2" role="group" aria-labelledby="more-language">
          {(["en", "es"] as const).map((l) => (
            <form key={l} action={setWorkerLanguageAction.bind(null, locale, l)}>
              <Button type="submit" variant="outline" size="sm" aria-pressed={locale === l} className={cn(locale === l && "border-foreground")} data-testid={`worker-language-${l}`}>
                {l === "en" ? "English" : "Español"}
              </Button>
            </form>
          ))}
        </div>
      </section>
      <form action={workerSignOutAction.bind(null, locale)}>
        <Button type="submit" variant="outline" className="w-full" data-testid="worker-sign-out">
          {t("signOut")}
        </Button>
      </form>
    </>
  );
}
