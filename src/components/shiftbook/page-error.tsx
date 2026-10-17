"use client";

// A page that failed, and a page not found (docs/patterns/_components/error.md): the frame stays
// (Primer: the global navigation is never hidden; GitHub's 404 keeps the site's header); in the
// content's place, the empty-state shape with one action.
import { FileQuestionIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "./empty-state";
import { Page } from "./page";

/** "Try again" loads the page again (Next.js `retry` re-fetches; `reset` would only re-render). */
export function PageError({ retry }: { retry: () => void }) {
  const t = useTranslations("states");
  const tc = useTranslations("common");
  const [trying, setTrying] = useState(false);
  return (
    <Page>
      <EmptyState
        kind="error"
        title={t("errorTitle")}
        description={t("errorBody")}
        testId="page-error"
        action={
          <Button
            variant="outline"
            loading={trying}
            loadingLabel={tc("loading")}
            onClick={() => {
              setTrying(true);
              retry();
            }}
          >
            {tc("retry")}
          </Button>
        }
      />
    </Page>
  );
}

export function PageNotFound() {
  const t = useTranslations("states");
  return (
    <Page>
      <EmptyState
        icon={FileQuestionIcon}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        testId="page-not-found"
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("goHome")}
          </Link>
        }
      />
    </Page>
  );
}
