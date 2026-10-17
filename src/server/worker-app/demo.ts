/**
 * The worker app in the demo (slice t): the demo workers offered to "Continue as" — one who prefers
 * Spanish and has the demo's message thread, one in English, one still onboarding — and their numbers.
 */
export const DEMO_APP_WORKERS = ["daniel-ruiz", "marcus-bell", "maribel-torres"] as const;

/** Demo mobile numbers: 555-01xx, the range set aside for fiction. */
export const DEMO_PHONES: Record<string, string> = {
  "daniel-ruiz": "+13125550142",
  "marcus-bell": "+13125550143",
  "maribel-torres": "+12095550144",
  "luis-hernandez": "+12095550145",
  "pedro-alcantara": "+13125550146",
};
