/** The session cookie's name (decision K2). Kept apart so the proxy can check for it without the database. */
export const SESSION_COOKIE = "sb_session";
/** The proof a browser gave a reset link's code (decision 0025): only that browser then sets the password. */
export const RESET_PROOF_COOKIE = "sb_reset_proof";
