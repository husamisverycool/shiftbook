// Pattern: docs/patterns/documents/[documentId].md — Rossum's validation screen with Dext's item
// details: one timesheet's values beside the document they came from, to check and confirm.
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { DocumentReviewView } from "@/components/shiftbook/convert/document-review";
import { documentReview } from "@/server/convert/document-review";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function DocumentPage(props: { params: Promise<{ locale: string; documentId: string }> }) {
  const { locale, documentId } = await props.params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(documentId).success) notFound();
  const actor = await currentActor();
  const review = await withAgency(actor.agencyId, (tx) => documentReview(tx, documentStore, documentId));
  if (!review) notFound();
  return <DocumentReviewView review={review} />;
}
