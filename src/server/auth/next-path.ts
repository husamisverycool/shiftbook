/**
 * Where to go once signed in: a page inside the app, without its language prefix (the person's own
 * language is put in front). Anything else — another site, a sign-in page, nonsense — is Convert
 * timesheets.
 */
export function safeNext(next: unknown): string {
  const home = "/convert";
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return home;
  // One leading slash, then not another slash or a backslash (those would leave the site).
  if (!/^\/(?![/\\])/.test(next) || /[\\\u0000-\u001f\u007f]/.test(next)) return home;
  const path = next.replace(/^\/(en|es)(?=[/?#]|$)/, "");
  if (path === "" || path === "/" || /^\/(sign-in|invite|approve)([/?#]|$)/.test(path)) return home;
  return path.startsWith("/") ? path : home;
}
