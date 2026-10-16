// Pattern: docs/patterns/sign-in/reset.md — GitHub: request a new password by email.
import { setRequestLocale } from "next-intl/server";
import { ResetRequestView } from "@/components/shiftbook/auth/links";

export const dynamic = "force-dynamic";

export default async function ResetPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const raw = (await props.searchParams).email;
  return <ResetRequestView email={((Array.isArray(raw) ? raw[0] : raw) ?? "").slice(0, 254)} />;
}
