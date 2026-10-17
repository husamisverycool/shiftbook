# Slice (o) — every state handled: loading, errors, not found, buttons that show they're working

Status: planned (2026-10-17). Owner, 2026-10-17: "proceed with them however you think is most
advantageous … continue in development of that as much as humanly possible" — taken as the "go" for
the slices that follow n, each still planned here first.

## Plain summary
Today, clicking to another page waits on a blank screen until the data arrives, and if something
breaks the person sees a bare browser error. Several pattern files already promise better (job
orders, assignments, approvals: "Loading skeleton; error alert with 'Try again'"), but only Convert
has them. After this slice:

- Every page shows its own outline at once — the title, tabs and grey placeholder rows in the shape
  of what is coming — then the real page fades in (Polaris SkeletonPage; Carbon skeleton states).
- If a page fails, it keeps the frame and says so in one line with "Try again" (Polaris/Stripe error
  banners; Next.js `error.tsx` reset), never a dead end.
- A wrong address shows "Page not found" inside the app with a way Home (GitHub/Stripe 404s keep the
  frame).
- Buttons that start work show a small spinner in place of their icon and can't be pressed twice
  (Primer Button `loading`; Polaris Button `loading`).

## Steps (tests first in each)
1. Research note `docs/research/states-slice-o.md`: Polaris SkeletonPage/SkeletonBodyText, Carbon
   skeleton and loading, Primer Button loading, Stripe and GitHub error and 404 pages; sources.
2. Pattern files: `_components/loading.md`, `_components/error.md`; every route's pattern file gains
   its loading and error lines (pointing to the shared ones) — the hook requires them before the
   `loading.tsx` / `error.tsx` files.
3. Shared pieces: `PageSkeleton` in four shapes (list, record, settings, dashboard) built from the
   existing `Page`/`PageHeader` measurements so nothing jumps when the page arrives; `PageError`;
   `Button loading` (spinner replaces the leading icon, `aria-busy`, disabled).
4. `loading.tsx` + `error.tsx` per area and per record page; `(app)/not-found.tsx`; the pending
   buttons that today swap labels move to `loading`.
5. Evidence: e2e — a slowed navigation shows the skeleton; a forced failure shows the error with
   Try again that recovers; an unknown address shows not found; axe on each; screenshots compared
   with their pattern files in `docs/screens/slice-o.md`; all suites, typecheck, lint green.
