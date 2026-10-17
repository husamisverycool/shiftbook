/**
 * The demo's test email (decision 0042): what a client's site lead would forward — a short note and two
 * of the demo's own sample timesheets — sent to the agency's address and run through the same code as
 * a real one. No outside call: the files are read from demo/samples.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_PERIOD } from "../demo/dataset";
import type { IncomingEmail } from "./service";

export const DEMO_EMAIL_FILES = ["IL-prairie-line-timeclock-2026-10-05.csv", "IL-prairie-line-sign-in-2026-10-06.jpg"];

export function demoEmail(address: string, now: Date = new Date()): IncomingEmail {
  const dir = join(process.cwd(), "demo", "samples", CURRENT_PERIOD.startsOn);
  return {
    providerEmailId: `demo-${randomUUID()}`,
    from: "Pat Lee <pat.lee@prairie.example.com>",
    to: [address],
    subject: "Timesheets for last week (demo)",
    text: "Hi, here are last week's time clock export and Tuesday's sign-in sheet for the Joliet line. Thanks, Pat (demo)",
    receivedAt: now,
    authentication: { dmarc: "pass" },
    files: [
      // A signature logo: passed over, as a real one is.
      { filename: "logo.png", size: 2_048, inline: true, read: async () => new Uint8Array(2_048) },
      ...DEMO_EMAIL_FILES.map((name) => {
        const bytes = new Uint8Array(readFileSync(join(dir, name)));
        return { filename: name, size: bytes.byteLength, inline: false, read: async (cap: number) => (bytes.byteLength > cap ? null : bytes) };
      }),
    ],
    demo: true,
  };
}
