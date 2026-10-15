/**
 * Refusals a person can meet in normal use, each with a plain message. Server actions turn them into
 * a short notice instead of an error page.
 */

/** What was asked for no longer matches what is stored: another tab or person changed it first. */
export class StaleRequestError extends Error {
  constructor() {
    super("This changed in another tab or window. The page now shows the latest.");
    this.name = "StaleRequestError";
  }
}
