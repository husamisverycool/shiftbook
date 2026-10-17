/**
 * Nine digits shaped like an SSN (3-2-4, with or without dashes, spaces, dots or underscores), not
 * inside a longer number. Pure, for the screens and the server alike: an SSN never goes in a file
 * name, a reveal's reason or a payroll number (they are shown, logged or exported; SPEC §21).
 * Full-width digits and the Unicode dashes and minus signs count as their plain forms (export review
 * finding 8: "123–45–6789" with en dashes is the same number).
 */
const SSN_IN_TEXT = /(?<!\d)\d{3}[-\s_.]?\d{2}[-\s_.]?\d{4}(?!\d)/;

/** Unicode hyphens, dashes and minus signs → "-", after NFKC folds full-width forms. */
const plain = (text: string) => text.normalize("NFKC").replace(/[‐-―−﹘﹣－]/g, "-");

export const holdsSsn = (text: string): boolean => SSN_IN_TEXT.test(plain(text));

/** The same nine digits standing alone in an id: letters around them make them part of the id (EMP123456789). */
const SSN_IN_ID = /(?<![0-9A-Za-z])\d{3}[-\s_.]?\d{2}[-\s_.]?\d{4}(?![0-9A-Za-z])/;

export const idHoldsSsn = (id: string): boolean => SSN_IN_ID.test(plain(id));
