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

/** The person's role may not do this (decision K4). The screens hide what a role cannot do, so this
 * meets only a page left open while the Owner changed the person's role, or a hand-made request. */
export class NotAllowedError extends Error {
  constructor() {
    super("Your role does not allow this. Ask the Owner if you need it.");
    this.name = "NotAllowedError";
  }
}
