/**
 * Where to go once signed in: a page inside the app, without its language prefix (the person's own
 * language is put in front). Anything else — another site, a sign-in page, nonsense — is Home
 * (decision 0029).
 */
export function safeNext(next: unknown): string {
  const home = "/";
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return home;
  // One leading slash, then not another slash or a backslash (those would leave the site).
  if (!/^\/(?![/\\])/.test(next) || /[\\\u0000-\u001f\u007f]/.test(next)) return home;
  const path = next.replace(/^\/(en|es)(?=[/?#]|$)/, "");
  if (path === "" || path === "/" || /^\/(sign-in|invite|approve)([/?#]|$)/.test(path)) return home;
  return path.startsWith("/") ? path : home;
}

/** A path from safeNext in a language: Home is the language's own root ("/en", not "/en/"). */
export const localePath = (locale: string, path: string): string => (path === "/" ? `/${locale}` : path.startsWith("/?") ? `/${locale}${path.slice(1)}` : `/${locale}${path}`);
