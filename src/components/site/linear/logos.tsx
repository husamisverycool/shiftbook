// Pattern: docs/patterns/site.md — Linear's logo row (linear.app, 2026-10-20): the marks in one row across
// the page's inset, all white, spaced evenly, and a short caption under them in the smallest grey. Here the
// payroll systems Tabulado writes files for (their own wordmarks: Simple Icons' published marks for Gusto,
// ADP and Paychex; the header wordmarks of quickbooks.intuit.com and paylocity.com), each in one colour.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOGOS = [
  { file: "gusto", name: "Gusto", height: 26 },
  { file: "adp", name: "ADP", height: 30 },
  { file: "paychex", name: "Paychex", height: 13 },
  { file: "quickbooks", name: "QuickBooks", height: 32 },
  { file: "paylocity", name: "Paylocity", height: 26 },
] as const;

export function svg(file: string): string {
  return readFileSync(join(process.cwd(), "public/site/logos", `${file}.svg`), "utf8").replace("<svg", '<svg aria-hidden="true" style="height:100%;width:auto;display:block"');
}

export function Logos({ id, caption }: { id: string; caption: string }) {
  return (
    <section aria-labelledby={id} className="pt-8 pb-16">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <ul className="site-reveal flex flex-wrap items-center justify-center gap-x-12 gap-y-8 text-[var(--l-text)] md:justify-between">
          {LOGOS.map((l) => (
            <li key={l.file} style={{ height: l.height }} title={l.name}>
              <span className="sr-only">{l.name}</span>
              <span className="block h-full" dangerouslySetInnerHTML={{ __html: svg(l.file) }} />
            </li>
          ))}
        </ul>
        <h2 id={id} className="mt-9 text-center l-text-mini text-[var(--l-text-4)] md:text-left">
          {caption}
        </h2>
      </div>
    </section>
  );
}
