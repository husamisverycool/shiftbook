"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { resetDemo } from "@/server/demo/reset";
import { currentActor, isDemo } from "@/server/session";
import { documentStore } from "@/server/storage";

export async function resetDemoAction(): Promise<void> {
  if (!isDemo()) return;
  await resetDemo({ withAgency, store: documentStore }, await currentActor());
  revalidatePath("/", "layout");
}
