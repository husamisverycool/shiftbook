"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { resetDemo } from "@/server/demo/reset";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export async function resetDemoAction(): Promise<void> {
  await resetDemo({ withAgency, store: documentStore }, currentActor());
  revalidatePath("/", "layout");
}
