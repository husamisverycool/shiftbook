"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { resetDemoAction } from "@/app/[locale]/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function DemoBanner() {
  const t = useTranslations("banner");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="region"
      aria-label={t("demo")}
      className="border-b bg-muted text-foreground md:h-(--banner-height)"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-sm md:h-full md:flex-nowrap md:py-0">
        <p className="mr-auto md:truncate" title={t("demo")}>
          {t("demo")}
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <a
            href="/api/demo/samples"
            download
            className={buttonVariants({
              variant: "link",
              size: "sm",
              className: "h-auto px-0",
            })}
          >
            {t("samples")}
          </a>
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" size="sm" disabled={pending} />}
            >
              {t("reset")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("resetTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("resetBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    start(async () => {
                      await resetDemoAction();
                      toast.success(t("resetDone"));
                      router.push("/");
                      router.refresh();
                    })
                  }
                >
                  {t("resetConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
