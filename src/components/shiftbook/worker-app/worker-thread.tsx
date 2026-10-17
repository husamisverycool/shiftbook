"use client";

// Pattern: docs/patterns/w/messages.md — the worker's side of the thread.
import { useLocale, useTranslations } from "next-intl";
import { sendWorkerMessageAction } from "@/app/[locale]/(worker)/w/actions";
import { Thread, type ThreadItem } from "./thread";

export function WorkerThread({ messages, zone }: { messages: ThreadItem[]; zone: string }) {
  const t = useTranslations("workerApp.messages");
  const locale = useLocale();
  return (
    <Thread
      messages={messages}
      viewer="worker"
      zone={zone}
      testId="worker-thread"
      labels={{ empty: t("empty"), placeholder: t("placeholder"), send: t("send"), translated: t("translated"), you: t("you"), errors: { empty: t("errors.empty"), too_long: t("errors.too_long"), generic: t("errors.generic") } }}
      send={(body) => sendWorkerMessageAction(locale, body)}
    />
  );
}
