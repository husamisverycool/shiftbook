// Tabulado's mark and logo (owner, 2026-10-19: the product is renamed from Granite). The mark is a "T"
// made of a table: a header row across the top and a centre column in full colour, the data cells on
// either side faint, the way a tabulated week reads. The wordmark is the name set in the interface's own
// typeface. Both take the text colour, so they sit on any background the frame gives them.
import { cn } from "@/lib/utils";

/** The body rows in a 202-unit square centred on 0: [y, left cell's width, right cell's width]. */
const ROWS: readonly (readonly [number, number, number])[] = [
  [-36, 60, 69],
  [10, 45, 50],
  [56, 69, 40],
];

/** The mark's shapes (app/icon.svg and app/apple-icon.png draw the same). */
function MarkShapes() {
  return (
    <>
      <rect x="-100" y="-82" width="200" height="26" />
      {ROWS.map(([y, left, right]) => (
        <g key={y}>
          <rect x={-31 - left} y={y} width={left} height="26" opacity=".3" />
          <rect x="-19" y={y} width="38" height="26" />
          <rect x="31" y={y} width={right} height="26" opacity=".3" />
        </g>
      ))}
    </>
  );
}

/** The mark alone: sign-in pages, the browser tab, anywhere the name is said beside it. */
export function TabuladoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-101 -101 202 202" fill="currentColor" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={cn("size-10 shrink-0", className)}>
      <MarkShapes />
    </svg>
  );
}

/** The mark with the wordmark beside it. */
export function TabuladoLogo({ className, title = "Tabulado" }: { className?: string; title?: string }) {
  return (
    <span role="img" aria-label={title} className={cn("inline-flex h-7 shrink-0 items-center gap-2", className)}>
      <TabuladoMark className="h-[80%] w-auto" />
      <span aria-hidden className="text-[1.15em] font-semibold leading-none tracking-tight">
        Tabulado
      </span>
    </span>
  );
}

/** The product's mark where a page names the product (the sign-in frame, decision 0031). */
export function BrandMark({ size = "default", className }: { size?: "default" | "lg"; className?: string }) {
  return <TabuladoMark className={cn(size === "lg" ? "size-11" : "size-6", className)} />;
}
